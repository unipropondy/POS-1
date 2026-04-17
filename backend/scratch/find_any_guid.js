const { poolPromise } = require('../db');

(async () => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE DATA_TYPE = 'uniqueidentifier'
    `);
    console.log('--- UniqueIdentifier Columns in DB ---');
    console.log(JSON.stringify(result.recordset.slice(0, 20), null, 2));

    const tablesToCheck = ['CompanyMaster', 'SystemConfig', 'Settings'];
    for (const table of tablesToCheck) {
        try {
            const res = await pool.request().query(`SELECT TOP 1 * FROM ${table}`);
            if (res.recordset.length > 0) {
                console.log(`\nTable ${table} sample:`, res.recordset[0]);
            }
        } catch(e) {}
    }

    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
