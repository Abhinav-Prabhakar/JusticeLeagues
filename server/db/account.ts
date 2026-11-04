import { transaction, type Db } from "./index";
import { AppError } from "./errors";
import { audit } from "./anomalies";
import { getMe } from "./repository";
import { listNotifications } from "./notifications";
import { listStrikes } from "./moderation";
import type { DataExportDTO } from "../../src/lib/types";

/** Everything the paper holds about one neighbour, in one file. */
export function exportAccount(db: Db, profileId: string): DataExportDTO {
  const me = getMe(db, profileId);
  return {
    exportedAt: new Date().toISOString(),
    profile: me.profile,
    memberships: me.memberships,
    signups: me.signups,
    ledger: me.ledger,
    badges: me.badges,
    notifications: listNotifications(db, profileId, 500).items,
    strikes: listStrikes(db, profileId),
  };
}

/**
 * Delete the account, keep the record.
 *
 * The ledger is append-only: rows keep their points but lose the person, so
 * league totals and the public record still reconcile. Everything else that
 * identifies the neighbour goes. A league they owned passes to its earliest
 * steward so a deletion cannot leave a chapter headless.
 */
export function deleteAccount(db: Db, profileId: string): { deleted: true } {
  return transaction(db, () => {
    const profile = db.prepare("SELECT id, handle FROM profiles WHERE id = ?").get(profileId) as
      | { id: string; handle: string }
      | undefined;
    if (!profile) throw new AppError(401, "unauthenticated", "Session no longer valid.");

    const owned = db
      .prepare("SELECT league_id FROM league_members WHERE profile_id = ? AND role = 'owner' AND status = 'active'")
      .all(profileId) as unknown as { league_id: string }[];

    for (const { league_id } of owned) {
      const heir = db
        .prepare(
          `SELECT profile_id FROM league_members
            WHERE league_id = ? AND profile_id <> ? AND status = 'active' AND role IN ('steward', 'member')
            ORDER BY CASE role WHEN 'steward' THEN 0 ELSE 1 END, joined_at
            LIMIT 1`,
        )
        .get(league_id, profileId) as { profile_id: string } | undefined;
      if (heir) {
        db.prepare("UPDATE league_members SET role = 'owner' WHERE league_id = ? AND profile_id = ?").run(
          league_id,
          heir.profile_id,
        );
        audit(db, {
          leagueId: league_id,
          actorId: profileId,
          action: "league.owner_handover",
          targetType: "profile",
          targetId: heir.profile_id,
          meta: { reason: "account deleted" },
        });
      }
    }

    // Columns that reference a profile without ON DELETE SET NULL.
    const nulled: [string, string][] = [
      ["wins", "submitted_by"],
      ["wins", "reviewed_by"],
      ["shifts", "created_by"],
      ["shift_signups", "checked_in_by"],
      ["anomalies", "resolved_by"],
      ["league_invites", "created_by"],
      ["league_invites", "used_by"],
      ["reports", "handled_by"],
    ];
    for (const [table, column] of nulled) {
      db.prepare(`UPDATE ${table} SET ${column} = NULL WHERE ${column} = ?`).run(profileId);
    }

    audit(db, {
      leagueId: null,
      actorId: profileId,
      action: "profile.delete",
      targetType: "profile",
      targetId: profileId,
      meta: { handle: profile.handle },
    });

    db.prepare("DELETE FROM profiles WHERE id = ?").run(profileId);
    return { deleted: true as const };
  });
}
