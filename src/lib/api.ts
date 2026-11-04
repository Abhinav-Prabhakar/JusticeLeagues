import type {
  EditionDTO,
  ImpactChapterDTO,
  ImpactDTO,
  ImpactProjectDTO,
  LeagueDTO,
  LeagueMemberDTO,
  MeDTO,
  MembershipDTO,
  PublicLedgerDTO,
  SearchDTO,
  ShiftDTO,
  StandingsDTO,
  StandingsScope,
} from "./types";
import { LEAGUES, SHIFTS, WINS, type Cause } from "../data/fixtures";
import { demoChapters, demoMembers, demoResources } from "../data/demo";
import { CITY_CENTRE, distanceKm, hoodCoords } from "../data/geo";

/**
 * The GitHub Pages build is a read-only newspaper: no API, no accounts.
 * Vite sets `mode = "pages"` (see `vite.config.ts` and `build:pages`).
 */
export const STATIC_PREVIEW = import.meta.env.MODE === "pages";

export const STATIC_PREVIEW_MESSAGE =
  "This is the read-only static edition. Run the paper locally to sign in, join a league, or claim a shift.";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (STATIC_PREVIEW) throw new ApiError(503, "static_preview", STATIC_PREVIEW_MESSAGE);

  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const response = await fetch(path, { credentials: "same-origin", ...init, headers });
  const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;

  if (!response.ok) {
    throw new ApiError(response.status, payload?.code ?? "request_failed", payload?.error ?? "The press jammed.");
  }
  return payload as T;
}

export const isUnauthenticated = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.code === "unauthenticated");

/** The edition before the server answers, so the page never flashes empty. */
export function initialEdition(): EditionDTO {
  const leagues: LeagueDTO[] = LEAGUES.map((league) => {
    const coords = hoodCoords(league.hood) ?? CITY_CENTRE;
    return {
      ...league,
      slug: league.id,
      lat: coords.lat,
      lng: coords.lng,
      chapters: demoChapters(league),
    };
  });

  const shifts: ShiftDTO[] = SHIFTS.map((shift) => {
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const start = new Date(monday);
    start.setDate(start.getDate() + shift.day);
    return {
      ...shift,
      chapterId: `ch_${shift.league}`,
      startsAt: start.toISOString(),
      waitlist: 0,
      waitlistPosition: null,
    };
  });

  return {
    leagues,
    shifts,
    wins: WINS,
    resources: LEAGUES.flatMap(demoResources),
    me: null,
    // The static edition ships with every switch on; it has no admin desk.
    flags: { atlas_geolocation: true, printed_profile: true, resources_exchange: true, public_ledger: true },
  };
}

export interface StaticLeagueDetail {
  league: LeagueDTO;
  members: LeagueMemberDTO[];
}

/** League detail for the static edition — derived from the same fixtures as the seed. */
export function staticLeagueDetail(leagueId: string): StaticLeagueDetail {
  const leagues = initialEdition().leagues;
  const league = leagues.find((item) => item.id === leagueId) ?? leagues[0];
  const fixture = LEAGUES.find((item) => item.id === league.id)!;
  return { league, members: demoMembers(fixture) };
}

function searchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && token.length <= 40)
    .slice(0, 8);
}

/**
 * Discovery search for the printed edition. It mirrors the server's
 * semantics — prefix-ish matching, cause and distance filters — without an
 * API, so the Atlas behaves the same offline.
 */
