import { newId, type Db } from "./index";
import type { AnomalyDTO, AnomalySeverity } from "../../src/lib/types";

export interface AwardFacts {
  ledgerId: string;
  profileId: string;
  leagueId: string;
  delta: number;
  refType: string;
  refId: string;
  createdAt: string;
}

interface AnomalyRow {
  id: string;
  league_id: string;
  profile_id: string | null;
  ledger_id: string | null;
  category: string;
  severity: AnomalySeverity;
  status: "open" | "cleared" | "reversed";
  detail: string;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string;
  handle: string | null;
  display_name: string | null;
  delta: number | null;
}

function record(
  db: Db,
  input: {
    leagueId: string;
    profileId: string | null;
    ledgerId: string | null;
    category: string;
    severity: AnomalySeverity;
    detail: string;
    dedupeKey: string;
    status?: "open" | "cleared" | "reversed";
    resolvedBy?: string | null;
    resolutionNote?: string;
  },
): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO anomalies
         (id, dedupe_key, league_id, profile_id, ledger_id, category, severity, status,
          detail, resolved_by, resolved_at, resolution_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId("anm"),
      input.dedupeKey,
      input.leagueId,
      input.profileId,
      input.ledgerId,
      input.category,
      input.severity,
      input.status ?? "open",
      input.detail,
      input.resolvedBy ?? null,
      input.resolvedBy ? new Date().toISOString() : null,
      input.resolutionNote ?? "",
    );
  return Number(result.changes) > 0;
}

/**
 * Soft caps and review triggers. Nothing here blocks a steward's award; flags
 * surface in the steward queue so a human can clear or reverse the entry.
 */
