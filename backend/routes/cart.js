const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");

/**
 * GET Cart Items
 * Fetches all items for a given CartId (e.g. TableId or TakeawayId)
 */
router.get("/:cartId", async (req, res) => {
  try {
    const { cartId } = req.params;
    const pool = await poolPromise;
    
    // Joint query with DishMaster to get name and image if needed
    const result = await pool.request()
      .input("cartId", sql.VarChar(100), cartId)
      .query(`
        SELECT c.*, d.Name as ProductName
        FROM CartItems c
        LEFT JOIN DishMaster d ON c.ProductId = d.DishId
        WHERE c.CartId = @cartId
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error("GET CART ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST Add to Cart
 * Upsert logic: if combination of CartId and ProductId exists, increment Qty.
 */
router.post("/add", async (req, res) => {
  try {
    const { cartId, productId, quantity, cost, orderNo, mobileNo } = req.body;
    
    if (!cartId || !productId) {
      return res.status(400).json({ error: "cartId and productId are required" });
    }

    const pool = await poolPromise;
    
    // Check if item already exists in this cart
    const check = await pool.request()
      .input("cartId", sql.VarChar(100), cartId)
      .input("productId", sql.UniqueIdentifier, productId)
      .query(`SELECT ItemId, Quantity FROM CartItems WHERE CartId = @cartId AND ProductId = @productId`);

    if (check.recordset.length > 0) {
      // Update existing
      await pool.request()
        .input("itemId", sql.Int, check.recordset[0].ItemId)
        .input("qty", sql.Int, (quantity || 1))
        .query(`UPDATE CartItems SET Quantity = Quantity + @qty WHERE ItemId = @itemId`);
    } else {
      // Insert new
      await pool.request()
        .input("cartId", sql.VarChar(100), cartId)
        .input("productId", sql.UniqueIdentifier, productId)
        .input("qty", sql.Int, quantity || 1)
        .input("cost", sql.Decimal(18, 2), cost || 0)
        .input("orderNo", sql.NVarChar(50), orderNo || null)
        .input("mobileNo", sql.NVarChar(20), mobileNo || null)
        .query(`
          INSERT INTO CartItems (CartId, ProductId, Quantity, Cost, OrderNo, MobileNo, DateCreated)
          VALUES (@cartId, @productId, @qty, @cost, @orderNo, @mobileNo, GETDATE())
        `);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("ADD TO CART ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE Remove from Cart
 */
router.delete("/remove/:itemId", async (req, res) => {
    try {
      const { itemId } = req.params;
      const pool = await poolPromise;
      
      await pool.request()
        .input("itemId", sql.Int, itemId)
        .query(`DELETE FROM CartItems WHERE ItemId = @itemId`);
        
      res.json({ success: true });
    } catch (err) {
      console.error("REMOVE FROM CART ERROR:", err);
      res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE Clear Cart
 */
router.delete("/clear/:cartId", async (req, res) => {
  try {
    const { cartId } = req.params;
    const pool = await poolPromise;
    
    await pool.request()
      .input("cartId", sql.VarChar(100), cartId)
      .query(`DELETE FROM CartItems WHERE CartId = @cartId`);
      
    res.json({ success: true });
  } catch (err) {
    console.error("CLEAR CART ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
