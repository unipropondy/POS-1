const { poolPromise } = require("./config/db");
const sql = require("mssql");

async function runMigration() {
    try {
        console.log("🚀 Starting Database Migration...");
        const pool = await poolPromise;
        
        // Add Professional Cart Columns
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CartItems' AND COLUMN_NAME = 'IsVoided')
                ALTER TABLE CartItems ADD IsVoided BIT DEFAULT 0;
            
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CartItems' AND COLUMN_NAME = 'VoidReason')
                ALTER TABLE CartItems ADD VoidReason NVARCHAR(MAX) NULL;

            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CartItems' AND COLUMN_NAME = 'DiscountAmount')
                ALTER TABLE CartItems ADD DiscountAmount DECIMAL(18,2) DEFAULT 0;

            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CartItems' AND COLUMN_NAME = 'DiscountType')
                ALTER TABLE CartItems ADD DiscountType NVARCHAR(20) DEFAULT 'fixed';

            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CartItems' AND COLUMN_NAME = 'IsTakeaway')
                ALTER TABLE CartItems ADD IsTakeaway BIT DEFAULT 0;

            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CompanySettings' AND COLUMN_NAME = 'PrinterIP')
                ALTER TABLE CompanySettings ADD PrinterIP NVARCHAR(50) NULL;
        `);
        console.log("✅ Added/Verified Professional Cart Columns");
        
        console.log("✅ Migration completed successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err.message);
        process.exit(1);
    }
}

runMigration();
