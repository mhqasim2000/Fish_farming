const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const auth = require('../middleware/auth');

let expenseSchemaVerified = false;

const ensureExpenseSchema = async (pool) => {
    if (expenseSchemaVerified) return;

    await pool.request().query(`
        IF COL_LENGTH('Expense_log', 'UserId') IS NULL
            ALTER TABLE Expense_log ADD UserId INT NULL;
    `);

    expenseSchemaVerified = true;
};

// 1. CREATE: Add a new expense (Labor, Electricity, Medicine, etc.)
// Matches the "Add Expense" popup in your Figma mockup
router.post('/add', auth, async (req, res) => {
    try {
        const { pondId, category, amount, description } = req.body;
        const pool = req.pool;
        await ensureExpenseSchema(pool);

        await pool.request()
            .input('pid', sql.Int, pondId)
            .input('cat', sql.NVarChar(50), category)
            .input('amt', sql.Decimal(18, 2), amount)
            .input('desc', sql.NVarChar(sql.MAX), description || '')
            .input('uid', sql.Int, req.user.id)
            .query(`
                INSERT INTO Expense_log (UserId, PondId, Category, Amount, Description)
                VALUES (@uid, @pid, @cat, @amt, @desc)
            `);

        res.status(201).json({
            success: true,
            message: "Expense logged successfully!"
        });
    } catch (err) {
        res.status(500).json({ error: "Database Error", message: err.message });
    }
});

// 5. SUMMARY: Get total farm expenses and breakdown by category
// Powers the "Total Expenses" orange card and category charts
router.get('/summary/all', auth, async (req, res) => {
    try {
        const pool = req.pool;
        const userId = req.user.id;
        await ensureExpenseSchema(pool);
        const result = await pool.request()
            .input('uId', sql.Int, userId)
            .query(`
                -- Total of every expense ever recorded for this user
                SELECT ISNULL(SUM(Amount), 0) as GrandTotal 
                FROM Expense_log 
                WHERE UserId = @uId;

                -- Breakdown by category for the "Budget & Expenses" charts
                SELECT Category, ISNULL(SUM(Amount), 0) as CategoryTotal 
                FROM Expense_log 
                WHERE UserId = @uId
                GROUP BY Category;
            `);

        res.json({
            overall: result.recordsets[0][0], // GrandTotal: 50000.00
            breakdown: result.recordsets[1]   // [{Category: 'Feed', CategoryTotal: 20000}, ...]
        });
    } catch (err) {
        res.status(500).json({ error: "Global Summary Failed", message: err.message });
    }
});

