const express = require('express');
const router = express.Router();
const sql = require('mssql/msnodesqlv8');
const { poolPromise } = require('../config/db');
const auth = require('../middleware/auth');

const normalizeSpeciesName = (name) => String(name || '').toLowerCase().replace(/[^a-z]/g, '');
const hasKnownSpeciesConflict = (firstName, secondName) => {
    const pair = [normalizeSpeciesName(firstName), normalizeSpeciesName(secondName)].sort().join('|');
    return pair === 'rohu|tilapia';
};

// 1. GET: Fetch all APPROVED species (Public-facing)
router.get('/', auth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const request = pool.request();

        // Return only approved species for the main list
        const query = 'SELECT * FROM Species WHERE IsApproved = 1';

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: "Database error", message: err.message });
    }
});

// 1b. GET: Fetch regional species (Punjab, Sindh, etc.)
router.get('/regional', auth, async (req, res) => {
    try {
        const province = req.query.province; // e.g., "KPK Valleys (Peshawar, Mardan, Swat)"
        if (!province) return res.status(400).json({ error: "Province is required" });

        // Extract base region name (e.g., "KPK Valleys" from "KPK Valleys (Peshawar...)")
        const baseRegion = province.split('(')[0].trim();

        const pool = await poolPromise;
        const result = await pool.request()
            .input('province', sql.NVarChar, province)
            .input('baseRegion', sql.NVarChar, baseRegion)
            .query(`
                SELECT * FROM Species 
                WHERE (LOWER(CompatibleRegions) LIKE '%' + LOWER(@province) + '%' 
                OR LOWER(CompatibleRegions) LIKE '%' + LOWER(@baseRegion) + '%'
                OR LOWER(CompatibleRegions) LIKE '%all regions%')
                AND IsApproved = 1
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: "Database error", message: err.message });
    }
});

// 2. GET: Ping test (Public)
router.get('/ping', (req, res) => {
    res.send("Species Route file is loaded and working!");
});

// 2b. GET: Generate dynamic polyculture mixes based on SpeciesCompatibility
router.get('/polyculture/mixes', auth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT 
                s1.SpeciesId as MainId,
                s1.Name as MainName,
                s2.SpeciesId as PartnerId,
                s2.Name as PartnerName,
                c.CompatibilityReason
            FROM SpeciesCompatibility c
            INNER JOIN Species s1 ON c.SpeciesId = s1.SpeciesId
            INNER JOIN Species s2 ON c.CompatibleWithId = s2.SpeciesId
        `);

        // Group by Main Species
        const grouped = {};
        result.recordset.forEach(row => {
            if (!grouped[row.MainId]) {
                grouped[row.MainId] = {
                    id: row.MainId,
                    name: `${row.MainName}-Centric Mix`,
                    level: "Dynamic Mix",
                    levelColor: "bg-emerald-50 text-emerald-600 border-emerald-100",
                    mainSpecies: row.MainName,
                    partners: [],
                    reasons: []
                };
            }
            grouped[row.MainId].partners.push(row.PartnerName);
            grouped[row.MainId].reasons.push(row.CompatibilityReason);
        });

        const mixes = Object.values(grouped).map(group => {
            const totalSpecies = 1 + group.partners.length;
            const percentage = Math.round(100 / totalSpecies);

            const ratio = [
                { species: group.mainSpecies, percentage: `${percentage}%`, count: "Varies by Pond" }
            ];

            group.partners.forEach(p => {
                ratio.push({ species: p, percentage: `${percentage}%`, count: "Varies by Pond" });
            });

            // Adjust last item to ensure total is 100% just in case of rounding errors (not strictly needed but good for display)

            return {
                id: group.id,
                name: group.name,
                level: group.level,
                levelColor: group.levelColor,
                totalFish: "Varies by Size",
                expectedYield: "Depends on density",
                advantages: group.reasons.join(" "),
                ratio: ratio
            };
        });

        // Add a two-way mix generator as well to make it interesting
        // Some species might only be a partner. We can also do bidirectional grouping, but this is a good start.

        res.json(mixes);
    } catch (err) {
        res.status(500).json({ error: "Database error", message: err.message });
    }
});

