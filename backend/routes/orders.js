const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");
const DEFAULT_GUID = "00000000-0000-0000-0000-000000000000";

/**
 * Get or Generate Order ID for a table
 * Returns existing ID if table is active, otherwise generates a new one.
 */
async function getOrGenerateOrderId(req, tableId) {
  const pool = await poolPromise;
  const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();

  // 1. Check if table already has an ID (Only for Dine-In)
  if (tableId && tableId !== "undefined" && tableId !== "null") {
    const tableCheck = await pool.request()
      .input("tid", sql.NVarChar(128), cleanId)
      .query("SELECT CurrentOrderId FROM TableMaster WHERE TableId = @tid");

    if (tableCheck.recordset[0]?.CurrentOrderId) {
      return tableCheck.recordset[0].CurrentOrderId;
    }
  }

  // 2. Resolve BusinessUnitId (Safe Logic)
  const bizRow = await pool.request().query(`
    SELECT TOP 1 BusinessUnitId FROM [dbo].[PaymentDetailCur] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'
    UNION ALL
    SELECT TOP 1 BusinessUnitId FROM [dbo].[SettlementHeader] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'
  `);
  let businessUnitId = bizRow.recordset.length > 0 ? bizRow.recordset[0].BusinessUnitId : DEFAULT_GUID;

  // 3. Atomic Sequence Generation
  const now = new Date();
  // Use local date string (YYYY-MM-DD) to ensure reset at local midnight
  const todayStr = now.toLocaleDateString('en-CA'); 
  
  let dailySequence;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    let seqResult = await transaction.request()
      .input("RestId", sql.UniqueIdentifier, businessUnitId)
      .input("Today", sql.Date, todayStr)
      .query(`
        UPDATE OrderSequences 
        SET LastNumber = LastNumber + 1 
        OUTPUT INSERTED.LastNumber
        WHERE RestaurantId = @RestId AND SequenceDate = @Today
      `);

    if (seqResult.recordset.length > 0) {
      dailySequence = seqResult.recordset[0].LastNumber;
    } else {
      await transaction.request()
        .input("RestId", sql.UniqueIdentifier, businessUnitId)
        .input("Today", sql.Date, todayStr)
        .query(`
          INSERT INTO OrderSequences (RestaurantId, SequenceDate, LastNumber)
          VALUES (@RestId, @Today, 1)
        `);
      dailySequence = 1;
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const displayOrderId = `${todayStr.replace(/-/g, '')}-${String(dailySequence).padStart(4, '0')}`;
  
  // 4. Attach to Table
  await pool.request()
    .input("tid", sql.UniqueIdentifier, cleanId)
    .input("oid", sql.NVarChar(50), displayOrderId)
    .query(`
      UPDATE TableMaster 
      SET CurrentOrderId = @oid, 
          StartTime = ISNULL(StartTime, GETDATE()) 
      WHERE TableId = @tid
    `);

  console.log(`✨ [OrderID] Generated ${displayOrderId} for Table ${cleanId}`);
  return displayOrderId;
}

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
          CurrentOrderId = CASE 
            WHEN @status = 0 THEN NULL
            ELSE CurrentOrderId
          END,
          ModifiedOn = GETDATE()
      WHERE UPPER(CAST(TableId AS VARCHAR(50))) = UPPER(@tableId)
    `);

  console.log(`✅ [DB] Update result: ${result.rowsAffected[0]} row(s) affected`);

  if (result.rowsAffected[0] > 0) {
    const io = req.app.get("io");
    if (io) {
      // Get full state for accurate broadcast
      const tableRes = await pool.request()
        .input("tableId", sql.VarChar(50), cleanId)
        .query(`
          SELECT TotalAmount, CONVERT(VARCHAR, StartTime, 126) AS StartTime,
          CASE 
            WHEN Status = 1 AND StartTime IS NOT NULL AND DATEDIFF(MINUTE, StartTime, GETDATE()) >= 60 THEN 1 
            ELSE 0 
          END AS isOvertime
          FROM TableMaster WHERE TableId = @tableId
        `);
      
      const row = tableRes.recordset[0];
      io.emit("table_status_updated", { 
        tableId: cleanId, 
        status: Number(status),
        totalAmount: row?.TotalAmount || 0,
        startTime: row?.StartTime || null,
        isOvertime: row?.isOvertime || 0
      });
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
      .input("tableId", sql.UniqueIdentifier, cleanId)
      .query(`
        DECLARE @itemCount INT = 0;
        DECLARE @total DECIMAL(18,2) = 0;
        
        SELECT @itemCount = COUNT(*), @total = ISNULL(SUM((Cost * (1 - ISNULL(DiscountAmount, 0)/100)) * Quantity), 0) 
        FROM CartItems WHERE TRY_CAST(CartId AS UniqueIdentifier) = @tableId AND (Status <> 'VOIDED' OR Status IS NULL);

        UPDATE TableMaster
        SET 
          Status = CASE 
            WHEN @itemCount > 0 THEN (CASE WHEN Status = 0 THEN 1 ELSE Status END)
            ELSE (CASE WHEN Status IN (1, 2, 3, 4) THEN 0 ELSE Status END)
          END,
          StartTime = CASE 
            WHEN @itemCount > 0 AND StartTime IS NULL THEN GETDATE()
            WHEN @itemCount = 0 THEN NULL
            ELSE StartTime
          END,
          TotalAmount = @total,
          ModifiedOn = GETDATE()
        WHERE TableId = @tableId;

        SELECT Status, TotalAmount, CONVERT(VARCHAR, StartTime, 126) AS StartTime, CurrentOrderId,
        CASE 
          WHEN Status = 1 AND StartTime IS NOT NULL AND DATEDIFF(MINUTE, StartTime, GETDATE()) >= 60 THEN 1 
          ELSE 0 
        END AS isOvertime
        FROM TableMaster WHERE TableId = @tableId;
      `);

    const updated = result.recordset[0];
    if (updated) {
      const io = req.app.get("io");
      if (io) {
        io.emit("table_status_updated", { 
          tableId: cleanId, 
          status: updated.Status,
          totalAmount: updated.TotalAmount,
          StartTime: updated.StartTime,
          currentOrderId: updated.CurrentOrderId,
          isOvertime: updated.isOvertime || 0
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
    const { tableId, orderType } = req.body;
    const isTakeaway = orderType === "TAKEAWAY" || (!tableId || tableId === "undefined" || tableId === "null");

    const pool = await poolPromise;
    const cleanId = !isTakeaway ? String(tableId).replace(/^\{|\}$/g, "").trim() : null;

    // Generate Order ID (Logic handles null tableId for Takeaway)
    const currentOrderId = await getOrGenerateOrderId(req, cleanId);

      if (cleanId) {
        await pool.request()
          .input("tableId", sql.UniqueIdentifier, cleanId)
          .input("orderId", sql.NVarChar(50), currentOrderId)
          .query("UPDATE TableMaster SET Status = 1, CurrentOrderId = @orderId, StartTime = ISNULL(StartTime, GETDATE()) WHERE TableId = @tableId");
      
      // Also update all NEW cart items with this Order ID and set status to SENT
      await pool.request()
        .input("cartId", sql.NVarChar(128), cleanId)
        .input("orderId", sql.NVarChar(50), currentOrderId)
        .query("UPDATE CartItems SET OrderNo = @orderId, DateCreated = GETDATE(), Status = 'SENT' WHERE CartId = @cartId AND (OrderNo IS NULL OR OrderNo = 'PENDING' OR Status = 'NEW')");

      const updated = await syncTableStatus(req, tableId);
      return res.json({ success: true, currentOrderId, ...updated });
    } else {
      // Takeaway logic: Just return the new ID
      return res.json({ success: true, currentOrderId });
    }
  } catch (err) {
    console.error("❌ [Send Order] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Hold Order
router.post("/hold", async (req, res) => {
  try {
    const { tableId } = req.body;
    if (!tableId) return res.status(400).json({ error: "TableId is required" });

    // Use syncTableStatus which updates both Status (to 3) and TotalAmount
    const pool = await poolPromise;
    const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();
    
    await pool.request()
      .input("tableId", sql.NVarChar(128), cleanId)
      .query("UPDATE TableMaster SET Status = 3 WHERE TableId = @tableId");

    const updated = await syncTableStatus(req, tableId);
    res.json({ success: true, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Checkout (Bill Requested)
router.post("/checkout", async (req, res) => {
  try {
    const { tableId } = req.body;
    if (!tableId) return res.status(400).json({ error: "TableId is required" });

    const pool = await poolPromise;
    const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();
    await pool.request()
      .input("tableId", sql.NVarChar(128), cleanId)
      .query("UPDATE TableMaster SET Status = 2 WHERE TableId = @tableId");

    const updated = await syncTableStatus(req, tableId);
    res.json({ success: true, ...updated });
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
      .query("UPDATE TableMaster SET Status = 0, TotalAmount = 0, StartTime = NULL, CurrentOrderId = NULL WHERE TableId = @tid");

    if (io) {
      io.emit("table_status_updated", { tableId: cleanId, status: 0, totalAmount: 0, startTime: null });
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

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. PROFESSIONAL FLOW: Clear ONLY NEW (unsent) items for this table
      // This preserves items already in the kitchen (SENT, READY, etc.)
      await transaction.request()
        .input("cartId", sql.NVarChar(sql.MAX), cleanTableId)
        .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @cartId AND (Status = 'NEW' OR Status IS NULL)");

      const io = req.app.get("io");

      // 2. If we have items, insert only the ones that are NOT in the DB already (or refresh NEW ones)
      if (items && items.length > 0) {
        for (const item of items) {
          // If the item is already SENT/READY, we don't re-insert it (it was preserved by Step 1)
          if (item.status && item.status !== "NEW") continue;

          const cleanProdId = String(item.id).replace(/^\{|\}$/g, "").trim();
          const cleanOrderNo = String(orderId || "PENDING").replace(/^\{|\}$/g, "").trim();
          const newItemId = item.lineItemId || require("crypto").randomUUID();
          
          await transaction.request()
            .input("itemId", sql.NVarChar(128), newItemId)
            .input("cartId", sql.NVarChar(sql.MAX), cleanTableId)
            .input("qty", sql.Int, item.qty || 1)
            .input("productId", sql.NVarChar(128), cleanProdId)
            .input("orderNo", sql.NVarChar(sql.MAX), cleanOrderNo)
            .input("cost", sql.Decimal(18, 2), item.price || 0)
            .input("isTakeaway", sql.Bit, item.isTakeaway ? 1 : 0)
            .input("isVoided", sql.Bit, item.isVoided ? 1 : 0)
            .input("discountAmount", sql.Decimal(18, 2), item.discount || 0)
            .input("discountType", sql.NVarChar(20), "fixed") // Default to fixed
            .input("note", sql.NVarChar(sql.MAX), item.note || "")
            .input("modifiersJSON", sql.NVarChar(sql.MAX), JSON.stringify(item.modifiers || []))
            .input("spicy", sql.NVarChar(50), item.spicy || "")
            .input("salt", sql.NVarChar(50), item.salt || "")
            .input("oil", sql.NVarChar(50), item.oil || "")
            .input("sugar", sql.NVarChar(50), item.sugar || "")
            .input("status", sql.NVarChar(20), "NEW")
            .query(`
              INSERT INTO [dbo].[CartItems] 
              (ItemId, CartId, ProductId, Quantity, Cost, OrderNo, OrderConfirmQty, DateCreated, 
               IsTakeaway, IsVoided, Note, ModifiersJSON, Spicy, Salt, Oil, Sugar, Status, DiscountAmount, DiscountType)
              VALUES 
              (@itemId, @cartId, @productId, @qty, @cost, @orderNo, @qty, GETDATE(), 
               @isTakeaway, @isVoided, @note, @modifiersJSON, @spicy, @salt, @oil, @sugar, @status, @discountAmount, @discountType)
            `);
        }

        // Update table status to 1 (Occupied/Dining)
        await transaction.request()
          .input("tableId", sql.UniqueIdentifier, cleanTableId)
          .query("UPDATE TableMaster SET Status = 1, StartTime = ISNULL(StartTime, GETDATE()) WHERE TableId = @tableId");
        
        console.log(`✅ [CartSave] Saved ${items.length} items. Table Status -> 1`);
      } else {
        // 3. If items are empty, reset table to Available (0)
        await transaction.request()
          .input("tableId", sql.UniqueIdentifier, cleanTableId)
          .query("UPDATE TableMaster SET Status = 0, StartTime = NULL, CurrentOrderId = NULL WHERE TableId = @tableId");
        
        if (io) io.emit("table_status_updated", { tableId: cleanTableId, status: 0 });
        console.log(`🧹 [CartSave] Cart cleared. Table Status -> 0`);
      }

      await transaction.commit();
      res.json({ success: true });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
    
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
      .input("cartId", sql.NVarChar(128), cleanTableId)
      .input("productId", sql.NVarChar(128), cleanProdId)
      .input("qty", sql.Int, item.qty || 1)
      .input("cost", sql.Decimal(18, 2), item.price || 0)
      .input("note", sql.NVarChar(sql.MAX), item.note || "")
      .input("modifiersJSON", sql.NVarChar(sql.MAX), JSON.stringify(item.modifiers || []))
      .input("isTakeaway", sql.Bit, item.isTakeaway ? 1 : 0)
      .input("status", sql.NVarChar(20), "NEW")
      .query(`
        BEGIN TRANSACTION;
        BEGIN TRY
          IF EXISTS (
            SELECT 1 FROM [dbo].[CartItems] WITH (UPDLOCK, HOLDLOCK)
            WHERE CartId = @cartId 
              AND ProductId = @productId 
              AND Status = @status
              AND IsTakeaway = @isTakeaway
              AND (ModifiersJSON = @modifiersJSON OR (ModifiersJSON IS NULL AND @modifiersJSON = '[]'))
              AND (Note = @note OR (Note IS NULL AND @note = ''))
          )
          BEGIN
            UPDATE [dbo].[CartItems] 
            SET Quantity = Quantity + @qty, 
                OrderConfirmQty = ISNULL(OrderConfirmQty, 0) + @qty
            WHERE CartId = @cartId 
              AND ProductId = @productId 
              AND Status = @status
              AND IsTakeaway = @isTakeaway
              AND (ModifiersJSON = @modifiersJSON OR (ModifiersJSON IS NULL AND @modifiersJSON = '[]'))
              AND (Note = @note OR (Note IS NULL AND @note = ''));
          END
          ELSE
          BEGIN
            INSERT INTO [dbo].[CartItems] 
            (ItemId, CartId, ProductId, Quantity, Cost, OrderNo, OrderConfirmQty, DateCreated, Status, Note, ModifiersJSON, IsTakeaway)
            VALUES 
            (NEWID(), @cartId, @productId, @qty, @cost, 'PENDING', @qty, GETDATE(), @status, @note, @modifiersJSON, @isTakeaway);
          END
          COMMIT TRANSACTION;
        END TRY
        BEGIN CATCH
          ROLLBACK TRANSACTION;
          THROW;
        END CATCH
      `);

    const updated = await syncTableStatus(req, cleanTableId);
    res.json({ success: true, itemId: newItemId, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Remove/Void Item (Supports Partial Voiding)
router.post("/remove-item", async (req, res) => {
  try {
    const { tableId, productId, itemId, qtyToVoid } = req.body;
    const pool = await poolPromise;
    const cleanTableId = String(tableId).replace(/^\{|\}$/g, "").trim();

    if (!itemId) {
       // Original behavior for NEW items by ProductId
       await pool.request()
        .input("cartId", sql.NVarChar(128), cleanTableId)
        .input("prodId", sql.NVarChar(128), productId)
        .query("DELETE FROM CartItems WHERE CartId = @cartId AND ProductId = @prodId AND Status = 'NEW'");
       return res.json({ success: true });
    }

    // 1. Fetch current item details
    const itemResult = await pool.request()
      .input("itemId", sql.NVarChar(128), itemId)
      .query("SELECT * FROM CartItems WHERE ItemId = @itemId");
    
    const item = itemResult.recordset[0];
    if (!item) return res.status(404).json({ error: "Item not found" });

    const currentQty = item.Quantity;
    const voidQty = qtyToVoid || currentQty; // Default to all

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      if (voidQty < currentQty) {
        // PROFESSIONAL PARTIAL VOID: Split the line item
        // a) Create the VOIDED portion
        await transaction.request()
          .input("parentItemId", sql.NVarChar(128), itemId)
          .input("voidQty", sql.Int, voidQty)
          .query(`
            INSERT INTO [dbo].[CartItems] 
            (ItemId, CartId, ProductId, Quantity, Cost, OrderNo, OrderConfirmQty, DateCreated, 
             IsTakeaway, IsVoided, Note, ModifiersJSON, Spicy, Salt, Oil, Sugar, Status, DiscountAmount, DiscountType)
            SELECT 
              NEWID(), CartId, ProductId, @voidQty, Cost, OrderNo, @voidQty, GETDATE(), 
              IsTakeaway, 1, Note, ModifiersJSON, Spicy, Salt, Oil, Sugar, 'VOIDED', DiscountAmount, DiscountType
            FROM CartItems WHERE ItemId = @parentItemId
          `);

        // b) Update original item with reduced quantity
        await transaction.request()
          .input("itemId", sql.NVarChar(128), itemId)
          .input("newQty", sql.Int, currentQty - voidQty)
          .query("UPDATE CartItems SET Quantity = @newQty, OrderConfirmQty = @newQty WHERE ItemId = @itemId");

      } else {
        // FULL VOID: Just update status
        await transaction.request()
          .input("itemId", sql.NVarChar(128), itemId)
          .query("UPDATE CartItems SET Status = 'VOIDED', IsVoided = 1 WHERE ItemId = @itemId");
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    const updated = await syncTableStatus(req, cleanTableId);
    res.json({ success: true, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Update Individual Item Status (READY, SERVED, etc.)
router.post("/update-item-status", async (req, res) => {
  try {
    const { orderId, lineItemId, status } = req.body;
    if (!lineItemId || !status) return res.status(400).json({ error: "Missing parameters" });

    const pool = await poolPromise;
    await pool.request()
      .input("itemId", sql.NVarChar(128), lineItemId)
      .input("status", sql.NVarChar(20), status)
      .query("UPDATE CartItems SET Status = @status WHERE ItemId = @itemId");

    // Broadcast update via socket
    const io = req.app.get("io");
    if (io) {
      console.log(`📢 [Socket] Broadcasting status update: ${lineItemId} -> ${status}`);
      io.emit("item_status_updated", { orderId, lineItemId, status });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ [UpdateStatus] ERROR:", err.message);
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

// ✅ Fetch All Active Kitchen Orders (For KDS/Kitchen Status Sync)
router.get("/active-kitchen", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        c.ItemId, c.CartId, c.ProductId, c.Quantity, c.Status, c.Cost, c.OrderNo, c.ModifiersJSON, c.IsTakeaway, c.IsVoided, c.Note,
        c.DiscountAmount, c.DiscountType,
        CONVERT(VARCHAR, c.DateCreated, 126) as DateCreated,
        d.Name as name, 
        d.CurrentCost as price,
        t.TableNumber as tableNo,
        t.DiningSection as section,
        t.TableId as tableId,
        t.CurrentOrderId as tableOrderId
      FROM [dbo].[CartItems] c
      LEFT JOIN [dbo].[DishMaster] d ON CAST(c.ProductId AS NVARCHAR(128)) = CAST(d.DishId AS NVARCHAR(128))
      LEFT JOIN [dbo].[TableMaster] t ON CAST(c.CartId AS NVARCHAR(128)) = CAST(t.TableId AS NVARCHAR(128))
      WHERE c.Status IN ('SENT', 'READY', 'NEW', 'HOLD', 'SERVED')
      AND (t.Status IN (1, 2, 3) OR c.Status = 'NEW')
      ORDER BY c.DateCreated ASC
    `);

    // Group items by OrderNo or tableOrderId
    const ordersMap = new Map();

    result.recordset.forEach(row => {
      // Prioritize the professional tableOrderId (from TableMaster) over the internal OrderNo
      const orderId = row.tableOrderId || (row.OrderNo && row.OrderNo !== 'PENDING' ? row.OrderNo : row.CartId);
      if (!orderId) return;

      if (!ordersMap.has(orderId)) {
        const ds = Number(row.section);
        let sectionStr = "SECTION_1";
        if (ds === 1) sectionStr = "SECTION_1";
        else if (ds === 2) sectionStr = "SECTION_2";
        else if (ds === 3) sectionStr = "SECTION_3";
        else if (ds === 4) sectionStr = "TAKEAWAY";

        ordersMap.set(orderId, {
          orderId,
          context: {
            orderType: row.tableNo ? "DINE_IN" : "TAKEAWAY",
            tableNo: row.tableNo,
            section: sectionStr,
            tableId: row.tableId,
            takeawayNo: !row.tableNo ? (row.OrderNo || row.CartId) : null
          },
          items: [],
          createdAt: new Date(row.DateCreated).getTime()
        });
      }

      const order = ordersMap.get(orderId);
      order.items.push({
        id: row.ProductId,
        lineItemId: row.ItemId,
        qty: row.Quantity,
        name: row.name || "Unknown",
        price: row.price || row.Cost,
        status: row.Status,
        sentAt: new Date(row.DateCreated).getTime(),
        readyAt: row.Status === 'READY' ? new Date(row.DateCreated).getTime() : null, // Fallback
        modifiers: row.ModifiersJSON ? JSON.parse(row.ModifiersJSON) : [],
        isTakeaway: !!row.IsTakeaway,
        isVoided: !!row.IsVoided,
        note: row.Note,
        discount: row.DiscountAmount || 0
      });
    });

    res.json({
      serverTime: new Date().getTime(),
      orders: Array.from(ordersMap.values())
    });
  } catch (err) {
    console.error("❌ [ActiveKitchen] ERROR:", err.message);
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
        SELECT c.ItemId, c.CartId, c.ProductId, c.Quantity, c.Status, c.Cost, c.OrderNo, c.ModifiersJSON, c.IsTakeaway, c.IsVoided, c.Note,
        c.DiscountAmount, c.DiscountType,
        CONVERT(VARCHAR, c.DateCreated, 126) as DateCreated,
        d.Name as name, d.CurrentCost as price
        FROM [dbo].[CartItems] c
        LEFT JOIN [dbo].[DishMaster] d ON CAST(c.ProductId AS NVARCHAR(128)) = CAST(d.DishId AS NVARCHAR(128))
        WHERE c.CartId = @cartId
      `);

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
      sugar: item.Sugar,
      discount: item.DiscountAmount || 0,
      DiscountAmount: item.DiscountAmount || 0
    }));

    const tableInfo = await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .query("SELECT CurrentOrderId FROM TableMaster WHERE TableId = @tid");

    res.json({ 
      items, 
      currentOrderId: tableInfo.recordset[0]?.CurrentOrderId || null 
    });
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
