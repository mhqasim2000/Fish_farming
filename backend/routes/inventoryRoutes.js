const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const auth = require('../middleware/auth');

let inventorySchemaVerified = false;

const ensureInventorySchema = async (pool) => {
    if (inventorySchemaVerified) return;

    await pool.request().query(`
        IF COL_LENGTH('Feed_Stock', 'ExpiryDate') IS NULL
            ALTER TABLE Feed_Stock ADD ExpiryDate DATE NULL;

        IF COL_LENGTH('Fertilizer_Stock', 'ExpiryDate') IS NULL
            ALTER TABLE Fertilizer_Stock ADD ExpiryDate DATE NULL;

        IF COL_LENGTH('Expense_log', 'UserId') IS NULL
            ALTER TABLE Expense_log ADD UserId INT NULL;

        IF COL_LENGTH('Expense_log', 'PondId') IS NOT NULL
           AND EXISTS (
                SELECT 1
                FROM sys.columns
                WHERE object_id = OBJECT_ID('Expense_log')
                AND name = 'PondId'
                AND is_nullable = 0
           )
            ALTER TABLE Expense_log ALTER COLUMN PondId BIGINT NULL;

        IF COL_LENGTH('Stocking', 'IsForSale') IS NULL
            ALTER TABLE Stocking ADD IsForSale BIT NOT NULL DEFAULT 0;

        IF COL_LENGTH('Stocking', 'QuantityForSale') IS NULL
            ALTER TABLE Stocking ADD QuantityForSale INT NOT NULL DEFAULT 0;

        IF COL_LENGTH('Stocking', 'SalePricePerUnit') IS NULL
            ALTER TABLE Stocking ADD SalePricePerUnit DECIMAL(10, 2) NULL;

        IF COL_LENGTH('Stocking', 'SaleDate') IS NULL
            ALTER TABLE Stocking ADD SaleDate DATETIME NULL;
    `);

    inventorySchemaVerified = true;
};

// --- 1. CREATE: Add Stock Entry ---
router.post('/add', auth, async (req, res) => {
    try {
        const {
            pondId,
            speciesId,
            quantity,
            weight,
            cost,         // Treat this as PRICE PER FISH (e.g., 50.0)
            stockingDate
        } = req.body;
        const uId = req.user.id;
        const pool = req.pool;

        // Verify pond ownership
        const ownershipCheck = await pool.request()
            .input('pid', sql.Int, pondId)
            .input('uid', sql.Int, uId)
            .query('SELECT PondId FROM Ponds WHERE PondId = @pid AND UserId = @uid');

        if (ownershipCheck.recordset.length === 0) {
            return res.status(403).json({ error: "Access denied. This pond does not belong to you." });
        }

        const qty = parseInt(quantity) || 0;
        const unitPrice = parseFloat(cost) || 0;
        const totalInvestment = qty * unitPrice;

        const insertResult = await pool.request()
            .input('uid', sql.Int, uId)
            .input('pid', sql.Int, pondId)
            .input('sid', sql.Int, speciesId)
            .input('qty', sql.Int, qty)
            .input('currentSize', sql.Decimal(4, 2), parseFloat(weight) || 2)
            .input('targetSize', sql.Decimal(4, 2), 20)
            .input('unitPrice', sql.Decimal(18, 2), unitPrice)
            .input('date', sql.DateTime, stockingDate || new Date())
            .query(`
                INSERT INTO Stocking (
                    UserId, OriginalPondId, CurrentPondId, SpeciesId, Quantity,
                    PricePerPiece, CurrentSizeInches, TargetSizeInches, StockingDate, Status
                )
                SELECT
                    @uid, @pid, @pid, @sid, @qty,
                    @unitPrice, @currentSize, @targetSize, @date, ISNULL(p.Stage, 'Stocked')
                FROM Ponds p
                WHERE p.PondId = @pid AND p.UserId = @uid;

                SELECT CAST(SCOPE_IDENTITY() AS INT) AS StockId;
            `);

        res.status(201).json({
            success: true,
            message: "Inventory added successfully!",
            StockId: insertResult.recordset?.[0]?.StockId,
            dataStored: {
                pricePerFish: unitPrice.toFixed(2),
                totalBatchCost: totalInvestment.toFixed(2)
            }
        });
    } catch (err) {
        res.status(500).json({ error: "Insert failed", details: err.message });
    }
});

