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
    WHEN UPPER(LTRIM(RTRIM(ISNULL(${columnName}, '')))) IN ('CAS', 'CASH', '') THEN 'CASH'
    WHEN UPPER(LTRIM(RTRIM(ISNULL(${columnName}, '')))) IN ('CARD', 'VISA', 'MASTER', 'MASTERCARD', 'AMEX', 'DINERS') THEN 'CARD'
    WHEN UPPER(LTRIM(RTRIM(ISNULL(${columnName}, '')))) IN ('PAYNOW', 'GRAB', 'FOODPANDA') THEN 'PAYNOW'
    WHEN UPPER(LTRIM(RTRIM(ISNULL(${columnName}, '')))) = 'NETS' THEN 'NETS'
    ELSE UPPER(LTRIM(RTRIM(ISNULL(${columnName}, 'CASH'))))
  END
`;

const getReportDateRange = (req) => {
  const filter = (req.query.filter || "daily").toLowerCase();
  const start = new Date();
  const end = new Date();

  // Default to day boundaries
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  if (filter === "weekly") {
    start.setDate(start.getDate() - 7);
  } else if (filter === "monthly") {
    start.setDate(1);
    // end maintains today
  } else if (filter === "yearly") {
    start.setMonth(0, 1);
    // end maintains today
  }
  // Daily uses today's start/end

  return { start, end };
};

const getReportDateWhereSql = (filter = "daily", saleDateColumn = "sh.LastSettlementDate", date = null) => {
  const targetDate = date ? `'${date}'` : 'GETDATE()';
  switch (String(filter).toLowerCase()) {
    case "weekly":
      return `${saleDateColumn} >= DATEADD(DAY, -7, CAST(${targetDate} AS DATE)) AND ${saleDateColumn} <= CAST(${targetDate} AS DATE)`;
    case "monthly":
      return `MONTH(${saleDateColumn}) = MONTH(CAST(${targetDate} AS DATE)) AND YEAR(${saleDateColumn}) = YEAR(CAST(${targetDate} AS DATE))`;
    case "yearly":
      return `YEAR(${saleDateColumn}) = YEAR(CAST(${targetDate} AS DATE))`;
    case "daily":
    default:
      return `CAST(${saleDateColumn} AS DATE) = CAST(${targetDate} AS DATE)`;
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

const DEFAULT_GUID = "00000000-0000-0000-0000-000000000000";

const sanitizeGuid = (value, fallback = DEFAULT_GUID) => {
  return toGuidOrNull(value) || fallback;
};

const validateSalePayload = ({ totalAmount, paymentMethod, items }) => {
  if (!paymentMethod || !String(paymentMethod).trim()) {
    return "Payment mode is required";
  }

  const numericTotal = Number(totalAmount);
  if (!Number.isFinite(numericTotal) || numericTotal < 0) {
    return "Total amount must be at least zero";
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
      SELECT TOP 200 sh.SettlementID, sh.LastSettlementDate AS SettlementDate, 
      sh.BillNo AS OrderId, 
      sh.OrderType,
      sh.TableNo, sh.Section, sh.CashierId, sh.BillNo, sh.SER_NAME,
      ${normalizeReportPayModeSql("sts.PayMode")} as PayMode,
      ISNULL(NULLIF(sts.SysAmount, 0), ISNULL(sh.SysAmount, 0)) as SysAmount,
      ISNULL(NULLIF(sts.ManualAmount, 0), ISNULL(sh.ManualAmount, 0)) as ManualAmount,
      ISNULL(sts.ReceiptCount, 0) as ReceiptCount
      FROM SettlementHeader sh
      LEFT JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
      WHERE ISNULL(sh.IsCancelled, 0) = 0 AND (sts.SettlementID IS NOT NULL OR sh.SysAmount > 0)
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
        WHERE CAST(sh.LastSettlementDate AS DATE) BETWEEN CAST(@Start AS DATE) AND CAST(@End AS DATE)
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
        WHERE CAST(sh.LastSettlementDate AS DATE) BETWEEN CAST(@Start AS DATE) AND CAST(@End AS DATE)
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


router.get("/category", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const pool = await poolPromise;
    const filter = normalizeReportFilter(req.query.filter);
    const date = req.query.date;
    const appDateWhereSql = getReportDateWhereSql(filter, "sh.LastSettlementDate", date);
    const legacyDateWhereSql = getReportDateWhereSql(filter, "InvoiceDate", date);
    console.log(`[REPORT API] type=category filter=${filter} date=${date || 'today'}`);

    const result = await pool.request().query(`
        WITH AppReport AS (
          SELECT
            ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped')) AS categoryName,
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
          GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped'))
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
    const date = req.query.date;
    const appDateWhereSql = getReportDateWhereSql(filter, "sh.LastSettlementDate", date);
    const legacyDateWhereSql = getReportDateWhereSql(filter, "InvoiceDate", date);
    console.log(`[REPORT API] type=dish filter=${filter} date=${date || 'today'}`);

    const result = await pool.request().query(`
        WITH AppReport AS (
          SELECT
            ISNULL(NULLIF(LTRIM(RTRIM(sid.DishName)), ''), ISNULL(d.Name, 'Unknown')) AS dishName,
            ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped')) AS categoryName,
            ISNULL(NULLIF(LTRIM(RTRIM(sid.SubCategoryName)), ''), ISNULL(dg.DishGroupName, 'Unmapped')) AS subCategoryName,
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
          GROUP BY 
            ISNULL(NULLIF(LTRIM(RTRIM(sid.DishName)), ''), ISNULL(d.Name, 'Unknown')), 
            ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped')), 
            ISNULL(NULLIF(LTRIM(RTRIM(sid.SubCategoryName)), ''), ISNULL(dg.DishGroupName, 'Unmapped'))
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

// 5. Get Day End Summary
router.get("/day-end-summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const today = new Date().toISOString().split("T")[0];
    
    // Default to today if no dates provided
    const start = startDate || today;
    const end = endDate || today;
    
    console.log(`[DAY-END DEBUG] Fetching summary from ${start} to ${end}`);
    
    const pool = await poolPromise;

    // 0. Organization Info
    const orgRes = await pool.request().query(`
      SELECT TOP 1
        Name,
        Address1_Line1,
        Address1_Line2,
        Address1_City,
        Address1_PostalCode,
        Address1_Telephone1
      FROM Organization
    `);
    const orgInfo = orgRes.recordset[0] || {};

    // A. Paymode Detail (Aggregate all settlements in range)
    const paymodeRes = await pool.request()
      .input("start", sql.VarChar, start)
      .input("end", sql.VarChar, end)
      .query(`
        SELECT 
          sd.Paymode,
          SUM(ISNULL(sd.SysAmount, 0)) as Amount,
          CAST(SUM(ISNULL(sd.ReceiptCount, 0)) AS INT) as Count
        FROM SettlementHeader sh
        INNER JOIN SettlementDetail sd ON sh.SettlementID = sd.SettlementId
        WHERE CAST(sh.LastSettlementDate AS DATE) >= @start
          AND CAST(sh.LastSettlementDate AS DATE) <= @end
          AND ISNULL(sh.IsCancelled, 0) = 0
        GROUP BY sd.Paymode
      `);

    const paymodes = paymodeRes.recordset;
    console.log(`[DAY-END DEBUG] Found ${paymodes.length} paymode records`);

    const cashTotal = paymodes.filter(p => p.Paymode === 'CASH').reduce((acc, curr) => acc + curr.Amount, 0);
    const otherTotal = paymodes.filter(p => p.Paymode !== 'CASH').reduce((acc, curr) => acc + curr.Amount, 0);

    // B. Detailed Sales Analysis & Void Detail
    const analysisRes = await pool.request()
      .input("start", sql.VarChar, start)
      .input("end", sql.VarChar, end)
      .query(`
        SELECT 
          SUM(ISNULL(SubTotal, 0)) as BaseSales,
          SUM(ISNULL(SysAmount, 0)) as TotalSales,
          SUM(ISNULL(TotalTax, 0)) as TotalTax,
          SUM(ISNULL(DiscountAmount, 0)) as TotalDiscount,
          SUM(ISNULL(ServiceCharge, 0)) as TotalServiceCharge,
          SUM(ISNULL(RoundedBy, 0)) as TotalRoundOff,
          SUM(ISNULL(InvoiceCount, 0)) as TotalBills,
          SUM(ISNULL(VoidItemQty, 0)) as VoidQty,
          SUM(ISNULL(VoidItemAmount, 0)) as VoidAmount,
          MAX(TerminalCode) as TerminalCode,
          MAX(RefNo) as RefNo
        FROM SettlementHeader
        WHERE CAST(LastSettlementDate AS DATE) >= @start
          AND CAST(LastSettlementDate AS DATE) <= @end
          AND ISNULL(IsCancelled, 0) = 0
      `);

    const analysis = analysisRes.recordset[0] || { 
      BaseSales: 0, TotalSales: 0, TotalTax: 0, TotalDiscount: 0, TotalServiceCharge: 0, 
      TotalRoundOff: 0, TotalBills: 0, VoidQty: 0, VoidAmount: 0, TerminalCode: "", RefNo: ""
    };

    const totalSales = analysis.TotalSales || 0;
    const billCount = analysis.TotalBills || 0;
    
    res.json({
      success: true,
      orgInfo,
      terminalCode: analysis.TerminalCode,
      refNo: analysis.RefNo,
      paymodeDetail: paymodes,
      settlementDetail: {
        cashTotal,
        otherTotal
      },
      salesAnalysis: {
        baseSales: analysis.BaseSales || 0,
        totalSales,
        totalTax: analysis.TotalTax || 0,
        totalDiscount: analysis.TotalDiscount || 0,
        totalServiceCharge: analysis.TotalServiceCharge || 0,
        roundOff: analysis.TotalRoundOff || 0,
        netTotal: totalSales, // SysAmount is already the net total in this DB
        billCount,
        avgPerBill: billCount > 0 ? (totalSales / billCount) : 0
      },
      voidDetail: {
        voidQty: analysis.VoidQty || 0,
        voidAmount: analysis.VoidAmount || 0
      }
    });
  } catch (err) {
    console.error("[DAY-END SUMMARY ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
  try {
    res.set("Cache-Control", "no-store");
    const pool = await poolPromise;
    const filter = normalizeReportFilter(req.query.filter);
    const date = req.query.date;
    const dateWhereSql = getReportDateWhereSql(filter, "sh.LastSettlementDate", date);
    
    console.log(`[REPORT API] type=settlement filter=${filter} date=${date || 'today'}`);

    const result = await pool.request().query(`
        SELECT 
          sd.Paymode,
          SUM(ISNULL(sd.SysAmount, 0)) as SysAmount,
          SUM(ISNULL(sd.ManualAmount, 0)) as ManualAmount,
          SUM(ISNULL(sd.SortageOrExces, 0)) as SortageOrExces,
          CAST(SUM(ISNULL(sd.ReceiptCount, 0)) AS INT) as ReceiptCount
        FROM SettlementHeader sh
        INNER JOIN SettlementDetail sd ON sh.SettlementID = sd.SettlementId
        WHERE ${dateWhereSql}
          AND ISNULL(sh.IsCancelled, 0) = 0
        GROUP BY sd.Paymode
        ORDER BY SysAmount DESC
      `);

    console.log(`[REPORT API] type=settlement filter=${filter} rows=${result.recordset.length}`);
    res.json(result.recordset || []);
  } catch (err) {
    console.error("[REPORT API] settlement error:", err.message);
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
      discountAmount, discountType, orderId, orderType, tableNo, section, memberId, cashierId, tableId,
      serverId, serverName
    } = req.body;

    const validationError = validateSalePayload({ totalAmount, paymentMethod, items });
    if (validationError) {
      console.warn(`[SAVE SALE] Validation failed: ${validationError}`);
      return res.status(400).json({ error: validationError });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const settlementIdResult = await transaction.request().query(`SELECT NEWID() AS id`);
      const settlementId = settlementIdResult.recordset[0].id;
      let billNo = ""; // Will be set to displayOrderId later

        const bizRow = await transaction.request().query(`
          SELECT TOP 1 BusinessUnitId FROM [dbo].[PaymentDetailCur] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'
          UNION ALL
          SELECT TOP 1 BusinessUnitId FROM [dbo].[SettlementHeader] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'
        `);
        let businessUnitId = bizRow.recordset.length > 0 ? bizRow.recordset[0].BusinessUnitId : DEFAULT_GUID;

    // 2. Order ID Retrieval
    const now = new Date();
    let displayOrderId = null;
    let dailySequence = 0;

    if (tableId) {
        const tableCheck = await transaction.request()
            .input("tid", sql.UniqueIdentifier, String(tableId).replace(/^\{|\}$/g, "").trim())
            .query("SELECT CurrentOrderId FROM TableMaster WHERE TableId = @tid");
        displayOrderId = tableCheck.recordset[0]?.CurrentOrderId;
        
        if (displayOrderId && displayOrderId.includes('-')) {
            dailySequence = parseInt(displayOrderId.split('-')[1]) || 0;
        }
    }

    if (!displayOrderId) {
        // Fallback: Generate a new one if none exists (e.g., takeaway or direct pay)
        const todayStr = new Date().toLocaleDateString('en-CA'); 
        
        let seqResult = await transaction.request()
            .input("RestId", sql.UniqueIdentifier, businessUnitId)
            .input("Today", sql.Date, todayStr)
            .query(`
              UPDATE OrderSequences 
              SET LastNumber = LastNumber + 1 
              OUTPUT INSERTED.LastNumber
              WHERE RestaurantId = @RestId AND SequenceDate = @Today
            `);

        if (seqResult.recordset.length > 0) {
            dailySequence = seqResult.recordset[0].LastNumber;
        } else {
            await transaction.request()
                .input("RestId", sql.UniqueIdentifier, businessUnitId)
                .input("Today", sql.Date, todayStr)
                .query(`
                  INSERT INTO OrderSequences (RestaurantId, SequenceDate, LastNumber)
                  VALUES (@RestId, @Today, 1)
                `);
            dailySequence = 1;
        }
        displayOrderId = `${todayStr.replace(/-/g, '')}-${String(dailySequence).padStart(4, '0')}`;
        console.log(`[SAVE SALE] Generated NEW ID: ${displayOrderId}`);
    } else {
        console.log(`[SAVE SALE] Using EXISTING ID: ${displayOrderId} (Seq: ${dailySequence})`);
    }

    const headerResult = await transaction.request()
      .input("SettlementID", sql.UniqueIdentifier, settlementId)
      .input("LastSettlementDate", sql.DateTime, now)
      .input("SubTotal", sql.Money, subTotal || 0)
      .input("TotalTax", sql.Money, taxAmount || 0)
      .input("DiscountAmount", sql.Money, discountAmount || 0)
      .input("DiscountType", sql.NVarChar(50), discountType || "fixed")
      .input("BillNo", sql.NVarChar(50), displayOrderId) // Use displayOrderId here
      .input("OrderType", sql.NVarChar(50), orderType || "DINE-IN")
      .input("TableNo", sql.NVarChar(50), tableNo || null)
      .input("Section", sql.NVarChar(100), section || null)
      .input("MemberId", sql.UniqueIdentifier, toGuidOrNull(memberId))
      .input("CashierID", sql.UniqueIdentifier, toGuidOrNull(cashierId))
      .input("BusinessUnitId", sql.UniqueIdentifier, sanitizeGuid(businessUnitId))
      .input("SysAmount", sql.Money, totalAmount || 0)
      .input("ManualAmount", sql.Money, totalAmount || 0)
      .input("CreatedBy", sql.UniqueIdentifier, sanitizeGuid(cashierId))
      .input("CreatedOn", sql.DateTime, now)
      .input("SER_NAME", sql.NVarChar(255), req.body.serverName || null)
      .query(`
        INSERT INTO SettlementHeader (SettlementID, LastSettlementDate, SubTotal, TotalTax, DiscountAmount, DiscountType, BillNo, OrderType, TableNo, Section, MemberId, CashierID, BusinessUnitId, SysAmount, ManualAmount, CreatedBy, CreatedOn, SER_NAME)
        VALUES (@SettlementID, @LastSettlementDate, @SubTotal, @TotalTax, @DiscountAmount, @DiscountType, @BillNo, @OrderType, @TableNo, @Section, @MemberId, @CashierID, @BusinessUnitId, @SysAmount, @ManualAmount, @CreatedBy, @CreatedOn, @SER_NAME)
      `);

    // 3. Insert SettlementTotalSales
    const normalizedPayMode = normalizePayMode(paymentMethod);
    const receiptCount = Array.isArray(items) ? items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0) : 0;

      console.log(`[SAVE SALE] Step 3: Inserting Settlement Tables (ID: ${settlementId})...`);
      
      let settlementSql = `
        INSERT INTO SettlementTotalSales (SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff, ReceiptCount)
        VALUES (@SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff, @ReceiptCount);

        INSERT INTO [dbo].[SettlementDetail] (SettlementId, Paymode, SysAmount, ManualAmount, SortageOrExces, ReceiptCount, IsCollected)
        VALUES (@SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff, @ReceiptCount, 0);

        INSERT INTO SettlementTranDetail (SettlementID, PayMode, CashIn, CashOut)
        VALUES (@SettlementID, @PayMode, @SysAmount, 0);
      `;

      if (normalizedPayMode === 'CREDIT') {
        settlementSql += `
          INSERT INTO SettlementCreditSales (SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff)
          VALUES (@SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff);
        `;
      }

      if (Number(discountAmount) > 0) {
        settlementSql += `
          INSERT INTO SettlementDiscountDetail (SettlementId, DiscountId, Description, SysAmount, ManualAmount, SortageOrExces)
          VALUES (@SettlementID, @DiscountID, @DiscountDesc, @DiscAmount, @DiscAmount, 0);
        `;
      }

      const settlementReq = transaction.request()
        .input("SettlementID", sql.UniqueIdentifier, settlementId)
        .input("PayMode", sql.VarChar(50), normalizedPayMode)
        .input("SysAmount", sql.Money, totalAmount || 0)
        .input("ManualAmount", sql.Money, totalAmount || 0)
        .input("AmountDiff", sql.Money, 0)
        .input("ReceiptCount", sql.Numeric(18, 0), receiptCount);

      if (Number(discountAmount) > 0) {
        settlementReq.input("DiscountID", sql.UniqueIdentifier, DEFAULT_GUID)
          .input("DiscountDesc", sql.VarChar(255), String(discountType || "Fixed") + " Discount")
          .input("DiscAmount", sql.Money, discountAmount);
      }

      await settlementReq.query(settlementSql);
      console.log(`[SAVE SALE] Settlement tables updated successfully.`);

      if (items && Array.isArray(items)) {
        for (const item of items) {
          console.log(`[SAVE SALE] Step 4: Item [${item.dish_name || item.name}]...`);
          const dishId = toGuidOrNull(item.dishId || item.id);
          const dishMeta = await transaction.request()
            .input("DishId", sql.UniqueIdentifier, dishId)
            .input("DishName", sql.NVarChar(255), item.dish_name || item.name || "")
            .query(`
              SELECT TOP 1 d.DishId, d.DishGroupId, dg.CategoryId, cm.CategoryName, dg.DishGroupName
              FROM DishMaster d
              LEFT JOIN DishGroupMaster dg ON d.DishGroupId = dg.DishGroupId
              LEFT JOIN CategoryMaster cm ON dg.CategoryId = cm.CategoryId
              WHERE (@DishId IS NOT NULL AND d.DishId = @DishId)
                 OR (@DishId IS NULL AND LTRIM(RTRIM(LOWER(d.Name))) = LTRIM(RTRIM(LOWER(@DishName))))
            `);
          const meta = dishMeta.recordset[0] || {};
          await transaction.request()
            .input("SettlementID", sql.UniqueIdentifier, settlementId)
            .input("DishId", sql.UniqueIdentifier, toGuidOrNull(meta.DishId || dishId))
            .input("DishGroupId", sql.UniqueIdentifier, toGuidOrNull(meta.DishGroupId))
            .input("SubCategoryId", sql.UniqueIdentifier, toGuidOrNull(meta.DishGroupId))
            .input("CategoryId", sql.UniqueIdentifier, toGuidOrNull(meta.CategoryId))
            .input("DishName", sql.NVarChar(255), item.dish_name || item.name || "Unknown")
            .input("CategoryName", sql.NVarChar(255), meta.CategoryName || item.categoryName || "Unmapped")
            .input("SubCategoryName", sql.NVarChar(255), meta.DishGroupName || "Unmapped")
            .input("Qty", sql.Int, item.qty || 1)
            .input("Price", sql.Decimal(18, 2), item.price || 0)
            .input("OrderDateTime", sql.DateTime, new Date()).query(`
              INSERT INTO SettlementItemDetail (SettlementID, DishId, DishGroupId, SubCategoryId, CategoryId, DishName, Qty, Price, OrderDateTime, CategoryName, SubCategoryName)
              VALUES (@SettlementID, @DishId, @DishGroupId, @SubCategoryId, @CategoryId, @DishName, @Qty, @Price, @OrderDateTime, @CategoryName, @SubCategoryName)
            `);
        }
      }

        console.log(`[SAVE SALE] Step 5: Inserting PaymentDetailCur...`);
        const paymodeRow = await transaction.request()
          .input("PayModeCode", sql.VarChar(50), (paymentMethod || "CAS").trim())
          .query(`SELECT TOP 1 ISNULL(Position, 1) AS Position FROM [dbo].[Paymode] WHERE LTRIM(RTRIM(PayMode)) = @PayModeCode`);
        const paymodePosition = paymodeRow.recordset.length > 0 ? paymodeRow.recordset[0].Position : 1;

        await transaction.request()
          .input("PaymentId", sql.UniqueIdentifier, settlementId)
          .input("RestaurantBillId", sql.UniqueIdentifier, settlementId)
          .input("BilledFor", sql.Int, 1)
          .input("PaymentCollectedOn", sql.DateTime, new Date())
          .input("PaymentType", sql.Int, 1)
          .input("Paymode", sql.Int, paymodePosition)
          .input("Amount", sql.Decimal(18, 2), totalAmount || 0)
          .input("ReferenceNumber", sql.VarChar(100), null)
          .input("Remarks", sql.VarChar(500), paymentMethod || "")
          .input("BusinessUnitId", sql.UniqueIdentifier, sanitizeGuid(businessUnitId))
          .input("CreatedBy", sql.UniqueIdentifier, sanitizeGuid(cashierId))
          .input("CreatedOn", sql.DateTime, new Date())
          .input("ModifiedBy", sql.UniqueIdentifier, sanitizeGuid(cashierId))
          .input("ModifiedOn", sql.DateTime, new Date())
          .query(`
            INSERT INTO [dbo].[PaymentDetailCur] (PaymentId, RestaurantBillId, BilledFor, PaymentCollectedOn, PaymentType, Paymode, Amount, ReferenceNumber, Remarks, BusinessUnitId, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)
            VALUES (@PaymentId, @RestaurantBillId, @BilledFor, @PaymentCollectedOn, @PaymentType, @Paymode, @Amount, @ReferenceNumber, @Remarks, @BusinessUnitId, @CreatedBy, @CreatedOn, @ModifiedBy, @ModifiedOn)
          `);
        console.log(`[SAVE SALE] PaymentDetailCur success.`);

      if (memberId && (paymentMethod || "").toUpperCase() === "CREDIT") {
        await transaction.request()
          .input("MemberId", memberId)
          .input("Amount", totalAmount || 0)
          .query(`UPDATE MemberMaster SET CurrentBalance = CurrentBalance + @Amount WHERE MemberId = @MemberId`);
      }

      // 4. Cleanup Table & Cart on success
      if (tableId) {
        const cleanTableId = String(tableId).replace(/^\{|\}$/g, "").trim();
        console.log(`[SAVE SALE] Cleaning up table: ${cleanTableId}`);
        
        await transaction.request()
          .input("cartId", sql.NVarChar(128), cleanTableId)
          .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @cartId");
          
        await transaction.request()
          .input("tid", sql.NVarChar(128), cleanTableId)
          .query("UPDATE [dbo].[TableMaster] SET Status = 0, TotalAmount = 0, StartTime = NULL, CurrentOrderId = NULL WHERE TableId = @tid");

        const io = req.app.get("io");
        if (io) {
          io.emit("table_status_updated", { tableId: cleanTableId, status: 0, totalAmount: 0 });
          io.emit("cart_updated", { tableId: cleanTableId });
        }
      }

      // 5. Track in servermaster (Waiter History)
      if (serverId) {
        try {
          await transaction.request()
            .input("SER_ID", sql.Int, serverId)
            .input("SER_NAME", sql.NVarChar(255), serverName)
            .input("TableNo", sql.NVarChar(50), tableNo || null)
            .input("OrderId", sql.NVarChar(50), displayOrderId)
            .input("Section", sql.NVarChar(100), section || null)
            .input("CreatedBy", sql.UniqueIdentifier, sanitizeGuid(cashierId))
            .query(`
              INSERT INTO servermaster (SER_ID, SER_NAME, TableNo, OrderId, Section, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate)
              VALUES (@SER_ID, @SER_NAME, @TableNo, @OrderId, @Section, @CreatedBy, GETDATE(), @CreatedBy, GETDATE())
            `);
        } catch (serverErr) {
          console.error("⚠️ [SAVE SALE] servermaster insert failed:", serverErr.message);
        }
      }

      await transaction.commit();
      
      res.json({ success: true, settlementId, billNo: displayOrderId, orderId: displayOrderId });
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
