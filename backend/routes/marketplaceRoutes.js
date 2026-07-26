const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const auth = require('../middleware/auth');

let farmRatingsTableVerified = false;
let marketplaceTablesVerified = false;

const ensureFarmRatingsTable = async (pool) => {
    if (farmRatingsTableVerified) return;

    await pool.request().query(`
        IF OBJECT_ID('FarmRatings', 'U') IS NULL
        BEGIN
            CREATE TABLE [dbo].[FarmRatings](
                [RatingId] INT IDENTITY(1,1) PRIMARY KEY,
                [FarmId] INT NOT NULL,
                [UserId] INT NOT NULL,
                [RatingValue] INT NOT NULL,
                [Comment] NVARCHAR(500) NULL,
                [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE()
            )
        END
    `);

    farmRatingsTableVerified = true;
};

const ensureMarketplaceTables = async (pool) => {
    if (marketplaceTablesVerified) return;

    await ensureFarmRatingsTable(pool);
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

        IF COL_LENGTH('PurchaseRequests', 'FarmerReply') IS NULL
            ALTER TABLE PurchaseRequests ADD FarmerReply NVARCHAR(1000) NULL;
        IF COL_LENGTH('PurchaseRequests', 'ReplyLatitude') IS NULL
            ALTER TABLE PurchaseRequests ADD ReplyLatitude DECIMAL(10,8) NULL;
        IF COL_LENGTH('PurchaseRequests', 'ReplyLongitude') IS NULL
            ALTER TABLE PurchaseRequests ADD ReplyLongitude DECIMAL(11,8) NULL;
        IF COL_LENGTH('PurchaseRequests', 'UpdatedAt') IS NULL
            ALTER TABLE PurchaseRequests ADD UpdatedAt DATETIME NULL;

        IF OBJECT_ID('ConsumerFavorites', 'U') IS NULL
        BEGIN
            CREATE TABLE [dbo].[ConsumerFavorites](
                [FavoriteId] INT IDENTITY(1,1) PRIMARY KEY,
                [ConsumerId] INT NOT NULL,
                [FarmId] INT NOT NULL,
                [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE()
            )
        END;
    `);

    marketplaceTablesVerified = true;
};

/* =======================================================================================
   ALTERNATIVE GET MARKETPLACE ENDPOINT (WITH PHONE NUMBER)
   To use: Comment out the active endpoint below using block comments, and uncomment this block.
======================================================================================= */

// ALTER TABLE Users ADD Phone NVARCHAR(20) NULL;

/*
router.get('/', auth, async (req, res) => {
    const { lat, lng } = req.query;
    try {
        const pool = req.pool;
        let distanceClause = "0 as DistanceKm";
        if (lat && lng) {
            distanceClause = `
                (6371 * acos(cos(radians(@lat)) * cos(radians(F.Latitude)) * 
                cos(radians(F.Longitude) - radians(@lng)) + sin(radians(@lat)) * sin(radians(F.Latitude))
                )) AS DistanceKm
            `;
        }
        const query = `
            SELECT 
                U.FarmName, U.FullName as FarmerName, F.FarmId, F.Latitude, F.Longitude, S.Name as SpeciesName,
                SUM(ST.Quantity) as TotalQuantity, SUM(ISNULL(ST.QuantityForSale, 0)) as QuantityForSale, AVG(ST.CurrentSizeInches) as AvgSizeInches, MAX(ST.StockingDate) as LastStocked,
                MAX(CAST(ISNULL(ST.IsForSale, 0) AS INT)) as IsForSale,
                MAX(U.Phone) as FarmerPhone,
                MAX(U.Email) as FarmerEmail,
                (SELECT ISNULL(AVG(CAST(RatingValue AS FLOAT)), 0) FROM FarmRatings WHERE FarmId = F.FarmId) as AverageRating,
                (SELECT COUNT(RatingId) FROM FarmRatings WHERE FarmId = F.FarmId) as TotalReviews,
                ${distanceClause}
            FROM Stocking ST
            JOIN Ponds P ON ST.CurrentPondId = P.PondId
            JOIN Farm F ON P.FarmId = F.FarmId
            JOIN Users U ON F.UserId = U.UserId
            JOIN Species S ON ST.SpeciesId = S.SpeciesId
            WHERE ST.Quantity > 0 AND ST.Status IN ('Nursery', 'Grown-out')
            ${lat && lng ? 'AND F.Latitude IS NOT NULL AND F.Longitude IS NOT NULL' : ''}
            GROUP BY U.FarmName, U.FullName, F.FarmId, F.Latitude, F.Longitude, S.Name
            ORDER BY ${lat && lng ? 'DistanceKm ASC' : 'U.FarmName ASC'}
        `;
        const request = pool.request();
        if (lat && lng) {
            request.input('lat', sql.Decimal(10, 8), parseFloat(lat));
            request.input('lng', sql.Decimal(11, 8), parseFloat(lng));
        }
        const result = await request.query(query);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error("Marketplace GET error:", err);
        res.status(500).json({ error: "Failed to fetch active stock", details: err.message });
    }
});
*/

// =======================================================================================
// CURRENT ACTIVE GET MARKETPLACE ENDPOINT (WITHOUT PHONE NUMBER)
// =======================================================================================
// GET /api/marketplace
// Fetch all active stock currently in farms, optionally sort by nearest distance
router.get('/', auth, async (req, res) => {
    const { lat, lng, regionId } = req.query;

    try {
        const pool = req.pool;
        await ensureMarketplaceTables(pool);

        let distanceClause = "0 as DistanceKm";
        if (lat && lng) {
            distanceClause = `
                (6371 * acos(
                    cos(radians(@lat)) * cos(radians(F.Latitude)) * 
                    cos(radians(F.Longitude) - radians(@lng)) + 
                    sin(radians(@lat)) * sin(radians(F.Latitude))
                )) AS DistanceKm
            `;
        }

        let regionFilter = '';
        if (regionId) {
            regionFilter = 'AND F.RegionId = @regionId';
        }

        // We group by Farm and Species to show total available stock per Farm
        const query = `
            SELECT 
                U.FarmName,
                U.FullName as FarmerName,
                F.FarmId,
                F.Latitude, 
                F.Longitude,
                R.RegionName,
                S.Name as SpeciesName,
                SUM(ST.Quantity) as TotalQuantity,
                SUM(ISNULL(ST.QuantityForSale, 0)) as QuantityForSale,
                AVG(ST.CurrentSizeInches) as AvgSizeInches,
                MAX(ST.StockingDate) as LastStocked,
                MAX(CAST(ISNULL(ST.IsForSale, 0) AS INT)) as IsForSale,
                AVG(ST.SalePricePerUnit) as SalePricePerUnit,
                NULL as FarmerPhone,
                MAX(U.Email) as FarmerEmail,
                (SELECT ISNULL(AVG(CAST(RatingValue AS FLOAT)), 0) FROM FarmRatings WHERE FarmId = F.FarmId) as AverageRating,
                (SELECT COUNT(RatingId) FROM FarmRatings WHERE FarmId = F.FarmId) as TotalReviews,
                ${distanceClause}
            FROM Stocking ST
            JOIN Ponds P ON ST.CurrentPondId = P.PondId
            JOIN Farm F ON P.FarmId = F.FarmId
            JOIN Users U ON F.UserId = U.UserId
            JOIN Species S ON ST.SpeciesId = S.SpeciesId
            LEFT JOIN Regions R ON F.RegionId = R.RegionId
            WHERE ST.Quantity > 0 AND ST.Status IN ('Nursery', 'Grown-out')
            ${lat && lng ? 'AND F.Latitude IS NOT NULL AND F.Longitude IS NOT NULL' : ''}
            ${regionFilter}
            GROUP BY 
                U.FarmName, 
                U.FullName, 
                F.FarmId,
                F.Latitude, 
                F.Longitude, 
                R.RegionName,
                S.Name
            ORDER BY ${lat && lng ? 'DistanceKm ASC' : 'U.FarmName ASC'}
        `;

        const request = pool.request();
        if (lat && lng) {
            request.input('lat', sql.Decimal(10, 8), parseFloat(lat));
            request.input('lng', sql.Decimal(11, 8), parseFloat(lng));
        }
        if (regionId) {
            request.input('regionId', sql.Int, parseInt(regionId));
        }

        const result = await request.query(query);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error("Marketplace GET error:", err);
        res.status(500).json({ error: "Failed to fetch active stock", details: err.message });
    }
});

// --- GET Regions with active farms ---
router.get('/regions', auth, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request().query(`
            SELECT DISTINCT R.RegionId, R.RegionName, R.Province
            FROM Regions R
            INNER JOIN Farm F ON R.RegionId = F.RegionId
            INNER JOIN Ponds P ON F.FarmId = P.FarmId
            INNER JOIN Stocking ST ON P.PondId = ST.CurrentPondId
            WHERE ST.Quantity > 0 AND ST.Status IN ('Nursery', 'Grown-out')
            ORDER BY R.RegionName ASC
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error("GET Regions error:", err);
        res.status(500).json({ error: "Failed to fetch regions", details: err.message });
    }
});

