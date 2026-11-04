// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase, type Db } from "./db";
import { runMigrations } from "./db/migrate";
import { ensurePhase5, seedIfEmpty } from "./db/seed";

let db: Db;
let app: ReturnType<typeof createApp>;

async function post(path: string, body: unknown, cookie?: string, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    body: JSON.stringify(body),
  });
}

let registrationCount = 0;

async function register(email = "ada@example.com", displayName = "Ada Lovelace") {
  // Each registration gets its own limiter bucket so a long suite never trips
  // the per-IP ceiling; the limiter itself is covered by its own unit test.
  registrationCount += 1;
  const response = await post(
    "/api/auth/register",
    {
      displayName,
      email,
      password: "correct horse battery",
      causes: ["climate"],
      ageConfirmed: true,
    },
    undefined,
    { "x-forwarded-for": `10.0.0.${registrationCount}` },
  );
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const payload = (await response.clone().json()) as { me?: { profile: { id: string } } };
  return { response, cookie, profileId: payload.me?.profile.id ?? "" };
}

beforeEach(() => {
  db = openDatabase(":memory:");
  runMigrations(db);
  seedIfEmpty(db);
  ensurePhase5(db);
  app = createApp(db);
});

describe("auth API", () => {
  it("issues an httpOnly session cookie on registration", async () => {
    const { response, cookie } = await register();
    expect(response.status).toBe(201);
    expect(cookie).toMatch(/^jl_session=/);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");

    const me = await app.request("/api/auth/me", { headers: { cookie } });
    const payload = (await me.json()) as { me: { profile: { email: string; displayName: string } } };
    expect(payload.me.profile.email).toBe("ada@example.com");
    expect(payload.me.profile.displayName).toBe("Ada Lovelace");
  });

  it("rejects a duplicate email and a weak password", async () => {
    await register();
    const duplicate = await register();
    expect(duplicate.response.status).toBe(409);

    const weak = await post("/api/auth/register", {
      displayName: "Grace",
      email: "grace@example.com",
      password: "short",
    });
    expect(weak.status).toBe(400);
  });

  it("logs in and out, and refuses bad credentials", async () => {
    await register();

    const bad = await post("/api/auth/login", { email: "ada@example.com", password: "wrong password" });
    expect(bad.status).toBe(401);

    const good = await post("/api/auth/login", { email: "ada@example.com", password: "correct horse battery" });
    expect(good.status).toBe(200);
    const cookie = good.headers.get("set-cookie")?.split(";")[0] ?? "";

    const logout = await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });
    expect(logout.status).toBe(200);
    const me = await app.request("/api/auth/me", { headers: { cookie } });
    expect(((await me.json()) as { me: null }).me).toBeNull();
  });

  it("protects mutations behind a session", async () => {
    const response = await app.request("/api/leagues/harbor/join", { method: "POST" });
    expect(response.status).toBe(401);
  });
});

describe("edition API", () => {
  it("persists a join and returns server-computed points", async () => {
    const { cookie } = await register();

    const joined = await app.request("/api/leagues/harbor/join", { method: "POST", headers: { cookie } });
    expect(joined.status).toBe(200);
    expect(await joined.json()).toEqual({ joined: true, awarded: true });

    const again = await app.request("/api/leagues/harbor/join", { method: "POST", headers: { cookie } });
    expect(await again.json()).toEqual({ joined: true, awarded: false });

    const edition = await app.request("/api/edition", { headers: { cookie } });
    const payload = (await edition.json()) as {
      leagues: { id: string; points: number; members: number }[];
      me: { points: number; memberships: unknown[]; ledger: { delta: number }[] };
    };

    expect(payload.me.points).toBe(25);
    expect(payload.me.memberships).toHaveLength(1);
    expect(payload.me.ledger).toHaveLength(1);
    expect(payload.leagues.find((league) => league.id === "harbor")!.points).toBe(48235);
  });

  it("keeps a shift signup across reloads and reports the filled count", async () => {
    const first = await register();
    const second = await register("grace@example.com", "Grace Hopper");

    const a = await app.request("/api/shifts/s11/signup", { method: "POST", headers: { cookie: first.cookie } });
    const b = await app.request("/api/shifts/s11/signup", { method: "POST", headers: { cookie: second.cookie } });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const edition = await app.request("/api/edition");
    const payload = (await edition.json()) as { shifts: { id: string; filled: number }[]; me: null };
    expect(payload.shifts.find((shift) => shift.id === "s11")!.filled).toBe(4);
    expect(payload.me).toBeNull();
  });
});

