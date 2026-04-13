const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { poolPromise } = require('./db');

(async () => {
  try {
    const pool = await poolPromise;
    
    const result = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'DishGroupMaster'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('DishGroupMaster columns:');
    result.recordset.forEach(r => console.log(`  - ${r.COLUMN_NAME} (${r.DATA_TYPE})`));
    
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