export function staticSearch(options: {
  q?: string;
  cause?: Cause | "all";
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number | null;
  limit?: number;
}): SearchDTO {
  const query = (options.q ?? "").trim();
  const tokens = searchTokens(query);
  const cause = options.cause ?? "all";
  const origin =
    options.lat !== null && options.lat !== undefined && options.lng !== null && options.lng !== undefined
      ? { lat: options.lat, lng: options.lng }
      : null;
  const radiusKm = options.radiusKm ?? null;
  const limit = options.limit ?? 20;

  let leagues = initialEdition().leagues;
  if (cause !== "all") leagues = leagues.filter((league) => league.cause === cause);

  const scored = leagues
    .map((league) => {
      const haystack = `${league.name} ${league.hood} ${league.cause} ${league.motto}`.toLowerCase();
      const score = tokens.reduce((total, token) => {
        if (league.name.toLowerCase().startsWith(token)) return total;
        return total + (haystack.includes(token) ? 1 : 100);
      }, 0);
      return {
        league,
        score: tokens.length ? score : 0,
        distanceKm: origin ? distanceKm(origin, { lat: league.lat, lng: league.lng }) : null,
        matched: tokens.length === 0 || tokens.every((token) => haystack.includes(token)),
      };
    })
    .filter((item) => item.matched)
    .filter((item) => !origin || radiusKm === null || (item.distanceKm ?? Infinity) <= radiusKm);

  scored.sort((a, b) => {
    if (tokens.length) {
      const score = a.score - b.score;
      if (score !== 0) return score;
    }
    if (origin) {
      const distance = (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
      if (distance !== 0) return distance;
    }
    return b.league.points - a.league.points || a.league.id.localeCompare(b.league.id);
  });

  return {
    query,
    results: scored.slice(0, limit).map((item) => ({ ...item.league, distanceKm: item.distanceKm })),
    total: scored.length,
    centre: origin,
    radiusKm,
  };
}

export function activeMembership(me: MeDTO | null, leagueId: string): MembershipDTO | undefined {
  return me?.memberships.find((membership) => membership.leagueId === leagueId && membership.status === "active");
}

export function isSignedUp(me: MeDTO | null, shiftId: string): boolean {
  return Boolean(me?.signups.some((signup) => signup.shiftId === shiftId));
}

/**
 * Standings for the static edition. The printed fixtures already carry the
 * same fields the API returns, so the leaderboard renders identically on
 * GitHub Pages — only the cache timestamp is missing.
 */
export function staticStandings(options: {
  scope: StandingsScope;
  cause?: Cause | "all";
  limit?: number;
}): StandingsDTO {
  const cause = options.cause ?? "all";
  const metric = (league: LeagueDTO) => (options.scope === "month" ? league.month : league.points);
  const list = initialEdition()
    .leagues.filter((league) => cause === "all" || league.cause === cause)
    .sort((a, b) => metric(b) - metric(a) || b.members - a.members || a.id.localeCompare(b.id));

  const rows = list.slice(0, options.limit ?? 50).map((league, index) => ({
    rank: index + 1,
    leagueId: league.id,
    leagueSlug: league.slug,
    leagueName: league.name,
    cause: league.cause,
    hood: league.hood,
    points: metric(league),
    monthPoints: league.month,
    members: league.members,
    projects: league.projects,
    hours: league.hours,
    streak: league.streak,
    trend: league.trend,
    chapterId: null,
    chapterName: null,
  }));

  const improved = [...list].sort((a, b) => b.delta - a.delta)[0];

  return {
    scope: options.scope,
    cause,
    cityId: null,
    cityName: "Millbrook",
    month: new Date().toISOString().slice(0, 7),
    updatedAt: null,
    total: list.length,
    rows,
    mostImproved: improved ? { leagueId: improved.id, leagueName: improved.name, delta: improved.delta } : null,
  };
}

function staticChapterRows(leagues: LeagueDTO[]): ImpactChapterDTO[] {
  const total = leagues.reduce((sum, league) => sum + league.points, 0);
  return leagues.flatMap((league) =>
    league.chapters.map((chapter) => ({
      chapterId: chapter.id,
      name: chapter.name,
      hood: chapter.hood,
      points: chapter.points,
      monthPoints: 0,
      projects: 0,
      share: total > 0 ? Math.round((chapter.points / total) * 100) : 0,
    })),
  );
}

/** Impact aggregation for the static edition, derived from the same fixtures. */
export function staticImpact(leagueId: string | null): ImpactDTO {
  const edition = initialEdition();
  const leagues = leagueId ? edition.leagues.filter((league) => league.id === leagueId) : edition.leagues;
  const wins = leagueId ? edition.wins.filter((win) => win.league === leagueId) : edition.wins;

  const projects: ImpactProjectDTO[] = wins.map((win) => ({
    id: win.id,
    title: win.title,
    chapterId: `ch_${win.league}`,
    chapterName: null,
    points: win.jp,
    people: win.facts.people,
    hours: win.facts.hours,
    amount: win.facts.amount,
    when: win.when,
    evidenceUrl: null,
  }));

  const categoryMap = new Map<string, { points: number; entries: number }>();
  const add = (key: string, points: number) => {
    const bucket = categoryMap.get(key) ?? { points: 0, entries: 0 };
    bucket.points += points;
    bucket.entries += 1;
    categoryMap.set(key, bucket);
  };
  // The printed wins are part of the imported history, so attributing their
  // points again would double count. Categories must sum to the league total.
  for (const league of leagues) add("sealed_history", league.points);

  return {
    leagueId,
    updatedAt: new Date().toISOString(),
    totals: {
      points: leagues.reduce((sum, league) => sum + league.points, 0),
      monthPoints: leagues.reduce((sum, league) => sum + league.month, 0),
      hours: leagues.reduce((sum, league) => sum + league.hours, 0),
      people: wins.reduce((sum, win) => sum + win.facts.people, 0),
      projects: leagues.reduce((sum, league) => sum + league.projects, 0),
      volunteers: leagues.reduce((sum, league) => sum + league.members, 0),
      shifts: edition.shifts.filter((shift) => !leagueId || shift.league === leagueId).length,
      chapters: leagues.reduce((sum, league) => sum + league.chapters.length, 0),
    },
    byChapter: staticChapterRows(leagues),
    byMonth: [],
    byCategory: [...categoryMap.entries()].map(([key, bucket]) => ({
      key,
      label: key === "sealed_history" ? "Imported chapter history" : "Approved projects",
      points: bucket.points,
      entries: bucket.entries,
    })),
    projects: projects.slice(0, 20),
  };
}

/**
 * The static edition has no live ledger, so the public record falls back to
 * the printed wins. Entries are flagged with `refType: "project"` and have no
 * author, which is exactly what the printed edition contains.
 */
export function staticPublicLedger(options: {
  leagueId?: string | null;
  limit?: number;
  offset?: number;
}): PublicLedgerDTO {
  const limit = options.limit ?? 25;
  const offset = options.offset ?? 0;
  const edition = initialEdition();
  const rows = edition.wins
    .filter((win) => !options.leagueId || win.league === options.leagueId)
    .map((win) => {
      const league = edition.leagues.find((item) => item.id === win.league);
      return {
        id: win.id,
        delta: win.jp,
        reason: win.title,
        refType: "project",
        leagueId: win.league,
        leagueName: league?.name ?? win.league,
        leagueSlug: league?.slug ?? win.league,
        chapterId: `ch_${win.league}`,
        chapterName: null,
        profile: null,
        createdAt: new Date().toISOString(),
      };
    });

  return {
    entries: rows.slice(offset, offset + limit),
    total: rows.length,
    limit,
    offset,
    totals: {
      awarded: rows.reduce((sum, row) => sum + Math.max(0, row.delta), 0),
      reversed: rows.reduce((sum, row) => sum + Math.max(0, -row.delta), 0),
    },
    source: "imported",
  };
}

/**
 * A young neighbour's handle is withheld from public DTOs, so the UI falls
 * back to the display name rather than printing a bare "@".
 */
export function handleLabel(profile: { handle: string; displayName: string } | null | undefined): string {
  if (!profile) return "";
  return profile.handle ? `@${profile.handle}` : profile.displayName;
}
