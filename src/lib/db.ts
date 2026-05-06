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
  // mssql defaults requestTimeout to 15s — too tight for the settlement
  // queries when the user widens the date range to multi-month or year+.
  // 60s gives the optimizer enough headroom on the larger result sets
  // (the page itself still uses OFFSET/FETCH, so wire payload stays bounded).
  // connectionTimeout left at default (15s) since DB connect should be fast.
  requestTimeout: 60000,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  connectionTimeout: 60000,
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
