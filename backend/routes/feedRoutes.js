const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const auth = require('../middleware/auth');

// GET: Suggest Feed based on SpeciesID and 6-inch Stage Logic
// GET: Suggest Feed based on exact Schema column names
router.get('/types', auth, async (req, res) => {
    try {
        const pool = req.pool;
        const uId = req.user.id;
        const result = await pool.request()
            .input('uid', sql.Int, uId)
            .query(`
                SELECT DISTINCT FeedType FROM Feed_Rules
                UNION
                SELECT DISTINCT FeedType FROM Feed_Stock WHERE UserId = @uid AND FeedType IS NOT NULL AND CurrentQuantity_kg > 0
            `);
        res.json(result.recordset.map(r => r.FeedType));
    } catch (err) {
        res.status(500).json({ error: "Database Error", message: err.message });
    }
});

// GET: Aggregated Generic Feeding Guidelines across all species
router.get('/guidelines/generic', auth, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request().query(`
            SELECT 
                Stage, 
                MIN(DailyRate_Percent) as MinRate, 
                MAX(DailyRate_Percent) as MaxRate, 
                MAX(Frequency) as Freq, 
                MAX(FeedType) as Type 
            FROM Feed_Rules 
            GROUP BY Stage
        `);

        // Format into frontend ready structure
        const guidelines = result.recordset.map(row => {
            let ageLabel = "";
            let feedRate = "";

            if (row.Stage.toLowerCase().includes("fingerling")) {
                ageLabel = "0-3 Months (Fingerling)";
                feedRate = row.MinRate === row.MaxRate ? `${row.MinRate}% body weight/day` : `${row.MinRate}-${row.MaxRate}% body weight/day`;
            } else if (row.Stage.toLowerCase().includes("grow-out")) {
                ageLabel = "3-12 Months (Grow-out)";
                feedRate = row.MinRate === row.MaxRate ? `${row.MinRate}% body weight/day` : `${row.MinRate}-${row.MaxRate}% body weight/day`;
            } else {
                ageLabel = row.Stage;
                feedRate = `${row.MinRate}-${row.MaxRate}% body weight/day`;
            }

            return {
                age: ageLabel,
                feed: feedRate,
                freq: row.Freq,
                type: row.Type
            };
        });

        // Add a manual "Market Size" one to finish the timeline if the DB doesn't have it explicitly as a separate stage
        const hasMarket = guidelines.some(g => g.age.toLowerCase().includes("market"));
        if (!hasMarket) {
            guidelines.push({
                age: "Market Size / Maintenance",
                feed: "1.0-1.5% body weight/day",
                freq: "1-2 times daily",
                type: "Large Pellets"
            });
        }

        // Make sure Fingerling is first and Grow-out is next
        guidelines.sort((a, b) => {
            if (a.age.includes("Fingerling") || a.age.includes("0-")) return -1;
            if (b.age.includes("Fingerling") || b.age.includes("0-")) return 1;
            if (a.age.includes("Grow-out") || a.age.includes("3-")) return -1;
            if (b.age.includes("Grow-out") || b.age.includes("3-")) return 1;
            return 0;
        });

        res.json(guidelines);
    } catch (err) {
        res.status(500).json({ error: "Database Error", message: err.message });
    }
});

// GET: All Rules Joined with Species (For Feeding Habits section)
router.get('/rules/all', auth, async (req, res) => {
    try {
        const pool = req.pool;

        // Join Species with Feed_Rules
        const result = await pool.request().query(`
            SELECT 
                S.SpeciesId, S.Name as SpeciesName, S.ImageUrl,
                F.RuleId, F.Stage, F.MinSize_inch, F.MaxSize_inch, F.DailyRate_Percent, F.FeedType, F.Frequency
            FROM Species S
            JOIN Feed_Rules F ON S.SpeciesId = F.SpeciesID
            WHERE S.IsApproved = 1
            ORDER BY S.Name ASC, F.MinSize_inch ASC
        `);

        // Group the rules by Species
        const speciesMap = {};

        result.recordset.forEach(row => {
            if (!speciesMap[row.SpeciesId]) {
                speciesMap[row.SpeciesId] = {
                    SpeciesId: row.SpeciesId,
                    Name: row.SpeciesName,
                    ImageUrl: row.ImageUrl,
                    Rules: []
                };
            }

            speciesMap[row.SpeciesId].Rules.push({
                RuleId: row.RuleId,
                Stage: row.Stage,
                MinSize: row.MinSize_inch,
                MaxSize: row.MaxSize_inch,
                Rate: row.DailyRate_Percent,
                FeedType: row.FeedType,
                Frequency: row.Frequency
            });
        });

        res.json(Object.values(speciesMap));
    } catch (err) {
        res.status(500).json({ error: "Database Error", message: err.message });
    }
});

