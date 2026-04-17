const { poolPromise } = require('../db');

(async () => {
  try {
    const pool = await poolPromise;
    console.log('--- Checking OrderId property ---');
    const resId = await pool.request().query("SELECT COLUMNPROPERTY(OBJECT_ID('SettlementHeader'), 'OrderId', 'IsIdentity') as IsId");
    console.log('Is OrderId Identity?', resId.recordset[0].IsId);

    console.log('\n--- Checking Constraints ---\n');
    const resCons = await pool.request().query(`
        SELECT 
            OBJECT_NAME(f.parent_object_id) AS TableName,
            COL_NAME(fc.parent_object_id, fc.parent_column_id) AS ColumnName,
            f.name AS ForeignKeyName,
            OBJECT_NAME(f.referenced_object_id) AS ReferenceTableName,
            COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS ReferenceColumnName
        FROM sys.foreign_keys AS f
        INNER JOIN sys.foreign_key_columns AS fc ON f.OBJECT_ID = fc.constraint_object_id
        WHERE OBJECT_NAME(f.parent_object_id) IN ('SettlementHeader', 'PaymentDetailCur', 'SettlementItemDetail', 'SettlementTotalSales')
    `);
    console.log('Foreign Keys:', JSON.stringify(resCons.recordset, null, 2));

    const resCheck = await pool.request().query(`
        SELECT 
            OBJECT_NAME(parent_object_id) AS TableName,
            name AS ConstraintName,
            definition
        FROM sys.check_constraints
        WHERE OBJECT_NAME(parent_object_id) IN ('SettlementHeader', 'PaymentDetailCur', 'SettlementItemDetail', 'SettlementTotalSales')
    `);
    console.log('Check Constraints:', JSON.stringify(resCheck.recordset, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
