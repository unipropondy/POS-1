const { poolPromise } = require('./db');
require('dotenv').config();

async function checkOrderId() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SettlementHeader' AND COLUMN_NAME = 'OrderId'");
    console.log("--- OrderId Column Info ---");
    console.table(result.recordset);
    
    // Also check if any other table has OrderId
    const otherTables = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME = 'OrderId' AND TABLE_NAME != 'SettlementHeader'");
    console.log("\n--- Other Tables with OrderId ---");
    console.table(otherTables.recordset);

    // Check existing OrderIds to see the format
    const existingOrders = await pool.request().query("SELECT TOP 5 OrderId FROM SettlementHeader WHERE OrderId IS NOT NULL");
    console.log("\n--- Sample OrderIds ---");
    console.table(existingOrders.recordset);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkOrderId();