describe("steward API", () => {
  async function loginSteward(email: string) {
    const response = await post("/api/auth/login", { email, password: "millbrook" });
    expect(response.status).toBe(200);
    return response.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  it("lets a steward record attendance once and blocks everyone else", async () => {
    const stewardCookie = await loginSteward("steward.harbor.1@justiceleagues.local");
    const volunteer = await register("volunteer@example.com", "Volunteer One");

    const signup = await app.request("/api/shifts/s11/signup", {
      method: "POST",
      headers: { cookie: volunteer.cookie },
    });
    expect(signup.status).toBe(200);

    const denied = await post(
      "/api/shifts/s11/check-in",
      { profileId: volunteer.profileId, status: "attended" },
      volunteer.cookie,
    );
    expect(denied.status).toBe(403);

    const first = await post(
      "/api/shifts/s11/check-in",
      { profileId: volunteer.profileId, status: "attended" },
      stewardCookie,
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      awarded: number;
      roster: { entries: { profile: { id: string }; status: string; hours: number }[] };
    };
    expect(firstBody.awarded).toBe(24);
    expect(firstBody.roster.entries.find((entry) => entry.profile.id === volunteer.profileId)).toMatchObject({
      status: "attended",
      hours: 2,
    });

    const again = await post(
      "/api/shifts/s11/check-in",
      { profileId: volunteer.profileId, status: "attended" },
      stewardCookie,
    );
    expect(((await again.json()) as { awarded: number }).awarded).toBe(0);

    const me = await app.request("/api/auth/me", { headers: { cookie: volunteer.cookie } });
    const meBody = (await me.json()) as { me: { points: number; ledger: { delta: number }[] } };
    expect(meBody.me.points).toBe(25 + 24);
    expect(meBody.me.ledger).toHaveLength(2);
  });

  it("refuses a roster read to a plain member", async () => {
    const volunteer = await register("plain@example.com", "Plain Member");
    const response = await app.request("/api/shifts/s11/roster", { headers: { cookie: volunteer.cookie } });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe("not_steward");
  });

  it("posts and cancels a shift, but only for a steward", async () => {
    const stewardCookie = await loginSteward("steward.harbor.1@justiceleagues.local");
    const volunteer = await register("author@example.com", "Author Member");
    const body = {
      chapterId: "ch_harbor_2",
      title: "Lantern walk",
      day: 2,
      time: "18:30",
      duration: "2h",
      capacity: 6,
      place: "City Centre square",
    };

    const denied = await post("/api/leagues/harbor/shifts", body, volunteer.cookie);
    expect(denied.status).toBe(403);

    const created = await post("/api/leagues/harbor/shifts", body, stewardCookie);
    expect(created.status).toBe(201);
    const shift = (await created.json()) as { id: string; chapterId: string; spots: number };
    expect(shift.chapterId).toBe("ch_harbor_2");
    expect(shift.spots).toBe(6);

    const edition = (await (await app.request("/api/edition")).json()) as { shifts: { id: string }[] };
    expect(edition.shifts.some((item) => item.id === shift.id)).toBe(true);

    const removed = await app.request(`/api/shifts/${shift.id}`, {
      method: "DELETE",
      headers: { cookie: stewardCookie },
    });
    expect(removed.status).toBe(200);

    const after = (await (await app.request("/api/edition")).json()) as { shifts: { id: string }[] };
    expect(after.shifts.some((item) => item.id === shift.id)).toBe(false);
  });
});

describe("project API", () => {
  async function loginSteward(email: string) {
    const response = await post("/api/auth/login", { email, password: "millbrook" });
    expect(response.status).toBe(200);
    return response.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  const draft = {
    chapterId: "ch_harbor_2",
    title: "Riverfront replanting",
    summary: "Twelve neighbours replanted the east bank with native shrubs over two weekends.",
    occurredOn: "2026-05-04",
    people: 12,
    hours: 30,
    amount: "120 saplings",
    evidenceUrl: "https://example.com/evidence",
  };

  it("files a project, then a steward approval writes points and the public win", async () => {
    const stewardCookie = await loginSteward("steward.harbor.1@justiceleagues.local");
    const member = await register("projector@example.com", "Project Filer");

    const joined = await app.request("/api/leagues/harbor/join", {
      method: "POST",
      headers: { cookie: member.cookie },
    });
    expect(joined.status).toBe(200);

    const filed = await post("/api/leagues/harbor/projects", draft, member.cookie);
    expect(filed.status).toBe(201);
    const project = (await filed.json()) as { id: string; status: string; points: number; facts: unknown };
    expect(project).toMatchObject({ status: "submitted", points: 0 });

    const denied = await post(`/api/projects/${project.id}/review`, { decision: "approve" }, member.cookie);
    expect(denied.status).toBe(403);

    const queue = await app.request("/api/leagues/harbor/projects", { headers: { cookie: stewardCookie } });
    expect(queue.status).toBe(200);
    const listed = (await queue.json()) as { projects: { id: string }[] };
    expect(listed.projects.some((item) => item.id === project.id)).toBe(true);

    const approved = await post(`/api/projects/${project.id}/review`, { decision: "approve" }, stewardCookie);
    expect(approved.status).toBe(200);
    const reviewed = (await approved.json()) as { status: string; points: number };
    expect(reviewed).toMatchObject({ status: "approved", points: 194 });

    const edition = (await (await app.request("/api/edition")).json()) as {
      leagues: { id: string; projects: number }[];
      wins: { id: string; jp: number }[];
      me: null;
    };
    expect(edition.wins.find((win) => win.id === project.id)?.jp).toBe(194);
    expect(edition.leagues.find((league) => league.id === "harbor")!.projects).toBe(97);

    const me = (await (await app.request("/api/auth/me", { headers: { cookie: member.cookie } })).json()) as {
      me: { points: number };
    };
    expect(me.me.points).toBe(25 + 194);
  });

  it("refuses outsiders and malformed projects", async () => {
    const outsider = await register("outsider@example.com", "Outside Member");

    const denied = await post("/api/leagues/harbor/projects", draft, outsider.cookie);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe("not_member");

    const invalid = await post("/api/leagues/harbor/projects", { title: "Too little" }, outsider.cookie);
    expect(invalid.status).toBe(400);

    const badEvidence = await post(
      "/api/leagues/harbor/projects",
      { ...draft, evidenceUrl: "javascript:alert(1)" },
      outsider.cookie,
    );
    expect(badEvidence.status).toBe(400);
  });
});

describe("resource API", () => {
  const draft = {
    chapterId: "ch_harbor_2",
    kind: "offer",
    title: "Ladder and a set of hand tools",
    description: "Borrow for a build day; return swept.",
    quantity: "1 ladder · 12 tools",
  };

  async function member(email: string, name: string) {
    const account = await register(email, name);
    const joined = await app.request("/api/leagues/harbor/join", {
      method: "POST",
      headers: { cookie: account.cookie },
    });
    expect(joined.status).toBe(200);
    return account;
  }

  it("posts, claims, releases, and fulfils a classified", async () => {
    const lender = await member("lender@example.com", "Lender One");
    const borrower = await member("borrower@example.com", "Borrower Two");

    const posted = await post("/api/leagues/harbor/resources", draft, lender.cookie);
    expect(posted.status).toBe(201);
    const resource = (await posted.json()) as { id: string; status: string; kind: string };
    expect(resource).toMatchObject({ status: "open", kind: "offer" });

    const ownClaim = await post(`/api/resources/${resource.id}/claim`, {}, lender.cookie);
    expect(ownClaim.status).toBe(409);

    const claim = await post(`/api/resources/${resource.id}/claim`, {}, borrower.cookie);
    expect(claim.status).toBe(200);
    expect(((await claim.json()) as { status: string }).status).toBe("claimed");

    const edition = (await (await app.request("/api/edition")).json()) as {
      resources: { id: string; status: string }[];
    };
    expect(edition.resources.find((item) => item.id === resource.id)?.status).toBe("claimed");

    const release = await post(`/api/resources/${resource.id}/release`, {}, borrower.cookie);
    expect(((await release.json()) as { status: string }).status).toBe("open");

    await post(`/api/resources/${resource.id}/claim`, {}, borrower.cookie);
    const fulfilled = await post(`/api/resources/${resource.id}/fulfil`, {}, lender.cookie);
    expect(((await fulfilled.json()) as { status: string }).status).toBe("fulfilled");
  });

  it("refuses outsiders and malformed classifieds", async () => {
    const lender = await member("lender2@example.com", "Lender Two");
    const outsider = await register("outsider2@example.com", "Outside Two");

    const posted = await post("/api/leagues/harbor/resources", draft, lender.cookie);
    const resource = (await posted.json()) as { id: string };

    const denied = await post(`/api/resources/${resource.id}/claim`, {}, outsider.cookie);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe("not_member");

    const invalid = await post("/api/leagues/harbor/resources", { ...draft, kind: "sale" }, lender.cookie);
    expect(invalid.status).toBe(400);
  });
});

describe("invite API", () => {
  async function loginSteward() {
    const response = await post("/api/auth/login", {
      email: "steward.harbor.1@justiceleagues.local",
      password: "millbrook",
    });
    return response.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  it("mints a link, previews it, and redeems it exactly once", async () => {
    const stewardCookie = await loginSteward();
    const created = await post(
      "/api/leagues/harbor/invites",
      { role: "steward", chapterId: "ch_harbor_2", note: "Bring the Tuesday crew" },
      stewardCookie,
    );
    expect(created.status).toBe(201);
    const invite = (await created.json()) as {
      token: string;
      path: string;
      preview: { leagueId: string; role: string; chapterId: string };
    };
    expect(invite.path).toBe(`/join/${invite.token}`);
    expect(invite.preview).toMatchObject({ leagueId: "harbor", role: "steward", chapterId: "ch_harbor_2" });

    const preview = await app.request(`/api/invites/${invite.token}`);
    expect(preview.status).toBe(200);
    expect(((await preview.json()) as { status: string }).status).toBe("open");

    const guest = await register("guest@example.com", "Guest One");
    const redeemed = await post(`/api/invites/${invite.token}/redeem`, {}, guest.cookie);
    expect(redeemed.status).toBe(200);
    expect(await redeemed.json()).toMatchObject({ leagueId: "harbor", role: "steward", awarded: true });

    const ed = (await (await app.request("/api/edition", { headers: { cookie: guest.cookie } })).json()) as {
      me: { memberships: { leagueId: string; role: string; chapterId: string }[] };
    };
    expect(ed.me.memberships.find((item) => item.leagueId === "harbor")).toMatchObject({
      role: "steward",
      chapterId: "ch_harbor_2",
    });

    const again = await register("guest2@example.com", "Guest Two");
    const replay = await post(`/api/invites/${invite.token}/redeem`, {}, again.cookie);
    expect(replay.status).toBe(409);
    expect(((await replay.json()) as { code: string }).code).toBe("invite_used");
  });

  it("keeps minting behind the steward desk", async () => {
    const member = await register("member@example.com", "Member One");
    const joined = await post("/api/leagues/harbor/join", {}, member.cookie);
    expect(joined.status).toBe(200);

    const denied = await post("/api/leagues/harbor/invites", { role: "member" }, member.cookie);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe("not_steward");

    const stewardCookie = await loginSteward();
    const invalid = await post("/api/leagues/harbor/invites", { role: "owner" }, stewardCookie);
    expect(invalid.status).toBe(400);
  });
});

describe("steward editing API", () => {
  async function loginSteward(email = "steward.harbor.1@justiceleagues.local") {
    const response = await post("/api/auth/login", { email, password: "millbrook" });
    return response.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  const shiftBody = {
    chapterId: "ch_harbor_2",
    title: "Riverfront tree planting",
    day: 5,
    time: "09:30",
    duration: "3h",
    capacity: 22,
    place: "East bank footbridge",
  };

  it("edits a shift and refuses a capacity below the signups", async () => {
    const stewardCookie = await loginSteward();
    const edited = await app.request("/api/shifts/s12", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: stewardCookie },
      body: JSON.stringify(shiftBody),
    });
    const editedPayload = await edited.json();
    expect(edited.status, JSON.stringify(editedPayload)).toBe(200);
    expect(editedPayload).toMatchObject({ title: "Riverfront tree planting", spots: 22, time: "09:30" });

    const tooSmall = await app.request("/api/shifts/s12", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: stewardCookie },
      body: JSON.stringify({ ...shiftBody, capacity: 2 }),
    });
    expect(tooSmall.status).toBe(409);
    expect(((await tooSmall.json()) as { code: string }).code).toBe("capacity_below_signups");

    const denied = await app.request("/api/shifts/s12", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(shiftBody),
    });
    expect(denied.status).toBe(401);
  });

  it("removes a member and updates the masthead", async () => {
    const member = await register("remove-me@example.com", "Remove Me");
    await post("/api/leagues/harbor/join", {}, member.cookie);
    const stewardCookie = await loginSteward();

    const removed = await app.request("/api/leagues/harbor/members/" + member.profileId, {
      method: "DELETE",
      headers: { cookie: stewardCookie },
    });
    expect(removed.status).toBe(200);
    const detail = (await (await app.request("/api/leagues/harbor")).json()) as {
      members: { profile: { id: string } }[];
    };
    expect(detail.members.some((entry) => entry.profile.id === member.profileId)).toBe(false);

    const saved = await app.request("/api/leagues/harbor/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: stewardCookie },
      body: JSON.stringify({
        name: "Harbor & Mill River Coalition",
        motto: "Leave the water better than we found it.",
        cause: "climate",
        recruiting: false,
      }),
    });
    expect(saved.status).toBe(200);
    const edition = (await (await app.request("/api/edition")).json()) as {
      leagues: { id: string; name: string; recruiting: boolean }[];
    };
    expect(edition.leagues.find((league) => league.id === "harbor")).toMatchObject({
      name: "Harbor & Mill River Coalition",
      recruiting: false,
    });

    const settings = {
      name: "Harbor & Mill River Coalition",
      motto: "Leave the water better than we found it.",
      cause: "climate",
      recruiting: false,
      archived: true,
    };

    const stewardCookie2 = await loginSteward("steward.harbor.2@justiceleagues.local");
    const denied = await app.request("/api/leagues/harbor/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: stewardCookie2 },
      body: JSON.stringify(settings),
    });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe("owner_required");

    const archived = await app.request("/api/leagues/harbor/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: stewardCookie },
      body: JSON.stringify(settings),
    });
    expect(archived.status).toBe(200);
    const after = (await (await app.request("/api/edition")).json()) as { leagues: { id: string }[] };
    expect(after.leagues.some((league) => league.id === "harbor")).toBe(false);
  });
});

