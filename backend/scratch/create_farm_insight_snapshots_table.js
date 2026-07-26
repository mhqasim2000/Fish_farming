const { poolPromise } = require("../config/db");

async function run() {
  const pool = await poolPromise;
  await pool.request().query(`
    IF OBJECT_ID('FarmInsightSnapshots', 'U') IS NULL
    BEGIN
      CREATE TABLE FarmInsightSnapshots (
        SnapshotId INT IDENTITY(1,1) PRIMARY KEY,
        UserId INT NOT NULL,
        SnapshotType NVARCHAR(40) NOT NULL,
        PayloadJson NVARCHAR(MAX) NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  console.log("FarmInsightSnapshots table is ready.");
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
