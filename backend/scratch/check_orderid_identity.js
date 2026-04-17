const { poolPromise } = require('./db');

(async () => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        name, 
        is_identity 
      FROM sys.columns 
      WHERE object_id = OBJECT_ID('SettlementHeader') AND name = 'OrderId'
    `);
    console.log('OrderId Identity Check:', JSON.stringify(result.recordset[0], null, 2));
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
