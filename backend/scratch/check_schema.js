const { poolPromise } = require('../config/db');

async function checkSchema() {
    try {
        const pool = await poolPromise;
        const res = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Stocking'
        `);
        console.log(res.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
