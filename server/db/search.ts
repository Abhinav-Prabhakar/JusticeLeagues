import type { Cause } from "../../src/data/fixtures";
import { distanceKm, type LatLng } from "../../src/data/geo";
import type { SearchDTO, SearchResultDTO } from "../../src/lib/types";
import type { Db } from "./index";
import { listLeagues } from "./repository";
import { searchTokens } from "./search-index";

export interface SearchOptions {
  q?: string;
  cause?: Cause | "all";
  origin?: LatLng | null;
  /** Only used when an origin is supplied. */
  radiusKm?: number | null;
  limit?: number;
}

interface RankedRow {
  league_id: string;
  score: number;
}

/**
 * Discovery search. A non-empty query is answered by FTS5 (bm25, lower is
 * better) and then ordered by distance; an empty query lists every active
 * league by distance when an origin is present, or by points otherwise.
 */
export function searchLeagues(db: Db, options: SearchOptions = {}): SearchDTO {
  const q = (options.q ?? "").trim();
  const cause = options.cause ?? "all";
  const origin = options.origin ?? null;
  const radiusKm = options.radiusKm ?? null;
  const limit = options.limit ?? 20;

  const tokens = searchTokens(q);
  let ranks: Map<string, number> | null = null;

  if (tokens.length > 0) {
    const match = tokens.map((token) => `${token}*`).join(" ");
    const rows = db
      .prepare(
        `SELECT league_id, bm25(league_search) AS score
           FROM league_search
          WHERE league_search MATCH ?
          ORDER BY score, league_id`,
      )
      .all(match) as unknown as RankedRow[];
    ranks = new Map(rows.map((row) => [row.league_id, Number(row.score)]));
  }

  let leagues = listLeagues(db);
  if (ranks) leagues = leagues.filter((league) => ranks!.has(league.id));
  if (cause !== "all") leagues = leagues.filter((league) => league.cause === cause);

  let results: SearchResultDTO[] = leagues.map((league) => ({
    ...league,
    distanceKm: origin ? distanceKm(origin, { lat: league.lat, lng: league.lng }) : null,
  }));

  if (origin && radiusKm !== null) {
    results = results.filter((result) => result.distanceKm !== null && result.distanceKm <= radiusKm);
  }

  results.sort((a, b) => {
    if (ranks) {
      const score = (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0);
      if (score !== 0) return score;
    }
    if (origin) {
      const distance = (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
      if (distance !== 0) return distance;
    }
    return b.points - a.points || a.id.localeCompare(b.id);
  });

  return {
    query: q,
    results: results.slice(0, limit),
    total: results.length,
    centre: origin,
    radiusKm,
  };
}
