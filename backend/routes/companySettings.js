const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");

// 🔹 GET Settings
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    const result = await pool.request()
      .input("Id", sql.NVarChar, id)
      .query("SELECT * FROM CompanySettings WHERE Id = @Id");
    
    if (result.recordset.length > 0) {
      res.json({ success: true, settings: result.recordset[0] });
    } else {
      res.status(404).json({ success: false, message: "Settings not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 POST Settings (Upsert)
router.post("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const s = req.body;
    const pool = await poolPromise;

    await pool.request()
      .input("Id", sql.NVarChar, id)
      .input("CompanyName", sql.NVarChar, s.CompanyName)
      .input("Address", sql.NVarChar, s.Address)
      .input("GSTNo", sql.NVarChar, s.GSTNo)
      .input("GSTPercentage", sql.Decimal(18, 2), s.GSTPercentage)
      .input("Phone", sql.NVarChar, s.Phone)
      .input("Email", sql.NVarChar, s.Email)
      .input("CashierName", sql.NVarChar, s.CashierName)
      .input("Currency", sql.NVarChar, s.Currency)
      .input("CurrencySymbol", sql.NVarChar, s.CurrencySymbol)
      .input("CompanyLogoUrl", sql.NVarChar, s.CompanyLogoUrl)
      .input("HalalLogoUrl", sql.NVarChar, s.HalalLogoUrl)
      .input("PrinterIP", sql.NVarChar, s.PrinterIP) // ✅ ADDED
      .input("ShowCompanyLogo", sql.Bit, s.ShowCompanyLogo)
      .input("ShowHalalLogo", sql.Bit, s.ShowHalalLogo)
      .input("TaxMode", sql.NVarChar, s.TaxMode || 'exclusive')
      .query(`
        IF EXISTS (SELECT 1 FROM CompanySettings WHERE Id = @Id)
        BEGIN
          UPDATE CompanySettings SET
            CompanyName = @CompanyName,
            Address = @Address,
            GSTNo = @GSTNo,
            GSTPercentage = @GSTPercentage,
            Phone = @Phone,
            Email = @Email,
            CashierName = @CashierName,
            Currency = @Currency,
            CurrencySymbol = @CurrencySymbol,
            CompanyLogoUrl = @CompanyLogoUrl,
            HalalLogoUrl = @HalalLogoUrl,
            PrinterIP = @PrinterIP,
            ShowCompanyLogo = @ShowCompanyLogo,
            ShowHalalLogo = @ShowHalalLogo,
            TaxMode = @TaxMode,
            UpdatedOn = GETDATE()
          WHERE Id = @Id
        END
        ELSE
        BEGIN
          INSERT INTO CompanySettings (Id, CompanyName, Address, GSTNo, GSTPercentage, Phone, Email, CashierName, Currency, CurrencySymbol, CompanyLogoUrl, HalalLogoUrl, PrinterIP, ShowCompanyLogo, ShowHalalLogo, TaxMode)
          VALUES (@Id, @CompanyName, @Address, @GSTNo, @GSTPercentage, @Phone, @Email, @CashierName, @Currency, @CurrencySymbol, @CompanyLogoUrl, @HalalLogoUrl, @PrinterIP, @ShowCompanyLogo, @ShowHalalLogo, @TaxMode)
        END
      `);

    res.json({ success: true, message: "Settings saved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 DELETE Settings
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    await pool.request()
      .input("Id", sql.NVarChar, id)
      .query("DELETE FROM CompanySettings WHERE Id = @Id");
    res.json({ success: true, message: "Settings deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
