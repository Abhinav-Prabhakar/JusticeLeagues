import { newId, type Db } from "./index";
import { assertAdmin } from "./guards";
import { AppError } from "./errors";
import { logger } from "../log";
import type {
  ErrorReportDTO,
  PilotNoteDTO,
  PulseEventName,
  PulseMetricsDTO,
  PulseStageDTO,
} from "../../src/lib/types";

/**
 * A private, local funnel. The browser may report only page names; the server
 * authors every action event. There is no IP, user agent, cookie, or
 * cross-site identifier in this table.
 */
export const PAGE_EVENTS = [
  "home_view",
  "atlas_view",
  "league_view",
  "chapter_view",
  "ledger_view",
  "register_view",
] as const satisfies readonly PulseEventName[];

export const ACTION_EVENTS = [
  "auth_register",
  "league_join",
  "shift_signup",
  "shift_checkin",
  "project_submit",
  "project_approve",
  "resource_post",
  "resource_claim",
  "resource_fulfil",
  "report_file",
] as const satisfies readonly PulseEventName[];

const ALL_EVENTS = new Set<string>([...PAGE_EVENTS, ...ACTION_EVENTS]);

export interface PulseEventInput {
  profileId?: string | null;
  leagueId?: string | null;
  path?: string;
}

/** Analytics must never take a request down; a failed insert is a warning. */
export function recordPulseEvent(db: Db, name: PulseEventName, input: PulseEventInput = {}): void {
  if (!ALL_EVENTS.has(name)) return;
  try {
    db.prepare("INSERT INTO pulse_events (event_name, profile_id, league_id, path) VALUES (?, ?, ?, ?)").run(
      name,
      input.profileId ?? null,
      input.leagueId ?? null,
      (input.path ?? "").slice(0, 300),
    );
  } catch (error) {
    logger.warn("pulse.record_failed", { name, error: error instanceof Error ? error.message : String(error) });
  }
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export interface ErrorReportInput {
  profileId?: string | null;
  message: string;
  stack?: string;
  component?: string;
  path?: string;
  requestId?: string;
}

export function recordErrorReport(db: Db, input: ErrorReportInput): string {
  const id = newId("err");
  db.prepare(
    `INSERT INTO error_reports (id, profile_id, message, stack, component, path, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.profileId ?? null,
    clip(input.message, 500),
    clip(input.stack ?? "", 8_000),
    clip(input.component ?? "", 6_000),
    clip(input.path ?? "", 300),
    clip(input.requestId ?? "", 80),
  );
  return id;
}

interface ErrorRow {
  id: string;
  profile_id: string | null;
  message: string;
  stack: string;
  component: string;
  path: string;
  request_id: string;
  resolved_at: string | null;
  created_at: string;
}

export function listErrorReports(db: Db, limit = 20, openOnly = false): ErrorReportDTO[] {
  const rows = db
    .prepare(
      `SELECT id, profile_id, message, stack, component, path, request_id, resolved_at, created_at
         FROM error_reports
        ${openOnly ? "WHERE resolved_at IS NULL" : ""}
        ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(Math.min(Math.max(limit, 1), 100)) as unknown as ErrorRow[];
  return rows.map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    message: row.message,
    stack: row.stack,
    component: row.component,
    path: row.path,
    requestId: row.request_id,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  }));
}

export function resolveErrorReport(db: Db, actorId: string, id: string): { resolved: true } {
  assertAdmin(db, actorId);
  const result = db
    .prepare("UPDATE error_reports SET resolved_at = ?, resolved_by = ? WHERE id = ? AND resolved_at IS NULL")
    .run(new Date().toISOString(), actorId, id);
  if (Number(result.changes) === 0) throw new AppError(404, "error_not_found", "That report is already closed.");
  return { resolved: true as const };
}

export function countOpenErrors(db: Db): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM error_reports WHERE resolved_at IS NULL").get() as {
    count: number;
  };
  return Number(row.count);
}

function countEvents(db: Db, name: PulseEventName, since: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM pulse_events WHERE event_name = ? AND created_at >= ?")
    .get(name, since) as { count: number };
  return Number(row.count) || 0;
}

function one(db: Db, sql: string, ...params: (string | number | null)[]): number {
  const row = db.prepare(sql).get(...params) as { value: number } | undefined;
  return Number(row?.value) || 0;
}

function ratio(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 10_000) / 10_000;
}

function stage(key: string, label: string, count: number, previous: number | null, start: number): PulseStageDTO {
  return {
    key,
    label,
    count,
    conversion: previous === null || previous <= 0 ? null : ratio(count, previous),
    fromStart: start <= 0 ? null : ratio(count, start),
  };
}

export interface PulseRange {
  days?: number;
}

/**
 * The numbers the editor needs on one screen. Everything is derived from the
 * record or the private funnel; nothing is sampled and nothing leaves disk.
 */
