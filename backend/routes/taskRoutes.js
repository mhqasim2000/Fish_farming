const express = require('express');
const router = express.Router();
const sql = require('mssql/msnodesqlv8');
const auth = require('../middleware/auth');

let farmTasksTableVerified = false;

const ensureFarmTasksTable = async (pool) => {
    if (farmTasksTableVerified) return;

    await pool.request().query(`
        IF OBJECT_ID('FarmTasks', 'U') IS NULL
        BEGIN
            CREATE TABLE [dbo].[FarmTasks](
                [TaskId] INT IDENTITY(1,1) PRIMARY KEY,
                [UserId] INT NOT NULL,
                [Description] NVARCHAR(255) NOT NULL,
                [IsCompleted] BIT NOT NULL DEFAULT 0,
                [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE()
            )
        END
    `);

    farmTasksTableVerified = true;
};

// --- 1. GET: Fetch Manual + AI Auto-Generated Tasks ---
router.get('/', auth, async (req, res) => {
    try {
        const pool = req.pool;
        const uId = req.user.id;
        const tasks = [];
        await ensureFarmTasksTable(pool);

        // A. Get Manual Tasks
        const manualTasks = await pool.request()
            .input('uId', sql.Int, uId)
            .query('SELECT * FROM FarmTasks WHERE UserId = @uId AND IsCompleted = 0 ORDER BY CreatedAt DESC');
            
        manualTasks.recordset.forEach(task => {
            tasks.push({
                id: task.TaskId,
                description: task.Description,
                isAuto: false,
                isCompleted: false,
                createdAt: task.CreatedAt
            });
        });

        // B. Generate AI Tasks Dynamically
        // 1. Growth Reminder (14 days without size update)
        const growthCheck = await pool.request()
            .input('uId', sql.Int, uId)
            .query(`
                SELECT p.PondName 
                FROM Stocking st
                JOIN Ponds p ON st.CurrentPondId = p.PondId
                WHERE st.UserId = @uId 
                AND (st.LastSizeUpdateDate IS NULL OR DATEDIFF(day, st.LastSizeUpdateDate, GETDATE()) > 14)
                GROUP BY p.PondName
            `);
            
        growthCheck.recordset.forEach(row => {
            tasks.push({
                id: `auto_growth_${row.PondName}`,
                description: `Measure fish size in ${row.PondName}`,
                isAuto: true,
                isCompleted: false,
                category: 'Growth'
            });
        });

        // 2. Water Quality Reminder (7 days without logging)
        const waterCheck = await pool.request()
            .input('uId', sql.Int, uId)
            .query(`
                SELECT p.PondId, p.PondName 
                FROM Ponds p
                WHERE p.UserId = @uId
                AND NOT EXISTS (
                    SELECT 1 FROM water_quality_logs w 
                    WHERE w.PondId = p.PondId 
                    AND DATEDIFF(day, w.recorded_at, GETDATE()) <= 7
                )
            `);
            
        waterCheck.recordset.forEach(row => {
            tasks.push({
                id: `auto_water_${row.PondId}`,
                description: `Check water parameters for ${row.PondName}`,
                isAuto: true,
                isCompleted: false,
                category: 'Water'
            });
        });

        // 3. Feed Reminder (Not fed today)
        // Check Expense_logs where type is feed or description contains feed, or check FeedLog if exists.
        // We'll approximate this by checking the Expense_Log table for 'Feed' today, just to have a basic trigger.
        const feedCheck = await pool.request()
            .input('uId', sql.Int, uId)
            .query(`
                SELECT p.PondId, p.PondName 
                FROM Ponds p
                JOIN Stocking s ON s.CurrentPondId = p.PondId
                WHERE p.UserId = @uId
                AND NOT EXISTS (
                    SELECT 1 FROM Feed_Logs f
                    WHERE f.PondId = p.PondId 
                    AND CAST(f.FeedDate AS DATE) = CAST(GETDATE() AS DATE)
                )
                GROUP BY p.PondId, p.PondName
            `);

        feedCheck.recordset.forEach(row => {
            tasks.push({
                id: `auto_feed_${row.PondId}`,
                description: `Feed fish in ${row.PondName}`,
                isAuto: true,
                isCompleted: false,
                category: 'Feed'
            });
        });

        // 4. Fertilizer Reminder (Extensive ponds, > 14 days)
        const fertCheck = await pool.request()
            .input('uId', sql.Int, uId)
            .query(`
                SELECT p.PondId, p.PondName 
                FROM Ponds p
                WHERE p.UserId = @uId
                AND p.CultivationType IN ('Extensive', 'Semi-Intensive')
                AND NOT EXISTS (
                    SELECT 1 FROM Fertilizers_Logs fl
                    WHERE fl.PondId = p.PondId 
                    AND DATEDIFF(day, fl.ApplicationDate, GETDATE()) <= 14
                )
            `);

        fertCheck.recordset.forEach(row => {
            tasks.push({
                id: `auto_fert_${row.PondId}`,
                description: `Apply fertilizer to ${row.PondName}`,
                isAuto: true,
                isCompleted: false,
                category: 'Fertilizer'
            });
        });

        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch tasks", details: err.message });
    }
});

// --- 2. POST: Add Manual Task ---
router.post('/add', auth, async (req, res) => {
    try {
        const { description } = req.body;
        if (!description) return res.status(400).json({ error: "Description is required" });

        await ensureFarmTasksTable(req.pool);
        await req.pool.request()
            .input('uId', sql.Int, req.user.id)
            .input('desc', sql.NVarChar(255), description)
            .query('INSERT INTO FarmTasks (UserId, Description) VALUES (@uId, @desc)');

        res.json({ success: true, message: "Task added successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to add task", details: err.message });
    }
});

// --- 3. PUT: Complete Manual Task ---
router.put('/complete/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        await ensureFarmTasksTable(req.pool);
        await req.pool.request()
            .input('id', sql.Int, id)
            .input('uId', sql.Int, req.user.id)
            .query('UPDATE FarmTasks SET IsCompleted = 1 WHERE TaskId = @id AND UserId = @uId');

        res.json({ success: true, message: "Task completed" });
    } catch (err) {
        res.status(500).json({ error: "Failed to complete task", details: err.message });
    }
});

// --- 4. DELETE: Remove Manual Task ---
router.delete('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        await ensureFarmTasksTable(req.pool);
        await req.pool.request()
            .input('id', sql.Int, id)
            .input('uId', sql.Int, req.user.id)
            .query('DELETE FROM FarmTasks WHERE TaskId = @id AND UserId = @uId');

        res.json({ success: true, message: "Task removed" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete task", details: err.message });
    }
});

module.exports = router;
