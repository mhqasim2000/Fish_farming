const express = require("express");
const router = express.Router();
const sql = require("mssql/msnodesqlv8");
const auth = require("../middleware/auth");

// --- SYSTEM CONSTANTS (No Magic Numbers) ---
const SYSTEM_CONSTANTS = {
  CONVERSIONS: {
    SQ_FT_PER_ACRE: 43560,
    LITERS_PER_CUBIC_FOOT: 28.317,
    GALLONS_PER_LITER: 0.264172,
  },
  POND: {
    EARTHEN_RATIO: 2.5,
    EARTHEN_DEPTH: 6.5,
    CONCRETE_RATIO: 2.0,
    CONCRETE_DEPTH: 5.0,
    LINED_RATIO: 2.2,
    LINED_DEPTH: 6.0,
  },
};

const CAPACITY_RULES = {
  nursery: {
    extensive: 180000,
    "semi-intensive": 220000,
    intensive: 260000,
  },
  growout: {
    extensive: 30000,
    "semi-intensive": 45000,
    intensive: 60000,
  },
  Juveline: {
    extensive: 40000,
    "semi-intensive": 50000,
    intensive: 70000,
  },
};

const isNurseryStage = (stage) =>
  String(stage || "")
    .toLowerCase()
    .includes("nursery");
const getCultivationKey = (cultivationType) => {
  const value = String(cultivationType || "").toLowerCase();
  if (value.includes("intensive") && !value.includes("semi"))
    return "intensive";
  if (value.includes("semi")) return "semi-intensive";
  return "extensive";
};
const roundCapacity = (value, stage) => {
  const step = isNurseryStage(stage) ? 5000 : 500;
  return Math.round(Number(value || 0) / step) * step;
};
const getSensibleMaxFishPerAcre = (stage, cultivationType, rawValue) => {
  const stageKey = isNurseryStage(stage) ? "nursery" : "growout";
  const fallback = CAPACITY_RULES[stageKey][getCultivationKey(cultivationType)];
  const raw = Number(rawValue || 0);

  if (raw <= 0) return fallback;

  const min = stageKey === "nursery" ? 120000 : 12000;
  const max = stageKey === "nursery" ? 300000 : 70000;
  if (raw < min || raw > max || raw < fallback) return fallback;

  return roundCapacity(raw, stage);
};

// --- HELPER FUNCTION: Calculate Recommended Dimensions ---
const calculatePondSpecs = (acres, pondType) => {
  const totalSqFt = acres * SYSTEM_CONSTANTS.CONVERSIONS.SQ_FT_PER_ACRE;
  let ratio = SYSTEM_CONSTANTS.POND.EARTHEN_RATIO;
  let depth = SYSTEM_CONSTANTS.POND.EARTHEN_DEPTH;

  // Normalize input for comparison (e.g. "Concrete Pond" -> "concrete")
  const type = (pondType || "").toLowerCase();

  if (type.includes("concrete")) {
    ratio = SYSTEM_CONSTANTS.POND.CONCRETE_RATIO;
    depth = SYSTEM_CONSTANTS.POND.CONCRETE_DEPTH;
  } else if (type.includes("lined")) {
    ratio = SYSTEM_CONSTANTS.POND.LINED_RATIO;
    depth = SYSTEM_CONSTANTS.POND.LINED_DEPTH;
  }

  const width = Math.sqrt(totalSqFt / ratio);
  const length = width * ratio;
  const volumeLiters =
    totalSqFt * depth * SYSTEM_CONSTANTS.CONVERSIONS.LITERS_PER_CUBIC_FOOT;

  return {
    length: Math.round(length),
    width: Math.round(width),
    depth: depth,
    volume: Math.round(volumeLiters),
  };
};
// --- GET TYPES: Fetch unique pond types from DB with Fallbacks ---
// Access: Protected (auth middleware)
router.get("/types", auth, async (req, res) => {
  try {
    const pool = req.pool;

    // Fetching existing types to maintain consistency across the farm
    const result = await pool.request().query(`
            SELECT DISTINCT PondType 
            FROM [FishFarmDB].[dbo].[Ponds] 
            WHERE PondType IS NOT NULL
        `);

    // If it's a new system or no ponds exist yet, provide the standard options
    if (result.recordset.length === 0) {
      return res.json([
        { PondType: "Earthen Pond" },
        { PondType: "Concrete Tank" },
        { PondType: "Lined Pond" },
      ]);
    }

    res.json(result.recordset);
  } catch (err) {
    console.error("DEBUG POND TYPES ERROR:", err.message);
    res
      .status(500)
      .json({ error: "Failed to fetch pond types", details: err.message });
  }
});

