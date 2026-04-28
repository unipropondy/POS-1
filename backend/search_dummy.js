const { poolPromise } = require("./config/db");

async function findDummyId() {
    try {
        const pool = await poolPromise;
        const tables = ['UserMaster', 'UserGroupMaster', 'server', 'MemberMaster'];
        for (const table of tables) {
            console.log(`Checking ${table}...`);
            const result = await pool.request().query(`SELECT * FROM ${table} WHERE CAST(UserId AS NVARCHAR(MAX)) LIKE '%11111111%' OR CAST(MemberId AS NVARCHAR(MAX)) LIKE '%11111111%' OR CAST(CreatedBy AS NVARCHAR(MAX)) LIKE '%11111111%'`);
            if (result.recordset.length > 0) {
                console.log(`Found in ${table}:`);
                console.table(result.recordset);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error("Error searching:", err);
        process.exit(1);
    }
}

findDummyId();
