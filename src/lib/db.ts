import sql from "mssql";
import mysql from "mysql2/promise";

// MSSQL connection pool (bar_shop1)
const mssqlConfig: sql.config = {
  server: process.env.MSSQL_SERVER || "",
  port: parseInt(process.env.MSSQL_PORT || "1433"),
  user: process.env.MSSQL_USER || "",
  password: process.env.MSSQL_PASSWORD || "",
  database: process.env.MSSQL_DATABASE || "bar_shop1",
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let mssqlPool: sql.ConnectionPool | null = null;

export async function getMssqlPool(): Promise<sql.ConnectionPool> {
  if (!mssqlPool) {
    mssqlPool = await sql.connect(mssqlConfig);
  }
  return mssqlPool;
}

// MySQL connection pool (DD wedding)
let mysqlPool: mysql.Pool | null = null;

export function getMysqlPool(): mysql.Pool {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST || "",
      port: parseInt(process.env.MYSQL_PORT || "3306"),
      user: process.env.MYSQL_USER || "",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "wedding",
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return mysqlPool;
}
