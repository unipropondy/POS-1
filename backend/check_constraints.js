const { poolPromise } = require('./db');
require('dotenv').config();

async function checkConstraints() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT tc.CONSTRAINT_TYPE, kcu.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME WHERE tc.TABLE_NAME = 'SettlementHeader'");
    console.log("--- SettlementHeader Constraints ---");
    console.table(result.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkConstraints();
