import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase, type Db } from "./index";

/**
 * Local operations, deliberately boring: a vacuumed copy on disk, a verified
 * restore, and one check command a cron job can run. No cloud, no daemon.
 */
const STARTED_AT = new Date().toISOString();
const BACKUP_PREFIXES = ["justice-leagues-", "pre-restore-"] as const;

export interface BackupInfo {
  file: string;
  path: string;
  bytes: number;
  createdAt: string;
  migrations: number;
  integrity: string;
}

export interface RestoreResult {
  restoredFrom: string;
  safetyBackup: string | null;
  migrations: number;
  integrity: string;
}

export interface OpsHealth {
  databaseBytes: number;
  walBytes: number;
  migrations: number;
  backupCount: number;
  latestBackupAt: string | null;
  latestBackupBytes: number;
  backupAgeHours: number | null;
  uptimeSeconds: number;
  node: string;
  startedAt: string;
}

export interface OpsCheck {
  ok: boolean;
  warnings: string[];
  integrity: string;
  foreignKeyViolations: number;
  migrations: number;
  counts: { profiles: number; leagues: number; shifts: number; ledger: number; errors: number };
  health: OpsHealth;
}

function backupsDir(dbPath: string): string {
  return path.join(path.dirname(path.resolve(dbPath)), "backups");
}

