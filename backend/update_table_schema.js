const { poolPromise } = require('./db');
require('dotenv').config();

async function updateSchema() {
  try {
    const pool = await poolPromise;
    console.log("Checking for LockedByName column in TableMaster...");
    
    const checkCol = await pool.request().query("SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TableMaster' AND COLUMN_NAME = 'LockedByName'");
    
    if (checkCol.recordset.length === 0) {
      console.log("Adding LockedByName column to TableMaster...");
      await pool.request().query("ALTER TABLE TableMaster ADD LockedByName NVARCHAR(255)");
      console.log("Column added successfully.");
    } else {
      console.log("LockedByName column already exists.");
    }
    
    process.exit(0);
  } catch (err) {
    console.error("Error updating schema:", err);
    process.exit(1);
  }
}
updateSchema();
