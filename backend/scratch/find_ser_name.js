const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function check() {
    try {
        const pool = await poolPromise;
        const res = await pool.request().query(`
            SELECT TABLE_NAME, COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE COLUMN_NAME = 'SER_NAME'
        `);
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error(err);
    }
}
check();
