const { poolPromise } = require('../config/db');

async function alterTable() {
    try {
        const pool = await poolPromise;
        const query = `
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE Name = N'ReplyLatitude' AND Object_ID = Object_ID(N'PurchaseRequests')
            )
            BEGIN
                ALTER TABLE [dbo].[PurchaseRequests] ADD 
                    [ReplyLatitude] [decimal](10, 8) NULL,
                    [ReplyLongitude] [decimal](11, 8) NULL;
                PRINT 'Columns ReplyLatitude and ReplyLongitude added successfully.'
            END
            ELSE
            BEGIN
                PRINT 'Columns already exist.'
            END
        `;
        await pool.request().query(query);
        console.log("Database update complete.");
    } catch (err) {
        console.error("Error altering table:", err);
    } finally {
        process.exit();
    }
}

alterTable();
