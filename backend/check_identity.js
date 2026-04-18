const { poolPromise } = require('./db');
require('dotenv').config();

async function check() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, COLUMNPROPERTY(OBJECT_ID('SettlementHeader'), 'OrderId', 'IsIdentity') AS IsIdentity FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SettlementHeader' AND COLUMN_NAME = 'OrderId'");
    console.table(result.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
