const { poolPromise } = require('./db');
require('dotenv').config();

async function checkHardDeps() {
  try {
    const pool = await poolPromise;
    console.log("Checking for Foreign Keys referencing SettlementHeader(OrderId)...");
    const fks = await pool.request().query(`
      SELECT 
        obj.name AS fk_name,
        sch.name AS schema_name,
        tab1.name AS table_name,
        col1.name AS column_name,
        tab2.name AS referenced_table_name,
        col2.name AS referenced_column_name
      FROM sys.foreign_key_columns fkc
      INNER JOIN sys.objects obj ON obj.object_id = fkc.constraint_object_id
      INNER JOIN sys.tables tab1 ON tab1.object_id = fkc.parent_object_id
      INNER JOIN sys.schemas sch ON tab1.schema_id = sch.schema_id
      INNER JOIN sys.columns col1 ON col1.column_id = parent_column_id AND col1.object_id = tab1.object_id
      INNER JOIN sys.tables tab2 ON tab2.object_id = fkc.referenced_object_id
      INNER JOIN sys.columns col2 ON col2.column_id = referenced_column_id AND col2.object_id = tab2.object_id
      WHERE tab2.name = 'SettlementHeader' AND col2.name = 'OrderId'
    `);
    console.table(fks.recordset);

    console.log("\nChecking for Indexes on SettlementHeader(OrderId)...");
    const indexes = await pool.request().query(`
      SELECT i.name AS index_name, c.name AS column_name
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE i.object_id = OBJECT_ID('SettlementHeader') AND c.name = 'OrderId'
    `);
    console.table(indexes.recordset);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkHardDeps();
