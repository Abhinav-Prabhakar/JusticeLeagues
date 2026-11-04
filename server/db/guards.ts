import { AppError } from "./errors";
import type { Db } from "./index";

/** An admin runs the paper; a steward runs a league. Neither is inferred from the browser. */
export function assertAdmin(db: Db, profileId: string): void {
  const row = db.prepare("SELECT role FROM profiles WHERE id = ?").get(profileId) as { role: string } | undefined;
  if (row?.role !== "admin") {
    throw new AppError(403, "admin_required", "Only the editor can open that desk.");
  }
}

export function restrictedUntil(db: Db, profileId: string): string | null {
  const row = db.prepare("SELECT restricted_until FROM profiles WHERE id = ?").get(profileId) as
    | { restricted_until: string | null }
    | undefined;
  const until = row?.restricted_until ?? null;
  if (!until) return null;
  return until > new Date().toISOString() ? until : null;
}

/**
 * A strike restriction pauses posting, not reading. Reports stay open to a
 * restricted neighbour — safety tools must never be the thing we take away.
 */
export function assertNotRestricted(db: Db, profileId: string): void {
  const until = restrictedUntil(db, profileId);
  if (!until) return;
  const day = until.slice(0, 10);
  throw new AppError(
    403,
    "restricted",
    `Posting is paused on this account until ${day}. Read the house rules or write to the editor.`,
  );
}
