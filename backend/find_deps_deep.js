const { poolPromise } = require('./db');
require('dotenv').config();

async function findDeps() {
  try {
    const pool = await poolPromise;
    console.log("Finding all objects referencing SettlementHeader...");
    const result = await pool.request().query(`
      SELECT DISTINCT 
        o.name AS referencing_object_name, 
        o.type_desc AS object_type
      FROM sys.sql_expression_dependencies d
      JOIN sys.objects o ON d.referencing_id = o.object_id
      WHERE d.referenced_id = OBJECT_ID('SettlementHeader')
    `);
    console.table(result.recordset);
    
    console.log("\nChecking for views specifically containing 'OrderId' in their definition...");
    const views = await pool.request().query(`
      SELECT name 
      FROM sys.objects 
      WHERE type = 'V' 
      AND OBJECT_DEFINITION(object_id) LIKE '%OrderId%'
    `);
    console.table(views.recordset);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

findDeps();
