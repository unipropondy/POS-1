const { poolPromise } = require("./config/db");

async function checkDB() {
  try {
    const pool = await poolPromise;
    if (!pool) {
      console.log("❌ Could not connect to DB. Check .env settings.");
      return;
    }

    console.log("🔍 Checking for CompanySettings table...");
    const result = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'CompanySettings'
    `);

    if (result.recordset.length > 0) {
      console.log("✅ CompanySettings table EXISTS.");
      
      console.log("🔍 Checking columns...");
      const columns = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'CompanySettings'
      `);
      console.table(columns.recordset);
    } else {
      console.log("❌ CompanySettings table DOES NOT exist. Schema init might have failed.");
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Error during check:", err.message);
    process.exit(1);
  }
}

checkDB();
