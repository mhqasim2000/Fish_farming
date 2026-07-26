const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const auth = require('../middleware/auth');

// ============================================
// AUTO-CREATE: Ensure disease tables exist
// ============================================
let tablesVerified = false;

const ensureTablesExist = async (pool) => {
    if (tablesVerified) return; // Only check once per server lifetime

    try {
        // Check if Disease_Outbreaks exists
        const outbreakCheck = await pool.request().query(`
            SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Disease_Outbreaks'
        `);

        if (outbreakCheck.recordset.length === 0) {
            console.log('🩺 Creating Disease_Outbreaks table...');
            await pool.request().query(`
                CREATE TABLE [dbo].[Disease_Outbreaks](
                    [OutbreakId] INT IDENTITY(1,1) PRIMARY KEY,
                    [PondId] INT NOT NULL,
                    [DiseaseId] INT NULL,
                    [CustomDiseaseName] NVARCHAR(100) NULL,
                    [SpeciesId] INT NULL,
                    [BatchId] INT NULL,
                    [Severity] NVARCHAR(20) NOT NULL DEFAULT 'Moderate',
                    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
                    [SymptomsObserved] NVARCHAR(500) NULL,
                    [EstimatedAffectedCount] INT NULL,
                    [NotedAt] DATETIME NOT NULL DEFAULT GETDATE(),
                    [ResolvedAt] DATETIME NULL,
                    [UserId] INT NOT NULL,
                    [Notes] NVARCHAR(500) NULL,
                    CONSTRAINT FK_Outbreak_Pond FOREIGN KEY (PondId) REFERENCES Ponds(PondId),
                    CONSTRAINT FK_Outbreak_Disease FOREIGN KEY (DiseaseId) REFERENCES Disease_Catalog(DiseaseId),
                    CONSTRAINT FK_Outbreak_User FOREIGN KEY (UserId) REFERENCES Users(UserId)
                )
            `);
            console.log('✅ Disease_Outbreaks table created.');
        } else {
            // Check if BatchId exists, if not add it (Migration)
            const colCheck = await pool.request().query(`
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'Disease_Outbreaks' AND COLUMN_NAME = 'BatchId'
            `);
            if (colCheck.recordset.length === 0) {
                console.log('🩺 Adding BatchId column to Disease_Outbreaks...');
                await pool.request().query(`ALTER TABLE Disease_Outbreaks ADD BatchId INT NULL;`);
            }
        }

        // Check if Treatment_Logs exists
        const treatmentCheck = await pool.request().query(`
            SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Treatment_Logs'
        `);

        if (treatmentCheck.recordset.length === 0) {
            console.log('🩺 Creating Treatment_Logs table...');
            await pool.request().query(`
                CREATE TABLE [dbo].[Treatment_Logs](
                    [TreatmentId] INT IDENTITY(1,1) PRIMARY KEY,
                    [OutbreakId] INT NOT NULL,
                    [TreatmentType] NVARCHAR(50) NOT NULL,
                    [Description] NVARCHAR(500) NOT NULL,
                    [Dosage] NVARCHAR(100) NULL,
                    [Cost] DECIMAL(10,2) NULL DEFAULT 0,
                    [AppliedAt] DATETIME NOT NULL DEFAULT GETDATE(),
                    [FollowUpDate] DATETIME NULL,
                    [Outcome] NVARCHAR(20) NULL DEFAULT 'Pending',
                    [UserId] INT NOT NULL,
                    [Notes] NVARCHAR(500) NULL,
                    CONSTRAINT FK_Treatment_Outbreak FOREIGN KEY (OutbreakId) REFERENCES Disease_Outbreaks(OutbreakId),
                    CONSTRAINT FK_Treatment_User FOREIGN KEY (UserId) REFERENCES Users(UserId)
                )
            `);
            console.log('✅ Treatment_Logs table created.');
        }

        tablesVerified = true;
    } catch (err) {
        console.error('⚠️ Disease table auto-create error:', err.message);
    }
};

// ============================================
// DISEASE CATALOG
// ============================================

