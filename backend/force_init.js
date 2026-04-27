const { poolPromise } = require("./config/db");
const { initDB } = require("./config/init");

async function forceInit() {
  try {
    const pool = await poolPromise;
    if (!pool) {
      console.log("❌ Could not connect to DB.");
      return;
    }

    console.log("🚀 Manually triggering initDB...");
    await initDB(pool);
    console.log("✅ Manual init complete.");

    console.log("🔍 Verifying table again...");
    const result = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'CompanySettings'
    `);

    if (result.recordset.length > 0) {
      console.log("🎉 CompanySettings table is now LIVE!");
    } else {
      console.log("💀 Table still missing. Check init.js logic.");
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Force init error:", err.message);
    process.exit(1);
  }
}

forceInit();
