const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const auth = require('../middleware/auth');

let reportsSchemaVerified = false;

const ensureReportsSchema = async (pool) => {
    if (reportsSchemaVerified) return;

    await pool.request().query(`
        IF OBJECT_ID('PurchaseRequests', 'U') IS NULL
        BEGIN
            CREATE TABLE [dbo].[PurchaseRequests](
                [RequestId] INT IDENTITY(1,1) PRIMARY KEY,
                [ConsumerId] INT NOT NULL,
                [FarmId] INT NOT NULL,
                [SpeciesName] NVARCHAR(100) NOT NULL,
                [RequestedQuantity] INT NOT NULL,
                [Status] NVARCHAR(30) NOT NULL DEFAULT 'Pending',
                [FarmerReply] NVARCHAR(1000) NULL,
                [ReplyLatitude] DECIMAL(10,8) NULL,
                [ReplyLongitude] DECIMAL(11,8) NULL,
                [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
                [UpdatedAt] DATETIME NULL
            )
        END;

        IF OBJECT_ID('Treatment_Stock', 'U') IS NULL
        BEGIN
            CREATE TABLE [dbo].[Treatment_Stock](
                [StockId] INT IDENTITY(1,1) PRIMARY KEY,
                [UserId] INT NOT NULL,
                [MedicineName] NVARCHAR(100) NOT NULL,
                [Category] NVARCHAR(50) NOT NULL DEFAULT 'Chemical',
                [InitialQuantity] FLOAT NOT NULL,
                [CurrentQuantity] FLOAT NOT NULL,
                [Unit] NVARCHAR(20) NOT NULL DEFAULT 'ml',
                [CostPerUnit] DECIMAL(10,2) NOT NULL DEFAULT 0,
                [TotalCost] DECIMAL(18,2) NOT NULL DEFAULT 0,
                [Supplier] NVARCHAR(100) NULL,
                [ExpiryDate] DATE NULL,
                [PurchaseDate] DATE NOT NULL DEFAULT GETDATE(),
                [Notes] NVARCHAR(500) NULL
            )
        END;
    `);

    reportsSchemaVerified = true;
};

const pushSafeQuery = (queries, promiseFactory) => {
    queries.push(
        promiseFactory().catch(err => {
            console.warn('Reports query skipped:', err.message);
            return [];
        }),
    );
};