// --- 2. SUMMARY: Get Totals for Dashboard Cards ---
router.get('/dashboard-summary', auth, async (req, res) => {
    try {
        const uId = req.user.id;
        const result = await req.pool.request()
            .input('uid', sql.Int, uId)
            .query(`
                SELECT 
                    ISNULL(SUM(st.Quantity), 0) as TotalStock,
                    ISNULL(SUM(st.Quantity * st.PricePerPiece), 0) as TotalValue,
                    COUNT(DISTINCT st.SpeciesId) as SpeciesVariety
                FROM Stocking st
                JOIN Ponds p ON st.CurrentPondId = p.PondId
                WHERE p.UserId = @uid
            `);
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: "Summary fetch failed", details: err.message });
    }
});

// --- 3. READ: Get All (Filtered by User) ---
router.get('/', auth, async (req, res) => {
    try {
        const uId = req.user.id;
        await ensureInventorySchema(req.pool);
        const result = await req.pool.request()
            .input('uid', sql.Int, uId)
            .query(`
                SELECT 
                    st.StockId AS InventoryId, 
                    st.StockId,
                    st.CurrentPondId AS PondId,
                    st.OriginalPondId,
                    st.SpeciesId,
                    st.Quantity, 
                    st.PricePerPiece AS CostPerUnit_PKR, 
                    st.CurrentSizeInches,
                    st.TargetSizeInches,
                    st.Status,
                    st.StockingDate, 
                    st.IsForSale,
                    st.QuantityForSale,
                    st.SalePricePerUnit,
                    p.PondName, 
                    s.Name AS SpeciesName
                FROM Stocking st
                JOIN Species s ON st.SpeciesId = s.SpeciesId
                JOIN Ponds p ON st.CurrentPondId = p.PondId
                WHERE p.UserId = @uid
                ORDER BY st.StockingDate DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: "Fetch failed", details: err.message });
    }
});

// --- 4. READ: Get Single Item (Ownership secured) ---
router.get('/:id', auth, async (req, res) => {
    try {
        const uId = req.user.id;
        const result = await req.pool.request()
            .input('id', sql.Int, req.params.id)
            .input('uid', sql.Int, uId)
            .query(`
                SELECT
                    st.StockId AS InventoryId,
                    st.CurrentPondId AS PondId,
                    st.SpeciesId,
                    st.Quantity,
                    st.CurrentSizeInches AS WeightPerFish_g,
                    st.PricePerPiece AS CostPerUnit_PKR,
                    st.StockingDate,
                    st.Status,
                    p.PondName,
                    s.Name AS SpeciesName
                FROM Stocking st
                JOIN Ponds p ON st.CurrentPondId = p.PondId
                JOIN Species s ON st.SpeciesId = s.SpeciesId
                WHERE st.StockId = @id AND p.UserId = @uid
            `);

        if (result.recordset.length === 0) return res.status(404).json({ error: "Not found or access denied" });
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: "Fetch failed", details: err.message });
    }
});

// --- 5. TRANSFER: Move WHOLE Pond Stock ---
router.put('/transfer-whole-pond', auth, async (req, res) => {
    try {
        const { fromPondId, toPondId } = req.body;
        const uId = req.user.id;
        const pool = req.pool;

        // Verify both ponds belong to user
        const pondsCheck = await pool.request()
            .input('fpid', sql.Int, fromPondId)
            .input('tpid', sql.Int, toPondId)
            .input('uid', sql.Int, uId)
            .query('SELECT PondId FROM Ponds WHERE UserId = @uid AND PondId IN (@fpid, @tpid)');

        if (pondsCheck.recordset.length < 2) {
            return res.status(403).json({ error: "Access denied. One or both ponds do not belong to you." });
        }

        await pool.request()
            .input('fromP', sql.Int, fromPondId)
            .input('toP', sql.Int, toPondId)
            .query('UPDATE Stocking SET CurrentPondId = @toP, TransferDate = GETDATE() WHERE CurrentPondId = @fromP');
        res.json({ success: true, message: "Whole pond moved successfully." });
    } catch (err) {
        res.status(500).json({ error: "Transfer failed", details: err.message });
    }
});

// --- 6. UPDATE ---
router.put('/:id', auth, async (req, res) => {
    try {
        const { quantity, weight, cost } = req.body;
        const uId = req.user.id;
        const pool = req.pool;

        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('uid', sql.Int, uId)
            .input('qty', sql.Int, quantity)
            .input('w', sql.Decimal(10, 2), weight)
            .input('c', sql.Decimal(10, 2), cost)
            .query(`
                UPDATE st
                SET st.Quantity = ISNULL(@qty, st.Quantity), 
                    st.CurrentSizeInches = ISNULL(@w, st.CurrentSizeInches),
                    st.PricePerPiece = ISNULL(@c, st.PricePerPiece) 
                FROM Stocking st
                JOIN Ponds p ON st.CurrentPondId = p.PondId
                WHERE st.StockId = @id AND p.UserId = @uid
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: "Not found or access denied" });
        }
        res.json({ success: true, message: "Inventory updated." });
    } catch (err) {
        res.status(500).json({ error: "Update failed", details: err.message });
    }
});

