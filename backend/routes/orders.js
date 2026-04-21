const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");

/**
 * Update Table and Order Status Helper
 * Sets TableMaster Status and [Order] StatusCode
 */
async function updateTableStatus(req, tableId, status) {
  const pool = await poolPromise;
  const cleanId = tableId.replace(/^\{|\}$/g, "").trim();
  
  console.log(`[DEBUG] Attempting status update for Table: ${cleanId} to ${status}`);

  // 1. Update TableMaster
  const tableResult = await pool.request()
    .input("tableId", sql.VarChar(50), cleanId)
    .input("status", sql.Int, status)
    .query(`
      UPDATE TableMaster 
      SET Status = @status,
          StartTime = CASE 
            WHEN (@status = 1 OR @status = 2) AND StartTime IS NULL THEN GETDATE()
            WHEN @status = 0 THEN NULL
            ELSE StartTime
          END
      WHERE CAST(TableId AS VARCHAR(50)) = @tableId 
         OR LTRIM(RTRIM(CAST(TableId AS VARCHAR(50)))) = LTRIM(RTRIM(@tableId))
         OR TableId = @tableId;
      SELECT @@ROWCOUNT AS affected;
    `);

  console.log(`[DEBUG] TableMaster update for ${cleanId} affected ${tableResult.recordset[0].affected} rows.`);

  // 2. Update [dbo].[Order] table (Mapping Table Status to Order StatusCode: 1->1, 2->2, 3->3)
  if (status > 0) {
    try {
      const orderResult = await pool.request()
        .input("tableId", sql.VarChar(50), cleanId)
        .input("status", sql.Int, status)
        .query(`
          UPDATE [dbo].[Order]
          SET StatusCode = @status
          WHERE (CAST(TableId AS VARCHAR(50)) = @tableId OR TableId = @tableId)
          AND StatusCode < @status; 
          SELECT @@ROWCOUNT AS affected;
        `);
      console.log(`[DEBUG] [Order] table update for ${cleanId} affected ${orderResult.recordset[0].affected} rows.`);
    } catch (err) {
      console.warn(`[DEBUG] Could not update [Order] table for ${cleanId}: ${err.message}`);
    }
  }

  const io = req.app.get("io");
  if (io) {
    io.emit("table_status_updated", { tableId: cleanId, status });
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

    await updateTableStatus(req, tableId, 2); // 2 = Hold
    res.json({ success: true, status: 2 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Checkout (Bill Requested)
router.post("/checkout", async (req, res) => {
  try {
    const { tableId } = req.body;
    if (!tableId) return res.status(400).json({ error: "TableId is required" });

    await updateTableStatus(req, tableId, 3); // 3 = Checkout
    res.json({ success: true, status: 3 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Complete / Payment -> Available
router.post("/complete", async (req, res) => {
  try {
    const { tableId } = req.body;
    if (!tableId) return res.status(400).json({ error: "TableId is required" });

    await updateTableStatus(req, tableId, 0); // 0 = Available
    res.json({ success: true, status: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
