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
  cancelShiftAsSteward,
  checkInShift,
  claimResource,
  createInvite,
  createResource,
  createShift,
  expireResource,
  fulfilResource,
  getEdition,
  getMe,
  getShiftRoster,
  joinLeague,
  leaveLeague,
  listLeagueAnomalies,
  listLeagues,
  listMembers,
  listProjects,
  previewInvite,
  removeMember,
  redeemInvite,
  releaseResource,
  resolveLeagueAnomaly,
  reverseLedgerEntry,
  reviewProject,
  signupShift,
  submitProject,
  updateLeagueSettings,
  updateShift,
} from "./db/repository";
import { listStandings } from "./db/standings";
import { searchLeagues } from "./db/search";
import { listNotifications, markNotificationsRead, notify } from "./db/notifications";
import { createReport, handleReport, listReports, stewardHide } from "./db/moderation";
import {
  adminOverview,
  listAdminUsers,
  listAuditLog,
  listFeatureFlags,
  restoreProfile,
  restrictProfile,
  setFeatureFlag,
  setUserRole,
} from "./db/admin";
import { deleteAccount, exportAccount } from "./db/account";
import { getImpact } from "./db/impact";
import { listPublicLedger } from "./db/ledger";
import { newId } from "./db";
import type { Cause } from "../src/data/fixtures";
import type { StandingsScope } from "../src/lib/types";

type Variables = { profile: SessionUser | null };

const CAUSE_VALUES = ["climate", "safety", "food", "transit", "education", "housing", "health", "rights"] as const;

const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  email: z.string().trim().email().max(200),
  password: z.string().min(10).max(200),
  homeNeighborhood: z.string().trim().max(80).optional(),
  causes: z.array(z.enum(CAUSE_VALUES)).max(8).optional(),
  // Safeguarding: no account without an explicit age gate.
  ageConfirmed: z.boolean().refine((value) => value === true, "Confirm you are 16 or older."),
  ageBand: z.enum(["adult", "teen"]).default("adult"),
  guardianConsent: z.boolean().optional(),
});

const reportSchema = z.object({
  targetType: z.enum(["project", "resource", "shift", "league", "member"]),
  targetId: z.string().trim().min(1).max(120),
  reason: z.enum(["spam", "harassment", "safety", "misinformation", "other"]),
  detail: z.string().trim().max(500).optional(),
});

const reportDecisionSchema = z.object({
  decision: z.enum(["dismiss", "hide", "strike"]),
  note: z.string().trim().max(300).optional(),
});

const stewardHideSchema = z.object({
  note: z.string().trim().max(300).optional(),
});

const readNotificationsSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
});

const flagSchema = z.object({ enabled: z.boolean() });

const roleSchema = z.object({ role: z.enum(["member", "admin"]) });

const restrictSchema = z.object({
  days: z.number().int().min(1).max(90),
  reason: z.string().trim().max(200).optional(),
});