router.get('/', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { timeframe = 'all-time', startDate, endDate } = req.query; // 'weekly', 'monthly', 'yearly', 'all-time', 'custom'
        
        const pool = req.pool;
        await ensureReportsSchema(pool);

        // Determine date filter string
        // Determine date filter helper
        let dateParam = null;
        let endDateParam = null;
        const now = new Date();
        if (timeframe === 'weekly') {
            const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            dateParam = lastWeek.toISOString();
        } else if (timeframe === 'monthly') {
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
            dateParam = lastMonth.toISOString();
        } else if (timeframe === 'yearly') {
            const lastYear = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
            dateParam = lastYear.toISOString();
        } else if (timeframe === 'custom') {
            if (startDate && endDate) {
                dateParam = new Date(startDate).toISOString();
                const end = new Date(endDate);
                end.setDate(end.getDate() + 1);
                endDateParam = end.toISOString();
            }
        }

        const getDateFilter = (col) => {
            if (!dateParam) return '';
            if (endDateParam) return ` AND ${col} >= @startDate AND ${col} < @endDate`;
            return ` AND ${col} >= @startDate`;
        };

        // Get Farm ID for this user
        const farmCheck = await pool.request()
            .input('userId', sql.Int, userId)
            .query("SELECT FarmId FROM Farm WHERE UserId = @userId");
            
        if (farmCheck.recordset.length === 0) {
            return res.json({ success: true, activities: [], summary: {} });
        }
        
        const farmId = farmCheck.recordset[0].FarmId;

        // Run all queries in parallel
        const queries = [];
        
        // Helper to prepare request
        const getReq = () => {
            const r = pool.request().input('farmId', sql.Int, farmId).input('userId', sql.Int, userId);
            if (dateParam) r.input('startDate', sql.DateTime, dateParam);
            if (endDateParam) r.input('endDate', sql.DateTime, endDateParam);
            return r;
        };

        // 1. Ponds Created
        queries.push(getReq().query(`
            SELECT PondName as name, Size as size, CultivationType as type, CreatedAt as date
            FROM Ponds WHERE FarmId = @farmId ${getDateFilter('CreatedAt')}
        `).then(r => r.recordset.map(row => ({
            type: 'pond_created',
            date: row.date,
            title: `Created Pond: ${row.name}`,
            description: `${row.size} Acres | ${row.type}`,
            color: 'blue',
            pondName: row.name
        }))));

        // 2. Stocking
        pushSafeQuery(queries, () => getReq().query(`
            SELECT ST.Quantity, ST.StockingDate, S.Name as species, P.PondName, ST.TargetSizeInches,
                   ISNULL(ST.Quantity * ST.PricePerPiece, 0) as TotalInvestment
            FROM Stocking ST
            JOIN Species S ON ST.SpeciesId = S.SpeciesID
            JOIN Ponds P ON ST.CurrentPondId = P.PondId
            WHERE P.FarmId = @farmId ${getDateFilter('ST.StockingDate')}
        `).then(r => r.recordset.map(row => ({
            type: 'stocking',
            date: row.StockingDate,
            title: `Stocked ${row.species} in ${row.PondName}`,
            description: `Quantity: ${row.Quantity.toLocaleString()} | Target: ${row.TargetSizeInches}" | Cost: ₨${row.TotalInvestment}`,
            cost: row.TotalInvestment,
            color: 'indigo',
            pondName: row.PondName
        }))));

        // 3. Feed Logs
        pushSafeQuery(queries, () => getReq().query(`
            SELECT F.FeedTypeUsed, F.Quantity_kg, F.TotalCost, F.FeedDate, P.PondName, S.Name as species
            FROM Feed_Logs F
            JOIN Ponds P ON F.PondId = P.PondId
            LEFT JOIN Species S ON F.SpeciesID = S.SpeciesID
            WHERE P.FarmId = @farmId ${getDateFilter('F.FeedDate')}
        `).then(r => r.recordset.map(row => ({
            type: 'feed',
            date: row.FeedDate,
            title: `Fed ${row.PondName} (${row.species || 'Mixed'})`,
            description: `${row.Quantity_kg}kg of ${row.FeedTypeUsed} | Cost: ₨${row.TotalCost}`,
            cost: row.TotalCost,
            color: 'amber',
            pondName: row.PondName
        }))));

        // 4. Fertilizers Logs
        pushSafeQuery(queries, () => getReq().query(`
            SELECT FL.FertilizerType, FL.ProductName, FL.QuantityApplied, FL.TotalCost, FL.ApplicationDate, P.PondName
            FROM Fertilizers_Logs FL
            JOIN Ponds P ON FL.PondId = P.PondId
            WHERE P.FarmId = @farmId ${getDateFilter('FL.ApplicationDate')}
        `).then(r => r.recordset.map(row => ({
            type: 'fertilizer',
            date: row.ApplicationDate,
            title: `Fertilized ${row.PondName}`,
            description: `${row.QuantityApplied}kg of ${row.ProductName} (${row.FertilizerType}) | Cost: ₨${row.TotalCost}`,
            cost: row.TotalCost,
            color: 'lime',
            pondName: row.PondName
        }))));

        // 5. Mortality Logs
        pushSafeQuery(queries, () => getReq().query(`
            SELECT M.Quantity_dead, M.LogDate, P.PondName, S.Name as species
            FROM Mortality_Logs M
            JOIN Ponds P ON M.PondId = P.PondId
            JOIN Species S ON M.SpeciesId = S.SpeciesID
            WHERE P.FarmId = @farmId ${getDateFilter('M.LogDate')}
        `).then(r => r.recordset.map(row => ({
            type: 'mortality',
            date: row.LogDate,
            title: `Mortality in ${row.PondName}`,
            description: `Lost ${row.Quantity_dead.toLocaleString()} ${row.species}`,
            color: 'red',
            pondName: row.PondName
        }))));

        // 6. Harvest Logs
        pushSafeQuery(queries, () => getReq().query(`
            SELECT H.Quantity_pieces, H.TotalWeight_kg, H.Revenue_PKR, H.HarvestDate, P.PondName, S.Name as species
            FROM Harvest_Logs H
            JOIN Ponds P ON H.PondId = P.PondId
            JOIN Species S ON H.SpeciesId = S.SpeciesID
            WHERE P.FarmId = @farmId ${getDateFilter('H.HarvestDate')}
        `).then(r => r.recordset.map(row => ({
            type: 'harvest',
            date: row.HarvestDate,
            title: `Harvested ${row.PondName}`,
            description: `${row.Quantity_pieces.toLocaleString()} ${row.species} (${row.TotalWeight_kg}kg) | Revenue: ₨${row.Revenue_PKR}`,
            revenue: row.Revenue_PKR,
            color: 'emerald',
            pondName: row.PondName
        }))));

        // 7. General Expense Logs
        pushSafeQuery(queries, () => getReq().query(`
            SELECT E.Category, E.Amount, E.Description, E.ExpenseDate, P.PondName
            FROM Expense_log E
            LEFT JOIN Ponds P ON E.PondId = P.PondId
            WHERE E.UserId = @userId ${getDateFilter('E.ExpenseDate')}
        `).then(r => r.recordset.map(row => ({
            type: 'expense',
            date: row.ExpenseDate,
            title: `Expense: ${row.Category}${row.PondName ? ' (' + row.PondName + ')' : ''}`,
            description: `${row.Description} | Cost: ₨${row.Amount}`,
            cost: row.Amount,
            color: 'orange',
            pondName: row.PondName || null
        }))));

        // 8. General Sales Logs
        pushSafeQuery(queries, () => getReq().query(`
            SELECT SpeciesName, QuantitySold, TotalRevenue, SaleDate, Notes
            FROM Sales_Log
            WHERE UserId = @userId ${getDateFilter('SaleDate')}
        `).then(r => r.recordset.map(row => ({
            type: 'sale',
            date: row.SaleDate,
            title: `Direct Sale: ${row.SpeciesName}`,
            description: `Sold ${row.QuantitySold.toLocaleString()} pieces | Revenue: ₨${row.TotalRevenue} | ${row.Notes || ''}`,
            revenue: row.TotalRevenue,
            color: 'green'
        }))));

        // 9. Water Quality Logs
        pushSafeQuery(queries, () => getReq().query(`
            SELECT W.recorded_at, W.current_temp, W.current_ph, W.current_do, W.current_ammonia, P.PondName
            FROM water_quality_logs W
            JOIN Ponds P ON W.PondId = P.PondId
            WHERE P.FarmId = @farmId ${getDateFilter('W.recorded_at')}
        `).then(r => r.recordset.map(row => ({
            type: 'water',
            date: row.recorded_at,
            title: `Water Check in ${row.PondName}`,
            description: `Temp: ${row.current_temp}°C | pH: ${row.current_ph} | DO: ${row.current_do}mg/L | NH3: ${row.current_ammonia}mg/L`,
            color: 'cyan',
            pondName: row.PondName
        }))));

        // 10. Disease Outbreaks
        pushSafeQuery(queries, () => getReq().query(`
            SELECT D.NotedAt, D.Status, D.Severity, D.EstimatedAffectedCount, D.CustomDiseaseName, P.PondName, DC.DiseaseName
            FROM Disease_Outbreaks D
            JOIN Ponds P ON D.PondId = P.PondId
            LEFT JOIN Disease_Catalog DC ON D.DiseaseId = DC.DiseaseId
            WHERE P.FarmId = @farmId ${getDateFilter('D.NotedAt')}
        `).then(r => r.recordset.map(row => ({
            type: 'disease',
            date: row.NotedAt,
            title: `Disease Outbreak in ${row.PondName}`,
            description: `${row.DiseaseName || row.CustomDiseaseName} | Severity: ${row.Severity} | Affected: ${row.EstimatedAffectedCount || 'Unknown'}`,
            color: 'rose',
            pondName: row.PondName
        }))));

        // 11. Treatment Logs
        pushSafeQuery(queries, () => getReq().query(`
            SELECT T.TreatmentType, T.Dosage, T.Cost, T.AppliedAt, T.Outcome, D.CustomDiseaseName, DC.DiseaseName
            FROM Treatment_Logs T
            JOIN Disease_Outbreaks D ON T.OutbreakId = D.OutbreakId
            LEFT JOIN Disease_Catalog DC ON D.DiseaseId = DC.DiseaseId
            WHERE T.UserId = @userId ${getDateFilter('T.AppliedAt')}
        `).then(r => r.recordset.map(row => ({
            type: 'treatment',
            date: row.AppliedAt,
            title: `Treated ${row.DiseaseName || row.CustomDiseaseName}`,
            description: `${row.TreatmentType} (${row.Dosage}) | Cost: ₨${row.Cost} | Outcome: ${row.Outcome || 'Pending'}`,
            cost: row.Cost,
            color: 'purple'
        }))));

        // 12. Feed Stock Purchases
        pushSafeQuery(queries, () => getReq().query(`
            SELECT FeedType, InitialQuantity_kg, TotalCost, PurchaseDate, Supplier
            FROM Feed_Stock
            WHERE UserId = @userId ${getDateFilter('PurchaseDate')}
        `).then(r => r.recordset.map(row => ({
            type: 'stock_purchase',
            date: row.PurchaseDate,
            title: `Purchased Feed Stock`,
            description: `${row.InitialQuantity_kg}kg of ${row.FeedType} from ${row.Supplier || 'Unknown'} | Cost: ₨${row.TotalCost}`,
            cost: row.TotalCost,
            color: 'slate'
        }))));

        // 13. Fertilizer Stock Purchases
        pushSafeQuery(queries, () => getReq().query(`
            SELECT ProductName, Category, InitialQuantity_kg, TotalCost, PurchaseDate, Supplier
            FROM Fertilizer_Stock
            WHERE UserId = @userId ${getDateFilter('PurchaseDate')}
        `).then(r => r.recordset.map(row => ({
            type: 'stock_purchase',
            date: row.PurchaseDate,
            title: `Purchased Fertilizer Stock`,
            description: `${row.InitialQuantity_kg}kg of ${row.ProductName} (${row.Category}) from ${row.Supplier || 'Unknown'} | Cost: ₨${row.TotalCost}`,
            cost: row.TotalCost,
            color: 'slate'
        }))));

        // 14. Treatment/Medicine Stock Purchases
        pushSafeQuery(queries, () => getReq().query(`
            SELECT MedicineName, Category, InitialQuantity, Unit, TotalCost, PurchaseDate, Supplier
            FROM Treatment_Stock
            WHERE UserId = @userId ${getDateFilter('PurchaseDate')}
        `).then(r => r.recordset.map(row => ({
            type: 'stock_purchase',
            date: row.PurchaseDate,
            title: `Purchased Medicine/Treatment Stock`,
            description: `${row.InitialQuantity}${row.Unit} of ${row.MedicineName} (${row.Category || 'Treatment'}) from ${row.Supplier || 'Unknown'} | Cost: ₨${row.TotalCost}`,
            cost: row.TotalCost,
            color: 'slate'
        }))));

        // 15. Marketplace Sales (Farmer selling to Consumers)
        pushSafeQuery(queries, () => getReq().query(`
            SELECT PR.SpeciesName, PR.RequestedQuantity, PR.UpdatedAt, U.FullName as ConsumerName
            FROM PurchaseRequests PR
            LEFT JOIN Users U ON PR.ConsumerId = U.UserId
            WHERE PR.FarmId = @farmId AND PR.Status = 'Approved' ${getDateFilter('PR.UpdatedAt')}
        `).then(r => r.recordset.map(row => ({
            type: 'marketplace_sale',
            date: row.UpdatedAt,
            title: `Marketplace Sale`,
            description: `Sold ${row.RequestedQuantity.toLocaleString()} pieces of ${row.SpeciesName} to ${row.ConsumerName || 'a consumer'}`,
            color: 'green'
        }))));

        // 16. Marketplace Purchases (Farmer buying from other Farms)
        pushSafeQuery(queries, () => getReq().query(`
            SELECT PR.SpeciesName, PR.RequestedQuantity, PR.UpdatedAt, F.FarmName
            FROM PurchaseRequests PR
            LEFT JOIN Farm F ON PR.FarmId = F.FarmId
            WHERE PR.ConsumerId = @userId AND PR.Status = 'Approved' ${getDateFilter('PR.UpdatedAt')}
        `).then(r => r.recordset.map(row => ({
            type: 'marketplace_purchase',
            date: row.UpdatedAt,
            title: `Marketplace Purchase`,
            description: `Bought ${row.RequestedQuantity.toLocaleString()} pieces of ${row.SpeciesName} from ${row.FarmName || 'a farm'}`,
            color: 'slate'
        }))));

        const results = await Promise.all(queries);
        
        // Flatten and sort
        const activities = results.flat().sort((a, b) => new Date(b.date) - new Date(a.date));

        // Compute summaries
        let totalRevenue = 0;
        let totalExpense = 0;
        let eventCounts = {};

        activities.forEach(act => {
            if (act.revenue) totalRevenue += Number(act.revenue) || 0;
            if (act.cost) totalExpense += Number(act.cost) || 0;
            eventCounts[act.type] = (eventCounts[act.type] || 0) + 1;
        });

        res.json({
            success: true,
            activities,
            summary: {
                totalRevenue,
                totalExpense,
                netProfit: totalRevenue - totalExpense,
                eventCounts,
                totalEvents: activities.length
            }
        });

    } catch (err) {
        console.error("GET Reports error:", err);
        res.status(500).json({ error: "Failed to generate reports", details: err.message });
    }
});

