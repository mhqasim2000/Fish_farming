const express = require("express");
const router = express.Router();
const sql = require("mssql/msnodesqlv8");
const auth = require("../middleware/auth");

let stockingExpenseSchemaVerified = false;
let stockingSaleSchemaVerified = false;

const ensureExpenseSchema = async (pool) => {
  if (stockingExpenseSchemaVerified) return;

  await pool.request().query(`
        IF COL_LENGTH('Expense_log', 'UserId') IS NULL
            ALTER TABLE Expense_log ADD UserId INT NULL;
    `);

  stockingExpenseSchemaVerified = true;
};

const ensureStockingSaleSchema = async (pool) => {
  if (stockingSaleSchemaVerified) return;

  await pool.request().query(`
        IF COL_LENGTH('Stocking', 'IsForSale') IS NULL
            ALTER TABLE Stocking ADD IsForSale BIT NOT NULL DEFAULT 0;

        IF COL_LENGTH('Stocking', 'QuantityForSale') IS NULL
            ALTER TABLE Stocking ADD QuantityForSale INT NOT NULL DEFAULT 0;

        IF COL_LENGTH('Stocking', 'SalePricePerUnit') IS NULL
            ALTER TABLE Stocking ADD SalePricePerUnit DECIMAL(10, 2) NULL;

        IF COL_LENGTH('Stocking', 'SaleDate') IS NULL
            ALTER TABLE Stocking ADD SaleDate DATETIME NULL;
    `);

  stockingSaleSchemaVerified = true;
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

  const min1 = stageKey === "Grown-Out" ? 5000 : 7000;
  const max1 = stageKey === "Grown-out" ? 8000 : 12000;

  const min2 = stageKey === "nursery" ? 120000 : 12000;
  const max2 = stageKey === "nursery" ? 300000 : 70000;

  if (raw < min || raw > max || raw < fallback) return fallback;

  return roundCapacity(raw, stage);
};

const normalizeSpeciesName = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
const hasKnownSpeciesConflict = (firstName, secondName) => {
  const pair = [
    normalizeSpeciesName(firstName),
    normalizeSpeciesName(secondName),
  ]
    .sort()
    .join("|");
  return pair === "rohu|tilapia";
};

