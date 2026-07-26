const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const auth = require('../middleware/auth');

// 1. CREATE: Record Harvest & Physically Decrease Stock
router.post('/add', auth, async (req, res) => {
    const transaction = new sql.Transaction(req.pool);
    try {
        const pondId = parseInt(req.body.pondId);
        const speciesId = parseInt(req.body.speciesId);
        const quantity = parseInt(req.body.quantity) || 0;
        const weight = parseFloat(req.body.weight) || 0;
        const revenue = parseFloat(req.body.revenue) || 0;
        const note = req.body.note || "";

        await transaction.begin();

        // 1. THE GATEKEEPER: Check current stock (which already accounts for previous mortality)
        const stockRequest = new sql.Request(transaction);
        const stockCheck = await stockRequest
            .input('pid', sql.Int, pondId)
            .input('sid', sql.Int, speciesId)
            .query(`
                SELECT SUM(Quantity) as TotalQuantity 
                FROM Stocking 
                WHERE CurrentPondId = @pid AND SpeciesId = @sid
            `);

        if (!stockCheck.recordset || stockCheck.recordset.length === 0 || stockCheck.recordset[0].TotalQuantity === null) {
            await transaction.rollback();
            return res.status(404).json({ error: "Species not found in this pond." });
        }

        const currentStock = stockCheck.recordset[0].TotalQuantity;

        if (currentStock < quantity) {
            await transaction.rollback();
            return res.status(400).json({ error: `Not enough fish. Current stock: ${currentStock}` });
        }

        const remainingAfter = currentStock - quantity;

        // 2. PHYSICAL DECREASE: Update Stocking Table (FIFO across batches)
        const batchRequest = new sql.Request(transaction);
        const batches = await batchRequest
            .input('pid', sql.Int, pondId)
            .input('sid', sql.Int, speciesId)
            .query(`
                SELECT StockId, Quantity 
                FROM Stocking 
                WHERE CurrentPondId = @pid AND SpeciesId = @sid AND Quantity > 0
                ORDER BY StockingDate ASC
            `);

        let remainingToHarvest = quantity;
        for (const batch of batches.recordset) {
            if (remainingToHarvest <= 0) break;

            const deduct = Math.min(batch.Quantity, remainingToHarvest);
            remainingToHarvest -= deduct;

            const updateRequest = new sql.Request(transaction);
            await updateRequest
                .input('stockId', sql.Int, batch.StockId)
                .input('deduct', sql.Int, deduct)
                .query(`
                    UPDATE Stocking 
                    SET Quantity = Quantity - @deduct 
                    WHERE StockId = @stockId
                `);
        }

        // 2b. AUTO-DELETE: Remove any batches that reached 0 quantity
        const cleanupRequest = new sql.Request(transaction);
        await cleanupRequest
            .input('pid', sql.Int, pondId)
            .input('sid', sql.Int, speciesId)
            .query(`
                DELETE FROM Stocking 
                WHERE CurrentPondId = @pid AND SpeciesId = @sid AND Quantity <= 0
            `);

        // 3. INSERT HARVEST LOG
        const logRequest = new sql.Request(transaction);
        await logRequest
            .input('pid', sql.Int, pondId)
            .input('sid', sql.Int, speciesId)
            .input('qty', sql.Int, quantity)
            .input('w', sql.Float, weight)
            .input('rem', sql.Int, remainingAfter)
            .input('n', sql.NVarChar, note)
            .input('rev', sql.Decimal(18,2), revenue)
            .query(`
                INSERT INTO Harvest_Logs (PondId, SpeciesId, Quantity_pieces, TotalWeight_kg, Remaining_Pieces, Note, Revenue_PKR)
                OUTPUT INSERTED.HarvestId
                VALUES (@pid, @sid, @qty, @w, @rem, @n, @rev)
            `);

        // 4. MAINTENANCE CHECK
        const maintRequest = new sql.Request(transaction);
        await maintRequest
            .input('pid', sql.Int, pondId)
            .query(`
                UPDATE Ponds
                SET NeedsMaintenance = 1
                WHERE PondId = @pid 
                AND ISNULL((SELECT SUM(Quantity) FROM Stocking WHERE CurrentPondId = @pid), 0) <= 0
            `);

        await transaction.commit();

        res.status(201).json({
            success: true,
            message: "Harvest recorded and stock updated!",
            remainingStock: remainingAfter,
            harvestLogId: logRequest.recordset?.[0]?.HarvestId || null
        });

    } catch (err) {
        if (transaction) await transaction.rollback();
        res.status(500).json({ error: "Server Error", details: err.message });
    }
});

// 2. READ: Get Available Stock (Simpler now because math is done in the table)
router.get('/available/:pondId', auth, async (req, res) => {
    try {
        const { pondId } = req.params;
        const pool = req.pool;

        const result = await pool.request()
            .input('pid', sql.Int, pondId)
            .query(`
                SELECT 
                    S.SpeciesID, 
                    S.Name, 
                    SUM(ST.Quantity) as CurrentStock
                FROM Stocking ST
                JOIN Species S ON ST.SpeciesId = S.SpeciesID
                WHERE ST.CurrentPondId = @pid
                  AND ST.Quantity > 0
                GROUP BY S.SpeciesID, S.Name
                ORDER BY S.Name
            `);

        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// History and Delete routes
router.get('/history/:pondId', auth, async (req, res) => {
    try {
        const { pondId } = req.params;
        const pool = req.pool;
        const result = await pool.request()
            .input('pid', sql.Int, pondId)
            .query(`
                SELECT H.*, S.Name as SpeciesName 
                FROM Harvest_Logs H
                JOIN Species S ON H.SpeciesId = S.SpeciesID
                WHERE H.PondId = @pid 
                ORDER BY H.HarvestDate DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// PATCH: Update harvest revenue (from ROI Calculator)
router.patch('/:harvestId/revenue', auth, async (req, res) => {
    try {
        const pool = req.pool;
        const { revenue } = req.body;
        await pool.request()
            .input('hid', sql.Int, req.params.harvestId)
            .input('rev', sql.Decimal(18, 2), revenue)
            .query(`UPDATE Harvest_Logs SET Revenue_PKR = @rev WHERE HarvestId = @hid`);
        res.json({ success: true, message: "Revenue updated." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

router.delete('/:harvestId', auth, async (req, res) => {
    try {
        const pool = req.pool;
        await pool.request()
            .input('hid', sql.Int, req.params.harvestId)
            .query(`DELETE FROM Harvest_Logs WHERE HarvestId = @hid`);
        res.json({ success: true, message: "Record deleted." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;