// GET: Dashboard Stats (Today's Feeding)
router.get('/dashboard', auth, async (req, res) => {
    try {
        const pool = req.pool;
        const userId = req.user.id;

        // 1. Get today's logs for the user's ponds
        const logsResult = await pool.request()
            .input('uId', sql.Int, userId)
            .query(`
                SELECT L.Quantity_kg, L.TotalCost, L.PondId
                FROM Feed_Logs L
                JOIN Ponds P ON L.PondId = P.PondId
                WHERE P.UserId = @uId 
                AND CONVERT(date, L.FeedDate) = CONVERT(date, GETDATE())
            `);

        let fedTodayKg = 0;
        let costToday = 0;
        const pondsFedSet = new Set();

        logsResult.recordset.forEach(log => {
            fedTodayKg += (log.Quantity_kg || 0);
            costToday += (log.TotalCost || 0);
            pondsFedSet.add(log.PondId);
        });

        // 2. Get active ponds count
        const activeResult = await pool.request()
            .input('uId', sql.Int, userId)
            .query(`
                SELECT COUNT(DISTINCT P.PondId) as ActiveCount
                FROM Ponds P
                JOIN Stocking S ON P.PondId = S.CurrentPondId
                WHERE P.UserId = @uId AND S.Status NOT IN ('Harvested', 'Sold', 'Inactive')
            `);

        const activePonds = activeResult.recordset[0].ActiveCount || 0;

        res.json({
            fedTodayKg: fedTodayKg,
            costToday: costToday,
            pondsFedCount: pondsFedSet.size,
            activePonds: activePonds
        });

    } catch (err) {
        res.status(500).json({ error: "Database Error", message: err.message });
    }
});