// ============================================
// ROI REPORT: Per-Harvest Profitability Report
// ============================================
router.get('/roi', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { timeframe = 'all-time', startDate, endDate } = req.query;
        const pool = req.pool;
        await ensureReportsSchema(pool);

        // Date filter logic (same as main reports)
        let dateParam = null;
        let endDateParam = null;
        const now = new Date();
        if (timeframe === 'weekly') {
            dateParam = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (timeframe === 'monthly') {
            dateParam = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();
        } else if (timeframe === 'yearly') {
            dateParam = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString();
        } else if (timeframe === 'custom') {
            if (startDate && endDate) {
                dateParam = new Date(startDate).toISOString();
                const end = new Date(endDate);
                end.setDate(end.getDate() + 1);
                endDateParam = end.toISOString();
            }
        }

        let dateFilter = '';
        if (dateParam && endDateParam) {
            dateFilter = ' AND H.HarvestDate >= @startDate AND H.HarvestDate < @endDate';
        } else if (dateParam) {
            dateFilter = ' AND H.HarvestDate >= @startDate';
        }

        // Get Farm ID
        const farmCheck = await pool.request()
            .input('userId', sql.Int, userId)
            .query("SELECT FarmId FROM Farm WHERE UserId = @userId");

        if (farmCheck.recordset.length === 0) {
            return res.json({ success: true, harvests: [], summary: {} });
        }

        const farmId = farmCheck.recordset[0].FarmId;

        // Fetch all harvests with pond/species info
        const harvestReq = pool.request()
            .input('farmId', sql.Int, farmId)
            .input('userId', sql.Int, userId);
        if (dateParam) harvestReq.input('startDate', sql.DateTime, dateParam);
        if (endDateParam) harvestReq.input('endDate', sql.DateTime, endDateParam);

        const harvestResult = await harvestReq.query(`
            SELECT 
                H.HarvestId,
                H.PondId,
                H.SpeciesId,
                H.Quantity_pieces,
                H.TotalWeight_kg,
                H.Remaining_Pieces,
                H.Revenue_PKR,
                H.HarvestDate,
                P.PondName,
                S.Name as SpeciesName
            FROM Harvest_Logs H
            JOIN Ponds P ON H.PondId = P.PondId
            JOIN Species S ON H.SpeciesId = S.SpeciesID
            WHERE P.FarmId = @farmId ${dateFilter}
            ORDER BY H.HarvestDate DESC
        `);

        // Fetch pond-level expense breakdowns (only for ponds that have harvests)
        const pondIds = [...new Set(harvestResult.recordset.map(h => h.PondId))];
        const pondExpenses = {};

        for (const pid of pondIds) {
            const expResult = await pool.request()
                .input('pid', sql.Int, pid)
                .input('uid', sql.Int, userId)
                .query(`
                    SELECT Category, ISNULL(SUM(Amount), 0) as Total
                    FROM Expense_log
                    WHERE PondId = @pid AND UserId = @uid
                    GROUP BY Category
                `);

            let fingerlingCost = 0, feedCost = 0, fertilizerCost = 0, otherCost = 0;
            for (const row of expResult.recordset) {
                const cat = (row.Category || '').toLowerCase();
                if (cat.includes('fingerling') || cat.includes('stocking') || cat.includes('fry')) {
                    fingerlingCost += row.Total;
                } else if (cat.includes('feed') || cat.includes('food')) {
                    feedCost += row.Total;
                } else if (cat.includes('fertilizer') || cat.includes('lime') || cat.includes('manure')) {
                    fertilizerCost += row.Total;
                } else {
                    otherCost += row.Total;
                }
            }
            pondExpenses[pid] = {
                fingerlingCost: Number(fingerlingCost),
                feedCost: Number(feedCost),
                fertilizerCost: Number(fertilizerCost),
                otherCost: Number(otherCost),
                totalExpenses: Number(fingerlingCost) + Number(feedCost) + Number(fertilizerCost) + Number(otherCost)
            };
        }

        // Build ROI records with proportional allocation
        let totalRevenue = 0, totalAllocatedExpenses = 0, totalProfit = 0;
        let totalFishHarvested = 0, totalWeightHarvested = 0;

        const harvests = harvestResult.recordset.map(h => {
            const totalStockAtHarvest = h.Quantity_pieces + (h.Remaining_Pieces || 0);
            const proportion = totalStockAtHarvest > 0 ? h.Quantity_pieces / totalStockAtHarvest : 1;
            const pondExp = pondExpenses[h.PondId] || { fingerlingCost: 0, feedCost: 0, fertilizerCost: 0, otherCost: 0, totalExpenses: 0 };

            const allocatedFingerling = Math.round(pondExp.fingerlingCost * proportion);
            const allocatedFeed = Math.round(pondExp.feedCost * proportion);
            const allocatedFertilizer = Math.round(pondExp.fertilizerCost * proportion);
            const allocatedOther = Math.round(pondExp.otherCost * proportion);
            const allocatedTotal = allocatedFingerling + allocatedFeed + allocatedFertilizer + allocatedOther;

            const revenue = Number(h.Revenue_PKR) || 0;
            const profit = revenue - allocatedTotal;
            const roiPercent = allocatedTotal > 0 ? ((profit / allocatedTotal) * 100) : 0;

            totalRevenue += revenue;
            totalAllocatedExpenses += allocatedTotal;
            totalProfit += profit;
            totalFishHarvested += h.Quantity_pieces;
            totalWeightHarvested += Number(h.TotalWeight_kg) || 0;

            return {
                harvestId: h.HarvestId,
                pondId: h.PondId,
                pondName: h.PondName,
                speciesName: h.SpeciesName,
                quantity: h.Quantity_pieces,
                weightKg: Number(h.TotalWeight_kg) || 0,
                revenue,
                harvestDate: h.HarvestDate,
                proportion: Math.round(proportion * 100),
                expenses: {
                    fingerling: allocatedFingerling,
                    feed: allocatedFeed,
                    fertilizer: allocatedFertilizer,
                    other: allocatedOther,
                    total: allocatedTotal
                },
                profit,
                roiPercent: Number(roiPercent.toFixed(1)),
                isProfitable: profit >= 0
            };
        });

        const overallROI = totalAllocatedExpenses > 0 ? ((totalProfit / totalAllocatedExpenses) * 100).toFixed(1) : 0;

        res.json({
            success: true,
            harvests,
            summary: {
                totalHarvests: harvests.length,
                totalFishHarvested,
                totalWeightHarvested: Number(totalWeightHarvested.toFixed(2)),
                totalRevenue,
                totalAllocatedExpenses,
                totalProfit,
                overallROI: Number(overallROI),
                profitableHarvests: harvests.filter(h => h.isProfitable).length,
                unprofitableHarvests: harvests.filter(h => !h.isProfitable).length
            }
        });

    } catch (err) {
        console.error("GET ROI Report error:", err);
        res.status(500).json({ error: "Failed to generate ROI report", details: err.message });
    }
});

module.exports = router;