// --- 7. DELETE ---
router.delete('/:id', auth, async (req, res) => {
    try {
        const uId = req.user.id;
        const pool = req.pool;

        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('uid', sql.Int, uId)
            .query(`
                DELETE st
                FROM Stocking st
                JOIN Ponds p ON st.CurrentPondId = p.PondId
                WHERE st.StockId = @id AND p.UserId = @uid
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: "Not found or access denied" });
        }
        res.json({ success: true, message: "Removed from inventory." });
    } catch (err) {
        res.status(500).json({ error: "Deletion failed", details: err.message });
    }
});

// ==========================================
// FEED STOCK INVENTORY
// ==========================================

// GET: All Feed Stock for User
router.get('/feed/all', auth, async (req, res) => {
    try {
        const uId = req.user.id;
        await ensureInventorySchema(req.pool);
        const result = await req.pool.request()
            .input('uid', sql.Int, uId)
            .query(`
                SELECT *, CASE WHEN ExpiryDate < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS IsExpired FROM Feed_Stock 
                WHERE UserId = @uid 
                ORDER BY PurchaseDate DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: "Fetch failed", details: err.message });
    }
});

// GET: Distinct Feed Types from Feed_Rules + User's Feed_Stock
router.get('/feed/types', auth, async (req, res) => {
    try {
        const uId = req.user.id;
        const result = await req.pool.request()
            .input('uid', sql.Int, uId)
            .query(`
                SELECT DISTINCT FeedType FROM Feed_Rules WHERE FeedType IS NOT NULL
                UNION
                SELECT DISTINCT FeedType FROM Feed_Stock WHERE UserId = @uid AND FeedType IS NOT NULL AND CurrentQuantity_kg > 0
            `);
        res.json(result.recordset.map(r => r.FeedType));
    } catch (err) {
        res.status(500).json({ error: "Fetch failed", details: err.message });
    }
});

// POST: Add Feed Stock
router.post('/feed/add', auth, async (req, res) => {
    try {
        const { feedType, quantity_kg, costPerKg, supplier, purchaseDate, expiryDate } = req.body;
        const uId = req.user.id;
        const total = (parseFloat(quantity_kg) || 0) * (parseFloat(costPerKg) || 0);
        await ensureInventorySchema(req.pool);

        await req.pool.request()
            .input('uid', sql.Int, uId)
            .input('type', sql.NVarChar, feedType)
            .input('qty', sql.Float, quantity_kg)
            .input('cost', sql.Decimal(10, 2), costPerKg)
            .input('total', sql.Decimal(18, 2), total)
            .input('supplier', sql.NVarChar, supplier)
            .input('date', sql.Date, purchaseDate || new Date())
            .input('expiry', sql.Date, expiryDate || null)
            .query(`
                INSERT INTO Feed_Stock (UserId, FeedType, InitialQuantity_kg, CurrentQuantity_kg, CostPerKg, TotalCost, Supplier, PurchaseDate, ExpiryDate)
                VALUES (@uid, @type, @qty, @qty, @cost, @total, @supplier, @date, @expiry)
            `);
            
        if (total > 0) {
            await req.pool.request()
                .input('uid', sql.Int, uId)
                .input('amt', sql.Decimal(18,2), total)
                .input('desc', sql.NVarChar, `Purchased ${quantity_kg}kg of ${feedType} feed.`)
                .query(`
                    INSERT INTO Expense_log (UserId, PondId, Category, Amount, Description, ExpenseDate)
                    VALUES (@uid, NULL, 'Feed Purchase', @amt, @desc, GETDATE())
                `);
        }

        res.status(201).json({ success: true, message: "Feed stock added successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Insert failed", details: err.message });
    }
});

