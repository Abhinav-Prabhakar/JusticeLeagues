import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

export const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data/justice-leagues.db");

/** Open (and create) the local database with the pragmas we rely on. */
export function openDatabase(file: string = process.env.DB_PATH ?? DEFAULT_DB_PATH): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  return db;
}

/**
 * Run a unit of work in a write transaction. BEGIN IMMEDIATE takes the write
 * lock up front, which is what keeps capacity checks from overselling.
 */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export const nowIso = () => new Date().toISOString();

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}
