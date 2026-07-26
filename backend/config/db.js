const sql = require("mssql/msnodesqlv8");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const dbConfig = {
  user: process.env.DB_USER || "sa", // fallback to 'sa' if empty
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || "localhost",
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: true,
  },
};

// Log this once to make sure it's not empty
console.log(`Connecting to ${dbConfig.server} as ${dbConfig.user}...`);

const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then((pool) => {
    console.log("✅ Connected to SQL Server: FishFarm");
    return pool;
  })
  .catch((err) => {
    console.error("❌ Database Connection Failed!", err.message);
    // Don't exit here, let the app show the error via middleware
  });

module.exports = { sql, poolPromise };
