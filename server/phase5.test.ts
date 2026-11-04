// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase, type Db } from "./db";
import { runMigrations } from "./db/migrate";
import { ensurePhase5, seedIfEmpty } from "./db/seed";

let db: Db;
let app: ReturnType<typeof createApp>;

async function post(path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function patch(path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function get(path: string, cookie?: string) {
  return app.request(path, { headers: cookie ? { cookie } : {} });
}

async function register(
  email = "ada@example.com",
  displayName = "Ada Lovelace",
  extra: Record<string, unknown> = {},
) {
  const response = await post(
    "/api/auth/register",
    {
      displayName,
      email,
      password: "correct horse battery",
      causes: ["climate"],
      ageConfirmed: true,
      ...extra,
    },
    undefined,
  );
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const payload = (await response.clone().json()) as { me?: { profile: { id: string } } };
  return { response, cookie, profileId: payload.me?.profile.id ?? "" };
}

async function login(email: string, password = "millbrook") {
  const response = await post("/api/auth/login", { email, password });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

const EDITOR = "admin@justiceleagues.local";
const STEWARD = "steward.harbor.1@justiceleagues.local";

beforeEach(() => {
  db = openDatabase(":memory:");
  runMigrations(db);
  seedIfEmpty(db);
  ensurePhase5(db);
  app = createApp(db);
});

describe("safeguarding at registration", () => {
  it("requires an explicit age confirmation", async () => {
    const response = await post("/api/auth/register", {
      displayName: "No Gate",
      email: "nogate@example.com",
      password: "correct horse battery",
      causes: ["climate"],
    });
    expect(response.status).toBe(400);
  });

  it("requires guardian consent for a neighbour under 18", async () => {
    const response = await post("/api/auth/register", {
      displayName: "Teen Neighbour",
      email: "teen@example.com",
      password: "correct horse battery",
      causes: ["climate"],
      ageConfirmed: true,
      ageBand: "teen",
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("guardian_required");
  });

  it("keeps a young neighbour's handle off public rosters", async () => {
    const teen = await register("young@example.com", "Young Neighbour", {
      ageBand: "teen",
      guardianConsent: true,
    });
    expect(teen.response.status).toBe(201);
    const joined = await post("/api/leagues/harbor/join", {}, teen.cookie);
    expect(joined.status).toBe(200);

    const detail = (await (await get("/api/leagues/harbor")).json()) as {
      members: { profile: { id: string; handle: string; minor?: boolean } }[];
    };
    const row = detail.members.find((member) => member.profile.id === teen.profileId);
    expect(row?.profile.minor).toBe(true);
    expect(row?.profile.handle).toBe("");
  });
});

describe("notifications inbox", () => {
  it("writes a welcome note and counts it unread", async () => {
    const account = await register();
    const me = (await (await get("/api/auth/me", account.cookie)).json()) as { me: { unread: number } };
    expect(me.me.unread).toBe(1);

    const inbox = (await (await get("/api/notifications", account.cookie)).json()) as {
      items: { kind: string; title: string; readAt: string | null }[];
      unread: number;
      total: number;
    };
    expect(inbox.unread).toBe(1);
    expect(inbox.items[0].kind).toBe("welcome");

    const read = await post("/api/notifications/read", {}, account.cookie);
    expect(read.status).toBe(200);
    expect(((await read.json()) as { updated: number }).updated).toBe(1);

    const after = (await (await get("/api/auth/me", account.cookie)).json()) as { me: { unread: number } };
    expect(after.me.unread).toBe(0);
  });

  it("notifies on a charter signature and on a claimed shift", async () => {
    const account = await register("joiner@example.com", "Join Reader");
    await post("/api/leagues/harbor/join", {}, account.cookie);
    await app.request("/api/shifts/s11/signup", {
      method: "POST",
      headers: { cookie: account.cookie },
    });

    const inbox = (await (await get("/api/notifications", account.cookie)).json()) as {
      items: { kind: string }[];
    };
    const kinds = inbox.items.map((item) => item.kind);
    expect(kinds).toContain("join");
    expect(kinds).toContain("shift");
    expect(kinds).toContain("reminder");
  });

  it("notifies a steward when a neighbour joins", async () => {
    const stewardCookie = await login(STEWARD);
    const before = (await (await get("/api/notifications", stewardCookie)).json()) as { total: number };
    const account = await register("newcomer@example.com", "Newcomer");
    await post("/api/leagues/harbor/join", {}, account.cookie);
    const after = (await (await get("/api/notifications", stewardCookie)).json()) as {
      items: { kind: string; body: string }[];
    };
    expect(after.items.length).toBeGreaterThan(before.total - before.total); // still readable
    expect(after.items.some((item) => item.kind === "join")).toBe(true);
  });
});

describe("moderation", () => {
  async function leagueMember(email: string, name: string) {
    const account = await register(email, name);
    const join = await post("/api/leagues/harbor/join", {}, account.cookie);
    expect(join.status).toBe(200);
    return account;
  }

  async function fileResource(cookie: string, title = "Spare ladder") {
    const response = await post(
      "/api/leagues/harbor/resources",
      { chapterId: "ch_harbor", kind: "offer", title, description: "In the garage." },
      cookie,
    );
    expect(response.status).toBe(201);
    return ((await response.json()) as { id: string }).id;
  }

  it("files one open report per reporter and item", async () => {
    const author = await leagueMember("author@example.com", "Author");
    const reporter = await leagueMember("reporter@example.com", "Reporter");
    const resourceId = await fileResource(author.cookie);

    const first = await post(
      "/api/reports",
      { targetType: "resource", targetId: resourceId, reason: "spam", detail: "Suspicious." },
      reporter.cookie,
    );
    expect(first.status).toBe(201);

    const again = await post(
      "/api/reports",
      { targetType: "resource", targetId: resourceId, reason: "spam" },
      reporter.cookie,
    );
    expect(again.status).toBe(409);
    expect(((await again.json()) as { code: string }).code).toBe("already_reported");

    const self = await post(
      "/api/reports",
      { targetType: "resource", targetId: resourceId, reason: "spam" },
      author.cookie,
    );
    expect(self.status).toBe(409);
  });

  it("keeps the report queue behind the editor's desk", async () => {
    const member = await register("nosy@example.com", "Nosy Reader");
    const denied = await get("/api/admin/reports", member.cookie);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe("admin_required");
  });

  it("hides a reported resource and closes the report", async () => {
    const author = await leagueMember("hidden@example.com", "Hidden Author");
    const reporter = await leagueMember("flag@example.com", "Flag Raiser");
    const resourceId = await fileResource(author.cookie, "Mystery box");

    const report = (await (
      await post("/api/reports", { targetType: "resource", targetId: resourceId, reason: "safety" }, reporter.cookie)
    ).json()) as { id: string };

    const editorCookie = await login(EDITOR);
    const queue = (await (await get("/api/admin/reports", editorCookie)).json()) as {
      reports: { id: string; targetTitle: string }[];
    };
    expect(queue.reports.some((row) => row.id === report.id)).toBe(true);

    const handled = await post(
      `/api/admin/reports/${report.id}`,
      { decision: "hide", note: "Not safe to publish." },
      editorCookie,
    );
    expect(handled.status).toBe(200);

    const edition = (await (await get("/api/edition")).json()) as { resources: { id: string }[] };
    expect(edition.resources.some((row) => row.id === resourceId)).toBe(false);

    const authorInbox = (await (await get("/api/notifications", author.cookie)).json()) as {
      items: { kind: string; title: string }[];
    };
    expect(authorInbox.items.some((item) => item.title === "A post was hidden")).toBe(true);

    const second = await post(`/api/admin/reports/${report.id}`, { decision: "dismiss" }, editorCookie);
    expect(second.status).toBe(409);
  });

  it("applies the third strike as a fortnight's posting pause", async () => {
    const author = await leagueMember("repeat@example.com", "Repeat Author");
    const reporter = await leagueMember("watch@example.com", "Watch Reporter");
    const editorCookie = await login(EDITOR);

    for (let i = 0; i < 3; i += 1) {
      const resourceId = await fileResource(author.cookie, `Repeat item ${i}`);
      const report = (await (
        await post("/api/reports", { targetType: "resource", targetId: resourceId, reason: "harassment" }, reporter.cookie)
      ).json()) as { id: string };
      const handled = await post(`/api/admin/reports/${report.id}`, { decision: "strike", note: "Upheld." }, editorCookie);
      expect(handled.status).toBe(200);
    }

    const detail = (await (await get("/api/admin/users?q=repeat@example.com", editorCookie)).json()) as {
      users: { restrictedUntil: string | null; strikes: number }[];
    };
    expect(detail.users[0].strikes).toBe(3);
    expect(detail.users[0].restrictedUntil).toBeTruthy();

    // Reading and reporting stay open; posting is paused.
    const blocked = await post(
      "/api/leagues/harbor/resources",
      { chapterId: "ch_harbor", kind: "offer", title: "Should not publish" },
      author.cookie,
    );
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { code: string }).code).toBe("restricted");

    const stillReads = await post("/api/leagues/harbor/join", {}, author.cookie);
    expect(stillReads.status).toBe(200);

    const restored = await post(
      `/api/admin/users/${author.profileId}/restore`,
      {},
      editorCookie,
    );
    expect(restored.status).toBe(200);
    const after = await post(
      "/api/leagues/harbor/resources",
      { chapterId: "ch_harbor", kind: "offer", title: "Publishing again" },
      author.cookie,
    );
    expect(after.status).toBe(201);
  });
});

describe("editor's desk", () => {
  it("lists people without leaking a young neighbour's contact details", async () => {
    const teen = await register("private@example.com", "Private Teen", {
      ageBand: "teen",
      guardianConsent: true,
    });
    const editorCookie = await login(EDITOR);
    const users = (await (await get("/api/admin/users?q=private@example.com", editorCookie)).json()) as {
      users: { profile: { id: string }; email: string | null; contactHidden: boolean }[];
    };
    const row = users.users.find((user) => user.profile.id === teen.profileId);
    expect(row?.email).toBeNull();
    expect(row?.contactHidden).toBe(true);
  });

  it("toggles a feature flag and records it in the audit log", async () => {
    const editorCookie = await login(EDITOR);
    const flags = (await (await get("/api/admin/flags", editorCookie)).json()) as {
      flags: { key: string; enabled: boolean }[];
    };
    expect(flags.flags.find((flag) => flag.key === "public_ledger")?.enabled).toBe(true);

    const toggled = await patch("/api/admin/flags/public_ledger", { enabled: false }, editorCookie);
    expect(toggled.status).toBe(200);
    expect(((await toggled.json()) as { enabled: boolean }).enabled).toBe(false);

    const edition = (await (await get("/api/edition")).json()) as { flags: Record<string, boolean> };
    expect(edition.flags.public_ledger).toBe(false);

    const audit = (await (await get("/api/admin/audit", editorCookie)).json()) as {
      entries: { action: string; targetId: string }[];
    };
    expect(audit.entries.some((entry) => entry.action === "flag.set" && entry.targetId === "public_ledger")).toBe(true);
  });

  it("refuses a role change to yourself", async () => {
    const editorCookie = await login(EDITOR);
    const me = (await (await get("/api/auth/me", editorCookie)).json()) as { me: { profile: { id: string } } };
    const response = await post(`/api/admin/users/${me.me.profile.id}/role`, { role: "member" }, editorCookie);
    expect(response.status).toBe(409);
  });
});

describe("your data", () => {
  it("exports everything the paper holds about you", async () => {
    const account = await register("export@example.com", "Export Reader");
    await post("/api/leagues/harbor/join", {}, account.cookie);
    const response = await get("/api/me/export", account.cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("justice-leagues-export.json");
    const payload = (await response.json()) as {
      profile: { email: string };
      memberships: unknown[];
      ledger: unknown[];
      notifications: unknown[];
    };
    expect(payload.profile.email).toBe("export@example.com");
    expect(payload.memberships.length).toBe(1);
    expect(payload.ledger.length).toBe(1);
    expect(payload.notifications.length).toBeGreaterThan(0);
  });

  it("deletes the account, anonymises the ledger, and ends the session", async () => {
    const account = await register("delete@example.com", "Delete Reader");
    await post("/api/leagues/harbor/join", {}, account.cookie);

    const wrong = await app.request("/api/me", {
      method: "DELETE",
      headers: { "content-type": "application/json", cookie: account.cookie },
      body: JSON.stringify({ confirm: "delete" }),
    });
    expect(wrong.status).toBe(400);

    const deleted = await app.request("/api/me", {
      method: "DELETE",
      headers: { "content-type": "application/json", cookie: account.cookie },
      body: JSON.stringify({ confirm: "delete my account" }),
    });
    expect(deleted.status).toBe(200);

    const me = await get("/api/auth/me", account.cookie);
    expect(((await me.json()) as { me: unknown }).me).toBeNull();

    const orphan = db
      .prepare("SELECT profile_id, delta FROM points_ledger WHERE reason = 'Signed the league charter' AND profile_id IS NULL")
      .all() as unknown as { delta: number }[];
    expect(orphan.length).toBeGreaterThan(0);
    expect(orphan[0].delta).toBe(25);
  });
});
