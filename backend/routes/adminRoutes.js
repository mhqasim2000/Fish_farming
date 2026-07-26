const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const auth = require('../middleware/auth');

// Middleware: Ensure the caller is an admin
const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access denied. Admin only." });
    }
    next();
};

// GET: All users with farm info
router.get('/users', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;

        // Ensure IsActive column exists
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'IsActive')
            ALTER TABLE Users ADD IsActive BIT DEFAULT 1
        `);

        const result = await pool.request().query(`
            SELECT 
                U.UserId,
                U.FullName,
                U.Email,
                U.FarmName,
                U.Province,
                U.District,
                ISNULL(U.Role, 'user') as Role,
                U.CreatedAt,
                ISNULL(U.IsActive, 1) as IsActive,
                F.FarmId,
                F.TotalArea,
                F.PondCount,
                F.TotalStock
            FROM Users U
            OUTER APPLY (
                SELECT TOP 1 
                    FM.FarmId,
                    FM.TotalAreaAcres as TotalArea,
                    (SELECT COUNT(*) FROM Ponds WHERE FarmId = FM.FarmId) as PondCount,
                    (SELECT ISNULL(SUM(ST.Quantity), 0) FROM Stocking ST 
                     JOIN Ponds P ON ST.CurrentPondId = P.PondId 
                     WHERE P.FarmId = FM.FarmId) as TotalStock
                FROM Farm FM WHERE FM.UserId = U.UserId
            ) F
            ORDER BY U.CreatedAt DESC
        `);

        res.json({ success: true, users: result.recordset });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users", message: err.message });
    }
});

// GET: All farms for Farm Overview
router.get('/farms', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request().query(`
            SELECT 
                F.FarmId,
                F.TotalAreaAcres,
                F.SetupDate,
                U.FullName as OwnerName,
                U.FarmName,
                U.Email,
                R.RegionName,
                (SELECT COUNT(*) FROM Ponds WHERE FarmId = F.FarmId) as PondCount,
                (SELECT ISNULL(SUM(ST.Quantity), 0) FROM Stocking ST 
                 JOIN Ponds P ON ST.CurrentPondId = P.PondId 
                 WHERE P.FarmId = F.FarmId) as TotalStock,
                (SELECT ISNULL(SUM(CAST(Size AS FLOAT)), 0) FROM Ponds WHERE FarmId = F.FarmId) as UsedArea
            FROM Farm F
            JOIN Users U ON F.UserId = U.UserId
            LEFT JOIN Regions R ON F.RegionId = R.RegionId
            ORDER BY F.SetupDate DESC
        `);

        // Calculate global platform stats
        const farms = result.recordset;
        const stats = {
            totalFarms: farms.length,
            totalAcresAllocated: farms.reduce((sum, f) => sum + (f.TotalAreaAcres || 0), 0),
            totalAcresUsed: farms.reduce((sum, f) => sum + (f.UsedArea || 0), 0),
            totalPonds: farms.reduce((sum, f) => sum + (f.PondCount || 0), 0),
            totalFish: farms.reduce((sum, f) => sum + (f.TotalStock || 0), 0)
        };

        res.json({ success: true, stats, farms });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch farms", message: err.message });
    }
});

// GET: All active marketplace listings for moderation
router.get('/marketplace', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request().query(`
            SELECT 
                ST.StockId,
                ST.QuantityForSale,
                ST.SalePricePerUnit,
                ST.SaleDate as ListedDate,
                S.Name as SpeciesName,
                U.FarmName,
                U.FullName as FarmerName,
                U.Email as FarmerEmail
            FROM Stocking ST
            JOIN Ponds P ON ST.CurrentPondId = P.PondId
            JOIN Farm F ON P.FarmId = F.FarmId
            JOIN Users U ON F.UserId = U.UserId
            JOIN Species S ON ST.SpeciesId = S.SpeciesId
            WHERE ST.Quantity > 0 AND ST.IsForSale = 1
            ORDER BY ST.SaleDate DESC
        `);

        res.json({ success: true, listings: result.recordset });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch marketplace listings", message: err.message });
    }
});

// PUT: Remove a marketplace listing (Moderation)
router.put('/marketplace/:stockId/remove', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const stockId = parseInt(req.params.stockId);

        await pool.request()
            .input('stockId', sql.Int, stockId)
            .query(`
                UPDATE Stocking 
                SET IsForSale = 0, QuantityForSale = 0 
                WHERE StockId = @stockId
            `);

        res.json({ success: true, message: "Listing removed from marketplace." });
    } catch (err) {
        res.status(500).json({ error: "Failed to remove listing", message: err.message });
    }
});

// GET: All purchase requests for moderation
router.get('/purchase-requests', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request().query(`
            SELECT 
                PR.RequestId,
                PR.SpeciesName,
                PR.RequestedQuantity,
                PR.Status,
                PR.CreatedAt,
                C.FullName as ConsumerName,
                C.Email as ConsumerEmail,
                F.FarmName,
                O.FullName as FarmerName
            FROM PurchaseRequests PR
            JOIN Users C ON PR.ConsumerId = C.UserId
            JOIN Farm F ON PR.FarmId = F.FarmId
            JOIN Users O ON F.UserId = O.UserId
            ORDER BY PR.CreatedAt DESC
        `);

        res.json({ success: true, requests: result.recordset });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch purchase requests", message: err.message });
    }
});

// DELETE: Remove a purchase request (Moderation)
router.delete('/purchase-requests/:requestId', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const requestId = parseInt(req.params.requestId);

        await pool.request()
            .input('requestId', sql.Int, requestId)
            .query('DELETE FROM PurchaseRequests WHERE RequestId = @requestId');

        res.json({ success: true, message: "Purchase request deleted." });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete purchase request", message: err.message });
    }
});

// ============================================
// SUPPORT TICKETS MODERATION
// ============================================

// GET: All support tickets across the platform
router.get('/tickets', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request().query(`
            SELECT 
                T.TicketId, T.Subject, T.Message, T.Category, T.Status, 
                T.AdminReply, T.CreatedAt, T.UpdatedAt,
                U.FullName as UserName, U.Email as UserEmail
            FROM Support_Tickets T
            JOIN Users U ON T.UserId = U.UserId
            ORDER BY 
                CASE T.Status 
                    WHEN 'Open' THEN 1 
                    WHEN 'Responded' THEN 2 
                    WHEN 'Closed' THEN 3 
                END,
                T.CreatedAt DESC
        `);
        res.json({ success: true, tickets: result.recordset });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch tickets", message: err.message });
    }
});

// PUT: Admin replies to a ticket
router.put('/tickets/:id/reply', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const ticketId = parseInt(req.params.id);
        const { reply } = req.body;

        if (!reply) return res.status(400).json({ error: "Reply message is required." });

        await pool.request()
            .input('id', sql.Int, ticketId)
            .input('reply', sql.NVarChar(1000), reply)
            .query(`
                UPDATE Support_Tickets
                SET AdminReply = @reply, Status = 'Responded', UpdatedAt = GETDATE()
                WHERE TicketId = @id
            `);

        res.json({ success: true, message: "Reply sent to user." });
    } catch (err) {
        res.status(500).json({ error: "Failed to reply to ticket", message: err.message });
    }
});

// PUT: Admin closes a ticket
router.put('/tickets/:id/close', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const ticketId = parseInt(req.params.id);

        await pool.request()
            .input('id', sql.Int, ticketId)
            .query(`
                UPDATE Support_Tickets
                SET Status = 'Closed', UpdatedAt = GETDATE()
                WHERE TicketId = @id
            `);

        res.json({ success: true, message: "Ticket closed." });
    } catch (err) {
        res.status(500).json({ error: "Failed to close ticket", message: err.message });
    }
});

// ============================================
// DISEASE CATALOG MODERATION
// ============================================

// GET: All diseases in the catalog (including inactive ones for admin view)
router.get('/diseases', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request().query(`
            SELECT DiseaseId, DiseaseName, Category, Symptoms, AffectedSpecies,
                   RecommendedTreatment, PreventionTips, Severity, IsActive
            FROM Disease_Catalog
            ORDER BY Category, DiseaseName
        `);
        res.json({ success: true, diseases: result.recordset });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch disease catalog", message: err.message });
    }
});

// POST: Add a new disease
router.post('/diseases', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const { name, category, symptoms, species, treatment, prevention, severity } = req.body;

        await pool.request()
            .input('name', sql.NVarChar(100), name)
            .input('category', sql.NVarChar(50), category)
            .input('symptoms', sql.NVarChar(500), symptoms || null)
            .input('species', sql.NVarChar(255), species || null)
            .input('treatment', sql.NVarChar(500), treatment || null)
            .input('prevention', sql.NVarChar(500), prevention || null)
            .input('severity', sql.NVarChar(20), severity || 'Moderate')
            .query(`
                INSERT INTO Disease_Catalog (DiseaseName, Category, Symptoms, AffectedSpecies, RecommendedTreatment, PreventionTips, Severity, IsActive)
                VALUES (@name, @category, @symptoms, @species, @treatment, @prevention, @severity, 1)
            `);

        res.json({ success: true, message: "Disease added to catalog." });
    } catch (err) {
        res.status(500).json({ error: "Failed to add disease", message: err.message });
    }
});

// PUT: Update an existing disease
router.put('/diseases/:id', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const diseaseId = parseInt(req.params.id);
        const { name, category, symptoms, species, treatment, prevention, severity } = req.body;

        await pool.request()
            .input('id', sql.Int, diseaseId)
            .input('name', sql.NVarChar(100), name)
            .input('category', sql.NVarChar(50), category)
            .input('symptoms', sql.NVarChar(500), symptoms || null)
            .input('species', sql.NVarChar(255), species || null)
            .input('treatment', sql.NVarChar(500), treatment || null)
            .input('prevention', sql.NVarChar(500), prevention || null)
            .input('severity', sql.NVarChar(20), severity || 'Moderate')
            .query(`
                UPDATE Disease_Catalog
                SET DiseaseName = @name, Category = @category, Symptoms = @symptoms, 
                    AffectedSpecies = @species, RecommendedTreatment = @treatment, 
                    PreventionTips = @prevention, Severity = @severity
                WHERE DiseaseId = @id
            `);

        res.json({ success: true, message: "Disease updated successfully." });
    } catch (err) {
        res.status(500).json({ error: "Failed to update disease", message: err.message });
    }
});

// PUT: Toggle IsActive status (Soft Delete)
router.put('/diseases/:id/toggle', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const diseaseId = parseInt(req.params.id);

        await pool.request()
            .input('id', sql.Int, diseaseId)
            .query(`
                UPDATE Disease_Catalog
                SET IsActive = CASE WHEN IsActive = 1 THEN 0 ELSE 1 END
                WHERE DiseaseId = @id
            `);

        res.json({ success: true, message: "Disease status toggled." });
    } catch (err) {
        res.status(500).json({ error: "Failed to toggle disease status", message: err.message });
    }
});

// PUT: Toggle user active status (ban/unban)
router.put('/users/:userId/toggle-status', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const userId = parseInt(req.params.userId);

        // Prevent admin from deactivating themselves
        if (userId === req.user.id) {
            return res.status(400).json({ error: "You cannot deactivate your own account." });
        }

        // Check if IsActive column exists, if not add it
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'IsActive')
                ALTER TABLE Users ADD IsActive BIT DEFAULT 1
            `);
        } catch (e) { /* column may already exist */ }

        const result = await pool.request()
            .input('uid', sql.Int, userId)
            .query(`
                UPDATE Users 
                SET IsActive = CASE WHEN ISNULL(IsActive, 1) = 1 THEN 0 ELSE 1 END 
                WHERE UserId = @uid;
                SELECT ISNULL(IsActive, 1) as IsActive FROM Users WHERE UserId = @uid;
            `);

        const newStatus = result.recordset[0]?.IsActive;
        res.json({ 
            success: true, 
            message: newStatus ? "User activated" : "User deactivated",
            isActive: newStatus 
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to update user status", message: err.message });
    }
});

