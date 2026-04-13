const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { poolPromise } = require('./db');

(async () => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'DailyAttendance'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('DailyAttendance columns:');
    result.recordset.forEach(r => {
      const nullable = r.IS_NULLABLE === 'YES' ? 'null' : 'NOT NULL';
      console.log(`  - ${r.COLUMN_NAME} (${r.DATA_TYPE}) [${nullable}]`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
