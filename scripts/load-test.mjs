/**
 * A local load and race drill. It never touches the real database:
 *
 *   npm run load
 *
 * The script starts a second API on `data/load.db` (:8790), fills a shift's
 * last spots from many connections at once, checks that the waitlist absorbed
 * the overflow, then reads the leaderboard hard and reports latency.
 *
 * Override the edges with LOAD_PORT, LOAD_DB, or LOAD_REQUESTS.
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const port = Number(process.env.LOAD_PORT ?? 8790);
const dbPath = path.resolve(root, process.env.LOAD_DB ?? "data/load.db");
const origin = `http://127.0.0.1:${port}`;
const password = "correct horse battery";
const readRequests = Number(process.env.LOAD_REQUESTS ?? 200);
const readConcurrency = Number(process.env.LOAD_CONCURRENCY ?? 25);

function removeDatabase() {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
}

function fail(message) {
  console.error(`\nFAIL  ${message}`);
  process.exitCode = 1;
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

async function waitForHealth(child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`The load server exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("The load server did not become healthy within 60s.");
}

async function json(response) {
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

async function register(index) {
  const response = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${index % 250}` },
    body: JSON.stringify({
      displayName: `Load Neighbour ${index}`,
      email: `load-${index}-${Date.now()}@example.invalid`,
      password,
      causes: ["climate"],
      ageConfirmed: true,
    }),
  });
  if (!response.ok) throw new Error(`register ${index}: ${response.status} ${await response.text()}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`register ${index}: no session cookie`);
  const { me } = await json(response);
  return { cookie, profileId: me.profile.id };
}

async function timed(pathname, cookie) {
  const started = performance.now();
  const response = await fetch(`${origin}${pathname}`, { headers: cookie ? { cookie } : {} });
  const ms = performance.now() - started;
  if (!response.ok) throw new Error(`${pathname}: ${response.status} ${await response.text()}`);
  await response.arrayBuffer();
  return ms;
}

async function inBatches(items, size, run) {
  const results = [];
  for (let start = 0; start < items.length; start += size) {
    results.push(...(await Promise.all(items.slice(start, start + size).map(run))));
  }
  return results;
}

async function main() {
  removeDatabase();
  const child = spawn(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "server/index.ts"], {
    cwd: root,
    env: { ...process.env, DB_PATH: dbPath, PORT: String(port), LOG_LEVEL: "error" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForHealth(child);
    console.log(`load server ready at ${origin} (${path.relative(root, dbPath)})`);

    const edition = await json(await fetch(`${origin}/api/edition`));
    const shifts = edition.shifts ?? [];
    const target = shifts
      .map((shift) => ({ ...shift, free: shift.spots - shift.filled }))
      .filter((shift) => shift.free > 0)
      .sort((a, b) => b.free - a.free)[0];
    if (!target) throw new Error("No seeded shift has an open spot; the load drill needs a fresh database.");

    const overflow = 8;
    const people = target.free + overflow;
    console.log(`shift "${target.title}" (${target.id}); ${target.free} open, ${people} volunteers racing`);

    const accounts = await inBatches(Array.from({ length: people }, (_, index) => index), 5, register);
    const started = performance.now();
    const outcomes = await Promise.all(
      accounts.map(async (account) => {
        const response = await fetch(`${origin}/api/shifts/${target.id}/signup`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: account.cookie },
          body: "{}",
        });
        if (!response.ok) throw new Error(`signup: ${response.status} ${await response.text()}`);
        return { ...(await response.json()), profileId: account.profileId, cookie: account.cookie };
      }),
    );
    const elapsed = Math.round(performance.now() - started);

    const signedUp = outcomes.filter((outcome) => outcome.status === "signed_up");
    const waitlisted = outcomes.filter((outcome) => outcome.status === "waitlisted");
    console.log(
      `race: ${signedUp.length} claimed · ${waitlisted.length} waitlisted · ${elapsed}ms for ${people} requests`,
    );
    if (signedUp.length !== target.free) fail(`expected ${target.free} signups, got ${signedUp.length}`);
    if (waitlisted.length !== overflow) fail(`expected ${overflow} waitlisted, got ${waitlisted.length}`);

    const duplicate = await json(
      await fetch(`${origin}/api/shifts/${target.id}/signup`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: signedUp[0].cookie },
        body: "{}",
      }),
    );
    console.log(`duplicate signup: ${duplicate.status}`);
    if (duplicate.status !== "already") fail(`duplicate signup returned ${duplicate.status}`);

    const reads = Array.from({ length: readRequests }, () => "/api/standings?scope=global&limit=50");
    const timings = (await inBatches(reads, readConcurrency, (pathname) => timed(pathname))).sort((a, b) => a - b);
    console.log(
      `leaderboard: ${timings.length} reads · p50 ${percentile(timings, 0.5).toFixed(1)}ms · p95 ${percentile(
        timings,
        0.95,
      ).toFixed(1)}ms · max ${timings.at(-1)?.toFixed(1)}ms`,
    );
    if (percentile(timings, 0.95) > 500) fail("leaderboard p95 exceeded the 500ms local budget");

    const editorLogin = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@justiceleagues.local", password: "millbrook" }),
    });
    const editorCookie = editorLogin.headers.get("set-cookie")?.split(";")[0];
    const pulse = await json(
      await fetch(`${origin}/api/admin/pulse?days=28`, {
        headers: editorCookie ? { cookie: editorCookie } : {},
      }),
    );
    console.log(`pulse: ${pulse.funnel.map((stage) => `${stage.count}`).join(" → ")} · ${pulse.health.migrations} migrations`);
    const registered = pulse.funnel.find((stage) => stage.key === "register")?.count ?? 0;
    if (registered < people) fail(`the funnel recorded ${registered} accounts, expected at least ${people}`);

    // Stop the server before looking at the file, so the WAL is checkpointed.
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 5_000);
    });

    if (existsSync(dbPath)) {
      const db = new DatabaseSync(dbPath);
      try {
        const active = Number(
          (
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM shift_signups WHERE shift_id = ? AND status IN ('reserved','confirmed','attended')",
              )
              .get(target.id) ?? { count: 0 }
          ).count,
        );
        const waiting = Number(
          (
            db
              .prepare("SELECT COUNT(*) AS count FROM shift_signups WHERE shift_id = ? AND status = 'waitlist'")
              .get(target.id) ?? { count: 0 }
          ).count,
        );
        const integrity = (db.prepare("PRAGMA integrity_check").get() ?? { integrity_check: "unknown" }).integrity_check;
        console.log(`database: ${active} reserved · ${waiting} waitlist · integrity ${integrity}`);
        if (active !== target.free) fail(`database holds ${active} reserved spots, expected ${target.free}`);
        if (waiting !== overflow) fail(`database holds ${waiting} waitlisted, expected ${overflow}`);
        if (integrity !== "ok") fail(`database integrity check returned ${integrity}`);
      } finally {
        db.close();
      }
    }

    if (stderr.trim()) console.log(`server stderr: ${stderr.trim().split("\n").slice(-5).join("\n")}`);
    console.log(process.exitCode ? "\nload drill failed" : "\nload drill passed");
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    removeDatabase();
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  removeDatabase();
});
