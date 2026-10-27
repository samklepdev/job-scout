import { Pool, type PoolClient } from "pg";

const globalForPool = globalThis as unknown as { __jobScoutPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.__jobScoutPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
    globalForPool.__jobScoutPool = new Pool({ connectionString, max: 5 });
  }
  return globalForPool.__jobScoutPool;
}

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