export function detectAwardAnomalies(db: Db, facts: AwardFacts): void {
  if (facts.delta <= 0) return;

  if (facts.delta >= 500) {
    record(db, {
      leagueId: facts.leagueId,
      profileId: facts.profileId,
      ledgerId: facts.ledgerId,
      category: "large_award",
      severity: "severe",
      detail: `A single award of ${facts.delta} JP is above the soft ceiling.`,
      dedupeKey: `large_award:${facts.ledgerId}`,
    });
  }

  if (facts.refType === "project" && facts.delta >= 400) {
    const project = db.prepare("SELECT evidence_url FROM wins WHERE id = ?").get(facts.refId) as
      | { evidence_url: string | null }
      | undefined;
    if (!project?.evidence_url) {
      record(db, {
        leagueId: facts.leagueId,
        profileId: facts.profileId,
        ledgerId: facts.ledgerId,
        category: "project_without_evidence",
        severity: "review",
        detail: `${facts.delta} JP approved without an evidence link.`,
        dedupeKey: `project_evidence:${facts.refId}`,
      });
    }
  }

  const day = facts.createdAt.slice(0, 10);
  const daily = db
    .prepare(
      `SELECT COALESCE(SUM(delta), 0) AS points FROM points_ledger
        WHERE profile_id = ? AND delta > 0 AND substr(created_at, 1, 10) = ?`,
    )
    .get(facts.profileId, day) as { points: number };
  if (Number(daily.points) > 250) {
    record(db, {
      leagueId: facts.leagueId,
      profileId: facts.profileId,
      ledgerId: facts.ledgerId,
      category: "daily_points",
      severity: "review",
      detail: `${Number(daily.points)} JP landed on one calendar day (cap watch: 250).`,
      dedupeKey: `daily_points:${facts.profileId}:${day}`,
    });
  }

  const weekStart = new Date(`${day}T00:00:00.000Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const weekly = db
    .prepare(
      `SELECT COALESCE(SUM(hours), 0) AS hours FROM shift_signups
        WHERE profile_id = ? AND status = 'attended' AND checked_in_at >= ?`,
    )
    .get(facts.profileId, weekStart.toISOString()) as { hours: number };
  if (Number(weekly.hours) > 40) {
    record(db, {
      leagueId: facts.leagueId,
      profileId: facts.profileId,
      ledgerId: facts.ledgerId,
      category: "weekly_hours",
      severity: "review",
      detail: `${Number(weekly.hours)} volunteer hours recorded in seven days (cap watch: 40).`,
      dedupeKey: `weekly_hours:${facts.profileId}:${day}`,
    });
  }

  const checkIns = db
    .prepare(
      `SELECT COUNT(*) AS count FROM shift_signups
        WHERE profile_id = ? AND status = 'attended' AND substr(checked_in_at, 1, 10) = ?`,
    )
    .get(facts.profileId, day) as { count: number };
  if (Number(checkIns.count) > 5) {
    record(db, {
      leagueId: facts.leagueId,
      profileId: facts.profileId,
      ledgerId: facts.ledgerId,
      category: "daily_checkins",
      severity: "watch",
      detail: `${Number(checkIns.count)} check-ins on one day (watch: 5).`,
      dedupeKey: `daily_checkins:${facts.profileId}:${day}`,
    });
  }
}

export function recordReversal(
  db: Db,
  input: {
    leagueId: string;
    profileId: string | null;
    originalLedgerId: string;
    reversalLedgerId: string;
    actorId: string;
    note: string;
  },
): void {
  record(db, {
    leagueId: input.leagueId,
    profileId: input.profileId,
    ledgerId: input.originalLedgerId,
    category: "steward_reversal",
    severity: "review",
    detail: input.note || "A steward reversed this ledger entry.",
    dedupeKey: `reversal:${input.originalLedgerId}`,
    status: "reversed",
    resolvedBy: input.actorId,
    resolutionNote: input.note,
  });
  void input.reversalLedgerId;
}

export function listAnomalyRows(db: Db, leagueId: string): AnomalyDTO[] {
  const rows = db
    .prepare(
      `SELECT a.*, p.handle, p.display_name, l.delta
         FROM anomalies a
         LEFT JOIN profiles p ON p.id = a.profile_id
         LEFT JOIN points_ledger l ON l.id = a.ledger_id
        WHERE a.league_id = ?
        ORDER BY CASE a.status WHEN 'open' THEN 0 ELSE 1 END,
                 CASE a.severity WHEN 'severe' THEN 0 WHEN 'review' THEN 1 ELSE 2 END,
                 a.created_at DESC`,
    )
    .all(leagueId) as unknown as AnomalyRow[];

  return rows.map((row) => ({
    id: row.id,
    leagueId: row.league_id,
    profile:
      row.profile_id && row.display_name
        ? { id: row.profile_id, handle: row.handle ?? row.profile_id, displayName: row.display_name }
        : null,
    ledgerId: row.ledger_id,
    category: row.category,
    severity: row.severity,
    status: row.status,
    detail: row.detail,
    delta: row.delta === null ? null : Number(row.delta),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
  }));
}

export function readAnomaly(db: Db, anomalyId: string) {
  return db.prepare("SELECT * FROM anomalies WHERE id = ?").get(anomalyId) as
    | {
        id: string;
        league_id: string;
        profile_id: string | null;
        ledger_id: string | null;
        status: string;
      }
    | undefined;
}

export function resolveAnomalyRow(
  db: Db,
  anomalyId: string,
  actorId: string,
  status: "cleared" | "reversed",
  note: string,
): void {
  db.prepare(
    `UPDATE anomalies
        SET status = ?, resolved_by = ?, resolved_at = ?, resolution_note = ?
      WHERE id = ? AND status = 'open'`,
  ).run(status, actorId, new Date().toISOString(), note, anomalyId);
}

export function audit(
  db: Db,
  input: {
    leagueId: string | null;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    meta?: unknown;
  },
): void {
  db.prepare(
    `INSERT INTO audit_log (id, league_id, actor_id, action, target_type, target_id, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId("aud"),
    input.leagueId,
    input.actorId,
    input.action,
    input.targetType,
    input.targetId,
    JSON.stringify(input.meta ?? {}),
  );
}