function isBackup(file: string): boolean {
  return file.endsWith(".db") && BACKUP_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Read a file's integrity report without touching its journal mode. */
export function verifyDatabase(file: string): { integrity: string; migrations: number } {
  if (!existsSync(file)) throw new Error(`No database at ${file}.`);
  const db = new DatabaseSync(file);
  try {
    const integrityRows = db.prepare("PRAGMA integrity_check").all() as unknown as { integrity_check: string }[];
    const integrity = integrityRows.map((row) => row.integrity_check).join("; ");
    const migrations = Number(
      (db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as { count: number } | undefined)?.count ?? 0,
    );
    return { integrity, migrations };
  } finally {
    db.close();
  }
}

export function listBackups(dbPath: string): BackupInfo[] {
  const dir = backupsDir(dbPath);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(isBackup)
    .map((file) => {
      const full = path.join(dir, file);
      const stat = statSync(full);
      let integrity = "unknown";
      let migrations = 0;
      try {
        ({ integrity, migrations } = verifyDatabase(full));
      } catch (error) {
        integrity = `unreadable: ${(error as Error).message}`;
      }
      return {
        file,
        path: full,
        bytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        migrations,
        integrity,
      } satisfies BackupInfo;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function latestBackup(dbPath: string): BackupInfo | null {
  return listBackups(dbPath)[0] ?? null;
}

/**
 * `VACUUM INTO` writes a consistent snapshot while the app is running, so a
 * backup never needs a maintenance window. Pruning keeps the last `keep`
 * snapshots (default 14).
 */
export function backupDatabase(
  db: Db,
  dbPath: string,
  options: { prefix?: string; keep?: number; outDir?: string } = {},
): BackupInfo {
  if (dbPath === ":memory:") throw new Error("An in-memory database has nothing to back up.");
  const outDir = options.outDir ?? backupsDir(dbPath);
  mkdirSync(outDir, { recursive: true });

  const prefix = options.prefix ?? "justice-leagues";
  const file = `${prefix}-${stamp()}-${Math.random().toString(36).slice(2, 7)}.db`;
  const target = path.join(outDir, file);

  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.prepare("VACUUM INTO ?").run(target);

  const { integrity, migrations } = verifyDatabase(target);
  if (integrity !== "ok") {
    rmSync(target, { force: true });
    throw new Error(`Backup integrity check failed: ${integrity}`);
  }

  const keep = Math.max(1, options.keep ?? 14);
  const snapshots = listBackups(dbPath);
  for (const extra of snapshots.slice(keep)) rmSync(extra.path, { force: true });

  const stat = statSync(target);
  return {
    file,
    path: target,
    bytes: stat.size,
    createdAt: stat.mtime.toISOString(),
    migrations,
    integrity,
  };
}

/**
 * Restore a snapshot. The live database is copied aside first, so a mistaken
 * restore is itself reversible. Stop the server before running this.
 */
export function restoreDatabase(
  dbPath: string,
  selector = "latest",
  options: { outDir?: string; keep?: number } = {},
): RestoreResult {
  let source: string | null;
  if (selector === "latest") {
    source = latestBackup(dbPath)?.path ?? null;
  } else {
    const candidate = path.resolve(selector);
    source = existsSync(candidate) ? candidate : null;
  }
  if (!source) throw new Error(`No backup found for "${selector}". Run \`npm run db:backup\` first.`);
  if (path.resolve(source) === path.resolve(dbPath)) throw new Error("That is the live database, not a backup.");

  const verified = verifyDatabase(source);
  if (verified.integrity !== "ok") throw new Error(`Backup integrity check failed: ${verified.integrity}`);

  let safetyBackup: string | null = null;
  if (existsSync(dbPath)) {
    const current = openDatabase(dbPath);
    try {
      safetyBackup = backupDatabase(current, dbPath, {
        prefix: "pre-restore",
        outDir: options.outDir,
        keep: options.keep,
      }).path;
    } finally {
      current.close();
    }
  }

  copyFileSync(source, dbPath);
  for (const suffix of ["-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });

  const restored = verifyDatabase(dbPath);
  return {
    restoredFrom: source,
    safetyBackup,
    migrations: restored.migrations,
    integrity: restored.integrity,
  };
}

export function opsHealth(db: Db, dbPath: string): OpsHealth {
  const databaseBytes = existsSync(dbPath) ? statSync(dbPath).size : 0;
  const walPath = `${dbPath}-wal`;
  const walBytes = existsSync(walPath) ? statSync(walPath).size : 0;
  const migrations = Number(
    (db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as { count: number } | undefined)?.count ?? 0,
  );
  const backups = listBackups(dbPath);
  const latest = backups[0] ?? null;
  return {
    databaseBytes,
    walBytes,
    migrations,
    backupCount: backups.length,
    latestBackupAt: latest?.createdAt ?? null,
    latestBackupBytes: latest?.bytes ?? 0,
    backupAgeHours: latest
      ? Math.round(((Date.now() - new Date(latest.createdAt).getTime()) / 3600_000) * 10) / 10
      : null,
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    startedAt: STARTED_AT,
  };
}

export function checkDatabase(db: Db, dbPath: string): OpsCheck {
  const integrityRows = db.prepare("PRAGMA integrity_check").all() as unknown as { integrity_check: string }[];
  const integrity = integrityRows.map((row) => row.integrity_check).join("; ");
  const foreignKeyViolations = (db.prepare("PRAGMA foreign_key_check").all() as unknown[]).length;
  const health = opsHealth(db, dbPath);
  const counts = {
    profiles: Number((db.prepare("SELECT COUNT(*) AS n FROM profiles").get() as { n: number }).n),
    leagues: Number((db.prepare("SELECT COUNT(*) AS n FROM leagues").get() as { n: number }).n),
    shifts: Number((db.prepare("SELECT COUNT(*) AS n FROM shifts").get() as { n: number }).n),
    ledger: Number((db.prepare("SELECT COUNT(*) AS n FROM points_ledger").get() as { n: number }).n),
    errors: Number(
      (db.prepare("SELECT COUNT(*) AS n FROM error_reports WHERE resolved_at IS NULL").get() as { n: number }).n,
    ),
  };

  const warnings: string[] = [];
  if (!health.backupCount) warnings.push("No backup yet. Run `npm run db:backup`.");
  else if ((health.backupAgeHours ?? Infinity) > 48) {
    warnings.push(`The latest backup is ${Math.round(health.backupAgeHours ?? 0)}h old. Run the daily backup job.`);
  }
  if (counts.errors > 0) warnings.push(`${counts.errors} unresolved client error${counts.errors === 1 ? "" : "s"}.`);
  if (health.walBytes > 100 * 1024 * 1024) warnings.push(`The WAL file is ${Math.round(health.walBytes / 1_048_576)} MB.`);
  if (health.migrations === 0) warnings.push("No migrations are recorded; restore or rebuild the database.");

  return {
    ok: integrity === "ok" && foreignKeyViolations === 0 && health.migrations > 0,
    warnings,
    integrity,
    foreignKeyViolations,
    migrations: health.migrations,
    counts,
    health,
  };
}

export function openForOps(dbPath: string): Db {
  return openDatabase(dbPath);
}
