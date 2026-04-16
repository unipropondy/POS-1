const { poolPromise } = require('./db');
require('dotenv').config();

async function checkSettlementHeader() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SettlementHeader'");
    console.table(result.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSettlementHeader();
