const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');

// GET: Fetch recent active announcements
// Since this is for all farmers, we might not require auth, but we can return recent announcements.
router.get('/', async (req, res) => {
    try {
        const pool = req.pool;

        // Check if the table exists first (in case it hasn't been created yet)
        const check = await pool.request().query(`
            SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Announcements'
        `);

        if (check.recordset.length === 0) {
            // Table doesn't exist yet, so no announcements
            return res.json({ success: true, notifications: [] });
        }

        // Fetch the latest 20 announcements, descending by CreatedAt
        const result = await pool.request().query(`
            SELECT TOP 20 Id, Title, Message, Type, CreatedAt
            FROM Announcements
            ORDER BY CreatedAt DESC
        `);

        res.json({ success: true, notifications: result.recordset });
    } catch (err) {
        console.error("Fetch Notifications Error:", err.message);
        res.status(500).json({ error: "Failed to fetch notifications", message: err.message });
    }
});

module.exports = router;