// 3. POST: Add a new custom Species (Protected)
router.post('/add', auth, async (req, res) => {
    try {
        const data = req.body;
        const pool = await poolPromise;
        const request = pool.request();

        request.input('Name', sql.NVarChar, data.Name);
        request.input('ImageUrl', sql.NVarChar, data.ImageUrl);
        request.input('MaxStockingDensity', sql.Decimal(10, 2), data.MaxStockingDensity);
        const isApprovedStatus = req.user.role === 'admin' ? 1 : 0;
        request.input('IsApproved', sql.Bit, isApprovedStatus);
        request.input('CompatibleRegions', sql.NVarChar, data.CompatibleRegions);
        request.input('MinTemp', sql.Int, data.MinTemp);
        request.input('MaxTemp', sql.Int, data.MaxTemp);
        request.input('MinPH', sql.Decimal(3, 1), data.MinPH);
        request.input('MaxPH', sql.Decimal(3, 1), data.MaxPH);
        request.input('MinDO', sql.Decimal(3, 1), data.MinDO);
        request.input('FingerlingSizeG', sql.Int, data.FingerlingSizeG);
        request.input('MarketSizeKG', sql.Decimal(10, 2), data.MarketSizeKG);
        request.input('HarvestTimeMonths', sql.Int, data.HarvestTimeMonths);
        request.input('SurvivalRateLower', sql.Decimal(5, 2), data.SurvivalRateLower);
        request.input('SurvivalRateUpper', sql.Decimal(5, 2), data.SurvivalRateUpper);
        request.input('MinMarketPrice', sql.Decimal(10, 2), data.MinMarketPrice);
        request.input('MaxMarketPrice', sql.Decimal(10, 2), data.MaxMarketPrice);
        request.input('Description', sql.NVarChar, data.Description);
        request.input('FeedingZone', sql.NVarChar, data.FeedingZone);
        request.input('SubmittedBy', sql.Int, req.user.id);

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const addReq = new sql.Request(transaction);

            // Re-bind all inputs to the transaction request
            addReq.input('Name', sql.NVarChar, data.Name);
            addReq.input('ImageUrl', sql.NVarChar, data.ImageUrl);
            addReq.input('MaxStockingDensity', sql.Decimal(10, 2), data.MaxStockingDensity);
            addReq.input('IsApproved', sql.Bit, isApprovedStatus);
            addReq.input('CompatibleRegions', sql.NVarChar, data.CompatibleRegions);
            addReq.input('MinTemp', sql.Int, data.MinTemp);
            addReq.input('MaxTemp', sql.Int, data.MaxTemp);
            addReq.input('MinPH', sql.Decimal(3, 1), data.MinPH);
            addReq.input('MaxPH', sql.Decimal(3, 1), data.MaxPH);
            addReq.input('MinDO', sql.Decimal(3, 1), data.MinDO);
            addReq.input('FingerlingSizeG', sql.Int, data.FingerlingSizeG);
            addReq.input('MarketSizeKG', sql.Decimal(10, 2), data.MarketSizeKG);
            addReq.input('HarvestTimeMonths', sql.Int, data.HarvestTimeMonths);
            addReq.input('SurvivalRateLower', sql.Decimal(5, 2), data.SurvivalRateLower);
            addReq.input('SurvivalRateUpper', sql.Decimal(5, 2), data.SurvivalRateUpper);
            addReq.input('MinMarketPrice', sql.Decimal(10, 2), data.MinMarketPrice);
            addReq.input('MaxMarketPrice', sql.Decimal(10, 2), data.MaxMarketPrice);
            addReq.input('Description', sql.NVarChar, data.Description);
            addReq.input('FeedingZone', sql.NVarChar, data.FeedingZone);
            addReq.input('SubmittedBy', sql.Int, req.user.id);

            const result = await addReq.query(`
            INSERT INTO Species (
                Name, ImageUrl, MaxStockingDensity, IsApproved, CompatibleRegions, 
                MinTemp, MaxTemp, MinPH, MaxPH, MinDO, FingerlingSizeG, 
                MarketSizeKG, HarvestTimeMonths, SurvivalRateLower, SurvivalRateUpper,
                MinMarketPrice, MaxMarketPrice, Description, FeedingZone, SubmittedBy
            ) VALUES (
                @Name, @ImageUrl, @MaxStockingDensity, @IsApproved, @CompatibleRegions, 
                @MinTemp, @MaxTemp, @MinPH, @MaxPH, @MinDO, @FingerlingSizeG, 
                @MarketSizeKG, @HarvestTimeMonths, @SurvivalRateLower, @SurvivalRateUpper,
                @MinMarketPrice, @MaxMarketPrice, @Description, @FeedingZone, @SubmittedBy
            );
            SELECT CAST(SCOPE_IDENTITY() AS INT) AS NewSpeciesId;
            `);

            const newSpeciesId = result.recordset[0].NewSpeciesId;

            // Insert Compatible Species
            if (data.CompatibleSpeciesIds && Array.isArray(data.CompatibleSpeciesIds)) {
                for (const partnerId of data.CompatibleSpeciesIds) {
                    const compReq = new sql.Request(transaction);
                    compReq.input('SpeciesId', sql.Int, newSpeciesId);
                    compReq.input('CompatibleWithId', sql.Int, partnerId);
                    compReq.input('Reason', sql.NVarChar, 'Custom Poly-culture compatibility');
                    await compReq.query(`
                        INSERT INTO SpeciesCompatibility (SpeciesId, CompatibleWithId, CompatibilityReason)
                        VALUES (@SpeciesId, @CompatibleWithId, @Reason)
                    `);
                }
            }

            // Insert Feed Rules
            const insertFeed = async (stage, feedType, minSize, maxSize, rate, freq) => {
                if (!feedType) return;
                const feedReq = new sql.Request(transaction);
                feedReq.input('SpeciesID', sql.Int, newSpeciesId);
                feedReq.input('Stage', sql.NVarChar, stage);
                feedReq.input('MinSize', sql.Float, minSize);
                feedReq.input('MaxSize', sql.Float, maxSize);
                feedReq.input('Rate', sql.Float, rate);
                feedReq.input('FeedType', sql.NVarChar, feedType);
                feedReq.input('Freq', sql.NVarChar, freq);

                await feedReq.query(`
                    INSERT INTO Feed_Rules (SpeciesID, Stage, MinSize_inch, MaxSize_inch, DailyRate_Percent, ConditionFactor_K, FeedType, Frequency)
                    VALUES (@SpeciesID, @Stage, @MinSize, @MaxSize, @Rate, 0.01, @FeedType, @Freq)
                `);
            };

            await insertFeed('Fingerling', data.FingerlingFeedType, 1.0, 5.0, 5.0, '3-4 times daily');
            await insertFeed('Grow-out', data.GrowOutFeedType, 5.0, 20.0, 3.0, '2-3 times daily');

            await transaction.commit();
            res.status(201).json({ success: true, message: "Custom species and feed guidelines added successfully!" });
        } catch (txnErr) {
            await transaction.rollback();
            throw txnErr;
        }

    } catch (err) {
        console.error("Species Add Error:", err);
        res.status(500).json({ error: "Failed to add species", message: err.message });
    }
});