// --- GET Farm Ratings ---
router.get('/farm/:farmId/ratings', auth, async (req, res) => {
    try {
        const { farmId } = req.params;
        await ensureFarmRatingsTable(req.pool);
        const result = await req.pool.request()
            .input('farmId', sql.Int, farmId)
            .query(`
                SELECT 
                    R.RatingId, R.RatingValue, R.Comment, R.CreatedAt,
                    U.FullName as RetailerName
                FROM FarmRatings R
                JOIN Users U ON R.UserId = U.UserId
                WHERE R.FarmId = @farmId
                ORDER BY R.CreatedAt DESC
            `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error("GET Ratings error:", err);
        res.status(500).json({ error: "Failed to fetch ratings", details: err.message });
    }
});

// --- POST/PUT Rate Farm ---
router.post('/farm/:farmId/rate', auth, async (req, res) => {
    try {
        const { farmId } = req.params;
        const { rating, comment } = req.body;
        const userId = req.user.id;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: "Invalid rating value." });
        }

        const pool = req.pool;
        await ensureFarmRatingsTable(pool);

        // Check if rating exists
        const check = await pool.request()
            .input('farmId', sql.Int, farmId)
            .input('userId', sql.Int, userId)
            .query("SELECT RatingId FROM FarmRatings WHERE FarmId = @farmId AND UserId = @userId");

        if (check.recordset.length > 0) {
            // Update
            await pool.request()
                .input('ratingId', sql.Int, check.recordset[0].RatingId)
                .input('rating', sql.Int, rating)
                .input('comment', sql.NVarChar, comment || '')
                .query(`
                    UPDATE FarmRatings 
                    SET RatingValue = @rating, Comment = @comment, CreatedAt = GETDATE()
                    WHERE RatingId = @ratingId
                `);
            return res.json({ success: true, message: "Rating updated successfully." });
        } else {
            // Insert
            await pool.request()
                .input('farmId', sql.Int, farmId)
                .input('userId', sql.Int, userId)
                .input('rating', sql.Int, rating)
                .input('comment', sql.NVarChar, comment || '')
                .query(`
                    INSERT INTO FarmRatings (FarmId, UserId, RatingValue, Comment) 
                    VALUES (@farmId, @userId, @rating, @comment)
                `);
            return res.json({ success: true, message: "Rating added successfully." });
        }
    } catch (err) {
        console.error("POST Rating error:", err);
        res.status(500).json({ error: "Failed to submit rating", details: err.message });
    }
});

