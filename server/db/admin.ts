import { transaction, type Db } from "./index";
import { AppError } from "./errors";
import { audit } from "./anomalies";
import { notify } from "./notifications";
import { assertAdmin } from "./guards";
import type {
  AdminOverviewDTO,
  AdminUserDTO,
  AgeBand,
  AuditLogEntryDTO,
  FeatureFlagDTO,
  ProfileRole,
  PublicProfileDTO,
} from "../../src/lib/types";

interface FlagRow {
  key: string;
  label: string;
  description: string;
  enabled: number;
  updated_at: string;
}

function flagFromRow(row: FlagRow): FeatureFlagDTO {
  return {
    key: row.key,
    label: row.label,
    description: row.description,
    enabled: row.enabled === 1,
    updatedAt: row.updated_at,
  };
}

export function listFeatureFlags(db: Db): FeatureFlagDTO[] {
  const rows = db
    .prepare("SELECT key, label, description, enabled, updated_at FROM feature_flags ORDER BY key")
    .all() as unknown as FlagRow[];
  return rows.map(flagFromRow);
}

export function featureMap(db: Db): Record<string, boolean> {
  return Object.fromEntries(listFeatureFlags(db).map((flag) => [flag.key, flag.enabled]));
}

export function featureEnabled(db: Db, key: string): boolean {
  const row = db.prepare("SELECT enabled FROM feature_flags WHERE key = ?").get(key) as
    | { enabled: number }
    | undefined;
  return row ? row.enabled === 1 : true;
}

export function setFeatureFlag(
  db: Db,
  actorId: string,
  key: string,
  enabled: boolean,
): FeatureFlagDTO {
  return transaction(db, () => {
    assertAdmin(db, actorId);
    const result = db
      .prepare("UPDATE feature_flags SET enabled = ?, updated_at = ?, updated_by = ? WHERE key = ?")
      .run(enabled ? 1 : 0, new Date().toISOString(), actorId, key);
    if (Number(result.changes) === 0) throw new AppError(404, "flag_not_found", "That switch does not exist.");

    audit(db, {
      leagueId: null,
      actorId,
      action: "flag.set",
      targetType: "feature_flag",
      targetId: key,
      meta: { enabled },
    });

    const row = db
      .prepare("SELECT key, label, description, enabled, updated_at FROM feature_flags WHERE key = ?")
      .get(key) as unknown as FlagRow;
    return flagFromRow(row);
  });
}

export function adminOverview(db: Db, actorId: string): AdminOverviewDTO {
  assertAdmin(db, actorId);
  const one = (sql: string): number => Number((db.prepare(sql).get() as { value: number }).value) || 0;
  return {
    people: one("SELECT COUNT(*) AS value FROM profiles"),
    leagues: one("SELECT COUNT(*) AS value FROM leagues WHERE status = 'active'"),
    openReports: one("SELECT COUNT(*) AS value FROM reports WHERE status = 'open'"),
    strikes: one("SELECT COUNT(*) AS value FROM strikes"),
    restricted: Number(
      (
        db
          .prepare("SELECT COUNT(*) AS value FROM profiles WHERE restricted_until > ?")
          .get(new Date().toISOString()) as { value: number }
      ).value,
    ),
    ledgerRows: one("SELECT COUNT(*) AS value FROM points_ledger"),
    points: one("SELECT COALESCE(SUM(delta), 0) AS value FROM points_ledger"),
  };
}

interface AdminUserRow {
  id: string;
  handle: string;
  display_name: string;
  email: string;
  age_band: AgeBand;
  role: ProfileRole;
  restricted_until: string | null;
  created_at: string;
  leagues: number;
  points: number;
  strikes: number;
}

export function listAdminUsers(db: Db, actorId: string, q = ""): AdminUserDTO[] {
  assertAdmin(db, actorId);
  const term = q.trim().toLowerCase();
  const like = `%${term}%`;
  const filter = term ? "WHERE lower(p.email) LIKE ? OR lower(p.handle) LIKE ? OR lower(p.display_name) LIKE ?" : "";
  const params = term ? [like, like, like] : [];
  const rows = db
    .prepare(
      `SELECT p.id, p.handle, p.display_name, p.email, p.age_band, p.role,
              p.restricted_until, p.created_at,
              (SELECT COUNT(*) FROM league_members m
                WHERE m.profile_id = p.id AND m.status = 'active') AS leagues,
              (SELECT COALESCE(SUM(l.delta), 0) FROM points_ledger l
                WHERE l.profile_id = p.id) AS points,
              (SELECT COUNT(*) FROM strikes s WHERE s.profile_id = p.id) AS strikes
         FROM profiles p
         ${filter}
        ORDER BY p.created_at DESC LIMIT 200`,
    )
    .all(...params) as unknown as AdminUserRow[];

  return rows.map((row) => {
    const minor = row.age_band === "teen";
    return {
      profile: {
        id: row.id,
        handle: minor ? "" : row.handle,
        displayName: row.display_name,
        minor,
      } satisfies PublicProfileDTO,
      email: minor ? null : row.email,
      contactHidden: minor,
      role: row.role,
      ageBand: row.age_band,
      leagues: Number(row.leagues) || 0,
      points: Number(row.points) || 0,
      strikes: Number(row.strikes) || 0,
      restrictedUntil:
        row.restricted_until && row.restricted_until > new Date().toISOString() ? row.restricted_until : null,
      createdAt: row.created_at,
    };
  });
}

