const { poolPromise } = require('../config/db');

async function dumpSchemas() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME IN ('Feed_Rules', 'Species', 'Stocking', 'Feed_Logs')
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        `);
        console.log(JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
dumpSchemas();
