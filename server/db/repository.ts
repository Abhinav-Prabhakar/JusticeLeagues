import { createHash, randomBytes } from "node:crypto";
import { newId, transaction, type Db } from "../db";
import { AppError } from "./errors";
import { shiftStart } from "./schedule";
import { evaluateBadges, listBadges, streakForProfile } from "./badges";
import {
  audit,
  detectAwardAnomalies,
  listAnomalyRows,
  readAnomaly,
  recordReversal,
  resolveAnomalyRow,
} from "./anomalies";
import { rebuildStandings } from "./standings";
import { rebuildLeagueSearch } from "./search-index";
import { notify, notifyLeagueStewards, unreadCount } from "./notifications";
import { featureMap } from "./admin";
import { assertNotRestricted } from "./guards";
import type {
  AnomalyDTO,
  ChapterDTO,
  EditionDTO,
  LeagueDTO,
  LeagueMemberDTO,
  LedgerEntryDTO,
  MeDTO,
  MembershipDTO,
  CreatedInviteDTO,
  InvitePreviewDTO,
  InviteRole,
  InviteStatus,
  ProjectDTO,
  ProjectStatus,
  ResourceDTO,
  ResourceKind,
  ResourceStatus,
  ShiftDTO,
  ShiftRosterDTO,
  ShiftRosterEntryDTO,
  SignupDTO,
  WinDTO,
} from "../../src/lib/types";
import type { Cause } from "../../src/data/fixtures";
import { CITY_CENTRE, hoodCoords } from "../../src/data/geo";
import { projectPoints, type ProjectFacts } from "../../src/data/projects";

export const JOIN_POINTS = 25;
export const ATTENDANCE_POINTS_PER_HOUR = 12;
export const ATTENDANCE_POINTS_CAP = 80;
export const DAILY_CHECKIN_CAP = 5;

export { AppError } from "./errors";

interface LeagueRow {
  id: string;
  slug: string;
  name: string;
  cause: Cause;
  motto: string;
  founded_year: number;
  photo_id: number;
  atlas_x: number;
  atlas_y: number;
  lat: number | null;
  lng: number | null;
  delta: number;
  trend: string;
  base_points: number;
  base_city_points: number;
  base_month_points: number;
  base_members: number;
  base_projects: number;
  base_hours: number;
  base_streak: number;
  recruiting: number;
  hood: string;
  ledger_points: number;
  month_points: number;
  prev_month_points: number;
  member_count: number;
  project_count: number;
  hours_count: number;
  streak_count: number;
  trend_json: string;
  rank_global: number | null;
  rank_month: number | null;
  local_projects: number;
}

interface ChapterRow {
  id: string;
  league_id: string;
  name: string;
  hood: string;
  base_points: number;
  status: "active" | "dormant";
  lat: number | null;
  lng: number | null;
  hood_lat: number | null;
  hood_lng: number | null;
  ledger_points: number;
}

interface ShiftRow {
  id: string;
  league_id: string;
  chapter_id: string;
  title: string;
  day: number;
  starts_at: string;
  duration: string;
  place_name: string;
  capacity: number;
  base_filled: number;
  bring: string;
  signup_count: number;
  waitlist_count: number;
}

interface WinRow {
  id: string;
  league_id: string;
  chapter_id: string | null;
  title: string;
  points: number;
  photo_id: number;
  facts: string;
  occurred_at: string;
  summary: string;
  evidence_url: string | null;
  submitted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  status: ProjectStatus;
  created_at: string;
}

interface ProfileRow {
  id: string;
  email: string;
  handle: string;
  display_name: string;
  bio: string;
  home_neighborhood: string | null;
  causes: string;
  role: "member" | "admin";
  age_band: "adult" | "teen";
  restricted_until: string | null;
  created_at: string;
}

const ACTIVE_SIGNUP = "('reserved','confirmed','attended')";

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeOfDay(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Month-to-date points are compared on a full-month pace, so the first week
 * of a month does not read as a collapse against a complete previous month.
 */
function monthDelta(month: number, previous: number, now = new Date()): number {
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsed = now.getUTCDate();
  const pace = elapsed > 0 ? (month * daysInMonth) / elapsed : month;
  if (previous > 0) return Math.round(((pace - previous) / previous) * 100);
  return pace > 0 ? 100 : 0;
}

export function listLeagues(db: Db): LeagueDTO[] {
  const rows = db
    .prepare(
      `SELECT l.*, n.name AS hood,
        COALESCE(s.points, (SELECT COALESCE(SUM(p.delta), 0) FROM points_ledger p WHERE p.league_id = l.id), 0) AS ledger_points,
        COALESCE(s.month_points, 0) AS month_points,
        COALESCE(s.prev_month_points, 0) AS prev_month_points,
        COALESCE(s.members, l.base_members + (SELECT COUNT(*) FROM league_members m
                   WHERE m.league_id = l.id AND m.status = 'active'), 0) AS member_count,
        COALESCE(s.projects, l.base_projects + (SELECT COUNT(*) FROM wins w
                   WHERE w.league_id = l.id AND w.status = 'approved' AND w.submitted_by IS NOT NULL), 0) AS project_count,
        COALESCE(s.hours, l.base_hours) AS hours_count,
        COALESCE(s.streak, l.base_streak) AS streak_count,
        COALESCE(s.trend, l.trend) AS trend_json,
        s.rank_global, s.rank_month,
        COALESCE((SELECT COUNT(*) FROM wins w
                   WHERE w.league_id = l.id AND w.status = 'approved'
                     AND w.submitted_by IS NOT NULL), 0) AS local_projects
       FROM leagues l
       JOIN chapters c ON c.id = 'ch_' || l.id
       JOIN neighborhoods n ON n.id = c.neighborhood_id
       LEFT JOIN league_standings s ON s.league_id = l.id
       WHERE l.status = 'active'
       ORDER BY ledger_points DESC, l.id`,
    )
    .all() as unknown as LeagueRow[];

  const chapters = db
    .prepare(
      `SELECT c.*, n.name AS hood, n.lat AS hood_lat, n.lng AS hood_lng,
        COALESCE(cs.points, (SELECT COALESCE(SUM(p.delta), 0) FROM points_ledger p WHERE p.chapter_id = c.id), 0) AS ledger_points
       FROM chapters c
       JOIN neighborhoods n ON n.id = c.neighborhood_id
       LEFT JOIN chapter_standings cs ON cs.chapter_id = c.id
       ORDER BY c.league_id, (c.id = 'ch_' || c.league_id) DESC, c.name`,
    )
    .all() as unknown as ChapterRow[];

  const byLeague = new Map<string, ChapterDTO[]>();
  for (const chapter of chapters) {
    const list = byLeague.get(chapter.league_id) ?? [];
    list.push({
      id: chapter.id,
      leagueId: chapter.league_id,
      name: chapter.name,
      hood: chapter.hood,
      points: chapter.ledger_points,
      status: chapter.status,
      lat: chapter.lat ?? chapter.hood_lat ?? hoodCoords(chapter.hood)?.lat ?? CITY_CENTRE.lat,
      lng: chapter.lng ?? chapter.hood_lng ?? hoodCoords(chapter.hood)?.lng ?? CITY_CENTRE.lng,
    });
    byLeague.set(chapter.league_id, list);
  }

  return rows.map((row, index) => {
    const month = Number(row.month_points) || 0;
    const previous = Number(row.prev_month_points) || 0;
    const coords = hoodCoords(row.hood);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      cause: row.cause,
      hood: row.hood,
      points: Number(row.ledger_points) || 0,
      city: Number(row.ledger_points) || 0,
      month,
      delta: monthDelta(month, previous),
      trend: JSON.parse(row.trend_json) as number[],
      members: Number(row.member_count) || 0,
      projects: Number(row.project_count) || 0,
      streak: Number(row.streak_count) || 0,
      hours: Number(row.hours_count) || 0,
      photo: row.photo_id,
      x: row.atlas_x,
      y: row.atlas_y,
      lat: row.lat ?? coords?.lat ?? CITY_CENTRE.lat,
      lng: row.lng ?? coords?.lng ?? CITY_CENTRE.lng,
      founded: row.founded_year,
      recruiting: row.recruiting === 1,
      motto: row.motto,
      rank: row.rank_global ?? index + 1,
      monthRank: row.rank_month ?? undefined,
      chapters: byLeague.get(row.id) ?? [],
    };
  });
}