router.get('/recommendation/:pondId', auth, async (req, res) => {
    try {
        const { pondId } = req.params;
        const pool = req.pool;

        // Use exact logic that worked in diag_feed.js
        const cleanPondId = String(pondId).trim();

        // 1. Get ALL active batches in this pond.
        const stocks = await pool.request()
            .input('pid', sql.VarChar, cleanPondId)
            .query(`
                SELECT 
                    s.SpeciesId, 
                    fs.Name, 
                    s.Quantity, 
                    s.CurrentSizeInches,
                    s.Status
                FROM Stocking s
                JOIN Species fs ON s.SpeciesId = fs.SpeciesId
                WHERE CAST(s.CurrentPondId AS VARCHAR) = @pid 
                AND s.Status NOT IN ('Harvested', 'Sold', 'Inactive')
            `);

        if (stocks.recordset.length === 0) {
            return res.json({
                pondId: cleanPondId,
                speciesCount: 0,
                recommendations: [],
                debug_info: `No fish found for PondId: ${cleanPondId}. Check if batches are marked as 'Harvested' or 'Inactive'.`
            });
        }

        const groupedRecs = {};

        for (const stock of stocks.recordset) {
            const { SpeciesId, Name, Quantity, CurrentSizeInches } = stock;

            // 2. Match with the Feed Rule using size range
            const ruleResult = await pool.request()
                .input('sid', sql.Int, SpeciesId)
                .input('size', sql.Float, CurrentSizeInches)
                .query(`
                    SELECT * FROM Feed_Rules 
                    WHERE SpeciesID = @sid 
                    AND @size > MinSize_inch AND @size <= MaxSize_inch
                `);

            if (ruleResult.recordset.length > 0) {
                const rule = ruleResult.recordset[0];

                // 3. Calculation Logic 
                const weight_gm = rule.ConditionFactor_K * Math.pow(CurrentSizeInches, 3);
                const biomass_kg = (Quantity * weight_gm) / 1000;
                const feed_kg = biomass_kg * (rule.DailyRate_Percent / 100);

                if (!groupedRecs[SpeciesId]) {
                    groupedRecs[SpeciesId] = {
                        speciesId: SpeciesId,
                        speciesName: Name,
                        sizes: [CurrentSizeInches],
                        totalBiomass_kg: biomass_kg,
                        feedType: rule.FeedType,
                        dailyQty_kg: feed_kg,
                        frequency: rule.Frequency,
                        rate: rule.DailyRate_Percent + "% of BW"
                    };
                } else {
                    groupedRecs[SpeciesId].sizes.push(CurrentSizeInches);
                    groupedRecs[SpeciesId].totalBiomass_kg += biomass_kg;
                    groupedRecs[SpeciesId].dailyQty_kg += feed_kg;
                }
            } else {
                if (!groupedRecs[SpeciesId]) {
                    groupedRecs[SpeciesId] = {
                        speciesId: SpeciesId,
                        speciesName: Name,
                        sizes: [CurrentSizeInches],
                        error: "No feed rule for this size range."
                    };
                }
            }
        }

        const recommendations = Object.values(groupedRecs).map(rec => {
            if (rec.error) {
                return {
                    speciesId: rec.speciesId,
                    speciesName: rec.speciesName,
                    currentSize: Math.max(...rec.sizes) + " inches",
                    error: rec.error
                };
            }

            return {
                speciesId: rec.speciesId,
                speciesName: rec.speciesName,
                // Display the range of sizes if there are multiple batches
                currentSize: rec.sizes.length > 1
                    ? `${Math.min(...rec.sizes)}-${Math.max(...rec.sizes)} inches`
                    : `${rec.sizes[0]} inches`,
                totalBiomass_kg: rec.totalBiomass_kg.toFixed(3),
                recommendation: {
                    feedType: rec.feedType,
                    dailyQty_kg: rec.dailyQty_kg.toFixed(3),
                    frequency: rec.frequency,
                    rate: rec.rate
                }
            };
        });

        res.json({
            pondId: pondId,
            speciesCount: Object.keys(groupedRecs).length,
            recommendations: recommendations
        });
    } catch (err) {
        res.status(500).json({ error: "Database Error", message: err.message });
    }
});

router.post('/log', auth, async (req, res) => {
    try {
        const { pondId, speciesId, feedType, quantity, cost } = req.body;
        const pool = req.pool;
        const uId = req.user.id; // Get user ID to update their specific stock

        // Check available stock first
        const stockCheckResult = await pool.request()
            .input('uid', sql.Int, uId)
            .input('type', sql.NVarChar, feedType)
            .query(`
                SELECT ISNULL(SUM(CurrentQuantity_kg), 0) as TotalAvailable 
                FROM Feed_Stock 
                WHERE UserId = @uid AND FeedType = @type
            `);

        const totalAvailable = stockCheckResult.recordset[0].TotalAvailable;

        if (totalAvailable < parseFloat(quantity)) {
            return res.status(400).json({
                error: "Insufficient Feed Stock",
                message: `You only have ${totalAvailable.toFixed(2)} kg of '${feedType}' in stock, but tried to log ${parseFloat(quantity).toFixed(2)} kg.`
            });
        }

        // Use EXACT schema column names found in DB mapping
        await pool.request()
            .input('pid', sql.NVarChar, pondId)
            .input('sid', sql.Int, speciesId)
            .input('type', sql.NVarChar, feedType)
            .input('qty', sql.Float, quantity)
            .input('cost', sql.Decimal(10, 2), cost)
            .query(`
                INSERT INTO Feed_Logs (PondId, SpeciesID, FeedTypeUsed, Quantity_kg, TotalCost, FeedDate)
                VALUES (@pid, @sid, @type, @qty, @cost, GETDATE())
            `);

        // Deduct from Feed_Stock
        let remainingQtyToDeduct = parseFloat(quantity);
        while (remainingQtyToDeduct > 0) {
            // Find the oldest stock entry that has available quantity
            const stockResult = await pool.request()
                .input('uid', sql.Int, uId)
                .input('type', sql.NVarChar, feedType)
                .query(`
                    SELECT TOP 1 StockId, CurrentQuantity_kg 
                    FROM Feed_Stock
                    WHERE UserId = @uid AND FeedType = @type AND CurrentQuantity_kg > 0
                    ORDER BY PurchaseDate ASC
                `);

            if (stockResult.recordset.length === 0) {
                // This shouldn't happen because of the check above, but as a safety fallback:
                break;
            }

            const stockEntry = stockResult.recordset[0];
            const deductAmount = Math.min(remainingQtyToDeduct, stockEntry.CurrentQuantity_kg);

            await pool.request()
                .input('sid', sql.Int, stockEntry.StockId)
                .input('deduct', sql.Float, deductAmount)
                .query(`
                    UPDATE Feed_Stock 
                    SET CurrentQuantity_kg = CurrentQuantity_kg - @deduct 
                    WHERE StockId = @sid
                `);

            remainingQtyToDeduct -= deductAmount;
        }

        res.json({ success: true, message: "Feeding session recorded and stock updated." });
    } catch (err) {
        res.status(500).json({ error: "Logging Error", message: err.message });
    }
});

