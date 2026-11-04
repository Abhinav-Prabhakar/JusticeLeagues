import type { PublicLedgerDTO, PublicLedgerEntryDTO } from "../../src/lib/types";
import type { Db } from "./index";

interface LedgerRow {
  id: string;
  delta: number;
  reason: string;
  ref_type: string;
  league_id: string;
  league_name: string;
  league_slug: string;
  chapter_id: string | null;
  chapter_name: string | null;
  profile_id: string | null;
  handle: string | null;
  display_name: string | null;
  created_at: string;
}

export interface PublicLedgerOptions {
  leagueId?: string | null;
  profileId?: string | null;
  refType?: string | null;
  limit?: number;
  offset?: number;
  includeSealed?: boolean;
  /** Skip the imported-history fallback and return live entries only. */
  liveOnly?: boolean;
}

/**
 * The public record. Imported chapter history is excluded by default — it has
 * no local author and would drown the page in structural rows. When a fresh
 * database has no live awards at all, the page falls back to the imported
 * history so it is never blank; `source` tells the UI which it is showing.
 */
export function listPublicLedger(db: Db, options: PublicLedgerOptions = {}): PublicLedgerDTO {
  const page = readLedger(db, { ...options, includeSealed: Boolean(options.includeSealed) });
  if (page.total > 0 || options.includeSealed || options.liveOnly) return page;

  const fallback = readLedger(db, { ...options, includeSealed: true });
  return { ...fallback, source: fallback.total > 0 ? "imported" : "live" };
}

function readLedger(db: Db, options: PublicLedgerOptions): PublicLedgerDTO {
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const offset = Math.max(0, options.offset ?? 0);
  const where: string[] = ["1 = 1"];
  const params: (string | number)[] = [];

  if (!options.includeSealed) where.push("p.ref_type <> 'sealed_history'");
  if (options.leagueId) {
    where.push("p.league_id = ?");
    params.push(options.leagueId);
  }
  if (options.profileId) {
    where.push("p.profile_id = ?");
    params.push(options.profileId);
  }
  if (options.refType) {
    where.push("p.ref_type = ?");
    params.push(options.refType);
  }

  const clause = where.join(" AND ");
  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS count FROM points_ledger p WHERE ${clause}`).get(...params) as { count: number })
      .count,
  );

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN p.delta > 0 THEN p.delta ELSE 0 END), 0) AS awarded,
         COALESCE(SUM(CASE WHEN p.delta < 0 THEN -p.delta ELSE 0 END), 0) AS reversed
       FROM points_ledger p WHERE ${clause}`,
    )
    .get(...params) as { awarded: number; reversed: number };

  const rows = db
    .prepare(
      `SELECT p.id, p.delta, p.reason, p.ref_type, p.league_id, p.chapter_id, p.profile_id,
              p.created_at, l.name AS league_name, l.slug AS league_slug,
              c.name AS chapter_name, pr.handle, pr.display_name
         FROM points_ledger p
         JOIN leagues l ON l.id = p.league_id
         LEFT JOIN chapters c ON c.id = p.chapter_id
         LEFT JOIN profiles pr ON pr.id = p.profile_id
        WHERE ${clause}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as unknown as LedgerRow[];

  return {
    entries: rows.map(
      (row): PublicLedgerEntryDTO => ({
        id: row.id,
        delta: Number(row.delta),
        reason: row.reason,
        refType: row.ref_type,
        leagueId: row.league_id,
        leagueName: row.league_name,
        leagueSlug: row.league_slug,
        chapterId: row.chapter_id,
        chapterName: row.chapter_name,
        profile:
          row.profile_id && row.display_name
            ? { id: row.profile_id, handle: row.handle ?? row.profile_id, displayName: row.display_name }
            : null,
        createdAt: row.created_at,
      }),
    ),
    total,
    limit,
    offset,
    totals: { awarded: Number(totals.awarded) || 0, reversed: Number(totals.reversed) || 0 },
    source: options.includeSealed ? "imported" : "live",
  };
}
