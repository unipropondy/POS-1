const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function check() {
    try {
        const pool = await poolPromise;
        const res = await pool.request().query(`
            SELECT 
                OBJECT_NAME(parent_object_id) AS TableName,
                definition AS ConstraintDefinition
            FROM sys.check_constraints
            WHERE parent_object_id = OBJECT_ID('TimeEntry')
        `);
        console.log("Check Constraints on TimeEntry:");
        console.table(res.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
