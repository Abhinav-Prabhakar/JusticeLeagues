import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { openDatabase, DEFAULT_DB_PATH } from "./db";
import { runMigrations } from "./db/migrate";
import { seedIfEmpty } from "./db/seed";

/**
 * Local-only API + static host.
 *
 * Dev:  Vite (5173) proxies /api here (8787).
 * Prod: `npm run build && npm start` serves dist/ and the API from one origin.
 *
 * The database lives at `data/justice-leagues.db` (override with DB_PATH).
 */

const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;
const db = openDatabase(dbPath);

const applied = runMigrations(db);
const seeded = seedIfEmpty(db);

const app = createApp(db);
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  const dist = existsSync(`${process.cwd()}/dist`);
  console.log(`Justice Leagues listening on http://127.0.0.1:${info.port}`);
  console.log(`  database  ${dbPath}`);
  console.log(`  migrations ${applied.length ? applied.join(", ") : "up to date"}${seeded ? " · seeded" : ""}`);
  console.log(`  mode      ${dist ? "web + api" : "api only (run `npm run dev:web` for the UI)"}`);
});
