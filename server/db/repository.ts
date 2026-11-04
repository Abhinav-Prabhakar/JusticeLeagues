import { newId, transaction, type Db } from "../db";
import { shiftStart } from "./schedule";
import type {
  ChapterDTO,
  EditionDTO,
  LeagueDTO,
  LeagueMemberDTO,
  LedgerEntryDTO,
  MeDTO,
  MembershipDTO,
  ProjectDTO,
  ProjectStatus,
  ShiftDTO,
  ShiftRosterDTO,
  ShiftRosterEntryDTO,
  SignupDTO,
  WinDTO,
} from "../../src/lib/types";
import type { Cause } from "../../src/data/fixtures";
import { projectPoints, type ProjectFacts } from "../../src/data/projects";

export const JOIN_POINTS = 25;
export const ATTENDANCE_POINTS_PER_HOUR = 12;

export class AppError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

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
  member_count: number;
  local_projects: number;
}

interface ChapterRow {
  id: string;
  league_id: string;
  name: string;
  hood: string;
  base_points: number;
  status: "active" | "dormant";
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

export function listLeagues(db: Db): LeagueDTO[] {
  const rows = db
    .prepare(
      `SELECT l.*, n.name AS hood,
        COALESCE((SELECT SUM(p.delta) FROM points_ledger p WHERE p.league_id = l.id), 0) AS ledger_points,
        COALESCE((SELECT COUNT(*) FROM league_members m
                   WHERE m.league_id = l.id AND m.status = 'active'), 0) AS member_count,
        COALESCE((SELECT COUNT(*) FROM wins w
                   WHERE w.league_id = l.id AND w.status = 'approved'
                     AND w.submitted_by IS NOT NULL), 0) AS local_projects
       FROM leagues l
       JOIN chapters c ON c.id = 'ch_' || l.id
       JOIN neighborhoods n ON n.id = c.neighborhood_id
       WHERE l.status = 'active'
       ORDER BY l.base_points + ledger_points DESC`,
    )
    .all() as unknown as LeagueRow[];

  const chapters = db
    .prepare(
      `SELECT c.*, n.name AS hood,
        COALESCE((SELECT SUM(p.delta) FROM points_ledger p WHERE p.chapter_id = c.id), 0) AS ledger_points
       FROM chapters c
       JOIN neighborhoods n ON n.id = c.neighborhood_id
       ORDER BY c.league_id, (c.id = 'ch_' || c.league_id) DESC, c.name`,
    )
    .all() as unknown as ChapterRow[];

  const byLeague = new Map<string, ChapterDTO[]>();
  for (const chapter of chapters) {
    const list = byLeague.get(chapter.league_id) ?? [];
    list.push({
      id: chapter.id,
      name: chapter.name,
      hood: chapter.hood,
      points: chapter.base_points + chapter.ledger_points,
      status: chapter.status,
    });
    byLeague.set(chapter.league_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    cause: row.cause,
    hood: row.hood,
    points: row.base_points + row.ledger_points,
    city: row.base_city_points + row.ledger_points,
    month: row.base_month_points,
    delta: row.delta,
    trend: JSON.parse(row.trend) as number[],
    members: row.base_members + row.member_count,
    projects: row.base_projects + row.local_projects,
    streak: row.base_streak,
    hours: row.base_hours,
    photo: row.photo_id,
    x: row.atlas_x,
    y: row.atlas_y,
    founded: row.founded_year,
    recruiting: row.recruiting === 1,
    motto: row.motto,
    chapters: byLeague.get(row.id) ?? [],
  }));
}

