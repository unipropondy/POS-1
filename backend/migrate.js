const { poolPromise } = require("./config/db");
const sql = require("mssql");

async function runMigration() {
    try {
        console.log("🚀 Starting Database Migration...");
        const pool = await poolPromise;
        
        // Check if PrinterIP column exists
        const checkColumn = await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'CompanySettings' AND COLUMN_NAME = 'PrinterIP'
            )
            BEGIN
                ALTER TABLE CompanySettings ADD PrinterIP NVARCHAR(50) NULL;
                PRINT '✅ Added PrinterIP column';
            END
            ELSE
            BEGIN
                PRINT 'ℹ️ PrinterIP column already exists';
            END
        `);
        
        console.log("✅ Migration completed successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err.message);
        process.exit(1);
    }
}

runMigration();
