const fs = require('fs');
const path = require('path');
const { poolPromise } = require('../config/db');

async function run() {
  const pool = await poolPromise;
  const sql = fs.readFileSync(
    path.join(__dirname, '../db/migrate_stocking_species_mix.sql'),
    'utf8',
  );
  await pool.request().query(sql);
  console.log('StockingRules species mix columns are ready.');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
