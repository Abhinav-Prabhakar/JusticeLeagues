import type { Bring, Cause } from "../data/fixtures";
import type { LatLng } from "../data/geo";

export interface ChapterDTO {
  id: string;
  leagueId: string;
  name: string;
  hood: string;
  points: number;
  status: "active" | "dormant";
  lat: number;
  lng: number;
}

export interface LeagueDTO {
  id: string;
  slug: string;
  name: string;
  cause: Cause;
  hood: string;
  points: number;
  city: number;
  month: number;
  delta: number;
  trend: number[];
  members: number;
  projects: number;
  streak: number;
  hours: number;
  photo: number;
  /** Atlas percentages, derived from lat/lng. */
  x: number;
  y: number;
  /** Real position used for distance search. */
  lat: number;
  lng: number;
  founded: number;
  recruiting: boolean;
  motto: string;
  /** Server-cached all-time rank. Absent in the static fixture shell. */
  rank?: number;
  /** Server-cached rank for the current calendar month. */
  monthRank?: number;
  chapters: ChapterDTO[];
}

export interface ShiftDTO {
  id: string;
  league: string;
  chapterId: string;
  title: string;
  day: number;
  startsAt: string;
  time: string;
  dur: string;
  place: string;
  spots: number;
  filled: number;
  waitlist: number;
  /** One-based place in this shift's waitlist, when you are on it. */
  waitlistPosition: number | null;
  bring: Bring[];
}

export interface WinDTO {
  id: string;
  league: string;
  title: string;
  jp: number;
  photo: number;
  when: string;
  facts: { people: number; hours: number; amount: string };
  chapterId?: string | null;
  summary?: string;
  evidenceUrl?: string | null;
}

export type ProjectStatus = "submitted" | "approved" | "rejected";

export type ResourceKind = "offer" | "want";
export type ResourceStatus = "open" | "claimed" | "fulfilled" | "expired";

export interface ResourceDTO {
  id: string;
  league: string;
  chapterId: string | null;
  kind: ResourceKind;
  title: string;
  description: string;
  quantity: string;
  neededBy: string | null;
  status: ResourceStatus;
  createdBy: PublicProfileDTO | null;
  claimedBy: PublicProfileDTO | null;
  createdAt: string;
}

