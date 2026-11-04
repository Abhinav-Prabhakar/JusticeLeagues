import type { ImpactDTO, ImpactMonthDTO, ImpactProjectDTO } from "../../src/lib/types";
import type { Db } from "./index";
import { monthBounds } from "./sealed";

const CATEGORY_LABELS: Record<string, string> = {
  sealed_history: "Imported chapter history",
  league_join: "Charter signings",
  shift_attendance: "Shift attendance",
  project: "Approved projects",
  reversal: "Steward corrections",
  resource: "Resource exchange",
  badge: "Badges",
};

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "short" });
}

interface WinFactRow {
  id: string;
  title: string;
  chapter_id: string | null;
  points: number;
  facts: string;
  occurred_at: string;
  evidence_url: string | null;
  chapter_name: string | null;
}

/**
 * Real impact aggregation. Points come from the ledger; project counts and
 * people/hours come from approved wins. Seeded projects are part of the
 * imported history, so the category split names that bucket explicitly rather
 * than pretending it was local activity.
 */
export function getImpact(db: Db, leagueId: string | null = null): ImpactDTO {
  const leagueFilter = leagueId ? "WHERE l.id = ?" : "";
  const params = leagueId ? [leagueId] : [];
  const now = new Date();
  const bounds = monthBounds(now);

  const totalsRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(p.delta), 0) AS points,
         COALESCE(SUM(CASE WHEN p.created_at >= ? AND p.created_at < ? THEN p.delta ELSE 0 END), 0) AS month,
         COUNT(DISTINCT p.profile_id) AS volunteers
       FROM points_ledger p
       JOIN leagues l ON l.id = p.league_id
       ${leagueFilter}`,
    )
    .get(bounds.start, bounds.end, ...params) as { points: number; month: number; volunteers: number };

  const base = db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(l.base_hours), 0) FROM leagues l ${leagueFilter}) AS base_hours,
         (SELECT COUNT(*) FROM chapters c JOIN leagues l ON l.id = c.league_id ${leagueId ? "WHERE l.id = ?" : ""}) AS chapters,
         (SELECT COUNT(*) FROM shifts s JOIN leagues l ON l.id = s.league_id ${leagueId ? "WHERE l.id = ?" : ""}) AS shifts`,
    )
    .get(...params, ...params, ...params) as { base_hours: number; chapters: number; shifts: number };

  const attendance = db
    .prepare(
      `SELECT COALESCE(SUM(ss.hours), 0) AS hours
         FROM shift_signups ss
         JOIN shifts s ON s.id = ss.shift_id
         JOIN leagues l ON l.id = s.league_id
        WHERE ss.status = 'attended' ${leagueId ? "AND l.id = ?" : ""}`,
    )
    .get(...params) as { hours: number };

  const wins = db
    .prepare(
      `SELECT w.id, w.title, w.chapter_id, w.points, w.facts, w.occurred_at, w.evidence_url,
              c.name AS chapter_name
         FROM wins w
         LEFT JOIN chapters c ON c.id = w.chapter_id
         JOIN leagues l ON l.id = w.league_id
        WHERE w.status = 'approved' ${leagueId ? "AND l.id = ?" : ""}
        ORDER BY w.occurred_at DESC`,
    )
    .all(...params) as unknown as WinFactRow[];

  let people = 0;
  const projects: ImpactProjectDTO[] = wins.map((win) => {
    let facts: { people?: number; hours?: number; amount?: string } = {};
    try {
      facts = JSON.parse(win.facts) as typeof facts;
    } catch {
      facts = {};
    }
    people += Number(facts.people) || 0;
    return {
      id: win.id,
      title: win.title,
      chapterId: win.chapter_id,
      chapterName: win.chapter_name,
      points: Number(win.points) || 0,
      people: Number(facts.people) || 0,
      hours: Number(facts.hours) || 0,
      amount: facts.amount ?? "",
      when: win.occurred_at,
      evidenceUrl: win.evidence_url,
    };
  });

  const chapters = leagueId
    ? (db
        .prepare(
          `SELECT c.id AS chapter_id, c.name, n.name AS hood,
                  COALESCE(cs.points, 0) AS points,
                  COALESCE(cs.month_points, 0) AS month_points,
                  COALESCE((SELECT COUNT(*) FROM wins w WHERE w.chapter_id = c.id AND w.status = 'approved'), 0) AS projects
             FROM chapters c
             JOIN neighborhoods n ON n.id = c.neighborhood_id
             LEFT JOIN chapter_standings cs ON cs.chapter_id = c.id
            WHERE c.league_id = ?
            ORDER BY points DESC, c.id`,
        )
        .all(leagueId) as unknown as {
        chapter_id: string;
        name: string;
        hood: string;
        points: number;
        month_points: number;
        projects: number;
      }[])
    : [];

  const totalPoints = Number(totalsRow.points) || 0;
  const byChapter = chapters.map((chapter) => ({
    chapterId: chapter.chapter_id,
    name: chapter.name,
    hood: chapter.hood,
    points: Number(chapter.points),
    monthPoints: Number(chapter.month_points),
    projects: Number(chapter.projects),
    share: totalPoints > 0 ? Math.round((Number(chapter.points) / totalPoints) * 100) : 0,
  }));

  const byMonth: ImpactMonthDTO[] = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1));
    const key = date.toISOString().slice(0, 7);
    return { month: key, label: monthLabel(key), points: 0 };
  });
  const monthIndex = new Map(byMonth.map((month) => [month.month, month]));
  const earliest = byMonth[0]?.month ?? bounds.key;
  for (const row of db
    .prepare(
      `SELECT substr(p.created_at, 1, 7) AS month, SUM(p.delta) AS points
         FROM points_ledger p
         JOIN leagues l ON l.id = p.league_id
        WHERE substr(p.created_at, 1, 7) >= ? ${leagueId ? "AND l.id = ?" : ""}
        GROUP BY month ORDER BY month`,
    )
    .all(earliest, ...params) as unknown as { month: string; points: number }[]) {
    const target = monthIndex.get(row.month);
    if (target) target.points = Number(row.points) || 0;
  }

  const byCategory = (
    db
      .prepare(
        `SELECT p.ref_type AS key, SUM(p.delta) AS points, COUNT(*) AS entries
           FROM points_ledger p
           JOIN leagues l ON l.id = p.league_id
          ${leagueFilter}
          GROUP BY p.ref_type
          ORDER BY points DESC`,
      )
      .all(...params) as unknown as { key: string; points: number; entries: number }[]
  ).map((row) => ({
    key: row.key,
    label: categoryLabel(row.key),
    points: Number(row.points) || 0,
    entries: Number(row.entries) || 0,
  }));

  return {
    leagueId,
    updatedAt: now.toISOString(),
    totals: {
      points: totalPoints,
      monthPoints: Number(totalsRow.month) || 0,
      hours: Number(base.base_hours) + (Number(attendance.hours) || 0),
      people,
      projects: wins.length,
      volunteers: Number(totalsRow.volunteers) || 0,
      shifts: Number(base.shifts) || 0,
      chapters: Number(base.chapters) || 0,
    },
    byChapter,
    byMonth,
    byCategory,
    projects: projects.slice(0, 20),
  };
}
