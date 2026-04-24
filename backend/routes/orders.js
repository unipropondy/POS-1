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

    // Clear cartitems on payment complete
    await pool.request()
      .input("cartId", sql.VarChar(50), cleanId)
      .query("DELETE FROM cartitems WHERE CartId = @cartId");

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
    const pool = await poolPromise;
    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();

    // Clear old cart for this table
    await pool.request()
      .input("cartId", sql.VarChar(50), cleanId)
      .query("DELETE FROM cartitems WHERE CartId = @cartId");

    // Insert new items
    for (const item of items) {
      await pool.request()
        .input("cartId", sql.VarChar(50), cleanId)
        .input("qty", sql.Int, item.qty)
        .input("productId", sql.VarChar(50), item.id)
        .input("orderNo", sql.VarChar(50), orderId || "PENDING")
        .input("cost", sql.Decimal(18, 2), item.price)
        .query(`
          INSERT INTO cartitems (CartId, Quantity, ProductId, OrderNo, Cost, DateCreated)
          VALUES (@cartId, @qty, @productId, @orderNo, @cost, GETDATE())
        `);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("SAVE CART ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Fetch Cart Items Persistent
router.get("/cart/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;
    const pool = await poolPromise;
    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();

    const result = await pool.request()
      .input("cartId", sql.VarChar(50), cleanId)
      .query(`
        SELECT c.*, d.Name as name, d.currentcost as price
        FROM cartitems c
        LEFT JOIN DishMaster d ON CAST(c.ProductId AS VARCHAR(50)) = CAST(d.DishId AS VARCHAR(50))
        WHERE c.CartId = @cartId
      `);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
