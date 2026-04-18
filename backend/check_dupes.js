const { poolPromise } = require('./db');
require('dotenv').config();

async function check() {
  try {
    const pool = await poolPromise;
    console.log("Checking for duplicate OrderIds...");
    const res = await pool.request().query("SELECT OrderId, COUNT(*) as Count FROM SettlementHeader GROUP BY OrderId HAVING COUNT(*) > 1");
    console.table(res.recordset);
    
    console.log("\nChecking for unique constraints on OrderId...");
    const constraints = await pool.request().query("SELECT COUNT(*) as Count FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME WHERE tc.TABLE_NAME = 'SettlementHeader' AND kcu.COLUMN_NAME = 'OrderId' AND tc.CONSTRAINT_TYPE = 'UNIQUE'");
    console.table(constraints.recordset);

    console.log("\nChecking for Primary Key...");
    const pk = await pool.request().query("SELECT kcu.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME WHERE tc.TABLE_NAME = 'SettlementHeader' AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'");
    console.table(pk.recordset);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