// PUT: Change user role
router.put('/users/:userId/role', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const userId = parseInt(req.params.userId);
        const { role } = req.body;

        if (!['user', 'admin', 'Consumer'].includes(role)) {
            return res.status(400).json({ error: "Invalid role. Must be 'user', 'admin', or 'Consumer'." });
        }

        // Prevent admin from changing their own role
        if (userId === req.user.id) {
            return res.status(400).json({ error: "You cannot change your own role." });
        }

        await pool.request()
            .input('uid', sql.Int, userId)
            .input('role', sql.NVarChar, role)
            .query(`UPDATE Users SET Role = @role WHERE UserId = @uid`);

        res.json({ success: true, message: `User role changed to ${role}` });
    } catch (err) {
        res.status(500).json({ error: "Failed to update role", message: err.message });
    }
});

// DELETE: Delete a user account and all their associated data
router.delete('/users/:userId', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const userId = parseInt(req.params.userId);

        if (userId === req.user.id) {
            return res.status(400).json({ error: "You cannot delete your own account." });
        }

        // Delete all associated data in correct dependency order
        await pool.request()
            .input('uid', sql.Int, userId)
            .query(`
                BEGIN TRANSACTION;
                
                BEGIN TRY
                    -- 1. Tasks & Ratings & General Logs
                    IF OBJECT_ID('FarmTasks', 'U') IS NOT NULL DELETE FROM FarmTasks WHERE UserId = @uid;
                    IF OBJECT_ID('FarmRatings', 'U') IS NOT NULL DELETE FROM FarmRatings WHERE UserId = @uid;
                    
                    -- 2. Marketplace
                    IF OBJECT_ID('PurchaseRequests', 'U') IS NOT NULL 
                        DELETE FROM PurchaseRequests WHERE ConsumerId = @uid OR FarmId IN (SELECT FarmId FROM Farm WHERE UserId = @uid);
                    IF OBJECT_ID('Marketplace_Listings', 'U') IS NOT NULL 
                        DELETE FROM Marketplace_Listings WHERE UserId = @uid;
                    
                    -- 3. Farm Activities (Expenses, Harvests, Stocking)
                    IF COL_LENGTH('Expense_log', 'UserId') IS NOT NULL
                        DELETE FROM Expense_log WHERE UserId = @uid;
                    DELETE FROM Expense_log WHERE PondId IN (SELECT PondId FROM Ponds WHERE UserId = @uid);
                    IF OBJECT_ID('Harvest_Logs', 'U') IS NOT NULL 
                        DELETE FROM Harvest_Logs WHERE PondId IN (SELECT PondId FROM Ponds WHERE UserId = @uid);
                    DELETE FROM Stocking WHERE UserId = @uid;
                    
                    -- 4. Farm Infrastructure
                    DELETE FROM Ponds WHERE UserId = @uid;
                    DELETE FROM Farm WHERE UserId = @uid;
                    
                    -- 5. Finally, the User
                    DELETE FROM Users WHERE UserId = @uid;
                    
                    COMMIT TRANSACTION;
                END TRY
                BEGIN CATCH
                    ROLLBACK TRANSACTION;
                    THROW;
                END CATCH
            `);

        res.json({ success: true, message: "User and all associated data deleted successfully" });
    } catch (err) {
        // If it still fails due to some complex FK constraint we missed, fallback to a message
        if (err.message.includes('REFERENCE constraint')) {
            return res.status(400).json({ 
                error: "Cannot hard-delete this user due to complex data dependencies.", 
                message: "Please use the 'Ban User' function instead to disable their access." 
            });
        }
        res.status(500).json({ error: "Failed to delete user", message: err.message });
    }
});

