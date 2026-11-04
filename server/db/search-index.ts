/**
 * The FTS5 write side. Kept apart from `search.ts` so the repository can
 * rebuild the index inside its own transactions without importing the query
 * layer (which reads league DTOs back out of the repository).
 */

import type { Db } from "./index";

/** User text → safe FTS5 prefix tokens. Operators and punctuation are dropped. */
export function searchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && token.length <= 40)
    .slice(0, 8);
}

/** Rebuild the search cache from the source tables. Idempotent. */
export function rebuildLeagueSearch(db: Db): number {
  db.prepare("DELETE FROM league_search").run();

  const rows = db
    .prepare(
      `SELECT l.id, l.name, l.cause, l.motto,
        COALESCE(
          (SELECT n.name
             FROM chapters c
             JOIN neighborhoods n ON n.id = c.neighborhood_id
            WHERE c.id = 'ch_' || l.id),
          ''
        ) AS hood
       FROM leagues l
       WHERE l.status = 'active'
       ORDER BY l.id`,
    )
    .all() as unknown as { id: string; name: string; cause: string; motto: string; hood: string }[];

  const insert = db.prepare("INSERT INTO league_search (league_id, name, hood, cause, motto) VALUES (?, ?, ?, ?, ?)");
  for (const row of rows) insert.run(row.id, row.name, row.hood, row.cause, row.motto);

  return rows.length;
}
