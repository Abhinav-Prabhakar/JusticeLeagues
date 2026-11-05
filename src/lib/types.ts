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

export type ProfileRole = "member" | "admin";
export type AgeBand = "adult" | "teen";

export interface ProfileDTO {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  bio: string;
  homeNeighborhood: string | null;
  causes: Cause[];
  role: ProfileRole;
  ageBand: AgeBand;
  /** Set while a moderation restriction is in force. */
  restrictedUntil: string | null;
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
  /** Unread inbox count, so the masthead bell is accurate on first paint. */
  unread: number;
}

export interface EditionDTO {
  leagues: LeagueDTO[];
  shifts: ShiftDTO[];
  wins: WinDTO[];
  resources: ResourceDTO[];
  me: MeDTO | null;
  /** Feature flags the editor controls from the admin console. */
  flags: Record<string, boolean>;
}

export interface PublicProfileDTO {
  id: string;
  handle: string;
  displayName: string;
  /** True when the neighbour is under 18 and their handle stays private. */
  minor?: boolean;
}

export type NotificationKind =
  | "welcome"
  | "join"
  | "shift"
  | "reminder"
  | "waitlist"
  | "promotion"
  | "project"
  | "ledger"
  | "moderation"
  | "strike"
  | "role"
  | "invite";

export interface NotificationDTO {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  leagueId: string | null;
  refType: string;
  refId: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationInboxDTO {
  items: NotificationDTO[];
  unread: number;
  total: number;
}

export type ReportTarget = "project" | "resource" | "shift" | "league" | "member";
export type ReportReason = "spam" | "harassment" | "safety" | "misinformation" | "other";
export type ReportStatus = "open" | "actioned" | "dismissed";

export interface ReportDTO {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  targetTitle: string;
  targetAuthor: PublicProfileDTO | null;
  leagueId: string | null;
  leagueName: string | null;
  reason: ReportReason;
  detail: string;
  status: ReportStatus;
  reporter: PublicProfileDTO | null;
  handledAt: string | null;
  resolutionNote: string;
  createdAt: string;
}

export interface StrikeDTO {
  id: string;
  profile: PublicProfileDTO;
  leagueId: string | null;
  leagueName: string | null;
  reason: string;
  createdAt: string;
}

export interface AdminOverviewDTO {
  people: number;
  leagues: number;
  openReports: number;
  strikes: number;
  restricted: number;
  ledgerRows: number;
  points: number;
}

export interface AdminUserDTO {
  profile: PublicProfileDTO;
  /** Null for a young neighbour: contact details stay with their steward. */
  email: string | null;
  contactHidden: boolean;
  role: ProfileRole;
  ageBand: AgeBand;
  leagues: number;
  points: number;
  strikes: number;
  restrictedUntil: string | null;
  createdAt: string;
}

export interface FeatureFlagDTO {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  updatedAt: string;
}

export interface AuditLogEntryDTO {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  leagueId: string | null;
  leagueName: string | null;
  actor: PublicProfileDTO | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface DataExportDTO {
  exportedAt: string;
  profile: ProfileDTO;
  memberships: MembershipDTO[];
  signups: SignupDTO[];
  ledger: LedgerEntryDTO[];
  badges: BadgeDTO[];
  notifications: NotificationDTO[];
  strikes: StrikeDTO[];
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

// ---- Phase 6: observability, the pilot funnel, and operations ------------

export type PulseEventName =
  | "home_view"
  | "atlas_view"
  | "league_view"
  | "chapter_view"
  | "ledger_view"
  | "register_view"
  | "auth_register"
  | "league_join"
  | "shift_signup"
  | "shift_checkin"
  | "project_submit"
  | "project_approve"
  | "resource_post"
  | "resource_claim"
  | "resource_fulfil"
  | "report_file";

export interface PulseStageDTO {
  key: string;
  label: string;
  count: number;
  /** Share of the previous stage, or null when that stage had no traffic. */
  conversion: number | null;
  /** Share of the first stage in the funnel. */
  fromStart: number | null;
}

export interface PulsePilotDTO {
  leagueId: string;
  leagueName: string;
  points: number;
  members: number;
  projects: number;
  shifts: number;
  signups: number;
  lastActivity: string | null;
}

export interface PulseMetricsDTO {
  windowDays: number;
  since: string;
  homeViews: number;
  funnel: PulseStageDTO[];
  liquidity: {
    openShifts: number;
    openFutureShifts: number;
    capacity: number;
    filled: number;
    openSpots: number;
    fillRate: number;
    shiftsWithSignup48h: number;
    within48hRate: number;
  };
  reliability: {
    attended: number;
    noShow: number;
    cancelled: number;
    showUpRate: number;
  };
  retention: {
    activeMembers: number;
    active4w: number;
    rate: number;
  };
  integrity: {
    points: number;
    activeMembers: number;
    pointsPerMember: number;
    ledgerRows: number;
    reversals: number;
    reversalRate: number;
    openAnomalies: number;
    reports: number;
    reportsPer100Members: number;
  };
  pilots: PulsePilotDTO[];
}

export interface OpsHealthDTO {
  databaseBytes: number;
  walBytes: number;
  migrations: number;
  backupCount: number;
  latestBackupAt: string | null;
  latestBackupBytes: number;
  backupAgeHours: number | null;
  uptimeSeconds: number;
  node: string;
  startedAt: string;
}

export interface ErrorReportDTO {
  id: string;
  profileId: string | null;
  message: string;
  stack: string;
  component: string;
  path: string;
  requestId: string;
  resolvedAt: string | null;
  createdAt: string;
}

export type PilotNoteKind = "note" | "friction" | "win";

export interface PilotNoteDTO {
  id: string;
  leagueId: string | null;
  leagueName: string | null;
  authorName: string | null;
  kind: PilotNoteKind;
  body: string;
  week: string;
  createdAt: string;
}

export interface PulseDTO extends PulseMetricsDTO {
  health: OpsHealthDTO;
  errors: ErrorReportDTO[];
  notes: PilotNoteDTO[];
}
