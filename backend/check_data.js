const { poolPromise } = require('./db');
require('dotenv').config();

async function checkData() {
  try {
    const pool = await poolPromise;
    
    console.log("--- SettlementHeader Data (First 5) ---");
    const resultHeader = await pool.request().query("SELECT TOP 5 * FROM SettlementHeader ORDER BY LastSettlementDate DESC");
    console.log(resultHeader.recordset);

    console.log("\n--- SettlementTotalSales Data (First 5) ---");
    const resultSales = await pool.request().query("SELECT TOP 5 * FROM SettlementTotalSales ORDER BY SettlementID DESC");
    console.log(resultSales.recordset);

    console.log("\n--- Counts ---");
    const countHeader = await pool.request().query("SELECT COUNT(*) as count FROM SettlementHeader");
    const countSales = await pool.request().query("SELECT COUNT(*) as count FROM SettlementTotalSales");
    console.log(`SettlementHeader count: ${countHeader.recordset[0].count}`);
    console.log(`SettlementTotalSales count: ${countSales.recordset[0].count}`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkData();
