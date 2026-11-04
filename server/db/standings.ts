import type { Cause } from "../../src/data/fixtures";
import type { StandingRowDTO, StandingsDTO, StandingsScope } from "../../src/lib/types";
import type { Db } from "./index";
import { monthBounds, weekKey } from "./sealed";

/** Consecutive weeks with a positive ledger row, ending this week or last week. */
function streakFromWeeks(weeks: Set<string>, currentWeek: string): number {
  if (weeks.size === 0) return 0;
  const start = new Date(`${currentWeek}T00:00:00.000Z`);
  if (!weeks.has(currentWeek)) {
    start.setUTCDate(start.getUTCDate() - 7);
    if (!weeks.has(start.toISOString().slice(0, 10))) return 0;
  }
  let streak = 0;
  const cursor = new Date(start);
  while (weeks.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return streak;
}

/**
 * Rebuild the cached standings. Runs inside the caller's transaction, on
 * every ledger write and once on startup. Ranks use deterministic tie-breaks:
 * points, then members, then league id.
 *
 * Everything is expressed as a handful of set-based queries: a scratch table
 * holds the per-league aggregates, then one windowed `INSERT ... SELECT`
 * assigns all four ranks. That keeps a 10k-league rebuild inside the budget
 * instead of pushing 10k rows through a JS upsert loop.
 */
export function rebuildStandings(db: Db): void {
  const now = new Date();
  const bounds = monthBounds(now);
  const currentWeek = weekKey(now);
  const stamp = now.toISOString();

  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS _standing_activity (
      league_id        TEXT PRIMARY KEY,
      points           INTEGER NOT NULL DEFAULT 0,
      month_points     INTEGER NOT NULL DEFAULT 0,
      prev_month_points INTEGER NOT NULL DEFAULT 0,
      members          INTEGER NOT NULL DEFAULT 0,
      projects         INTEGER NOT NULL DEFAULT 0,
      hours            INTEGER NOT NULL DEFAULT 0,
      streak           INTEGER NOT NULL DEFAULT 0,
      trend            TEXT NOT NULL DEFAULT '[]'
    )
  `);
  db.exec("DELETE FROM _standing_activity");

  db.prepare(
    `INSERT INTO _standing_activity
       (league_id, points, month_points, prev_month_points, members, projects, hours)
     SELECT l.id,
            COALESCE(p.points, 0),
            COALESCE(p.month, 0),
            COALESCE(p.previous, 0),
            l.base_members + COALESCE(m.count, 0),
            l.base_projects + COALESCE(w.count, 0),
            l.base_hours + COALESCE(h.hours, 0)
       FROM leagues l
       LEFT JOIN (
         SELECT league_id, SUM(delta) AS points,
                SUM(CASE WHEN created_at >= ? AND created_at < ? THEN delta ELSE 0 END) AS month,
                SUM(CASE WHEN created_at >= ? AND created_at < ? THEN delta ELSE 0 END) AS previous
           FROM points_ledger GROUP BY league_id
       ) p ON p.league_id = l.id
       LEFT JOIN (
         SELECT league_id, COUNT(*) AS count FROM league_members WHERE status = 'active' GROUP BY league_id
       ) m ON m.league_id = l.id
       LEFT JOIN (
         SELECT league_id, COUNT(*) AS count FROM wins
          WHERE status = 'approved' AND submitted_by IS NOT NULL GROUP BY league_id
       ) w ON w.league_id = l.id
       LEFT JOIN (
         SELECT s.league_id, SUM(ss.hours) AS hours
           FROM shift_signups ss JOIN shifts s ON s.id = ss.shift_id
          WHERE ss.status = 'attended' GROUP BY s.league_id
       ) h ON h.league_id = l.id
      WHERE l.status = 'active'`,
  ).run(bounds.start, bounds.end, bounds.previousStart, bounds.start);

  // Trend: the last twelve weekly ledger sums, one row per league per week.
  const weekBuckets = new Map<string, Map<string, number>>();
  const trendStart = new Date(now);
  trendStart.setUTCHours(0, 0, 0, 0);
  trendStart.setUTCDate(trendStart.getUTCDate() - 83);
  for (const row of db
    .prepare("SELECT league_id, created_at, delta FROM points_ledger WHERE created_at >= ?")
    .all(trendStart.toISOString()) as unknown as {
    league_id: string;
    created_at: string;
    delta: number;
  }[]) {
    const key = weekKey(row.created_at);
    const buckets = weekBuckets.get(row.league_id) ?? new Map<string, number>();
    buckets.set(key, (buckets.get(key) ?? 0) + Number(row.delta));
    weekBuckets.set(row.league_id, buckets);
  }

  // Activity weeks, grouped in SQL so a long history never has to be read row by row.
  const weeksByLeague = new Map<string, Set<string>>();
  for (const row of db
    .prepare(
      `SELECT league_id, MIN(created_at) AS sample FROM points_ledger
        WHERE delta > 0 GROUP BY league_id, strftime('%Y-%W', created_at)`,
    )
    .all() as unknown as { league_id: string; sample: string }[]) {
    const weeks = weeksByLeague.get(row.league_id) ?? new Set<string>();
    weeks.add(weekKey(row.sample));
    weeksByLeague.set(row.league_id, weeks);
  }

  const currentMonday = new Date(`${currentWeek}T00:00:00.000Z`);
  const trendDates = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(currentMonday);
    date.setUTCDate(date.getUTCDate() - (11 - index) * 7);
    return date.toISOString().slice(0, 10);
  });

  const leagueIds = db.prepare("SELECT league_id FROM _standing_activity").all() as unknown as {
    league_id: string;
  }[];
  const updateActivity = db.prepare(
    "UPDATE _standing_activity SET streak = ?, trend = ? WHERE league_id = ?",
  );
  for (const { league_id } of leagueIds) {
    const buckets = weekBuckets.get(league_id);
    const trend = trendDates.map((date) => buckets?.get(date) ?? 0);
    updateActivity.run(
      streakFromWeeks(weeksByLeague.get(league_id) ?? new Set(), currentWeek),
      JSON.stringify(trend),
      league_id,
    );
  }

  // One statement assigns every rank; ROW_NUMBER keeps ties deterministic.
  db.prepare(
    `INSERT OR REPLACE INTO league_standings
       (league_id, cause, city_id, points, month_points, prev_month_points, members, projects,
        hours, streak, trend, rank_global, rank_city, rank_cause, rank_month, rebuilt_at)
     SELECT l.id, l.cause, l.city_id, a.points, a.month_points, a.prev_month_points,
            a.members, a.projects, a.hours, a.streak, a.trend,
            ROW_NUMBER() OVER (ORDER BY a.points DESC, a.members DESC, l.id ASC),
            ROW_NUMBER() OVER (PARTITION BY l.city_id ORDER BY a.points DESC, a.members DESC, l.id ASC),
            ROW_NUMBER() OVER (PARTITION BY l.cause ORDER BY a.points DESC, a.members DESC, l.id ASC),
            ROW_NUMBER() OVER (ORDER BY a.month_points DESC, a.members DESC, l.id ASC),
            ?
       FROM leagues l
       JOIN _standing_activity a ON a.league_id = l.id
      WHERE l.status = 'active'`,
  ).run(stamp);

  db.prepare(
    "DELETE FROM league_standings WHERE league_id NOT IN (SELECT id FROM leagues WHERE status = 'active')",
  ).run();

  // Chapter rows are a pure aggregate, so let SQLite rank and upsert them in
  // one statement rather than pushing 30k rows through JavaScript.
  db.prepare(
    `INSERT OR REPLACE INTO chapter_standings
       (chapter_id, league_id, points, month_points, rank_in_league, rebuilt_at)
     SELECT c.id, c.league_id, COALESCE(agg.points, 0), COALESCE(agg.month, 0),
            ROW_NUMBER() OVER (
              PARTITION BY c.league_id
              ORDER BY COALESCE(agg.points, 0) DESC, c.id ASC
            ),
            ?
       FROM chapters c
       LEFT JOIN (
         SELECT chapter_id,
                SUM(delta) AS points,
                SUM(CASE WHEN created_at >= ? AND created_at < ? THEN delta ELSE 0 END) AS month
           FROM points_ledger
          WHERE chapter_id IS NOT NULL
          GROUP BY chapter_id
       ) agg ON agg.chapter_id = c.id`,
  ).run(stamp, bounds.start, bounds.end);
}

interface StandingQueryRow {
  league_id: string;
  league_slug: string;
  league_name: string;
  cause: Cause;
  hood: string;
  points: number;
  month_points: number;
  members: number;
  projects: number;
  hours: number;
  streak: number;
  trend: string;
  rank: number;
  chapter_id: string | null;
  chapter_name: string | null;
}

export interface LeaderboardOptions {
  scope: StandingsScope;
  cause?: Cause | "all";
  cityId?: string | null;
  leagueId?: string | null;
  limit?: number;
  offset?: number;
}

export function listStandings(db: Db, options: LeaderboardOptions): StandingsDTO {
  const scope = options.scope;
  const cause = options.cause ?? "all";
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);
  const city =
    (db
      .prepare("SELECT id, name FROM cities ORDER BY name LIMIT 1")
      .get() as { id: string; name: string } | undefined) ?? null;
  const cityId = options.cityId ?? city?.id ?? null;
  const bounds = monthBounds();

  if (scope === "chapter") {
    const where: string[] = ["l.status = 'active'"];
    const params: (string | number)[] = [];
    if (cause !== "all") {
      where.push("l.cause = ?");
      params.push(cause);
    }
    if (cityId) {
      where.push("l.city_id = ?");
      params.push(cityId);
    }
    if (options.leagueId) {
      where.push("c.league_id = ?");
      params.push(options.leagueId);
    }

    const total = Number(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM chapter_standings cs
               JOIN chapters c ON c.id = cs.chapter_id
               JOIN leagues l ON l.id = c.league_id
              WHERE ${where.join(" AND ")}`,
          )
          .get(...params) as { count: number }
      ).count,
    );

    const rows = db
      .prepare(
        `SELECT cs.chapter_id, c.name AS chapter_name, c.league_id,
                l.slug AS league_slug, l.name AS league_name, l.cause,
                n.name AS hood, cs.points, cs.month_points,
                s.members, s.projects, s.hours, s.streak, s.trend,
                ROW_NUMBER() OVER (ORDER BY cs.points DESC, c.id ASC) AS rank
           FROM chapter_standings cs
           JOIN chapters c ON c.id = cs.chapter_id
           JOIN leagues l ON l.id = c.league_id
           JOIN neighborhoods n ON n.id = c.neighborhood_id
           JOIN league_standings s ON s.league_id = c.league_id
          WHERE ${where.join(" AND ")}
          ORDER BY cs.points DESC, c.id ASC
          LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as unknown as StandingQueryRow[];

    const improved = mostImproved(db, causeId(cause), cityId);
    return {
      scope,
      cause,
      cityId,
      cityName: city?.name ?? null,
      month: bounds.key,
      updatedAt: latestRebuild(db),
      total,
      rows: rows.map(standingFromRow),
      mostImproved: improved,
    };
  }

  const where: string[] = ["l.status = 'active'"];
  const params: (string | number)[] = [];
  if (cause !== "all") {
    where.push("l.cause = ?");
    params.push(cause);
  }
  if (cityId) {
    where.push("s.city_id = ?");
    params.push(cityId);
  }

  const order =
    scope === "month" ? "s.rank_month ASC, l.id ASC" : scope === "cause" ? "s.rank_cause ASC, l.id ASC" : scope === "city" ? "s.rank_city ASC, l.id ASC" : "s.rank_global ASC, l.id ASC";
  const metric = scope === "month" ? "s.month_points" : "s.points";

  const total = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM league_standings s
             JOIN leagues l ON l.id = s.league_id
            WHERE ${where.join(" AND ")}`,
        )
        .get(...params) as { count: number }
    ).count,
  );

  const rows = db
    .prepare(
      `SELECT s.league_id, l.slug AS league_slug, l.name AS league_name, l.cause,
              n.name AS hood, ${metric} AS points, s.month_points, s.members, s.projects,
              s.hours, s.streak, s.trend,
              CASE WHEN ? = 'month' THEN s.rank_month
                   WHEN ? = 'cause' THEN s.rank_cause
                   WHEN ? = 'city' THEN s.rank_city
                   ELSE s.rank_global END AS rank,
              NULL AS chapter_id, NULL AS chapter_name
         FROM league_standings s
         JOIN leagues l ON l.id = s.league_id
         JOIN chapters c ON c.id = 'ch_' || l.id
         JOIN neighborhoods n ON n.id = c.neighborhood_id
        WHERE ${where.join(" AND ")}
        ORDER BY ${order}
        LIMIT ? OFFSET ?`,
    )
    .all(scope, scope, scope, ...params, limit, offset) as unknown as StandingQueryRow[];

  return {
    scope,
    cause,
    cityId,
    cityName: city?.name ?? null,
    month: bounds.key,
    updatedAt: latestRebuild(db),
    total,
    rows: rows.map(standingFromRow),
    mostImproved: mostImproved(db, causeId(cause), cityId),
  };
}

