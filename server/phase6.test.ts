// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase, type Db } from "./db";
import { runMigrations } from "./db/migrate";
import { ensurePhase3, ensurePhase4, ensurePhase5, ensurePhase6, seedIfEmpty } from "./db/seed";
import { backupDatabase, checkDatabase, listBackups, restoreDatabase, verifyDatabase } from "./db/ops";
import { pulseMetrics } from "./db/pulse";

let db: Db;
let app: ReturnType<typeof createApp>;

async function post(path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function del(path: string, cookie?: string) {
  return app.request(path, { method: "DELETE", headers: cookie ? { cookie } : {} });
}

async function get(path: string, cookie?: string) {
  return app.request(path, { headers: cookie ? { cookie } : {} });
}

async function register(email: string, displayName = "Phase Six", extra: Record<string, unknown> = {}) {
  const response = await post("/api/auth/register", {
    displayName,
    email,
    password: "correct horse battery",
    causes: ["climate"],
    ageConfirmed: true,
    ...extra,
  });
  expect(response.status, await response.clone().text()).toBe(201);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const payload = (await response.clone().json()) as { me: { profile: { id: string } } };
  return { response, cookie, profileId: payload.me.profile.id };
}

async function login(email: string, password = "millbrook") {
  const response = await post("/api/auth/login", { email, password });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

const EDITOR = "admin@justiceleagues.local";
const STEWARD = "steward.harbor.1@justiceleagues.local";

function activeSignups(shiftId: string): number {
  return Number(
    (
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM shift_signups WHERE shift_id = ? AND status IN ('reserved','confirmed','attended')",
        )
        .get(shiftId) as { count: number }
    ).count,
  );
}

function signupStatus(shiftId: string, profileId: string): string | null {
  const row = db.prepare("SELECT status FROM shift_signups WHERE shift_id = ? AND profile_id = ?").get(shiftId, profileId) as
    | { status: string }
    | undefined;
  return row?.status ?? null;
}

beforeEach(() => {
  db = openDatabase(":memory:");
  runMigrations(db);
  seedIfEmpty(db);
  ensurePhase3(db);
  ensurePhase4(db);
  ensurePhase5(db);
  ensurePhase6(db);
  app = createApp(db);
});

describe("shift capacity under pressure", () => {
  it("never sells the last spot twice and waitlists the overflow", async () => {
    // s11 (Harbor, capacity 8, two already filled) is trimmed to one open spot.
    db.prepare("UPDATE shifts SET capacity = 3, base_filled = 2 WHERE id = 's11'").run();

    const [ada, grace] = await Promise.all([
      register("ada@example.com", "Ada"),
      register("grace@example.com", "Grace"),
    ]);

    const responses = await Promise.all([
      post("/api/shifts/s11/signup", {}, ada.cookie),
      post("/api/shifts/s11/signup", {}, grace.cookie),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);

    const statuses = (await Promise.all(responses.map((response) => response.json()))).map(
      (body) => (body as { status: string }).status,
    );
    expect(statuses.sort()).toEqual(["signed_up", "waitlisted"]);
    expect(activeSignups("s11")).toBe(1);

    const waitlisted = db
      .prepare("SELECT COUNT(*) AS count FROM shift_signups WHERE shift_id = 's11' AND status = 'waitlist'")
      .get() as { count: number };
    expect(Number(waitlisted.count)).toBe(1);
  });

  it("treats a duplicate signup as idempotent", async () => {
    const ada = await register("ada@example.com", "Ada");

    const first = await post("/api/shifts/s11/signup", {}, ada.cookie);
    const second = await post("/api/shifts/s11/signup", {}, ada.cookie);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(((await first.json()) as { status: string }).status).toBe("signed_up");
    expect(((await second.json()) as { status: string }).status).toBe("already");

    const rows = db.prepare("SELECT COUNT(*) AS count FROM shift_signups WHERE shift_id = 's11'").get() as {
      count: number;
    };
    expect(Number(rows.count)).toBe(1);
  });

  it("promotes the earliest waitlisted volunteer when a spot opens", async () => {
    db.prepare("UPDATE shifts SET capacity = 3, base_filled = 2 WHERE id = 's11'").run();

    const ada = await register("ada@example.com", "Ada");
    const grace = await register("grace@example.com", "Grace");
    const kai = await register("kai@example.com", "Kai");

    await post("/api/shifts/s11/signup", {}, ada.cookie);
    const graceSignup = (await (await post("/api/shifts/s11/signup", {}, grace.cookie)).json()) as { position: number };
    const kaiSignup = (await (await post("/api/shifts/s11/signup", {}, kai.cookie)).json()) as { position: number };
    expect(graceSignup.position).toBe(1);
    expect(kaiSignup.position).toBe(2);

    const cancelled = await del("/api/shifts/s11/signup", ada.cookie);
    expect(((await cancelled.json()) as { promoted: boolean }).promoted).toBe(true);

    expect(signupStatus("s11", grace.profileId)).toBe("reserved");
    expect(signupStatus("s11", kai.profileId)).toBe("waitlist");
    expect(activeSignups("s11")).toBe(1);

    const notice = db
      .prepare("SELECT title FROM notifications WHERE profile_id = ? AND kind = 'promotion'")
      .get(grace.profileId) as { title: string } | undefined;
    expect(notice?.title).toMatch(/off the waitlist/i);
  });

  it("refuses a cancelled shift and keeps the ledger untouched by capacity churn", async () => {
    const steward = await login(STEWARD);
    const created = await post(
      "/api/leagues/harbor/shifts",
      {
        chapterId: "ch_harbor",
        title: "Last-minute drain sweep",
        day: 2,
        time: "09:00",
        duration: "2h",
        capacity: 1,
        place: "Dock 4",
        bring: ["gloves"],
      },
      steward,
    );
    expect(created.status, await created.clone().text()).toBe(201);
    const shift = (await created.json()) as { id: string };

    const ada = await register("ada@example.com", "Ada");
    const grace = await register("grace@example.com", "Grace");
    expect(((await (await post(`/api/shifts/${shift.id}/signup`, {}, ada.cookie)).json()) as { status: string }).status).toBe(
      "signed_up",
    );
    expect(
      ((await (await post(`/api/shifts/${shift.id}/signup`, {}, grace.cookie)).json()) as { status: string }).status,
    ).toBe("waitlisted");

    const cancelled = await del(`/api/shifts/${shift.id}`, steward);
    expect(cancelled.status).toBe(200);
    const late = await post(`/api/shifts/${shift.id}/signup`, {}, grace.cookie);
    expect(late.status).toBe(409);
  });
});

describe("the private pulse", () => {
  it("only accepts allowlisted page names", async () => {
    expect((await post("/api/pulse", { name: "home_view", path: "/" })).status).toBe(202);
    expect((await post("/api/pulse", { name: "not_a_page", path: "/" })).status).toBe(400);
    expect((await post("/api/pulse", {})).status).toBe(400);
  });

  it("turns page views and server-authored actions into one funnel", async () => {
    await post("/api/pulse", { name: "atlas_view", path: "/leagues" });
    await post("/api/pulse", { name: "atlas_view", path: "/leagues" });
    await post("/api/pulse", { name: "league_view", path: "/leagues/harbor" });
    const ada = await register("ada@example.com", "Ada");
    await post("/api/leagues/harbor/join", {}, ada.cookie);
    await post("/api/shifts/s11/signup", {}, ada.cookie);

    const editor = await login(EDITOR);
    const response = await get("/api/admin/pulse?days=28", editor);
    expect(response.status, await response.clone().text()).toBe(200);
    const pulse = (await response.json()) as ReturnType<typeof pulseMetrics> & {
      health: { migrations: number; backupCount: number };
      errors: unknown[];
      notes: unknown[];
    };

    expect(pulse.windowDays).toBe(28);
    expect(pulse.homeViews).toBe(0);
    expect(pulse.funnel.map((stage) => stage.key)).toEqual([
      "atlas_view",
      "league_view",
      "register",
      "join",
      "signup",
      "attend",
    ]);
    const atlas = pulse.funnel[0];
    expect(atlas.count).toBe(2);
    expect(pulse.funnel[1].count).toBe(1);
    expect(pulse.funnel[1].conversion).toBe(0.5);
    expect(pulse.pilots.length).toBeGreaterThan(0);
    expect(pulse.integrity.ledgerRows).toBeGreaterThan(0);
    expect(pulse.health.migrations).toBeGreaterThan(0);
    expect(Array.isArray(pulse.errors)).toBe(true);
    expect(Array.isArray(pulse.notes)).toBe(true);
  });

  it("keeps the desk to the editor and the window honest", async () => {
    const ada = await register("ada@example.com", "Ada");
    expect((await get("/api/admin/pulse", ada.cookie)).status).toBe(403);
    expect((await get("/api/admin/pulse")).status).toBe(401);

    const editor = await login(EDITOR);
    expect((await get("/api/admin/pulse?days=0", editor)).status).toBe(400);
    expect((await get("/api/admin/pulse?days=999", editor)).status).toBe(400);
  });
});

describe("the crash desk", () => {
  it("records a client crash without an account and shows it to the editor", async () => {
    const created = await post("/api/errors", {
      message: "Cannot read properties of undefined (reading 'chapter')",
      component: "at LeagueHeader",
      path: "/leagues/harbor",
      stack: "TypeError: ...",
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(id).toMatch(/^err_/);

    expect((await post("/api/errors", { message: "" })).status).toBe(400);

    const editor = await login(EDITOR);
    const queue = await get("/api/admin/errors?open=1", editor);
    expect(queue.status).toBe(200);
    const { errors } = (await queue.json()) as { errors: { id: string; path: string }[] };
    expect(errors.some((report) => report.id === id && report.path === "/leagues/harbor")).toBe(true);

    const resolved = await post(`/api/admin/errors/${id}/resolve`, {}, editor);
    expect(resolved.status).toBe(200);
    expect((await get("/api/admin/errors?open=1", editor).then((response) => response.json())) as unknown).toMatchObject({
      errors: [],
    });
    expect((await post(`/api/admin/errors/${id}/resolve`, {}, editor)).status).toBe(404);

    const ada = await register("ada@example.com", "Ada");
    expect((await get("/api/admin/errors", ada.cookie)).status).toBe(403);
  });

  it("rejects an oversized trace instead of storing it", async () => {
    expect((await post("/api/errors", { message: "x".repeat(600) })).status).toBe(400);
    expect((await post("/api/errors", { message: "Fine", stack: "s".repeat(9_000) })).status).toBe(400);
    expect((db.prepare("SELECT COUNT(*) AS count FROM error_reports").get() as { count: number }).count).toBe(0);
  });
});

describe("pilot notes and retention", () => {
  it("files a weekly note for the editor only", async () => {
    const editor = await login(EDITOR);
    const created = await post(
      "/api/admin/pulse/notes",
      { body: "Two stewards asked for a printable roster.", kind: "friction", leagueId: "harbor" },
      editor,
    );
    expect(created.status, await created.clone().text()).toBe(201);
    const note = (await created.json()) as { body: string; leagueName: string; kind: string; week: string };
    expect(note.leagueName).toBe("Harbor Cleanup Coalition");
    expect(note.kind).toBe("friction");
    expect(note.week).toMatch(/^\d{4}-\d{2}$/);

    const pulse = (await (await get("/api/admin/pulse", editor)).json()) as { notes: { body: string }[] };
    expect(pulse.notes[0].body).toMatch(/printable roster/);

    const ada = await register("ada@example.com", "Ada");
    expect((await post("/api/admin/pulse/notes", { body: "Not mine to file." }, ada.cookie)).status).toBe(403);
    expect((await post("/api/admin/pulse/notes", { body: "x" }, editor)).status).toBe(400);
    expect((await post("/api/admin/pulse/notes", { body: "Valid note", leagueId: "nope" }, editor)).status).toBe(404);
  });

  it("prunes expired page events and old resolved crashes, never the record", async () => {
    const ledgerBefore = (db.prepare("SELECT COUNT(*) AS count FROM points_ledger").get() as { count: number }).count;

    db.prepare(
      "INSERT INTO pulse_events (event_name, path, created_at) VALUES ('home_view', '/', '2000-01-01T00:00:00.000Z')",
    ).run();
    db.prepare(
      `INSERT INTO error_reports (id, message, resolved_at, created_at)
       VALUES ('err_old', 'old crash', '2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO error_reports (id, message, created_at)
       VALUES ('err_open', 'still open', '2000-01-01T00:00:00.000Z')`,
    ).run();

    const pruned = ensurePhase6(db);
    expect(pruned.events).toBe(1);
    expect(pruned.errors).toBe(1);
    expect(db.prepare("SELECT 1 FROM error_reports WHERE id = 'err_open'").get()).toBeDefined();
    expect((db.prepare("SELECT COUNT(*) AS count FROM points_ledger").get() as { count: number }).count).toBe(ledgerBefore);
  });
});

describe("backups and restore drills", () => {
  it("writes a verified snapshot, keeps the safety copy, and restores it", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "jl-ops-"));
    const dbPath = path.join(dir, "live.db");
    let live: Db | null = openDatabase(dbPath);
    try {
      runMigrations(live);
      seedIfEmpty(live);
      ensurePhase3(live);
      ensurePhase4(live);
      ensurePhase5(live);
      ensurePhase6(live);

      live.prepare(
        `INSERT INTO pilot_notes (id, body, kind) VALUES ('note_marker', 'Before the backup', 'win')`,
      ).run();

      const backup = backupDatabase(live, dbPath, { keep: 2 });
      expect(backup.integrity).toBe("ok");
      expect(backup.migrations).toBeGreaterThan(0);
      expect(verifyDatabase(backup.path).integrity).toBe("ok");

      live.prepare("DELETE FROM pilot_notes WHERE id = 'note_marker'").run();
      live.close();
      live = null;

      const restored = restoreDatabase(dbPath);
      expect(restored.integrity).toBe("ok");
      expect(restored.safetyBackup).toBeTruthy();
      expect(restored.restoredFrom).toBe(backup.path);

      const reopened = openDatabase(dbPath);
      try {
        expect(reopened.prepare("SELECT 1 FROM pilot_notes WHERE id = 'note_marker'").get()).toBeDefined();
        const check = checkDatabase(reopened, dbPath);
        expect(check.ok).toBe(true);
        expect(check.integrity).toBe("ok");
        expect(check.foreignKeyViolations).toBe(0);
      } finally {
        reopened.close();
      }

      const files = listBackups(dbPath);
      expect(files.some((file) => file.file.startsWith("pre-restore-"))).toBe(true);
      expect(files.every((file) => file.integrity === "ok")).toBe(true);
    } finally {
      live?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses to back up memory and refuses a missing restore selector", () => {
    expect(() => backupDatabase(db, ":memory:")).toThrow(/in-memory/i);
    const dir = mkdtempSync(path.join(tmpdir(), "jl-ops-"));
    try {
      expect(() => restoreDatabase(path.join(dir, "missing.db"))).toThrow(/No backup found/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("warns about a missing backup and unresolved crashes", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "jl-ops-"));
    const dbPath = path.join(dir, "live.db");
    const live = openDatabase(dbPath);
    try {
      runMigrations(live);
      seedIfEmpty(live);
      ensurePhase3(live);
      ensurePhase4(live);
      ensurePhase5(live);
      ensurePhase6(live);
      live.prepare("INSERT INTO error_reports (id, message) VALUES ('err_open', 'still open')").run();

      const check = checkDatabase(live, dbPath);
      expect(check.ok).toBe(true);
      expect(check.warnings.join(" ")).toMatch(/No backup yet/i);
      expect(check.warnings.join(" ")).toMatch(/unresolved client error/i);
      expect(check.counts.errors).toBe(1);
    } finally {
      live.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