export function listShifts(db: Db): ShiftDTO[] {
  const rows = db
    .prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM shift_signups ss
          WHERE ss.shift_id = s.id AND ss.status IN ${ACTIVE_SIGNUP}) AS signup_count
       FROM shifts s
       WHERE s.status IN ('open', 'full')
       ORDER BY s.starts_at`,
    )
    .all() as unknown as ShiftRow[];

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
      bring: JSON.parse(row.bring) as ShiftDTO["bring"],
    };
  });
}

export function listWins(db: Db): WinDTO[] {
  const rows = db
    .prepare("SELECT * FROM wins WHERE status = 'approved' ORDER BY occurred_at DESC")
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
    points,
    ledger: ledger.map((entry): LedgerEntryDTO => ({
      id: entry.id,
      delta: entry.delta,
      reason: entry.reason,
      leagueId: entry.league_id,
      leagueName: entry.league_name,
      createdAt: entry.created_at,
    })),
  };
}

export function getEdition(db: Db, profileId: string | null): EditionDTO {
  return {
    leagues: listLeagues(db),
    shifts: listShifts(db),
    wins: listWins(db),
    me: profileId ? getMe(db, profileId) : null,
  };
}

export function listMembers(db: Db, leagueId: string): LeagueMemberDTO[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.handle, p.display_name, m.role, m.chapter_id, m.joined_at
         FROM league_members m JOIN profiles p ON p.id = m.profile_id
        WHERE m.league_id = ? AND m.status = 'active'
        ORDER BY m.joined_at`,
    )
    .all(leagueId) as unknown as {
    id: string;
    handle: string;
    display_name: string;
    role: LeagueMemberDTO["role"];
    chapter_id: string | null;
    joined_at: string;
  }[];

  return rows.map((row) => ({
    profile: { id: row.id, handle: row.handle, displayName: row.display_name },
    role: row.role,
    chapterId: row.chapter_id,
    joinedAt: row.joined_at,
  }));
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
  try {
    db.prepare(
      `INSERT INTO points_ledger
         (id, profile_id, league_id, chapter_id, delta, reason, ref_type, ref_id, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId("pts"),
      entry.profileId,
      entry.leagueId,
      entry.chapterId,
      entry.delta,
      entry.reason,
      entry.refType,
      entry.refId,
      entry.key,
    );
    return true;
  } catch (error) {
    if ((error as Error).message.includes("UNIQUE")) return false;
    throw error;
  }
}

function joinWithinTransaction(db: Db, profileId: string, leagueId: string): boolean {
  const league = db.prepare("SELECT id, status, recruiting FROM leagues WHERE id = ?").get(leagueId) as
    { id: string; status: string; recruiting: number } | undefined;
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
  });
  return { joined: false };
}

export function signupShift(
  db: Db,
  profileId: string,
  shiftId: string,
): { signedUp: true; filled: number; autoJoined: boolean } {
  return transaction(db, () => {
    const shift = db
      .prepare("SELECT id, league_id, capacity, base_filled, status FROM shifts WHERE id = ?")
      .get(shiftId) as
      { id: string; league_id: string; capacity: number; base_filled: number; status: string } | undefined;
    if (!shift) throw new AppError(404, "shift_not_found", "That shift is no longer posted.");
    if (shift.status !== "open") throw new AppError(409, "shift_closed", "This shift is not taking signups.");

    const existing = db
      .prepare("SELECT status FROM shift_signups WHERE shift_id = ? AND profile_id = ?")
      .get(shiftId, profileId) as { status: string } | undefined;
    const isActive = existing && ["reserved", "confirmed", "attended"].includes(existing.status);

    const { count } = db
      .prepare(
        `SELECT COUNT(*) AS count FROM shift_signups
          WHERE shift_id = ? AND status IN ${ACTIVE_SIGNUP}`,
      )
      .get(shiftId) as { count: number };

    if (!isActive && shift.base_filled + count >= shift.capacity) {
      throw new AppError(409, "shift_full", "Every spot on this shift is taken.");
    }

    const member = db
      .prepare("SELECT status FROM league_members WHERE league_id = ? AND profile_id = ?")
      .get(shift.league_id, profileId) as { status: string } | undefined;

    let autoJoined = false;
    if (member?.status !== "active") {
      autoJoined = joinWithinTransaction(db, profileId, shift.league_id);
    }

    if (!isActive) {
      if (existing) {
        db.prepare(
          "UPDATE shift_signups SET status = 'reserved', created_at = ?, updated_at = ? WHERE shift_id = ? AND profile_id = ?",
        ).run(new Date().toISOString(), new Date().toISOString(), shiftId, profileId);
      } else {
        db.prepare("INSERT INTO shift_signups (shift_id, profile_id, status) VALUES (?, ?, 'reserved')").run(
          shiftId,
          profileId,
        );
      }
    }

    return {
      signedUp: true,
      filled: Math.min(shift.capacity, shift.base_filled + count + (isActive ? 0 : 1)),
      autoJoined,
    };
  });
}

export function cancelShift(db: Db, profileId: string, shiftId: string): { signedUp: false } {
  transaction(db, () => {
    const existing = db
      .prepare("SELECT status FROM shift_signups WHERE shift_id = ? AND profile_id = ?")
      .get(shiftId, profileId) as { status: string } | undefined;
    if (existing && (existing.status === "attended" || existing.status === "no_show")) {
      throw new AppError(409, "attendance_locked", "A steward already recorded this shift. The record is final.");
    }

    const result = db
      .prepare(
        `UPDATE shift_signups SET status = 'cancelled', updated_at = ?
          WHERE shift_id = ? AND profile_id = ? AND status IN ${ACTIVE_SIGNUP}`,
      )
      .run(new Date().toISOString(), shiftId, profileId);
    if (Number(result.changes) === 0) {
      throw new AppError(409, "not_signed_up", "You are not on this shift.");
    }
  });
  return { signedUp: false };
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

function assertSteward(db: Db, profileId: string, leagueId: string) {
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
      `SELECT ss.status, ss.hours, ss.checked_in_at, p.id, p.handle, p.display_name
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
      bring: JSON.parse(shift.bring) as ShiftDTO["bring"],
    },
    pointsPerHour: ATTENDANCE_POINTS_PER_HOUR,
    sealed: shift.base_filled,
    entries: rows.map((row) => ({
      profile: { id: row.id, handle: row.handle, displayName: row.display_name },
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
    if (!["reserved", "confirmed", "waitlist", "no_show"].includes(signup.status)) {
      throw new AppError(409, "not_signed_up", "That volunteer is no longer on this shift.");
    }

    const hours = status === "attended" ? hoursFromDuration(shift.duration) : 0;
    let awarded = 0;

    if (status === "attended" && hours > 0) {
      const delta = Math.round(hours * ATTENDANCE_POINTS_PER_HOUR);
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
            handle: row.submitter_handle ?? row.submitted_by,
            displayName: row.submitter_name,
          }
        : null,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

function readProjectRow(db: Db, projectId: string): ProjectRow | undefined {
  return db
    .prepare(
      `SELECT w.*, p.handle AS submitter_handle, p.display_name AS submitter_name
         FROM wins w LEFT JOIN profiles p ON p.id = w.submitted_by
        WHERE w.id = ?`,
    )
    .get(projectId) as ProjectRow | undefined;
}

export function listProjects(db: Db, actorId: string, leagueId: string): ProjectDTO[] {
  assertSteward(db, actorId, leagueId);
  const rows = db
    .prepare(
      `SELECT w.*, p.handle AS submitter_handle, p.display_name AS submitter_name
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

    const updated = readProjectRow(db, projectId);
    if (!updated) throw new Error("The reviewed project could not be read back.");
    return projectFromRow(updated);
  });
}
