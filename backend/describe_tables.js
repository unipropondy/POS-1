const { poolPromise } = require('./db');
require('dotenv').config();

async function describeTables() {
  try {
    const pool = await poolPromise;
    
    console.log("--- SettlementHeader Columns ---");
    const headerCols = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SettlementHeader'");
    console.table(headerCols.recordset);

    console.log("\n--- SettlementTotalSales Columns ---");
    const salesCols = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SettlementTotalSales'");
    console.table(salesCols.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Error describing tables:", err);
    process.exit(1);
  }
}

describeTables();
