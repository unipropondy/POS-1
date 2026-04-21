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
            WHEN (@status = 1 OR @status = 2) AND StartTime IS NULL THEN GETDATE()
            WHEN @status = 0 THEN NULL
            ELSE StartTime
          END
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
