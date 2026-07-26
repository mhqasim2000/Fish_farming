const { poolPromise } = require('../config/db');

async function migrate() {
    let pool;
    try {
        console.log("Connecting to database...");
        pool = await poolPromise;
        console.log("Connected.");

        // 1. Check if column exists
        const checkCol = await pool.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Ponds' AND COLUMN_NAME = 'VolumeGallons'
        `);

        if (checkCol.recordset.length === 0) {
            console.log("Adding VolumeGallons column to Ponds table...");
            await pool.query(`ALTER TABLE Ponds ADD VolumeGallons BIGINT NULL`);
            console.log("Column added.");
        } else {
            console.log("Column VolumeGallons already exists.");
        }

        // 2. Update data
        console.log("Backfilling VolumeGallons data based on VolumeLiters...");
        const result = await pool.query(`
            UPDATE Ponds 
            SET VolumeGallons = ROUND(CAST(VolumeLiters AS FLOAT) * 0.264172, 0)
            WHERE VolumeLiters IS NOT NULL AND VolumeGallons IS NULL
        `);
        console.log(`Updated ${result.rowsAffected[0]} rows.`);

        console.log("Migration completed successfully.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        process.exit(0);
    }
}

migrate();
