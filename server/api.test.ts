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
  return { response, cookie };
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
