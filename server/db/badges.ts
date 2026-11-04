import type { BadgeDTO, StreakDTO } from "../../src/lib/types";
import type { Db } from "./index";
import { weekKey } from "./sealed";

export interface BadgeDefinition {
  key: string;
  label: string;
  description: string;
  icon: string;
  category: "milestone" | "streak" | "craft" | "role";
  threshold: number;
}

export const BADGES: BadgeDefinition[] = [
  {
    key: "first_join",
    label: "Signed the charter",
    description: "Joined your first Justice League.",
    icon: "pen",
    category: "milestone",
    threshold: 1,
  },
  {
    key: "first_shift",
    label: "First shift",
    description: "A steward checked you in for your first shift.",
    icon: "calendar-check",
    category: "milestone",
    threshold: 1,
  },
  {
    key: "five_shifts",
    label: "Five shifts",
    description: "Showed up for five shifts.",
    icon: "calendar-check",
    category: "craft",
    threshold: 5,
  },
  {
    key: "ten_shifts",
    label: "Ten shifts",
    description: "Showed up for ten shifts.",
    icon: "medal",
    category: "craft",
    threshold: 10,
  },
  {
    key: "first_project",
    label: "Project on the record",
    description: "Filed a project that a steward approved.",
    icon: "file-check",
    category: "milestone",
    threshold: 1,
  },
  {
    key: "three_projects",
    label: "Three projects",
    description: "Three approved projects in the public record.",
    icon: "file-check",
    category: "craft",
    threshold: 3,
  },
  {
    key: "points_100",
    label: "Century",
    description: "Earned 100 Justice Points.",
    icon: "sparkles",
    category: "milestone",
    threshold: 100,
  },
  {
    key: "points_1000",
    label: "Thousand",
    description: "Earned 1,000 Justice Points.",
    icon: "trophy",
    category: "milestone",
    threshold: 1000,
  },
  {
    key: "streak_4",
    label: "Four weeks on",
    description: "Active for four weeks in a row.",
    icon: "flame",
    category: "streak",
    threshold: 4,
  },
  {
    key: "streak_12",
    label: "A season of service",
    description: "Active for twelve weeks in a row.",
    icon: "flame",
    category: "streak",
    threshold: 12,
  },
  {
    key: "chapter_builder",
    label: "Chapter builder",
    description: "Approved project points in three neighbourhood chapters.",
    icon: "map",
    category: "craft",
    threshold: 3,
  },
  {
    key: "ledger_keeper",
    label: "Ledger keeper",
    description: "Ten entries in the public ledger.",
    icon: "book",
    category: "craft",
    threshold: 10,
  },
  {
    key: "charter_steward",
    label: "Charter steward",
    description: "Holds a founding steward seat in the printed edition.",
    icon: "shield",
    category: "role",
    threshold: 1,
  },
];

export function seedBadges(db: Db): void {
  const insert = db.prepare(
    `INSERT INTO badges (key, label, description, icon, category, threshold)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET
       label = excluded.label,
       description = excluded.description,
       icon = excluded.icon,
       category = excluded.category,
       threshold = excluded.threshold`,
  );
  for (const badge of BADGES) {
    insert.run(badge.key, badge.label, badge.description, badge.icon, badge.category, badge.threshold);
  }
}

export function listBadges(db: Db, profileId: string): BadgeDTO[] {
  const awarded = new Map(
    (
      db
        .prepare("SELECT badge_key, awarded_at FROM profile_badges WHERE profile_id = ?")
        .all(profileId) as unknown as { badge_key: string; awarded_at: string }[]
    ).map((row) => [row.badge_key, row.awarded_at]),
  );

  return BADGES.map((badge) => ({
    key: badge.key,
    label: badge.label,
    description: badge.description,
    icon: badge.icon,
    category: badge.category,
    awardedAt: awarded.get(badge.key) ?? null,
  }));
}

export function streakForProfile(db: Db, profileId: string, now = new Date()): StreakDTO {
  const weeks = new Set(
    (
      db
        .prepare(
          `SELECT MIN(created_at) AS sample FROM points_ledger
            WHERE profile_id = ? AND delta > 0
            GROUP BY strftime('%Y-%W', created_at)`,
        )
        .all(profileId) as unknown as { sample: string }[]
    ).map((row) => weekKey(row.sample)),
  );

  const current = streakEnding(weeks, weekKey(now));
  let longest = 0;
  for (const week of weeks) {
    longest = Math.max(longest, streakEnding(weeks, week));
  }

  return {
    current,
    longest,
    weekActive: weeks.has(weekKey(now)),
  };
}

function streakEnding(weeks: Set<string>, end: string): number {
  if (!weeks.has(end)) return 0;
  let streak = 0;
  const cursor = new Date(`${end}T00:00:00.000Z`);
  while (weeks.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return streak;
}

function awardBadge(db: Db, profileId: string, key: string, leagueId: string | null = null): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO profile_badges (profile_id, badge_key, league_id)
       VALUES (?, ?, ?)`,
    )
    .run(profileId, key, leagueId);
  return Number(result.changes) > 0;
}

/**
 * Evaluate every badge for a profile. Idempotent: `profile_badges` has a
 * composite primary key, so re-running after a ledger write cannot duplicate.
 */
export function evaluateBadges(db: Db, profileId: string): void {
  if (!db.prepare("SELECT 1 FROM profiles WHERE id = ?").get(profileId)) return;

  const counts = db
    .prepare(
      `SELECT
         COUNT(*) AS entries,
         SUM(CASE WHEN ref_type = 'league_join' THEN 1 ELSE 0 END) AS joins,
         SUM(CASE WHEN ref_type = 'shift_attendance' THEN 1 ELSE 0 END) AS attendances,
         SUM(CASE WHEN ref_type = 'project' THEN 1 ELSE 0 END) AS projects,
         COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS points
       FROM points_ledger WHERE profile_id = ?`,
    )
    .get(profileId) as {
    entries: number;
    joins: number | null;
    attendances: number | null;
    projects: number | null;
    points: number | null;
  };

  const joins = Number(counts.joins) || 0;
  const attendances = Number(counts.attendances) || 0;
  const projects = Number(counts.projects) || 0;
  const points = Number(counts.points) || 0;
  const entries = Number(counts.entries) || 0;
  const streak = streakForProfile(db, profileId).current;

  if (joins >= 1) awardBadge(db, profileId, "first_join");
  if (attendances >= 1) awardBadge(db, profileId, "first_shift");
  if (attendances >= 5) awardBadge(db, profileId, "five_shifts");
  if (attendances >= 10) awardBadge(db, profileId, "ten_shifts");
  if (projects >= 1) awardBadge(db, profileId, "first_project");
  if (projects >= 3) awardBadge(db, profileId, "three_projects");
  if (points >= 100) awardBadge(db, profileId, "points_100");
  if (points >= 1000) awardBadge(db, profileId, "points_1000");
  if (streak >= 4) awardBadge(db, profileId, "streak_4");
  if (streak >= 12) awardBadge(db, profileId, "streak_12");
  if (entries >= 10) awardBadge(db, profileId, "ledger_keeper");

  const chapters = db
    .prepare(
      `SELECT COUNT(DISTINCT chapter_id) AS count FROM points_ledger
        WHERE profile_id = ? AND ref_type = 'project' AND chapter_id IS NOT NULL`,
    )
    .get(profileId) as { count: number };
  if (Number(chapters.count) >= 3) awardBadge(db, profileId, "chapter_builder");
}
