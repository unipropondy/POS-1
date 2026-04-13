const { poolPromise } = require('./db');
require('dotenv').config();

async function f() {
  try {
    const p = await poolPromise;
    const r = await p.request().query("SELECT TableNumber, Status, LockedByName FROM TableMaster WHERE TableNumber IN ('1', '2')");
    console.log(JSON.stringify(r.recordset, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
f();
