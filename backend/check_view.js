const { poolPromise } = require('./db');
require('dotenv').config();

async function checkView() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT definition FROM sys.sql_modules WHERE object_id = OBJECT_ID('vw_RestaurantOrder')");
    console.log("vw_RestaurantOrder definition:");
    console.log(result.recordset[0]?.definition);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkView();
