/**
 * Demo identities shared by the seed script, the pre-hydration shell, and the
 * read-only GitHub Pages edition. Keeping one source means a chapter's
 * steward has the same name, handle, and role everywhere.
 */

import { LEAGUES, type League } from "./fixtures";
import type { ChapterDTO, LeagueMemberDTO } from "../lib/types";

/** Password for every seeded chapter steward. Documented in the README. */
export const DEMO_PASSWORD = "millbrook";

export const DEMO_NAMES = [
  "Ada Okafor",
  "Bruno Salas",
  "Camille Duval",
  "Darius Reed",
  "Elena Petrova",
  "Farah Haddad",
  "Gideon Park",
  "Hana Mori",
  "Imani Brooks",
  "Jonas Weber",
  "Keiko Tan",
  "Lucas Moreau",
  "Maren Oduya",
  "Nadia Rahman",
  "Omar Haddad",
  "Priya Nair",
  "Quinn Alvarez",
  "Rosa Delgado",
  "Samir Patel",
  "Tessa Lindqvist",
  "Umar Bello",
  "Vera Kovac",
  "Wes Tanaka",
  "Ximena Ortiz",
  "Yara Haddad",
  "Zane Whitfield",
  "Aisha Bello",
  "Diego Ramos",
  "Freya Holm",
  "Hugo Mensah",
];

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Neighbourhoods heard from across the city, alphabetical. */
const HOODS = [...new Set(LEAGUES.map((league) => league.hood))].sort();

/**
 * Three chapters per league: the founding neighbourhood keeps 60% of the
 * sealed history, the next two neighbourhoods split the rest. The seeded
 * database builds exactly this shape.
 */
export function demoChapters(league: League): ChapterDTO[] {
  const founding = Math.round(league.points * 0.6);
  const second = Math.round(league.points * 0.25);
  const others = HOODS.filter((hood) => hood !== league.hood).slice(0, 2);
  const shares = [second, league.points - founding - second];

  return [
    {
      id: `ch_${league.id}`,
      name: `${league.hood} chapter`,
      hood: league.hood,
      points: founding,
      status: "active",
    },
    ...others.map((hood, index) => ({
      id: `ch_${league.id}_${index + 2}`,
      name: `${hood} chapter`,
      hood,
      points: shares[index],
      status: "active" as const,
    })),
  ];
}

/** The seeded steward roster for a league, one steward per chapter. */
export function demoMembers(league: League): LeagueMemberDTO[] {
  const leagueIndex = Math.max(
    0,
    LEAGUES.findIndex((item) => item.id === league.id),
  );

  return demoChapters(league).map((chapter, index) => {
    const name = DEMO_NAMES[(leagueIndex * 3 + index) % DEMO_NAMES.length];
    return {
      profile: {
        id: `usr_seed_${league.id}_${index + 1}`,
        handle: slugify(name),
        displayName: name,
      },
      role: index === 0 ? "owner" : "steward",
      chapterId: chapter.id,
      joinedAt: new Date(Date.UTC(league.founded, 4, index + 1, 9)).toISOString(),
    };
  });
}

export function demoStewardEmail(leagueId: string, chapterIndex: number): string {
  return `steward.${leagueId}.${chapterIndex + 1}@justiceleagues.local`;
}