// Auto-seed: Populates the Disease_Catalog table if it's empty
const seedCatalog = async (pool) => {
    const check = await pool.request().query('SELECT COUNT(*) as cnt FROM Disease_Catalog');
    if (check.recordset[0].cnt > 0) return; // Already seeded

    console.log('🩺 Seeding Disease_Catalog with default diseases...');

    const diseases = [
        { name: 'EUS (Epizootic Ulcerative Syndrome)', category: 'Fungal', symptoms: 'Red sores, deep ulcers on body, lethargic behavior, loss of appetite', species: 'Rohu, Catla, Mrigal', treatment: 'Apply lime (CaO) at 200-300 kg/ha. Use CIFAX at 1L/ha. Salt bath (2-3% solution for 10-15 min)', prevention: 'Maintain water quality, avoid overcrowding, apply lime regularly during winter', severity: 'Severe' },
        { name: 'Gill Rot (Branchiomycosis)', category: 'Fungal', symptoms: 'Swollen gills, gasping at surface, gills appear mottled gray/brown, reduced feeding', species: 'All freshwater species', treatment: 'KMnO4 bath (2-5 ppm for 1 hour). Lime application. Improve aeration', prevention: 'Maintain good water quality, avoid organic pollution, regular water exchange', severity: 'Severe' },
        { name: 'Dropsy (Edema)', category: 'Bacterial', symptoms: 'Swollen abdomen, raised scales (pinecone appearance), bulging eyes, fluid accumulation', species: 'Rohu, Mrigal, Catla', treatment: 'Salt bath (2% solution). Oxytetracycline in feed (50-75 mg/kg body weight for 10 days). Improve water quality', prevention: 'Avoid stress, maintain optimal water parameters, quarantine new fish', severity: 'Severe' },
        { name: 'Argulosis (Fish Lice)', category: 'Parasitic', symptoms: 'Visible round parasites on body, scratching against objects, red spots at attachment sites, restlessness', species: 'All freshwater species', treatment: 'Sumithion/Malathion dip (0.25 ppm). Manual removal. Gammexane at 0.01 ppm', prevention: 'Screen water inlet, quarantine new stock, periodic checks', severity: 'Moderate' },
        { name: 'Fin Rot', category: 'Bacterial', symptoms: 'Frayed or disintegrating fins, whitish edges on fins, redness at fin base, secondary fungal infection', species: 'All freshwater species', treatment: 'Salt bath (1-2%). Oxytetracycline bath (10-50 ppm). Improve water quality', prevention: 'Avoid handling injuries, maintain water quality, reduce stress', severity: 'Mild' },
        { name: 'Columnaris Disease', category: 'Bacterial', symptoms: 'White/gray patches on skin, cottony growth on mouth, fins or gills, saddle-back lesion', species: 'Catla, Rohu, Tilapia', treatment: 'KMnO4 bath (2 ppm). Terramycin in feed. Salt bath (1-3%)', prevention: 'Reduce stocking density, maintain dissolved oxygen, avoid temperature stress', severity: 'Moderate' },
        { name: 'Ichthyophthirius (White Spot/Ich)', category: 'Parasitic', symptoms: 'White spots on body and fins, scratching/flashing, clamped fins, lethargy, loss of appetite', species: 'All freshwater species', treatment: 'Formalin bath (25-30 ppm). Salt bath (2-3%). Raise temperature gradually to 30°C', prevention: 'Quarantine new fish, avoid sudden temperature changes, maintain immunity', severity: 'Moderate' },
        { name: 'Saprolegniasis (Water Mold)', category: 'Fungal', symptoms: 'Cotton-like white/gray growth on skin, eggs or wounds, lethargic behavior', species: 'All freshwater species', treatment: 'Salt bath (2-3%). Malachite green bath (0.1-0.2 ppm). KMnO4 (2-5 ppm)', prevention: 'Avoid injuries during handling, remove dead fish/eggs promptly, maintain water quality', severity: 'Moderate' },
        { name: 'Trichodiniasis', category: 'Parasitic', symptoms: 'Excess mucus on skin, grayish-blue coloration, gasping, scratching, gill damage', species: 'Fry and fingerlings', treatment: 'Formalin bath (25 ppm for 1 hour). Salt bath (2-3%). KMnO4 (3-5 ppm)', prevention: 'Avoid overcrowding in nursery ponds, maintain water quality, periodic checks', severity: 'Mild' },
        { name: 'Red Disease (Bacterial Hemorrhagic Septicemia)', category: 'Bacterial', symptoms: 'Red patches/streaks on body, hemorrhaging at fin base, bulging eyes, abdominal swelling', species: 'Catla, Rohu, Mrigal', treatment: 'Oxytetracycline in feed (75 mg/kg for 10 days). KMnO4 bath. Lime application', prevention: 'Good nutrition, avoid overcrowding, maintain water parameters', severity: 'Severe' },
        { name: 'Nutritional Deficiency', category: 'Nutritional', symptoms: 'Slow growth, deformities, poor coloration, weak immune response, scoliosis', species: 'All species', treatment: 'Supplement feed with vitamins and minerals. Use balanced commercial feed. Add Vitamin C', prevention: 'Use quality feed, vary diet, supplement during stress periods', severity: 'Mild' },
        { name: 'Lernaeasis (Anchor Worm)', category: 'Parasitic', symptoms: 'Visible worm-like parasites protruding from skin, red sores at attachment, weight loss', species: 'All freshwater species', treatment: 'Dipterex/Trichlorfon (0.25-0.50 ppm). Manual removal with tweezers. KMnO4 (10 ppm dip)', prevention: 'Screen incoming water, quarantine new stock, periodic visual checks', severity: 'Moderate' },
    ];

    for (const d of diseases) {
        await pool.request()
            .input('name', sql.NVarChar(100), d.name)
            .input('category', sql.NVarChar(50), d.category)
            .input('symptoms', sql.NVarChar(500), d.symptoms)
            .input('species', sql.NVarChar(255), d.species)
            .input('treatment', sql.NVarChar(500), d.treatment)
            .input('prevention', sql.NVarChar(500), d.prevention)
            .input('severity', sql.NVarChar(20), d.severity)
            .query(`
                INSERT INTO Disease_Catalog (DiseaseName, Category, Symptoms, AffectedSpecies, RecommendedTreatment, PreventionTips, Severity)
                VALUES (@name, @category, @symptoms, @species, @treatment, @prevention, @severity)
            `);
    }

    console.log('✅ Disease_Catalog seeded with', diseases.length, 'diseases.');
};

