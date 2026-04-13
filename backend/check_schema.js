const { poolPromise } = require('./db');
require('dotenv').config();

async function checkTables() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES");
    console.log("Existing Tables:");
    result.recordset.forEach(row => console.log(`- ${row.TABLE_NAME}`));
    
    const tableMasterColumns = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TableMaster'");
    console.log("\nTableMaster Columns:");
    tableMasterColumns.recordset.forEach(row => console.log(`- ${row.COLUMN_NAME}`));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkTables();