// ============================================
// ANNOUNCEMENTS MODERATION
// ============================================

let announcementsTableVerified = false;

const ensureAnnouncementsTableExists = async (pool) => {
    if (announcementsTableVerified) return;

    try {
        const check = await pool.request().query(`
            SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Announcements'
        `);

        if (check.recordset.length === 0) {
            console.log('📣 Creating Announcements table...');
            await pool.request().query(`
                CREATE TABLE [dbo].[Announcements](
                    [Id] INT IDENTITY(1,1) PRIMARY KEY,
                    [Title] NVARCHAR(200) NOT NULL,
                    [Message] NVARCHAR(MAX) NOT NULL,
                    [Type] NVARCHAR(50) NOT NULL DEFAULT 'Info',
                    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
                    [CreatedBy] INT NULL,
                    CONSTRAINT FK_Announcements_User FOREIGN KEY (CreatedBy) REFERENCES Users(UserId)
                )
            `);
            console.log('✅ Announcements table created.');
        }

        announcementsTableVerified = true;
    } catch (err) {
        console.error('⚠️ Announcements table auto-create error:', err.message);
    }
};

// GET: All announcements (for admin management)
router.get('/announcements', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        await ensureAnnouncementsTableExists(pool);

        const result = await pool.request().query(`
            SELECT A.Id, A.Title, A.Message, A.Type, A.CreatedAt, A.CreatedBy, U.FullName as CreatorName
            FROM Announcements A
            LEFT JOIN Users U ON A.CreatedBy = U.UserId
            ORDER BY A.CreatedAt DESC
        `);

        res.json({ success: true, announcements: result.recordset });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch announcements", message: err.message });
    }
});