export function listShifts(db: Db, profileId: string | null = null): ShiftDTO[] {
  const rows = db
    .prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM shift_signups ss
          WHERE ss.shift_id = s.id AND ss.status IN ${ACTIVE_SIGNUP}) AS signup_count,
        (SELECT COUNT(*) FROM shift_signups w
          WHERE w.shift_id = s.id AND w.status = 'waitlist') AS waitlist_count
       FROM shifts s
       WHERE s.status IN ('open', 'full')
       ORDER BY s.starts_at`,
    )
    .all() as unknown as ShiftRow[];

  const waitlistPosition = profileId
    ? db.prepare(
        `SELECT (SELECT COUNT(*) FROM shift_signups w
                  WHERE w.shift_id = me.shift_id AND w.status = 'waitlist' AND w.rowid < me.rowid) + 1 AS position,
                me.shift_id
           FROM shift_signups me
          WHERE me.profile_id = ? AND me.status = 'waitlist'`,
      )
    : null;
  const positions = new Map<string, number>();
  if (waitlistPosition) {
    for (const row of waitlistPosition.all(profileId) as unknown as { shift_id: string; position: number }[]) {
      positions.set(row.shift_id, row.position);
    }
  }

  return rows.map((row) => {
    const filled = Math.min(row.capacity, row.base_filled + row.signup_count);
    return {
      id: row.id,
      league: row.league_id,
      chapterId: row.chapter_id,
      title: row.title,
      day: row.day,
      startsAt: row.starts_at,
      time: timeOfDay(row.starts_at),
      dur: row.duration,
      place: row.place_name,
      spots: row.capacity,
      filled,
      waitlist: row.waitlist_count,
      waitlistPosition: positions.get(row.id) ?? null,
      bring: JSON.parse(row.bring) as ShiftDTO["bring"],
    };
  });
}

export function listWins(db: Db): WinDTO[] {
  const rows = db
    .prepare("SELECT * FROM wins WHERE status = 'approved' AND hidden = 0 ORDER BY occurred_at DESC")
    .all() as unknown as WinRow[];
  return rows.map((row) => ({
    id: row.id,
    league: row.league_id,
    title: row.title,
    jp: row.points,
    photo: row.photo_id,
    when: relativeTime(row.occurred_at),
    facts: JSON.parse(row.facts) as WinDTO["facts"],
    chapterId: row.chapter_id,
    summary: row.summary,
    evidenceUrl: row.evidence_url,
  }));
}

function profileFromRow(row: ProfileRow) {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    email: row.email,
    bio: row.bio,
    homeNeighborhood: row.home_neighborhood,
    causes: JSON.parse(row.causes) as Cause[],
    role: row.role,
    ageBand: row.age_band,
    restrictedUntil:
      row.restricted_until && row.restricted_until > new Date().toISOString() ? row.restricted_until : null,
    createdAt: row.created_at,
  };
}

export function getMe(db: Db, profileId: string): MeDTO {
  const row = db.prepare("SELECT * FROM profiles WHERE id = ?").get(profileId) as ProfileRow | undefined;
  if (!row) throw new AppError(401, "unauthenticated", "Session no longer valid.");

  const memberships = db
    .prepare(
      `SELECT m.league_id, m.chapter_id, m.role, m.status, m.joined_at,
        COALESCE((SELECT SUM(p.delta) FROM points_ledger p
                   WHERE p.profile_id = m.profile_id AND p.league_id = m.league_id), 0) AS points
         FROM league_members m WHERE m.profile_id = ? ORDER BY m.joined_at`,
    )
    .all(profileId) as unknown as {
    league_id: string;
    chapter_id: string | null;
    role: MembershipDTO["role"];
    status: MembershipDTO["status"];
    joined_at: string;
    points: number;
  }[];

  const signups = db
    .prepare(
      `SELECT shift_id, status, created_at FROM shift_signups
        WHERE profile_id = ? AND status != 'cancelled' ORDER BY created_at`,
    )
    .all(profileId) as unknown as { shift_id: string; status: SignupDTO["status"]; created_at: string }[];

  const { points } = db
    .prepare("SELECT COALESCE(SUM(delta), 0) AS points FROM points_ledger WHERE profile_id = ?")
    .get(profileId) as { points: number };

  const ledger = db
    .prepare(
      `SELECT p.id, p.delta, p.reason, p.league_id, l.name AS league_name, p.created_at
         FROM points_ledger p JOIN leagues l ON l.id = p.league_id
        WHERE p.profile_id = ? ORDER BY p.created_at DESC, p.id DESC LIMIT 25`,
    )
    .all(profileId) as unknown as {
    id: string;
    delta: number;
    reason: string;
    league_id: string;
    league_name: string;
    created_at: string;
  }[];

  return {
    profile: profileFromRow(row),
    memberships: memberships.map((m) => ({
      leagueId: m.league_id,
      chapterId: m.chapter_id,
      role: m.role,
      status: m.status,
      joinedAt: m.joined_at,
      points: m.points,
    })),
    signups: signups.map((s) => ({ shiftId: s.shift_id, status: s.status, createdAt: s.created_at })),
    points: Number(points) || 0,
    ledger: ledger.map((entry): LedgerEntryDTO => ({
      id: entry.id,
      delta: entry.delta,
      reason: entry.reason,
      leagueId: entry.league_id,
      leagueName: entry.league_name,
      createdAt: entry.created_at,
    })),
    badges: listBadges(db, profileId),
    streak: streakForProfile(db, profileId),
    unread: unreadCount(db, profileId),
  };
}

export function getEdition(db: Db, profileId: string | null): EditionDTO {
  return {
    leagues: listLeagues(db),
    shifts: listShifts(db, profileId),
    wins: listWins(db),
    resources: listResources(db),
    me: profileId ? getMe(db, profileId) : null,
    flags: featureMap(db),
  };
}

export function listMembers(db: Db, leagueId: string): LeagueMemberDTO[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.handle, p.display_name, p.age_band, m.role, m.chapter_id, m.joined_at
         FROM league_members m JOIN profiles p ON p.id = m.profile_id
        WHERE m.league_id = ? AND m.status = 'active'
        ORDER BY m.joined_at`,
    )
    .all(leagueId) as unknown as {
    id: string;
    handle: string;
    display_name: string;
    age_band: string;
    role: LeagueMemberDTO["role"];
    chapter_id: string | null;
    joined_at: string;
  }[];

  return rows.map((row) => {
    const minor = row.age_band === "teen";
    return {
      profile: { id: row.id, handle: minor ? "" : row.handle, displayName: row.display_name, minor },
      role: row.role,
      chapterId: row.chapter_id,
      joinedAt: row.joined_at,
    };
  });
}