// 2c. GET: Check whether a species can be added to an existing pond
router.get('/compatibility/pond/:pondId/:speciesId', auth, async (req, res) => {
    try {
        const { pondId, speciesId } = req.params;
        const pool = await poolPromise;

        const speciesResult = await pool.request()
            .input('speciesId', sql.Int, speciesId)
            .query(`
                SELECT SpeciesId, Name, MinTemp, MaxTemp, MinPH, MaxPH, MinDO, FeedingZone
                FROM Species
                WHERE SpeciesId = @speciesId
            `);

        if (speciesResult.recordset.length === 0) {
            return res.status(404).json({ error: "Species not found" });
        }

        const newSpecies = speciesResult.recordset[0];

        const pondResult = await pool.request()
            .input('pondId', sql.Int, pondId)
            .input('userId', sql.Int, req.user.id)
            .query(`
                SELECT PondId, PondName
                FROM Ponds
                WHERE PondId = @pondId AND UserId = @userId
            `);

        if (pondResult.recordset.length === 0) {
            return res.status(404).json({ error: "Pond not found" });
        }

        const existingResult = await pool.request()
            .input('pondId', sql.Int, pondId)
            .input('speciesId', sql.Int, speciesId)
            .query(`
                SELECT DISTINCT
                    s.SpeciesId,
                    s.Name,
                    s.MinTemp,
                    s.MaxTemp,
                    s.MinPH,
                    s.MaxPH,
                    s.MinDO,
                    s.FeedingZone,
                    c.CompatibilityId,
                    c.CompatibilityReason
                FROM Stocking st
                INNER JOIN Species s ON st.SpeciesId = s.SpeciesId
                LEFT JOIN SpeciesCompatibility c
                    ON (
                        (c.SpeciesId = @speciesId AND c.CompatibleWithId = st.SpeciesId)
                        OR (c.SpeciesId = st.SpeciesId AND c.CompatibleWithId = @speciesId)
                    )
                WHERE st.CurrentPondId = @pondId
                  AND st.Quantity > 0
                  AND st.SpeciesId <> @speciesId
            `);

        const conflicts = existingResult.recordset
            .map(existing => {
                const reasons = [];
                if (hasKnownSpeciesConflict(newSpecies.Name, existing.Name)) {
                    reasons.push("Rohu and Tilapia are not recommended together because they compete in the column-feeding niche and Tilapia can dominate breeding/feed resources.");
                }
                if (!existing.CompatibilityId) {
                    reasons.push("No approved polyculture compatibility rule exists for this pair.");
                }

                const tempOverlap =
                    newSpecies.MinTemp == null ||
                    newSpecies.MaxTemp == null ||
                    existing.MinTemp == null ||
                    existing.MaxTemp == null ||
                    Number(newSpecies.MinTemp) <= Number(existing.MaxTemp) &&
                        Number(existing.MinTemp) <= Number(newSpecies.MaxTemp);
                if (!tempOverlap) {
                    reasons.push(
                        `Temperature ranges do not overlap (${newSpecies.Name}: ${newSpecies.MinTemp}-${newSpecies.MaxTemp}°C, ${existing.Name}: ${existing.MinTemp}-${existing.MaxTemp}°C).`
                    );
                }

                const phOverlap =
                    newSpecies.MinPH == null ||
                    newSpecies.MaxPH == null ||
                    existing.MinPH == null ||
                    existing.MaxPH == null ||
                    Number(newSpecies.MinPH) <= Number(existing.MaxPH) &&
                        Number(existing.MinPH) <= Number(newSpecies.MaxPH);
                if (!phOverlap) {
                    reasons.push(
                        `pH ranges do not overlap (${newSpecies.Name}: ${newSpecies.MinPH}-${newSpecies.MaxPH}, ${existing.Name}: ${existing.MinPH}-${existing.MaxPH}).`
                    );
                }

                if (reasons.length === 0) return null;

                return {
                    speciesId: existing.SpeciesId,
                    speciesName: existing.Name,
                    feedingZone: existing.FeedingZone,
                    reasons
                };
            })
            .filter(Boolean);

        res.json({
            compatible: conflicts.length === 0,
            speciesId: Number(speciesId),
            speciesName: newSpecies.Name,
            pondId: Number(pondId),
            incompatibleWith: conflicts,
            message:
                conflicts.length === 0
                    ? `${newSpecies.Name} is compatible with the fish currently stocked in this pond.`
                    : `${newSpecies.Name} cannot be stocked with ${conflicts.map(c => c.speciesName).join(', ')}.`
        });
    } catch (err) {
        res.status(500).json({ error: "Compatibility check failed", message: err.message });
    }
});

