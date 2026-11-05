import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { openDatabase, DEFAULT_DB_PATH } from "./db";
import { runMigrations } from "./db/migrate";
import { ensurePhase3, ensurePhase4, ensurePhase5, ensurePhase6, seedIfEmpty } from "./db/seed";
import { errorFields, logger } from "./log";

/**
 * Local-only API + static host.
 *
 * Dev:  Vite (5173) proxies /api here (8787).
 * Prod: `npm run build && npm start` serves dist/ and the API from one origin.
 *
 * The database lives at `data/justice-leagues.db` (override with DB_PATH).
 * Logs are JSON lines on stdout; set LOG_FILE to append them to disk.
 */

const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;
const db = openDatabase(dbPath);

const applied = runMigrations(db);
const seeded = seedIfEmpty(db);
const { inserted } = ensurePhase3(db);
const { indexed } = ensurePhase4(db);
const { flags, editor } = ensurePhase5(db);
const pruned = ensurePhase6(db);

const app = createApp(db);
const port = Number(process.env.PORT ?? 8787);

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info("server.ready", {
    url: `http://127.0.0.1:${info.port}`,
    database: dbPath,
    migrations: applied,
    seeded,
    sealedLedgerRows: inserted,
    indexedLeagues: indexed,
    editorDesk: editor,
    featureFlags: flags,
    prunedEvents: pruned.events,
    prunedErrors: pruned.errors,
    mode: existsSync(`${process.cwd()}/dist`) ? "web + api" : "api only",
  });
});

let closing = false;
function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  logger.info("server.stopping", { signal });
  server.close(() => {
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.close();
    } catch (error) {
      logger.warn("server.close_failed", errorFields(error));
    }
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("server.stop_timeout", { signal });
    process.exit(1);
  }, 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => logger.error("process.unhandled_rejection", errorFields(reason)));
process.on("uncaughtException", (error) => {
  logger.error("process.uncaught_exception", errorFields(error));
  shutdown("uncaughtException");
});
