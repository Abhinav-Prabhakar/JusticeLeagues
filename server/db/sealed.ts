import { newId, type Db } from "./index";

/**
 * Phase 3 materialises the sealed newspaper history into the append-only
 * ledger. Before this, totals were `base_points + SUM(ledger.delta)`, which
 * meant the displayed number was not a ledger sum and chapter rollups were a
 * separate arithmetic path.
 *
 * History is written as weekly rows so the month scope, weekly streak and
 * sparkline are all real ledger aggregates rather than fixture decoration.
 * Keys include the chapter and week, so a backfill can never double-count.
 */

export const MS_WEEK = 7 * 24 * 3600_000;

const MAX_WEEKS = 52;
const MIN_WEEKS = 12;

export function startOfWeek(date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  return d;
}

export function weekKey(date: Date | string): string {
  return startOfWeek(typeof date === "string" ? new Date(date) : date).toISOString().slice(0, 10);
}

export function monthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export function monthBounds(date = new Date()): { start: string; end: string; previousStart: string; key: string } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const previousStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return { start: start.toISOString(), end: end.toISOString(), previousStart: previousStart.toISOString(), key: monthKey(date) };
}

function parseTrend(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => Math.max(1, Math.round(Number(item) || 1)));
  } catch {
    return [];
  }
}

/** Weekly weights: older weeks sit on the first trend value; recent weeks follow the printed curve. */
function weeklyWeights(weeks: number, trend: number[]): number[] {
  const baseline = trend[0] ?? 1;
  const recent = trend.length >= 12 ? trend.slice(-12) : Array.from({ length: 12 }, (_, i) => trend[i] ?? baseline);
  const weights: number[] = [];
  for (let i = 0; i < weeks; i++) {
    const fromEnd = weeks - 1 - i;
    weights.push(fromEnd < 12 ? recent[11 - fromEnd] : baseline);
  }
  return weights;
}

interface LeagueRow {
  id: string;
  base_points: number;
  base_streak: number;
  trend: string;
}

interface ChapterRow {
  id: string;
  base_points: number;
}

/**
 * Insert sealed weekly ledger rows for any chapter that does not have them
 * yet. Runs inside the caller's transaction.
 */
export function materializeSealedLedger(db: Db): number {
  const leagues = db
    .prepare("SELECT id, base_points, base_streak, trend FROM leagues ORDER BY id")
    .all() as unknown as LeagueRow[];
  if (leagues.length === 0) return 0;

  const chaptersByLeague = new Map<string, ChapterRow[]>();
  for (const chapter of db
    .prepare("SELECT id, league_id, base_points FROM chapters ORDER BY league_id, id")
    .all() as unknown as (ChapterRow & { league_id: string })[]) {
    const list = chaptersByLeague.get(chapter.league_id) ?? [];
    list.push(chapter);
    chaptersByLeague.set(chapter.league_id, list);
  }

  const hasSealed = db.prepare(
    "SELECT 1 FROM points_ledger WHERE chapter_id = ? AND ref_type = 'sealed_history' LIMIT 1",
  );
  const insert = db.prepare(
    `INSERT OR IGNORE INTO points_ledger
       (id, profile_id, league_id, chapter_id, delta, reason, ref_type, ref_id, idempotency_key, created_at)
     VALUES (?, NULL, ?, ?, ?, ?, 'sealed_history', ?, ?, ?)`,
  );

  let inserted = 0;
  for (const league of leagues) {
    if (league.base_points <= 0) continue;
    const weeks = Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, league.base_streak || MIN_WEEKS));
    const weights = weeklyWeights(weeks, parseTrend(league.trend));
    const weightSum = weights.reduce((total, weight) => total + weight, 0) || 1;

    const chapters = chaptersByLeague.get(league.id) ?? [];
    const buckets =
      chapters.length > 0
        ? chapters.map((chapter) => ({ chapterId: chapter.id, total: chapter.base_points }))
        : [{ chapterId: null, total: league.base_points }];

    for (const bucket of buckets) {
      if (bucket.total <= 0) continue;
      if (bucket.chapterId && hasSealed.get(bucket.chapterId)) continue;

      let remaining = bucket.total;
      for (let i = 0; i < weeks; i++) {
        const delta = i === weeks - 1 ? remaining : Math.floor((bucket.total * weights[i]) / weightSum);
        remaining -= delta;
        if (delta === 0) continue;

        const start = startOfWeek();
        start.setUTCDate(start.getUTCDate() - (weeks - 1 - i) * 7);
        start.setUTCHours(12, 0, 0, 0);
        const day = start.toISOString().slice(0, 10);
        const ref = bucket.chapterId ?? league.id;

        const result = insert.run(
          newId("pts"),
          league.id,
          bucket.chapterId,
          delta,
          "Imported chapter history",
          ref,
          `sealed:${ref}:${day}`,
          start.toISOString(),
        );
        inserted += Number(result.changes);
      }
    }
  }

  return inserted;
}
