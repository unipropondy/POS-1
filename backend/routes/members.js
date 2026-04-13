const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");

router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM MemberMaster ORDER BY Name");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/add", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { name, phone, email, creditLimit, currentBalance, balance } = req.body;
    await pool.request()
      .input("Name", sql.NVarChar, name)
      .input("Phone", sql.NVarChar, phone)
      .input("Email", sql.NVarChar, email)
      .input("CreditLimit", sql.Decimal(18, 2), parseFloat(creditLimit) || 0)
      .input("CurrentBalance", sql.Decimal(18, 2), parseFloat(currentBalance) || 0)
      .input("Balance", sql.Decimal(18, 2), parseFloat(balance) || 0)
      .query(`
        INSERT INTO MemberMaster (Name, Phone, Email, CreditLimit, CurrentBalance, Balance)
        VALUES (@Name, @Phone, @Email, @CreditLimit, @CurrentBalance, @Balance)
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/update", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { memberId, name, phone, email, creditLimit, currentBalance, balance } = req.body;
    await pool.request()
      .input("Id", sql.UniqueIdentifier, memberId)
      .input("Name", sql.NVarChar, name)
      .input("Phone", sql.NVarChar, phone)
      .input("Email", sql.NVarChar, email)
      .input("CreditLimit", sql.Decimal(18, 2), parseFloat(creditLimit) || 0)
      .input("CurrentBalance", sql.Decimal(18, 2), parseFloat(currentBalance) || 0)
      .input("Balance", sql.Decimal(18, 2), parseFloat(balance) || 0)
      .query(`
        UPDATE MemberMaster SET 
          Name = @Name, Phone = @Phone, Email = @Email, 
          CreditLimit = @CreditLimit, CurrentBalance = @CurrentBalance, Balance = @Balance
        WHERE MemberId = @Id
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/delete", async (req, res) => {
  let transaction;
  try {
    const pool = await poolPromise;
    const { memberId } = req.body;
    if (!memberId) return res.status(400).json({ error: "Missing memberId" });

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const request = new sql.Request(transaction);
    request.input("Id", sql.UniqueIdentifier, memberId);

    await request.query("IF OBJECT_ID('MemberTimeLog', 'U') IS NOT NULL DELETE FROM MemberTimeLog WHERE MemberId = @Id");
    await request.query("IF COL_LENGTH('SettlementHeader', 'MemberId') IS NOT NULL UPDATE SettlementHeader SET MemberId = NULL WHERE MemberId = @Id;");
    await request.query("DELETE FROM MemberMaster WHERE MemberId = @Id");

    await transaction.commit();
    res.json({ success: true });
  } catch (err) {
    if (transaction) await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