const evaluateSpeciesPairCompatibility = (first, second) => {
    const reasons = [];

    if (hasKnownSpeciesConflict(first.Name, second.Name)) {
        reasons.push(
            'Rohu and Tilapia are not recommended together because they compete in the column-feeding niche.'
        );
    }

    const tempOverlap =
        first.MinTemp == null ||
        first.MaxTemp == null ||
        second.MinTemp == null ||
        second.MaxTemp == null ||
        (Number(first.MinTemp) <= Number(second.MaxTemp) &&
            Number(second.MinTemp) <= Number(first.MaxTemp));
    if (!tempOverlap) {
        reasons.push(
            `Temperature ranges do not overlap (${first.Name}: ${first.MinTemp}-${first.MaxTemp}°C, ${second.Name}: ${second.MinTemp}-${second.MaxTemp}°C).`
        );
    }

    const phOverlap =
        first.MinPH == null ||
        first.MaxPH == null ||
        second.MinPH == null ||
        second.MaxPH == null ||
        (Number(first.MinPH) <= Number(second.MaxPH) &&
            Number(second.MinPH) <= Number(first.MaxPH));
    if (!phOverlap) {
        reasons.push(
            `pH ranges do not overlap (${first.Name}: ${first.MinPH}-${first.MaxPH}, ${second.Name}: ${second.MinPH}-${second.MaxPH}).`
        );
    }

    return {
        compatible: reasons.length === 0,
        reasons,
    };
};

