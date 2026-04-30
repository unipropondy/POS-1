const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function check() {
    try {
        const pool = await poolPromise;
        const tables = ['SettlementHeader', 'SettlementDetail', 'SettlementTotalSales', 'SettlementTranDetail'];
        
        for (const table of tables) {
            const res = await pool.request().query(`
                SELECT TOP 5 * FROM ${table} ORDER BY 1 DESC
            `);
            console.log(`\nLatest 5 rows from ${table}:`);
            console.table(res.recordset);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
