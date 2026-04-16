const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");

// Helper to generate a random 8-character hex ID (e.g. A996E780)
const generateRandomBillId = () => {
    return Math.random().toString(16).slice(2, 10).toUpperCase();
};

const normalizeReportPayModeSql = (columnName = "sts.PayMode") => `
  CASE
    WHEN UPPER(LTRIM(RTRIM(ISNULL(${columnName}, 'CASH')))) IN ('CAS', 'CASH') THEN 'CASH'
    WHEN UPPER(LTRIM(RTRIM(ISNULL(${columnName}, '')))) IN ('CARD', 'VISA', 'MASTER', 'MASTERCARD', 'AMEX', 'DINERS') THEN 'CARD'
    WHEN UPPER(LTRIM(RTRIM(ISNULL(${columnName}, '')))) IN ('PAYNOW', 'GRAB', 'FOODPANDA') THEN 'PAYNOW'
    WHEN UPPER(LTRIM(RTRIM(ISNULL(${columnName}, '')))) = 'NETS' THEN 'NETS'
    ELSE UPPER(LTRIM(RTRIM(ISNULL(${columnName}, 'CASH'))))
  END
`;

const getReportDateRange = (req) => {
  const { startDate, endDate } = req.query;
  const start = startDate ? new Date(`${startDate} 00:00:00`) : new Date(new Date().setHours(0, 0, 0, 0));
  const end = endDate ? new Date(`${endDate} 23:59:59`) : new Date(new Date().setHours(23, 59, 59, 999));
  return { start, end };
};

const getReportDateWhereSql = (filter = "daily", saleDateColumn = "sh.LastSettlementDate") => {
  switch (String(filter).toLowerCase()) {
    case "weekly":
      return `${saleDateColumn} >= DATEADD(DAY, -7, GETDATE())`;
    case "monthly":
      return `MONTH(${saleDateColumn}) = MONTH(GETDATE()) AND YEAR(${saleDateColumn}) = YEAR(GETDATE())`;
    case "yearly":
      return `YEAR(${saleDateColumn}) = YEAR(GETDATE())`;
    case "daily":
    default:
      return `CAST(${saleDateColumn} AS DATE) = CAST(GETDATE() AS DATE)`;
  }
};

const normalizeReportFilter = (filter = "daily") => {
  const normalized = String(filter || "daily").toLowerCase();
  return ["daily", "weekly", "monthly", "yearly"].includes(normalized) ? normalized : "daily";
};

const parseCsv = (value) => String(value || "")
  .split(",")
  .map((v) => v.trim().toUpperCase())
  .filter(Boolean);

const normalizePayMode = (paymentMethod = "CASH") => {
  const raw = String(paymentMethod || "CASH").toUpperCase().trim();
  if (["CAS", "CASH"].includes(raw)) return "CASH";
  if (["CARD", "VISA", "MASTER", "MASTERCARD", "AMEX", "DINERS"].includes(raw)) return "CARD";
  if (["PAYNOW", "GRAB", "FOODPANDA"].includes(raw)) return "PAYNOW";
  return raw;
};

const toGuidOrNull = (value) => {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
};

const validateSalePayload = ({ totalAmount, paymentMethod, items }) => {
  if (!paymentMethod || !String(paymentMethod).trim()) {
    return "Payment mode is required";
  }

  const numericTotal = Number(totalAmount);
  if (!Number.isFinite(numericTotal) || numericTotal <= 0) {
    return "Total amount must be greater than zero";
  }

  if (!Array.isArray(items) || items.length === 0) {
    return "At least one sale item is required";
  }

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] || {};
    const dishId = item.dishId || item.id;
    const dishName = item.dish_name || item.name;
    const qty = Number(item.qty);
    const price = Number(item.price);

    if (!dishId && !dishName) return `Item ${i + 1} is missing dish information`;
    if (!Number.isFinite(qty) || qty <= 0) return `Item ${i + 1} has invalid quantity`;
    if (!Number.isFinite(price) || price < 0) return `Item ${i + 1} has invalid price`;
  }

  return null;
};

