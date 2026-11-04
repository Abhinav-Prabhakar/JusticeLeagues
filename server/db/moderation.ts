import { transaction, newId, type Db } from "./index";
import { AppError } from "./errors";
import { audit } from "./anomalies";
import { notify, notifyAdmins } from "./notifications";
import { assertAdmin, restrictedUntil } from "./guards";
import { assertSteward } from "./repository";
import type {
  PublicProfileDTO,
  ReportDTO,
  ReportReason,
  ReportStatus,
  ReportTarget,
  StrikeDTO,
} from "../../src/lib/types";

/** The published strike policy: three upheld reports pause posting for a fortnight. */
export const STRIKE_LIMIT = 3;
export const RESTRICTION_DAYS = 14;

const TARGET_TYPES: ReportTarget[] = ["project", "resource", "shift", "league", "member"];
const REASONS: ReportReason[] = ["spam", "harassment", "safety", "misinformation", "other"];

export function isReportTarget(value: string): value is ReportTarget {
  return (TARGET_TYPES as string[]).includes(value);
}

export function isReportReason(value: string): value is ReportReason {
  return (REASONS as string[]).includes(value);
}

interface TargetRow {
  title: string;
  author_id: string | null;
  league_id: string | null;
  hidden: boolean;
}

interface TargetInfo {
  title: string;
  authorId: string | null;
  leagueId: string | null;
}

function readTarget(db: Db, targetType: ReportTarget, targetId: string): TargetInfo | null {
  if (targetType === "project") {
    const row = db
      .prepare("SELECT title, submitted_by AS author_id, league_id FROM wins WHERE id = ?")
      .get(targetId) as TargetRow | undefined;
    return row ? { title: row.title, authorId: row.author_id, leagueId: row.league_id } : null;
  }
  if (targetType === "resource") {
    const row = db
      .prepare("SELECT title, created_by AS author_id, league_id FROM resources WHERE id = ?")
      .get(targetId) as TargetRow | undefined;
    return row ? { title: row.title, authorId: row.author_id, leagueId: row.league_id } : null;
  }
  if (targetType === "shift") {
    const row = db
      .prepare("SELECT title, created_by AS author_id, league_id FROM shifts WHERE id = ?")
      .get(targetId) as TargetRow | undefined;
    return row ? { title: row.title, authorId: row.author_id, leagueId: row.league_id } : null;
  }
  if (targetType === "league") {
    const row = db.prepare("SELECT name AS title, id AS league_id FROM leagues WHERE id = ?").get(targetId) as
      | { title: string; league_id: string }
      | undefined;
    return row ? { title: row.title, authorId: null, leagueId: row.league_id } : null;
  }
  if (targetType === "member") {
    const row = db
      .prepare("SELECT display_name AS title, id AS author_id FROM profiles WHERE id = ?")
      .get(targetId) as { title: string; author_id: string } | undefined;
    return row ? { title: row.title, authorId: row.author_id, leagueId: null } : null;
  }
  return null;
}

/** Soft-hide content. Nothing is deleted: the audit trail keeps the item. */
function hideWithinTransaction(db: Db, targetType: ReportTarget, targetId: string): boolean {
  if (targetType === "project") {
    return Number(db.prepare("UPDATE wins SET hidden = 1 WHERE id = ?").run(targetId).changes) > 0;
  }
  if (targetType === "resource") {
    return Number(db.prepare("UPDATE resources SET hidden = 1 WHERE id = ?").run(targetId).changes) > 0;
  }
  if (targetType === "shift") {
    return (
      Number(
        db.prepare("UPDATE shifts SET status = 'cancelled', updated_at = ? WHERE id = ?").run(
          new Date().toISOString(),
          targetId,
        ).changes,
      ) > 0
    );
  }
  if (targetType === "league") {
    return Number(db.prepare("UPDATE leagues SET status = 'archived' WHERE id = ?").run(targetId).changes) > 0;
  }
  throw new AppError(409, "cannot_hide_member", "A neighbour cannot be hidden — record a strike instead.");
}

function profileDTO(db: Db, profileId: string | null): PublicProfileDTO | null {
  if (!profileId) return null;
  const row = db
    .prepare("SELECT id, handle, display_name, age_band FROM profiles WHERE id = ?")
    .get(profileId) as { id: string; handle: string; display_name: string; age_band: string } | undefined;
  if (!row) return null;
  const minor = row.age_band === "teen";
  return { id: row.id, handle: minor ? "" : row.handle, displayName: row.display_name, minor };
}

interface ReportRow {
  id: string;
  reporter_id: string | null;
  target_type: ReportTarget;
  target_id: string;
  league_id: string | null;
  league_name: string | null;
  reason: ReportReason;
  detail: string;
  status: ReportStatus;
  handled_at: string | null;
  resolution_note: string;
  created_at: string;
}