function causeId(cause: Cause | "all"): Cause | null {
  return cause === "all" ? null : cause;
}

function mostImproved(db: Db, cause: Cause | null, cityId: string | null) {
  const where = ["l.status = 'active'", "s.month_points > 0"];
  const params: (string | number)[] = [];
  if (cause) {
    where.push("l.cause = ?");
    params.push(cause);
  }
  if (cityId) {
    where.push("s.city_id = ?");
    params.push(cityId);
  }
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsed = Math.max(1, now.getUTCDate());
  const row = db
    .prepare(
      `SELECT s.league_id, l.name AS league_name,
              (s.month_points * ? / ? - s.prev_month_points) AS delta
         FROM league_standings s JOIN leagues l ON l.id = s.league_id
        WHERE ${where.join(" AND ")}
        ORDER BY delta DESC, l.id ASC LIMIT 1`,
    )
    .get(daysInMonth, elapsed, ...params) as { league_id: string; league_name: string; delta: number } | undefined;
  if (!row || Number(row.delta) <= 0) return null;
  return { leagueId: row.league_id, leagueName: row.league_name, delta: Math.round(Number(row.delta)) };
}

function latestRebuild(db: Db): string | null {
  const row = db.prepare("SELECT MAX(rebuilt_at) AS stamp FROM league_standings").get() as
    | { stamp: string | null }
    | undefined;
  return row?.stamp ?? null;
}

function standingFromRow(row: StandingQueryRow): StandingRowDTO {
  return {
    rank: Number(row.rank),
    leagueId: row.league_id,
    leagueSlug: row.league_slug,
    leagueName: row.league_name,
    cause: row.cause,
    hood: row.hood,
    points: Number(row.points),
    monthPoints: Number(row.month_points),
    members: Number(row.members),
    projects: Number(row.projects),
    hours: Number(row.hours),
    streak: Number(row.streak),
    trend: JSON.parse(row.trend) as number[],
    chapterId: row.chapter_id ?? null,
    chapterName: row.chapter_name ?? null,
  };
}
