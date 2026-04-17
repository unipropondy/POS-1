const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { poolPromise } = require('../config/db');

(async () => {
    try {
        const pool = await poolPromise;
        
        console.log("--- Categories ---");
        const categories = await pool.request().query("SELECT * FROM CategoryMaster");
        console.table(categories.recordset);

        console.log("\n--- Dish Groups ---");
        const groups = await pool.request().query("SELECT * FROM DishGroupMaster");
        console.table(groups.recordset);

        console.log("\n--- Specific Malay Kitchen Search ---");
        const malayCat = categories.recordset.find(c => c.CategoryName && c.CategoryName.toLowerCase().includes('malay'));
        
        if (malayCat) {
            console.log(`Found Malay Category: ID ${malayCat.CategoryId}`);
            const malayGroups = await pool.request()
                .input('cid', malayCat.CategoryId)
                .query("SELECT * FROM DishGroupMaster WHERE CategoryId = @cid");
            console.log("Groups in Malay Kitchen:");
            console.table(malayGroups.recordset);

            for (const group of malayGroups.recordset) {
                console.log(`\nDishes in Group: ${group.DishGroupName} (ID: ${group.DishGroupId})`);
                const dishes = await pool.request()
                    .input('gid', group.DishGroupId)
                    .query(`
                        SELECT d.DishId, d.Name, d.IsActive, p.Amount 
                        FROM DishMaster d
                        LEFT JOIN DishPriceList p ON d.DishId = p.DishId
                        WHERE d.DishGroupId = @gid
                    `);
                console.table(dishes.recordset);
            }
        } else {
            console.log("No category containing 'malay' found.");
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
