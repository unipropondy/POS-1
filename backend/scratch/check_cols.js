const { poolPromise } = require('../config/db');
async function run() {
  const pool = await poolPromise;
  const res = await pool.request().query('SELECT TOP 1 * FROM SettlementHeader');
  if (res.recordset.length > 0) {
    console.log('Columns:', Object.keys(res.recordset[0]));
  } else {
    console.log('No records found in SettlementHeader');
  }
  process.exit(0);
}
run();