// 2. READ: Get full feeding history for a specific pond
router.get('/history/:pondId', auth, async (req, res) => {
    try {
        const { pondId } = req.params;
        const pool = req.pool;

        const result = await pool.request()
            .input('pid', sql.Int, pondId)
            .query(`
                SELECT L.LogId, L.FeedTypeUsed, L.Quantity_kg, L.TotalCost, L.FeedDate, S.Name as SpeciesName
                FROM Feed_Logs L
                JOIN Species S ON L.SpeciesID = S.SpeciesID
                WHERE L.PondId = @pid 
                ORDER BY L.FeedDate DESC
                `);

        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: "Database Error", message: err.message });
    }
});

// 3. UPDATE: Edit a previous feeding log (e.g., correcting quantity or cost)
router.put('/log/:logId', auth, async (req, res) => {
    try {
        const { logId } = req.params;
        const { quantity, cost, feedType } = req.body;
        const pool = req.pool;

        const result = await pool.request()
            .input('lid', sql.Int, logId)
            .input('qty', sql.Float, quantity)
            .input('cost', sql.Decimal(10, 2), cost)
            .input('type', sql.NVarChar, feedType)
            .query(`
                UPDATE Feed_Logs 
                SET Quantity_kg = @qty, TotalCost = @cost, FeedTypeUsed = @type
                WHERE LogId = @lid
                `);

        if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Log entry not found." });

        res.json({ success: true, message: "Feeding log updated successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Database Error", message: err.message });
    }
});

// 4. DELETE: Remove a feeding log
router.delete('/log/:logId', auth, async (req, res) => {
    try {
        const { logId } = req.params;
        const pool = req.pool;

        const result = await pool.request()
            .input('lid', sql.Int, logId)
            .query(`DELETE FROM Feed_Logs WHERE LogId = @lid`);

        if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Log entry not found." });

        res.json({ success: true, message: "Feeding log deleted." });
    } catch (err) {
        res.status(500).json({ error: "Database Error", message: err.message });
    }
});

