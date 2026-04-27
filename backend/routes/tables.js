const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");

// In-memory table locks
const tableLocks = new Map();

// Clear old locks every minute (older than 30 mins)
setInterval(() => {
  const now = Date.now();
  for (const [tableId, lock] of tableLocks.entries()) {
    if (now - lock.lockedAt > 30 * 60 * 1000) {
      tableLocks.delete(tableId);
    }
  }
}, 60 * 1000);

/* ================= IN-MEMORY LOCKS ================= */
router.post("/lock", (req, res) => {
  const { tableId, userId } = req.body;
  if (!tableId || !userId) return res.status(400).json({ error: "Missing parameters" });

  const existingLock = tableLocks.get(tableId);
  if (existingLock && existingLock.lockedBy !== userId) {
    return res.status(409).json({
      success: false,
      message: "Table is heavily occupied by another user.",
      lockedBy: existingLock.lockedBy,
    });
  }

  tableLocks.set(tableId, { lockedBy: userId, lockedAt: Date.now() });
  res.json({ success: true });
});

router.post("/unlock", (req, res) => {
  const { tableId, userId } = req.body;
  const existingLock = tableLocks.get(tableId);
  if (existingLock && existingLock.lockedBy === userId) {
    tableLocks.delete(tableId);
  }
  res.json({ success: true });
});

router.get("/locks", (req, res) => {
  const locks = {};
  for (const [key, value] of tableLocks.entries()) {
    locks[key] = value.lockedBy;
  }
  res.json(locks);
});

