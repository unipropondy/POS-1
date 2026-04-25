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

/**
 * Sync Table Status & Total
 * Recalculates total from CartItems and updates TableMaster
 */
async function syncTableStatus(req, tableId) {
  try {
    const pool = await poolPromise;
    const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();

    // 1. Recalculate and Update in one transaction
    const result = await pool.request()
      .input("tableId", sql.NVarChar(128), cleanId)
      .query(`
        DECLARE @total DECIMAL(18,2) = 0;
        SELECT @total = ISNULL(SUM(Cost * Quantity), 0) FROM CartItems WHERE CartId = @tableId;

        UPDATE TableMaster
        SET 
          Status = CASE 
            -- If items exist, ensure it's not Available (0). If it was 0, move to Dining (1).
            WHEN EXISTS (SELECT 1 FROM CartItems WHERE CartId = @tableId) 
              THEN (CASE WHEN Status = 0 THEN 1 ELSE Status END)
            -- If no items exist, reset to Available (0) if it was in an active/pending state.
            ELSE (CASE WHEN Status IN (1, 2, 3, 4) THEN 0 ELSE Status END)
          END,
          TotalAmount = @total,
          ModifiedOn = GETDATE()
        WHERE UPPER(CAST(TableId AS VARCHAR(50))) = UPPER(@tableId);

        SELECT Status, TotalAmount FROM TableMaster WHERE UPPER(CAST(TableId AS VARCHAR(50))) = UPPER(@tableId);
      `);

    const updated = result.recordset[0];
    if (updated) {
      const io = req.app.get("io");
      if (io) {
        io.emit("table_status_updated", { 
          tableId: cleanId, 
          status: updated.Status,
          totalAmount: updated.TotalAmount 
        });
        io.emit("cart_updated", { tableId: cleanId });
      }
    }
    return updated;
  } catch (err) {
    console.error("❌ [SyncTable] Error:", err.message);
    throw err;
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

    await pool.request()
      .input("cartId", sql.NVarChar(sql.MAX), cleanId)
      .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @cartId");

    await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .query("UPDATE TableMaster SET Status = 0, TotalAmount = 0, StartTime = NULL WHERE TableId = @tid");

    const io = req.app.get("io");
    if (io) {
      io.emit("table_status_updated", { tableId: cleanId, status: 0, totalAmount: 0 });
      io.emit("cart_updated", { tableId: cleanId });
    }
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

    // 1. Always Clear old cart for this table first
    await pool.request()
      .input("cartId", sql.NVarChar(sql.MAX), cleanTableId)
      .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @cartId");

    const io = req.app.get("io");

    // 2. If we have items, insert them and set table to DINING (1)
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
          .input("isTakeaway", sql.Bit, item.isTakeaway ? 1 : 0)
          .input("isVoided", sql.Bit, item.isVoided ? 1 : 0)
          .input("note", sql.NVarChar(sql.MAX), item.note || "")
          .input("modifiersJSON", sql.NVarChar(sql.MAX), JSON.stringify(item.modifiers || []))
          .input("spicy", sql.NVarChar(50), item.spicy || "")
          .input("salt", sql.NVarChar(50), item.salt || "")
          .input("oil", sql.NVarChar(50), item.oil || "")
          .input("sugar", sql.NVarChar(50), item.sugar || "")
          .input("status", sql.NVarChar(20), item.status || "NEW")
          .query(`
            INSERT INTO [dbo].[CartItems] 
            (ItemId, CartId, ProductId, Quantity, Cost, OrderNo, OrderConfirmQty, DateCreated, 
             IsTakeaway, IsVoided, Note, ModifiersJSON, Spicy, Salt, Oil, Sugar, Status)
            VALUES 
            (@itemId, @cartId, @productId, @qty, @cost, @orderNo, @qty, GETDATE(), 
             @isTakeaway, @isVoided, @note, @modifiersJSON, @spicy, @salt, @oil, @sugar, @status)
          `);
      }

      // Update table status to 1 (Occupied/Dining)
      await pool.request()
        .input("tableId", sql.UniqueIdentifier, cleanTableId)
        .query("UPDATE TableMaster SET Status = 1 WHERE TableId = @tableId");
      
      if (io) io.emit("table_status_updated", { tableId: cleanTableId, status: 1 });
      console.log(`✅ [CartSave] Saved ${items.length} items. Table Status -> 1`);
    } else {
      // 3. If items are empty, reset table to Available (0)
      await pool.request()
        .input("tableId", sql.UniqueIdentifier, cleanTableId)
        .query("UPDATE TableMaster SET Status = 0, StartTime = NULL WHERE TableId = @tableId");
      
      if (io) io.emit("table_status_updated", { tableId: cleanTableId, status: 0 });
      console.log(`🧹 [CartSave] Cart cleared. Table Status -> 0`);
    }

    res.json({ success: true });
    
    // Sync table status & total in background
    syncTableStatus(req, cleanTableId).catch(err => console.error("Sync Error:", err));
  } catch (err) {
    console.error("❌ [CartSave] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Add Single Item and Sync
router.post("/add-item", async (req, res) => {
  try {
    const { tableId, orderId, item } = req.body;
    const pool = await poolPromise;
    const cleanTableId = String(tableId).replace(/^\{|\}$/g, "").trim();
    const cleanProdId = String(item.id).replace(/^\{|\}$/g, "").trim();
    const cleanOrderNo = String(orderId || "PENDING").replace(/^\{|\}$/g, "").trim();
    const newItemId = require("crypto").randomUUID();

    await pool.request()
      .input("itemId", sql.NVarChar(128), newItemId)
      .input("cartId", sql.NVarChar(128), cleanTableId)
      .input("qty", sql.Int, item.qty || 1)
      .input("productId", sql.NVarChar(128), cleanProdId)
      .input("orderNo", sql.NVarChar(128), cleanOrderNo)
      .input("cost", sql.Decimal(18, 2), item.price || 0)
      .input("note", sql.NVarChar(sql.MAX), item.note || "")
      .input("modifiersJSON", sql.NVarChar(sql.MAX), JSON.stringify(item.modifiers || []))
      .query(`
        INSERT INTO [dbo].[CartItems] 
        (ItemId, CartId, Quantity, ProductId, OrderNo, Cost, DateCreated, OrderConfirmQty, Note, ModifiersJSON)
        VALUES 
        (@itemId, @cartId, @qty, @productId, @orderNo, @cost, GETDATE(), @qty, @note, @modifiersJSON)
      `);

    const updated = await syncTableStatus(req, cleanTableId);
    res.json({ success: true, itemId: newItemId, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Remove Item and Sync
router.post("/remove-item", async (req, res) => {
  try {
    const { tableId, productId, itemId } = req.body;
    const pool = await poolPromise;
    const cleanTableId = String(tableId).replace(/^\{|\}$/g, "").trim();

    const request = pool.request().input("cartId", sql.NVarChar(128), cleanTableId);
    
    if (itemId) {
      request.input("itemId", sql.NVarChar(128), itemId);
      await request.query("DELETE FROM CartItems WHERE CartId = @cartId AND ItemId = @itemId");
    } else if (productId) {
      request.input("prodId", sql.NVarChar(128), productId);
      await request.query("DELETE FROM CartItems WHERE CartId = @cartId AND ProductId = @prodId");
    } else {
      return res.status(400).json({ error: "Missing itemId or productId" });
    }

    const updated = await syncTableStatus(req, cleanTableId);
    res.json({ success: true, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Sync Manual Trigger
router.post("/sync/:tableId", async (req, res) => {
  try {
    const updated = await syncTableStatus(req, req.params.tableId);
    res.json({ success: true, ...updated });
  } catch (err) {
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
    
    // Parse JSON and flags for frontend
    const items = result.recordset.map(item => ({
      ...item,
      id: item.ProductId,
      lineItemId: item.ItemId,
      qty: item.Quantity,
      name: item.name,
      price: item.price || item.Cost,
      status: item.Status || "NEW",
      modifiers: item.ModifiersJSON ? JSON.parse(item.ModifiersJSON) : [],
      isTakeaway: !!item.IsTakeaway,
      isVoided: !!item.IsVoided,
      note: item.Note,
      spicy: item.Spicy,
      salt: item.Salt,
      oil: item.Oil,
      sugar: item.Sugar
    }));

    res.json(items);
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