// =======================================================================================
// PURCHASE REQUESTS ENDPOINTS
// =======================================================================================

// --- POST Create Purchase Request (Consumer) ---
router.post('/purchase-request', auth, async (req, res) => {
    try {
        const { farmId, speciesName, requestedQuantity } = req.body;
        const consumerId = req.user.id;

        if (!farmId || !speciesName || !requestedQuantity || requestedQuantity <= 0) {
            return res.status(400).json({ error: "Invalid purchase request data." });
        }

        const pool = req.pool;
        await ensureMarketplaceTables(pool);
        await pool.request()
            .input('consumerId', sql.Int, consumerId)
            .input('farmId', sql.Int, farmId)
            .input('speciesName', sql.NVarChar, speciesName)
            .input('requestedQuantity', sql.Int, requestedQuantity)
            .query(`
                INSERT INTO PurchaseRequests (ConsumerId, FarmId, SpeciesName, RequestedQuantity, Status)
                VALUES (@consumerId, @farmId, @speciesName, @requestedQuantity, 'Pending')
            `);

        res.json({ success: true, message: "Purchase request submitted successfully." });
    } catch (err) {
        console.error("POST Purchase Request error:", err);
        res.status(500).json({ error: "Failed to submit purchase request", details: err.message });
    }
});

