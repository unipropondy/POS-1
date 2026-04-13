const { poolPromise } = require('./db');
require('dotenv').config();

async function checkColumns() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'MemberMaster'
      ORDER BY COLUMN_NAME
    `);
    console.log("=== FINAL COLUMNS IN MemberMaster ===");
    result.recordset.forEach(row => {
      console.log(`${row.COLUMN_NAME.padStart(15)}: ${row.DATA_TYPE}`);
    });
    console.log("=====================================");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkColumns();