// @route   GET /api/diseases/catalog
// @desc    Get all diseases from the catalog (auto-seeds if empty)
router.get('/catalog', auth, async (req, res) => {
    try {
        const pool = req.pool;

        // Auto-create tables + seed on first access
        await ensureTablesExist(pool);
        await seedCatalog(pool);

        const result = await pool.request().query(`
            SELECT DiseaseId, DiseaseName, Category, Symptoms, AffectedSpecies,
                   RecommendedTreatment, PreventionTips, Severity
            FROM Disease_Catalog
            WHERE IsActive = 1
            ORDER BY Category, DiseaseName
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Disease Catalog Error:", err.message);
        res.status(500).json({ error: "Failed to fetch disease catalog", details: err.message });
    }
});

// ============================================
// DISEASE OUTBREAKS
// ============================================

// @route   POST /api/diseases/outbreaks
// @desc    Log a new disease outbreak for a pond
router.post('/outbreaks', auth, async (req, res) => {
    const { pondId, diseaseId, customDiseaseName, speciesId, batchId, severity, symptomsObserved, estimatedAffectedCount, notes } = req.body;

    if (!pondId) return res.status(400).json({ success: false, message: "Pond ID is required." });
    if (!diseaseId && !customDiseaseName) return res.status(400).json({ success: false, message: "Select a disease or enter a custom disease name." });

    try {
        const pool = req.pool;
        await ensureTablesExist(pool);
        const result = await pool.request()
            .input('pondId', sql.Int, pondId)
            .input('diseaseId', sql.Int, diseaseId || null)
            .input('customName', sql.NVarChar(100), customDiseaseName || null)
            .input('speciesId', sql.Int, speciesId || null)
            .input('batchId', sql.Int, batchId || null)
            .input('severity', sql.NVarChar(20), severity || 'Moderate')
            .input('symptoms', sql.NVarChar(500), symptomsObserved || null)
            .input('affectedCount', sql.Int, estimatedAffectedCount || null)
            .input('notes', sql.NVarChar(500), notes || null)
            .input('userId', sql.Int, req.user.id)
            .query(`
                INSERT INTO Disease_Outbreaks 
                    (PondId, DiseaseId, CustomDiseaseName, SpeciesId, BatchId, Severity, SymptomsObserved, EstimatedAffectedCount, Notes, UserId)
                VALUES 
                    (@pondId, @diseaseId, @customName, @speciesId, @batchId, @severity, @symptoms, @affectedCount, @notes, @userId);
                
                SELECT SCOPE_IDENTITY() as OutbreakId;
            `);

        res.status(201).json({
            success: true,
            message: "Disease outbreak logged successfully.",
            outbreakId: result.recordset[0].OutbreakId
        });
    } catch (err) {
        console.error("Log Outbreak Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// @route   GET /api/diseases/outbreaks
// @desc    Get all outbreaks for the user's farm (with pond names & disease info)
router.get('/outbreaks', auth, async (req, res) => {
    try {
        const pool = req.pool;
        await ensureTablesExist(pool);
        const result = await pool.request()
            .input('userId', sql.Int, req.user.id)
            .query(`
                SELECT 
                    o.OutbreakId,
                    o.PondId,
                    p.PondName,
                    o.DiseaseId,
                    COALESCE(d.DiseaseName, o.CustomDiseaseName) as DiseaseName,
                    d.Category as DiseaseCategory,
                    d.Symptoms as CatalogSymptoms,
                    d.AffectedSpecies,
                    d.RecommendedTreatment,
                    d.PreventionTips,
                    o.Severity,
                    o.Status,
                    o.SymptomsObserved,
                    o.EstimatedAffectedCount,
                    o.NotedAt,
                    o.ResolvedAt,
                    o.Notes,
                    o.SpeciesId,
                    o.BatchId as AffectedBatchId,
                    s.Name as AffectedSpeciesName,
                    (SELECT COUNT(*) FROM Treatment_Logs t WHERE t.OutbreakId = o.OutbreakId) as TreatmentCount
                FROM Disease_Outbreaks o
                JOIN Ponds p ON o.PondId = p.PondId
                JOIN Farm f ON p.FarmId = f.FarmId AND f.UserId = @userId
                LEFT JOIN Disease_Catalog d ON o.DiseaseId = d.DiseaseId
                LEFT JOIN Species s ON o.SpeciesId = s.SpeciesID
                ORDER BY 
                    CASE o.Status 
                        WHEN 'Active' THEN 1 
                        WHEN 'Treating' THEN 2 
                        WHEN 'Resolved' THEN 3 
                    END,
                    o.NotedAt DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Fetch Outbreaks Error:", err.message);
        res.status(500).json({ error: "Failed to fetch outbreaks", details: err.message });
    }
});

// @route   PUT /api/diseases/outbreaks/:id
// @desc    Update outbreak details/status (e.g., Active -> Treating -> Resolved)
router.put('/outbreaks/:id', auth, async (req, res) => {
    const {
        status,
        notes,
        customDiseaseName,
        diseaseId,
        speciesId,
        batchId,
        severity,
        symptomsObserved,
        estimatedAffectedCount
    } = req.body;
    const outbreakId = req.params.id;
    const has = (field) => Object.prototype.hasOwnProperty.call(req.body, field);

    try {
        const pool = req.pool;
        const request = pool.request()
            .input('id', sql.Int, outbreakId)
            .input('hasStatus', sql.Bit, has('status') ? 1 : 0)
            .input('status', sql.NVarChar(20), status || null)
            .input('hasNotes', sql.Bit, has('notes') ? 1 : 0)
            .input('notes', sql.NVarChar(500), notes ?? null)
            .input('hasCustomName', sql.Bit, has('customDiseaseName') ? 1 : 0)
            .input('customName', sql.NVarChar(100), customDiseaseName || null)
            .input('hasDiseaseId', sql.Bit, has('diseaseId') ? 1 : 0)
            .input('diseaseId', sql.Int, diseaseId || null)
            .input('hasSpeciesId', sql.Bit, has('speciesId') ? 1 : 0)
            .input('speciesId', sql.Int, speciesId || null)
            .input('hasBatchId', sql.Bit, has('batchId') ? 1 : 0)
            .input('batchId', sql.Int, batchId || null)
            .input('hasSeverity', sql.Bit, has('severity') ? 1 : 0)
            .input('severity', sql.NVarChar(20), severity || 'Moderate')
            .input('hasSymptoms', sql.Bit, has('symptomsObserved') ? 1 : 0)
            .input('symptoms', sql.NVarChar(500), symptomsObserved ?? null)
            .input('hasAffectedCount', sql.Bit, has('estimatedAffectedCount') ? 1 : 0)
            .input('affectedCount', sql.Int, estimatedAffectedCount || null)
            .input('userId', sql.Int, req.user.id);

        await request.query(`
            UPDATE o
            SET
                Status = CASE WHEN @hasStatus = 1 THEN @status ELSE o.Status END,
                Notes = CASE WHEN @hasNotes = 1 THEN @notes ELSE o.Notes END,
                CustomDiseaseName = CASE WHEN @hasCustomName = 1 THEN @customName ELSE o.CustomDiseaseName END,
                DiseaseId = CASE WHEN @hasDiseaseId = 1 THEN @diseaseId ELSE o.DiseaseId END,
                SpeciesId = CASE WHEN @hasSpeciesId = 1 THEN @speciesId ELSE o.SpeciesId END,
                BatchId = CASE WHEN @hasBatchId = 1 THEN @batchId ELSE o.BatchId END,
                Severity = CASE WHEN @hasSeverity = 1 THEN @severity ELSE o.Severity END,
                SymptomsObserved = CASE WHEN @hasSymptoms = 1 THEN @symptoms ELSE o.SymptomsObserved END,
                EstimatedAffectedCount = CASE WHEN @hasAffectedCount = 1 THEN @affectedCount ELSE o.EstimatedAffectedCount END,
                ResolvedAt = CASE
                    WHEN @hasStatus = 1 AND @status = 'Resolved' THEN GETDATE()
                    WHEN @hasStatus = 1 AND @status <> 'Resolved' THEN NULL
                    ELSE o.ResolvedAt
                END
            FROM Disease_Outbreaks o
            JOIN Ponds p ON o.PondId = p.PondId
            JOIN Farm f ON p.FarmId = f.FarmId AND f.UserId = @userId
            WHERE o.OutbreakId = @id
        `);

        res.json({ success: true, message: `Outbreak status updated to ${status}.` });
    } catch (err) {
        console.error("Update Outbreak Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// @route   DELETE /api/diseases/outbreaks/:id
// @desc    Delete an outbreak and its treatments
router.delete('/outbreaks/:id', auth, async (req, res) => {
    const outbreakId = req.params.id;
    const transaction = new sql.Transaction(req.pool);

    try {
        await transaction.begin();

        // Delete treatments first
        await transaction.request()
            .input('id', sql.Int, outbreakId)
            .query('DELETE FROM Treatment_Logs WHERE OutbreakId = @id');

        // Delete outbreak
        await transaction.request()
            .input('id', sql.Int, outbreakId)
            .query('DELETE FROM Disease_Outbreaks WHERE OutbreakId = @id');

        await transaction.commit();
        res.json({ success: true, message: "Outbreak deleted." });
    } catch (err) {
        if (transaction) try { await transaction.rollback(); } catch (e) { }
        console.error("Delete Outbreak Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// TREATMENTS
// ============================================

// @route   POST /api/diseases/treatments
// @desc    Log a treatment for an outbreak
router.post('/treatments', auth, async (req, res) => {
    const { outbreakId, treatmentType, description, dosage, cost, followUpDate, outcome, notes, stockId, quantityUsed } = req.body;

    if (!outbreakId || !treatmentType || !description) {
        return res.status(400).json({ success: false, message: "Outbreak ID, treatment type, and description are required." });
    }

    try {
        const transaction = new sql.Transaction(req.pool);
        await transaction.begin();

        try {
            // 1. Verify Stock if provided
            if (stockId && quantityUsed > 0) {
                const stockCheck = await transaction.request()
                    .input('stockId', sql.Int, stockId)
                    .input('userId', sql.Int, req.user.id)
                    .query(`SELECT CurrentQuantity FROM Treatment_Stock WHERE StockId = @stockId AND UserId = @userId`);
                
                if (stockCheck.recordset.length === 0) {
                    throw new Error("Selected treatment stock not found.");
                }

                if (stockCheck.recordset[0].CurrentQuantity < quantityUsed) {
                    throw new Error(`Not enough medicine in stock. Only ${stockCheck.recordset[0].CurrentQuantity} available.`);
                }
            }

            // 2. Log the treatment
            await transaction.request()
                .input('outbreakId', sql.Int, outbreakId)
                .input('type', sql.NVarChar(50), treatmentType)
                .input('desc', sql.NVarChar(500), description)
                .input('dosage', sql.NVarChar(100), dosage || null)
                .input('cost', sql.Decimal(10, 2), cost || 0)
                .input('followUp', sql.DateTime, followUpDate ? new Date(followUpDate) : null)
                .input('outcome', sql.NVarChar(20), outcome || 'Pending')
                .input('notes', sql.NVarChar(500), notes || null)
                .input('userId', sql.Int, req.user.id)
                .query(`
                    INSERT INTO Treatment_Logs 
                        (OutbreakId, TreatmentType, Description, Dosage, Cost, FollowUpDate, Outcome, Notes, UserId)
                    VALUES 
                        (@outbreakId, @type, @desc, @dosage, @cost, @followUp, @outcome, @notes, @userId)
                `);

            // 3. Auto-update outbreak status to 'Treating' if currently 'Active'
            await transaction.request()
                .input('outbreakId', sql.Int, outbreakId)
                .query(`
                    UPDATE Disease_Outbreaks 
                    SET Status = 'Treating' 
                    WHERE OutbreakId = @outbreakId AND Status = 'Active'
                `);

            // 4. Deduct Stock if provided
            if (stockId && quantityUsed > 0) {
                await transaction.request()
                    .input('stockId', sql.Int, stockId)
                    .input('userId', sql.Int, req.user.id)
                    .input('qty', sql.Float, quantityUsed)
                    .query(`
                        UPDATE Treatment_Stock 
                        SET CurrentQuantity = CurrentQuantity - @qty 
                        WHERE StockId = @stockId AND UserId = @userId
                    `);
            }

            await transaction.commit();
            res.status(201).json({ success: true, message: "Treatment logged successfully." });

        } catch (innerErr) {
            await transaction.rollback();
            throw innerErr;
        }
    } catch (err) {
        console.error("Log Treatment Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// @route   GET /api/diseases/outbreaks/:id/treatments
// @desc    Get all treatments for a specific outbreak
router.get('/outbreaks/:id/treatments', auth, async (req, res) => {
    try {
        const pool = req.pool;
        const result = await pool.request()
            .input('outbreakId', sql.Int, req.params.id)
            .query(`
                SELECT TreatmentId, TreatmentType, Description, Dosage, Cost, 
                       AppliedAt, FollowUpDate, Outcome, Notes
                FROM Treatment_Logs
                WHERE OutbreakId = @outbreakId
                ORDER BY AppliedAt DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Fetch Treatments Error:", err.message);
        res.status(500).json({ error: "Failed to fetch treatments", details: err.message });
    }
});

// ============================================
// DASHBOARD SUMMARY
// ============================================

// @route   GET /api/diseases/dashboard
// @desc    Get health summary stats for user's farm
router.get('/dashboard', auth, async (req, res) => {
    try {
        const pool = req.pool;
        await ensureTablesExist(pool);
        const result = await pool.request()
            .input('userId', sql.Int, req.user.id)
            .query(`
                SELECT 
                    (SELECT COUNT(*) FROM Disease_Outbreaks o 
                     JOIN Ponds p ON o.PondId = p.PondId 
                     JOIN Farm f ON p.FarmId = f.FarmId 
                     WHERE f.UserId = @userId AND o.Status = 'Active') as ActiveOutbreaks,
                    
                    (SELECT COUNT(*) FROM Disease_Outbreaks o 
                     JOIN Ponds p ON o.PondId = p.PondId 
                     JOIN Farm f ON p.FarmId = f.FarmId 
                     WHERE f.UserId = @userId AND o.Status = 'Treating') as TreatingOutbreaks,
                    
                    (SELECT COUNT(*) FROM Disease_Outbreaks o 
                     JOIN Ponds p ON o.PondId = p.PondId 
                     JOIN Farm f ON p.FarmId = f.FarmId 
                     WHERE f.UserId = @userId AND o.Status = 'Resolved') as ResolvedOutbreaks,
                    
                    (SELECT ISNULL(SUM(t.Cost), 0) FROM Treatment_Logs t
                     JOIN Disease_Outbreaks o ON t.OutbreakId = o.OutbreakId
                     JOIN Ponds p ON o.PondId = p.PondId 
                     JOIN Farm f ON p.FarmId = f.FarmId 
                     WHERE f.UserId = @userId) as TotalTreatmentCost,

                    (SELECT COUNT(DISTINCT o.PondId) FROM Disease_Outbreaks o 
                     JOIN Ponds p ON o.PondId = p.PondId 
                     JOIN Farm f ON p.FarmId = f.FarmId 
                     WHERE f.UserId = @userId AND o.Status IN ('Active', 'Treating')) as AffectedPonds
            `);
        
        res.json(result.recordset[0] || {
            ActiveOutbreaks: 0,
            TreatingOutbreaks: 0,
            ResolvedOutbreaks: 0,
            TotalTreatmentCost: 0,
            AffectedPonds: 0
        });
    } catch (err) {
        console.error("Disease Dashboard Error:", err.message);
        res.status(500).json({ error: "Failed to fetch disease dashboard", details: err.message });
    }
});

module.exports = router;
