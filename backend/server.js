const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const { poolPromise } = require("./config/db");
const { initDB } = require("./config/init");
const dbCheck = require("./middleware/dbCheck");

// Import Routes
const authRoutes = require("./routes/auth");
const tableRoutes = require("./routes/tables");
const menuRoutes = require("./routes/menu");
const salesRoutes = require("./routes/sales");
const memberRoutes = require("./routes/members");
const attendanceRoutes = require("./routes/attendance");
const adminRoutes = require("./routes/admin");
const orderRoutes = require("./routes/orders");
const serverRoutes = require("./routes/servers");
const settingsRoutes = require("./routes/settings");
const companySettingsRoutes = require("./routes/companySettings");
const uploadRoutes = require("./routes/upload");

const http = require("http");
const { Server } = require("socket.io");

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

// Expose io to routes
app.set("io", io);

// Socket.io Connection
io.on("connection", (socket) => {
  console.log("🔌 New client connected:", socket.id);

  // Broadcast new orders to other clients (e.g. KDS screens)
  socket.on("new_order", (data) => {
    console.log("📦 [Server] New order event received:", data.orderId);
    socket.broadcast.emit("new_order", data);
  });

  // Broadcast status updates (e.g. order completed, items voided)
  socket.on("order_status_update", (data) => {
    console.log("🔄 [Server] Order status update received:", data.orderId);
    socket.broadcast.emit("order_status_update", data);
  });

  socket.on("disconnect", () => {
    console.log("🔌 Client disconnected:", socket.id);
  });
});

// ✅ Global Middleware
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 🔄 Database Connection Check (for all API routes)
app.use("/api", dbCheck);

/* ================= ROUTES ================= */
app.use("/api/auth", authRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/reports", salesRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/servers", serverRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/company-settings", companySettingsRoutes);
app.use("/api/upload", uploadRoutes);

// Root Endpoints
app.get("/", (req, res) => res.send("POS Backend Modular Running"));
app.get("/test", (req, res) => res.send("TEST OK"));

// Legacy support (redirects to ensure existing frontend calls don't break)
app.post("/api/checkout", (req, res) =>
  res.redirect(307, "/api/orders/checkout"),
);
app.get("/tables", (req, res) => res.redirect("/api/tables/all"));
app.get("/kitchens", (req, res) => res.redirect("/api/menu/kitchens"));
app.get("/dishgroups/:id", (req, res) =>
  res.redirect(`/api/menu/dishgroups/${req.params.id}`),
);
app.get("/dishes/:id", (req, res) =>
  res.redirect(`/api/menu/dishes/group/${req.params.id}`),
);
app.get("/api/dishes/all", (req, res) => res.redirect("/api/menu/dishes/all"));
app.get("/api/discounts", (req, res) => res.redirect("/api/admin/discounts"));
app.get("/modifiers/:id", (req, res) =>
  res.redirect(`/api/menu/modifiers/${req.params.id}`),
);
app.get("/image/:id", (req, res) =>
  res.redirect(`/api/menu/image/${req.params.id}`),
);

/* ================= START SERVER ================= */
httpServer.listen(PORT, async () => {
  console.log(`🚀 Modular Server running on port ${PORT}`);

  try {
    const pool = await poolPromise;
    if (pool) {
      await initDB(pool);
      // ✅ One-time migration: Fix any active tables with NULL StartTime
      await pool.request().query("UPDATE TableMaster SET StartTime = GETDATE() WHERE StartTime IS NULL AND Status IN (1, 2, 3, 4)");
      console.log("✅ Database initialized and ready.");
    }
  } catch (err) {
    console.error("⚠️ Initial DB setup failed:", err.message);
  }
});
