const { poolPromise } = require('../config/db');
const sql = require('mssql');

async function findActivePonds() {
    try {
        const pool = await poolPromise;
        const res = await pool.request().query(`
            SELECT 
                p.PondId, p.PondName,
                s.SpeciesId, sp.Name as SpeciesName, s.Quantity
            FROM Stocking s
            JOIN Ponds p ON s.CurrentPondId = p.PondId
            JOIN Species sp ON s.SpeciesId = sp.SpeciesId
            WHERE s.Status NOT IN ('Harvested', 'Sold', 'Inactive')
        `);
        console.log(JSON.stringify(res.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

findActivePonds();