// --- GET OPTIONS: Centralized Config for Dropdowns ---
router.get("/options", auth, async (req, res) => {
  try {
    const pool = req.pool;

    // Parallel fetching for existing distinct values if any
    // If DB is empty, use standard industry defaults

    const [types, cultures, cultivations, stages] = await Promise.all([
      pool
        .request()
        .query(
          "SELECT DISTINCT PondType FROM Ponds WHERE PondType IS NOT NULL",
        ),
      pool
        .request()
        .query(
          "SELECT DISTINCT CultureType FROM Ponds WHERE CultureType IS NOT NULL",
        ),
      pool
        .request()
        .query(
          "SELECT DISTINCT CultivationType FROM Ponds WHERE CultivationType IS NOT NULL",
        ),
      pool
        .request()
        .query("SELECT DISTINCT Stage FROM Ponds WHERE Stage IS NOT NULL"),
    ]);

    const defaultTypes = ["Earthen Pond", "Concrete Pond", "Lined Pond"];
    const defaultCultures = ["Monoculture", "Polyculture"];
    const defaultCultivations = ["Extensive", "Semi-Intensive", "Intensive"];
    const defaultStages = ["Grown-out", "Nursery"];

    const mergeOptions = (dbResult, defaults) => {
      const dbValues = dbResult.recordset.map((r) => Object.values(r)[0]);
      return [...new Set([...defaults, ...dbValues])];
    };

    res.json({
      pondTypes: mergeOptions(types, defaultTypes),
      cultureTypes: mergeOptions(cultures, defaultCultures),
      cultivationTypes: mergeOptions(cultivations, defaultCultivations),
      stages: mergeOptions(stages, defaultStages),
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to fetch options", details: err.message });
  }
});

// --- 1. READ: Get Ponds for Logged-in User ---
router.get("/", auth, async (req, res) => {
  try {
    const { farmId } = req.query;
    const pool = req.pool;

    let query = `
            SELECT 
                p.*,
                ISNULL(NULLIF(p.VolumeGallons, 0), CAST(ROUND(ISNULL(CAST(p.VolumeLiters AS FLOAT), 0) * 0.264172, 0) AS BIGINT)) AS VolumeGallons,
                st.StockId, st.SpeciesId, st.Quantity, st.PricePerPiece, st.CurrentSizeInches, st.TargetSizeInches, st.StockingDate, st.Status as StockStatus, st.LastSizeUpdateDate, st.IsForSale, st.QuantityForSale,
                s.Name as SpeciesName,
                s.MinMarketPrice, s.MaxMarketPrice,
                r.MaxFishPerAcre, r.MaxSpeciesAllowed,
                ISNULL((SELECT SUM(Amount) FROM Expense_log WHERE PondId = p.PondId), 0) AS PondExpenses,
                fr.Frequency as FeedingFrequency
            FROM Ponds p
            LEFT JOIN Stocking st ON p.PondId = st.CurrentPondId AND st.Quantity > 0
            LEFT JOIN Species s ON st.SpeciesId = s.SpeciesId
            LEFT JOIN StockingRules r ON p.Stage = r.Stage AND p.CultivationType = r.CultivationType AND p.CultureType = r.CultureType
            LEFT JOIN Feed_Rules fr ON st.SpeciesId = fr.SpeciesID AND st.CurrentSizeInches >= fr.MinSize_inch AND st.CurrentSizeInches <= fr.MaxSize_inch
            WHERE p.UserId = @uId
        `;
    const request = pool.request().input("uId", sql.Int, req.user.id);

    if (farmId) {
      query += ` AND p.FarmId = @farmId`;
      request.input("farmId", sql.Int, farmId);
    }

    const result = await request.query(query);

    console.log(
      `DEBUG: Fetched ${result.recordset.length} rows for user ${req.user.id}`,
    );

    // Group by PondId
    const pondsMap = {};
    result.recordset.forEach((row) => {
      if (!pondsMap[row.PondId]) {
        pondsMap[row.PondId] = {
          ...row,
          species: [],
        };
        // Clean up flat row properties to avoid clutter in the main pond object
        delete pondsMap[row.PondId].StockId;
        delete pondsMap[row.PondId].Quantity;
        delete pondsMap[row.PondId].PricePerPiece;
        delete pondsMap[row.PondId].CurrentSizeInches;
        delete pondsMap[row.PondId].TargetSizeInches;
        delete pondsMap[row.PondId].StockingDate;
        delete pondsMap[row.PondId].StockStatus;
        delete pondsMap[row.PondId].SpeciesName;
        delete pondsMap[row.PondId].LastSizeUpdateDate;
        delete pondsMap[row.PondId].IsForSale;
        delete pondsMap[row.PondId].QuantityForSale;
        delete pondsMap[row.PondId].FeedingFrequency;
        delete pondsMap[row.PondId].MinMarketPrice;
        delete pondsMap[row.PondId].MaxMarketPrice;
        pondsMap[row.PondId].PondExpenses = Number(row.PondExpenses);
        pondsMap[row.PondId].EstimatedRevenue = 0;
        pondsMap[row.PondId].EstimatedProfit = 0;
      }

      if (row.StockId) {
        // Prevent duplicates if SQL returns multiple rows for the same stock (e.g. from JOINs)
        if (!pondsMap[row.PondId].species.some((s) => s.id === row.StockId)) {
          // API-Level Calculation for Estimated Revenue
          const minPrice = Number(row.MinMarketPrice || 0);
          const maxPrice = Number(row.MaxMarketPrice || 0);
          const avgPrice = (minPrice + maxPrice) / 2;
          const batchRevenue = Number(row.Quantity || 0) * avgPrice;

          pondsMap[row.PondId].EstimatedRevenue += batchRevenue;

          pondsMap[row.PondId].species.push({
            id: row.StockId,
            SpeciesId: row.SpeciesId,
            batchSpeciesId: row.SpeciesId, // Helper for frontend
            SpeciesName: row.SpeciesName,
            Quantity: row.Quantity,
            CurrentSizeInch: row.CurrentSizeInches,
            TargetSizeInch: row.TargetSizeInches,
            PricePerPiece: row.PricePerPiece,
            StockingDate: row.StockingDate,
            Status: row.StockStatus,
            LastSizeUpdateDate: row.LastSizeUpdateDate,
            IsForSale: row.IsForSale,
            QuantityForSale: row.QuantityForSale,
            FeedingFrequency: row.FeedingFrequency,
            MinMarketPrice: Number(row.MinMarketPrice || 0),
            MaxMarketPrice: Number(row.MaxMarketPrice || 0),
          });
        }
      }
    });

    const finalPonds = Object.values(pondsMap);

    // Finalize API-Level Calculation: Estimated Profit = Estimated Revenue - Pond Expenses
    finalPonds.forEach((p) => {
      p.EstimatedProfit = p.EstimatedRevenue - p.PondExpenses;
      p.MaxFishPerAcre = getSensibleMaxFishPerAcre(
        p.Stage,
        p.CultivationType,
        p.MaxFishPerAcre,
      );
    });

    res.json(finalPonds);
  } catch (err) {
    res.status(500).json({ error: "Fetch failed", details: err.message });
  }
});

// --- 2. ADVISOR: Get dynamic recommendations ---
router.get("/recommend", auth, (req, res) => {
  const acres = parseFloat(req.query.acres);
  const pondType = req.query.type || "Earthen";

  if (!acres || acres <= 0)
    return res.status(400).json({ error: "Invalid acreage" });

  const specs = calculatePondSpecs(acres, pondType);
  res.json({
    ...specs,
    volumeGallons: Math.round(
      specs.volume * SYSTEM_CONSTANTS.CONVERSIONS.GALLONS_PER_LITER,
    ),
  });
});

// --- 3. CREATE: Add a New Pond with Space Validation ---
// --- 3. CREATE: Add a New Pond (Supports Manual or Auto Dimensions) ---
router.post("/", auth, async (req, res) => {
  try {
    const {
      FarmId,
      PondName,
      Stage,
      CultureType,
      PondType,
      Size,
      CultivationType,
      LengthFeet,
      WidthFeet,
      DepthFeet,
      VolumeLiters,
    } = req.body;

    if (!FarmId || !Size) {
      return res.status(400).json({ error: "Missing FarmId or Size" });
    }

    const pool = req.pool;

    // 1. Fetch Farm details using only the ID-based link
    const farmCheck = await pool
      .request()
      .input("fId", sql.Int, FarmId)
      .input("uId", sql.Int, req.user.id)
      .query(
        "SELECT RemainingArea, RegionId FROM Farm WHERE FarmId = @fId AND UserId = @uId",
      );

    if (farmCheck.recordset.length === 0) {
      return res.status(404).json({ error: "Farm not found." });
    }

    const { RemainingArea, RegionId } = farmCheck.recordset[0];

    // 2. Logic & Calculations
    const suggested = calculatePondSpecs(Size, PondType);
    const finalLen = LengthFeet || suggested.length;
    const finalWid = WidthFeet || suggested.width;
    const finalDep = DepthFeet || suggested.depth;
    const finalVol =
      VolumeLiters ||
      finalLen *
        finalWid *
        finalDep *
        SYSTEM_CONSTANTS.CONVERSIONS.LITERS_PER_CUBIC_FOOT;
    const finalVolGal = Math.round(
      finalVol * SYSTEM_CONSTANTS.CONVERSIONS.GALLONS_PER_LITER,
    );

    // 3. Database Insertion into Ponds
    await pool
      .request()
      .input("UserId", sql.Int, req.user.id)
      .input("RegionId", sql.Int, RegionId)
      .input("FarmId", sql.Int, FarmId)
      .input("PondName", sql.NVarChar(100), PondName)
      .input("Stage", sql.NVarChar(50), Stage)
      .input("CultureType", sql.NVarChar(50), CultureType)
      .input("PondType", sql.NVarChar(50), PondType)
      .input("Size", sql.Decimal(10, 2), Size)
      .input("CultivationType", sql.NVarChar(50), CultivationType)
      .input("Len", sql.Int, Math.round(finalLen))
      .input("Wid", sql.Int, Math.round(finalWid))
      .input("Dep", sql.Decimal(4, 2), finalDep)
      .input("Vol", sql.BigInt, Math.round(finalVol))
      .input("VolGal", sql.BigInt, finalVolGal).query(`
                INSERT INTO Ponds (
                    UserId, RegionId, FarmId, PondName, Stage, CultureType, PondType, Size, 
                    CultivationType, LengthFeet, WidthFeet, DepthFeet, VolumeLiters, VolumeGallons, CreatedAt
                ) 
                VALUES (
                    @UserId, @RegionId, @FarmId, @PondName, @Stage, @CultureType, @PondType, @Size, 
                    @CultivationType, @Len, @Wid, @Dep, @Vol, @VolGal, GETDATE()
                )
            `);

    res.status(201).json({
      success: true,
      message: "Pond created and linked to Farm's region.",
      regionId: RegionId,
    });
  } catch (err) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});
// --- 4. UPDATE: Modify Pond ---
router.put("/:id", auth, async (req, res) => {
  try {
    const {
      PondName,
      Stage,
      Size,
      CultureType,
      PondType,
      CultivationType,
      LengthFeet,
      WidthFeet,
      DepthFeet,
      VolumeLiters,
    } = req.body;
    const pool = req.pool;

    const specs = calculatePondSpecs(Size, PondType);

    const result = await pool
      .request()
      .input("Id", sql.Int, req.params.id)
      .input("uId", sql.Int, req.user.id)
      .input("Name", sql.NVarChar(100), PondName)
      .input("Stage", sql.NVarChar(50), Stage)
      .input("Size", sql.Decimal(10, 2), Size)
      .input("Culture", sql.NVarChar(50), CultureType)
      .input("PType", sql.NVarChar(50), PondType)
      .input("CType", sql.NVarChar(50), CultivationType)
      .input("Len", sql.Int, LengthFeet || specs.length)
      .input("Wid", sql.Int, WidthFeet || specs.width)
      .input("Dep", sql.Decimal(4, 2), DepthFeet || specs.depth)
      .input("Vol", sql.BigInt, VolumeLiters || specs.volume)
      .input(
        "VolGal",
        sql.BigInt,
        Math.round(
          (VolumeLiters || specs.volume) *
            SYSTEM_CONSTANTS.CONVERSIONS.GALLONS_PER_LITER,
        ),
      ).query(`
                UPDATE Ponds 
                SET PondName = @Name, Stage = @Stage, Size = @Size, 
                    CultureType = @Culture, PondType = @PType, CultivationType = @CType,
                    LengthFeet = @Len, WidthFeet = @Wid, DepthFeet = @Dep, VolumeLiters = @Vol, VolumeGallons = @VolGal
                WHERE PondId = @Id AND UserId = @uId
            `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Pond not found or unauthorized" });
    }

    res.json({ success: true, message: "Pond updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});
// Get Dashboard Stats for Ponds
// GET /api/ponds/stats/summary
router.get("/stats/summary", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = req.pool;

    const result = await pool.request().input("userId", sql.Int, userId).query(`
                SELECT 
                    -- 1. Total Ponds
                    (SELECT COUNT(*) 
                     FROM Ponds 
                     WHERE UserId = @userId) as totalPonds,

                    -- 2. Total Acres
                    (SELECT ISNULL(SUM(TRY_CAST(Size AS FLOAT)), 0) 
                     FROM Ponds 
                     WHERE UserId = @userId) as totalAcres,

                    -- 3. Total Fingerlings (Using CurrentPondId from your Stocking table)
                    (SELECT ISNULL(SUM(S.Quantity), 0) 
                     FROM Stocking S
                     INNER JOIN Ponds P ON S.CurrentPondId = P.PondId
                     WHERE P.UserId = @userId) as totalFingerlings
            `);

    res.json({
      success: true,
      data: result.recordset[0],
    });
  } catch (err) {
    console.error("STATS ROUTE ERROR:", err.message);
    res.status(500).json({
      error: "Failed to fetch dashboard statistics",
      details: err.message,
    });
  }
});

// --- 5. DELETE: Remove Pond ---
router.delete("/:id", auth, async (req, res) => {
  try {
    const pool = req.pool;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      request.input("Id", sql.Int, req.params.id);
      request.input("uId", sql.Int, req.user.id);

      // Manual cascading deletes to avoid FK constraint errors
      await request.query("DELETE FROM water_quality_logs WHERE PondId = @Id");
      await request.query("DELETE FROM Mortality_Logs WHERE PondId = @Id");
      await request.query("DELETE FROM Harvest_Logs WHERE PondId = @Id");
      await request.query("DELETE FROM Fertilizers_Logs WHERE PondId = @Id");
      await request.query("DELETE FROM Feed_Logs WHERE PondId = @Id");
      await request.query("DELETE FROM Expense_log WHERE PondId = @Id");
      await request.query(
        "DELETE FROM Treatment_Logs WHERE OutbreakId IN (SELECT OutbreakId FROM Disease_Outbreaks WHERE PondId = @Id)",
      );
      await request.query("DELETE FROM Disease_Outbreaks WHERE PondId = @Id");
      await request.query(
        "DELETE FROM Stocking WHERE CurrentPondId = @Id OR OriginalPondId = @Id",
      );

      // Finally delete the pond
      const result = await request.query(
        "DELETE FROM Ponds WHERE PondId = @Id AND UserId = @uId",
      );

      if (result.rowsAffected[0] === 0) {
        await transaction.rollback();
        return res
          .status(404)
          .json({ error: "Pond not found or unauthorized" });
      }

      await transaction.commit();
      res.json({ success: true, message: "Pond deleted successfully" });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: "Deletion failed", details: err.message });
  }
});

// --- 6. PUT: Maintain Pond (Clear Maintenance Status) ---
router.put("/:id/maintain", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = req.pool;

    // Verify the pond belongs to the active user
    const verify = await pool
      .request()
      .input("Id", sql.Int, id)
      .input("UserId", sql.Int, req.user.id)
      .query(
        "SELECT PondId FROM Ponds WHERE PondId = @Id AND UserId = @UserId",
      );

    if (verify.recordset.length === 0) {
      return res.status(404).json({ error: "Pond not found or unauthorized" });
    }

    await pool
      .request()
      .input("Id", sql.Int, id)
      .query("UPDATE Ponds SET NeedsMaintenance = 0 WHERE PondId = @Id");

    res.json({ message: "Pond maintenance marked as complete." });
  } catch (err) {
    console.error("Maintain Error:", err.message);
    res.status(500).json({ error: "Failed to mark pond as maintained." });
  }
});

// --- FCR: Feed Conversion Ratio per Pond ---
// Formula: FCR = Total Feed Used (kg) / Total Weight Gained (kg)
router.get("/:id/fcr", auth, async (req, res) => {
  try {
    const pool = req.pool;
    const pondId = req.params.id;
    console.log(`[FCR] Calculating for pond: ${pondId}`);

    // 1. Total Feed Used (kg) - Using BigInt for PondId
    const feedResult = await pool.request().input("pid", sql.BigInt, pondId)
      .query(`
                SELECT ISNULL(SUM(Quantity_kg), 0) as TotalFeedKg
                FROM Feed_Logs
                WHERE PondId = @pid
            `);
    const totalFeedKg = feedResult.recordset[0].TotalFeedKg;
    console.log(`[FCR] Pond ${pondId} - Total Feed: ${totalFeedKg}kg`);

    // 2. Get all active batches with condition factors
    const stockResult = await pool.request().input("pid", sql.BigInt, pondId)
      .query(`
                SELECT 
                    st.StockId, st.Quantity, st.CurrentSizeInches,
                    ISNULL(fr.ConditionFactor_K, 0.01) as ConditionFactor_K
                FROM Stocking st
                LEFT JOIN Feed_Rules fr ON st.SpeciesId = fr.SpeciesID
                    AND st.CurrentSizeInches > fr.MinSize_inch 
                    AND st.CurrentSizeInches <= fr.MaxSize_inch
                WHERE st.CurrentPondId = @pid AND st.Status NOT IN ('Harvested', 'Sold', 'Inactive')
            `);

    console.log(
      `[FCR] Pond ${pondId} - Found ${stockResult.recordset.length} active batches`,
    );

    // 3. Calculate biomass
    const initialSizeInches = 1.0; // Start size for fingerlings
    let currentBiomassKg = 0;
    let initialBiomassKg = 0;

    stockResult.recordset.forEach((batch) => {
      const K = batch.ConditionFactor_K || 0.01;
      const qty = batch.Quantity || 0;
      const currentSize = batch.CurrentSizeInches || 1;

      const currentWeightG = K * Math.pow(currentSize, 3);
      const initialWeightG = K * Math.pow(initialSizeInches, 3);

      currentBiomassKg += (qty * currentWeightG) / 1000;
      initialBiomassKg += (qty * initialWeightG) / 1000;
    });

    const weightGainKg = Math.max(0, currentBiomassKg - initialBiomassKg);
    const fcr =
      weightGainKg > 0 && totalFeedKg > 0 ? totalFeedKg / weightGainKg : null;

    res.json({
      pondId,
      totalFeedKg: parseFloat(totalFeedKg.toFixed(3)),
      currentBiomassKg: parseFloat(currentBiomassKg.toFixed(3)),
      initialBiomassKg: parseFloat(initialBiomassKg.toFixed(3)),
      weightGainKg: parseFloat(weightGainKg.toFixed(3)),
      fcr: fcr !== null ? parseFloat(fcr.toFixed(2)) : null,
      rating:
        fcr === null
          ? "No data"
          : fcr <= 1.5
            ? "Excellent"
            : fcr <= 2.0
              ? "Good"
              : fcr <= 2.5
                ? "Average"
                : "Poor",
    });
  } catch (err) {
    console.error("FCR Error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to calculate FCR", details: err.message });
  }
});

