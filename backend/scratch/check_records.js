const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function check() {
    try {
        const pool = await poolPromise;
        const userId = '74C8A4B6-62D8-40F9-AE54-344E4C941749'; // I'll search for the actual ID or just get all for today
        const res = await pool.request().query(`
            SELECT TOP 20 * 
            FROM TimeEntry 
            WHERE CAST(CreatedOn AS DATE) = CAST(GETDATE() AS DATE)
            ORDER BY CreatedOn DESC
        `);
        console.log("Recent TimeEntry records:");
        console.table(res.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
