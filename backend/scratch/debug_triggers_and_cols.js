const { poolPromise } = require('../db');

(async () => {
  try {
    const pool = await poolPromise;
    console.log('--- Checking for Triggers ---');
    const res = await pool.request().query("SELECT name, OBJECT_NAME(parent_id) as TableName FROM sys.triggers");
    console.log(JSON.stringify(res.recordset, null, 2));
    
    console.log('\n--- Checking for Required but non-nullable columns in PaymentDetailCur ---');
    const resCols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'PaymentDetailCur' AND IS_NULLABLE = 'NO'
    `);
    console.log(JSON.stringify(resCols.recordset, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
