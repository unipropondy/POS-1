const path = require("path");
// Adjust path to root of backend folder where .env is located
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const sql = require("mssql");

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 60000, 
    requestTimeout: 60000,
    appName: "POS_System"
  },
  connectionTimeout: 60000,
  requestTimeout: 60000,
};

let poolInstance = null;

const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then((pool) => {
    console.log("✅ Connected to MSSQL Successfully");
    poolInstance = pool;
    return pool;
  })
  .catch((err) => {
    console.error("❌ Database Connection Failed:", err.message);
    return null;
  });

module.exports = { 
    sql, 
    poolPromise, 
    dbConfig,
    getPool: () => poolInstance 
};
