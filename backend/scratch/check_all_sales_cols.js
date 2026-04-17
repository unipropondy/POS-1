const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { poolPromise } = require('./db');

(async () => {
  try {
    const pool = await poolPromise;
    const tables = ['SettlementHeader', 'SettlementItemDetail', 'PaymentDetailCur', 'SettlementTotalSales'];
    
    for (const table of tables) {
      const result = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = '${table}' 
        ORDER BY ORDINAL_POSITION
      `);
      console.log(`\nColumns for ${table}:`);
      result.recordset.forEach(r => console.log(`  - ${r.COLUMN_NAME} (${r.DATA_TYPE}, Nullable: ${r.IS_NULLABLE})`));
    }
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
