import type { Bring, Cause } from "../data/fixtures";

export interface ChapterDTO {
  id: string;
  name: string;
  hood: string;
  points: number;
  status: "active" | "dormant";
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
  x: number;
  y: number;
  founded: number;
  recruiting: boolean;
  motto: string;
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

export interface MeDTO {
  profile: ProfileDTO;
  memberships: MembershipDTO[];
  signups: SignupDTO[];
  points: number;
  ledger: LedgerEntryDTO[];
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