describe("phase 3 API", () => {
  async function loginSteward(email: string) {
    const response = await post("/api/auth/login", { email, password: "millbrook" });
    expect(response.status).toBe(200);
    return response.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  it("serves ranked standings for every scope", async () => {
    const global = (await (await app.request("/api/standings?scope=global&limit=3")).json()) as {
      total: number;
      rows: { rank: number; points: number; leagueId: string }[];
    };
    expect(global.total).toBe(10);
    expect(global.rows).toHaveLength(3);
    expect(global.rows[0].rank).toBe(1);
    expect(global.rows[0].leagueId).toBe("harbor");

    const month = (await (await app.request("/api/standings?scope=month")).json()) as {
      rows: { points: number; monthPoints: number }[];
    };
    expect(month.rows.every((row) => row.points === row.monthPoints)).toBe(true);

    const chapters = (await (await app.request("/api/standings?scope=chapter&league=harbor")).json()) as {
      rows: { chapterId: string | null; points: number }[];
    };
    expect(chapters.rows).toHaveLength(3);
    expect(chapters.rows.reduce((sum, row) => sum + row.points, 0)).toBe(
      global.rows.find((row) => row.leagueId === "harbor")?.points ?? Math.max(...chapters.rows.map((r) => r.points)),
    );

    const invalid = await app.request("/api/standings?scope=nonsense");
    expect(invalid.status).toBe(400);
  });

  it("serves impact for the city and for one league", async () => {
    const city = (await (await app.request("/api/impact")).json()) as {
      totals: { points: number };
      byMonth: { month: string }[];
    };
    expect(city.totals.points).toBeGreaterThan(0);
    expect(city.byMonth).toHaveLength(12);

    const league = (await (await app.request("/api/leagues/harbor/impact")).json()) as {
      leagueId: string;
      totals: { points: number };
      byChapter: { points: number }[];
    };
    expect(league.leagueId).toBe("harbor");
    expect(league.byChapter.reduce((sum, chapter) => sum + chapter.points, 0)).toBe(league.totals.points);

    const missing = await app.request("/api/leagues/nope/impact");
    expect(missing.status).toBe(404);
  });

  it("falls back to imported history until a live award exists", async () => {
    const fallback = (await (await app.request("/api/ledger")).json()) as {
      source: string;
      total: number;
      entries: { refType: string }[];
    };
    expect(fallback.source).toBe("imported");
    expect(fallback.total).toBeGreaterThan(0);
    expect(fallback.entries.every((entry) => entry.refType === "sealed_history")).toBe(true);

    const live = (await (await app.request("/api/ledger?live=1")).json()) as { total: number; source: string };
    expect(live.total).toBe(0);
    expect(live.source).toBe("live");

    const volunteer = await register("ledger@example.com", "Ledger Reader");
    await app.request("/api/leagues/harbor/join", { method: "POST", headers: { cookie: volunteer.cookie } });

    const after = (await (await app.request("/api/ledger")).json()) as {
      source: string;
      entries: { refType: string; profile: { id: string } | null }[];
    };
    expect(after.source).toBe("live");
    expect(after.entries.every((entry) => entry.refType !== "sealed_history")).toBe(true);
  });

  it("keeps the anomaly queue behind a steward seat", async () => {
    const volunteer = await register("queue@example.com", "Queue Reader");
    const denied = await app.request("/api/leagues/harbor/anomalies", { headers: { cookie: volunteer.cookie } });
    expect(denied.status).toBe(403);

    const anonymous = await app.request("/api/leagues/harbor/anomalies");
    expect(anonymous.status).toBe(401);

    const stewardCookie = await loginSteward("steward.harbor.1@justiceleagues.local");
    const queue = await app.request("/api/leagues/harbor/anomalies", { headers: { cookie: stewardCookie } });
    expect(queue.status).toBe(200);
    expect(((await queue.json()) as { anomalies: unknown[] }).anomalies).toEqual([]);
  });

  it("reverses a ledger entry through the steward route and refuses a second time", async () => {
    const stewardCookie = await loginSteward("steward.harbor.1@justiceleagues.local");
    const volunteer = await register("reverse@example.com", "Reverse Me");
    await app.request("/api/leagues/harbor/join", { method: "POST", headers: { cookie: volunteer.cookie } });

    const me = (await (
      await app.request("/api/auth/me", { headers: { cookie: volunteer.cookie } })
    ).json()) as { me: { ledger: { id: string; delta: number }[] } };
    const entry = me.me.ledger[0];

    const reversed = await post(`/api/leagues/harbor/ledger/${entry.id}/reverse`, { note: "Test" }, stewardCookie);
    expect(reversed.status).toBe(200);
    expect(((await reversed.json()) as { delta: number }).delta).toBe(-entry.delta);

    const twice = await post(`/api/leagues/harbor/ledger/${entry.id}/reverse`, {}, stewardCookie);
    expect(twice.status).toBe(409);
  });
});

describe("search API", () => {
  it("lists every league with coordinates and no distance without an origin", async () => {
    const response = await app.request("/api/search");
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      results: { id: string; lat: number; lng: number; distanceKm: number | null }[];
      total: number;
      centre: null;
      radiusKm: null;
    };
    expect(payload.total).toBe(10);
    expect(payload.results).toHaveLength(10);
    expect(payload.centre).toBeNull();
    expect(payload.radiusKm).toBeNull();
    for (const row of payload.results) {
      expect(Number.isFinite(row.lat)).toBe(true);
      expect(Number.isFinite(row.lng)).toBe(true);
      expect(row.distanceKm).toBeNull();
    }
  });

  it("matches text, filters by cause, and stays safe with operators", async () => {
    const match = (await (await app.request("/api/search?q=harb")).json()) as { results: { id: string }[] };
    expect(match.results.map((row) => row.id)).toEqual(["harbor"]);

    const cause = (await (await app.request("/api/search?q=green&cause=climate")).json()) as {
      results: { id: string }[];
    };
    expect(cause.results.map((row) => row.id)).toEqual(["greenway"]);

    const injection = await app.request(`/api/search?q=${encodeURIComponent('harbor" OR 1=1 --')}`);
    expect(injection.status).toBe(200);
    expect(((await injection.json()) as { results: unknown[] }).results).toEqual([]);
  });

  it("sorts and filters by distance", async () => {
    const response = await app.request("/api/search?lat=43.6532&lng=-79.3832&radiusKm=5&limit=50");
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      results: { distanceKm: number }[];
      total: number;
      centre: { lat: number; lng: number };
    };
    expect(payload.centre).toEqual({ lat: 43.6532, lng: -79.3832 });
    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.results.length).toBeLessThan(10);
    const distances = payload.results.map((row) => row.distanceKm);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    for (const distance of distances) expect(distance).toBeLessThanOrEqual(5);
  });

  it("rejects half a coordinate pair and out-of-range input", async () => {
    const half = await app.request("/api/search?lat=43.65");
    expect(half.status).toBe(400);
    expect(((await half.json()) as { code: string }).code).toBe("invalid_coordinates");

    expect((await app.request("/api/search?lat=999&lng=-79")).status).toBe(400);
    expect((await app.request("/api/search?radiusKm=500")).status).toBe(400);
  });

  it("returns coordinates with the city directory", async () => {
    const response = await app.request("/api/city");
    const payload = (await response.json()) as {
      city: { name: string; lat: number; lng: number };
      neighborhoods: { name: string; lat: number; lng: number }[];
    };
    expect(payload.city.name).toBe("Millbrook");
    expect(payload.city.lat).toBeCloseTo(43.6532, 4);
    expect(payload.neighborhoods.length).toBeGreaterThan(0);
    for (const hood of payload.neighborhoods) {
      expect(Number.isFinite(hood.lat)).toBe(true);
      expect(Number.isFinite(hood.lng)).toBe(true);
    }
  });
});