function award(
  db: Db,
  entry: {
    profileId: string;
    leagueId: string;
    chapterId: string | null;
    delta: number;
    reason: string;
    refType: string;
    refId: string;
    key: string;
  },
): boolean {
  const id = newId("pts");
  try {
    db.prepare(
      `INSERT INTO points_ledger
         (id, profile_id, league_id, chapter_id, delta, reason, ref_type, ref_id, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, entry.profileId, entry.leagueId, entry.chapterId, entry.delta, entry.reason, entry.refType, entry.refId, entry.key);
  } catch (error) {
    if ((error as Error).message.includes("UNIQUE")) return false;
    throw error;
  }

  // One ledger write, one cache rebuild. Standings are never computed by a
  // browser and never drift from the append-only record.
  rebuildStandings(db);
  evaluateBadges(db, entry.profileId);
  detectAwardAnomalies(db, {
    ledgerId: id,
    profileId: entry.profileId,
    leagueId: entry.leagueId,
    delta: entry.delta,
    refType: entry.refType,
    refId: entry.refId,
    createdAt: new Date().toISOString(),
  });
  return true;
}

function joinWithinTransaction(db: Db, profileId: string, leagueId: string): boolean {
  const league = db.prepare("SELECT id, name, status, recruiting FROM leagues WHERE id = ?").get(leagueId) as
    | { id: string; name: string; status: string; recruiting: number }
    | undefined;
  if (!league || league.status !== "active") {
    throw new AppError(404, "league_not_found", "That league is not in this edition.");
  }
  if (league.recruiting !== 1) {
    throw new AppError(409, "league_closed", "This league is not taking new members right now.");
  }

  // Prefer the member's home chapter; otherwise file them under the founding
  // chapter. Pass the profile so home_neighborhood resolves in one query.
  const chapter = db
    .prepare(
      `SELECT c.id
         FROM chapters c
         JOIN profiles p ON p.id = ?
        WHERE c.league_id = ?
        ORDER BY CASE
                   WHEN c.neighborhood_id = p.home_neighborhood THEN 0
                   WHEN c.id = 'ch_' || c.league_id THEN 1
                   ELSE 2
                 END,
                 c.name
        LIMIT 1`,
    )
    .get(profileId, leagueId) as { id: string } | undefined;

  const existing = db
    .prepare("SELECT status FROM league_members WHERE league_id = ? AND profile_id = ?")
    .get(leagueId, profileId) as { status: string } | undefined;

  if (existing?.status === "active") return false;

  if (existing) {
    db.prepare("UPDATE league_members SET status = 'active', joined_at = ? WHERE league_id = ? AND profile_id = ?").run(
      new Date().toISOString(),
      leagueId,
      profileId,
    );
  } else {
    db.prepare(
      "INSERT INTO league_members (league_id, profile_id, chapter_id, role, status) VALUES (?, ?, ?, 'member', 'active')",
    ).run(leagueId, profileId, chapter?.id ?? null);
  }

  award(db, {
    profileId,
    leagueId,
    chapterId: chapter?.id ?? null,
    delta: JOIN_POINTS,
    reason: "Signed the league charter",
    refType: "league_join",
    refId: leagueId,
    key: `join:${leagueId}:${profileId}`,
  });

  const member = db.prepare("SELECT display_name FROM profiles WHERE id = ?").get(profileId) as
    | { display_name: string }
    | undefined;
  notify(db, {
    profileId,
    kind: "join",
    title: `Charter signed: ${league.name}`,
    body: `You are on the roster. ${JOIN_POINTS} Justice Points are on your ledger. Open the league to claim a shift.`,
    leagueId,
    refType: "league",
    refId: leagueId,
  });
  notifyLeagueStewards(db, leagueId, {
    kind: "join",
    title: "A neighbour joined",
    body: `${member?.display_name ?? "A new member"} signed the charter. Say hello on the roster.`,
    excludeProfileId: profileId,
    refType: "profile",
    refId: profileId,
  });
  return true;
}

export function joinLeague(db: Db, profileId: string, leagueId: string): { joined: boolean; awarded: boolean } {
  return transaction(db, () => ({ joined: true, awarded: joinWithinTransaction(db, profileId, leagueId) }));
}

export function leaveLeague(db: Db, profileId: string, leagueId: string): { joined: false } {
  transaction(db, () => {
    const result = db
      .prepare("UPDATE league_members SET status = 'left' WHERE league_id = ? AND profile_id = ? AND status = 'active'")
      .run(leagueId, profileId);
    if (Number(result.changes) === 0) {
      throw new AppError(409, "not_a_member", "You are not on this league's roster.");
    }
    rebuildStandings(db);
  });
  return { joined: false };
}

function waitlistPositionFor(db: Db, shiftId: string, profileId: string): number | null {
  const row = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM shift_signups w
                WHERE w.shift_id = me.shift_id AND w.status = 'waitlist' AND w.rowid < me.rowid) + 1 AS position
         FROM shift_signups me
        WHERE me.shift_id = ? AND me.profile_id = ? AND me.status = 'waitlist'`,
    )
    .get(shiftId, profileId) as { position: number } | undefined;
  return row?.position ?? null;
}

/** Move the earliest waitlisted volunteer into a free spot. Returns true if someone moved. */
function promoteWaitlist(db: Db, shiftId: string): boolean {
  const shift = db
    .prepare("SELECT title, league_id, place_name, starts_at, capacity, base_filled, status FROM shifts WHERE id = ?")
    .get(shiftId) as
    | {
        title: string;
        league_id: string;
        place_name: string;
        starts_at: string;
        capacity: number;
        base_filled: number;
        status: string;
      }
    | undefined;
  if (!shift || shift.status !== "open") return false;

  const { count } = db
    .prepare(`SELECT COUNT(*) AS count FROM shift_signups WHERE shift_id = ? AND status IN ${ACTIVE_SIGNUP}`)
    .get(shiftId) as { count: number };
  if (shift.base_filled + count >= shift.capacity) return false;

  const next = db
    .prepare("SELECT profile_id FROM shift_signups WHERE shift_id = ? AND status = 'waitlist' ORDER BY rowid LIMIT 1")
    .get(shiftId) as { profile_id: string } | undefined;
  if (!next) return false;

  db.prepare("UPDATE shift_signups SET status = 'reserved', updated_at = ? WHERE shift_id = ? AND profile_id = ?").run(
    new Date().toISOString(),
    shiftId,
    next.profile_id,
  );
  notify(db, {
    profileId: next.profile_id,
    kind: "promotion",
    title: `You're off the waitlist: ${shift.title}`,
    body: `A spot opened. ${new Date(shift.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${shift.place_name}.`,
    leagueId: shift.league_id,
    refType: "shift",
    refId: shiftId,
  });
  return true;
}

export function signupShift(
  db: Db,
  profileId: string,
  shiftId: string,
): { status: "signed_up" | "waitlisted" | "already"; filled: number; autoJoined: boolean; position: number | null } {
  return transaction(db, () => {
    assertNotRestricted(db, profileId);
    const shift = db
      .prepare(
        "SELECT id, league_id, title, place_name, starts_at, capacity, base_filled, status FROM shifts WHERE id = ?",
      )
      .get(shiftId) as
      | {
          id: string;
          league_id: string;
          title: string;
          place_name: string;
          starts_at: string;
          capacity: number;
          base_filled: number;
          status: string;
        }
      | undefined;
    if (!shift) throw new AppError(404, "shift_not_found", "That shift is no longer posted.");
    if (shift.status !== "open") throw new AppError(409, "shift_closed", "This shift is not taking signups.");

    const existing = db
      .prepare("SELECT status FROM shift_signups WHERE shift_id = ? AND profile_id = ?")
      .get(shiftId, profileId) as { status: string } | undefined;

    const { count } = db
      .prepare(
        `SELECT COUNT(*) AS count FROM shift_signups
          WHERE shift_id = ? AND status IN ${ACTIVE_SIGNUP}`,
      )
      .get(shiftId) as { count: number };

    if (existing && ["reserved", "confirmed", "attended"].includes(existing.status)) {
      return {
        status: "already" as const,
        filled: Math.min(shift.capacity, shift.base_filled + count),
        autoJoined: false,
        position: null,
      };
    }

    if (existing?.status === "waitlist") {
      return {
        status: "waitlisted" as const,
        filled: Math.min(shift.capacity, shift.base_filled + count),
        autoJoined: false,
        position: waitlistPositionFor(db, shiftId, profileId),
      };
    }

    const member = db
      .prepare("SELECT status FROM league_members WHERE league_id = ? AND profile_id = ?")
      .get(shift.league_id, profileId) as { status: string } | undefined;

    let autoJoined = false;
    if (member?.status !== "active") {
      autoJoined = joinWithinTransaction(db, profileId, shift.league_id);
    }

    const full = shift.base_filled + count >= shift.capacity;
    const nextStatus = full ? "waitlist" : "reserved";

    if (existing) {
      // A volunteer who left and comes back goes to the back of the line:
      // reinserting gives the row a fresh rowid, which is the queue order.
      db.prepare("DELETE FROM shift_signups WHERE shift_id = ? AND profile_id = ?").run(shiftId, profileId);
    }
    db.prepare("INSERT INTO shift_signups (shift_id, profile_id, status) VALUES (?, ?, ?)").run(
      shiftId,
      profileId,
      nextStatus,
    );

    const when = new Date(shift.starts_at).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    notify(db, {
      profileId,
      kind: full ? "waitlist" : "shift",
      title: full ? `Waitlisted: ${shift.title}` : `Shift claimed: ${shift.title}`,
      body: full
        ? `The shift is full, so you are in line. We will tell you the moment a spot opens. ${when} at ${shift.place_name}.`
        : `${when} at ${shift.place_name}. A steward records attendance, so points land after the shift.`,
      leagueId: shift.league_id,
      refType: "shift",
      refId: shiftId,
    });
    notify(db, {
      profileId,
      kind: "reminder",
      title: `Reminder set: ${shift.title}`,
      body: `${when} at ${shift.place_name}. It stays on your desk until a steward checks you in.`,
      leagueId: shift.league_id,
      refType: "shift",
      refId: shiftId,
    });

    return {
      status: full ? ("waitlisted" as const) : ("signed_up" as const),
      filled: Math.min(shift.capacity, shift.base_filled + count + (full ? 0 : 1)),
      autoJoined,
      position: full ? waitlistPositionFor(db, shiftId, profileId) : null,
    };
  });
}

export function cancelShift(db: Db, profileId: string, shiftId: string): { signedUp: false; promoted: boolean } {
  return transaction(db, () => {
    const existing = db
      .prepare("SELECT status FROM shift_signups WHERE shift_id = ? AND profile_id = ?")
      .get(shiftId, profileId) as { status: string } | undefined;
    if (existing && (existing.status === "attended" || existing.status === "no_show")) {
      throw new AppError(409, "attendance_locked", "A steward already recorded this shift. The record is final.");
    }

    const result = db
      .prepare(
        `UPDATE shift_signups SET status = 'cancelled', updated_at = ?
          WHERE shift_id = ? AND profile_id = ? AND status IN ('reserved','confirmed','waitlist')`,
      )
      .run(new Date().toISOString(), shiftId, profileId);
    if (Number(result.changes) === 0) {
      throw new AppError(409, "not_signed_up", "You are not on this shift.");
    }

    return { signedUp: false as const, promoted: existing?.status !== "waitlist" && promoteWaitlist(db, shiftId) };
  });
}

/** "2h" → 2, "1.5h" → 1.5. Seeded shifts all carry an hour suffix. */
function hoursFromDuration(duration: string): number {
  const match = duration.match(/(\d+(?:\.\d+)?)\s*h/i);
  return match ? Number(match[1]) : 2;
}

function assertMember(db: Db, profileId: string, leagueId: string) {
  const row = db
    .prepare("SELECT 1 FROM league_members WHERE league_id = ? AND profile_id = ? AND status = 'active'")
    .get(leagueId, profileId);
  if (!row) throw new AppError(403, "not_member", "Join the league before filing a project.");
}

export function assertSteward(db: Db, profileId: string, leagueId: string) {
  const row = db
    .prepare("SELECT role FROM league_members WHERE league_id = ? AND profile_id = ? AND status = 'active'")
    .get(leagueId, profileId) as { role: string } | undefined;
  if (row?.role !== "owner" && row?.role !== "steward") {
    throw new AppError(403, "not_steward", "Only a league steward can see or record attendance.");
  }
}

interface RosterShiftRow {
  id: string;
  league_id: string;
  chapter_id: string;
  title: string;
  day: number;
  starts_at: string;
  duration: string;
  place_name: string;
  capacity: number;
  base_filled: number;
  bring: string;
}

function readRoster(db: Db, shiftId: string): ShiftRosterDTO {
  const shift = db.prepare("SELECT * FROM shifts WHERE id = ?").get(shiftId) as RosterShiftRow | undefined;
  if (!shift) throw new AppError(404, "shift_not_found", "That shift is no longer posted.");

  const { count } = db
    .prepare(`SELECT COUNT(*) AS count FROM shift_signups WHERE shift_id = ? AND status IN ${ACTIVE_SIGNUP}`)
    .get(shiftId) as { count: number };

  const rows = db
    .prepare(
      `SELECT ss.status, ss.hours, ss.checked_in_at, p.id, p.handle, p.display_name, p.age_band
         FROM shift_signups ss
         JOIN profiles p ON p.id = ss.profile_id
        WHERE ss.shift_id = ?
          AND ss.status IN ('reserved', 'confirmed', 'waitlist', 'attended', 'no_show')
        ORDER BY CASE ss.status
                   WHEN 'attended' THEN 0
                   WHEN 'no_show' THEN 1
                   WHEN 'confirmed' THEN 2
                   ELSE 3
                 END,
                 p.display_name`,
    )
    .all(shiftId) as unknown as {
    status: ShiftRosterEntryDTO["status"];
    hours: number;
    checked_in_at: string | null;
    id: string;
    handle: string;
    display_name: string;
    age_band: string;
  }[];

  return {
    shift: {
      id: shift.id,
      league: shift.league_id,
      chapterId: shift.chapter_id,
      title: shift.title,
      day: shift.day,
      startsAt: shift.starts_at,
      time: timeOfDay(shift.starts_at),
      dur: shift.duration,
      place: shift.place_name,
      spots: shift.capacity,
      filled: Math.min(shift.capacity, shift.base_filled + count),
      waitlist: rows.filter((row) => row.status === "waitlist").length,
      waitlistPosition: null,
      bring: JSON.parse(shift.bring) as ShiftDTO["bring"],
    },
    pointsPerHour: ATTENDANCE_POINTS_PER_HOUR,
    sealed: shift.base_filled,
    entries: rows.map((row) => ({
      profile: {
        id: row.id,
        handle: maskHandle(row.handle, row.age_band, row.id),
        displayName: row.display_name,
        minor: row.age_band === "teen",
      },
      status: row.status,
      hours: row.hours,
      checkedInAt: row.checked_in_at,
    })),
  };
}

export function getShiftRoster(db: Db, actorId: string, shiftId: string): ShiftRosterDTO {
  const shift = db.prepare("SELECT league_id FROM shifts WHERE id = ?").get(shiftId) as
    { league_id: string } | undefined;
  if (!shift) throw new AppError(404, "shift_not_found", "That shift is no longer posted.");
  assertSteward(db, actorId, shift.league_id);
  return readRoster(db, shiftId);
}

export function checkInShift(
  db: Db,
  actorId: string,
  shiftId: string,
  profileId: string,
  status: "attended" | "no_show",
): { awarded: number; roster: ShiftRosterDTO } {
  return transaction(db, () => {
    const shift = db.prepare("SELECT id, league_id, title, duration FROM shifts WHERE id = ?").get(shiftId) as
      { id: string; league_id: string; title: string; duration: string } | undefined;
    if (!shift) throw new AppError(404, "shift_not_found", "That shift is no longer posted.");
    assertSteward(db, actorId, shift.league_id);

    const member = db
      .prepare("SELECT chapter_id FROM league_members WHERE league_id = ? AND profile_id = ? AND status = 'active'")
      .get(shift.league_id, profileId) as { chapter_id: string | null } | undefined;
    if (!member) throw new AppError(409, "not_a_member", "That volunteer is not on this league's roster.");

    const signup = db
      .prepare("SELECT status FROM shift_signups WHERE shift_id = ? AND profile_id = ?")
      .get(shiftId, profileId) as { status: string } | undefined;
    if (!signup) throw new AppError(409, "not_signed_up", "That volunteer never claimed this shift.");
    if (signup.status === "attended") {
      return { awarded: 0, roster: readRoster(db, shiftId) };
    }
    if (!["reserved", "confirmed", "no_show"].includes(signup.status)) {
      throw new AppError(409, "not_signed_up", "That volunteer is no longer on this shift.");
    }

    const hours = status === "attended" ? hoursFromDuration(shift.duration) : 0;
    let awarded = 0;

    if (status === "attended" && hours > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const { count } = db
        .prepare(
          `SELECT COUNT(*) AS count FROM shift_signups
            WHERE profile_id = ? AND status = 'attended' AND substr(checked_in_at, 1, 10) = ?`,
        )
        .get(profileId, today) as { count: number };
      if (Number(count) >= DAILY_CHECKIN_CAP) {
        throw new AppError(
          409,
          "checkin_cap",
          `That volunteer already has ${DAILY_CHECKIN_CAP} check-ins today. Review the record before adding another.`,
        );
      }

      const delta = Math.min(ATTENDANCE_POINTS_CAP, Math.round(hours * ATTENDANCE_POINTS_PER_HOUR));
      const wrote = award(db, {
        profileId,
        leagueId: shift.league_id,
        chapterId: member.chapter_id,
        delta,
        reason: `Attended ${shift.title}`,
        refType: "shift_attendance",
        refId: shiftId,
        key: `attendance:${shiftId}:${profileId}`,
      });
      if (wrote) awarded = delta;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE shift_signups
          SET status = ?, hours = ?, checked_in_at = ?, checked_in_by = ?, updated_at = ?
        WHERE shift_id = ? AND profile_id = ?`,
    ).run(status, hours, now, actorId, now, shiftId, profileId);

    notify(db, {
      profileId,
      kind: "shift",
      title: status === "attended" ? `Checked in: ${shift.title}` : `Recorded as a no-show: ${shift.title}`,
      body:
        status === "attended"
          ? `${hours}h on the books${awarded > 0 ? `, ${awarded} Justice Points awarded` : ""}. The ledger has the entry.`
          : "A steward marked this shift as missed. Points are not awarded for a no-show. Talk to your steward if that is wrong.",
      leagueId: shift.league_id,
      refType: "shift",
      refId: shiftId,
    });

    return { awarded, roster: readRoster(db, shiftId) };
  });
}

export interface CreateShiftInput {
  chapterId: string;
  title: string;
  day: number;
  time: string;
  duration: string;
  capacity: number;
  place: string;
  bring?: string[];
}

export function createShift(db: Db, actorId: string, leagueId: string, input: CreateShiftInput): ShiftDTO {
  return transaction(db, () => {
    assertSteward(db, actorId, leagueId);

    const chapter = db
      .prepare("SELECT id FROM chapters WHERE id = ? AND league_id = ?")
      .get(input.chapterId, leagueId) as { id: string } | undefined;
    if (!chapter) {
      throw new AppError(400, "invalid_chapter", "That chapter is not part of this league.");
    }

    const id = newId("shf");
    db.prepare(
      `INSERT INTO shifts (
         id, league_id, chapter_id, title, day, starts_at, duration, place_name,
         capacity, base_filled, bring, status, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'open', ?)`,
    ).run(
      id,
      leagueId,
      chapter.id,
      input.title,
      input.day,
      shiftStart(input.day, input.time),
      input.duration,
      input.place,
      input.capacity,
      JSON.stringify(input.bring ?? []),
      actorId,
    );

    const shift = listShifts(db).find((item) => item.id === id);
    if (!shift) throw new Error("The new shift could not be read back.");
    return shift;
  });
}

export function updateShift(db: Db, actorId: string, shiftId: string, input: CreateShiftInput): ShiftDTO {
  return transaction(db, () => {
    const shift = db
      .prepare("SELECT league_id, capacity, base_filled, status FROM shifts WHERE id = ?")
      .get(shiftId) as { league_id: string; capacity: number; base_filled: number; status: string } | undefined;
    if (!shift) throw new AppError(404, "shift_not_found", "That shift is no longer posted.");
    assertSteward(db, actorId, shift.league_id);
    if (shift.status !== "open" && shift.status !== "full") {
      throw new AppError(409, "shift_closed", "That shift is already closed. Post a new one instead.");
    }

    const chapter = db
      .prepare("SELECT id FROM chapters WHERE id = ? AND league_id = ?")
      .get(input.chapterId, shift.league_id) as { id: string } | undefined;
    if (!chapter) {
      throw new AppError(400, "invalid_chapter", "That chapter is not part of this league.");
    }

    const { count } = db
      .prepare(`SELECT COUNT(*) AS count FROM shift_signups WHERE shift_id = ? AND status IN ${ACTIVE_SIGNUP}`)
      .get(shiftId) as { count: number };
    if (shift.base_filled + count > input.capacity) {
      throw new AppError(
        409,
        "capacity_below_signups",
        `${shift.base_filled + count} spots are already taken. Raise the capacity instead.`,
      );
    }

    db.prepare(
      `UPDATE shifts
          SET chapter_id = ?, title = ?, day = ?, starts_at = ?, duration = ?,
              place_name = ?, capacity = ?, bring = ?, updated_at = ?
        WHERE id = ?`,
    ).run(
      chapter.id,
      input.title,
      input.day,
      shiftStart(input.day, input.time),
      input.duration,
      input.place,
      input.capacity,
      JSON.stringify(input.bring ?? []),
      new Date().toISOString(),
      shiftId,
    );

    while (promoteWaitlist(db, shiftId)) {
      // A capacity increase can reopen more than one seat.
    }

    const updated = listShifts(db).find((item) => item.id === shiftId);
    if (!updated) throw new Error("The edited shift could not be read back.");
    return updated;
  });
}

export function cancelShiftAsSteward(db: Db, actorId: string, shiftId: string): { cancelled: true } {
  return transaction(db, () => {
    const shift = db.prepare("SELECT league_id, status FROM shifts WHERE id = ?").get(shiftId) as
      { league_id: string; status: string } | undefined;
    if (!shift) throw new AppError(404, "shift_not_found", "That shift is no longer posted.");
    assertSteward(db, actorId, shift.league_id);
    if (shift.status === "cancelled") return { cancelled: true as const };

    const now = new Date().toISOString();
    db.prepare("UPDATE shifts SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now, shiftId);
    db.prepare(
      `UPDATE shift_signups SET status = 'cancelled', updated_at = ?
        WHERE shift_id = ? AND status IN ('reserved', 'confirmed', 'waitlist')`,
    ).run(now, shiftId);

    return { cancelled: true as const };
  });
}

interface ProjectRow extends WinRow {
  submitter_handle: string | null;
  submitter_name: string | null;
  submitter_age_band: string | null;
}

/** A young neighbour's handle is a contact route, so rosters show a name only. */
function maskHandle(handle: string | null, ageBand: string | null | undefined, fallback: string): string {
  return ageBand === "teen" ? "" : (handle ?? fallback);
}

function projectFromRow(row: ProjectRow): ProjectDTO {
  return {
    id: row.id,
    league: row.league_id,
    chapterId: row.chapter_id,
    title: row.title,
    summary: row.summary,
    occurredOn: row.occurred_at.slice(0, 10),
    facts: JSON.parse(row.facts) as ProjectDTO["facts"],
    evidenceUrl: row.evidence_url,
    photo: row.photo_id,
    status: row.status,
    points: row.points,
    submittedBy:
      row.submitted_by && row.submitter_name
        ? {
            id: row.submitted_by,
            handle: maskHandle(row.submitter_handle, row.submitter_age_band, row.submitted_by),
            displayName: row.submitter_name,
            minor: row.submitter_age_band === "teen",
          }
        : null,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

function readProjectRow(db: Db, projectId: string): ProjectRow | undefined {
  return db
    .prepare(
      `SELECT w.*, p.handle AS submitter_handle, p.display_name AS submitter_name,
              p.age_band AS submitter_age_band
         FROM wins w LEFT JOIN profiles p ON p.id = w.submitted_by
        WHERE w.id = ?`,
    )
    .get(projectId) as ProjectRow | undefined;
}

export function listProjects(db: Db, actorId: string, leagueId: string): ProjectDTO[] {
  assertSteward(db, actorId, leagueId);
  const rows = db
    .prepare(
      `SELECT w.*, p.handle AS submitter_handle, p.display_name AS submitter_name,
              p.age_band AS submitter_age_band
         FROM wins w LEFT JOIN profiles p ON p.id = w.submitted_by
        WHERE w.league_id = ?
        ORDER BY CASE w.status WHEN 'submitted' THEN 0 ELSE 1 END, w.occurred_at DESC`,
    )
    .all(leagueId) as unknown as ProjectRow[];
  return rows.map(projectFromRow);
}

export interface SubmitProjectInput {
  chapterId: string;
  title: string;
  summary: string;
  occurredOn: string;
  people: number;
  hours: number;
  amount?: string;
  evidenceUrl?: string;
}

export function submitProject(db: Db, actorId: string, leagueId: string, input: SubmitProjectInput): ProjectDTO {
  return transaction(db, () => {
    assertMember(db, actorId, leagueId);
    assertNotRestricted(db, actorId);

    const league = db.prepare("SELECT id, photo_id FROM leagues WHERE id = ?").get(leagueId) as
      { id: string; photo_id: number } | undefined;
    if (!league) throw new AppError(404, "league_not_found", "That league is not in this edition.");

    const chapter = db
      .prepare("SELECT id FROM chapters WHERE id = ? AND league_id = ?")
      .get(input.chapterId, leagueId) as { id: string } | undefined;
    if (!chapter) throw new AppError(400, "invalid_chapter", "That chapter is not part of this league.");

    const facts: ProjectFacts = {
      people: input.people,
      hours: input.hours,
      amount: input.amount?.trim() || "Filed by the league",
    };

    const id = newId("prj");
    db.prepare(
      `INSERT INTO wins (
         id, league_id, chapter_id, title, summary, points, photo_id, facts,
         evidence_url, occurred_at, submitted_by, status
       ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'submitted')`,
    ).run(
      id,
      leagueId,
      chapter.id,
      input.title,
      input.summary,
      league.photo_id,
      JSON.stringify(facts),
      input.evidenceUrl?.trim() || null,
      `${input.occurredOn}T12:00:00.000Z`,
      actorId,
    );

    notifyLeagueStewards(db, leagueId, {
      kind: "project",
      title: "A project needs review",
      body: `${input.title} was filed by a member. Approve it to put points on the ledger.`,
      excludeProfileId: actorId,
      refType: "project",
      refId: id,
    });

    const project = readProjectRow(db, id);
    if (!project) throw new Error("The filed project could not be read back.");
    return projectFromRow(project);
  });
}

export function reviewProject(db: Db, actorId: string, projectId: string, decision: "approve" | "reject"): ProjectDTO {
  return transaction(db, () => {
    const project = readProjectRow(db, projectId);
    if (!project) throw new AppError(404, "project_not_found", "That project is no longer on file.");
    assertSteward(db, actorId, project.league_id);
    if (project.status !== "submitted") {
      throw new AppError(409, "already_reviewed", "That project has already been reviewed.");
    }

    const facts = JSON.parse(project.facts) as ProjectFacts;
    const points = decision === "approve" ? projectPoints(facts) : 0;
    const now = new Date().toISOString();

    if (decision === "approve" && project.submitted_by) {
      award(db, {
        profileId: project.submitted_by,
        leagueId: project.league_id,
        chapterId: project.chapter_id,
        delta: points,
        reason: `Project approved: ${project.title}`,
        refType: "project",
        refId: project.id,
        key: `project:${project.id}`,
      });
    }

    db.prepare(
      `UPDATE wins
          SET status = ?, points = ?, reviewed_by = ?, reviewed_at = ?
        WHERE id = ?`,
    ).run(decision === "approve" ? "approved" : "rejected", points, actorId, now, project.id);

    // The award rebuilds before the review status lands; rebuild again so the
    // project count in the standings matches the approved record.
    rebuildStandings(db);
    if (decision === "approve" && project.submitted_by) evaluateBadges(db, project.submitted_by);

    if (project.submitted_by) {
      notify(db, {
        profileId: project.submitted_by,
        kind: "project",
        title:
          decision === "approve"
            ? `Project approved: ${project.title}`
            : `Project sent back: ${project.title}`,
        body:
          decision === "approve"
            ? `+${points} Justice Points are on the ledger now.`
            : "A steward sent it back without points. Revise the details and file it again.",
        leagueId: project.league_id,
        refType: "project",
        refId: project.id,
      });
    }

    const updated = readProjectRow(db, projectId);
    if (!updated) throw new Error("The reviewed project could not be read back.");
    return projectFromRow(updated);
  });
}

interface ResourceRow {
  id: string;
  league_id: string;
  chapter_id: string | null;
  kind: ResourceKind;
  title: string;
  description: string;
  quantity: string;
  needed_by: string | null;
  status: ResourceStatus;
  created_by: string | null;
  claimed_by: string | null;
  created_at: string;
  creator_handle: string | null;
  creator_name: string | null;
  creator_age_band: string | null;
  claimer_handle: string | null;
  claimer_name: string | null;
  claimer_age_band: string | null;
}

function resourceFromRow(row: ResourceRow): ResourceDTO {
  return {
    id: row.id,
    league: row.league_id,
    chapterId: row.chapter_id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    quantity: row.quantity,
    neededBy: row.needed_by,
    status: row.status,
    createdBy:
      row.created_by && row.creator_name
        ? {
            id: row.created_by,
            handle: maskHandle(row.creator_handle, row.creator_age_band, row.created_by),
            displayName: row.creator_name,
            minor: row.creator_age_band === "teen",
          }
        : null,
    claimedBy:
      row.claimed_by && row.claimer_name
        ? {
            id: row.claimed_by,
            handle: maskHandle(row.claimer_handle, row.claimer_age_band, row.claimed_by),
            displayName: row.claimer_name,
            minor: row.claimer_age_band === "teen",
          }
        : null,
    createdAt: row.created_at,
  };
}

function readResourceRow(db: Db, resourceId: string): ResourceRow | undefined {
  return db
    .prepare(
      `SELECT r.*, c.handle AS creator_handle, c.display_name AS creator_name,
              c.age_band AS creator_age_band,
              k.handle AS claimer_handle, k.display_name AS claimer_name,
              k.age_band AS claimer_age_band
         FROM resources r
         LEFT JOIN profiles c ON c.id = r.created_by
         LEFT JOIN profiles k ON k.id = r.claimed_by
        WHERE r.id = ?`,
    )
    .get(resourceId) as ResourceRow | undefined;
}

export function listResources(db: Db, leagueId?: string): ResourceDTO[] {
  const rows = db
    .prepare(
      `SELECT r.*, c.handle AS creator_handle, c.display_name AS creator_name,
              c.age_band AS creator_age_band,
              k.handle AS claimer_handle, k.display_name AS claimer_name,
              k.age_band AS claimer_age_band
         FROM resources r
         LEFT JOIN profiles c ON c.id = r.created_by
         LEFT JOIN profiles k ON k.id = r.claimed_by
        WHERE r.hidden = 0 ${leagueId ? "AND r.league_id = ?" : ""}
        ORDER BY CASE r.status
                   WHEN 'open' THEN 0
                   WHEN 'claimed' THEN 1
                   WHEN 'fulfilled' THEN 2
                   ELSE 3
                 END,
                 r.created_at DESC`,
    )
    .all(...(leagueId ? [leagueId] : [])) as unknown as ResourceRow[];
  return rows.map(resourceFromRow);
}

export interface CreateResourceInput {
  chapterId: string;
  kind: ResourceKind;
  title: string;
  description?: string;
  quantity?: string;
  neededBy?: string;
}

export function createResource(db: Db, actorId: string, leagueId: string, input: CreateResourceInput): ResourceDTO {
  return transaction(db, () => {
    assertNotRestricted(db, actorId);
    assertMember(db, actorId, leagueId);

    const chapter = db
      .prepare("SELECT id FROM chapters WHERE id = ? AND league_id = ?")
      .get(input.chapterId, leagueId) as { id: string } | undefined;
    if (!chapter) throw new AppError(400, "invalid_chapter", "That chapter is not part of this league.");

    const id = newId("res");
    db.prepare(
      `INSERT INTO resources (
         id, league_id, chapter_id, kind, title, description, quantity, needed_by,
         status, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    ).run(
      id,
      leagueId,
      chapter.id,
      input.kind,
      input.title,
      input.description?.trim() ?? "",
      input.quantity?.trim() ?? "",
      input.neededBy || null,
      actorId,
    );

    const resource = readResourceRow(db, id);
    if (!resource) throw new Error("The posted resource could not be read back.");
    return resourceFromRow(resource);
  });
}

function resourceContext(db: Db, actorId: string, resourceId: string) {
  const resource = readResourceRow(db, resourceId);
  if (!resource) throw new AppError(404, "resource_not_found", "That classified is no longer posted.");
  assertMember(db, actorId, resource.league_id);
  return resource;
}

function assertCanHandOff(resource: ResourceRow, actorId: string) {
  if (resource.created_by !== actorId && resource.claimed_by !== actorId) {
    throw new AppError(403, "not_your_resource", "Only the member who posted it or the claimant can do that.");
  }
}

function setActiveClaimStatus(db: Db, resourceId: string, status: "released" | "fulfilled") {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE resource_claims SET status = ?, updated_at = ?
      WHERE resource_id = ? AND status = 'active'`,
  ).run(status, now, resourceId);
}

export function claimResource(db: Db, actorId: string, resourceId: string): ResourceDTO {
  return transaction(db, () => {
    const resource = resourceContext(db, actorId, resourceId);
    if (resource.status !== "open") {
      throw new AppError(409, "resource_unavailable", "That classified is no longer open.");
    }
    if (resource.created_by === actorId) {
      throw new AppError(409, "own_resource", "You cannot claim your own listing.");
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE resources SET status = 'claimed', claimed_by = ?, updated_at = ? WHERE id = ?`).run(
      actorId,
      now,
      resourceId,
    );
    db.prepare(
      `INSERT INTO resource_claims (id, resource_id, profile_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
    ).run(newId("clm"), resourceId, actorId, now, now);

    return resourceFromRow(readResourceRow(db, resourceId)!);
  });
}

export function releaseResource(db: Db, actorId: string, resourceId: string): ResourceDTO {
  return transaction(db, () => {
    const resource = resourceContext(db, actorId, resourceId);
    assertCanHandOff(resource, actorId);
    if (resource.status !== "claimed") {
      throw new AppError(409, "not_claimed", "That classified is not claimed.");
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE resources SET status = 'open', claimed_by = NULL, updated_at = ? WHERE id = ?`).run(
      now,
      resourceId,
    );
    setActiveClaimStatus(db, resourceId, "released");

    return resourceFromRow(readResourceRow(db, resourceId)!);
  });
}

