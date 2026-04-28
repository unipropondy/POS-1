const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function check() {
    try {
        const pool = await poolPromise;
        const res = await pool.request().query(`
            SELECT name 
            FROM sys.triggers 
            WHERE parent_id = OBJECT_ID('TimeEntry')
        `);
        console.log("Triggers on TimeEntry:");
        console.table(res.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