export function setUserRole(
  db: Db,
  actorId: string,
  profileId: string,
  role: ProfileRole,
): { role: ProfileRole } {
  return transaction(db, () => {
    assertAdmin(db, actorId);
    if (profileId === actorId) throw new AppError(409, "self_role", "You cannot change your own role.");
    const result = db
      .prepare("UPDATE profiles SET role = ?, updated_at = ? WHERE id = ?")
      .run(role, new Date().toISOString(), profileId);
    if (Number(result.changes) === 0) throw new AppError(404, "profile_not_found", "That neighbour is not on file.");

    notify(db, {
      profileId,
      kind: "role",
      title: role === "admin" ? "You are an editor now" : "Your editor access was removed",
      body:
        role === "admin"
          ? "The admin console is open to you: reports, strikes, flags, and the audit log."
          : "You can still steward your leagues. The admin console is closed.",
    });
    audit(db, {
      leagueId: null,
      actorId,
      action: "profile.role",
      targetType: "profile",
      targetId: profileId,
      meta: { role },
    });
    return { role };
  });
}

export function restrictProfile(
  db: Db,
  actorId: string,
  profileId: string,
  days: number,
  reason: string,
): { restrictedUntil: string } {
  return transaction(db, () => {
    assertAdmin(db, actorId);
    if (profileId === actorId) throw new AppError(409, "self_restrict", "You cannot restrict your own account.");
    const until = new Date(Date.now() + days * 24 * 3600_000).toISOString();
    const result = db
      .prepare("UPDATE profiles SET restricted_until = ?, updated_at = ? WHERE id = ?")
      .run(until, new Date().toISOString(), profileId);
    if (Number(result.changes) === 0) throw new AppError(404, "profile_not_found", "That neighbour is not on file.");

    notify(db, {
      profileId,
      kind: "moderation",
      title: "Posting paused",
      body: `${reason || "The editor paused posting"}. The pause lifts on ${until.slice(0, 10)}. Reading and reporting stay open.`,
    });
    audit(db, {
      leagueId: null,
      actorId,
      action: "profile.restrict",
      targetType: "profile",
      targetId: profileId,
      meta: { days, reason },
    });
    return { restrictedUntil: until };
  });
}

export function restoreProfile(db: Db, actorId: string, profileId: string): { restored: true } {
  return transaction(db, () => {
    assertAdmin(db, actorId);
    const result = db
      .prepare("UPDATE profiles SET restricted_until = NULL, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), profileId);
    if (Number(result.changes) === 0) throw new AppError(404, "profile_not_found", "That neighbour is not on file.");

    notify(db, {
      profileId,
      kind: "moderation",
      title: "Posting restored",
      body: "The pause on your account has been lifted. Welcome back.",
    });
    audit(db, {
      leagueId: null,
      actorId,
      action: "profile.restore",
      targetType: "profile",
      targetId: profileId,
      meta: {},
    });
    return { restored: true as const };
  });
}

interface AuditRow {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  league_id: string | null;
  league_name: string | null;
  meta: string;
  created_at: string;
  actor_id: string | null;
  actor_handle: string | null;
  actor_name: string | null;
  actor_age_band: string | null;
}

export function listAuditLog(db: Db, actorId: string, limit = 100): AuditLogEntryDTO[] {
  assertAdmin(db, actorId);
  const rows = db
    .prepare(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.league_id, a.meta, a.created_at,
              a.actor_id, p.handle AS actor_handle, p.display_name AS actor_name, p.age_band AS actor_age_band,
              l.name AS league_name
         FROM audit_log a
         LEFT JOIN profiles p ON p.id = a.actor_id
         LEFT JOIN leagues l ON l.id = a.league_id
        ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
    )
    .all(Math.min(500, Math.max(1, limit))) as unknown as AuditRow[];

  return rows.map((row) => {
    const minor = row.actor_age_band === "teen";
    return {
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      leagueId: row.league_id,
      leagueName: row.league_name,
      actor:
        row.actor_id && row.actor_name
          ? {
              id: row.actor_id,
              handle: minor ? "" : (row.actor_handle ?? ""),
              displayName: row.actor_name,
              minor,
            }
          : null,
      meta: JSON.parse(row.meta) as Record<string, unknown>,
      createdAt: row.created_at,
    } satisfies AuditLogEntryDTO;
  });
}
