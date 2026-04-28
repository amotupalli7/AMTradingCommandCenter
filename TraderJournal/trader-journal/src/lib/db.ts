import { Pool, QueryResultRow } from "pg";

declare global {
  var __pgPool: Pool | undefined;
}

function makePool(): Pool {
  return new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT ? parseInt(process.env.PG_PORT, 10) : 5432,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DB || "trades_db",
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}

export const pool: Pool =
  global.__pgPool ?? (global.__pgPool = makePool());

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows;
}