// PUT: Update Feed Stock
router.put('/feed/:id', auth, async (req, res) => {
    try {
        const { currentQuantity_kg } = req.body;
        const uId = req.user.id;
        const result = await req.pool.request()
            .input('id', sql.Int, req.params.id)
            .input('uid', sql.Int, uId)
            .input('qty', sql.Float, currentQuantity_kg)
            .query(`
                UPDATE Feed_Stock 
                SET CurrentQuantity_kg = @qty 
                WHERE StockId = @id AND UserId = @uid
            `);
        if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Not found or access denied" });
        res.json({ success: true, message: "Feed stock updated." });
    } catch (err) {
        res.status(500).json({ error: "Update failed", details: err.message });
    }
});

// DELETE: Delete Feed Stock
router.delete('/feed/:id', auth, async (req, res) => {
    try {
        const uId = req.user.id;
        const result = await req.pool.request()
            .input('id', sql.Int, req.params.id)
            .input('uid', sql.Int, uId)
            .query('DELETE FROM Feed_Stock WHERE StockId = @id AND UserId = @uid');
        if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Not found or access denied" });
        res.json({ success: true, message: "Removed from feed stock." });
    } catch (err) {
        res.status(500).json({ error: "Deletion failed", details: err.message });
    }
});

// ==========================================
// FERTILIZER STOCK INVENTORY
// ==========================================

// GET: All Fertilizer Stock for User
router.get('/fertilizer/all', auth, async (req, res) => {
    try {
        const uId = req.user.id;
        await ensureInventorySchema(req.pool);
        const result = await req.pool.request()
            .input('uid', sql.Int, uId)
            .query(`
                SELECT *, CASE WHEN ExpiryDate < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS IsExpired FROM Fertilizer_Stock 
                WHERE UserId = @uid 
                ORDER BY PurchaseDate DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: "Fetch failed", details: err.message });
    }
});

// GET: Distinct Fertilizer Products (DB recommendations + user's custom stock)
router.get('/fertilizer/products', auth, async (req, res) => {
    try {
        const uId = req.user.id;
        const result = await req.pool.request()
            .input('uid', sql.Int, uId)
            .query(`
            SELECT DISTINCT Org_Product as Product, 'Organic' as Category FROM fertilizer_recommendations WHERE Org_Product IS NOT NULL AND Org_Product != ''
            UNION
            SELECT DISTINCT Inorg_Product as Product, 'Inorganic' as Category FROM fertilizer_recommendations WHERE Inorg_Product IS NOT NULL AND Inorg_Product != ''
            UNION
            SELECT DISTINCT Lime_Product as Product, 'Lime' as Category FROM fertilizer_recommendations WHERE Lime_Product IS NOT NULL AND Lime_Product != ''
            UNION
            SELECT DISTINCT ProductName as Product, Category FROM Fertilizer_Stock WHERE UserId = @uid AND ProductName IS NOT NULL AND ProductName != '' AND CurrentQuantity_kg > 0
            ORDER BY Category, Product
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: "Fetch failed", details: err.message });
    }
});

// POST: Add Fertilizer Stock
router.post('/fertilizer/add', auth, async (req, res) => {
    try {
        const { category, productName, quantity_kg, costPerKg, supplier, purchaseDate, expiryDate } = req.body;
        const uId = req.user.id;
        const total = (parseFloat(quantity_kg) || 0) * (parseFloat(costPerKg) || 0);
        await ensureInventorySchema(req.pool);

        await req.pool.request()
            .input('uid', sql.Int, uId)
            .input('cat', sql.NVarChar, category)
            .input('prod', sql.NVarChar, productName)
            .input('qty', sql.Float, quantity_kg)
            .input('cost', sql.Decimal(10, 2), costPerKg)
            .input('total', sql.Decimal(18, 2), total)
            .input('supplier', sql.NVarChar, supplier)
            .input('date', sql.Date, purchaseDate || new Date())
            .input('expiry', sql.Date, expiryDate || null)
            .query(`
                INSERT INTO Fertilizer_Stock (UserId, Category, ProductName, InitialQuantity_kg, CurrentQuantity_kg, CostPerKg, TotalCost, Supplier, PurchaseDate, ExpiryDate)
                VALUES (@uid, @cat, @prod, @qty, @qty, @cost, @total, @supplier, @date, @expiry)
            `);
            
        if (total > 0) {
            await req.pool.request()
                .input('uid', sql.Int, uId)
                .input('amt', sql.Decimal(18,2), total)
                .input('desc', sql.NVarChar, `Purchased ${quantity_kg}kg of ${productName} (${category}).`)
                .query(`
                    INSERT INTO Expense_log (UserId, PondId, Category, Amount, Description, ExpenseDate)
                    VALUES (@uid, NULL, 'Fertilizer Purchase', @amt, @desc, GETDATE())
                `);
        }

        res.status(201).json({ success: true, message: "Fertilizer stock added successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Insert failed", details: err.message });
    }
});

