import "../scripts/env";

/**
 * DB tests delete rows, so they only ever run against TEST_DATABASE_URL — never your real DATABASE_URL.
 * Import this before anything that touches the pool.
 */
export const skipDb = !process.env.TEST_DATABASE_URL;
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
