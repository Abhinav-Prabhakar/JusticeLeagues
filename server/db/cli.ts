import { rmSync } from "node:fs";
import path from "node:path";
import { DEFAULT_DB_PATH, openDatabase } from "./index";
import { runMigrations } from "./migrate";
import { ensurePhase3, ensurePhase4, ensurePhase5, ensurePhase6, seedIfEmpty } from "./seed";
import { backupDatabase, checkDatabase, restoreDatabase } from "./ops";

/**
 * `npm run db:reset`   — throw the local database away and rebuild it.
 * `npm run db:seed`    — apply migrations and seed only if empty.
 * `npm run db:backup`  — write a verified `VACUUM INTO` snapshot.
 * `npm run db:restore` — restore a snapshot (latest by default).
 * `npm run ops:check`  — integrity, migrations, backups, and open errors.
 */
const command = process.argv[2] ?? "seed";
const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;

if (command === "restore") {
  const selector = process.argv[3] ?? "latest";
  const result = restoreDatabase(dbPath, selector);
  console.log(`restore: from ${result.restoredFrom}`);
  console.log(`restore: integrity ${result.integrity} · ${result.migrations} migrations`);
  if (result.safetyBackup) console.log(`restore: previous database kept at ${result.safetyBackup}`);
  process.exit(0);
}

if (command === "reset") {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
  console.log(`removed ${path.relative(process.cwd(), dbPath)}`);
}

const db = openDatabase(dbPath);

if (command === "backup") {
  const result = backupDatabase(db, dbPath);
  db.close();
  console.log(`backup: ${result.path}`);
  console.log(
    `backup: ${(result.bytes / 1024).toFixed(1)} KB · ${result.migrations} migrations · integrity ${result.integrity}`,
  );
  process.exit(0);
}

if (command === "check") {
  const result = checkDatabase(db, dbPath);
  db.close();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

const applied = runMigrations(db);
const seeded = seedIfEmpty(db);
const { inserted } = ensurePhase3(db);
const { indexed } = ensurePhase4(db);
const { flags } = ensurePhase5(db);
const pruned = ensurePhase6(db);
db.close();

console.log(`${command}: ${applied.length ? `applied ${applied.join(", ")}` : "migrations up to date"}`);
console.log(`${command}: ${seeded ? "seeded the edition" : "already seeded"}`);
console.log(`${command}: ${inserted ? `materialised ${inserted} sealed ledger rows` : "ledger already materialised"}`);
console.log(`${command}: ${indexed} leagues indexed for search`);
console.log(`${command}: ${flags} feature flags in place`);
console.log(`${command}: pruned ${pruned.events} old page events and ${pruned.errors} resolved errors`);
console.log(`${command}: ${dbPath}`);