export function fulfilResource(db: Db, actorId: string, resourceId: string): ResourceDTO {
  return transaction(db, () => {
    const resource = resourceContext(db, actorId, resourceId);
    assertCanHandOff(resource, actorId);
    if (resource.status !== "open" && resource.status !== "claimed") {
      throw new AppError(409, "resource_closed", "That classified is already closed.");
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE resources SET status = 'fulfilled', updated_at = ? WHERE id = ?`).run(now, resourceId);
    setActiveClaimStatus(db, resourceId, "fulfilled");

    return resourceFromRow(readResourceRow(db, resourceId)!);
  });
}

export function expireResource(db: Db, actorId: string, resourceId: string): ResourceDTO {
  return transaction(db, () => {
    const resource = resourceContext(db, actorId, resourceId);
    if (resource.created_by !== actorId) assertSteward(db, actorId, resource.league_id);
    if (resource.status !== "open" && resource.status !== "claimed") {
      throw new AppError(409, "resource_closed", "That classified is already closed.");
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE resources SET status = 'expired', claimed_by = NULL, updated_at = ? WHERE id = ?`).run(
      now,
      resourceId,
    );
    setActiveClaimStatus(db, resourceId, "released");

    return resourceFromRow(readResourceRow(db, resourceId)!);
  });
}