// POST: Create a new announcement
router.post('/announcements', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        await ensureAnnouncementsTableExists(pool);

        const { title, message, type } = req.body;

        if (!title || !message) {
            return res.status(400).json({ error: "Title and message are required." });
        }

        const result = await pool.request()
            .input('title', sql.NVarChar(200), title)
            .input('message', sql.NVarChar(sql.MAX), message)
            .input('type', sql.NVarChar(50), type || 'Info')
            .input('createdBy', sql.Int, req.user.id)
            .query(`
                INSERT INTO Announcements (Title, Message, Type, CreatedBy)
                OUTPUT INSERTED.*
                VALUES (@title, @message, @type, @createdBy)
            `);

        res.status(201).json({ success: true, announcement: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ error: "Failed to create announcement", message: err.message });
    }
});

// DELETE: Remove an announcement
router.delete('/announcements/:id', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                DELETE FROM Announcements
                WHERE Id = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: "Announcement not found" });
        }

        res.json({ success: true, message: "Announcement deleted" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete announcement", message: err.message });
    }
});

// ============================================
// FEED RULES MANAGEMENT
// ============================================

// GET: All Feed Rules (with species name)
router.get('/feed-rules', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request().query(`
            SELECT FR.*, S.Name AS SpeciesName
            FROM Feed_Rules FR
            LEFT JOIN Species S ON FR.SpeciesID = S.SpeciesId
            ORDER BY S.Name ASC, FR.MinSize_inch ASC
        `);
        res.json({ success: true, rules: result.recordset });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch feed rules", message: err.message });
    }
});