// 2c2. POST: Bulk compatibility check for selected species IDs
router.post('/compatibility/bulk', auth, async (req, res) => {
    try {
        const speciesIds = Array.isArray(req.body?.speciesIds)
            ? [...new Set(req.body.speciesIds.map(Number).filter(Boolean))]
            : [];

        if (speciesIds.length < 2) {
            return res.json({ pairs: [] });
        }

        const pool = await poolPromise;
        const speciesResult = await pool.request().query(`
            SELECT SpeciesId, Name, MinTemp, MaxTemp, MinPH, MaxPH
            FROM Species
            WHERE SpeciesId IN (${speciesIds.join(',')})
        `);

        const speciesById = {};
        speciesResult.recordset.forEach(row => {
            speciesById[row.SpeciesId] = row;
        });

        const compatibilityResult = await pool.request().query(`
            SELECT SpeciesId, CompatibleWithId, CompatibilityReason
            FROM SpeciesCompatibility
            WHERE SpeciesId IN (${speciesIds.join(',')})
               OR CompatibleWithId IN (${speciesIds.join(',')})
        `);

        const compatibilityPairs = new Set();
        compatibilityResult.recordset.forEach(row => {
            const key = [row.SpeciesId, row.CompatibleWithId].sort((a, b) => a - b).join('-');
            compatibilityPairs.add(key);
        });

        const pairs = [];
        for (let i = 0; i < speciesIds.length; i += 1) {
            for (let j = i + 1; j < speciesIds.length; j += 1) {
                const speciesIdA = speciesIds[i];
                const speciesIdB = speciesIds[j];
                const first = speciesById[speciesIdA];
                const second = speciesById[speciesIdB];

                if (!first || !second) {
                    pairs.push({
                        speciesIdA,
                        speciesIdB,
                        compatible: false,
                        reason: 'One or both species were not found.',
                    });
                    continue;
                }

                const pairKey = [speciesIdA, speciesIdB].sort((a, b) => a - b).join('-');
                const evaluation = evaluateSpeciesPairCompatibility(first, second);
                const hasCompatibilityRule = compatibilityPairs.has(pairKey);

                if (!hasCompatibilityRule) {
                    evaluation.compatible = false;
                    evaluation.reasons.push(
                        'No approved polyculture compatibility rule exists for this pair.'
                    );
                }

                pairs.push({
                    speciesIdA,
                    speciesIdB,
                    speciesNameA: first.Name,
                    speciesNameB: second.Name,
                    compatible: evaluation.compatible,
                    reason: evaluation.reasons.join(' '),
                });
            }
        }

        res.json({ pairs });
    } catch (err) {
        res.status(500).json({ error: 'Bulk compatibility check failed', message: err.message });
    }
});