export function pulseMetrics(db: Db, range: PulseRange = {}): PulseMetricsDTO {
  const days = Math.min(Math.max(Math.round(range.days ?? 28), 1), 365);
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  const now = new Date().toISOString();

  const homeViews = countEvents(db, "home_view", since);
  const atlasViews = countEvents(db, "atlas_view", since);
  const leagueViews = countEvents(db, "league_view", since);
  const registrations = one(db, "SELECT COUNT(*) AS value FROM profiles WHERE created_at >= ?", since);
  const joins = one(
    db,
    "SELECT COUNT(DISTINCT profile_id) AS value FROM league_members WHERE status = 'active' AND joined_at >= ?",
    since,
  );
  const signups = one(
    db,
    "SELECT COUNT(*) AS value FROM shift_signups WHERE created_at >= ? AND status <> 'cancelled'",
    since,
  );
  const attendances = one(
    db,
    "SELECT COUNT(*) AS value FROM shift_signups WHERE status = 'attended' AND checked_in_at >= ?",
    since,
  );

  const funnel = [
    stage("atlas_view", "Atlas opened", atlasViews, null, atlasViews),
    stage("league_view", "League read", leagueViews, atlasViews, atlasViews),
    stage("register", "Account opened", registrations, leagueViews, atlasViews),
    stage("join", "Charter signed", joins, registrations, atlasViews),
    stage("signup", "Shift claimed", signups, joins, atlasViews),
    stage("attend", "Attendance recorded", attendances, signups, atlasViews),
  ];

  // Liquidity: open shifts, how full they are, and whether they filled early.
  const openShifts = db
    .prepare("SELECT id, starts_at, capacity, base_filled FROM shifts WHERE status = 'open'")
    .all() as unknown as { id: string; starts_at: string; capacity: number; base_filled: number }[];
  const activeSignups = db.prepare(
    "SELECT COUNT(*) AS count FROM shift_signups WHERE shift_id = ? AND status IN ('reserved','confirmed','attended')",
  );
  let capacity = 0;
  let filled = 0;
  let openFuture = 0;
  for (const shift of openShifts) {
    const { count } = activeSignups.get(shift.id) as { count: number };
    capacity += shift.capacity;
    filled += Math.min(shift.capacity, shift.base_filled + Number(count));
    if (shift.starts_at >= now) openFuture += 1;
  }
  const shiftsWithSignup48h = one(
    db,
    `SELECT COUNT(*) AS value FROM shifts s
      WHERE s.status = 'open' AND s.starts_at >= ? AND EXISTS (
        SELECT 1 FROM shift_signups ss
         WHERE ss.shift_id = s.id
           AND julianday(ss.created_at) BETWEEN julianday(s.starts_at) - 2 AND julianday(s.starts_at)
      )`,
    now,
  );

  const reliabilitySince = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
  const attended = one(
    db,
    "SELECT COUNT(*) AS value FROM shift_signups WHERE status = 'attended' AND checked_in_at >= ?",
    reliabilitySince,
  );
  const noShow = one(
    db,
    "SELECT COUNT(*) AS value FROM shift_signups WHERE status = 'no_show' AND checked_in_at >= ?",
    reliabilitySince,
  );
  const cancelled = one(
    db,
    "SELECT COUNT(*) AS value FROM shift_signups WHERE status = 'cancelled' AND updated_at >= ?",
    reliabilitySince,
  );

  const activeMembers = one(db, "SELECT COUNT(DISTINCT profile_id) AS value FROM league_members WHERE status = 'active'");
  const active4w = one(
    db,
    `SELECT COUNT(*) AS value FROM (
       SELECT profile_id FROM shift_signups WHERE status = 'attended' AND checked_in_at >= ?
       UNION SELECT profile_id FROM points_ledger WHERE created_at >= ? AND profile_id IS NOT NULL
       UNION SELECT submitted_by AS profile_id FROM wins WHERE created_at >= ? AND submitted_by IS NOT NULL
     )`,
    since,
    since,
    since,
  );

  const points = one(db, "SELECT COALESCE(SUM(delta), 0) AS value FROM points_ledger");
  const ledgerRows = one(db, "SELECT COUNT(*) AS value FROM points_ledger");
  const reversals = one(db, "SELECT COUNT(*) AS value FROM points_ledger WHERE ref_type = 'reversal'");
  const openAnomalies = one(db, "SELECT COUNT(*) AS value FROM anomalies WHERE status = 'open'");
  const reports = one(db, "SELECT COUNT(*) AS value FROM reports WHERE created_at >= ?", since);

  const pilotRows = db
    .prepare(
      `SELECT l.id, l.name, s.points, s.members, s.projects,
              (SELECT COUNT(*) FROM shifts sh WHERE sh.league_id = l.id) AS shifts,
              (SELECT COUNT(*) FROM shift_signups ss JOIN shifts sh ON sh.id = ss.shift_id
                WHERE sh.league_id = l.id AND ss.created_at >= ?) AS signups,
              (SELECT MAX(created_at) FROM points_ledger pl WHERE pl.league_id = l.id) AS last_ledger,
              (SELECT MAX(ss.created_at) FROM shift_signups ss JOIN shifts sh ON sh.id = ss.shift_id
                WHERE sh.league_id = l.id) AS last_signup
         FROM league_standings s
         JOIN leagues l ON l.id = s.league_id
        ORDER BY s.points DESC, l.id ASC LIMIT 3`,
    )
    .all(since) as unknown as {
    id: string;
    name: string;
    points: number;
    members: number;
    projects: number;
    shifts: number;
    signups: number;
    last_ledger: string | null;
    last_signup: string | null;
  }[];

  return {
    windowDays: days,
    since,
    homeViews,
    funnel,
    liquidity: {
      openShifts: openShifts.length,
      openFutureShifts: openFuture,
      capacity,
      filled,
      openSpots: Math.max(0, capacity - filled),
      fillRate: ratio(filled, capacity),
      shiftsWithSignup48h,
      within48hRate: ratio(shiftsWithSignup48h, openFuture),
    },
    reliability: {
      attended,
      noShow,
      cancelled,
      showUpRate: ratio(attended, attended + noShow),
    },
    retention: {
      activeMembers,
      active4w,
      rate: ratio(active4w, activeMembers),
    },
    integrity: {
      points,
      activeMembers,
      pointsPerMember: activeMembers > 0 ? Math.round(points / activeMembers) : 0,
      ledgerRows,
      reversals,
      reversalRate: ratio(reversals, ledgerRows),
      openAnomalies,
      reports,
      reportsPer100Members: activeMembers > 0 ? Math.round((reports / activeMembers) * 10_000) / 100 : 0,
    },
    pilots: pilotRows.map((row) => ({
      leagueId: row.id,
      leagueName: row.name,
      points: Number(row.points) || 0,
      members: Number(row.members) || 0,
      projects: Number(row.projects) || 0,
      shifts: Number(row.shifts) || 0,
      signups: Number(row.signups) || 0,
      lastActivity: [row.last_ledger, row.last_signup].filter(Boolean).sort().at(-1) ?? null,
    })),
  };
}

