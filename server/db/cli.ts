import { rmSync } from "node:fs";
import path from "node:path";
import { DEFAULT_DB_PATH, openDatabase } from "./index";
import { runMigrations } from "./migrate";
import { ensurePhase3, ensurePhase4, ensurePhase5, seedIfEmpty } from "./seed";

/**
 * `npm run db:reset` — throw the local database away and rebuild it.
 * `npm run db:seed`  — apply migrations and seed only if empty.
 */
const command = process.argv[2] ?? "seed";
const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;

if (command === "reset") {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
  console.log(`removed ${path.relative(process.cwd(), dbPath)}`);
}

const db = openDatabase(dbPath);
const applied = runMigrations(db);
const seeded = seedIfEmpty(db);
const { inserted } = ensurePhase3(db);
const { indexed } = ensurePhase4(db);
const { flags } = ensurePhase5(db);
db.close();

console.log(`${command}: ${applied.length ? `applied ${applied.join(", ")}` : "migrations up to date"}`);
console.log(`${command}: ${seeded ? "seeded the edition" : "already seeded"}`);
console.log(`${command}: ${inserted ? `materialised ${inserted} sealed ledger rows` : "ledger already materialised"}`);
console.log(`${command}: ${indexed} leagues indexed for search`);
console.log(`${command}: ${flags} feature flags in place`);
console.log(`${command}: ${dbPath}`);