// POST: Create a new Feed Rule
router.post('/feed-rules', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const { speciesId, stage, minSize, maxSize, dailyRate, conditionFactor, feedType, frequency } = req.body;

        if (!speciesId || !stage || !feedType) {
            return res.status(400).json({ error: "Species, Stage, and Feed Type are required." });
        }

        const result = await pool.request()
            .input('speciesId', sql.Int, speciesId)
            .input('stage', sql.NVarChar, stage)
            .input('minSize', sql.Float, minSize || 0)
            .input('maxSize', sql.Float, maxSize || 99)
            .input('dailyRate', sql.Float, dailyRate || 0)
            .input('conditionFactor', sql.Float, conditionFactor || 0.01)
            .input('feedType', sql.NVarChar, feedType)
            .input('frequency', sql.NVarChar, frequency || '')
            .query(`
                INSERT INTO Feed_Rules (SpeciesID, Stage, MinSize_inch, MaxSize_inch, DailyRate_Percent, ConditionFactor_K, FeedType, Frequency)
                OUTPUT INSERTED.*
                VALUES (@speciesId, @stage, @minSize, @maxSize, @dailyRate, @conditionFactor, @feedType, @frequency)
            `);

        res.status(201).json({ success: true, rule: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ error: "Failed to create feed rule", message: err.message });
    }
});