const deleteAccountSchema = z.object({
  confirm: z.literal("delete my account"),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

const checkInSchema = z.object({
  profileId: z.string().trim().min(1).max(80),
  status: z.enum(["attended", "no_show"]),
});

const shiftSchema = z.object({
  chapterId: z.string().trim().min(1).max(80),
  title: z.string().trim().min(3).max(80),
  day: z.number().int().min(0).max(6),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM."),
  duration: z.string().regex(/^\d+(?:\.\d+)?h$/, "Use a duration like 2h."),
  capacity: z.number().int().min(1).max(100),
  place: z.string().trim().min(2).max(80),
  bring: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
});

const projectSchema = z.object({
  chapterId: z.string().trim().min(1).max(80),
  title: z.string().trim().min(4).max(90),
  summary: z.string().trim().min(20).max(500),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  people: z.number().int().min(1).max(5000),
  hours: z.number().min(0).max(10000),
  amount: z.string().trim().max(60).optional(),
  evidenceUrl: z
    .string()
    .trim()
    .max(300)
    .refine((value) => value === "" || /^https?:\/\//i.test(value), "Use an http(s) link.")
    .optional(),
});

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

const standingsSchema = z.object({
  scope: z.enum(["global", "city", "cause", "chapter", "month"]).default("global"),
  cause: z.enum([...CAUSE_VALUES, "all"]).default("all"),
  city: z.string().trim().max(80).optional(),
  league: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const searchSchema = z.object({
  q: z.string().trim().max(80).default(""),
  cause: z.enum([...CAUSE_VALUES, "all"]).default("all"),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const ledgerQuerySchema = z.object({
  league: z.string().trim().max(80).optional(),
  type: z.string().trim().max(40).optional(),
  profile: z.string().trim().max(80).optional(),
  live: z.enum(["1"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const anomalyResolveSchema = z.object({
  decision: z.enum(["clear", "reverse"]),
  note: z.string().trim().max(300).optional(),
});

const reverseSchema = z.object({
  note: z.string().trim().max(300).optional(),
});

const settingsSchema = z.object({
  name: z.string().trim().min(3).max(80),
  motto: z.string().trim().max(120),
  cause: z.enum(CAUSE_VALUES),
  recruiting: z.boolean(),
  archived: z.boolean().optional(),
});

const inviteSchema = z.object({
  role: z.enum(["member", "steward"]),
  chapterId: z.string().trim().max(80).optional().or(z.literal("")),
  note: z.string().trim().max(120).optional(),
  days: z.number().int().min(1).max(30).optional(),
});

const resourceSchema = z.object({
  chapterId: z.string().trim().min(1).max(80),
  kind: z.enum(["offer", "want"]),
  title: z.string().trim().min(3).max(90),
  description: z.string().trim().max(500).optional(),
  quantity: z.string().trim().max(60).optional(),
  neededBy: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .optional()
    .or(z.literal("")),
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
    const city = db
      .prepare("SELECT id, name, slug, center_lat AS lat, center_lng AS lng FROM cities ORDER BY name LIMIT 1")
      .get() as { id: string; name: string; slug: string; lat: number | null; lng: number | null } | undefined;
    const neighborhoods = db.prepare("SELECT id, name, slug, lat, lng FROM neighborhoods ORDER BY name").all() as unknown as {
      id: string;
      name: string;
      slug: string;
      lat: number | null;
      lng: number | null;
    }[];
    return c.json({ city: city ?? null, neighborhoods });
  });

  app.get("/api/search", (c) => {
    const parsed = searchSchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "Check the search filters.", code: "invalid_query" }, 400);
    }
    const { q, cause, lat, lng, radiusKm, limit } = parsed.data;
    if ((lat === undefined) !== (lng === undefined)) {
      return c.json({ error: "Send both coordinates or neither.", code: "invalid_coordinates" }, 400);
    }
    return c.json(
      searchLeagues(db, {
        q,
        cause: cause as Cause | "all",
        origin: lat !== undefined && lng !== undefined ? { lat, lng } : null,
        radiusKm: radiusKm ?? null,
        limit,
      }),
    );
  });

  app.get("/api/edition", (c) => c.json(getEdition(db, c.get("profile")?.id ?? null)));

  app.get("/api/standings", (c) => {
    const parsed = standingsSchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "Check the leaderboard filters.", code: "invalid_query" }, 400);
    }
    const { scope, cause, city, league, limit, offset } = parsed.data;
    return c.json(
      listStandings(db, {
        scope: scope as StandingsScope,
        cause: cause as Cause | "all",
        cityId: city ?? null,
        leagueId: league ?? null,
        limit,
        offset,
      }),
    );
  });

  app.get("/api/impact", (c) => c.json(getImpact(db)));

  app.get("/api/leagues/:id/impact", (c) => {
    const league = listLeagues(db).find((item) => item.id === c.req.param("id") || item.slug === c.req.param("id"));
    if (!league) return c.json({ error: "League not found.", code: "league_not_found" }, 404);
    return c.json(getImpact(db, league.id));
  });

  app.get("/api/ledger", (c) => {
    const parsed = ledgerQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "Check the ledger filters.", code: "invalid_query" }, 400);
    }
    const { league, type, profile, live, limit, offset } = parsed.data;
    return c.json(
      listPublicLedger(db, {
        leagueId: league ?? null,
        refType: type ?? null,
        profileId: profile ?? null,
        limit,
        offset,
        liveOnly: live === "1",
      }),
    );
  });

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

  app.post("/api/leagues/:id/invites", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = inviteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Check the invitation details and try again.", code: "invalid_input" }, 400);
    }
    const { chapterId, ...rest } = parsed.data;
    return c.json(createInvite(db, profile.id, c.req.param("id"), { ...rest, chapterId: chapterId || undefined }), 201);
  });

  app.get("/api/invites/:token", (c) => {
    return c.json(previewInvite(db, c.req.param("token")));
  });

  app.post("/api/invites/:token/redeem", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(redeemInvite(db, profile.id, c.req.param("token")));
  });

  app.post("/api/shifts/:id/signup", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(signupShift(db, profile.id, c.req.param("id")));
  });

  app.delete("/api/shifts/:id/signup", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(cancelShift(db, profile.id, c.req.param("id")));
  });

  app.get("/api/shifts/:id/roster", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(getShiftRoster(db, profile.id, c.req.param("id")));
  });

  app.patch("/api/shifts/:id", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = shiftSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Check the shift details and try again.", code: "invalid_input" }, 400);
    }
    return c.json(updateShift(db, profile.id, c.req.param("id"), parsed.data));
  });

  app.delete("/api/leagues/:id/members/:profileId", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(removeMember(db, profile.id, c.req.param("id"), c.req.param("profileId")));
  });

  app.patch("/api/leagues/:id/settings", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = settingsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Check the league details and try again.", code: "invalid_input" }, 400);
    }
    return c.json(updateLeagueSettings(db, profile.id, c.req.param("id"), parsed.data));
  });

  app.post("/api/shifts/:id/check-in", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = checkInSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Choose a volunteer and an outcome.", code: "invalid_input" }, 400);
    }
    return c.json(checkInShift(db, profile.id, c.req.param("id"), parsed.data.profileId, parsed.data.status));
  });

  app.post("/api/leagues/:id/shifts", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = shiftSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Check the shift details and try again.", code: "invalid_input" }, 400);
    }
    return c.json(createShift(db, profile.id, c.req.param("id"), parsed.data), 201);
  });

  app.delete("/api/shifts/:id", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(cancelShiftAsSteward(db, profile.id, c.req.param("id")));
  });

  app.get("/api/leagues/:id/projects", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json({ projects: listProjects(db, profile.id, c.req.param("id")) });
  });

  app.post("/api/leagues/:id/projects", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = projectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Check the project details and try again.", code: "invalid_input" }, 400);
    }
    return c.json(submitProject(db, profile.id, c.req.param("id"), parsed.data), 201);
  });

  app.post("/api/projects/:id/review", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = reviewSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Choose approve or reject.", code: "invalid_input" }, 400);
    }
    return c.json(reviewProject(db, profile.id, c.req.param("id"), parsed.data.decision));
  });

  app.get("/api/leagues/:id/anomalies", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json({ anomalies: listLeagueAnomalies(db, profile.id, c.req.param("id")) });
  });

  app.post("/api/anomalies/:id/resolve", auth(), async (c) => {
    const profile = c.get("profile")!;
    if (!rateLimit(clientKey(c.req.raw.headers, "anomaly-resolve"), 60, 60_000)) {
      return c.json({ error: "Too many review actions. Wait a minute.", code: "rate_limited" }, 429);
    }
    const parsed = anomalyResolveSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Choose clear or reverse.", code: "invalid_input" }, 400);
    }
    return c.json(
      resolveLeagueAnomaly(db, profile.id, c.req.param("id"), parsed.data.decision, parsed.data.note ?? ""),
    );
  });

  app.post("/api/leagues/:id/ledger/:entryId/reverse", auth(), async (c) => {
    const profile = c.get("profile")!;
    if (!rateLimit(clientKey(c.req.raw.headers, "ledger-reverse"), 60, 60_000)) {
      return c.json({ error: "Too many corrections. Wait a minute.", code: "rate_limited" }, 429);
    }
    const parsed = reverseSchema.safeParse(await c.req.json().catch(() => null));
    return c.json(reverseLedgerEntry(db, profile.id, c.req.param("entryId"), parsed.success ? (parsed.data.note ?? "") : ""));
  });

  app.post("/api/leagues/:id/resources", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = resourceSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Check the classified details and try again.", code: "invalid_input" }, 400);
    }
    return c.json(createResource(db, profile.id, c.req.param("id"), parsed.data), 201);
  });

  app.post("/api/resources/:id/claim", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(claimResource(db, profile.id, c.req.param("id")));
  });

  app.post("/api/resources/:id/release", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(releaseResource(db, profile.id, c.req.param("id")));
  });

  app.post("/api/resources/:id/fulfil", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(fulfilResource(db, profile.id, c.req.param("id")));
  });

  app.post("/api/resources/:id/expire", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(expireResource(db, profile.id, c.req.param("id")));
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
    const { displayName, password, homeNeighborhood, causes, ageBand, guardianConsent } = parsed.data;
    const email = parsed.data.email.toLowerCase();

    if (ageBand === "teen" && !guardianConsent) {
      return c.json(
        {
          error: "A neighbour under 18 needs a guardian's consent before opening an account.",
          code: "guardian_required",
        },
        400,
      );
    }

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
      `INSERT INTO profiles (
         id, email, password_hash, handle, display_name, city_id, home_neighborhood, causes,
         age_band, guardian_consent
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      email,
      hashPassword(password),
      handle,
      displayName,
      city?.id ?? null,
      homeNeighborhood ?? null,
      JSON.stringify(causes ?? []),
      ageBand,
      guardianConsent ? 1 : 0,
    );

    notify(db, {
      profileId: id,
      kind: "welcome",
      title: "Welcome to the Leagues",
      body:
        ageBand === "teen"
          ? "Your account is open. A guardian's consent is on file. Contact details stay private; rosters show your name only."
          : "Your account is open. Find a league on the Atlas, sign a charter, and claim a shift.",
      refType: "profile",
      refId: id,
    });

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

  // ---- The inbox ---------------------------------------------------------

  app.get("/api/notifications", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(listNotifications(db, profile.id));
  });

  app.post("/api/notifications/read", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = readNotificationsSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Check the notification selection.", code: "invalid_input" }, 400);
    }
    const updated = markNotificationsRead(db, profile.id, parsed.data.ids);
    return c.json({ updated, unread: listNotifications(db, profile.id).unread });
  });

  // ---- Moderation --------------------------------------------------------

  app.post("/api/reports", auth(), async (c) => {
    const profile = c.get("profile")!;
    if (!rateLimit(clientKey(c.req.raw.headers, "report"), 12, 60_000)) {
      return c.json({ error: "Too many reports. Wait a minute.", code: "rate_limited" }, 429);
    }
    const parsed = reportSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Choose what is wrong and try again.", code: "invalid_input" }, 400);
    }
    return c.json(createReport(db, profile.id, parsed.data), 201);
  });

  app.post("/api/moderation/hide", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = stewardHideSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Check the moderation note.", code: "invalid_input" }, 400);
    }
    const targetType = c.req.query("targetType");
    const targetId = c.req.query("targetId");
    if (!targetType || !targetId) {
      return c.json({ error: "Name the item to hide.", code: "invalid_input" }, 400);
    }
    return c.json(
      stewardHide(
        db,
        profile.id,
        targetType as Parameters<typeof stewardHide>[2],
        targetId,
        parsed.data.note ?? "",
      ),
    );
  });

  // ---- The editor's desk -------------------------------------------------

  app.get("/api/admin/overview", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(adminOverview(db, profile.id));
  });

  app.get("/api/admin/reports", auth(), (c) => {
    const profile = c.get("profile")!;
    const status = c.req.query("status") ?? "open";
    const allowed = ["open", "actioned", "dismissed", "all"] as const;
    if (!allowed.includes(status as (typeof allowed)[number])) {
      return c.json({ error: "Unknown report status.", code: "invalid_query" }, 400);
    }
    return c.json({ reports: listReports(db, profile.id, status as (typeof allowed)[number]) });
  });

  app.post("/api/admin/reports/:id", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = reportDecisionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Choose dismiss, hide, or strike.", code: "invalid_input" }, 400);
    }
    return c.json(handleReport(db, profile.id, c.req.param("id"), parsed.data.decision, parsed.data.note ?? ""));
  });

  app.get("/api/admin/users", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json({ users: listAdminUsers(db, profile.id, c.req.query("q") ?? "") });
  });

  app.post("/api/admin/users/:id/role", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = roleSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Choose member or editor.", code: "invalid_input" }, 400);
    }
    return c.json(setUserRole(db, profile.id, c.req.param("id"), parsed.data.role));
  });

  app.post("/api/admin/users/:id/restrict", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = restrictSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Choose a pause between 1 and 90 days.", code: "invalid_input" }, 400);
    }
    return c.json(restrictProfile(db, profile.id, c.req.param("id"), parsed.data.days, parsed.data.reason ?? ""));
  });

  app.post("/api/admin/users/:id/restore", auth(), (c) => {
    const profile = c.get("profile")!;
    return c.json(restoreProfile(db, profile.id, c.req.param("id")));
  });

  app.get("/api/admin/flags", auth(), (c) => {
    const profile = c.get("profile")!;
    adminOverview(db, profile.id);
    return c.json({ flags: listFeatureFlags(db) });
  });

  app.patch("/api/admin/flags/:key", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = flagSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "A flag is either on or off.", code: "invalid_input" }, 400);
    }
    return c.json(setFeatureFlag(db, profile.id, c.req.param("key"), parsed.data.enabled));
  });

  app.get("/api/admin/audit", auth(), (c) => {
    const profile = c.get("profile")!;
    const limit = Number(c.req.query("limit") ?? 100);
    return c.json({ entries: listAuditLog(db, profile.id, Number.isFinite(limit) ? limit : 100) });
  });

  // ---- Your data ---------------------------------------------------------

  app.get("/api/me/export", auth(), (c) => {
    const profile = c.get("profile")!;
    c.header("content-disposition", 'attachment; filename="justice-leagues-export.json"');
    return c.json(exportAccount(db, profile.id));
  });

  app.delete("/api/me", auth(), async (c) => {
    const profile = c.get("profile")!;
    const parsed = deleteAccountSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        { error: 'Type "delete my account" to confirm. Your ledger history stays anonymous.', code: "confirm_required" },
        400,
      );
    }
    deleteAccount(db, profile.id);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ deleted: true });
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
