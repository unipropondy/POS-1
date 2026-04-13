const { poolPromise } = require('./db');
require('dotenv').config();

async function checkMembers() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Member%' OR TABLE_NAME LIKE '%Customer%'");
    console.log("Search Results:");
    result.recordset.forEach(row => console.log(`- ${row.TABLE_NAME}`));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkMembers();
