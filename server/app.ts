import { existsSync } from "node:fs";
import { z } from "zod";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Db } from "./db";
import { hashPassword, verifyPassword } from "./auth/password";
import { clientKey, rateLimit } from "./auth/rate-limit";
import {
  createSession,
  destroySession,
  purgeExpiredSessions,
  SESSION_COOKIE,
  SESSION_DAYS,
  userForToken,
  type SessionUser,
} from "./auth/session";
import {
  AppError,
  cancelShift,
  getEdition,
  getMe,
  joinLeague,
  leaveLeague,
  listLeagues,
  listMembers,
  signupShift,
} from "./db/repository";
import { newId } from "./db";

type Variables = { profile: SessionUser | null };

const CAUSE_VALUES = ["climate", "safety", "food", "transit", "education", "housing", "health", "rights"] as const;

const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  email: z.string().trim().email().max(200),
  password: z.string().min(10).max(200),
  homeNeighborhood: z.string().trim().max(80).optional(),
  causes: z.array(z.enum(CAUSE_VALUES)).max(8).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

function slugifyHandle(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24);
  return base || "neighbour";
}

function uniqueHandle(db: Db, desired: string): string {
  let handle = desired;
  let n = 1;
  while (db.prepare("SELECT 1 FROM profiles WHERE handle = ?").get(handle)) {
    n += 1;
    handle = `${desired.slice(0, 21)}-${n}`;
  }
  return handle;
}

function sessionCookie(c: Context<{ Variables: Variables }>, token: string, expires: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: false,
    expires,
  });
}

export function createApp(db: Db): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();

  app.use("*", logger());
  app.use("/api/*", async (c, next) => {
    c.set("profile", userForToken(db, getCookie(c, SESSION_COOKIE)));
    await next();
  });

  const auth = (): MiddlewareHandler<{ Variables: Variables }> => async (c, next) => {
    if (!c.get("profile")) {
      return c.json({ error: "Sign in to do that.", code: "unauthenticated" }, 401);
    }
    await next();
  };

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      service: "justice-leagues",
      storage: "sqlite",
      now: new Date().toISOString(),
    }),
  );

  app.get("/api/city", (c) => {
    const city = db.prepare("SELECT id, name, slug FROM cities ORDER BY name LIMIT 1").get() as
      { id: string; name: string; slug: string } | undefined;
    const neighborhoods = db.prepare("SELECT id, name, slug FROM neighborhoods ORDER BY name").all() as unknown as {
      id: string;
      name: string;
      slug: string;
    }[];
    return c.json({ city: city ?? null, neighborhoods });
  });

  app.get("/api/edition", (c) => c.json(getEdition(db, c.get("profile")?.id ?? null)));

  app.get("/api/leagues", (c) => c.json({ leagues: listLeagues(db) }));

  app.get("/api/leagues/:id", (c) => {
    const id = c.req.param("id");
    const league = listLeagues(db).find((item) => item.id === id || item.slug === id);
    if (!league) return c.json({ error: "League not found.", code: "league_not_found" }, 404);
    return c.json({ league, members: listMembers(db, league.id) });
  });

  app.post("/api/leagues/:id/join", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(joinLeague(db, profile.id, c.req.param("id")));
  });

  app.delete("/api/leagues/:id/join", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(leaveLeague(db, profile.id, c.req.param("id")));
  });

  app.post("/api/shifts/:id/signup", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(signupShift(db, profile.id, c.req.param("id")));
  });

  app.delete("/api/shifts/:id/signup", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(cancelShift(db, profile.id, c.req.param("id")));
  });

  app.post("/api/auth/register", async (c) => {
    const key = clientKey(c.req.raw.headers, "register");
    if (!rateLimit(key, 20, 10 * 60_000)) {
      return c.json({ error: "Too many sign-up attempts. Try again in a few minutes.", code: "rate_limited" }, 429);
    }

    const parsed = registerSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Please check the details and try again.", code: "invalid_input" }, 400);
    }
    const { displayName, password, homeNeighborhood, causes } = parsed.data;
    const email = parsed.data.email.toLowerCase();

    if (db.prepare("SELECT 1 FROM profiles WHERE email = ?").get(email)) {
      return c.json({ error: "An account with that email already exists.", code: "email_taken" }, 409);
    }

    if (homeNeighborhood && !db.prepare("SELECT 1 FROM neighborhoods WHERE id = ?").get(homeNeighborhood)) {
      return c.json({ error: "That neighbourhood is not in this edition.", code: "invalid_neighborhood" }, 400);
    }

    const city = db.prepare("SELECT id FROM cities LIMIT 1").get() as { id: string } | undefined;
    const id = newId("usr");
    const handle = uniqueHandle(db, slugifyHandle(displayName));

    db.prepare(
      `INSERT INTO profiles (id, email, password_hash, handle, display_name, city_id, home_neighborhood, causes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      email,
      hashPassword(password),
      handle,
      displayName,
      city?.id ?? null,
      homeNeighborhood ?? null,
      JSON.stringify(causes ?? []),
    );

    purgeExpiredSessions(db);
    const session = createSession(db, id);
    sessionCookie(c, session.token, session.expiresAt);
    return c.json({ me: getMe(db, id) }, 201);
  });

  app.post("/api/auth/login", async (c) => {
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Email and password are required.", code: "invalid_input" }, 400);
    }
    const email = parsed.data.email.toLowerCase();
    const key = clientKey(c.req.raw.headers, `login:${email}`);
    if (!rateLimit(key, 20, 5 * 60_000)) {
      return c.json({ error: "Too many attempts. Wait a few minutes.", code: "rate_limited" }, 429);
    }

    const row = db.prepare("SELECT id, password_hash FROM profiles WHERE email = ?").get(email) as
      { id: string; password_hash: string } | undefined;

    if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
      return c.json({ error: "Email or password is incorrect.", code: "bad_credentials" }, 401);
    }

    purgeExpiredSessions(db);
    const session = createSession(db, row.id);
    sessionCookie(c, session.token, session.expiresAt);
    return c.json({ me: getMe(db, row.id) });
  });

  app.post("/api/auth/logout", (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) destroySession(db, token);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/api/auth/me", (c) => {
    const profile = c.get("profile");
    return c.json({ me: profile ? getMe(db, profile.id) : null });
  });

  app.all("/api/*", (c) => c.json({ error: "Not found", code: "not_found" }, 404));

  const dist = `${process.cwd()}/dist`;
  if (existsSync(dist)) {
    app.use("/*", serveStatic({ root: "./dist" }));
    app.get("*", serveStatic({ path: "./dist/index.html" }));
  }

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json({ error: error.message, code: error.code }, error.status);
    }
    console.error("API error", error);
    return c.json({ error: "Something went wrong on the press.", code: "server_error" }, 500);
  });

  return app;
}

export const SESSION_LIFETIME_DAYS = SESSION_DAYS;