interface PilotNoteRow {
  id: string;
  league_id: string | null;
  league_name: string | null;
  author_id: string | null;
  author_name: string | null;
  kind: "note" | "friction" | "win";
  body: string;
  week: string;
  created_at: string;
}

function noteFromRow(row: PilotNoteRow): PilotNoteDTO {
  return {
    id: row.id,
    leagueId: row.league_id,
    leagueName: row.league_name,
    authorName: row.author_name,
    kind: row.kind,
    body: row.body,
    week: row.week,
    createdAt: row.created_at,
  };
}

export function listPilotNotes(db: Db, limit = 10): PilotNoteDTO[] {
  const rows = db
    .prepare(
      `SELECT n.id, n.league_id, l.name AS league_name, n.author_id, p.display_name AS author_name,
              n.kind, n.body, n.week, n.created_at
         FROM pilot_notes n
         LEFT JOIN leagues l ON l.id = n.league_id
         LEFT JOIN profiles p ON p.id = n.author_id
        ORDER BY n.created_at DESC, n.id DESC LIMIT ?`,
    )
    .all(Math.min(Math.max(limit, 1), 50)) as unknown as PilotNoteRow[];
  return rows.map(noteFromRow);
}

export function addPilotNote(
  db: Db,
  actorId: string,
  input: { body: string; kind?: "note" | "friction" | "win"; leagueId?: string | null },
): PilotNoteDTO {
  assertAdmin(db, actorId);
  const body = input.body.trim();
  if (body.length < 3) throw new AppError(400, "note_too_short", "Write at least a few words.");
  const leagueId = input.leagueId || null;
  if (leagueId && !db.prepare("SELECT 1 FROM leagues WHERE id = ?").get(leagueId)) {
    throw new AppError(404, "league_not_found", "That league is not in this edition.");
  }
  const id = newId("note");
  db.prepare("INSERT INTO pilot_notes (id, league_id, author_id, kind, body) VALUES (?, ?, ?, ?, ?)").run(
    id,
    leagueId,
    actorId,
    input.kind ?? "note",
    clip(body, 800),
  );
  const row = db
    .prepare(
      `SELECT n.id, n.league_id, l.name AS league_name, n.author_id, p.display_name AS author_name,
              n.kind, n.body, n.week, n.created_at
         FROM pilot_notes n
         LEFT JOIN leagues l ON l.id = n.league_id
         LEFT JOIN profiles p ON p.id = n.author_id
        WHERE n.id = ?`,
    )
    .get(id) as unknown as PilotNoteRow;
  return noteFromRow(row);
}

/** Keep the operational tables small without ever touching the record. */
export function pruneOperationalData(db: Db): { events: number; errors: number } {
  const events = Number(
    db.prepare("DELETE FROM pulse_events WHERE created_at < ?").run(new Date(Date.now() - 180 * 86400_000).toISOString())
      .changes,
  );
  const errors = Number(
    db
      .prepare("DELETE FROM error_reports WHERE resolved_at IS NOT NULL AND resolved_at < ?")
      .run(new Date(Date.now() - 90 * 86400_000).toISOString()).changes,
  );
  return { events, errors };
}