interface InviteRow {
  id: string;
  league_id: string;
  league_name: string;
  league_hood: string;
  league_cause: Cause;
  chapter_id: string | null;
  chapter_hood: string | null;
  role: InviteRole;
  note: string;
  expires_at: string;
  used_at: string | null;
  creator_id: string | null;
  creator_handle: string | null;
  creator_name: string | null;
  creator_age_band: string | null;
}

const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");

function inviteFromRow(row: InviteRow): InvitePreviewDTO {
  const expired = row.expires_at <= new Date().toISOString();
  const status: InviteStatus = row.used_at ? "used" : expired ? "expired" : "open";
  return {
    leagueId: row.league_id,
    leagueName: row.league_name,
    leagueHood: row.league_hood,
    leagueCause: row.league_cause,
    chapterId: row.chapter_id,
    chapterHood: row.chapter_hood,
    role: row.role,
    note: row.note,
    invitedBy:
      row.creator_id && row.creator_name
        ? {
            id: row.creator_id,
            handle: maskHandle(row.creator_handle, row.creator_age_band, row.creator_id),
            displayName: row.creator_name,
            minor: row.creator_age_band === "teen",
          }
        : null,
    expiresAt: row.expires_at,
    status,
  };
}

function readInvite(db: Db, token: string): InviteRow | undefined {
  return db
    .prepare(
      `SELECT i.*, l.name AS league_name, fn.name AS league_hood, l.cause AS league_cause,
              n.name AS chapter_hood,
              p.id AS creator_id, p.handle AS creator_handle, p.display_name AS creator_name,
              p.age_band AS creator_age_band
         FROM league_invites i
         JOIN leagues l ON l.id = i.league_id
         JOIN chapters fc ON fc.id = 'ch_' || l.id
         JOIN neighborhoods fn ON fn.id = fc.neighborhood_id
         LEFT JOIN chapters c ON c.id = i.chapter_id
         LEFT JOIN neighborhoods n ON n.id = c.neighborhood_id
         LEFT JOIN profiles p ON p.id = i.created_by
        WHERE i.token_hash = ?`,
    )
    .get(hashInviteToken(token)) as InviteRow | undefined;
}

