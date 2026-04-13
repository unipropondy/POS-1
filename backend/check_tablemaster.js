const { poolPromise } = require('./db');
require('dotenv').config();

async function checkTableMaster() {
  try {
    const pool = await poolPromise;
    const cols = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TableMaster'");
    console.log(JSON.stringify(cols.recordset, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Error checkTableMaster:", err);
    process.exit(1);
  }
}
checkTableMaster();