/* ================= SALES LIST & SUMMARY ================= */
router.get("/all", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT sh.SettlementID, sh.LastSettlementDate AS SettlementDate, 
      CONVERT(VARCHAR(8), sh.LastSettlementDate, 112) + '-' + RIGHT('0000' + CAST(sh.OrderId AS VARCHAR(10)), 4) AS OrderId, 
      sh.OrderType,
      sh.TableNo, sh.Section, sh.CashierId, sh.BillNo, 
      ${normalizeReportPayModeSql("sts.PayMode")} as PayMode,
      ISNULL(NULLIF(sts.SysAmount, 0), ISNULL(sh.SysAmount, 0)) as SysAmount,
      ISNULL(NULLIF(sts.ManualAmount, 0), ISNULL(sh.ManualAmount, 0)) as ManualAmount,
      ISNULL(sts.ReceiptCount, 0) as ReceiptCount
      FROM SettlementHeader sh
      LEFT JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
      WHERE ISNULL(sh.IsCancelled, 0) = 0
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
        SELECT sh.SettlementID, sh.LastSettlementDate, sh.BillNo, sh.SysAmount AS TotalAmount, sts.PayMode,
        CONVERT(VARCHAR(8), sh.LastSettlementDate, 112) + '-' + RIGHT('0000' + CAST(sh.OrderId AS VARCHAR(10)), 4) AS OrderId
        FROM SettlementHeader sh
        LEFT JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
        WHERE sh.LastSettlementDate BETWEEN @Start AND @End
        AND ISNULL(sh.IsCancelled, 0) = 0
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
        AND ISNULL(sh.IsCancelled, 0) = 0
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

router.get("/category-report", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { start, end } = getReportDateRange(req);
    const payModes = parseCsv(req.query.paymentModes);
    const orderTypes = parseCsv(req.query.orderTypes);
    const applyPayModeFilter = payModes.length > 0 && payModes.length < 4;
    const applyOrderTypeFilter = orderTypes.length > 0 && orderTypes.length < 2;

    const result = await pool.request()
      .input("Start", sql.DateTime, start)
      .input("End", sql.DateTime, end)
      .input("ApplyPayModeFilter", sql.Bit, applyPayModeFilter)
      .input("ApplyOrderTypeFilter", sql.Bit, applyOrderTypeFilter)
      .input("PaymentModes", sql.VarChar(200), payModes.join(","))
      .input("OrderTypes", sql.VarChar(200), orderTypes.join(","))
      .query(`
        WITH AppItemRows AS (
          SELECT
            ISNULL(cm.CategoryName, 'Unmapped') AS CategoryName,
            COALESCE(sid.CategoryId, dg.CategoryId) AS CategoryId,
            CAST(ISNULL(sid.Qty, 0) AS decimal(18, 3)) AS Sold,
            CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS decimal(18, 2)) AS SalesAmount,
            ${normalizeReportPayModeSql("sts.PayMode")} AS PayMode,
            UPPER(LTRIM(RTRIM(ISNULL(sh.OrderType, 'DINE-IN')))) AS OrderType
          FROM SettlementItemDetail sid
          INNER JOIN SettlementHeader sh ON sid.SettlementID = sh.SettlementID
          LEFT JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
          LEFT JOIN DishMaster dm ON (sid.DishId IS NOT NULL AND sid.DishId = dm.DishId)
             OR (sid.DishId IS NULL AND LTRIM(RTRIM(LOWER(sid.DishName))) = LTRIM(RTRIM(LOWER(dm.Name))))
          LEFT JOIN DishGroupMaster dg ON COALESCE(sid.DishGroupId, dm.DishGroupId) = dg.DishGroupId
          LEFT JOIN CategoryMaster cm ON COALESCE(sid.CategoryId, dg.CategoryId) = cm.CategoryId
          WHERE sh.LastSettlementDate BETWEEN @Start AND @End
            AND ISNULL(sh.IsCancelled, 0) = 0
        ),
        AppReport AS (
          SELECT CategoryName, CategoryId, SUM(Sold) AS Sold, SUM(SalesAmount) AS SalesAmount
          FROM AppItemRows
          WHERE (@ApplyPayModeFilter = 0 OR CHARINDEX(',' + PayMode + ',', ',' + @PaymentModes + ',') > 0)
            AND (@ApplyOrderTypeFilter = 0 OR CHARINDEX(',' + OrderType + ',', ',' + @OrderTypes + ',') > 0)
          GROUP BY CategoryName, CategoryId
        ),
        LegacyReport AS (
          SELECT
            MAX(categoryname) AS CategoryName,
            CategoryId,
            SUM(ISNULL(Sold, 0)) AS Sold,
            SUM(ISNULL(Revenue, ItemSales)) AS SalesAmount
          FROM vw_categorysalesreport
          WHERE InvoiceDate BETWEEN @Start AND @End
          GROUP BY CategoryId
        )
        SELECT CategoryName, CategoryId, SUM(Sold) AS Sold, SUM(SalesAmount) AS SalesAmount
        FROM (
          SELECT * FROM LegacyReport
          UNION ALL
          SELECT * FROM AppReport
        ) ReportRows
        GROUP BY CategoryName, CategoryId
        ORDER BY SalesAmount DESC, Sold DESC, CategoryName ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/dish-report", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { start, end } = getReportDateRange(req);
    const payModes = parseCsv(req.query.paymentModes);
    const orderTypes = parseCsv(req.query.orderTypes);
    const applyPayModeFilter = payModes.length > 0 && payModes.length < 4;
    const applyOrderTypeFilter = orderTypes.length > 0 && orderTypes.length < 2;

    const result = await pool.request()
      .input("Start", sql.DateTime, start)
      .input("End", sql.DateTime, end)
      .input("ApplyPayModeFilter", sql.Bit, applyPayModeFilter)
      .input("ApplyOrderTypeFilter", sql.Bit, applyOrderTypeFilter)
      .input("PaymentModes", sql.VarChar(200), payModes.join(","))
      .input("OrderTypes", sql.VarChar(200), orderTypes.join(","))
      .query(`
        WITH AppItemRows AS (
          SELECT
            ISNULL(dm.Name, sid.DishName) AS DishName,
            dm.DishId,
            ISNULL(cm.CategoryName, 'Unmapped') AS CategoryName,
            COALESCE(sid.CategoryId, dg.CategoryId) AS CategoryId,
            CAST(ISNULL(sid.Qty, 0) AS decimal(18, 3)) AS Sold,
            CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS decimal(18, 2)) AS SalesAmount,
            ${normalizeReportPayModeSql("sts.PayMode")} AS PayMode,
            UPPER(LTRIM(RTRIM(ISNULL(sh.OrderType, 'DINE-IN')))) AS OrderType
          FROM SettlementItemDetail sid
          INNER JOIN SettlementHeader sh ON sid.SettlementID = sh.SettlementID
          LEFT JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
          LEFT JOIN DishMaster dm ON (sid.DishId IS NOT NULL AND sid.DishId = dm.DishId)
             OR (sid.DishId IS NULL AND LTRIM(RTRIM(LOWER(sid.DishName))) = LTRIM(RTRIM(LOWER(dm.Name))))
          LEFT JOIN DishGroupMaster dg ON COALESCE(sid.DishGroupId, dm.DishGroupId) = dg.DishGroupId
          LEFT JOIN CategoryMaster cm ON COALESCE(sid.CategoryId, dg.CategoryId) = cm.CategoryId
          WHERE sh.LastSettlementDate BETWEEN @Start AND @End
            AND ISNULL(sh.IsCancelled, 0) = 0
        ),
        AppReport AS (
          SELECT DishName, DishId, CategoryName, CategoryId, SUM(Sold) AS Sold, SUM(SalesAmount) AS SalesAmount
          FROM AppItemRows
          WHERE (@ApplyPayModeFilter = 0 OR CHARINDEX(',' + PayMode + ',', ',' + @PaymentModes + ',') > 0)
            AND (@ApplyOrderTypeFilter = 0 OR CHARINDEX(',' + OrderType + ',', ',' + @OrderTypes + ',') > 0)
          GROUP BY DishName, DishId, CategoryName, CategoryId
        ),
        LegacyReport AS (
          SELECT
            MAX(Dishname) AS DishName,
            DishId,
            MAX(CategoryName) AS CategoryName,
            CategoryId,
            SUM(ISNULL(Sold, 0)) AS Sold,
            SUM(ISNULL(Revenue, ItemSales)) AS SalesAmount
          FROM vw_Dishsalesreport
          WHERE InvoiceDate BETWEEN @Start AND @End
          GROUP BY DishId, CategoryId
        )
        SELECT DishName, DishId, CategoryName, CategoryId, SUM(Sold) AS Sold, SUM(SalesAmount) AS SalesAmount
        FROM (
          SELECT * FROM LegacyReport
          UNION ALL
          SELECT * FROM AppReport
        ) ReportRows
        GROUP BY DishName, DishId, CategoryName, CategoryId
        ORDER BY SalesAmount DESC, Sold DESC, DishName ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/category", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const pool = await poolPromise;
    const filter = normalizeReportFilter(req.query.filter);
    const appDateWhereSql = getReportDateWhereSql(filter, "sh.LastSettlementDate");
    const legacyDateWhereSql = getReportDateWhereSql(filter, "InvoiceDate");
    console.log(`[REPORT API] type=category filter=${filter}`);

    const result = await pool.request().query(`
        WITH AppReport AS (
          SELECT
            ISNULL(cm.CategoryName, 'Unmapped') AS categoryName,
            SUM(CAST(ISNULL(sid.Qty, 0) AS decimal(18, 3))) AS totalQty,
            SUM(CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS decimal(18, 2))) AS totalAmount
          FROM SettlementHeader sh
          INNER JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
          LEFT JOIN DishMaster d ON (sid.DishId IS NOT NULL AND sid.DishId = d.DishId)
            OR (sid.DishId IS NULL AND LTRIM(RTRIM(LOWER(sid.DishName))) = LTRIM(RTRIM(LOWER(d.Name))))
          LEFT JOIN DishGroupMaster dg ON COALESCE(sid.DishGroupId, d.DishGroupId) = dg.DishGroupId
          LEFT JOIN CategoryMaster cm ON COALESCE(sid.CategoryId, dg.CategoryId) = cm.CategoryId
          WHERE ${appDateWhereSql}
            AND ISNULL(sh.IsCancelled, 0) = 0
            AND ISNULL(sid.Qty, 0) > 0
          GROUP BY ISNULL(cm.CategoryName, 'Unmapped')
        ),
        LegacyReport AS (
          SELECT
            ISNULL(MAX(categoryname), 'Unmapped') AS categoryName,
            SUM(CAST(ISNULL(Sold, 0) AS decimal(18, 3))) AS totalQty,
            SUM(CAST(ISNULL(Revenue, ItemSales) AS decimal(18, 2))) AS totalAmount
          FROM vw_categorysalesreport
          WHERE ${legacyDateWhereSql}
          GROUP BY CategoryId
        )
        SELECT categoryName, SUM(totalQty) AS totalQty, SUM(totalAmount) AS totalAmount
        FROM (
          SELECT * FROM AppReport
          UNION ALL
          SELECT * FROM LegacyReport
        ) ReportRows
        GROUP BY categoryName
        HAVING SUM(totalQty) > 0 OR SUM(totalAmount) > 0
        ORDER BY totalAmount DESC, totalQty DESC, categoryName ASC
      `);

    console.log(`[REPORT API] type=category filter=${filter} rows=${result.recordset.length}`);
    res.json(result.recordset || []);
  } catch (err) {
    console.error("[REPORT API] category error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/dish", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const pool = await poolPromise;
    const filter = normalizeReportFilter(req.query.filter);
    const appDateWhereSql = getReportDateWhereSql(filter, "sh.LastSettlementDate");
    const legacyDateWhereSql = getReportDateWhereSql(filter, "InvoiceDate");
    console.log(`[REPORT API] type=dish filter=${filter}`);

    const result = await pool.request().query(`
        WITH AppReport AS (
          SELECT
            ISNULL(d.Name, sid.DishName) AS dishName,
            ISNULL(cm.CategoryName, 'Unmapped') AS categoryName,
            ISNULL(dg.DishGroupName, 'Unmapped') AS subCategoryName,
            SUM(CAST(ISNULL(sid.Qty, 0) AS decimal(18, 3))) AS totalQty,
            SUM(CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS decimal(18, 2))) AS totalAmount
          FROM SettlementHeader sh
          INNER JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
          LEFT JOIN DishMaster d ON (sid.DishId IS NOT NULL AND sid.DishId = d.DishId)
            OR (sid.DishId IS NULL AND LTRIM(RTRIM(LOWER(sid.DishName))) = LTRIM(RTRIM(LOWER(d.Name))))
          LEFT JOIN DishGroupMaster dg ON COALESCE(sid.DishGroupId, d.DishGroupId) = dg.DishGroupId
          LEFT JOIN CategoryMaster cm ON COALESCE(sid.CategoryId, dg.CategoryId) = cm.CategoryId
          WHERE ${appDateWhereSql}
            AND ISNULL(sh.IsCancelled, 0) = 0
            AND ISNULL(sid.Qty, 0) > 0
          GROUP BY ISNULL(d.Name, sid.DishName), ISNULL(cm.CategoryName, 'Unmapped'), ISNULL(dg.DishGroupName, 'Unmapped')
        ),
        LegacyReport AS (
          SELECT
            ISNULL(MAX(Dishname), 'Unmapped') AS dishName,
            ISNULL(MAX(CategoryName), 'Unmapped') AS categoryName,
            ISNULL(MAX(DishGroupname), 'Unmapped') AS subCategoryName,
            SUM(CAST(ISNULL(Sold, 0) AS decimal(18, 3))) AS totalQty,
            SUM(CAST(ISNULL(Revenue, ItemSales) AS decimal(18, 2))) AS totalAmount
          FROM vw_Dishsalesreport
          WHERE ${legacyDateWhereSql}
          GROUP BY DishId, CategoryId, DishGroupId
        )
        SELECT dishName, categoryName, subCategoryName, SUM(totalQty) AS totalQty, SUM(totalAmount) AS totalAmount
        FROM (
          SELECT * FROM AppReport
          UNION ALL
          SELECT * FROM LegacyReport
        ) ReportRows
        GROUP BY dishName, categoryName, subCategoryName
        HAVING SUM(totalQty) > 0 OR SUM(totalAmount) > 0
        ORDER BY totalAmount DESC, totalQty DESC, dishName ASC
      `);

    console.log(`[REPORT API] type=dish filter=${filter} rows=${result.recordset.length}`);
    res.json(result.recordset || []);
  } catch (err) {
    console.error("[REPORT API] dish error:", err.message);
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
        WITH NormalizedSales AS (
          SELECT sh.SettlementID, sts.SysAmount, ISNULL(sts.ReceiptCount, 0) AS ReceiptCount,
          ${normalizeReportPayModeSql("sts.PayMode")} AS PayMode
          FROM SettlementHeader sh
          INNER JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
          WHERE sh.LastSettlementDate BETWEEN @StartOfDay AND @EndOfDay
            AND ISNULL(sh.IsCancelled, 0) = 0
        )
        SELECT COUNT(DISTINCT SettlementID) as TotalTransactions, ISNULL(SUM(SysAmount), 0) as TotalSales,
        ISNULL(SUM(CASE WHEN PayMode = 'CASH' THEN SysAmount ELSE 0 END), 0) as CashSales,
        ISNULL(SUM(CASE WHEN PayMode = 'NETS' THEN SysAmount ELSE 0 END), 0) as NETS_Sales,
        ISNULL(SUM(CASE WHEN PayMode = 'PAYNOW' THEN SysAmount ELSE 0 END), 0) as PayNow_Sales,
        ISNULL(SUM(CASE WHEN PayMode = 'CARD' THEN SysAmount ELSE 0 END), 0) as CardSales,
        ISNULL(SUM(CASE WHEN PayMode = 'CREDIT' THEN SysAmount ELSE 0 END), 0) as MemberSales,
        ISNULL(SUM(ReceiptCount), 0) as TotalItems
        FROM NormalizedSales
      `);
    res.json(result.recordset[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/daily-order-count", async (req, res) => {
  try {
    const pool = await poolPromise;
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

    const validationError = validateSalePayload({ totalAmount, paymentMethod, items });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const settlementIdResult = await transaction.request().query(`SELECT NEWID() AS id`);
      const settlementId = settlementIdResult.recordset[0].id;
      const billNo = generateRandomBillId();

      const insertResult = await transaction.request()
        .input("SettlementID", settlementId)
        .input("LastSettlementDate", new Date())
        .input("SubTotal", subTotal || 0)
        .input("TotalTax", taxAmount || 0)
        .input("DiscountAmount", discountAmount || 0)
        .input("DiscountType", discountType || "fixed")
        .input("BillNo", billNo)
        .input("OrderType", orderType || "DINE-IN")
        .input("TableNo", tableNo || null)
        .input("Section", section || null)
        .input("MemberId", memberId || null)
        .input("CashierID", cashierId || null)
        .input("SysAmount", totalAmount || 0)
        .input("ManualAmount", totalAmount || 0)
        .input("CreatedBy", cashierId || "ADMIN")
        .input("CreatedOn", new Date()).query(`
          INSERT INTO SettlementHeader (SettlementID, LastSettlementDate, SubTotal, TotalTax, DiscountAmount, DiscountType, BillNo, OrderType, TableNo, Section, MemberId, CashierID, SysAmount, ManualAmount, CreatedBy, CreatedOn)
          OUTPUT inserted.OrderId
          VALUES (@SettlementID, @LastSettlementDate, @SubTotal, @TotalTax, @DiscountAmount, @DiscountType, @BillNo, @OrderType, @TableNo, @Section, @MemberId, @CashierID, @SysAmount, @ManualAmount, @CreatedBy, @CreatedOn)
        `);
      
      const generatedOrderId = insertResult.recordset[0].OrderId;

      const normalizedPayMode = normalizePayMode(paymentMethod);
      const receiptCount = Array.isArray(items)
        ? items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
        : 0;

      await transaction.request()
        .input("SettlementID", settlementId)
        .input("PayMode", normalizedPayMode)
        .input("SysAmount", totalAmount || 0)
        .input("ManualAmount", totalAmount || 0)
        .input("AmountDiff", 0)
        .input("ReceiptCount", receiptCount).query(`
          INSERT INTO SettlementTotalSales (SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff, ReceiptCount)
          VALUES (@SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff, @ReceiptCount)
        `);

      if (items && Array.isArray(items)) {
        for (const item of items) {
          const dishId = toGuidOrNull(item.dishId || item.id);
          const dishMeta = await transaction.request()
            .input("DishId", sql.UniqueIdentifier, dishId)
            .input("DishName", sql.NVarChar(255), item.dish_name || item.name || "")
            .query(`
              SELECT TOP 1 d.DishId, d.DishGroupId, dg.CategoryId
              FROM DishMaster d
              LEFT JOIN DishGroupMaster dg ON d.DishGroupId = dg.DishGroupId
              WHERE (@DishId IS NOT NULL AND d.DishId = @DishId)
                 OR (@DishId IS NULL AND LTRIM(RTRIM(LOWER(d.Name))) = LTRIM(RTRIM(LOWER(@DishName))))
            `);
          const meta = dishMeta.recordset[0] || {};
          await transaction.request()
            .input("SettlementID", settlementId)
            .input("DishId", meta.DishId || dishId)
            .input("DishGroupId", meta.DishGroupId || null)
            .input("SubCategoryId", meta.DishGroupId || null)
            .input("CategoryId", meta.CategoryId || null)
            .input("DishName", item.dish_name || item.name || "Unknown")
            .input("Qty", item.qty || 1)
            .input("Price", item.price || 0)
            .input("OrderDateTime", new Date()).query(`
              INSERT INTO SettlementItemDetail (SettlementID, DishId, DishGroupId, SubCategoryId, CategoryId, DishName, Qty, Price, OrderDateTime)
              VALUES (@SettlementID, @DishId, @DishGroupId, @SubCategoryId, @CategoryId, @DishName, @Qty, @Price, @OrderDateTime)
            `);
        }
      }

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
          .input("ReferenceNumber", sql.VarChar(100), null)
          .input("Remarks", paymentMethod || "")
          .input("BusinessUnitId", businessUnitId)
          .input("CreatedBy", cashierId || "ADMIN")
          .input("CreatedOn", new Date())
          .input("ModifiedBy", cashierId || "ADMIN")
          .input("ModifiedOn", new Date())
          .query(`
            INSERT INTO [dbo].[PaymentDetailCur] (PaymentId, RestaurantBillId, BilledFor, PaymentCollectedOn, PaymentType, Paymode, Amount, ReferenceNumber, Remarks, BusinessUnitId, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)
            VALUES (@PaymentId, @RestaurantBillId, @BilledFor, @PaymentCollectedOn, @PaymentType, @Paymode, @Amount, @ReferenceNumber, @Remarks, @BusinessUnitId, @CreatedBy, @CreatedOn, @ModifiedBy, @ModifiedOn)
          `);
      } catch (pdcErr) {
        console.warn("⚠️ [SAVE SALE] PaymentDetailCur insert skipped:", pdcErr.message);
      }

      if (memberId && (paymentMethod || "").toUpperCase() === "CREDIT") {
        await transaction.request()
          .input("MemberId", memberId)
          .input("Amount", totalAmount || 0)
          .query(`UPDATE MemberMaster SET CurrentBalance = CurrentBalance + @Amount WHERE MemberId = @MemberId`);
      }

      await transaction.commit();
      
      // Format OrderId as #YYYYMMDD-NNNN
      const now = new Date();
      const datePart = now.getFullYear().toString() + 
                     (now.getMonth() + 1).toString().padStart(2, '0') + 
                     now.getDate().toString().padStart(2, '0');
      const displayOrderId = `${datePart}-${generatedOrderId.toString().padStart(4, '0')}`;

      res.json({ success: true, settlementId, billNo, orderId: displayOrderId });
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