// PUT: Update a Feed Rule
router.put('/feed-rules/:id', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const { speciesId, stage, minSize, maxSize, dailyRate, conditionFactor, feedType, frequency } = req.body;

        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('speciesId', sql.Int, speciesId)
            .input('stage', sql.NVarChar, stage)
            .input('minSize', sql.Float, minSize)
            .input('maxSize', sql.Float, maxSize)
            .input('dailyRate', sql.Float, dailyRate)
            .input('conditionFactor', sql.Float, conditionFactor)
            .input('feedType', sql.NVarChar, feedType)
            .input('frequency', sql.NVarChar, frequency)
            .query(`
                UPDATE Feed_Rules
                SET SpeciesID = @speciesId, Stage = @stage, MinSize_inch = @minSize, MaxSize_inch = @maxSize,
                    DailyRate_Percent = @dailyRate, ConditionFactor_K = @conditionFactor,
                    FeedType = @feedType, Frequency = @frequency
                WHERE RuleId = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: "Feed rule not found" });
        }

        res.json({ success: true, message: "Feed rule updated" });
    } catch (err) {
        res.status(500).json({ error: "Failed to update feed rule", message: err.message });
    }
});

// DELETE: Remove a Feed Rule
router.delete('/feed-rules/:id', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM Feed_Rules WHERE RuleId = @id');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: "Feed rule not found" });
        }

        res.json({ success: true, message: "Feed rule deleted" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete feed rule", message: err.message });
    }
});

// ============================================
// FERTILIZER RECOMMENDATIONS MANAGEMENT
// ============================================

// GET: All Fertilizer Recommendations
router.get('/fertilizer-rules', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request().query(`
            SELECT * FROM fertilizer_recommendations
            ORDER BY CultivationType ASC, PondType ASC
        `);
        res.json({ success: true, rules: result.recordset });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch fertilizer rules", message: err.message });
    }
});

// POST: Create a new Fertilizer Recommendation
router.post('/fertilizer-rules', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const {
            cultivationType, pondType,
            orgProduct, orgDosage, orgRate, orgFrequency, orgBenefits,
            inorgProduct, inorgDosage, inorgRate, inorgFrequency, inorgBenefits,
            limeProduct, limeDosage, limeRate, limeFrequency, limeBenefits
        } = req.body;

        if (!cultivationType || !pondType) {
            return res.status(400).json({ error: "Cultivation Type and Pond Type are required." });
        }

        const result = await pool.request()
            .input('cultivationType', sql.NVarChar, cultivationType)
            .input('pondType', sql.NVarChar, pondType)
            .input('orgProduct', sql.NVarChar, orgProduct || '')
            .input('orgDosage', sql.Float, orgDosage || 0)
            .input('orgRate', sql.Float, orgRate || 0)
            .input('orgFrequency', sql.NVarChar, orgFrequency || '')
            .input('orgBenefits', sql.NVarChar, orgBenefits || '')
            .input('inorgProduct', sql.NVarChar, inorgProduct || '')
            .input('inorgDosage', sql.Float, inorgDosage || 0)
            .input('inorgRate', sql.Float, inorgRate || 0)
            .input('inorgFrequency', sql.NVarChar, inorgFrequency || '')
            .input('inorgBenefits', sql.NVarChar, inorgBenefits || '')
            .input('limeProduct', sql.NVarChar, limeProduct || '')
            .input('limeDosage', sql.Float, limeDosage || 0)
            .input('limeRate', sql.Float, limeRate || 0)
            .input('limeFrequency', sql.NVarChar, limeFrequency || '')
            .input('limeBenefits', sql.NVarChar, limeBenefits || '')
            .query(`
                INSERT INTO fertilizer_recommendations (
                    CultivationType, PondType,
                    Org_Product, Org_Dosage_kg_Acre, Org_Rate_PKR, Org_Frequency, Org_Benefits,
                    Inorg_Product, Inorg_Dosage_kg_Acre, Inorg_Rate_PKR, Inorg_Frequency, Inorg_Benefits,
                    Lime_Product, Lime_Dosage_kg_Acre, Lime_Rate_PKR, Lime_Frequency, Lime_Benefits
                )
                OUTPUT INSERTED.*
                VALUES (
                    @cultivationType, @pondType,
                    @orgProduct, @orgDosage, @orgRate, @orgFrequency, @orgBenefits,
                    @inorgProduct, @inorgDosage, @inorgRate, @inorgFrequency, @inorgBenefits,
                    @limeProduct, @limeDosage, @limeRate, @limeFrequency, @limeBenefits
                )
            `);

        res.status(201).json({ success: true, rule: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ error: "Failed to create fertilizer rule", message: err.message });
    }
});

// PUT: Update a Fertilizer Recommendation
router.put('/fertilizer-rules/:id', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const {
            cultivationType, pondType,
            orgProduct, orgDosage, orgRate, orgFrequency, orgBenefits,
            inorgProduct, inorgDosage, inorgRate, inorgFrequency, inorgBenefits,
            limeProduct, limeDosage, limeRate, limeFrequency, limeBenefits
        } = req.body;

        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('cultivationType', sql.NVarChar, cultivationType)
            .input('pondType', sql.NVarChar, pondType)
            .input('orgProduct', sql.NVarChar, orgProduct || '')
            .input('orgDosage', sql.Float, orgDosage || 0)
            .input('orgRate', sql.Float, orgRate || 0)
            .input('orgFrequency', sql.NVarChar, orgFrequency || '')
            .input('orgBenefits', sql.NVarChar, orgBenefits || '')
            .input('inorgProduct', sql.NVarChar, inorgProduct || '')
            .input('inorgDosage', sql.Float, inorgDosage || 0)
            .input('inorgRate', sql.Float, inorgRate || 0)
            .input('inorgFrequency', sql.NVarChar, inorgFrequency || '')
            .input('inorgBenefits', sql.NVarChar, inorgBenefits || '')
            .input('limeProduct', sql.NVarChar, limeProduct || '')
            .input('limeDosage', sql.Float, limeDosage || 0)
            .input('limeRate', sql.Float, limeRate || 0)
            .input('limeFrequency', sql.NVarChar, limeFrequency || '')
            .input('limeBenefits', sql.NVarChar, limeBenefits || '')
            .query(`
                UPDATE fertilizer_recommendations
                SET CultivationType = @cultivationType, PondType = @pondType,
                    Org_Product = @orgProduct, Org_Dosage_kg_Acre = @orgDosage, Org_Rate_PKR = @orgRate,
                    Org_Frequency = @orgFrequency, Org_Benefits = @orgBenefits,
                    Inorg_Product = @inorgProduct, Inorg_Dosage_kg_Acre = @inorgDosage, Inorg_Rate_PKR = @inorgRate,
                    Inorg_Frequency = @inorgFrequency, Inorg_Benefits = @inorgBenefits,
                    Lime_Product = @limeProduct, Lime_Dosage_kg_Acre = @limeDosage, Lime_Rate_PKR = @limeRate,
                    Lime_Frequency = @limeFrequency, Lime_Benefits = @limeBenefits
                WHERE RecId = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: "Fertilizer rule not found" });
        }

        res.json({ success: true, message: "Fertilizer rule updated" });
    } catch (err) {
        res.status(500).json({ error: "Failed to update fertilizer rule", message: err.message });
    }
});

// DELETE: Remove a Fertilizer Recommendation
router.delete('/fertilizer-rules/:id', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM fertilizer_recommendations WHERE RecId = @id');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: "Fertilizer rule not found" });
        }

        res.json({ success: true, message: "Fertilizer rule deleted" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete fertilizer rule", message: err.message });
    }
});

// ==========================================
// 10. STOCKING DENSITIES MANAGEMENT
// ==========================================

const parseStockingRuleRow = row => {
    let speciesMix = [];
    if (row.SpeciesMix) {
        try {
            speciesMix = JSON.parse(row.SpeciesMix);
        } catch {
            speciesMix = [];
        }
    }

    return {
        ...row,
        speciesMix,
    };
};