// 2d. GET: Check whether all species from one pond can move into another pond
router.get('/compatibility/pond-to-pond/:sourcePondId/:destPondId', auth, async (req, res) => {
    try {
        const { sourcePondId, destPondId } = req.params;
        const pool = await poolPromise;

        const pondCheck = await pool.request()
            .input('sourcePondId', sql.Int, sourcePondId)
            .input('destPondId', sql.Int, destPondId)
            .input('userId', sql.Int, req.user.id)
            .query(`
                SELECT PondId
                FROM Ponds
                WHERE UserId = @userId AND PondId IN (@sourcePondId, @destPondId)
            `);

        if (pondCheck.recordset.length < 2) {
            return res.status(404).json({ error: "Source or destination pond not found" });
        }

        const sourceSpecies = await pool.request()
            .input('sourcePondId', sql.Int, sourcePondId)
            .query(`
                SELECT DISTINCT SpeciesId
                FROM Stocking
                WHERE CurrentPondId = @sourcePondId AND Quantity > 0
            `);

        const incompatiblePairs = [];
        for (const row of sourceSpecies.recordset) {
            const checkResult = await pool.request()
                .input('destPondId', sql.Int, destPondId)
                .input('speciesId', sql.Int, row.SpeciesId)
                .query(`
                    SELECT DISTINCT s.SpeciesId, s.Name
                    FROM Stocking st
                    INNER JOIN Species s ON st.SpeciesId = s.SpeciesId
                    WHERE st.CurrentPondId = @destPondId
                      AND st.Quantity > 0
                      AND st.SpeciesId <> @speciesId
                      AND NOT EXISTS (
                          SELECT 1 FROM SpeciesCompatibility c
                          WHERE (c.SpeciesId = @speciesId AND c.CompatibleWithId = st.SpeciesId)
                             OR (c.SpeciesId = st.SpeciesId AND c.CompatibleWithId = @speciesId)
                      )
                `);

            checkResult.recordset.forEach(conflict => {
                incompatiblePairs.push({
                    sourceSpecies: { speciesId: row.SpeciesId },
                    destSpecies: {
                        speciesId: conflict.SpeciesId,
                        speciesName: conflict.Name
                    },
                    reasons: ["No approved polyculture compatibility rule exists for this pair."]
                });
            });
        }

        res.json({
            compatible: incompatiblePairs.length === 0,
            incompatiblePairs
        });
    } catch (err) {
        res.status(500).json({ error: "Pond-to-pond compatibility check failed", message: err.message });
    }
});

// 4. GET Compatibility for a specific Species (Protected)
router.get('/:id/compatibility', auth, async (req, res) => {
    try {
        const pool = await poolPromise; // Standardized to poolPromise
        const result = await pool.request()
            .input('speciesId', sql.Int, req.params.id)
            .query(`
                SELECT 
                    c.CompatibilityId,
                    s1.Name AS MainSpeciesName,
                    s2.Name AS CompatibleSpeciesName,
                    c.CompatibilityReason
                FROM SpeciesCompatibility c
                INNER JOIN Species s1 ON c.SpeciesId = s1.SpeciesId
                INNER JOIN Species s2 ON c.CompatibleWithId = s2.SpeciesId
                WHERE c.SpeciesId = @speciesId OR c.CompatibleWithId = @speciesId
            `);

        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: "Database error", message: err.message });
    }
});

// 5. GET: Admin view of PENDING species (Admin only)
router.get('/admin/pending', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "Access denied. Admin role required." });
        }

        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM Species WHERE IsApproved = 0');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: "Database error", message: err.message });
    }
});