export interface CreateInviteInput {
  chapterId?: string;
  role: InviteRole;
  note?: string;
  days?: number;
}

/** A steward mints a single-use link; the raw token is returned exactly once. */
export function createInvite(db: Db, actorId: string, leagueId: string, input: CreateInviteInput): CreatedInviteDTO {
  return transaction(db, () => {
    assertSteward(db, actorId, leagueId);

    let chapterId: string | null = null;
    if (input.chapterId) {
      const chapter = db
        .prepare("SELECT id FROM chapters WHERE id = ? AND league_id = ?")
        .get(input.chapterId, leagueId) as { id: string } | undefined;
      if (!chapter) throw new AppError(400, "invalid_chapter", "That chapter is not part of this league.");
      chapterId = chapter.id;
    }

    const token = randomBytes(24).toString("base64url");
    const days = Math.min(30, Math.max(1, input.days ?? 7));
    const expiresAt = new Date(Date.now() + days * 24 * 3600_000).toISOString();

    db.prepare(
      `INSERT INTO league_invites
         (id, token_hash, league_id, chapter_id, role, note, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId("inv"),
      hashInviteToken(token),
      leagueId,
      chapterId,
      input.role,
      input.note?.trim() ?? "",
      actorId,
      expiresAt,
    );

    const row = readInvite(db, token);
    if (!row) throw new Error("The invitation could not be read back.");
    return { token, path: `/join/${token}`, preview: inviteFromRow(row) };
  });
}

export function previewInvite(db: Db, token: string): InvitePreviewDTO {
  const row = readInvite(db, token);
  if (!row) throw new AppError(404, "invite_not_found", "That invitation is not on file.");
  return inviteFromRow(row);
}

export function redeemInvite(
  db: Db,
  profileId: string,
  token: string,
): { leagueId: string; role: "owner" | "steward" | "member"; awarded: boolean } {
  return transaction(db, () => {
    const row = readInvite(db, token);
    if (!row) throw new AppError(404, "invite_not_found", "That invitation is not on file.");
    if (row.used_at) throw new AppError(409, "invite_used", "That invitation has already been used.");
    if (row.expires_at <= new Date().toISOString()) {
      throw new AppError(409, "invite_expired", "That invitation has expired. Ask the steward for a fresh link.");
    }

    const league = db.prepare("SELECT status FROM leagues WHERE id = ?").get(row.league_id) as
      { status: string } | undefined;
    if (!league || league.status !== "active") {
      throw new AppError(404, "league_not_found", "That league is not in this edition.");
    }

    const chapter =
      row.chapter_id ??
      (
        db
          .prepare(
            `SELECT c.id
               FROM chapters c
               JOIN profiles p ON p.id = ?
              WHERE c.league_id = ?
              ORDER BY CASE
                         WHEN c.neighborhood_id = p.home_neighborhood THEN 0
                         WHEN c.id = 'ch_' || c.league_id THEN 1
                         ELSE 2
                       END,
                       c.name
              LIMIT 1`,
          )
          .get(profileId, row.league_id) as { id: string } | undefined
      )?.id ??
      null;

    const existing = db
      .prepare("SELECT role, status FROM league_members WHERE league_id = ? AND profile_id = ?")
      .get(row.league_id, profileId) as { role: string; status: string } | undefined;

    let role: "owner" | "steward" | "member" = row.role;
    if (existing) {
      // Never demote an owner or steward through a member invite.
      role = existing.role === "member" ? row.role : (existing.role as "owner" | "steward");
      db.prepare(
        "UPDATE league_members SET status = 'active', role = ?, chapter_id = COALESCE(?, chapter_id), joined_at = CASE WHEN status = 'active' THEN joined_at ELSE ? END WHERE league_id = ? AND profile_id = ?",
      ).run(role, chapter, new Date().toISOString(), row.league_id, profileId);
    } else {
      db.prepare(
        "INSERT INTO league_members (league_id, profile_id, chapter_id, role, status) VALUES (?, ?, ?, ?, 'active')",
      ).run(row.league_id, profileId, chapter, role);
    }

    const awarded = award(db, {
      profileId,
      leagueId: row.league_id,
      chapterId: chapter,
      delta: JOIN_POINTS,
      reason: "Signed the league charter",
      refType: "league_join",
      refId: row.league_id,
      key: `join:${row.league_id}:${profileId}`,
    });

    db.prepare("UPDATE league_invites SET used_at = ?, used_by = ? WHERE id = ?").run(
      new Date().toISOString(),
      profileId,
      row.id,
    );

    notify(db, {
      profileId,
      kind: "invite",
      title: `You're in: ${row.league_name}`,
      body: `${row.creator_name ?? "A steward"} invited you as ${role === "member" ? "a member" : `a ${role}`}. Your desk has the league now.`,
      leagueId: row.league_id,
      refType: "invite",
      refId: row.id,
    });
    if (row.creator_id && row.creator_id !== profileId) {
      notify(db, {
        profileId: row.creator_id,
        kind: "invite",
        title: "Your invitation was accepted",
        body: `A neighbour joined ${row.league_name} from the link you minted.`,
        leagueId: row.league_id,
        refType: "invite",
        refId: row.id,
      });
    }

    return { leagueId: row.league_id, role, awarded };
  });
}