/* ================= PERSISTENT TABLES ================= */
router.get("/all", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { section } = req.query;

    const SECTION_MAP = {
      SECTION_1: "1",
      SECTION_2: "2",
      SECTION_3: "3",
      TAKEAWAY: "4",
    };

    let query = `
      SELECT TableId AS id, CAST(TableNumber AS VARCHAR(50)) AS label,
      CAST(DiningSection AS VARCHAR(10)) AS DiningSection, LockedByName as lockedByName,
      Status, StartTime, ISNULL(TotalAmount, 0) as totalAmount, CurrentOrderId as currentOrderId,
      CASE 
        WHEN Status = 1 AND StartTime IS NOT NULL AND DATEDIFF(MINUTE, StartTime, GETDATE()) >= 60 THEN 1 
        ELSE 0 
      END AS isOvertime
      FROM TableMaster
    `;

    const request = pool.request();
    if (section && SECTION_MAP[section] !== undefined) {
      request.input("DiningSection", SECTION_MAP[section]);
      query += ` WHERE CAST(DiningSection AS VARCHAR(10)) = @DiningSection`;
    }
    query += ` ORDER BY SortCode`;

    const result = await request.query(query);
    res.json(result.recordset || []);
  } catch (err) {
    console.error("TABLES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/locked", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TableId as tableId, TableNumber as tableNumber, DiningSection, LockedByName as lockedByName, Status as status
      FROM TableMaster WHERE Status = 5
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/lock-persistent", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { tableId, lockedByName } = req.body;
    if (!tableId) return res.status(400).json({ error: "tableId is required" });

    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();
    const request = pool.request(); // ✅ Fixed: request was not defined
    request.input("tableId", sql.VarChar(50), cleanTableId);
    request.input("lockedByName", sql.NVarChar, lockedByName || null);

    await request.query(`
      UPDATE TableMaster 
      SET Status = 5, LockedByName = @lockedByName, TotalAmount = 0, StartTime = NULL 
      WHERE CAST(TableId AS NVARCHAR(128)) = @tableId
    `);

    // ✅ Clear CartItems for this table when locked
    await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @tableId");

    // 🔥 Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("table_status_updated", { tableId: cleanTableId, status: 5, totalAmount: 0 });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/unlock-persistent", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { tableId } = req.body;
    if (!tableId) return res.status(400).json({ error: "tableId is required" });

    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();
    await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .query(`
        UPDATE TableMaster 
        SET Status = 0, LockedByName = NULL, TotalAmount = 0, StartTime = NULL 
        WHERE CAST(TableId AS NVARCHAR(128)) = @tableId
      `);

    // ✅ Clear any items in CartItems for this table when unlocked
    await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @tableId");

    // 🔥 Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("table_status_updated", { tableId: cleanTableId, status: 0, totalAmount: 0 });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ New route to match user's snippet: PUT /api/tables/status
router.put("/status", async (req, res) => {
  const { tableId, status } = req.body;

  try {
    const pool = await poolPromise;
    if (!tableId) return res.status(400).json({ error: "tableId is required" });
    if (status === undefined) return res.status(400).json({ error: "status is required" });

    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();
    const request = pool.request();
    request.input("tableId", sql.VarChar(50), cleanTableId);
    request.input("status", sql.Int, Number(status));

    await request.query(`
      UPDATE TableMaster 
      SET Status = @status,
          StartTime = CASE 
            WHEN (@status = 1 OR @status = 3) AND StartTime IS NULL THEN GETDATE() 
            WHEN @status = 0 OR @status = 5 THEN NULL 
            ELSE StartTime 
          END,
          TotalAmount = CASE 
            WHEN @status = 0 OR @status = 5 THEN 0 
            ELSE TotalAmount 
          END,
          ModifiedOn = GETDATE()
      WHERE CAST(TableId AS NVARCHAR(128)) = @tableId
    `);

    // ✅ Clear CartItems if status is 0 (Available) or 5 (Locked)
    if (Number(status) === 0 || Number(status) === 5) {
      await pool.request()
        .input("tableId", sql.VarChar(50), cleanTableId)
        .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @tableId");
    }

    // ✅ Get current total to include in socket
    const tableRes = await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .query("SELECT TotalAmount FROM TableMaster WHERE CAST(TableId AS NVARCHAR(128)) = @tableId");
    
    const currentTotal = tableRes.recordset[0]?.TotalAmount || 0;

    // 🔥 Emit socket event with TotalAmount
    const io = req.app.get("io");
    if (io) {
      io.emit("table_status_updated", { 
        tableId: cleanTableId, 
        status: Number(status),
        totalAmount: currentTotal
      });
    }

    res.json({ success: true, totalAmount: currentTotal });
  } catch (err) {
    console.error("UPDATE STATUS ERROR:", err);
    res.status(500).json({ error: "Error updating" });
  }
});

router.put("/:tableId/status", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { tableId } = req.params;
    const { status, lockedByName } = req.body;

    if (status === undefined) return res.status(400).json({ error: "status is required" });

    const request = pool.request();
    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();
    request.input("tableId", sql.VarChar(50), cleanTableId);
    request.input("status", sql.Int, Number(status));
    request.input("lockedByName", sql.NVarChar, lockedByName || null);

    await request.query(`
      UPDATE TableMaster 
      SET Status = @status, 
          LockedByName = CASE WHEN @status = 5 THEN @lockedByName ELSE NULL END,
          StartTime = CASE 
            -- Status 1 (Dining) or 3 (Hold) starts the timer
            WHEN (@status = 1 OR @status = 3) AND StartTime IS NULL THEN GETDATE() 
            -- Status 0 (Available) or 5 (Locked) resets the timer
            WHEN @status = 0 OR @status = 5 THEN NULL 
            ELSE StartTime 
          END,
          TotalAmount = CASE 
            WHEN @status = 0 OR @status = 5 THEN 0 
            ELSE TotalAmount 
          END
      WHERE CAST(TableId AS NVARCHAR(128)) = @tableId
    `);

    // ✅ If status is 0 or 5, clear any lingering items in CartItems for this table
    if (Number(status) === 0 || Number(status) === 5) {
      await pool.request()
        .input("tableId", sql.VarChar(50), cleanTableId)
        .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @tableId");
    }

    // 🔥 Emit socket event for real-time sync across devices
    const io = req.app.get("io");
    // ✅ Get current total to include in socket
    const tableRes = await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .query("SELECT TotalAmount FROM TableMaster WHERE CAST(TableId AS NVARCHAR(128)) = @tableId");
    
    const currentTotal = tableRes.recordset[0]?.TotalAmount || 0;

    if (io) {
      io.emit("table_status_updated", { 
        tableId: cleanTableId, 
        status: Number(status),
        totalAmount: currentTotal
      });
    }

    res.json({ success: true, status: Number(status) });
  } catch (err) {
    console.error("UPDATE STATUS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET Single Table by ID
router.get("/:tableId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { tableId } = req.params;
    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();

    const result = await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .query(`
        SELECT 
          TableId AS id, 
          TableNumber AS label,
          DiningSection, 
          Status, 
          StartTime, 
          ISNULL(TotalAmount, 0) as totalAmount, 
          CurrentOrderId as currentOrderId,
          LockedByName as lockedByName
        FROM TableMaster
        WHERE CAST(TableId AS NVARCHAR(128)) = @tableId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: "Table not found" });
    }

    res.json({ success: true, table: result.recordset[0] });
  } catch (err) {
    console.error("GET TABLE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/diagnostic", async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT TOP 10 TableId, TableNumber, DiningSection, Status,
        CAST(TableId AS VARCHAR(50)) AS TableId_AsString
        FROM TableMaster
      `);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

module.exports = router;
