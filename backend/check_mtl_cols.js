const { poolPromise } = require('./db');
require('dotenv').config();

async function checkTimeLogs() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'MemberTimeLog'
    `);
    console.log("Columns in MemberTimeLog:");
    result.recordset.forEach(row => console.log(`- ${row.COLUMN_NAME} (${row.DATA_TYPE})`));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkTimeLogs();
