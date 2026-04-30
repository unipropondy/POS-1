const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function check() {
    try {
        const pool = await poolPromise;
        const tables = ['SettlementDetail', 'SettlementTotalSales'];
        
        for (const table of tables) {
            const res = await pool.request().query(`
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = '${table}'
            `);
            console.log(`\nColumns for ${table}:`);
            console.table(res.recordset);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
