const express = require("express");
const router = express.Router();
const { poolPromise } = require("../config/db");

router.get("/cancel-reasons", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT CRCode, CRName, SortCode FROM [dbo].[CancelRemarksmaster] ORDER BY SortCode ASC");
    res.json(result.recordset || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/discounts", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT CAST(DiscountId AS NVARCHAR(50)) AS DiscountId, DiscountCode, Description, DiscountPercentage, isGuestMeal, DiscountAmount FROM [dbo].[Discount] WHERE isActive = 1 ORDER BY DiscountPercentage DESC");
    res.json(result.recordset || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/orders/cancel", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { settlementId, cancellationReason, cancelledBy } = req.body;
    await pool.request().input("id", settlementId).input("reason", cancellationReason).input("by", cancelledBy).query("UPDATE SettlementHeader SET IsCancelled = 1, CancellationReason = @reason, CancelledBy = @by, CancelledDate = GETDATE() WHERE SettlementID = @id");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
