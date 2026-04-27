const { poolPromise, sql } = require("./config/db");

async function migrate() {
  try {
    const pool = await poolPromise;
    console.log("🚀 Starting Database Migration...");

    // 1. Add TaxMode to CompanySettings if it doesn't exist
    const checkTaxMode = await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'CompanySettings' AND COLUMN_NAME = 'TaxMode'
      )
      BEGIN
        ALTER TABLE CompanySettings ADD TaxMode NVARCHAR(20) DEFAULT 'exclusive';
        PRINT 'Added TaxMode column to CompanySettings';
      END
    `);
    console.log("✅ CompanySettings table updated.");

    process.exit(0);
  } catch (err) {
    console.error("❌ Migration Failed:", err.message);
    process.exit(1);
  }
}

migrate();
