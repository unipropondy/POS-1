const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function check() {
    try {
        const pool = await poolPromise;
        const res = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'SettlementHeader'
        `);
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error(err);
    }
}
check();
