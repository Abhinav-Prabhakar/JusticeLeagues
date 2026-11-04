import type { EditionDTO, LeagueDTO, LeagueMemberDTO, MeDTO, MembershipDTO, ShiftDTO } from "./types";
import { LEAGUES, SHIFTS, WINS } from "../data/fixtures";
import { demoChapters, demoMembers, demoResources } from "../data/demo";

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
  const leagues: LeagueDTO[] = LEAGUES.map((league) => ({
    ...league,
    slug: league.id,
    chapters: demoChapters(league),
  }));

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

  return { leagues, shifts, wins: WINS, resources: LEAGUES.flatMap(demoResources), me: null };
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

export function activeMembership(me: MeDTO | null, leagueId: string): MembershipDTO | undefined {
  return me?.memberships.find((membership) => membership.leagueId === leagueId && membership.status === "active");
}

export function isSignedUp(me: MeDTO | null, shiftId: string): boolean {
  return Boolean(me?.signups.some((signup) => signup.shiftId === shiftId));
}
