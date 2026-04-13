const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { poolPromise } = require('./db');

(async () => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TOP 1 
        DishGroupId,
        DishGroupName
      FROM DishGroupMaster
      WHERE IsActive = 1
    `);
    
    if (result.recordset.length > 0) {
      const groupId = result.recordset[0].DishGroupId;
      console.log('First DishGroupId: ' + groupId);
      console.log('Name: ' + result.recordset[0].DishGroupName);
    } else {
      console.log('No active DishGroupMaster records found');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
