const { poolPromise } = require('../db');

(async () => {
  try {
    const pool = await poolPromise;
    console.log('--- Checking for BusinessUnitId in various tables ---');
    
    // Try to find a BusinessUnitId from DishMaster if it exists
    try {
        const dishRes = await pool.request().query("SELECT TOP 1 BusinessUnitId FROM DishMaster WHERE BusinessUnitId IS NOT NULL");
        console.log('DishMaster BU:', dishRes.recordset);
    } catch(e) {}

    // Try common table names for master data
    const masters = ['BusinessUnitMaster', 'StoreMaster', 'UnitMaster', 'CashierMaster', 'StaffMaster'];
    for (const table of masters) {
        try {
            const res = await pool.request().query(`SELECT TOP 1 * FROM ${table}`);
            console.log(`\nTable ${table} exists and has data:`, res.recordset.length > 0);
            if (res.recordset.length > 0) {
                console.log('Sample:', JSON.stringify(res.recordset[0], null, 2));
            }
        } catch(e) {
            // console.log(`Table ${table} does not exist.`);
        }
    }

    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
