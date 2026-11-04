// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase, type Db } from "./db";
import { runMigrations } from "./db/migrate";
import { seedIfEmpty } from "./db/seed";

let db: Db;
let app: ReturnType<typeof createApp>;

async function post(path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function register(email = "ada@example.com", displayName = "Ada Lovelace") {
  const response = await post("/api/auth/register", {
    displayName,
    email,
    password: "correct horse battery",
    causes: ["climate"],
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const payload = (await response.clone().json()) as { me?: { profile: { id: string } } };
  return { response, cookie, profileId: payload.me?.profile.id ?? "" };
}

beforeEach(() => {
  db = openDatabase(":memory:");
  runMigrations(db);
  seedIfEmpty(db);
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