// PUT: Update Fertilizer Stock
router.put('/fertilizer/:id', auth, async (req, res) => {
    try {
        const { currentQuantity_kg } = req.body;
        const uId = req.user.id;
        const result = await req.pool.request()
            .input('id', sql.Int, req.params.id)
            .input('uid', sql.Int, uId)
            .input('qty', sql.Float, currentQuantity_kg)
            .query(`
                UPDATE Fertilizer_Stock 
                SET CurrentQuantity_kg = @qty 
                WHERE StockId = @id AND UserId = @uid
            `);
        if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Not found or access denied" });
        res.json({ success: true, message: "Fertilizer stock updated." });
    } catch (err) {
        res.status(500).json({ error: "Update failed", details: err.message });
    }
});

// DELETE: Delete Fertilizer Stock
router.delete('/fertilizer/:id', auth, async (req, res) => {
    try {
        const uId = req.user.id;
        const result = await req.pool.request()
            .input('id', sql.Int, req.params.id)
            .input('uid', sql.Int, uId)
            .query('DELETE FROM Fertilizer_Stock WHERE StockId = @id AND UserId = @uid');
        if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Not found or access denied" });
        res.json({ success: true, message: "Removed from fertilizer stock." });
    } catch (err) {
        res.status(500).json({ error: "Deletion failed", details: err.message });
    }
});

// ==========================================
// TREATMENT STOCK INVENTORY
// ==========================================

// Auto-create Treatment_Stock table if it doesn't exist
let treatmentTableVerified = false;
const ensureTreatmentStockTable = async (pool) => {
    if (treatmentTableVerified) return;
    try {
        const check = await pool.request().query(`
            SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Treatment_Stock'
        `);
        if (check.recordset.length === 0) {
            console.log('💊 Creating Treatment_Stock table...');
            await pool.request().query(`
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
                    [Notes] NVARCHAR(500) NULL,
                    CONSTRAINT FK_TreatmentStock_User FOREIGN KEY (UserId) REFERENCES Users(UserId)
                )
            `);
            console.log('✅ Treatment_Stock table created.');
        }
        treatmentTableVerified = true;
    } catch (err) {
        console.error('⚠️ Treatment_Stock table auto-create error:', err.message);
    }
};

