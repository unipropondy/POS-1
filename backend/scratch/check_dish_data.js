const { poolPromise } = require("./config/db");

async function checkDishes() {
  try {
    const pool = await poolPromise;
    console.log("Checking Dishes Group route query...");
    const result = await pool.request().query("SELECT TOP 5 d.DishId, d.Name, d.Imageid FROM DishMaster d WHERE d.IsActive = 1");
    console.log("Sample Data:", JSON.stringify(result.recordset, null, 2));
    
    const result2 = await pool.request().query("SELECT TOP 5 Imageid FROM ImageList");
    console.log("Sample Images:", JSON.stringify(result2.recordset, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkDishes();
