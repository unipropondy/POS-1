const { poolPromise } = require('./db');
require('dotenv').config();

async function checkDependencies() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        referencing_entity_name = o.name,
        referencing_id = o.object_id,
        referencing_type_desc = o.type_desc
      FROM sys.sql_expression_dependencies d
      JOIN sys.objects o ON d.referencing_id = o.object_id
      WHERE d.referenced_id = OBJECT_ID('SettlementHeader')
      AND d.referenced_minor_id = (
        SELECT column_id FROM sys.columns 
        WHERE name = 'OrderId' AND object_id = OBJECT_ID('SettlementHeader')
      )
    `);
    console.table(result.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkDependencies();
