const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { poolPromise } = require('./db');

(async () => {
  try {
    const pool = await poolPromise;
    
    // Get DishGroupIds
    console.log("\n📝 Getting DishGroupIds from database...");
    const groupResult = await pool.request().query(`
      SELECT TOP 5 
        DishGroupId,
        GroupName,
        CategoryId
      FROM DishGroupMaster
    `);
    
    console.log("\nDishGroupIds available:");
    groupResult.recordset.forEach(r => {
      console.log(`  - DishGroupId: ${r.DishGroupId}`);
      console.log(`    GroupName: ${r.GroupName}`);
      console.log(`    CategoryId: ${r.CategoryId}\n`);
    });
    
    // Try getting dishes with first DishGroupId
    if (groupResult.recordset.length > 0) {
      const groupId = groupResult.recordset[0].DishGroupId;
      console.log(`\n🍽️  Getting dishes for DishGroupId: ${groupId}`);
      
      const dishResult = await pool.request()
        .input('DishGroupId', groupId)
        .query(`
          SELECT TOP 3
            DishId,
            Name,
            DishGroupId,
            ISNULL((SELECT Amount FROM DishPriceList WHERE DishId = DishMaster.DishId), 0) AS Price
          FROM DishMaster
          WHERE DishGroupId = @DishGroupId
        `);
      
      console.log(`\nDishes in this group: ${dishResult.recordset.length}`);
      dishResult.recordset.forEach(d => {
        console.log(`  - ${d.Name} (ID: ${d.DishId}) - $${d.Price}`);
      });
    }
    
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
