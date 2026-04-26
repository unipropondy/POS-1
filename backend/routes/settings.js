const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");

// 🔹 GET Settings
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT TOP 1 * FROM AppSettings");
    res.json(result.recordset[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 UPDATE Settings
router.post("/update", async (req, res) => {
  try {
    const { upiId, shopName, qrCodeUrl } = req.body;
    const pool = await poolPromise;

    // Use an UPSERT logic (Update if exists, Insert if not)
    await pool.request()
      .input("UPI", sql.NVarChar, upiId || null)
      .input("Shop", sql.NVarChar, shopName || "My Restaurant")
      .input("QR", sql.NVarChar, qrCodeUrl || null)
      .query(`
        IF EXISTS (SELECT 1 FROM AppSettings)
        BEGIN
          UPDATE AppSettings
          SET 
            UPI_ID = @UPI,
            ShopName = @Shop,
            PayNow_QR_Url = CASE WHEN @QR IS NOT NULL THEN @QR ELSE PayNow_QR_Url END,
            UpdatedOn = GETDATE()
        END
        ELSE
        BEGIN
          INSERT INTO AppSettings (UPI_ID, ShopName, PayNow_QR_Url, UpdatedOn)
          VALUES (@UPI, @Shop, @QR, GETDATE())
        END
      `);

    res.json({ success: true, message: "Settings updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
