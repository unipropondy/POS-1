const express = require("express");
const router = express.Router();
const { poolPromise, sql } = require("../config/db");

// 🔹 GET
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT s.*, u.FullName AS CreatorName 
      FROM server s
      LEFT JOIN [dbo].[UserMaster] u ON s.CreatedBy = u.UserId
      ORDER BY s.CreatedDate DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("GET SERVERS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 POST (ADD)
router.post("/add", async (req, res) => {
  try {
    const { SER_NAME, userId } = req.body;
    console.log("➕ Adding server:", { SER_NAME, userId });

    if (!userId) {
      console.warn("⚠️ UserId missing in add waiter request");
      return res.status(400).json({ error: "UserId missing" });
    }

    const pool = await poolPromise;

    await pool.request()
      .input("SER_NAME", sql.NVarChar, SER_NAME)
      .input("CreatedBy", userId) // Let mssql infer uniqueidentifier from string
      .query(`
        INSERT INTO server (SER_NAME, CreatedBy, CreatedDate)
        VALUES (@SER_NAME, @CreatedBy, GETDATE())
      `);

    res.json({ success: true, message: "Created successfully" });
  } catch (err) {
    console.error("ADD SERVER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 UPDATE
router.post("/update", async (req, res) => {
  try {
    const { SER_ID, SER_NAME, userId } = req.body;
    console.log("📝 Updating server:", { SER_ID, SER_NAME, userId });

    const pool = await poolPromise;

    await pool.request()
      .input("SER_ID", sql.Int, SER_ID)
      .input("SER_NAME", sql.NVarChar, SER_NAME)
      .input("ModifiedBy", userId) // Let mssql infer uniqueidentifier
      .query(`
        UPDATE server
        SET 
          SER_NAME = @SER_NAME,
          ModifiedBy = @ModifiedBy,
          ModifiedDate = GETDATE()
        WHERE SER_ID = @SER_ID
      `);

    res.json({ success: true, message: "Updated successfully" });
  } catch (err) {
    console.error("UPDATE SERVER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 DELETE
router.post("/delete", async (req, res) => {
  try {
    const { SER_ID } = req.body;
    const pool = await poolPromise;

    await pool.request()
      .input("SER_ID", sql.Int, SER_ID)
      .query(`DELETE FROM server WHERE SER_ID = @SER_ID`);

    res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;