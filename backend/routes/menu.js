const express = require("express");
const router = express.Router();
const { poolPromise } = require("../config/db");

/* ================= KITCHENS / CATEGORIES ================= */
router.get("/kitchens", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT CategoryId, CategoryName AS KitchenTypeName
      FROM CategoryMaster WHERE IsActive = 1
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("KITCHEN ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/dishgroups/:CategoryId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("CategoryId", req.params.CategoryId)
      .query(`
        SELECT a.DishGroupId, a.DishGroupName
        FROM DishGroupMaster a
        JOIN CategoryMaster b ON a.CategoryId = b.CategoryId
        WHERE a.CategoryId = @CategoryId AND a.IsActive = 1
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* ================= DISHES ================= */
router.get("/dishes/all", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT d.DishId, d.Name, d.DishGroupId, ISNULL(p.Amount, 0) AS Price,
      d.Imageid, CASE WHEN i.Imageid IS NOT NULL THEN 1 ELSE 0 END AS HasImage
      FROM DishMaster d
      INNER JOIN DishPriceList p ON d.DishId = p.DishId
      LEFT JOIN ImageList i ON d.Imageid = i.Imageid
      WHERE d.IsActive = 1 ORDER BY d.Name ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get("/dishes/group/:DishGroupId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("DishGroupId", req.params.DishGroupId)
      .query(`
        SELECT d.DishId, d.Name, d.DishGroupId, ISNULL(p.Amount, 0) AS Price,
        d.Imageid, CASE WHEN i.Imageid IS NOT NULL THEN 1 ELSE 0 END AS HasImage
        FROM DishMaster d
        INNER JOIN DishPriceList p ON d.DishId = p.DishId
        LEFT JOIN ImageList i ON d.Imageid = i.Imageid
        WHERE d.IsActive = 1 AND d.DishGroupId = @DishGroupId ORDER BY d.Name ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* ================= IMAGES ================= */
router.get("/image/:imageId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input("Imageid", req.params.imageId)
      .query(`SELECT ImageData FROM ImageList WHERE Imageid = @Imageid`);

    if (result.recordset.length > 0 && result.recordset[0].ImageData) {
      res.type("image/jpeg").send(result.recordset[0].ImageData);
    } else {
      res.status(404).send("Image not found");
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= MODIFIERS ================= */
router.get("/modifiers/:dishId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input("dishId", req.params.dishId)
      .query(`
        SELECT dm.DishId, dm.ModifierId AS ModifierID, m.ModifierCode, m.ModifierName, 0 AS Price
        FROM DishModifier dm 
        INNER JOIN ModifierMaster m ON dm.ModifierId = m.ModifierId
        WHERE dm.DishId = @dishId ORDER BY m.ModifierName ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/modifiers/validate", async (req, res) => {
    try {
      const { dishId } = req.body;
      if (!dishId) return res.status(400).json({ valid: false, message: "Dish ID is required" });
      res.json({ valid: true, message: "Modifier selection is valid" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

module.exports = router;
