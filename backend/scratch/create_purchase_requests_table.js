const { poolPromise } = require('../config/db');

async function createTable() {
    try {
        const pool = await poolPromise;
        const query = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PurchaseRequests' AND xtype='U')
            BEGIN
                CREATE TABLE [dbo].[PurchaseRequests](
                    [RequestId] [int] IDENTITY(1,1) NOT NULL,
                    [ConsumerId] [int] NOT NULL,
                    [FarmId] [int] NOT NULL,
                    [SpeciesName] [nvarchar](100) NOT NULL,
                    [RequestedQuantity] [int] NOT NULL,
                    [Status] [nvarchar](20) NOT NULL DEFAULT 'Pending',
                    [FarmerReply] [nvarchar](max) NULL,
                    [CreatedAt] [datetime] DEFAULT GETDATE(),
                    [UpdatedAt] [datetime] DEFAULT GETDATE(),
                    PRIMARY KEY CLUSTERED ([RequestId] ASC)
                )
                PRINT 'PurchaseRequests table created successfully.'
            END
            ELSE
            BEGIN
                PRINT 'PurchaseRequests table already exists.'
            END
        `;
        await pool.request().query(query);
        console.log("Database update complete.");
    } catch (err) {
        console.error("Error creating table:", err);
    } finally {
        process.exit();
    }
}

createTable();
