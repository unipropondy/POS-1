const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");

// Helper to generate a random 8-character hex ID (e.g. A996E780)
const generateRandomBillId = () => {
    return Math.random().toString(16).slice(2, 10).toUpperCase();
};

/* ================= SALES LIST & SUMMARY ================= */
router.get("/all", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT sh.SettlementID, sh.LastSettlementDate AS SettlementDate, sh.OrderId, sh.OrderType,
      sh.TableNo, sh.Section, sh.CashierId, sh.BillNo, ISNULL(sts.PayMode, 'CASH') as PayMode,
      ISNULL(sts.SysAmount, 0) as SysAmount, ISNULL(sts.ManualAmount, 0) as ManualAmount,
      ISNULL(sts.ReceiptCount, 0) as ReceiptCount
      FROM SettlementHeader sh
      LEFT JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
      ORDER BY sh.LastSettlementDate DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/transactions", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { startDate, endDate } = req.query;
    const result = await pool.request()
      .input("Start", sql.DateTime, startDate || new Date(new Date().setDate(new Date().getDate() - 30)))
      .input("End", sql.DateTime, endDate || new Date())
      .query(`
        SELECT sh.SettlementID, sh.LastSettlementDate, sh.BillNo, sh.TotalAmount, sts.PayMode
        FROM SettlementHeader sh
        LEFT JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
        WHERE sh.LastSettlementDate BETWEEN @Start AND @End
        ORDER BY sh.LastSettlementDate DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/range", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { startDate, endDate } = req.query;
    const result = await pool.request()
      .input("Start", sql.DateTime, startDate)
      .input("End", sql.DateTime, endDate)
      .query(`
        SELECT ISNULL(SUM(sts.SysAmount), 0) AS TotalSales, 
        COUNT(sh.SettlementID) AS TransactionCount
        FROM SettlementHeader sh
        INNER JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
        WHERE sh.LastSettlementDate BETWEEN @Start AND @End
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/detail/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("Id", sql.UniqueIdentifier, req.params.id)
      .query("SELECT * FROM SettlementItemDetail WHERE SettlementID = @Id");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/daily/:date", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { date } = req.params;
    const startOfDay = `${date} 00:00:00`;
    const endOfDay = `${date} 23:59:59`;

    const result = await pool.request()
      .input("StartOfDay", sql.DateTime, startOfDay)
      .input("EndOfDay", sql.DateTime, endOfDay).query(`
        SELECT COUNT(DISTINCT sh.SettlementID) as TotalTransactions, ISNULL(SUM(sts.SysAmount), 0) as TotalSales,
        ISNULL(SUM(CASE WHEN sts.PayMode = 'CASH' THEN sts.SysAmount ELSE 0 END), 0) as CashSales,
        ISNULL(SUM(CASE WHEN sts.PayMode = 'NETS' THEN sts.SysAmount ELSE 0 END), 0) as NETS_Sales,
        ISNULL(SUM(CASE WHEN sts.PayMode = 'PAYNOW' THEN sts.SysAmount ELSE 0 END), 0) as PayNow_Sales,
        ISNULL(SUM(CASE WHEN sts.PayMode = 'CARD' THEN sts.SysAmount ELSE 0 END), 0) as CardSales,
        ISNULL(SUM(CASE WHEN sts.PayMode = 'CREDIT' THEN sts.SysAmount ELSE 0 END), 0) as MemberSales,
        ISNULL(SUM(sts.ReceiptCount), 0) as TotalItems
        FROM SettlementHeader sh
        INNER JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
        WHERE sh.LastSettlementDate BETWEEN @StartOfDay AND @EndOfDay
      `);
    res.json(result.recordset[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/daily-order-count", async (req, res) => {
  try {
    const pool = await poolPromise;
    // Get start and end of today
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const result = await pool.request()
      .input("Start", sql.DateTime, startOfDay)
      .input("End", sql.DateTime, endOfDay)
      .query(`
        SELECT COUNT(SettlementID) as currentCount 
        FROM SettlementHeader 
        WHERE LastSettlementDate BETWEEN @Start AND @End
      `);
    
    // Return the next number in the sequence
    const count = result.recordset[0].currentCount || 0;
    res.json({ nextNumber: count + 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= SAVE SALE ================= */
router.post("/save", async (req, res) => {
  try {
    const pool = await poolPromise;
    const {
      totalAmount, paymentMethod, items, subTotal, taxAmount,
      discountAmount, discountType, orderId, orderType, tableNo, section, memberId, cashierId
    } = req.body;

    if (!orderId || !/^\d{8}-\d{4}$/.test(orderId)) {
      return res.status(400).json({ error: "Invalid Order ID format. Expected: YYYYMMDD-NNNN" });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const settlementIdResult = await transaction.request().query(`SELECT NEWID() AS id`);
      const settlementId = settlementIdResult.recordset[0].id;
      const billNo = generateRandomBillId();

      // 1. Insert into SettlementHeader
      await transaction.request()
        .input("SettlementID", settlementId)
        .input("LastSettlementDate", new Date())
        .input("SubTotal", subTotal || 0)
        .input("TotalTax", taxAmount || 0)
        .input("DiscountAmount", discountAmount || 0)
        .input("DiscountType", discountType || "fixed")
        .input("BillNo", billNo)
        .input("OrderId", orderId || null)
        .input("OrderType", orderType || "DINE-IN")
        .input("TableNo", tableNo || null)
        .input("Section", section || null)
        .input("MemberId", memberId || null).query(`
          INSERT INTO SettlementHeader (SettlementID, LastSettlementDate, SubTotal, TotalTax, DiscountAmount, DiscountType, BillNo, OrderId, OrderType, TableNo, Section, MemberId)
          VALUES (@SettlementID, @LastSettlementDate, @SubTotal, @TotalTax, @DiscountAmount, @DiscountType, @BillNo, @OrderId, @OrderType, @TableNo, @Section, @MemberId)
        `);

      // 2. Insert into SettlementTotalSales
      await transaction.request()
        .input("SettlementID", settlementId)
        .input("PayMode", (paymentMethod || "CASH").toUpperCase())
        .input("SysAmount", totalAmount || 0)
        .input("ManualAmount", totalAmount || 0)
        .input("AmountDiff", 0)
        .input("ReceiptCount", items ? items.length : 0).query(`
          INSERT INTO SettlementTotalSales (SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff, ReceiptCount)
          VALUES (@SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff, @ReceiptCount)
        `);

      // 3. Insert individual dishes
      if (items && Array.isArray(items)) {
        for (const item of items) {
          await transaction.request()
            .input("SettlementID", settlementId)
            .input("DishName", item.dish_name || item.name || "Unknown")
            .input("Qty", item.qty || 1)
            .input("Price", item.price || 0).query(`
              INSERT INTO SettlementItemDetail (SettlementID, DishName, Qty, Price)
              VALUES (@SettlementID, @DishName, @Qty, @Price)
            `);
        }
      }

      // 4. Insert into PaymentDetailCur (Legacy DB Support)
      try {
        const paymodeRow = await transaction.request()
          .input("PayModeCode", sql.VarChar(50), (paymentMethod || "CAS").trim())
          .query(`SELECT TOP 1 ISNULL(Position, 1) AS Position FROM [dbo].[Paymode] WHERE LTRIM(RTRIM(PayMode)) = @PayModeCode`);
        
        const paymodePosition = paymodeRow.recordset.length > 0 ? paymodeRow.recordset[0].Position : 1;

        const bizRow = await transaction.request().query(`SELECT TOP 1 ISNULL(CAST(BusinessUnitId AS VARCHAR(50)), '1') AS BusinessUnitId FROM [dbo].[PaymentDetailCur]`);
        const businessUnitId = bizRow.recordset.length > 0 ? bizRow.recordset[0].BusinessUnitId : "1";

        await transaction.request()
          .input("PaymentId", settlementId)
          .input("RestaurantBillId", settlementId)
          .input("BilledFor", 1)
          .input("PaymentCollectedOn", new Date())
          .input("PaymentType", 1)
          .input("Paymode", paymodePosition)
          .input("Amount", totalAmount || 0)
          .input("ReferenceNumber", "")
          .input("Remarks", paymentMethod || "")
          .input("BusinessUnitId", businessUnitId)
          .query(`
            INSERT INTO [dbo].[PaymentDetailCur] (PaymentId, RestaurantBillId, BilledFor, PaymentCollectedOn, PaymentType, Paymode, Amount, ReferenceNumber, Remarks, BusinessUnitId)
            VALUES (@PaymentId, @RestaurantBillId, @BilledFor, @PaymentCollectedOn, @PaymentType, @Paymode, @Amount, @ReferenceNumber, @Remarks, @BusinessUnitId)
          `);
      } catch (pdcErr) {
        console.warn("⚠️ [SAVE SALE] PaymentDetailCur insert skipped:", pdcErr.message);
      }

      // 5. Update Member Balance if Credit
      if (memberId && (paymentMethod || "").toUpperCase() === "CREDIT") {
        await transaction.request()
          .input("MemberId", memberId)
          .input("Amount", totalAmount || 0)
          .query(`UPDATE MemberMaster SET CurrentBalance = CurrentBalance + @Amount WHERE MemberId = @MemberId`);
      }

      await transaction.commit();
      res.json({ success: true, settlementId, billNo });
    } catch (err) {
      if (transaction) await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error("SAVE SALE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= VALIDATION ================= */
router.get("/orders/check/:orderId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("OrderId", req.params.orderId)
      .query("SELECT SettlementID FROM SettlementHeader WHERE OrderId = @OrderId AND IsCancelled = 0");
    res.json({ exists: result.recordset.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/orders/validate-cancel", async (req, res) => {
    try {
      const { settlementId } = req.body;
      const pool = await poolPromise;
      const result = await pool.request()
        .input("Id", settlementId)
        .query("SELECT IsCancelled FROM SettlementHeader WHERE SettlementID = @Id");
      
      if (result.recordset.length === 0) return res.status(404).json({ valid: false, message: "Order not found" });
      if (result.recordset[0].IsCancelled) return res.status(400).json({ valid: false, message: "Order is already cancelled" });
      
      res.json({ valid: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

/* ... other payment endpoints (history, methods) ... */
router.get("/payment-history", async (req, res) => {
    try {
      const pool = await poolPromise;
      const limit = parseInt(req.query.limit) || 50;
      const result = await pool.request().input("Limit", sql.Int, limit).query(`
        SELECT TOP (@Limit) CAST(pdc.PaymentId AS VARCHAR(50)) as paymentId,
        CONVERT(VARCHAR(23), pdc.PaymentCollectedOn, 126) as paymentCollectedOn,
        ISNULL(pdc.Amount, 0) as amount, ISNULL(pm.Description, '') as payModeDescription
        FROM [dbo].[PaymentDetailCur] pdc
        LEFT JOIN [dbo].[Paymode] pm ON pm.Position = pdc.Paymode
        ORDER BY pdc.PaymentCollectedOn DESC
      `);
      res.json(result.recordset || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

router.get("/payment-methods", async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT PayMode as payMode, Description as description, Position FROM [dbo].[Paymode] WHERE Active = 1 ORDER BY Position ASC
      `);
      res.json(result.recordset || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

router.get("/payment-detail/:payMode", async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input("PayMode", req.params.payMode)
        .query("SELECT * FROM [dbo].[Paymode] WHERE LTRIM(RTRIM(PayMode)) = @PayMode AND Active = 1");
      res.json(result.recordset[0] || null);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

module.exports = router;