// --- 1. CREATE: Add new stocking record (PROTECTED) ---
router.post("/add", auth, async (req, res) => {
  try {
    const {
      pondId,
      speciesId,
      quantity,
      pricePerPiece,
      currentSize,
      targetSize,
      stockingDate,
    } = req.body;
    const pool = req.pool;

    // 1. Fetch Pond Policy + Species Feeding Zone + RegionId (Inherited from Pond)
    const policyData = await pool
      .request()
      .input("pId", sql.Int, pondId)
      .input("sId", sql.Int, speciesId).query(`
                SELECT p.Size, p.Stage, p.CultivationType, p.RegionId,
                       r.MaxFishPerAcre, r.MaxSpeciesAllowed,
                       s.FeedingZone, s.Name as SpeciesName
                FROM Ponds p
                INNER JOIN StockingRules r ON p.Stage = r.Stage AND p.CultivationType = r.CultivationType
                INNER JOIN Species s ON s.SpeciesId = @sId
                WHERE p.PondId = @pId
            `);

    if (policyData.recordset.length === 0) {
      return res.status(404).json({
        error: "Configuration Error",
        message:
          "Ensure Pond Stage/Type matches StockingRules and Species exists.",
      });
    }

    const {
      Size,
      Stage,
      CultivationType,
      RegionId,
      MaxFishPerAcre,
      MaxSpeciesAllowed,
      FeedingZone,
      SpeciesName,
    } = policyData.recordset[0];
    const sensibleMaxFishPerAcre = getSensibleMaxFishPerAcre(
      Stage,
      CultivationType,
      MaxFishPerAcre,
    );

    // Calculation for the "Maximum Capacity" displayed in Modal
    const totalPondCapacity = Math.floor(Size * sensibleMaxFishPerAcre);

    // 2. CHECK: Total Species Diversity
    const speciesCheck = await pool
      .request()
      .input("pId", sql.Int, pondId)
      .input("sId", sql.Int, speciesId).query(`
                SELECT COUNT(DISTINCT SpeciesId) as UniqueSpecies 
                FROM Stocking 
                WHERE CurrentPondId = @pId AND SpeciesId <> @sId
            `);

    if (speciesCheck.recordset[0].UniqueSpecies >= MaxSpeciesAllowed) {
      return res.status(400).json({
        error: "Diversity Limit Reached",
        message: `This ${CultivationType} system Have full capacity for  ${MaxSpeciesAllowed} species.`,
      });
    }

    // 2b. CHECK: Biological Compatibility (for Polyculture)
    if (MaxSpeciesAllowed > 1) {
      const knownConflictCheck = await pool
        .request()
        .input("pId", sql.Int, pondId).query(`
                    SELECT DISTINCT s.Name
                    FROM Stocking st
                    JOIN Species s ON st.SpeciesId = s.SpeciesId
                    WHERE st.CurrentPondId = @pId AND st.Quantity > 0
                `);
      const knownConflict = knownConflictCheck.recordset.find((row) =>
        hasKnownSpeciesConflict(SpeciesName, row.Name),
      );
      if (knownConflict) {
        return res.status(400).json({
          error: "Biological Conflict",
          message: `${SpeciesName} is not biologically compatible with ${knownConflict.Name} in this pond.`,
        });
      }

      const compatibilityCheck = await pool
        .request()
        .input("pId", sql.Int, pondId)
        .input("sId", sql.Int, speciesId).query(`
                    SELECT s.Name 
                    FROM Stocking st
                    JOIN Species s ON st.SpeciesId = s.SpeciesId
                    WHERE st.CurrentPondId = @pId AND st.SpeciesId <> @sId
                    AND NOT EXISTS (
                        SELECT 1 FROM SpeciesCompatibility c 
                        WHERE (c.SpeciesId = @sId AND c.CompatibleWithId = st.SpeciesId)
                           OR (c.SpeciesId = st.SpeciesId AND c.CompatibleWithId = @sId)
                    )
                `);

      if (compatibilityCheck.recordset.length > 0) {
        const conflictSpecies = compatibilityCheck.recordset
          .map((r) => r.Name)
          .join(", ");
        return res.status(400).json({
          error: "Biological Conflict",
          message: `${SpeciesName} is not biologically compatible with ${conflictSpecies} in this pond.`,
        });
      }
    } else if (speciesCheck.recordset[0].UniqueSpecies > 0) {
      // Monoculture check: If any different species exists
      const monocultureCheck = await pool
        .request()
        .input("pId", sql.Int, pondId)
        .input("sId", sql.Int, speciesId)
        .query(
          "SELECT TOP 1 s.Name FROM Stocking st JOIN Species s ON st.SpeciesId = s.SpeciesId WHERE st.CurrentPondId = @pId AND st.SpeciesId <> @sId",
        );

      if (monocultureCheck.recordset.length > 0) {
        return res.status(400).json({
          error: "Monoculture Violation",
          message: `This pond is set for Monoculture and already contains ${monocultureCheck.recordset[0].Name}.`,
        });
      }
    }

    // 3. CHECK: Species-Specific Quantity (Advisor Logic - 30:40:30 Ratio)
    let zoneRatio = FeedingZone === "Column" ? 0.4 : 0.3;

    // If Monoculture, 100% of the pond belongs to this species
    if (MaxSpeciesAllowed === 1) {
      zoneRatio = 1.0;
    }

    const maxQtyForThisSpecies = Math.floor(totalPondCapacity * zoneRatio);

    // Get existing stock for THIS species to enforce cumulative ratio limit
    const existingSpeciesStock = await pool
      .request()
      .input("pIdSp", sql.Int, pondId)
      .input("sIdSp", sql.Int, speciesId)
      .query(
        "SELECT ISNULL(SUM(Quantity), 0) as Total FROM Stocking WHERE CurrentPondId = @pIdSp AND SpeciesId = @sIdSp",
      );

    const existingSpeciesQty = existingSpeciesStock.recordset[0].Total || 0;

    if (existingSpeciesQty + parseInt(quantity) > maxQtyForThisSpecies) {
      return res.status(400).json({
        error: "Inefficient Stocking",
        message: `For better growth, limit ${SpeciesName}  in this pond max  ${maxQtyForThisSpecies.toLocaleString()} fish. Currently stocked: ${(existingSpeciesQty * 2).toLocaleString()}.`,
      });
    }

    // 4. CHECK: Total Physical Density (Utilization %)
    const currentStock = await pool
      .request()
      .input("pId", sql.Int, pondId)
      .query(
        "SELECT SUM(Quantity) as Total FROM Stocking WHERE CurrentPondId = @pId",
      );

    const existingQty = currentStock.recordset[0].Total || 0;
    const newTotal = existingQty + parseInt(quantity);

    if (newTotal > totalPondCapacity) {
      return res.status(400).json({
        error: "Pond Overcrowded",
        message: `Total capacity is ${totalPondCapacity.toLocaleString()}. Currently has ${existingQty.toLocaleString()}.`,
      });
    }

    // 5. INSERT (Includes UserId and inherited RegionId)
    const result = await pool
      .request()
      .input("uId", sql.Int, req.user.id) // Stamp record with the User's ID
      .input("oPId", sql.Int, pondId)
      .input("cPId", sql.Int, pondId)
      .input("sId", sql.Int, speciesId)

      .input("qty", sql.Int, quantity)
      .input("price", sql.Decimal(10, 2), pricePerPiece)
      .input("curSize", sql.Decimal(4, 2), currentSize)
      .input("tarSize", sql.Decimal(4, 2), targetSize)
      .input("status", sql.NVarChar, Stage)
      .input("date", sql.DateTime, stockingDate || new Date()).query(`
                INSERT INTO Stocking (
                    UserId, OriginalPondId, CurrentPondId, SpeciesId, Quantity, PricePerPiece, 
                    CurrentSizeInches, TargetSizeInches, StockingDate, Status
                )
                VALUES (@uId, @oPId, @cPId, @sId, @qty, @price, @curSize, @tarSize, @date, @status);
                SELECT CAST(SCOPE_IDENTITY() AS INT) AS StockId;
            `);

    const stockId = result.recordset[0].StockId;

    // Auto-log expense
    const totalStockingCost = quantity * pricePerPiece;
    if (totalStockingCost > 0) {
      await ensureExpenseSchema(pool);
      await pool
        .request()
        .input("uId", sql.Int, req.user.id)
        .input("pId", sql.Int, pondId)
        .input("amt", sql.Decimal(18, 2), totalStockingCost)
        .input(
          "desc",
          sql.NVarChar,
          `Purchased ${quantity} ${SpeciesName} fingerlings.`,
        ).query(`
                    INSERT INTO Expense_log (UserId, PondId, Category, Amount, Description, ExpenseDate)
                    VALUES (@uId, @pId, 'Seed/Fingerlings', @amt, @desc, GETDATE())
                `);
    }

    res.status(201).json({
      success: true,
      StockId: stockId,
      preview: {
        currentFish: existingQty,
        newTotal: newTotal,
        maximumCapacity: totalPondCapacity,
        utilization: ((newTotal / totalPondCapacity) * 100).toFixed(2) + "%",
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});
router.get("/preview/:pondId/:speciesId", auth, async (req, res) => {
  try {
    const { pondId, speciesId } = req.params;
    const inputQty = parseInt(req.query.quantity) || 0;
    const pool = req.pool;

    const result = await pool
      .request()
      .input("pId", sql.Int, pondId)
      .input("sId", sql.Int, speciesId).query(`
                SELECT p.Size, p.Stage, p.CultivationType, r.MaxFishPerAcre, r.MaxSpeciesAllowed,
                       (SELECT SUM(Quantity) FROM Stocking WHERE CurrentPondId = @pId) as CurrentStock,
                       s.Name as SpeciesName, s.FeedingZone
                FROM Ponds p
                INNER JOIN StockingRules r ON p.Stage = r.Stage AND p.CultivationType = r.CultivationType
                CROSS JOIN Species s
                WHERE p.PondId = @pId AND s.SpeciesId = @sId
            `);

    if (result.recordset.length === 0)
      return res.status(404).json({ error: "Rules or Species not found" });

    const {
      Size,
      Stage,
      CultivationType,
      MaxFishPerAcre,
      CurrentStock,
      MaxSpeciesAllowed,
      SpeciesName,
      FeedingZone,
    } = result.recordset[0];
    const existingQty = CurrentStock || 0;
    const sensibleMaxFishPerAcre = getSensibleMaxFishPerAcre(
      Stage,
      CultivationType,
      MaxFishPerAcre,
    );
    const maxCap = Math.floor(Size * sensibleMaxFishPerAcre);
    const newTotal = existingQty + inputQty;

    // Advisor Limit: Species-specific maximum based on feeding zone (30:40:30)
    let zoneRatio = FeedingZone === "Column" ? 0.4 : 0.3;
    if (MaxSpeciesAllowed === 1) {
      zoneRatio = 1.0;
    }
    const maxQtyForThisSpecies = Math.floor(maxCap * zoneRatio);

    // Get existing stock for THIS specific species (cumulative check)
    const existingSpeciesStock = await pool
      .request()
      .input("pIdSp", sql.Int, pondId)
      .input("sIdSp", sql.Int, speciesId)
      .query(
        "SELECT ISNULL(SUM(Quantity), 0) as Total FROM Stocking WHERE CurrentPondId = @pIdSp AND SpeciesId = @sIdSp",
      );
    const existingSpeciesQty = existingSpeciesStock.recordset[0].Total || 0;
    const speciesMaxRemaining = Math.max(
      0,
      maxQtyForThisSpecies - existingSpeciesQty,
    );

    // 2. CHECK: Biological Compatibility
    let compatibility = { isCompatible: true, message: "Compatible" };

    const compatibilityCheck = await pool
      .request()
      .input("pId", sql.Int, pondId)
      .input("sId", sql.Int, speciesId).query(`
                SELECT s.Name 
                FROM Stocking st
                JOIN Species s ON st.SpeciesId = s.SpeciesId
                WHERE st.CurrentPondId = @pId AND st.SpeciesId <> @sId
                AND NOT EXISTS (
                    SELECT 1 FROM SpeciesCompatibility c 
                    WHERE (c.SpeciesId = @sId AND c.CompatibleWithId = st.SpeciesId)
                       OR (c.SpeciesId = st.SpeciesId AND c.CompatibleWithId = @sId)
                )
            `);

    if (compatibilityCheck.recordset.length > 0) {
      const conflictSpecies = compatibilityCheck.recordset
        .map((r) => r.Name)
        .join(", ");
      compatibility = {
        isCompatible: false,
        message: `${SpeciesName} is incompatible with ${conflictSpecies} in this pond.`,
      };
    } else if (MaxSpeciesAllowed === 1) {
      const monocultureCheck = await pool
        .request()
        .input("pId", sql.Int, pondId)
        .input("sId", sql.Int, speciesId)
        .query(
          "SELECT TOP 1 s.Name FROM Stocking st JOIN Species s ON st.SpeciesId = s.SpeciesId WHERE st.CurrentPondId = @pId AND st.SpeciesId <> @sId",
        );

      if (monocultureCheck.recordset.length > 0) {
        compatibility = {
          isCompatible: false,
          message: `Monoculture pond already contains ${monocultureCheck.recordset[0].Name}.`,
        };
      }
    }

    res.json({
      currentFish: existingQty,
      newTotal: newTotal,
      maximumCapacity: maxCap,
      maxQtyForThisSpecies,
      existingSpeciesQty,
      speciesMaxRemaining,
      feedingZone: FeedingZone,
      zonePercent: Math.round(zoneRatio * 100),
      utilization:
        maxCap > 0 ? ((newTotal / maxCap) * 100).toFixed(2) + "%" : "0%",
      compatibility,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// --- 2. TRANSFER: Nursery to Grow-out (PROTECTED) ---
router.put("/transfer", auth, async (req, res) => {
  try {
    const { stockId, toPondId, quantity } = req.body;
    const pool = req.pool;

    // 1. Get Details of the batch being transferred
    const stockData = await pool
      .request()
      .input("sid", sql.Int, stockId)
      .input("uId", sql.Int, req.user.id)
      .query(
        "SELECT SpeciesId, Quantity, OriginalPondId, CurrentPondId, PricePerPiece, CurrentSizeInches, TargetSizeInches, StockingDate FROM Stocking WHERE StockId = @sid AND UserId = @uId",
      );

    if (stockData.recordset.length === 0) {
      return res.status(404).json({ error: "Batch not found" });
    }
    const speciesId = stockData.recordset[0].SpeciesId;

    // 2. Fetch Destination Pond Policy
    const policyData = await pool.request().input("pId", sql.Int, toPondId)
      .query(`
                SELECT p.Stage, p.CultivationType, r.MaxSpeciesAllowed
                FROM Ponds p
                INNER JOIN StockingRules r ON p.Stage = r.Stage AND p.CultivationType = r.CultivationType
                WHERE p.PondId = @pId
            `);

    if (policyData.recordset.length === 0) {
      return res
        .status(404)
        .json({ error: "Destination pond rules not found" });
    }
    const { MaxSpeciesAllowed, Stage } = policyData.recordset[0];

    // 3. CHECK: Total Species Diversity Limit
    const speciesCheck = await pool
      .request()
      .input("pId", sql.Int, toPondId)
      .input("sId", sql.Int, speciesId).query(`
                SELECT COUNT(DISTINCT SpeciesId) as UniqueSpecies 
                FROM Stocking 
                WHERE CurrentPondId = @pId AND SpeciesId <> @sId
            `);

    if (speciesCheck.recordset[0].UniqueSpecies >= MaxSpeciesAllowed) {
      return res.status(400).json({
        error: "Diversity Limit Reached",
        message: "Pond capacity is full",
      });
    }

    // 4. CHECK: Biological Compatibility
    if (MaxSpeciesAllowed > 1) {
      const compatibilityCheck = await pool
        .request()
        .input("pId", sql.Int, toPondId)
        .input("sId", sql.Int, speciesId).query(`
                    SELECT s.Name, moving.Name AS MovingName
                    FROM Stocking st
                    JOIN Species s ON st.SpeciesId = s.SpeciesId
                    CROSS JOIN Species moving
                    WHERE st.CurrentPondId = @pId AND st.SpeciesId <> @sId
                    AND moving.SpeciesId = @sId
                    AND NOT EXISTS (
                        SELECT 1 FROM SpeciesCompatibility c 
                        WHERE (c.SpeciesId = @sId AND c.CompatibleWithId = st.SpeciesId)
                           OR (c.SpeciesId = st.SpeciesId AND c.CompatibleWithId = @sId)
                    )
                `);

      if (compatibilityCheck.recordset.length > 0) {
        const conflictSpecies = compatibilityCheck.recordset
          .map((r) => r.Name)
          .join(", ");
        return res.status(400).json({
          error: "Biological Conflict",
          message: `Transferred fish is biologically incompatible with ${conflictSpecies} in the destination pond.`,
        });
      }

      const knownConflictCheck = await pool
        .request()
        .input("pId", sql.Int, toPondId)
        .input("sId", sql.Int, speciesId).query(`
                    SELECT s.Name, moving.Name AS MovingName
                    FROM Stocking st
                    JOIN Species s ON st.SpeciesId = s.SpeciesId
                    CROSS JOIN Species moving
                    WHERE st.CurrentPondId = @pId
                      AND st.SpeciesId <> @sId
                      AND st.Quantity > 0
                      AND moving.SpeciesId = @sId
                `);
      const knownConflict = knownConflictCheck.recordset.find((row) =>
        hasKnownSpeciesConflict(row.MovingName, row.Name),
      );
      if (knownConflict) {
        return res.status(400).json({
          error: "Biological Conflict",
          message: `${knownConflict.MovingName} is not biologically compatible with ${knownConflict.Name} in the destination pond.`,
        });
      }
    } else if (speciesCheck.recordset[0].UniqueSpecies > 0) {
      const monocultureCheck = await pool
        .request()
        .input("pId", sql.Int, toPondId)
        .input("sId", sql.Int, speciesId)
        .query(
          "SELECT TOP 1 s.Name FROM Stocking st JOIN Species s ON st.SpeciesId = s.SpeciesId WHERE st.CurrentPondId = @pId AND st.SpeciesId <> @sId",
        );

      if (monocultureCheck.recordset.length > 0) {
        return res.status(400).json({
          error: "Monoculture Violation",
          message: `Destination pond is set for Monoculture and already contains ${monocultureCheck.recordset[0].Name}.`,
        });
      }
    }

    // 5. Proceed to update
    const currentQty = stockData.recordset[0].Quantity;
    const transferQty = Number(quantity || 0);
    if (!Number.isFinite(transferQty) || transferQty <= 0) {
      return res.status(400).json({
        error: "Invalid Quantity",
        message: "Transfer quantity must be greater than zero.",
      });
    }
    if (transferQty > currentQty) {
      return res.status(400).json({
        error: "Invalid Quantity",
        message: `Only ${currentQty} fish are available in this batch.`,
      });
    }
    if (transferQty < currentQty) {
      // Partial transfer
      // Reduce original
      await pool
        .request()
        .input("sid", sql.Int, stockId)
        .input("qty", sql.Int, transferQty)
        .query(
          `UPDATE Stocking SET Quantity = Quantity - @qty WHERE StockId = @sid`,
        );

      // Insert new
      await pool
        .request()
        .input("uId", sql.Int, req.user.id)
        .input("oPId", sql.Int, stockData.recordset[0].OriginalPondId)
        .input("cPId", sql.Int, toPondId)
        .input("sId", sql.Int, speciesId)
        .input("qty", sql.Int, transferQty)
        .input(
          "price",
          sql.Decimal(10, 2),
          stockData.recordset[0].PricePerPiece,
        )
        .input(
          "curSize",
          sql.Decimal(4, 2),
          stockData.recordset[0].CurrentSizeInches,
        )
        .input(
          "tarSize",
          sql.Decimal(4, 2),
          stockData.recordset[0].TargetSizeInches,
        )
        .input("status", sql.NVarChar, Stage)
        .input("date", sql.DateTime, stockData.recordset[0].StockingDate)
        .query(`
                    INSERT INTO Stocking (
                        UserId, OriginalPondId, CurrentPondId, SpeciesId, Quantity, PricePerPiece, 
                        CurrentSizeInches, TargetSizeInches, StockingDate, Status, TransferDate
                    )
                    VALUES (@uId, @oPId, @cPId, @sId, @qty, @price, @curSize, @tarSize, @date, @status, GETDATE());
                `);
    } else {
      // Full transfer
      await pool
        .request()
        .input("sid", sql.Int, stockId)
        .input("newP", sql.Int, toPondId)
        .input("stage", sql.VarChar, Stage).query(`
                    UPDATE Stocking 
                    SET CurrentPondId = @newP, Status = @stage, TransferDate = GETDATE()
                    WHERE StockId = @sid
                `);
    }

    // 6. MAINTENANCE CHECK (If the source pond was fully emptied)
    await pool
      .request()
      .input("pid", sql.Int, stockData.recordset[0].CurrentPondId).query(`
                UPDATE Ponds
                SET NeedsMaintenance = 1
                WHERE PondId = @pid 
                AND ISNULL((SELECT SUM(Quantity) FROM Stocking WHERE CurrentPondId = @pid), 0) <= 0
            `);

    res.json({
      success: true,
      message: "Batch transferred and status updated.",
    });
  } catch (err) {
    res.status(500).json({ error: "Transfer failed", details: err.message });
  }
});

// --- 3. READ: Inventory (PROTECTED - Filtered by User) ---
router.get("/", auth, async (req, res) => {
  try {
    const result = await req.pool.request().input("uId", sql.Int, req.user.id)
      .query(`
                SELECT st.*, s.Name AS SpeciesName, s.FeedingZone, 
                       p.PondName AS CurrentPondName, p.Stage AS CurrentPondStage,
                       st.LastSizeUpdateDate
                FROM Stocking st
                JOIN Species s ON st.SpeciesId = s.SpeciesId
                JOIN Ponds p ON st.CurrentPondId = p.PondId
                WHERE st.UserId = @uId
                ORDER BY st.StockingDate DESC
            `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: "Fetch failed", details: err.message });
  }
});

// --- 2.5 TRANSFER ENTIRE POND (PROTECTED) ---
// Note: Must be above /:id to prevent being treated as a param
router.put("/transfer-whole-pond", auth, async (req, res) => {
  try {
    const { fromPondId, toPondId } = req.body;
    const uId = req.user.id;
    const pool = req.pool;

    // Verify ownership and get destination stage
    const pondsCheck = await pool
      .request()
      .input("fpid", sql.Int, fromPondId)
      .input("tpid", sql.Int, toPondId)
      .input("uid", sql.Int, uId)
      .query(
        "SELECT PondId, Stage FROM Ponds WHERE UserId = @uid AND PondId IN (@fpid, @tpid)",
      );

    if (pondsCheck.recordset.length < 2) {
      return res
        .status(403)
        .json({ error: "Access denied. One or both ponds not found." });
    }

    const toPond = pondsCheck.recordset.find(
      (p) => String(p.PondId) === String(toPondId),
    );
    const newStage = toPond.Stage || "Grow-out";

    await pool
      .request()
      .input("fromP", sql.Int, fromPondId)
      .input("toP", sql.Int, toPondId)
      .input("stage", sql.NVarChar, newStage)
      .input("uid", sql.Int, uId).query(`
                UPDATE Stocking 
                SET CurrentPondId = @toP, 
                    Status = @stage, 
                    TransferDate = GETDATE()
                WHERE CurrentPondId = @fromP AND UserId = @uid
            `);

    // Maintenance Check: fromPond is strictly empty now
    await pool.request().input("pid", sql.Int, fromPondId).query(`
                UPDATE Ponds
                SET NeedsMaintenance = 1
                WHERE PondId = @pid 
                AND ISNULL((SELECT SUM(Quantity) FROM Stocking WHERE CurrentPondId = @pid), 0) <= 0
            `);

    res.json({ success: true, message: "Whole pond transferred" });
  } catch (err) {
    res.status(500).json({ error: "Transfer failed", details: err.message });
  }
});

// --- 4. UPDATE: Growth Sampling (PROTECTED) ---
router.put("/:id", auth, async (req, res) => {
  try {
    const { quantity, currentSize, targetSize, recordDate } = req.body;
    await req.pool
      .request()
      .input("id", sql.Int, req.params.id)
      .input("uId", sql.Int, req.user.id)
      .input("qty", sql.Int, quantity)
      .input("curSize", sql.Decimal(4, 2), currentSize)
      .input("tarSize", sql.Decimal(4, 2), targetSize)
      .input("date", sql.DateTime, recordDate || null).query(`
                UPDATE Stocking 
                SET Quantity = ISNULL(@qty, Quantity), 
                    CurrentSizeInches = ISNULL(@curSize, CurrentSizeInches),
                    TargetSizeInches = ISNULL(@tarSize, TargetSizeInches),
                    LastSizeUpdateDate = ISNULL(@date, LastSizeUpdateDate)
                WHERE StockId = @id AND UserId = @uId
            `);

    // Log to Growth_History for chart visualization
    if (currentSize) {
      await req.pool
        .request()
        .input("stockId", sql.Int, req.params.id)
        .input("size", sql.Decimal(4, 2), currentSize)
        .input("recorded", sql.DateTime, recordDate || new Date()).query(`
                    INSERT INTO Growth_History (StockId, SizeInches, RecordedAt)
                    VALUES (@stockId, @size, @recorded)
                `);
    }

    res.json({ success: true, message: "Growth data updated" });
  } catch (err) {
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

// --- 4b. GET: Growth History for a specific batch ---
router.get("/:id/growth-history", auth, async (req, res) => {
  try {
    const result = await req.pool
      .request()
      .input("stockId", sql.Int, req.params.id).query(`
                SELECT HistoryId, SizeInches, RecordedAt
                FROM Growth_History
                WHERE StockId = @stockId
                ORDER BY RecordedAt ASC
            `);
    res.json(result.recordset);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to fetch growth history", details: err.message });
  }
});

// --- 5. DELETE (PROTECTED) ---
router.delete("/:id", auth, async (req, res) => {
  try {
    const pool = req.pool;

    // Get the pond ID before deleting
    const stockData = await pool
      .request()
      .input("id", sql.Int, req.params.id)
      .input("uId", sql.Int, req.user.id)
      .query(
        "SELECT CurrentPondId FROM Stocking WHERE StockId = @id AND UserId = @uId",
      );

    const pondId = stockData.recordset[0]?.CurrentPondId;

    await pool
      .request()
      .input("id", sql.Int, req.params.id)
      .input("uId", sql.Int, req.user.id)
      .query("DELETE FROM Stocking WHERE StockId = @id AND UserId = @uId");

    // Maintenance Check: If pond is now empty, flag it
    if (pondId) {
      await pool.request().input("pid", sql.Int, pondId).query(`
                    UPDATE Ponds
                    SET NeedsMaintenance = 1
                    WHERE PondId = @pid 
                    AND ISNULL((SELECT SUM(Quantity) FROM Stocking WHERE CurrentPondId = @pid), 0) <= 0
                `);
    }

    res.json({ success: true, message: "Record deleted" });
  } catch (err) {
    res.status(500).json({ error: "Deletion failed", details: err.message });
  }
});

// --- 6. UPDATE: Toggle "For Sale" Status (PROTECTED) ---
router.put("/sale/:id", auth, async (req, res) => {
  try {
    const { isForSale, quantityForSale, salePricePerUnit } = req.body;
    await ensureStockingSaleSchema(req.pool);
    const qty = isForSale ? quantityForSale || 0 : 0;
    const price = isForSale ? salePricePerUnit || null : null;

    await req.pool
      .request()
      .input("id", sql.Int, req.params.id)
      .input("uId", sql.Int, req.user.id)
      .input("isForSale", sql.Bit, isForSale)
      .input("qty", sql.Int, qty)
      .input("salePrice", sql.Decimal(10, 2), price)
      .query(
        "UPDATE Stocking SET IsForSale = @isForSale, QuantityForSale = @qty, SalePricePerUnit = @salePrice, SaleDate = CASE WHEN @isForSale = 1 THEN GETDATE() ELSE NULL END WHERE StockId = @id AND UserId = @uId",
      );
    res.json({ success: true, message: "Sale status updated" });
  } catch (err) {
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

module.exports = router;
