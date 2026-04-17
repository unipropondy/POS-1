const { poolPromise } = require('../db');

(async () => {
  try {
    const pool = await poolPromise;
    console.log('--- SettlementHeader Sample ---');
    const res = await pool.request().query("SELECT TOP 1 SettlementID, CashierId, CreatedBy FROM SettlementHeader");
    console.log(JSON.stringify(res.recordset, null, 2));

    console.log('\n--- PaymentDetailCur Sample ---');
    const res2 = await pool.request().query("SELECT TOP 1 BusinessUnitId, CreatedBy FROM PaymentDetailCur");
    console.log(JSON.stringify(res2.recordset, null, 2));

    console.log('\n--- Paymode Sample ---');
    const res3 = await pool.request().query("SELECT TOP 5 PayMode, Position, Description FROM Paymode");
    console.log(JSON.stringify(res3.recordset, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
