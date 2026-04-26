const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");

const USER_ID = "11111111-1111-1111-1111-111111111111";

// 🔹 GET
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT * FROM server ORDER BY SER_ID DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 POST
router.post("/add", async (req, res) => {
  try {
    const { SER_NAME } = req.body;
    const pool = await poolPromise;

    await pool.request()
      .input("SER_NAME", sql.VarChar, SER_NAME)
      .input("CreatedBy", sql.UniqueIdentifier, USER_ID)
      .query(`
        INSERT INTO server (SER_NAME, CreatedBy, CreatedDate)
        VALUES (@SER_NAME, @CreatedBy, GETDATE())
      `);

    res.json({ success: true, message: "Created successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 POST (Update)
router.post("/update", async (req, res) => {
  try {
    const { SER_ID, SER_NAME } = req.body;
    const pool = await poolPromise;

    await pool.request()
      .input("SER_ID", sql.Int, SER_ID)
      .input("SER_NAME", sql.VarChar, SER_NAME)
      .input("ModifiedBy", sql.UniqueIdentifier, USER_ID)
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
    res.status(500).json({ error: err.message });
  }
});

// 🔹 POST (Delete)
router.post("/delete", async (req, res) => {
  try {
    const { SER_ID } = req.body;
    const pool = await poolPromise;

    await pool.request()
      .input("SER_ID", sql.Int, SER_ID)
      .query(`
        DELETE FROM server WHERE SER_ID = @SER_ID
      `);

    res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