// --- GET Consumer Purchase Requests ---
router.get('/purchase-requests/consumer', auth, async (req, res) => {
    try {
        const consumerId = req.user.id;
        const pool = req.pool;
        await ensureMarketplaceTables(pool);
        const result = await pool.request()
            .input('consumerId', sql.Int, consumerId)
            .query(`
                SELECT 
                    PR.RequestId, PR.SpeciesName, PR.RequestedQuantity, PR.Status, PR.FarmerReply, PR.CreatedAt, PR.UpdatedAt,
                    PR.ReplyLatitude, PR.ReplyLongitude,
                    F.FarmId, U.FarmName, U.FullName as FarmerName, U.Email as FarmerEmail
                FROM PurchaseRequests PR
                JOIN Farm F ON PR.FarmId = F.FarmId
                JOIN Users U ON F.UserId = U.UserId
                WHERE PR.ConsumerId = @consumerId
                ORDER BY PR.CreatedAt DESC
            `);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error("GET Consumer Purchase Requests error:", err);
        res.status(500).json({ error: "Failed to fetch purchase requests", details: err.message });
    }
});

// --- GET Farmer Purchase Requests ---
router.get('/purchase-requests/farmer', auth, async (req, res) => {
    try {
        // Need to get the FarmId for this user
        const userId = req.user.id;
        const pool = req.pool;
        await ensureMarketplaceTables(pool);
        
        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT 
                    PR.RequestId, PR.SpeciesName, PR.RequestedQuantity, PR.Status, PR.FarmerReply, PR.CreatedAt, PR.UpdatedAt,
                    PR.ReplyLatitude, PR.ReplyLongitude,
                    U.FullName as ConsumerName, U.Email as ConsumerEmail,
                    F.FarmId, F.FarmName
                FROM PurchaseRequests PR
                JOIN Users U ON PR.ConsumerId = U.UserId
                JOIN Farm F ON PR.FarmId = F.FarmId
                WHERE F.UserId = @userId
                ORDER BY PR.CreatedAt DESC
            `);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error("GET Farmer Purchase Requests error:", err);
        res.status(500).json({ error: "Failed to fetch incoming purchase requests", details: err.message });
    }
});

// --- PUT Reply to Purchase Request (Farmer) ---
router.put('/purchase-requests/:requestId/reply', auth, async (req, res) => {
    try {
        const { requestId } = req.params;
        const { replyMessage, latitude, longitude } = req.body;
        const userId = req.user.id; // ensure only the farmer who owns the farm can reply

        if (!replyMessage) {
            return res.status(400).json({ error: "Reply message is required." });
        }

        const pool = req.pool;
        await ensureMarketplaceTables(pool);
        
        // Verify ownership
        const checkResult = await pool.request()
            .input('requestId', sql.Int, requestId)
            .input('userId', sql.Int, userId)
            .query(`
                SELECT PR.RequestId
                FROM PurchaseRequests PR
                JOIN Farm F ON PR.FarmId = F.FarmId
                WHERE PR.RequestId = @requestId AND F.UserId = @userId
            `);
            
        if (checkResult.recordset.length === 0) {
            return res.status(403).json({ error: "Not authorized to reply to this request." });
        }

        await pool.request()
            .input('requestId', sql.Int, requestId)
            .input('replyMessage', sql.NVarChar, replyMessage)
            .input('latitude', sql.Decimal(10, 8), latitude || null)
            .input('longitude', sql.Decimal(11, 8), longitude || null)
            .query(`
                UPDATE PurchaseRequests
                SET Status = 'Replied', FarmerReply = @replyMessage, ReplyLatitude = @latitude, ReplyLongitude = @longitude, UpdatedAt = GETDATE()
                WHERE RequestId = @requestId
            `);

        res.json({ success: true, message: "Reply sent successfully." });
    } catch (err) {
        console.error("PUT Reply Purchase Request error:", err);
        res.status(500).json({ error: "Failed to send reply", details: err.message });
    }
});

// --- PUT Deny Purchase Request (Farmer) ---
router.put('/purchase-requests/:requestId/deny', auth, async (req, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.user.id; // ensure only the farmer who owns the farm can deny

        const pool = req.pool;
        await ensureMarketplaceTables(pool);
        
        // Verify ownership
        const checkResult = await pool.request()
            .input('requestId', sql.Int, requestId)
            .input('userId', sql.Int, userId)
            .query(`
                SELECT PR.RequestId
                FROM PurchaseRequests PR
                JOIN Farm F ON PR.FarmId = F.FarmId
                WHERE PR.RequestId = @requestId AND F.UserId = @userId
            `);
            
        if (checkResult.recordset.length === 0) {
            return res.status(403).json({ error: "Not authorized to deny this request." });
        }

        await pool.request()
            .input('requestId', sql.Int, requestId)
            .query(`
                UPDATE PurchaseRequests
                SET Status = 'Denied', UpdatedAt = GETDATE()
                WHERE RequestId = @requestId
            `);

        res.json({ success: true, message: "Request denied successfully." });
    } catch (err) {
        console.error("PUT Deny Purchase Request error:", err);
        res.status(500).json({ error: "Failed to deny request", details: err.message });
    }
});

// --- PUT Approve Purchase Request (Farmer) ---
router.put('/purchase-requests/:requestId/approve', auth, async (req, res) => {
    const transaction = new sql.Transaction(req.pool);
    try {
        const { requestId } = req.params;
        const userId = req.user.id;
        const pool = req.pool;
        await ensureMarketplaceTables(pool);

        // 1. Verify farmer ownership & get request details
        const checkResult = await pool.request()
            .input('requestId', sql.Int, requestId)
            .input('userId', sql.Int, userId)
            .query(`
                SELECT PR.RequestId, PR.SpeciesName, PR.RequestedQuantity, PR.Status, PR.FarmId,
                       F.UserId as FarmOwner
                FROM PurchaseRequests PR
                JOIN Farm F ON PR.FarmId = F.FarmId
                WHERE PR.RequestId = @requestId AND F.UserId = @userId
            `);

        if (checkResult.recordset.length === 0) {
            return res.status(403).json({ error: "Not authorized to approve this request." });
        }

        const request = checkResult.recordset[0];
        const currentStatus = String(request.Status || '').trim();

        if (currentStatus === 'Approved') {
            return res.status(400).json({ error: "This request has already been approved." });
        }
        if (currentStatus === 'Denied') {
            return res.status(400).json({ error: "Cannot approve a denied request." });
        }

        const speciesName = request.SpeciesName;
        const requestedQuantity = request.RequestedQuantity;
        const farmId = request.FarmId;

        // 2. Find stocking batches for this species on this farm, get price
        const stockResult = await pool.request()
            .input('farmId', sql.Int, farmId)
            .input('speciesName', sql.NVarChar, speciesName)
            .query(`
                SELECT ST.StockId, ST.Quantity, ST.CurrentPondId,
                       ISNULL(ST.SalePricePerUnit, 0) as SalePricePerUnit,
                       S.SpeciesID
                FROM Stocking ST
                JOIN Ponds P ON ST.CurrentPondId = P.PondId
                JOIN Species S ON ST.SpeciesId = S.SpeciesID
                WHERE P.FarmId = @farmId AND S.Name = @speciesName AND ST.Quantity > 0
                ORDER BY ST.StockingDate ASC
            `);

        if (stockResult.recordset.length === 0) {
            return res.status(400).json({ error: `No stock found for ${speciesName} on this farm.` });
        }

        // Calculate total available
        const totalAvailable = stockResult.recordset.reduce((sum, b) => sum + b.Quantity, 0);
        if (totalAvailable < requestedQuantity) {
            return res.status(400).json({ error: `Not enough stock. Available: ${totalAvailable}, Requested: ${requestedQuantity}` });
        }

        const { finalPrice } = req.body || {};

        let totalRevenue = 0;
        if (finalPrice !== undefined && finalPrice !== null && !isNaN(Number(finalPrice))) {
            totalRevenue = Number(finalPrice);
        } else {
            // Determine price — use the average SalePricePerUnit across batches
            const pricesWithStock = stockResult.recordset.filter(b => b.SalePricePerUnit > 0);
            const pricePerUnit = pricesWithStock.length > 0
                ? pricesWithStock.reduce((sum, b) => sum + Number(b.SalePricePerUnit), 0) / pricesWithStock.length
                : 0;
            totalRevenue = requestedQuantity * pricePerUnit;
        }

        // 3. BEGIN TRANSACTION
        await transaction.begin();

        // 3a. FIFO Deduction from Stocking batches
        let remainingToDeduct = requestedQuantity;
        let pondId = stockResult.recordset[0].CurrentPondId;
        let speciesId = stockResult.recordset[0].SpeciesID;

        for (const batch of stockResult.recordset) {
            if (remainingToDeduct <= 0) break;

            const deduct = Math.min(batch.Quantity, remainingToDeduct);
            remainingToDeduct -= deduct;

            const updateReq = new sql.Request(transaction);
            await updateReq
                .input('stockId', sql.Int, batch.StockId)
                .input('deduct', sql.Int, deduct)
                .query(`UPDATE Stocking SET Quantity = Quantity - @deduct WHERE StockId = @stockId`);

            // Track the last pond used for harvest log
            pondId = batch.CurrentPondId;
        }

        // 3b. Clean up empty batches
        const cleanupReq = new sql.Request(transaction);
        await cleanupReq
            .input('farmId', sql.Int, farmId)
            .input('speciesName', sql.NVarChar, speciesName)
            .query(`
                DELETE ST FROM Stocking ST
                JOIN Ponds P ON ST.CurrentPondId = P.PondId
                JOIN Species S ON ST.SpeciesId = S.SpeciesID
                WHERE P.FarmId = @farmId AND S.Name = @speciesName AND ST.Quantity <= 0
            `);

        // 3c. Insert Harvest Log for revenue tracking (flows into PnL automatically)
        const remainingAfter = totalAvailable - requestedQuantity;
        const harvestReq = new sql.Request(transaction);
        await harvestReq
            .input('pid', sql.Int, pondId)
            .input('sid', sql.Int, speciesId)
            .input('qty', sql.Int, requestedQuantity)
            .input('rem', sql.Int, remainingAfter)
            .input('rev', sql.Decimal(18, 2), totalRevenue)
            .query(`
                INSERT INTO Harvest_Logs (PondId, SpeciesId, Quantity_pieces, TotalWeight_kg, Remaining_Pieces, Note, Revenue_PKR)
                VALUES (@pid, @sid, @qty, 0, @rem, 'Marketplace Sale (Approved Purchase Request)', @rev)
            `);

        // 3d. Update PurchaseRequest status to Approved
        const statusReq = new sql.Request(transaction);
        await statusReq
            .input('requestId', sql.Int, requestId)
            .query(`
                UPDATE PurchaseRequests
                SET Status = 'Approved', UpdatedAt = GETDATE()
                WHERE RequestId = @requestId
            `);

        await transaction.commit();

        try {
            await pool.request()
                .input('pid', sql.Int, pondId)
                .query(`
                    UPDATE Ponds
                    SET NeedsMaintenance = 1
                    WHERE PondId = @pid
                    AND ISNULL((SELECT SUM(Quantity) FROM Stocking WHERE CurrentPondId = @pid), 0) <= 0
                `);
        } catch (maintErr) {
            console.warn('Maintenance flag skipped after marketplace approve:', maintErr.message);
        }

        const updatedResult = await pool.request()
            .input('requestId', sql.Int, requestId)
            .query(`
                SELECT 
                    PR.RequestId, PR.SpeciesName, PR.RequestedQuantity, PR.Status, PR.FarmerReply,
                    PR.CreatedAt, PR.UpdatedAt, PR.ReplyLatitude, PR.ReplyLongitude,
                    U.FullName as ConsumerName, U.Email as ConsumerEmail,
                    F.FarmId, F.FarmName
                FROM PurchaseRequests PR
                JOIN Users U ON PR.ConsumerId = U.UserId
                JOIN Farm F ON PR.FarmId = F.FarmId
                WHERE PR.RequestId = @requestId
            `);

        res.json({
            success: true,
            message: `Approved! ${requestedQuantity} ${speciesName} sold for PKR ${Math.round(totalRevenue).toLocaleString()}.`,
            totalRevenue: Math.round(totalRevenue),
            quantitySold: requestedQuantity,
            data: updatedResult.recordset[0] || { RequestId: Number(requestId), Status: 'Approved' },
        });

    } catch (err) {
        try { await transaction.rollback(); } catch (e) { /* already rolled back */ }
        console.error("PUT Approve Purchase Request error:", err);
        res.status(500).json({ error: "Failed to approve request", details: err.message });
    }
});

// --- DELETE Purchase Request (Consumer or Farmer) ---
router.delete('/purchase-requests/:requestId', auth, async (req, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.user.id;

        const pool = req.pool;
        await ensureMarketplaceTables(pool);
        
        // Verify ownership: either the consumer who made it, or the farmer who owns the farm
        const checkResult = await pool.request()
            .input('requestId', sql.Int, requestId)
            .input('userId', sql.Int, userId)
            .query(`
                SELECT PR.RequestId
                FROM PurchaseRequests PR
                LEFT JOIN Farm F ON PR.FarmId = F.FarmId
                WHERE PR.RequestId = @requestId AND (PR.ConsumerId = @userId OR F.UserId = @userId)
            `);
            
        if (checkResult.recordset.length === 0) {
            return res.status(403).json({ error: "Not authorized to delete this request." });
        }

        await pool.request()
            .input('requestId', sql.Int, requestId)
            .query(`DELETE FROM PurchaseRequests WHERE RequestId = @requestId`);

        res.json({ success: true, message: "Request deleted successfully." });
    } catch (err) {
        console.error("DELETE Purchase Request error:", err);
        res.status(500).json({ error: "Failed to delete request", details: err.message });
    }
});

// =======================================================================================
// FAVORITES ENDPOINTS
// =======================================================================================

// --- GET Consumer Favorites ---
router.get('/favorites', auth, async (req, res) => {
    try {
        const consumerId = req.user.id;
        const pool = req.pool;
        await ensureMarketplaceTables(pool);
        
        const result = await pool.request()
            .input('consumerId', sql.Int, consumerId)
            .query(`
                SELECT FarmId FROM ConsumerFavorites WHERE ConsumerId = @consumerId
            `);
            
        const favorites = result.recordset.map(row => row.FarmId);
        res.json({ success: true, data: favorites });
    } catch (err) {
        console.error("GET Favorites error:", err);
        res.status(500).json({ error: "Failed to fetch favorites", details: err.message });
    }
});

// --- POST Toggle Favorite ---
router.post('/favorites/toggle', auth, async (req, res) => {
    try {
        const { farmId } = req.body;
        const consumerId = req.user.id;
        const pool = req.pool;
        await ensureMarketplaceTables(pool);

        if (!farmId) {
            return res.status(400).json({ error: "Farm ID is required." });
        }

        // Check if favorite exists
        const checkResult = await pool.request()
            .input('consumerId', sql.Int, consumerId)
            .input('farmId', sql.Int, farmId)
            .query(`
                SELECT FavoriteId FROM ConsumerFavorites WHERE ConsumerId = @consumerId AND FarmId = @farmId
            `);

        let isFavorite = false;
        if (checkResult.recordset.length > 0) {
            // Remove favorite
            await pool.request()
                .input('favoriteId', sql.Int, checkResult.recordset[0].FavoriteId)
                .query(`DELETE FROM ConsumerFavorites WHERE FavoriteId = @favoriteId`);
            isFavorite = false;
        } else {
            // Add favorite
            await pool.request()
                .input('consumerId', sql.Int, consumerId)
                .input('farmId', sql.Int, farmId)
                .query(`
                    INSERT INTO ConsumerFavorites (ConsumerId, FarmId)
                    VALUES (@consumerId, @farmId)
                `);
            isFavorite = true;
        }

        res.json({ success: true, isFavorite, message: "Favorite toggled successfully." });
    } catch (err) {
        console.error("POST Toggle Favorite error:", err);
        res.status(500).json({ error: "Failed to toggle favorite", details: err.message });
    }
});

module.exports = router;
