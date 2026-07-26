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

async function test() {
    try {
        const pool = await sql.connect(dbConfig);
        const q = `SELECT U.FarmName, U.FullName as FarmerName, F.FarmId, F.Latitude, F.Longitude, R.RegionName, S.Name as SpeciesName, SUM(ST.Quantity) as TotalQuantity, SUM(ISNULL(ST.QuantityForSale, 0)) as QuantityForSale, AVG(ST.CurrentSizeInches) as AvgSizeInches, MAX(ST.StockingDate) as LastStocked, MAX(CAST(ISNULL(ST.IsForSale, 0) AS INT)) as IsForSale, AVG(ST.SalePricePerUnit) as SalePricePerUnit, NULL as FarmerPhone, MAX(U.Email) as FarmerEmail FROM Stocking ST JOIN Ponds P ON ST.CurrentPondId = P.PondId JOIN Farm F ON P.FarmId = F.FarmId JOIN Users U ON F.UserId = U.UserId JOIN Species S ON ST.SpeciesId = S.SpeciesId LEFT JOIN Regions R ON F.RegionId = R.RegionId WHERE ST.Quantity > 0 AND ST.Status IN ('Nursery', 'Grown-out') GROUP BY U.FarmName, U.FullName, F.FarmId, F.Latitude, F.Longitude, R.RegionName, S.Name ORDER BY U.FarmName ASC`;
        const res = await pool.request().query(q);
        console.log("Success", res.recordset);
    } catch (err) {
        console.error("Failed:", err);
    } finally {
        process.exit();
    }
}
test();