export function removeMember(db: Db, actorId: string, leagueId: string, profileId: string): { removed: true } {
  return transaction(db, () => {
    assertSteward(db, actorId, leagueId);
    const actor = db
      .prepare("SELECT role FROM league_members WHERE league_id = ? AND profile_id = ? AND status = 'active'")
      .get(leagueId, actorId) as { role: string } | undefined;
    const target = db
      .prepare("SELECT role, status FROM league_members WHERE league_id = ? AND profile_id = ?")
      .get(leagueId, profileId) as { role: string; status: string } | undefined;

    if (!target || target.status !== "active") {
      throw new AppError(404, "member_not_found", "That member is not on the active roster.");
    }
    if (target.role === "owner") {
      throw new AppError(409, "cannot_remove_owner", "The owner cannot be removed from their own league.");
    }
    if (actorId === profileId) {
      throw new AppError(409, "cannot_remove_self", "Use Leave league to step off the roster.");
    }
    if (actor?.role === "steward" && target.role === "steward") {
      throw new AppError(403, "owner_required", "Only the owner can remove another steward.");
    }

    db.prepare("UPDATE league_members SET status = 'left' WHERE league_id = ? AND profile_id = ?").run(
      leagueId,
      profileId,
    );
    rebuildStandings(db);
    notify(db, {
      profileId,
      kind: "moderation",
      title: "You were taken off a roster",
      body: "A steward removed you from a league roster. Points already on the ledger stay yours. Ask the steward if you need context.",
      leagueId,
      refType: "league",
      refId: leagueId,
    });
    audit(db, {
      leagueId,
      actorId,
      action: "member.remove",
      targetType: "profile",
      targetId: profileId,
    });
    return { removed: true as const };
  });
}

