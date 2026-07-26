const { poolPromise } = require('../config/db');
const sql = require('mssql');

async function createGrowthHistoryTable() {
    try {
        const pool = await poolPromise;
        console.log('Connected to database...');
        
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Growth_History' AND xtype='U')
            CREATE TABLE Growth_History (
                HistoryId INT PRIMARY KEY IDENTITY(1,1),
                StockId INT NOT NULL,
                SizeInches DECIMAL(4, 2) NOT NULL,
                RecordedAt DATETIME DEFAULT GETDATE(),
                FOREIGN KEY (StockId) REFERENCES Stocking(StockId) ON DELETE CASCADE
            );
        `);
        
        console.log('✅ Growth_History table created/ensured successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error creating table:', err.message);
        process.exit(1);
    }
}

createGrowthHistoryTable();
