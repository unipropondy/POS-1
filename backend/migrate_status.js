const sql = require('mssql');
const { poolPromise } = require('./config/db');

async function migrate() {
    try {
        const pool = await poolPromise;
        console.log("Checking for 'Status' column in SettlementItemDetail...");
        const result = await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'SettlementItemDetail' AND COLUMN_NAME = 'Status'
            )
            BEGIN
                ALTER TABLE SettlementItemDetail ADD Status NVARCHAR(50) DEFAULT 'NORMAL';
                PRINT 'Added Status column to SettlementItemDetail';
            END
            ELSE
            BEGIN
                PRINT 'Status column already exists';
            END
        `);
        console.log("Migration complete.");
    } catch (err) {
        console.error("Migration failed:", err.message);
    } finally {
        process.exit(0);
    }
}

migrate();