// --- NEXT FEED SCHEDULE: Per-Species Feeding Frequency from DB ---
// Parses Feed_Rules.Frequency string into numeric interval
const parseFrequencyToInterval = (freqStr) => {
    if (!freqStr) return { feedsPerDay: 2, intervalHours: 12 }; // Safe default
    const lower = freqStr.toLowerCase();

    // Match patterns like "3-4 times daily", "2x daily", "3 times daily"
    const rangeMatch = lower.match(/(\d+)\s*[-–to]\s*(\d+)/);
    const singleMatch = lower.match(/(\d+)\s*(times?|x)/);

    let feedsPerDay;
    if (rangeMatch) {
        // Use the higher number for schedule (e.g., "3-4 times" → 4)
        feedsPerDay = parseInt(rangeMatch[2], 10);
    } else if (singleMatch) {
        feedsPerDay = parseInt(singleMatch[1], 10);
    } else {
        feedsPerDay = 2; // Fallback
    }

    // Distribute feeds across a 16-hour active window (6 AM - 10 PM)
    const activeHours = 16;
    const intervalHours = Math.round((activeHours / feedsPerDay) * 10) / 10;

    return { feedsPerDay, intervalHours };
};

router.get('/schedule', auth, async (req, res) => {
    try {
        const pool = req.pool;
        const userId = req.user.id;

        // Single query: Get all active batches with their feed rules and last feed time
        const result = await pool.request()
            .input('uid', sql.Int, userId)
            .query(`
                SELECT 
                    p.PondId, p.PondName,
                    st.StockId, st.SpeciesId, st.Quantity, st.CurrentSizeInches,
                    sp.Name AS SpeciesName,
                    fr.Frequency,
                    fr.FeedType,
                    fr.DailyRate_Percent,
                    (
                        SELECT TOP 1 fl.FeedDate 
                        FROM Feed_Logs fl 
                        WHERE fl.PondId = p.PondId 
                          AND fl.SpeciesID = st.SpeciesId
                        ORDER BY fl.FeedDate DESC
                    ) AS LastFedAt
                FROM Ponds p
                JOIN Stocking st ON st.CurrentPondId = p.PondId
                JOIN Species sp ON st.SpeciesId = sp.SpeciesId
                LEFT JOIN Feed_Rules fr 
                    ON fr.SpeciesID = st.SpeciesId 
                    AND st.CurrentSizeInches > fr.MinSize_inch 
                    AND st.CurrentSizeInches <= fr.MaxSize_inch
                WHERE p.UserId = @uid 
                  AND st.Status NOT IN ('Harvested', 'Sold', 'Inactive')
                  AND st.Quantity > 0
                ORDER BY p.PondName ASC
            `);

        const schedule = [];
        const now = new Date();

        result.recordset.forEach(row => {
            const { feedsPerDay, intervalHours } = parseFrequencyToInterval(row.Frequency);

            let nextFeedDue = null;
            let minutesUntilDue = null;
            let status = 'no_data';

            if (row.LastFedAt) {
                const lastFed = new Date(row.LastFedAt);
                nextFeedDue = new Date(lastFed.getTime() + intervalHours * 60 * 60 * 1000);
                minutesUntilDue = Math.round((nextFeedDue.getTime() - now.getTime()) / 60000);

                if (minutesUntilDue < 0) {
                    status = 'overdue';
                } else if (minutesUntilDue <= 60) {
                    status = 'due_soon';
                } else {
                    status = 'on_track';
                }
            }

            schedule.push({
                pondId: row.PondId,
                pondName: row.PondName,
                stockId: row.StockId,
                speciesId: row.SpeciesId,
                speciesName: row.SpeciesName,
                quantity: row.Quantity,
                currentSizeInches: row.CurrentSizeInches,
                frequency: row.Frequency || 'Not defined',
                feedType: row.FeedType || null,
                feedsPerDay,
                intervalHours,
                lastFedAt: row.LastFedAt || null,
                nextFeedDue: nextFeedDue ? nextFeedDue.toISOString() : null,
                status,
                minutesUntilDue
            });
        });

        // Sort: overdue first, then due_soon, then on_track, then no_data
        const statusOrder = { overdue: 0, due_soon: 1, on_track: 2, no_data: 3 };
        schedule.sort((a, b) => {
            const orderDiff = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
            if (orderDiff !== 0) return orderDiff;
            return (a.minutesUntilDue ?? 9999) - (b.minutesUntilDue ?? 9999);
        });

        res.json({ schedule });
    } catch (err) {
        console.error("Feed Schedule Error:", err.message);
        res.status(500).json({ error: "Failed to generate feed schedule", message: err.message });
    }
});

module.exports = router;