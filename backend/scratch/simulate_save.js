const { poolPromise } = require('../db');
const sql = require('mssql');

const DEFAULT_GUID = "00000000-0000-0000-0000-000000000000";
const toGuidOrNull = (value) => {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
};
const sanitizeGuid = (value, fallback = DEFAULT_GUID) => {
  return toGuidOrNull(value) || fallback;
};
const generateRandomBillId = () => {
    return Math.random().toString(16).slice(2, 10).toUpperCase();
};

async function testSave() {
  try {
    const pool = await poolPromise;
    const body = {
      totalAmount: 100,
      paymentMethod: 'CASH',
      items: [{ dishId: null, name: 'Malay Kitchen', qty: 1, price: 100 }],
      subTotal: 100,
      taxAmount: 0,
      discountAmount: 0,
      discountType: 'fixed',
      orderId: 'TEST-SIM-' + Date.now(),
      orderType: 'DINE-IN',
      tableNo: '2',
      section: 'Section-1',
      memberId: null,
      cashierId: 'FFA46DDA-2871-42BB-BE6D-A547AE9C1B88'
    };

    console.log('--- Starting Simulated Save Transaction ---');
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const settlementIdResult = await transaction.request().query('SELECT NEWID() AS id');
      const settlementId = settlementIdResult.recordset[0].id;
      const billNo = generateRandomBillId();

      console.log('Step 1: Resolving BusinessUnitId...');
      const bizRow = await transaction.request().query(`
          SELECT TOP 1 BusinessUnitId FROM [dbo].[PaymentDetailCur] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'
          UNION ALL
          SELECT TOP 1 BusinessUnitId FROM [dbo].[SettlementHeader] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'
      `);
      let businessUnitId = bizRow.recordset.length > 0 ? bizRow.recordset[0].BusinessUnitId : DEFAULT_GUID;
      console.log('BusinessUnitId resolved to:', businessUnitId);

      console.log('Step 2: Inserting SettlementHeader...');
      const insertResult = await transaction.request()
        .input("SettlementID", settlementId)
        .input("LastSettlementDate", new Date())
        .input("SubTotal", body.subTotal || 0)
        .input("TotalTax", body.taxAmount || 0)
        .input("DiscountAmount", body.discountAmount || 0)
        .input("DiscountType", body.discountType || "fixed")
        .input("BillNo", billNo)
        .input("OrderType", body.orderType || "DINE-IN")
        .input("TableNo", body.tableNo || null)
        .input("Section", body.section || null)
        .input("MemberId", toGuidOrNull(body.memberId))
        .input("CashierID", toGuidOrNull(body.cashierId))
        .input("BusinessUnitId", sanitizeGuid(businessUnitId))
        .input("SysAmount", body.totalAmount || 0)
        .input("ManualAmount", body.totalAmount || 0)
        .input("CreatedBy", sanitizeGuid(body.cashierId))
        .input("CreatedOn", new Date()).query(`
          INSERT INTO SettlementHeader (SettlementID, LastSettlementDate, SubTotal, TotalTax, DiscountAmount, DiscountType, BillNo, OrderType, TableNo, Section, MemberId, CashierID, BusinessUnitId, SysAmount, ManualAmount, CreatedBy, CreatedOn)
          OUTPUT inserted.OrderId
          VALUES (@SettlementID, @LastSettlementDate, @SubTotal, @TotalTax, @DiscountAmount, @DiscountType, @BillNo, @OrderType, @TableNo, @Section, @MemberId, @CashierID, @BusinessUnitId, @SysAmount, @ManualAmount, @CreatedBy, @CreatedOn)
        `);
      console.log('SettlementHeader OK, OrderId:', insertResult.recordset[0].OrderId);

      console.log('Step 3: Inserting SettlementTotalSales...');
      await transaction.request()
        .input("SettlementID", settlementId)
        .input("PayMode", 'CASH')
        .input("SysAmount", body.totalAmount || 0)
        .input("ManualAmount", body.totalAmount || 0)
        .input("AmountDiff", 0)
        .input("ReceiptCount", 1).query(`
          INSERT INTO SettlementTotalSales (SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff, ReceiptCount)
          VALUES (@SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff, @ReceiptCount)
        `);
      console.log('SettlementTotalSales OK');

      console.log('Step 4: Inserting SettlementItemDetail...');
      for (const item of body.items) {
          await transaction.request()
            .input("SettlementID", settlementId)
            .input("DishId", null)
            .input("DishGroupId", null)
            .input("SubCategoryId", null)
            .input("CategoryId", null)
            .input("DishName", item.name || "Unknown")
            .input("Qty", item.qty || 1)
            .input("Price", item.price || 0)
            .input("OrderDateTime", new Date()).query(`
              INSERT INTO SettlementItemDetail (SettlementID, DishId, DishGroupId, SubCategoryId, CategoryId, DishName, Qty, Price, OrderDateTime)
              VALUES (@SettlementID, @DishId, @DishGroupId, @SubCategoryId, @CategoryId, @DishName, @Qty, @Price, @OrderDateTime)
            `);
      }
      console.log('SettlementItemDetail OK');

      console.log('Step 5: Inserting PaymentDetailCur...');
      await transaction.request()
          .input("PaymentId", settlementId)
          .input("RestaurantBillId", settlementId)
          .input("BilledFor", 1)
          .input("PaymentCollectedOn", new Date())
          .input("PaymentType", 1)
          .input("Paymode", 1)
          .input("Amount", body.totalAmount || 0)
          .input("ReferenceNumber", null)
          .input("Remarks", body.paymentMethod || "")
          .input("BusinessUnitId", sanitizeGuid(businessUnitId))
          .input("CreatedBy", sanitizeGuid(body.cashierId))
          .input("CreatedOn", new Date())
          .input("ModifiedBy", sanitizeGuid(body.cashierId))
          .input("ModifiedOn", new Date())
          .query(`
            INSERT INTO [dbo].[PaymentDetailCur] (PaymentId, RestaurantBillId, BilledFor, PaymentCollectedOn, PaymentType, Paymode, Amount, ReferenceNumber, Remarks, BusinessUnitId, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)
            VALUES (@PaymentId, @RestaurantBillId, @BilledFor, @PaymentCollectedOn, @PaymentType, @Paymode, @Amount, @ReferenceNumber, @Remarks, @BusinessUnitId, @CreatedBy, @CreatedOn, @ModifiedBy, @ModifiedOn)
          `);
      console.log('PaymentDetailCur OK');

      await transaction.commit();
      console.log('--- TEST COMPLETED SUCCESSFULLY (COMMITTED) ---');
      console.log('Check the sales report now!');
    } catch (err) {
      console.error('--- TRANSACTION ERROR ---');
      console.error(err);
      if (transaction) await transaction.rollback();
    }
    process.exit(0);
  } catch (err) {
    console.error('OUTER ERROR:', err);
    process.exit(1);
  }
}

testSave();
