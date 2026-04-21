const sql = require('mssql');
require('dotenv').config({ path: 'c:/Users/UNIPRO/Desktop/Cafe_pos/POS-1/backend/.env' });

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function checkUsers() {
  try {
    const pool = await sql.connect(config);
    console.log('--- UserMaster (TOP 5) ---');
    const users = await pool.request().query('SELECT TOP 5 UserName, UserPassword, UserGroupId, UserGroupid, RoleCode FROM UserMaster');
    console.log(JSON.stringify(users.recordset, null, 2));

    console.log('\n--- UserGroupMaster ---');
    const groups = await pool.request().query('SELECT * FROM UserGroupMaster');
    console.log(JSON.stringify(groups.recordset, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkUsers();
