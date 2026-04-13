const express = require("express");
const router = express.Router();
const { poolPromise } = require("../config/db");

/* ================= AUTH - LOGIN ================= */
router.post("/login", async (req, res) => {
  try {
    const pool = await poolPromise;
    if (!pool) {
      return res.status(503).json({ success: false, message: "Database connection busy or unavailable." });
    }
    const { userName, password } = req.body;

    if (!userName || !password) {
      return res.status(400).json({ success: false, message: "User ID and Password are required." });
    }

    const result = await pool.request()
      .input("UserName", userName)
      .query(`
        SELECT 
          u.UserId, u.UserCode, u.UserName, u.UserPassword, u.FullName,
          u.FirstName, u.LastName, u.IsDisabled, u.UserGroupid,
          g.UserGroupCode AS RoleCode, g.UserGroupName AS RoleName
        FROM [dbo].[UserMaster] u
        LEFT JOIN [dbo].[UserGroupMaster] g ON u.UserGroupid = g.UserGroupId
        WHERE u.UserName = @UserName
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid User ID or Password." });
    }

    const user = result.recordset[0];

    if (user.IsDisabled === true || user.IsDisabled === 1) {
      return res.status(403).json({ success: false, message: "Your account is disabled." });
    }

    let storedPassword = "";
    try {
      storedPassword = Buffer.from(user.UserPassword, "base64").toString("utf8");
    } catch (e) {
      storedPassword = user.UserPassword;
    }

    if (storedPassword !== password) {
      return res.status(401).json({ success: false, message: "Invalid User ID or Password." });
    }

    await pool.request()
      .input("UserId", user.UserId)
      .query("UPDATE [dbo].[UserMaster] SET LastLogInDate = GETDATE() WHERE UserId = @UserId");

    console.log(`✅ Login: ${user.FullName || user.UserName}`);

    return res.json({
      success: true,
      user: {
        userId: user.UserId,
        userCode: user.UserCode,
        userName: user.UserName,
        fullName: user.FullName || user.FirstName || user.UserName,
        role: user.RoleCode || "CASHIER",
        roleName: user.RoleName || "Cashier",
      }
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

/* ================= AUTH - PERMISSIONS ================= */
router.get("/permissions/:userGroupCode", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { userGroupCode } = req.params;

    const result = await pool.request()
      .input("UserGroupCode", userGroupCode.trim())
      .query(`
        SELECT 
          LTRIM(RTRIM(FormCode)) AS FormCode,
          LTRIM(RTRIM(AllowAdd))    AS AllowAdd,
          LTRIM(RTRIM(AllowUpdate)) AS AllowUpdate,
          LTRIM(RTRIM(AllowDelete)) AS AllowDelete,
          LTRIM(RTRIM(AllowRead))   AS AllowRead
        FROM [dbo].[UserPermission]
        WHERE LTRIM(RTRIM(UserGroupCode)) = @UserGroupCode
      `);

    const permMap = {};
    for (const row of result.recordset) {
      if (row.FormCode) {
        permMap[row.FormCode] = {
          canAdd:    row.AllowAdd    === "A",
          canUpdate: row.AllowUpdate === "U",
          canDelete: row.AllowDelete === "D",
          canRead:   row.AllowRead   === "R",
        };
      }
    }
    res.json(permMap);
  } catch (err) {
    console.error("PERMISSIONS FETCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
