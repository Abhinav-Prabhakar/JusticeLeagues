import type { EditionDTO, LeagueDTO, MeDTO, MembershipDTO, ShiftDTO } from "./types";
import { LEAGUES, SHIFTS, WINS } from "../data/fixtures";

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
    chapters: [
      {
        id: `ch_${league.id}`,
        name: `${league.hood} chapter`,
        hood: league.hood,
        points: league.points,
        status: "active",
      },
    ],
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
    };
  });

  return { leagues, shifts, wins: WINS, me: null };
}

export function activeMembership(me: MeDTO | null, leagueId: string): MembershipDTO | undefined {
  return me?.memberships.find((membership) => membership.leagueId === leagueId && membership.status === "active");
}

export function isSignedUp(me: MeDTO | null, shiftId: string): boolean {
  return Boolean(me?.signups.some((signup) => signup.shiftId === shiftId));
}