function reportFromRow(db: Db, row: ReportRow): ReportDTO {
  const target = readTarget(db, row.target_type, row.target_id);
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetTitle: target?.title ?? "Removed from the edition",
    targetAuthor: profileDTO(db, target?.authorId ?? null),
    leagueId: row.league_id,
    leagueName: row.league_name,
    reason: row.reason,
    detail: row.detail,
    status: row.status,
    reporter: profileDTO(db, row.reporter_id),
    handledAt: row.handled_at,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
  };
}

export interface CreateReportInput {
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  detail?: string;
}

export function createReport(db: Db, reporterId: string, input: CreateReportInput): ReportDTO {
  return transaction(db, () => {
    const target = readTarget(db, input.targetType, input.targetId);
    if (!target) throw new AppError(404, "target_not_found", "That item is no longer in the edition.");
    if (target.authorId && target.authorId === reporterId) {
      throw new AppError(409, "self_report", "You cannot report your own post.");
    }

    const id = newId("rep");
    try {
      db.prepare(
        `INSERT INTO reports (id, reporter_id, target_type, target_id, league_id, reason, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        reporterId,
        input.targetType,
        input.targetId,
        target.leagueId,
        input.reason,
        (input.detail ?? "").trim(),
      );
    } catch (error) {
      if ((error as Error).message.includes("UNIQUE")) {
        throw new AppError(409, "already_reported", "You already have an open report on this item.");
      }
      throw error;
    }

    notifyAdmins(db, {
      kind: "moderation",
      title: "New report in the queue",
      body: `${input.reason}: ${target.title}`,
      leagueId: target.leagueId,
      refType: "report",
      refId: id,
    });
    audit(db, {
      leagueId: target.leagueId,
      actorId: reporterId,
      action: "report.create",
      targetType: input.targetType,
      targetId: input.targetId,
      meta: { reason: input.reason, reportId: id },
    });

    const row = db
      .prepare(
        `SELECT r.*, l.name AS league_name FROM reports r
           LEFT JOIN leagues l ON l.id = r.league_id WHERE r.id = ?`,
      )
      .get(id) as unknown as ReportRow;
    return reportFromRow(db, row);
  });
}

export function listReports(db: Db, actorId: string, status: ReportStatus | "all" = "open"): ReportDTO[] {
  assertAdmin(db, actorId);
  const where = status === "all" ? "" : "WHERE r.status = ?";
  const params = status === "all" ? [] : [status];
  const rows = db
    .prepare(
      `SELECT r.*, l.name AS league_name FROM reports r
         LEFT JOIN leagues l ON l.id = r.league_id
         ${where}
        ORDER BY r.created_at DESC, r.id DESC LIMIT 200`,
    )
    .all(...params) as unknown as ReportRow[];
  return rows.map((row) => reportFromRow(db, row));
}

function readStrike(db: Db, id: string): StrikeDTO {
  const row = db
    .prepare(
      `SELECT s.id, s.league_id, s.reason, s.created_at, l.name AS league_name,
              p.id AS profile_id, p.handle, p.display_name, p.age_band
         FROM strikes s
         JOIN profiles p ON p.id = s.profile_id
         LEFT JOIN leagues l ON l.id = s.league_id
        WHERE s.id = ?`,
    )
    .get(id) as
    | {
        id: string;
        league_id: string | null;
        league_name: string | null;
        reason: string;
        created_at: string;
        profile_id: string;
        handle: string;
        display_name: string;
        age_band: string;
      }
    | undefined;
  if (!row) throw new AppError(404, "strike_not_found", "That strike is not on file.");
  const minor = row.age_band === "teen";
  return {
    id: row.id,
    profile: {
      id: row.profile_id,
      handle: minor ? "" : row.handle,
      displayName: row.display_name,
      minor,
    },
    leagueId: row.league_id,
    leagueName: row.league_name,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export function listStrikes(db: Db, profileId: string): StrikeDTO[] {
  const rows = db
    .prepare("SELECT id FROM strikes WHERE profile_id = ? ORDER BY created_at DESC, id DESC")
    .all(profileId) as unknown as { id: string }[];
  return rows.map((row) => readStrike(db, row.id));
}

function countStrikes(db: Db, profileId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM strikes WHERE profile_id = ?").get(profileId) as {
    count: number;
  };
  return Number(row.count) || 0;
}

function recordStrike(
  db: Db,
  actorId: string,
  targetProfileId: string,
  leagueId: string | null,
  reportId: string | null,
  reason: string,
): { strike: StrikeDTO; strikes: number; restrictedUntil: string | null } {
  const id = newId("str");
  db.prepare(
    `INSERT INTO strikes (id, profile_id, league_id, report_id, reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, targetProfileId, leagueId, reportId, reason, actorId);

  const strikes = countStrikes(db, targetProfileId);
  let until: string | null = null;
  if (strikes >= STRIKE_LIMIT) {
    until = new Date(Date.now() + RESTRICTION_DAYS * 24 * 3600_000).toISOString();
    db.prepare("UPDATE profiles SET restricted_until = ?, updated_at = ? WHERE id = ?").run(
      until,
      new Date().toISOString(),
      targetProfileId,
    );
  }

  notify(db, {
    profileId: targetProfileId,
    kind: "strike",
    title: strikes >= STRIKE_LIMIT ? "Posting paused for a fortnight" : `Strike ${strikes} of ${STRIKE_LIMIT}`,
    body:
      strikes >= STRIKE_LIMIT
        ? `The editor upheld a report: ${reason}. Posting is paused until ${until!.slice(0, 10)}. You can still read and report.`
        : `The editor upheld a report: ${reason}. ${STRIKE_LIMIT - strikes} more and posting pauses for ${RESTRICTION_DAYS} days.`,
    leagueId,
    refType: "strike",
    refId: id,
  });

  return { strike: readStrike(db, id), strikes, restrictedUntil: until };
}

export type ReportDecision = "dismiss" | "hide" | "strike";

export interface HandleReportResult {
  report: ReportDTO;
  strike: StrikeDTO | null;
  restrictedUntil: string | null;
}

export function handleReport(
  db: Db,
  actorId: string,
  reportId: string,
  decision: ReportDecision,
  note: string,
): HandleReportResult {
  return transaction(db, () => {
    assertAdmin(db, actorId);
    const row = db
      .prepare(
        `SELECT r.*, l.name AS league_name FROM reports r
           LEFT JOIN leagues l ON l.id = r.league_id WHERE r.id = ?`,
      )
      .get(reportId) as unknown as ReportRow | undefined;
    if (!row) throw new AppError(404, "report_not_found", "That report is no longer in the queue.");
    if (row.status !== "open") throw new AppError(409, "report_closed", "That report has already been handled.");

    const target = readTarget(db, row.target_type, row.target_id);
    let strike: StrikeDTO | null = null;
    let until: string | null = null;

    if (decision === "hide" || decision === "strike") {
      hideWithinTransaction(db, row.target_type, row.target_id);
    }

    if (decision === "strike") {
      if (!target?.authorId) {
        throw new AppError(409, "no_author", "That item has no author to record a strike against.");
      }
      const recorded = recordStrike(
        db,
        actorId,
        target.authorId,
        row.league_id,
        reportId,
        `${row.reason}${note ? ` — ${note}` : ""}`,
      );
      strike = recorded.strike;
      until = recorded.restrictedUntil;
    }

    if ((decision === "hide" || decision === "strike") && target?.authorId && decision === "hide") {
      notify(db, {
        profileId: target.authorId,
        kind: "moderation",
        title: "A post was hidden",
        body: `“${target.title}” was hidden after a report. ${note || "The editor left no note."}`,
        leagueId: row.league_id,
        refType: row.target_type,
        refId: row.target_id,
      });
    }

    const status: ReportStatus = decision === "dismiss" ? "dismissed" : "actioned";
    db.prepare(
      `UPDATE reports SET status = ?, handled_by = ?, handled_at = ?, resolution_note = ? WHERE id = ?`,
    ).run(status, actorId, new Date().toISOString(), note, reportId);

    audit(db, {
      leagueId: row.league_id,
      actorId,
      action: `report.${decision}`,
      targetType: row.target_type,
      targetId: row.target_id,
      meta: { reportId, note, reason: row.reason },
    });

    const updated = db
      .prepare(
        `SELECT r.*, l.name AS league_name FROM reports r
           LEFT JOIN leagues l ON l.id = r.league_id WHERE r.id = ?`,
      )
      .get(reportId) as unknown as ReportRow;

    return { report: reportFromRow(db, updated), strike, restrictedUntil: until };
  });
}

/** A steward can hide their own league's content without waiting for the editor. */
export function stewardHide(
  db: Db,
  actorId: string,
  targetType: ReportTarget,
  targetId: string,
  note: string,
): { hidden: true } {
  return transaction(db, () => {
    const target = readTarget(db, targetType, targetId);
    if (!target) throw new AppError(404, "target_not_found", "That item is no longer in the edition.");
    if (!target.leagueId) throw new AppError(409, "no_league", "That item does not belong to a league.");
    assertSteward(db, actorId, target.leagueId);

    hideWithinTransaction(db, targetType, targetId);
    if (target.authorId && target.authorId !== actorId) {
      notify(db, {
        profileId: target.authorId,
        kind: "moderation",
        title: "A steward hid your post",
        body: `“${target.title}” was hidden in ${target.leagueId}. ${note || "Ask your steward for context."}`,
        leagueId: target.leagueId,
        refType: targetType,
        refId: targetId,
      });
    }
    audit(db, {
      leagueId: target.leagueId,
      actorId,
      action: "moderation.hide",
      targetType,
      targetId,
      meta: { note },
    });
    return { hidden: true as const };
  });
}

/** The restriction window the UI shows, if one is active. */
export function activeRestriction(db: Db, profileId: string): string | null {
  return restrictedUntil(db, profileId);
}
