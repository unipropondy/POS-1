const { poolPromise } = require('./db');
require('dotenv').config();

async function check() {
  try {
    const pool = await poolPromise;
    console.log("Checking IDENTITY info for SettlementHeader...");
    const res = await pool.request().query(`
      SELECT 
        IDENT_SEED('SettlementHeader') AS Seed,
        IDENT_INCR('SettlementHeader') AS Increment,
        IDENT_CURRENT('SettlementHeader') AS CurrentIdentity,
        MAX(OrderId) AS MaxOrderId
      FROM SettlementHeader
    `);
    console.table(res.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
