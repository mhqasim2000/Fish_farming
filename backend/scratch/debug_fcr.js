const { poolPromise } = require('../config/db');
const sql = require('mssql');

async function debugFCR(pondId) {
    try {
        const pool = await poolPromise;
        console.log(`Debugging FCR for Pond ID: ${pondId}`);

        // 1. Check Feed Logs
        const feedResult = await pool.request()
            .input('pid', sql.NVarChar, String(pondId))
            .query(`SELECT ISNULL(SUM(Quantity_kg), 0) as TotalFeedKg, COUNT(*) as LogCount FROM Feed_Logs WHERE PondId = @pid`);
        console.log('Feed Logs:', feedResult.recordset[0]);

        // 2. Check Stocking
        const stockResult = await pool.request()
            .input('pid', sql.Int, pondId)
            .query(`
                SELECT 
                    st.StockId, st.SpeciesId, st.Quantity, st.CurrentSizeInches,
                    fr.ConditionFactor_K,
                    fr.MinSize_inch, fr.MaxSize_inch
                FROM Stocking st
                LEFT JOIN Feed_Rules fr ON st.SpeciesId = fr.SpeciesID
                    AND st.CurrentSizeInches > fr.MinSize_inch 
                    AND st.CurrentSizeInches <= fr.MaxSize_inch
                WHERE st.CurrentPondId = @pid
            `);
        console.log('Stocking & Rules Join:', stockResult.recordset);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

debugFCR(72);