const normalizeStockingRulePayload = body => {
    const speciesMix = Array.isArray(body.speciesMix)
        ? body.speciesMix
              .map(item => ({
                  speciesId: Number(item.speciesId),
                  quantity: Number(item.quantity || 0),
              }))
              .filter(item => item.speciesId && item.quantity > 0)
        : [];

    return {
        Stage: body.Stage,
        CultivationType: body.CultivationType,
        CultureType: body.CultureType,
        MinFishPerAcre: Number(body.MinFishPerAcre || 0),
        MaxFishPerAcre: Number(body.MaxFishPerAcre || 0),
        MaxSpeciesAllowed: Number(body.MaxSpeciesAllowed || 1),
        MinFishSizeInches:
            body.MinFishSizeInches == null || body.MinFishSizeInches === ''
                ? null
                : Number(body.MinFishSizeInches),
        MaxFishSizeInches:
            body.MaxFishSizeInches == null || body.MaxFishSizeInches === ''
                ? null
                : Number(body.MaxFishSizeInches),
        MinPondSizeAcres:
            body.MinPondSizeAcres == null || body.MinPondSizeAcres === ''
                ? null
                : Number(body.MinPondSizeAcres),
        MaxPondSizeAcres:
            body.MaxPondSizeAcres == null || body.MaxPondSizeAcres === ''
                ? null
                : Number(body.MaxPondSizeAcres),
        SpeciesMix: speciesMix.length ? JSON.stringify(speciesMix) : null,
    };
};

// GET: Fetch all stocking rules
router.get('/stocking-rules', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request().query(`
            SELECT RuleId, Stage, CultivationType, MinFishPerAcre, MaxFishPerAcre, MaxSpeciesAllowed, CultureType,
                   SpeciesMix, MinFishSizeInches, MaxFishSizeInches, MinPondSizeAcres, MaxPondSizeAcres
            FROM StockingRules 
            ORDER BY Stage ASC, CultivationType ASC
        `);
        res.json({
            success: true,
            rules: result.recordset.map(parseStockingRuleRow),
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch stocking rules", message: err.message });
    }
});

// POST: Create a new stocking rule
router.post('/stocking-rules', auth, adminOnly, async (req, res) => {
    try {
        const payload = normalizeStockingRulePayload(req.body);
        
        const pool = req.pool;
        await pool.request()
            .input('Stage', sql.NVarChar, payload.Stage)
            .input('CultivationType', sql.NVarChar, payload.CultivationType)
            .input('CultureType', sql.NVarChar, payload.CultureType)
            .input('MinFishPerAcre', sql.Int, payload.MinFishPerAcre)
            .input('MaxFishPerAcre', sql.Int, payload.MaxFishPerAcre)
            .input('MaxSpeciesAllowed', sql.Int, payload.MaxSpeciesAllowed)
            .input('SpeciesMix', sql.NVarChar(sql.MAX), payload.SpeciesMix)
            .input('MinFishSizeInches', sql.Decimal(4, 2), payload.MinFishSizeInches)
            .input('MaxFishSizeInches', sql.Decimal(4, 2), payload.MaxFishSizeInches)
            .input('MinPondSizeAcres', sql.Decimal(6, 2), payload.MinPondSizeAcres)
            .input('MaxPondSizeAcres', sql.Decimal(6, 2), payload.MaxPondSizeAcres)
            .query(`
                INSERT INTO StockingRules (
                    Stage, CultivationType, CultureType, MinFishPerAcre, MaxFishPerAcre, MaxSpeciesAllowed,
                    SpeciesMix, MinFishSizeInches, MaxFishSizeInches, MinPondSizeAcres, MaxPondSizeAcres
                )
                VALUES (
                    @Stage, @CultivationType, @CultureType, @MinFishPerAcre, @MaxFishPerAcre, @MaxSpeciesAllowed,
                    @SpeciesMix, @MinFishSizeInches, @MaxFishSizeInches, @MinPondSizeAcres, @MaxPondSizeAcres
                )
            `);

        res.json({ success: true, message: "Stocking rule created" });
    } catch (err) {
        res.status(500).json({ error: "Failed to create stocking rule", message: err.message });
    }
});

