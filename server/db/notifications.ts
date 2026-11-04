import { newId, type Db } from "./index";
import type { NotificationDTO, NotificationInboxDTO, NotificationKind } from "../../src/lib/types";

export interface NotifyInput {
  profileId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  leagueId?: string | null;
  refType?: string;
  refId?: string;
}

interface NotificationRow {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  league_id: string | null;
  ref_type: string;
  ref_id: string;
  read_at: string | null;
  created_at: string;
}

function toDTO(row: NotificationRow): NotificationDTO {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    leagueId: row.league_id,
    refType: row.ref_type,
    refId: row.ref_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/**
 * Write one inbox entry. Called inside the caller's transaction so an award
 * and the note that explains it can never land separately.
 */
export function notify(db: Db, input: NotifyInput): void {
  db.prepare(
    `INSERT INTO notifications (id, profile_id, kind, title, body, league_id, ref_type, ref_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId("ntf"),
    input.profileId,
    input.kind,
    input.title,
    input.body ?? "",
    input.leagueId ?? null,
    input.refType ?? "",
    input.refId ?? "",
  );
}

/** Fan a notice out to every owner and steward of a league. */
export function notifyLeagueStewards(
  db: Db,
  leagueId: string,
  input: Omit<NotifyInput, "profileId" | "leagueId"> & { excludeProfileId?: string },
): number {
  const rows = db
    .prepare(
      `SELECT profile_id FROM league_members
        WHERE league_id = ? AND status = 'active' AND role IN ('owner', 'steward')`,
    )
    .all(leagueId) as unknown as { profile_id: string }[];

  let sent = 0;
  for (const row of rows) {
    if (row.profile_id === input.excludeProfileId) continue;
    notify(db, { ...input, profileId: row.profile_id, leagueId });
    sent += 1;
  }
  return sent;
}

export function notifyAdmins(
  db: Db,
  input: Omit<NotifyInput, "profileId">,
): number {
  const rows = db.prepare("SELECT id FROM profiles WHERE role = 'admin'").all() as unknown as { id: string }[];
  for (const row of rows) notify(db, { ...input, profileId: row.id });
  return rows.length;
}

export function unreadCount(db: Db, profileId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM notifications WHERE profile_id = ? AND read_at IS NULL")
    .get(profileId) as { count: number };
  return Number(row.count) || 0;
}

export function listNotifications(db: Db, profileId: string, limit = 50): NotificationInboxDTO {
  const items = db
    .prepare(
      `SELECT id, kind, title, body, league_id, ref_type, ref_id, read_at, created_at
         FROM notifications WHERE profile_id = ?
        ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(profileId, limit) as unknown as NotificationRow[];

  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM notifications WHERE profile_id = ?")
    .get(profileId) as { count: number };

  return { items: items.map(toDTO), unread: unreadCount(db, profileId), total: Number(count) || 0 };
}

/** Mark every note read, or only the listed ones. Returns rows touched. */
export function markNotificationsRead(db: Db, profileId: string, ids?: string[]): number {
  const now = new Date().toISOString();
  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    const result = db
      .prepare(
        `UPDATE notifications SET read_at = ?
          WHERE profile_id = ? AND read_at IS NULL AND id IN (${placeholders})`,
      )
      .run(now, profileId, ...ids);
    return Number(result.changes);
  }

  const result = db
    .prepare("UPDATE notifications SET read_at = ? WHERE profile_id = ? AND read_at IS NULL")
    .run(now, profileId);
  return Number(result.changes);
}