// 6. PUT: Approve a species (Admin only)
router.put('/:id/approve', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "Access denied. Admin role required." });
        }

        const data = req.body;
        const pool = await poolPromise;
        const request = pool.request();
        
        request.input('speciesId', sql.Int, req.params.id);

        let query = 'UPDATE Species SET IsApproved = 1';

        // Check if data is provided and has keys
        if (data && Object.keys(data).length > 0) {
            const fields = [
                { key: 'Name', type: sql.NVarChar, val: data.Name },
                { key: 'ImageUrl', type: sql.NVarChar, val: data.ImageUrl },
                { key: 'MaxStockingDensity', type: sql.Decimal(10, 2), val: data.MaxStockingDensity },
                { key: 'CompatibleRegions', type: sql.NVarChar, val: data.CompatibleRegions },
                { key: 'MinTemp', type: sql.Int, val: data.MinTemp },
                { key: 'MaxTemp', type: sql.Int, val: data.MaxTemp },
                { key: 'MinPH', type: sql.Decimal(3, 1), val: data.MinPH },
                { key: 'MaxPH', type: sql.Decimal(3, 1), val: data.MaxPH },
                { key: 'MinDO', type: sql.Decimal(3, 1), val: data.MinDO },
                { key: 'FingerlingSizeG', type: sql.Int, val: data.FingerlingSizeG },
                { key: 'MarketSizeKG', type: sql.Decimal(10, 2), val: data.MarketSizeKG },
                { key: 'HarvestTimeMonths', type: sql.Int, val: data.HarvestTimeMonths },
                { key: 'SurvivalRateLower', type: sql.Decimal(5, 2), val: data.SurvivalRateLower },
                { key: 'SurvivalRateUpper', type: sql.Decimal(5, 2), val: data.SurvivalRateUpper },
                { key: 'MinMarketPrice', type: sql.Decimal(10, 2), val: data.MinMarketPrice },
                { key: 'MaxMarketPrice', type: sql.Decimal(10, 2), val: data.MaxMarketPrice },
                { key: 'Description', type: sql.NVarChar, val: data.Description },
                { key: 'FeedingZone', type: sql.NVarChar, val: data.FeedingZone }
            ];

            fields.forEach(field => {
                if (field.val !== undefined) {
                    query += `, ${field.key} = @${field.key}`;
                    request.input(field.key, field.type, field.val);
                }
            });
        }
        
        query += ' WHERE SpeciesId = @speciesId';

        await request.query(query);

        // Update Compatible Species if provided
        if (data && data.CompatibleSpeciesIds && Array.isArray(data.CompatibleSpeciesIds)) {
            // Delete existing compatibilities for this species
            const delReq = pool.request();
            delReq.input('speciesId', sql.Int, req.params.id);
            await delReq.query('DELETE FROM SpeciesCompatibility WHERE SpeciesId = @speciesId');

            // Insert new ones
            for (const partnerId of data.CompatibleSpeciesIds) {
                const compReq = pool.request();
                compReq.input('SpeciesId', sql.Int, req.params.id);
                compReq.input('CompatibleWithId', sql.Int, partnerId);
                compReq.input('Reason', sql.NVarChar, 'Admin approved poly-culture compatibility');
                await compReq.query(`
                    INSERT INTO SpeciesCompatibility (SpeciesId, CompatibleWithId, CompatibilityReason)
                    VALUES (@SpeciesId, @CompatibleWithId, @Reason)
                `);
            }
        }

        res.json({ success: true, message: "Species approved successfully!" });
    } catch (err) {
        console.error("Error approving species:", err);
        res.status(500).json({ error: "Database error", message: err.message });
    }
});

// 7. DELETE: Reject/Delete a species (Admin only)
router.delete('/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "Access denied. Admin role required." });
        }

        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Delete dependent records first to resolve Foreign Key constraints
            const request = new sql.Request(transaction);
            request.input('speciesId', sql.Int, req.params.id);

            await request.query('DELETE FROM SpeciesCompatibility WHERE SpeciesId = @speciesId OR CompatibleWithId = @speciesId');
            
            // Delete the actual species
            await request.query('DELETE FROM Species WHERE SpeciesId = @speciesId');

            await transaction.commit();
            res.json({ success: true, message: "Species rejected and deleted." });
        } catch (txnErr) {
            await transaction.rollback();
            throw txnErr; // re-throw to outer catch block
        }
    } catch (err) {
        res.status(500).json({ error: "Database error", message: err.message });
    }
});

module.exports = router;