export interface ProjectDTO {
  id: string;
  league: string;
  chapterId: string | null;
  title: string;
  summary: string;
  occurredOn: string;
  facts: { people: number; hours: number; amount: string };
  evidenceUrl: string | null;
  photo: number;
  status: ProjectStatus;
  /** Points the project is worth; awarded only once it is approved. */
  points: number;
  submittedBy: PublicProfileDTO | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ProfileDTO {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  bio: string;
  homeNeighborhood: string | null;
  causes: Cause[];
  createdAt: string;
}

export interface MembershipDTO {
  leagueId: string;
  chapterId: string | null;
  role: "owner" | "steward" | "member";
  status: "active" | "invited" | "left";
  joinedAt: string;
  /** Points this member has personally earned in this league. */
  points: number;
}

export type InviteRole = "member" | "steward";
export type InviteStatus = "open" | "used" | "expired";

export interface InvitePreviewDTO {
  leagueId: string;
  leagueName: string;
  leagueHood: string;
  leagueCause: Cause;
  chapterId: string | null;
  chapterHood: string | null;
  role: InviteRole;
  note: string;
  invitedBy: PublicProfileDTO | null;
  expiresAt: string;
  status: InviteStatus;
}

export interface CreatedInviteDTO {
  token: string;
  path: string;
  preview: InvitePreviewDTO;
}

export interface SignupDTO {
  shiftId: string;
  status: "reserved" | "confirmed" | "waitlist" | "attended" | "no_show" | "cancelled";
  createdAt: string;
}

export interface LedgerEntryDTO {
  id: string;
  delta: number;
  reason: string;
  leagueId: string;
  leagueName: string;
  createdAt: string;
}

export interface BadgeDTO {
  key: string;
  label: string;
  description: string;
  icon: string;
  category: string;
  awardedAt: string | null;
}

export interface StreakDTO {
  current: number;
  longest: number;
  weekActive: boolean;
}

export interface MeDTO {
  profile: ProfileDTO;
  memberships: MembershipDTO[];
  signups: SignupDTO[];
  points: number;
  ledger: LedgerEntryDTO[];
  badges: BadgeDTO[];
  streak: StreakDTO;
}

export interface EditionDTO {
  leagues: LeagueDTO[];
  shifts: ShiftDTO[];
  wins: WinDTO[];
  resources: ResourceDTO[];
  me: MeDTO | null;
}

export interface PublicProfileDTO {
  id: string;
  handle: string;
  displayName: string;
}

export interface ShiftRosterEntryDTO {
  profile: PublicProfileDTO;
  status: "reserved" | "confirmed" | "attended" | "no_show" | "waitlist";
  hours: number;
  checkedInAt: string | null;
}

export interface ShiftRosterDTO {
  shift: ShiftDTO;
  pointsPerHour: number;
  /** Spots already filled in the printed edition; they have no local signup. */
  sealed: number;
  entries: ShiftRosterEntryDTO[];
}

export interface LeagueMemberDTO {
  profile: PublicProfileDTO;
  role: "owner" | "steward" | "member";
  chapterId: string | null;
  joinedAt: string;
}

export type StandingsScope = "global" | "city" | "cause" | "chapter" | "month";

export interface StandingRowDTO {
  rank: number;
  leagueId: string;
  leagueSlug: string;
  leagueName: string;
  cause: Cause;
  hood: string;
  points: number;
  monthPoints: number;
  members: number;
  projects: number;
  hours: number;
  streak: number;
  trend: number[];
  /** Set when the scope is `chapter`. */
  chapterId: string | null;
  chapterName: string | null;
}

export interface StandingsDTO {
  scope: StandingsScope;
  cause: Cause | "all";
  cityId: string | null;
  cityName: string | null;
  month: string;
  updatedAt: string | null;
  total: number;
  rows: StandingRowDTO[];
  mostImproved: { leagueId: string; leagueName: string; delta: number } | null;
}

/** A league plus its distance from the search origin, when one was sent. */
export interface SearchResultDTO extends LeagueDTO {
  distanceKm: number | null;
}

export interface SearchDTO {
  query: string;
  results: SearchResultDTO[];
  total: number;
  centre: LatLng | null;
  radiusKm: number | null;
}

export interface ImpactChapterDTO {
  chapterId: string;
  name: string;
  hood: string;
  points: number;
  monthPoints: number;
  projects: number;
  share: number;
}

export interface ImpactMonthDTO {
  month: string;
  label: string;
  points: number;
}

export interface ImpactCategoryDTO {
  key: string;
  label: string;
  points: number;
  entries: number;
}

export interface ImpactProjectDTO {
  id: string;
  title: string;
  chapterId: string | null;
  chapterName: string | null;
  points: number;
  people: number;
  hours: number;
  amount: string;
  when: string;
  evidenceUrl: string | null;
}

export interface ImpactDTO {
  leagueId: string | null;
  updatedAt: string;
  totals: {
    points: number;
    monthPoints: number;
    hours: number;
    people: number;
    projects: number;
    volunteers: number;
    shifts: number;
    chapters: number;
  };
  byChapter: ImpactChapterDTO[];
  byMonth: ImpactMonthDTO[];
  byCategory: ImpactCategoryDTO[];
  projects: ImpactProjectDTO[];
}

export interface PublicLedgerEntryDTO {
  id: string;
  delta: number;
  reason: string;
  refType: string;
  leagueId: string;
  leagueName: string;
  leagueSlug: string;
  chapterId: string | null;
  chapterName: string | null;
  profile: PublicProfileDTO | null;
  createdAt: string;
}

export interface PublicLedgerDTO {
  entries: PublicLedgerEntryDTO[];
  total: number;
  limit: number;
  offset: number;
  totals: { awarded: number; reversed: number };
  /**
   * `live` when the page is showing locally authored awards; `imported` when
   * there is no live history yet and the sealed printed edition stands in.
   */
  source: "live" | "imported";
}

export type AnomalySeverity = "watch" | "review" | "severe";
export type AnomalyStatus = "open" | "cleared" | "reversed";

export interface AnomalyDTO {
  id: string;
  leagueId: string;
  profile: PublicProfileDTO | null;
  ledgerId: string | null;
  category: string;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  detail: string;
  delta: number | null;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string;
}
