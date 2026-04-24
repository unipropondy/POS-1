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
      Status, StartTime
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
      SELECT TableId as tableId, TableNumber as tableNumber, DiningSection, LockedByName as lockedByName
      FROM TableMaster WHERE Status = 4
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
      UPDATE TableMaster SET Status = 4, LockedByName = @lockedByName 
      WHERE UPPER(CAST(TableId AS VARCHAR(50))) = UPPER(@tableId)
    `);

    // 🔥 Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("table_status_updated", { tableId: cleanTableId, status: 4 });
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
        UPDATE TableMaster SET Status = 0, LockedByName = NULL 
        WHERE UPPER(CAST(TableId AS VARCHAR(50))) = UPPER(@tableId)
      `);

    // 🔥 Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("table_status_updated", { tableId: cleanTableId, status: 0 });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
          LockedByName = CASE WHEN @status = 4 THEN @lockedByName ELSE NULL END,
          StartTime = CASE 
            -- Status 1 (Dining) or 3 (Hold) starts the timer
            WHEN (@status = 1 OR @status = 3) AND StartTime IS NULL THEN GETDATE() 
            -- Status 0 (Available) resets the timer
            WHEN @status = 0 THEN NULL 
            ELSE StartTime 
          END
      WHERE UPPER(CAST(TableId AS VARCHAR(50))) = UPPER(@tableId)
    `);

    // 🔥 Emit socket event for real-time sync across devices
    const io = req.app.get("io");
    if (io) {
      io.emit("table_status_updated", { tableId: cleanTableId, status: Number(status) });
    }

    res.json({ success: true, status: Number(status) });
  } catch (err) {
    console.error("UPDATE STATUS ERROR:", err);
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
