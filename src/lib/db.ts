import sql from "mssql";

/**
 * Connection pool for bar_shop1 (Azure MSSQL).
 *
 * The DD wedding MySQL pool was removed: settlement / partner / login all
 * pull from bar_shop1 now, and the production network refuses connections
 * from outside-listed IPs to the DD MySQL host anyway. If DD wedding data
 * is needed again later, reintroduce a separate helper here rather than
 * leaving a dead `getMysqlPool` exported.
 */
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
  requestTimeout: 60000,
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