// GET: Pond-specific expense breakdown for ROI Calculator
// Maps categories into 4 buckets: Fingerling, Feed, Fertilizer, Other
router.get('/pond/:pondId/breakdown', auth, async (req, res) => {
    try {
        const pool = req.pool;
        const pondId = parseInt(req.params.pondId);
        const userId = req.user.id;
        await ensureExpenseSchema(pool);

        const result = await pool.request()
            .input('pid', sql.Int, pondId)
            .input('uid', sql.Int, userId)
            .query(`
                SELECT Category, ISNULL(SUM(Amount), 0) as Total
                FROM Expense_log
                WHERE PondId = @pid AND UserId = @uid
                GROUP BY Category
            `);

        // Map DB categories into ROI buckets
        let fingerlingCost = 0, feedCost = 0, fertilizerCost = 0, otherCost = 0;
        for (const row of result.recordset) {
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

        res.json({ fingerlingCost, feedCost, fertilizerCost, otherCost });
    } catch (err) {
        res.status(500).json({ error: "Failed to get pond expense breakdown", message: err.message });
    }
});

// 6. DASHBOARD: Comprehensive User-Specific Dashboard Stats
// Powers the app/budget/page.jsx UI 
router.get('/dashboard', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const pool = req.pool;
        await ensureExpenseSchema(pool);

        const result = await pool.request()
            .input('uId', sql.Int, userId)
            .query(`
                -- 1. All-Time User Expenses
                SELECT ISNULL(SUM(E.Amount), 0) as TotalAllTime, COUNT(E.ExpenseId) as TotalCount
                FROM Expense_log E
                WHERE E.UserId = @uId;

                -- 2. Last 30 Days Expenses
                SELECT ISNULL(SUM(E.Amount), 0) as Last30Days, COUNT(E.ExpenseId) as Count30Days
                FROM Expense_log E
                WHERE E.UserId = @uId
                AND E.ExpenseDate >= DATEADD(day, -30, GETDATE());

                -- 3. Category Breakdown (All-Time) & Highest Category
                SELECT E.Category, ISNULL(SUM(E.Amount), 0) as CategoryTotal
                FROM Expense_log E
                WHERE E.UserId = @uId
                GROUP BY E.Category
                ORDER BY CategoryTotal DESC;

                -- 4. Recent Expenses
                SELECT TOP 10 E.ExpenseId, E.Category, E.Amount, E.Description, E.ExpenseDate, ISNULL(P.PondName, 'General') as PondName
                FROM Expense_log E
                LEFT JOIN Ponds P ON E.PondId = P.PondId
                WHERE E.UserId = @uId
                ORDER BY E.ExpenseDate DESC;
            `);

        const allTime = result.recordsets[0][0] || { TotalAllTime: 0, TotalCount: 0 };
        const last30 = result.recordsets[1][0] || { Last30Days: 0, Count30Days: 0 };
        const breakdown = result.recordsets[2] || [];
        const recent = result.recordsets[3] || [];

        const totalAllTime = Number(allTime.TotalAllTime);
        const last30Days = Number(last30.Last30Days);
        const count30Days = Number(last30.Count30Days);

        // Highest Category
        const highestCategory = breakdown.length > 0 ? breakdown[0] : { Category: 'None', CategoryTotal: 0 };

        res.json({
            totalAllTime,
            last30Days,
            count30Days,
            avgDaily: last30Days > 0 ? (last30Days / 30).toFixed(2) : 0,
            highestCategory: highestCategory.Category,
            highestCategoryAmount: highestCategory.CategoryTotal,
            categoryBreakdown: breakdown.map(b => ({
                category: b.Category,
                amount: Number(b.CategoryTotal),
                percentage: totalAllTime > 0 ? ((Number(b.CategoryTotal) / totalAllTime) * 100).toFixed(1) : 0
            })),
            recentExpenses: recent
        });

    } catch (err) {
        res.status(500).json({ error: "Dashboard Data Error", message: err.message });
    }
});

// 2. READ: Get all expenses for a specific pond
// Useful for the "Recent Expenses" list in your UI
router.get('/:pondId', auth, async (req, res) => {
    try {
        const { pondId } = req.params;
        const pool = req.pool;

        const result = await pool.request()
            .input('pid', sql.Int, pondId)
            .query(`
                SELECT ExpenseId, Category, Amount, Description, ExpenseDate 
                FROM Expense_log 
                WHERE PondId = @pid 
                ORDER BY ExpenseDate DESC
            `);

        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: "Database Error", message: err.message });
    }
});

// 3. UPDATE: Edit an existing expense record
// Allows the user to correct a category or amount mistake
router.put('/:expenseId', auth, async (req, res) => {
    try {
        const { expenseId } = req.params;
        const { category, amount, description } = req.body;
        const pool = req.pool;

        const result = await pool.request()
            .input('eid', sql.Int, expenseId)
            .input('cat', sql.NVarChar(50), category)
            .input('amt', sql.Decimal(18, 2), amount)
            .input('desc', sql.NVarChar(sql.MAX), description)
            .query(`
                UPDATE Expense_log 
                SET Category = @cat, Amount = @amt, Description = @desc
                WHERE ExpenseId = @eid
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: "Expense record not found." });
        }

        res.json({ success: true, message: "Expense updated successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Database Error", message: err.message });
    }
});

// 4. DELETE: Remove an expense record
router.delete('/:expenseId', auth, async (req, res) => {
    try {
        const { expenseId } = req.params;
        const pool = req.pool;

        const result = await pool.request()
            .input('eid', sql.Int, expenseId)
            .query(`DELETE FROM Expense_log WHERE ExpenseId = @eid`);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: "Expense record not found." });
        }

        res.json({ success: true, message: "Expense deleted successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Database Error", message: err.message });
    }
});
module.exports = router;