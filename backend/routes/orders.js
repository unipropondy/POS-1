const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");

/**
 * Update Table Status Helper
 * Sets TableMaster Status and emits socket event
 */
async function updateTableStatus(req, tableId, status) {
  if (!tableId) throw new Error("tableId is required for status update");
  const pool = await poolPromise;
  const cleanId = tableId.replace(/^\{|\}$/g, "").trim();
  
  console.log(`🛠️ [DB] Attempting status update: Table=${cleanId}, Status=${status}`);

  const result = await pool.request()
    .input("tableId", sql.VarChar(50), cleanId)
    .input("status", sql.Int, status)
    .query(`
      UPDATE TableMaster 
      SET Status = @status,
          StartTime = CASE 
            WHEN (@status = 1 OR @status = 3) AND StartTime IS NULL THEN GETDATE()
            WHEN @status = 0 THEN NULL
            ELSE StartTime
          END,
          ModifiedOn = GETDATE()
      WHERE UPPER(CAST(TableId AS VARCHAR(50))) = UPPER(@tableId)
    `);

  console.log(`✅ [DB] Update result: ${result.rowsAffected[0]} row(s) affected`);

  if (result.rowsAffected[0] > 0) {
    const io = req.app.get("io");
    if (io) {
      io.emit("table_status_updated", { tableId: cleanId, status });
    }
  }
}

// 1. Send Order (KOT/KDS) -> Dining
router.post("/send", async (req, res) => {
  try {
    const { tableId } = req.body;
    if (!tableId) return res.status(400).json({ error: "TableId is required" });

    await updateTableStatus(req, tableId, 1); // 1 = Dining
    res.json({ success: true, status: 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Hold Order
router.post("/hold", async (req, res) => {
  try {
    const { tableId } = req.body;
    if (!tableId) return res.status(400).json({ error: "TableId is required" });

    await updateTableStatus(req, tableId, 3); // 3 = Hold
    res.json({ success: true, status: 3 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Checkout (Bill Requested)
router.post("/checkout", async (req, res) => {
  try {
    const { tableId } = req.body;
    if (!tableId) return res.status(400).json({ error: "TableId is required" });

    await updateTableStatus(req, tableId, 2); // 2 = Checkout
    res.json({ success: true, status: 2 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Complete / Payment -> Available
router.post("/complete", async (req, res) => {
  try {
    const { tableId } = req.body;
    if (!tableId) return res.status(400).json({ error: "TableId is required" });

    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();
    const pool = await poolPromise;

    // Clear CartItems on payment complete
    await pool.request()
      .input("cartId", sql.VarChar(100), cleanId)
      .query("DELETE FROM [CartItems] WHERE [CartId] = @cartId");

    await updateTableStatus(req, tableId, 0); // 0 = Available
    res.json({ success: true, status: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Save Cart Items Persistent
router.post("/save-cart", async (req, res) => {
  try {
    const { tableId, orderId, items } = req.body;
    console.log(`📥 [CartSave] Table: ${tableId} | Items: ${items?.length}`);
    
    const pool = await poolPromise;
    const cleanTableId = String(tableId).replace(/^\{|\}$/g, "").trim();

    // 1. Clear old cart for this table
    await pool.request()
      .input("cartId", sql.NVarChar(sql.MAX), cleanTableId)
      .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @cartId");

    // 2. Insert new items if any
    if (items && items.length > 0) {
      for (const item of items) {
        const cleanProdId = String(item.id).replace(/^\{|\}$/g, "").trim();
        const cleanOrderNo = String(orderId || "PENDING").replace(/^\{|\}$/g, "").trim();
        const newItemId = require("crypto").randomUUID();
        
        await pool.request()
          .input("itemId", sql.NVarChar(128), newItemId)
          .input("cartId", sql.NVarChar(sql.MAX), cleanTableId)
          .input("qty", sql.Int, item.qty || 1)
          .input("productId", sql.NVarChar(128), cleanProdId)
          .input("orderNo", sql.NVarChar(sql.MAX), cleanOrderNo)
          .input("cost", sql.Decimal(18, 2), item.price || 0)
          .query(`
            INSERT INTO [dbo].[CartItems] 
            (ItemId, CartId, Quantity, ProductId, OrderNo, Cost, DateCreated, OrderConfirmQty)
            VALUES 
            (@itemId, @cartId, @qty, @productId, @orderNo, @cost, GETDATE(), @qty)
          `);
      }
      
      // Update table status to 1 (Occupied)
      await pool.request()
        .input("tableId", sql.UniqueIdentifier, cleanTableId)
        .query("UPDATE TableMaster SET Status = 1 WHERE TableId = @tableId");
      console.log(`✅ [CartSave] Saved ${items.length} items. Table Status -> 1`);
    } else {
      // If cart is empty, set table status to 0 (Empty)
      await pool.request()
        .input("tableId", sql.UniqueIdentifier, cleanTableId)
        .query("UPDATE TableMaster SET Status = 0 WHERE TableId = @tableId");
      console.log(`✅ [CartSave] Cart cleared. Table Status -> 0`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ [CartSave] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Fetch Cart Items Persistent
router.get("/cart/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;
    const pool = await poolPromise;
    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();

    console.log(`🔍 [CartFetch] Fetching for Table: ${cleanId}`);

    const result = await pool.request()
      .input("cartId", sql.NVarChar(sql.MAX), cleanId)
      .query(`
        SELECT c.*, d.Name as name, d.CurrentCost as price
        FROM [dbo].[CartItems] c
        LEFT JOIN [dbo].[DishMaster] d ON CAST(c.ProductId AS NVARCHAR(128)) = CAST(d.DishId AS NVARCHAR(128))
        WHERE c.CartId = @cartId
      `);

    console.log(`🔍 [CartFetch] Found ${result.recordset.length} items`);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ [CartFetch] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Debug Schema
router.get("/debug-schema", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CartItems'
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
