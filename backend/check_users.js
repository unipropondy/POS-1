const { poolPromise } = require("./config/db");

async function checkUsers() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT UserId, UserName, FullName FROM UserMaster
        `);
        console.log("Users in UserMaster:");
        console.table(result.recordset);
        process.exit(0);
    } catch (err) {
        console.error("Error checking users:", err);
        process.exit(1);
    }
}

checkUsers();