// PUT: Update stocking rule
router.put('/stocking-rules/:id', auth, adminOnly, async (req, res) => {
    try {
        const payload = normalizeStockingRulePayload(req.body);

        const pool = req.pool;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('Stage', sql.NVarChar, payload.Stage)
            .input('CultivationType', sql.NVarChar, payload.CultivationType)
            .input('CultureType', sql.NVarChar, payload.CultureType)
            .input('MinFishPerAcre', sql.Int, payload.MinFishPerAcre)
            .input('MaxFishPerAcre', sql.Int, payload.MaxFishPerAcre)
            .input('MaxSpeciesAllowed', sql.Int, payload.MaxSpeciesAllowed)
            .input('SpeciesMix', sql.NVarChar(sql.MAX), payload.SpeciesMix)
            .input('MinFishSizeInches', sql.Decimal(4, 2), payload.MinFishSizeInches)
            .input('MaxFishSizeInches', sql.Decimal(4, 2), payload.MaxFishSizeInches)
            .input('MinPondSizeAcres', sql.Decimal(6, 2), payload.MinPondSizeAcres)
            .input('MaxPondSizeAcres', sql.Decimal(6, 2), payload.MaxPondSizeAcres)
            .query(`
                UPDATE StockingRules 
                SET Stage = @Stage, CultivationType = @CultivationType, CultureType = @CultureType, 
                    MinFishPerAcre = @MinFishPerAcre, MaxFishPerAcre = @MaxFishPerAcre, MaxSpeciesAllowed = @MaxSpeciesAllowed,
                    SpeciesMix = @SpeciesMix, MinFishSizeInches = @MinFishSizeInches, MaxFishSizeInches = @MaxFishSizeInches,
                    MinPondSizeAcres = @MinPondSizeAcres, MaxPondSizeAcres = @MaxPondSizeAcres
                WHERE RuleId = @id
            `);

        if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Rule not found" });

        res.json({ success: true, message: "Stocking rule updated" });
    } catch (err) {
        res.status(500).json({ error: "Failed to update stocking rule", message: err.message });
    }
});

// DELETE: Remove stocking rule
router.delete('/stocking-rules/:id', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM StockingRules WHERE RuleId = @id');

        if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Rule not found" });

        res.json({ success: true, message: "Stocking rule deleted" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete stocking rule", message: err.message });
    }
});

// ==========================================
// 11. SPECIES COMPATIBILITY MANAGEMENT
// ==========================================

// GET: Fetch all compatibility rules
router.get('/compatibilities', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request().query(`
            SELECT 
                c.CompatibilityId,
                c.SpeciesId,
                s1.Name AS MainSpeciesName,
                c.CompatibleWithId,
                s2.Name AS CompatibleSpeciesName,
                c.CompatibilityReason
            FROM SpeciesCompatibility c
            INNER JOIN Species s1 ON c.SpeciesId = s1.SpeciesId
            INNER JOIN Species s2 ON c.CompatibleWithId = s2.SpeciesId
        `);
        res.json({ success: true, compatibilities: result.recordset });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch compatibilities", message: err.message });
    }
});

// POST: Add a compatibility rule
router.post('/compatibilities', auth, adminOnly, async (req, res) => {
    try {
        const { speciesId, compatibleWithId, reason } = req.body;
        if (!speciesId || !compatibleWithId || !reason) {
            return res.status(400).json({ error: "speciesId, compatibleWithId, and reason are required" });
        }

        const pool = req.pool;

        // Check if combination already exists
        const check = await pool.request()
            .input('s1', sql.Int, speciesId)
            .input('s2', sql.Int, compatibleWithId)
            .query('SELECT 1 FROM SpeciesCompatibility WHERE SpeciesId = @s1 AND CompatibleWithId = @s2');

        if (check.recordset.length > 0) {
            return res.status(400).json({ error: "This compatibility rule already exists" });
        }

        await pool.request()
            .input('s1', sql.Int, speciesId)
            .input('s2', sql.Int, compatibleWithId)
            .input('reason', sql.NVarChar, reason)
            .query('INSERT INTO SpeciesCompatibility (SpeciesId, CompatibleWithId, CompatibilityReason) VALUES (@s1, @s2, @reason)');

        res.json({ success: true, message: "Compatibility rule added" });
    } catch (err) {
        res.status(500).json({ error: "Failed to add compatibility rule", message: err.message });
    }
});

// DELETE: Remove a compatibility rule
router.delete('/compatibilities/:id', auth, adminOnly, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM SpeciesCompatibility WHERE CompatibilityId = @id');

        if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Compatibility rule not found" });

        res.json({ success: true, message: "Compatibility rule deleted" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete compatibility rule", message: err.message });
    }
});

// PUT: Update species stocking density (per acre)
router.put('/species/:id/stocking-density', auth, adminOnly, async (req, res) => {
    try {
        const density = Number(req.body?.maxStockingDensity);
        if (!density || density <= 0) {
            return res.status(400).json({ error: 'maxStockingDensity must be a positive number' });
        }

        const pool = req.pool;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('density', sql.Decimal(10, 2), density)
            .query(`
                UPDATE Species
                SET MaxStockingDensity = @density
                WHERE SpeciesId = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Species not found' });
        }

        res.json({ success: true, message: 'Species stocking density updated' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update species density', message: err.message });
    }
});

module.exports = router;