export interface LeagueSettingsInput {
  name: string;
  motto: string;
  cause: Cause;
  recruiting: boolean;
  archived?: boolean;
}

export function updateLeagueSettings(
  db: Db,
  actorId: string,
  leagueId: string,
  input: LeagueSettingsInput,
): { updated: true; archived: boolean } {
  return transaction(db, () => {
    assertSteward(db, actorId, leagueId);
    const actor = db
      .prepare("SELECT role FROM league_members WHERE league_id = ? AND profile_id = ? AND status = 'active'")
      .get(leagueId, actorId) as { role: string } | undefined;

    if (input.archived && actor?.role !== "owner") {
      throw new AppError(403, "owner_required", "Only the league owner can archive it.");
    }

    db.prepare(
      `UPDATE leagues
          SET name = ?, motto = ?, cause = ?, recruiting = ?, status = ?, updated_at = ?
        WHERE id = ?`,
    ).run(
      input.name,
      input.motto,
      input.cause,
      input.archived ? 0 : input.recruiting ? 1 : 0,
      input.archived ? "archived" : "active",
      new Date().toISOString(),
      leagueId,
    );

    rebuildStandings(db);
    rebuildLeagueSearch(db);
    audit(db, {
      leagueId,
      actorId,
      action: input.archived ? "league.archive" : "league.settings",
      targetType: "league",
      targetId: leagueId,
      meta: { cause: input.cause, recruiting: input.recruiting },
    });

    return { updated: true as const, archived: Boolean(input.archived) };
  });
}

export function listLeagueAnomalies(db: Db, actorId: string, leagueId: string): AnomalyDTO[] {
  assertSteward(db, actorId, leagueId);
  return listAnomalyRows(db, leagueId);
}

interface ReverseableLedgerRow {
  id: string;
  profile_id: string | null;
  league_id: string;
  chapter_id: string | null;
  delta: number;
  reason: string;
  ref_type: string;
  ref_id: string;
}

function reverseLedgerEntryWithinTransaction(db: Db, actorId: string, entryId: string, note: string): number {
  const entry = db.prepare("SELECT * FROM points_ledger WHERE id = ?").get(entryId) as
    | ReverseableLedgerRow
    | undefined;
  if (!entry) throw new AppError(404, "ledger_not_found", "That ledger entry is not on file.");
  assertSteward(db, actorId, entry.league_id);
  if (entry.ref_type === "reversal") {
    throw new AppError(409, "cannot_reverse_reversal", "A correction cannot itself be reversed.");
  }
  if (db.prepare("SELECT 1 FROM points_ledger WHERE idempotency_key = ?").get(`reversal:entry:${entryId}`)) {
    throw new AppError(409, "already_reversed", "That entry has already been reversed.");
  }

  const delta = -entry.delta;
  const reversalId = newId("pts");
  db.prepare(
    `INSERT INTO points_ledger
       (id, profile_id, league_id, chapter_id, delta, reason, ref_type, ref_id, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?, 'reversal', ?, ?)`,
  ).run(
    reversalId,
    entry.profile_id,
    entry.league_id,
    entry.chapter_id,
    delta,
    `Reversal: ${entry.reason}`,
    entry.id,
    `reversal:entry:${entry.id}`,
  );

  recordReversal(db, {
    leagueId: entry.league_id,
    profileId: entry.profile_id,
    originalLedgerId: entry.id,
    reversalLedgerId: reversalId,
    actorId,
    note,
  });
  rebuildStandings(db);
  if (entry.profile_id) evaluateBadges(db, entry.profile_id);
  audit(db, {
    leagueId: entry.league_id,
    actorId,
    action: "ledger.reverse",
    targetType: "ledger",
    targetId: entry.id,
    meta: { reversalId, delta, note },
  });

  return delta;
}

export function reverseLedgerEntry(
  db: Db,
  actorId: string,
  entryId: string,
  note: string,
): { reversed: true; delta: number } {
  return transaction(db, () => ({ reversed: true as const, delta: reverseLedgerEntryWithinTransaction(db, actorId, entryId, note) }));
}

export function resolveLeagueAnomaly(
  db: Db,
  actorId: string,
  anomalyId: string,
  decision: "clear" | "reverse",
  note: string,
): { resolved: true; reversed: boolean } {
  return transaction(db, () => {
    const anomaly = readAnomaly(db, anomalyId);
    if (!anomaly) throw new AppError(404, "anomaly_not_found", "That review item is no longer on file.");
    assertSteward(db, actorId, anomaly.league_id);
    if (anomaly.status !== "open") {
      throw new AppError(409, "anomaly_resolved", "That review item has already been handled.");
    }

    let reversed = false;
    if (decision === "reverse" && anomaly.ledger_id) {
      reverseLedgerEntryWithinTransaction(db, actorId, anomaly.ledger_id, note || "Reversed from the anomaly queue.");
      reversed = true;
    }
    resolveAnomalyRow(db, anomalyId, actorId, reversed ? "reversed" : "cleared", note);
    audit(db, {
      leagueId: anomaly.league_id,
      actorId,
      action: decision === "reverse" ? "anomaly.reverse" : "anomaly.clear",
      targetType: "anomaly",
      targetId: anomalyId,
      meta: { note },
    });

    return { resolved: true as const, reversed };
  });
}
