const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function migrate() {
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request().query('ALTER TABLE [dbo].[Stocking] ADD [SalePricePerUnit] [decimal](10, 2) NULL;');
        console.log("Migration successful");
    } catch (err) {
        console.error("Migration failed:", err.message);
    } finally {
        process.exit();
    }
}

migrate();