// --- GET /api/ponds/:id/financials — Comprehensive Pond Financial Summary ---
router.get("/:id/financials", auth, async (req, res) => {
  try {
    const pondId = req.params.id;
    const pool = req.pool;

    const result = await pool
      .request()
      .input("pid", sql.Int, pondId)
      .input("uid", sql.Int, req.user.id).query(`
                -- 1. Pond Info
                SELECT PondName, Size, Stage, PondType, CultivationType, CultureType,
                       LengthFeet, WidthFeet, DepthFeet, VolumeLiters,
                       ISNULL(NULLIF(VolumeGallons, 0), CAST(ROUND(ISNULL(CAST(VolumeLiters AS FLOAT), 0) * 0.264172, 0) AS BIGINT)) AS VolumeGallons
                FROM Ponds WHERE PondId = @pid AND UserId = @uid;

                -- 2. Total Expenses for this pond
                SELECT ISNULL(SUM(Amount), 0) AS TotalExpenses
                FROM Expense_log WHERE PondId = @pid;

                -- 3. Expense Category Breakdown
                SELECT Category, ISNULL(SUM(Amount), 0) AS CategoryTotal
                FROM Expense_log WHERE PondId = @pid
                GROUP BY Category ORDER BY CategoryTotal DESC;

                -- 4. Total Revenue from Harvests
                SELECT ISNULL(SUM(Revenue_PKR), 0) AS TotalRevenue
                FROM Harvest_Logs WHERE PondId = @pid;

                -- 5. Per-Species Revenue Breakdown
                SELECT S.Name AS SpeciesName, S.SpeciesId,
                       ISNULL(SUM(H.Revenue_PKR), 0) AS SpeciesRevenue,
                       ISNULL(SUM(H.Quantity_pieces), 0) AS TotalHarvested,
                       ISNULL(SUM(H.TotalWeight_kg), 0) AS TotalWeightKg
                FROM Harvest_Logs H
                JOIN Species S ON H.SpeciesId = S.SpeciesId
                WHERE H.PondId = @pid
                GROUP BY S.Name, S.SpeciesId
                ORDER BY SpeciesRevenue DESC;

                -- 6. Current Stocking (Estimated Asset Value)
                SELECT S.Name AS SpeciesName, ST.Quantity,
                       ISNULL(S.MinMarketPrice, 0) AS MinPrice,
                       ISNULL(S.MaxMarketPrice, 0) AS MaxPrice,
                       (ST.Quantity * ISNULL(S.MinMarketPrice, 0)) AS EstMinValue,
                       (ST.Quantity * ISNULL(S.MaxMarketPrice, 0)) AS EstMaxValue
                FROM Stocking ST
                JOIN Species S ON ST.SpeciesId = S.SpeciesId
                WHERE ST.CurrentPondId = @pid AND ST.Quantity > 0;
            `);

    const pondInfo = result.recordsets[0][0];
    if (!pondInfo) return res.status(404).json({ error: "Pond not found" });

    const totalExpenses = Number(result.recordsets[1][0]?.TotalExpenses || 0);
    const expenseBreakdown = result.recordsets[2] || [];
    const totalRevenue = Number(result.recordsets[3][0]?.TotalRevenue || 0);
    const speciesRevenue = result.recordsets[4] || [];
    const currentStock = result.recordsets[5] || [];

    const estAssetMin = currentStock.reduce(
      (sum, s) => sum + Number(s.EstMinValue || 0),
      0,
    );
    const estAssetMax = currentStock.reduce(
      (sum, s) => sum + Number(s.EstMaxValue || 0),
      0,
    );

    res.json({
      success: true,
      data: {
        pond: pondInfo,
        totalRevenue,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
        expenseBreakdown: expenseBreakdown.map((e) => ({
          category: e.Category,
          amount: Number(e.CategoryTotal),
        })),
        speciesRevenue: speciesRevenue.map((s) => ({
          speciesName: s.SpeciesName,
          speciesId: s.SpeciesId,
          revenue: Number(s.SpeciesRevenue),
          harvested: s.TotalHarvested,
          weightKg: Number(s.TotalWeightKg),
        })),
        currentStock: currentStock.map((s) => ({
          speciesName: s.SpeciesName,
          quantity: s.Quantity,
          estMinValue: Number(s.EstMinValue),
          estMaxValue: Number(s.EstMaxValue),
        })),
        estimatedAssetValue: { min: estAssetMin, max: estAssetMax },
      },
    });
  } catch (err) {
    console.error("Pond Financials Error:", err.message);
    res
      .status(500)
      .json({ error: "Failed to fetch pond financials", details: err.message });
  }
});

module.exports = router;
