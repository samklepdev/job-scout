import "./env";
import { readFileSync } from "node:fs";
import { getPool } from "../src/lib/db";

const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const pool = getPool();
await pool.query(sql);
console.log("Database schema is up to date.");
await pool.end();