// GET: All Treatment Stock for User
router.get('/treatment/all', auth, async (req, res) => {
    try {
        const pool = req.pool;
        await ensureTreatmentStockTable(pool);
        const uId = req.user.id;
        const result = await pool.request()
            .input('uid', sql.Int, uId)
            .query(`
                SELECT *, 
                    CASE WHEN ExpiryDate < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS IsExpired
                FROM Treatment_Stock 
                WHERE UserId = @uid 
                ORDER BY PurchaseDate DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: "Fetch failed", details: err.message });
    }
});

// GET: Treatment medicine types (hardcoded defaults + user's custom stock)
router.get('/treatment/types', auth, async (req, res) => {
    try {
        // Default common treatment medicine categories
        const types = [
            { name: 'Potassium Permanganate (KMnO4)', category: 'Chemical' },
            { name: 'Formalin', category: 'Chemical' },
            { name: 'Malachite Green', category: 'Chemical' },
            { name: 'CIFAX', category: 'Chemical' },
            { name: 'Salt (NaCl)', category: 'Natural' },
            { name: 'Lime (CaO)', category: 'Natural' },
            { name: 'Oxytetracycline', category: 'Antibiotic' },
            { name: 'Terramycin', category: 'Antibiotic' },
            { name: 'Sumithion', category: 'Pesticide' },
            { name: 'Malathion', category: 'Pesticide' },
            { name: 'Dipterex/Trichlorfon', category: 'Pesticide' },
            { name: 'Gammexane', category: 'Pesticide' },
            { name: 'Vitamin C Supplement', category: 'Supplement' },
            { name: 'Multivitamin Mix', category: 'Supplement' },
            { name: 'Mineral Mix', category: 'Supplement' },
        ];

        // Also include user's custom medicines from Treatment_Stock
        const pool = req.pool;
        await ensureTreatmentStockTable(pool);
        const uId = req.user.id;
        const customResult = await pool.request()
            .input('uid', sql.Int, uId)
            .query(`
                SELECT DISTINCT MedicineName, Category 
                FROM Treatment_Stock 
                WHERE UserId = @uid AND MedicineName IS NOT NULL AND MedicineName != '' AND CurrentQuantity > 0
            `);

        // Merge: add custom medicines that aren't already in the default list
        const defaultNames = new Set(types.map(t => t.name.toLowerCase()));
        for (const row of customResult.recordset) {
            if (!defaultNames.has(row.MedicineName.toLowerCase())) {
                types.push({ name: row.MedicineName, category: row.Category || 'Other' });
            }
        }

        res.json(types);
    } catch (err) {
        res.status(500).json({ error: "Fetch failed", details: err.message });
    }
});

// POST: Add Treatment Stock
router.post('/treatment/add', auth, async (req, res) => {
    try {
        const pool = req.pool;
        await ensureInventorySchema(pool);
        await ensureTreatmentStockTable(pool);
        const { medicineName, category, quantity, unit, costPerUnit, supplier, expiryDate, purchaseDate, notes } = req.body;
        const uId = req.user.id;
        const total = (parseFloat(quantity) || 0) * (parseFloat(costPerUnit) || 0);

        await pool.request()
            .input('uid', sql.Int, uId)
            .input('name', sql.NVarChar(100), medicineName)
            .input('cat', sql.NVarChar(50), category || 'Chemical')
            .input('qty', sql.Float, quantity)
            .input('unit', sql.NVarChar(20), unit || 'ml')
            .input('cost', sql.Decimal(10, 2), costPerUnit || 0)
            .input('total', sql.Decimal(18, 2), total)
            .input('supplier', sql.NVarChar(100), supplier || null)
            .input('expiry', sql.Date, expiryDate || null)
            .input('date', sql.Date, purchaseDate || new Date())
            .input('notes', sql.NVarChar(500), notes || null)
            .query(`
                INSERT INTO Treatment_Stock (UserId, MedicineName, Category, InitialQuantity, CurrentQuantity, Unit, CostPerUnit, TotalCost, Supplier, ExpiryDate, PurchaseDate, Notes)
                VALUES (@uid, @name, @cat, @qty, @qty, @unit, @cost, @total, @supplier, @expiry, @date, @notes)
            `);
            
        if (total > 0) {
            await pool.request()
                .input('uid', sql.Int, uId)
                .input('amt', sql.Decimal(18,2), total)
                .input('desc', sql.NVarChar, `Purchased ${quantity} ${unit || 'units'} of ${medicineName} (Treatment).`)
                .query(`
                    INSERT INTO Expense_log (UserId, PondId, Category, Amount, Description, ExpenseDate)
                    VALUES (@uid, NULL, 'Treatment Purchase', @amt, @desc, GETDATE())
                `);
        }

        res.status(201).json({ success: true, message: "Treatment stock added successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Insert failed", details: err.message });
    }
});

// PUT: Update Treatment Stock quantity
router.put('/treatment/:id', auth, async (req, res) => {
    try {
        const { currentQuantity } = req.body;
        const uId = req.user.id;
        const result = await req.pool.request()
            .input('id', sql.Int, req.params.id)
            .input('uid', sql.Int, uId)
            .input('qty', sql.Float, currentQuantity)
            .query(`
                UPDATE Treatment_Stock 
                SET CurrentQuantity = @qty 
                WHERE StockId = @id AND UserId = @uid
            `);
        if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Not found or access denied" });
        res.json({ success: true, message: "Treatment stock updated." });
    } catch (err) {
        res.status(500).json({ error: "Update failed", details: err.message });
    }
});

// DELETE: Delete Treatment Stock
router.delete('/treatment/:id', auth, async (req, res) => {
    try {
        const uId = req.user.id;
        const result = await req.pool.request()
            .input('id', sql.Int, req.params.id)
            .input('uid', sql.Int, uId)
            .query('DELETE FROM Treatment_Stock WHERE StockId = @id AND UserId = @uid');
        if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Not found or access denied" });
        res.json({ success: true, message: "Removed from treatment stock." });
    } catch (err) {
        res.status(500).json({ error: "Deletion failed", details: err.message });
    }
});

module.exports = router;