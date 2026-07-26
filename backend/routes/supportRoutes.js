const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const auth = require('../middleware/auth');

// ============================================
// AUTO-CREATE: Ensure Support_Tickets table exists
// ============================================
let tableVerified = false;

const ensureTableExists = async (pool) => {
    if (tableVerified) return;

    try {
        const check = await pool.request().query(`
            SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Support_Tickets'
        `);

        if (check.recordset.length === 0) {
            console.log('📩 Creating Support_Tickets table...');
            await pool.request().query(`
                CREATE TABLE [dbo].[Support_Tickets](
                    [TicketId] INT IDENTITY(1,1) PRIMARY KEY,
                    [UserId] INT NOT NULL,
                    [Subject] NVARCHAR(200) NOT NULL,
                    [Message] NVARCHAR(1000) NOT NULL,
                    [Category] NVARCHAR(50) NOT NULL DEFAULT 'General',
                    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Open',
                    [AdminReply] NVARCHAR(1000) NULL,
                    [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
                    [UpdatedAt] DATETIME NULL,
                    CONSTRAINT FK_Ticket_User FOREIGN KEY (UserId) REFERENCES Users(UserId)
                )
            `);
            console.log('✅ Support_Tickets table created.');
        }

        tableVerified = true;
    } catch (err) {
        console.error('⚠️ Support_Tickets table auto-create error:', err.message);
    }
};

// ============================================
// USER ENDPOINTS
// ============================================

// POST: Submit a new support ticket
router.post('/', auth, async (req, res) => {
    try {
        const pool = req.pool;
        await ensureTableExists(pool);

        const { subject, message, category } = req.body;

        if (!subject || !message) {
            return res.status(400).json({ error: "Subject and message are required." });
        }

        await pool.request()
            .input('userId', sql.Int, req.user.id)
            .input('subject', sql.NVarChar(200), subject)
            .input('message', sql.NVarChar(1000), message)
            .input('category', sql.NVarChar(50), category || 'General')
            .query(`
                INSERT INTO Support_Tickets (UserId, Subject, Message, Category)
                VALUES (@userId, @subject, @message, @category)
            `);

        res.json({ success: true, message: "Support ticket submitted successfully." });
    } catch (err) {
        console.error("Submit Ticket Error:", err.message);
        res.status(500).json({ error: "Failed to submit ticket", message: err.message });
    }
});

// GET: Fetch current user's tickets
router.get('/', auth, async (req, res) => {
    try {
        const pool = req.pool;
        await ensureTableExists(pool);

        const result = await pool.request()
            .input('userId', sql.Int, req.user.id)
            .query(`
                SELECT TicketId, Subject, Message, Category, Status, AdminReply, CreatedAt, UpdatedAt
                FROM Support_Tickets
                WHERE UserId = @userId
                ORDER BY CreatedAt DESC
            `);

        res.json({ success: true, tickets: result.recordset });
    } catch (err) {
        console.error("Fetch My Tickets Error:", err.message);
        res.status(500).json({ error: "Failed to fetch tickets", message: err.message });
    }
});

module.exports = router;
