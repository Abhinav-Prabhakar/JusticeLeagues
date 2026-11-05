import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminOverviewDTO,
  AdminUserDTO,
  AnomalyDTO,
  AuditLogEntryDTO,
  CreatedInviteDTO,
  DataExportDTO,
  FeatureFlagDTO,
  NotificationInboxDTO,
  PilotNoteDTO,
  PilotNoteKind,
  PulseDTO,
  ReportDTO,
  ReportReason,
  ReportStatus,
  ReportTarget,
  EditionDTO,
  ImpactDTO,
  InvitePreviewDTO,
  InviteRole,
  LeagueDTO,
  LeagueMemberDTO,
  MeDTO,
  ProjectDTO,
  PublicLedgerDTO,
  ResourceDTO,
  ResourceKind,
  SearchDTO,
  ShiftDTO,
  ShiftRosterDTO,
  StandingsDTO,
  StandingsScope,
} from "./types";
import type { Cause } from "../data/fixtures";
import {
  api,
  initialEdition,
  STATIC_PREVIEW,
  staticImpact,
  staticLeagueDetail,
  staticPublicLedger,
  staticSearch,
  staticStandings,
} from "./api";
import { useApp } from "../ctx";

const KEY = ["edition"] as const;

function patchEdition(
  client: ReturnType<typeof useQueryClient>,
  patch: (edition: EditionDTO) => EditionDTO,
): EditionDTO | undefined {
  const previous = client.getQueryData<EditionDTO>(KEY);
  if (previous) client.setQueryData<EditionDTO>(KEY, patch(previous));
  return previous;
}

export function useEdition() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<EditionDTO>("/api/edition"),
    initialData: initialEdition,
    // The static Pages edition has no API; the fixtures are the edition.
    enabled: !STATIC_PREVIEW,
    // The fixture shell is only a placeholder. Mark it stale so a full page
    // load always re-reads the session instead of showing "signed out" for
    // the lifetime of staleTime.
    initialDataUpdatedAt: 0,
    staleTime: 20_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useCurrentUser(): MeDTO | null {
  return useEdition().data?.me ?? null;
}

export interface LeagueDetail {
  league: LeagueDTO;
  members: LeagueMemberDTO[];
}

export function useLeagueDetail(leagueId: string) {
  return useQuery({
    queryKey: ["league", leagueId],
    queryFn: () => api<LeagueDetail>(`/api/leagues/${leagueId}`),
    initialData: STATIC_PREVIEW ? () => staticLeagueDetail(leagueId) : undefined,
    enabled: !STATIC_PREVIEW && Boolean(leagueId),
    staleTime: 20_000,
    retry: 1,
  });
}

export function useShiftRoster(shiftId: string | null) {
  return useQuery({
    queryKey: ["roster", shiftId],
    queryFn: () => api<ShiftRosterDTO>(`/api/shifts/${shiftId}/roster`),
    enabled: Boolean(shiftId),
    staleTime: 5_000,
    retry: 1,
  });
}

function invalidateEdition(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: KEY });
  void client.invalidateQueries({ queryKey: ["league"] });
}

export function useJoinLeague() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: (league: LeagueDTO) =>
      api<{ joined: boolean; awarded: boolean }>(`/api/leagues/${league.id}/join`, { method: "POST" }),
    onMutate: (league) => {
      const previous = patchEdition(client, (edition) => {
        if (!edition.me) return edition;
        return {
          ...edition,
          leagues: edition.leagues.map((item) =>
            item.id === league.id ? { ...item, members: item.members + 1, points: item.points + 25 } : item,
          ),
          me: {
            ...edition.me,
            points: edition.me.points + 25,
            memberships: [
              ...edition.me.memberships,
              {
                leagueId: league.id,
                chapterId: league.chapters[0]?.id ?? null,
                role: "member" as const,
                status: "active" as const,
                joinedAt: new Date().toISOString(),
                points: 25,
              },
            ],
          },
        };
      });
      return { previous };
    },
    onError: (error, _league, context) => {
      if (context?.previous) client.setQueryData(KEY, context.previous);
      toast(error.message);
    },
    onSuccess: (result, league) => {
      toast(
        result.awarded ? `Welcome to ${league.name}` : `Back on the roster at ${league.name}`,
        result.awarded ? 25 : undefined,
      );
    },
    onSettled: () => invalidateEdition(client),
  });
}

export function useLeaveLeague() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: (league: LeagueDTO) => api<{ joined: boolean }>(`/api/leagues/${league.id}/join`, { method: "DELETE" }),
    onMutate: (league) => {
      const previous = patchEdition(client, (edition) => {
        if (!edition.me) return edition;
        return {
          ...edition,
          leagues: edition.leagues.map((item) =>
            item.id === league.id ? { ...item, members: Math.max(0, item.members - 1) } : item,
          ),
          me: {
            ...edition.me,
            memberships: edition.me.memberships.map((membership) =>
              membership.leagueId === league.id ? { ...membership, status: "left" as const } : membership,
            ),
          },
        };
      });
      return { previous };
    },
    onError: (error, _league, context) => {
      if (context?.previous) client.setQueryData(KEY, context.previous);
      toast(error.message);
    },
    onSuccess: (_result, league) => toast(`You left ${league.name}`),
    onSettled: () => invalidateEdition(client),
  });
}

export function useSignupShift() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: (shift: ShiftDTO) =>
      api<{
        status: "signed_up" | "waitlisted" | "already";
        filled: number;
        autoJoined: boolean;
        position: number | null;
      }>(`/api/shifts/${shift.id}/signup`, { method: "POST" }),
    onMutate: (shift) => {
      const nextStatus = shift.filled >= shift.spots ? ("waitlist" as const) : ("reserved" as const);
      const previous = patchEdition(client, (edition) => {
        if (!edition.me) return edition;
        return {
          ...edition,
          shifts: edition.shifts.map((item) =>
            item.id === shift.id
              ? nextStatus === "waitlist"
                ? { ...item, waitlist: item.waitlist + 1, waitlistPosition: item.waitlist + 1 }
                : { ...item, filled: Math.min(item.spots, item.filled + 1) }
              : item,
          ),
          me: {
            ...edition.me,
            signups: [
              ...edition.me.signups,
              { shiftId: shift.id, status: nextStatus, createdAt: new Date().toISOString() },
            ],
          },
        };
      });
      return { previous };
    },
    onError: (error, _shift, context) => {
      if (context?.previous) client.setQueryData(KEY, context.previous);
      toast(error.message);
    },
    onSuccess: (result, shift) => {
      if (result.status === "waitlisted") {
        toast(`Waitlisted${result.position ? ` at #${result.position}` : ""} for ${shift.title}`);
      } else if (result.status === "already") {
        toast(`You're already on ${shift.title}`);
      } else {
        toast(result.autoJoined ? `Joined the league and claimed ${shift.title}` : `You're on: ${shift.title}`);
      }
    },
    onSettled: () => invalidateEdition(client),
  });
}

export function useCancelShift() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: (shift: ShiftDTO) => api(`/api/shifts/${shift.id}/signup`, { method: "DELETE" }),
    onMutate: (shift) => {
      const waitlisted =
        client.getQueryData<EditionDTO>(KEY)?.me?.signups.find((signup) => signup.shiftId === shift.id)?.status ===
        ("waitlist" as const);
      const previous = patchEdition(client, (edition) => {
        if (!edition.me) return edition;
        return {
          ...edition,
          shifts: edition.shifts.map((item) =>
            item.id === shift.id
              ? waitlisted
                ? { ...item, waitlist: Math.max(0, item.waitlist - 1), waitlistPosition: null }
                : { ...item, filled: Math.max(0, item.filled - 1) }
              : item,
          ),
          me: {
            ...edition.me,
            signups: edition.me.signups.filter((signup) => signup.shiftId !== shift.id),
          },
        };
      });
      return { previous };
    },
    onError: (error, _shift, context) => {
      if (context?.previous) client.setQueryData(KEY, context.previous);
      toast(error.message);
    },
    onSuccess: () => toast("Shift cancelled"),
    onSettled: () => invalidateEdition(client),
  });
}

interface CheckInInput {
  shiftId: string;
  profileId: string;
  status: "attended" | "no_show";
}

export function useCheckIn() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: ({ shiftId, profileId, status }: CheckInInput) =>
      api<{ awarded: number; roster: ShiftRosterDTO }>(`/api/shifts/${shiftId}/check-in`, {
        method: "POST",
        body: JSON.stringify({ profileId, status }),
      }),
    onSuccess: (result, input) => {
      client.setQueryData(["roster", input.shiftId], result.roster);
      invalidateEdition(client);
      if (result.awarded > 0) toast("Attendance recorded", result.awarded);
      else toast(input.status === "no_show" ? "Marked as a no-show" : "Attendance recorded");
    },
    onError: (error) => toast(error.message),
  });
}

interface NewShiftInput {
  leagueId: string;
  chapterId: string;
  title: string;
  day: number;
  time: string;
  duration: string;
  capacity: number;
  place: string;
}

export function useCreateShift() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: ({ leagueId, ...body }: NewShiftInput) =>
      api<ShiftDTO>(`/api/leagues/${leagueId}/shifts`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (shift) => {
      invalidateEdition(client);
      toast(`Posted ${shift.title}`);
    },
    onError: (error) => toast(error.message),
  });
}

export function useCancelShiftAsSteward() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: (shiftId: string) => api<{ cancelled: boolean }>(`/api/shifts/${shiftId}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateEdition(client);
      void client.invalidateQueries({ queryKey: ["roster"] });
      toast("Shift cancelled");
    },
    onError: (error) => toast(error.message),
  });
}

export interface NewProjectInput {
  leagueId: string;
  chapterId: string;
  title: string;
  summary: string;
  occurredOn: string;
  people: number;
  hours: number;
  amount?: string;
  evidenceUrl?: string;
}

export function useLeagueProjects(leagueId: string, enabled = true) {
  return useQuery({
    queryKey: ["projects", leagueId],
    queryFn: () => api<{ projects: ProjectDTO[] }>(`/api/leagues/${leagueId}/projects`),
    enabled: enabled && !STATIC_PREVIEW,
    staleTime: 10_000,
    retry: 1,
  });
}

export function useSubmitProject() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: ({ leagueId, ...body }: NewProjectInput) =>
      api<ProjectDTO>(`/api/leagues/${leagueId}/projects`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (project) => {
      invalidateEdition(client);
      void client.invalidateQueries({ queryKey: ["projects", project.league] });
      toast("Project filed for steward review");
    },
    onError: (error) => toast(error.message),
  });
}

export function useReviewProject() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: ({ projectId, decision }: { projectId: string; decision: "approve" | "reject" }) =>
      api<ProjectDTO>(`/api/projects/${projectId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      }),
    onSuccess: (project) => {
      invalidateEdition(client);
      void client.invalidateQueries({ queryKey: ["projects", project.league] });
      if (project.status === "approved") toast("Project approved", project.points);
      else toast("Project rejected — no points awarded");
    },
    onError: (error) => toast(error.message),
  });
}

export interface NewResourceInput {
  leagueId: string;
  chapterId: string;
  kind: ResourceKind;
  title: string;
  description?: string;
  quantity?: string;
  neededBy?: string;
}

export function useCreateResource() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: ({ leagueId, ...body }: NewResourceInput) =>
      api<ResourceDTO>(`/api/leagues/${leagueId}/resources`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidateEdition(client);
      toast("Posted to the exchange");
    },
    onError: (error) => toast(error.message),
  });
}

function useResourceAction(action: "claim" | "release" | "fulfil" | "expire", message: string) {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: (resourceId: string) => api<ResourceDTO>(`/api/resources/${resourceId}/${action}`, { method: "POST" }),
    onSuccess: () => {
      invalidateEdition(client);
      toast(message);
    },
    onError: (error) => toast(error.message),
  });
}

export function useClaimResource() {
  return useResourceAction("claim", "Claimed — the poster can see your name");
}

export function useReleaseResource() {
  return useResourceAction("release", "Claim released");
}

export function useFulfilResource() {
  return useResourceAction("fulfil", "Classified marked fulfilled");
}

export function useExpireResource() {
  return useResourceAction("expire", "Classified expired");
}

interface AuthPayload {
  displayName?: string;
  email: string;
  password: string;
  homeNeighborhood?: string;
  causes?: string[];
  ageConfirmed?: boolean;
  ageBand?: "adult" | "teen";
  guardianConsent?: boolean;
}

export function useAuth() {
  const client = useQueryClient();
  const { toast } = useApp();

  const apply = (me: MeDTO) => {
    const previous = client.getQueryData<EditionDTO>(KEY);
    if (previous) client.setQueryData<EditionDTO>(KEY, { ...previous, me });
    return previous;
  };

  const register = useMutation({
    mutationFn: (payload: AuthPayload) =>
      api<{ me: MeDTO }>("/api/auth/register", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: ({ me }) => {
      apply(me);
      toast(`Welcome to the Leagues, ${me.profile.displayName}`);
    },
  });

  const login = useMutation({
    mutationFn: (payload: AuthPayload) =>
      api<{ me: MeDTO }>("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: ({ me }) => apply(me),
  });

  const logout = useMutation({
    mutationFn: () => api<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      const previous = client.getQueryData<EditionDTO>(KEY);
      if (previous) client.setQueryData<EditionDTO>(KEY, { ...previous, me: null });
    },
    onSettled: () => invalidateEdition(client),
  });

  return { register, login, logout };
}

export function useInvitePreview(token: string | null) {
  return useQuery({
    queryKey: ["invite", token],
    queryFn: () => api<InvitePreviewDTO>(`/api/invites/${token}`),
    enabled: Boolean(token) && !STATIC_PREVIEW,
    retry: false,
  });
}

export interface CreateInviteInput {
  leagueId: string;
  role: InviteRole;
  chapterId?: string;
  note?: string;
  days?: number;
}

export function useCreateInvite() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: ({ leagueId, ...body }: CreateInviteInput) =>
      api<CreatedInviteDTO>(`/api/leagues/${leagueId}/invites`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["edition"] });
      toast("Invitation minted — copy the link now");
    },
    onError: (error) => toast(error.message),
  });
}

export function useRedeemInvite() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: (token: string) =>
      api<{ leagueId: string; role: "owner" | "steward" | "member"; awarded: boolean }>(
        `/api/invites/${token}/redeem`,
        { method: "POST" },
      ),
    onSuccess: (result) => {
      invalidateEdition(client);
      void client.invalidateQueries({ queryKey: ["invite"] });
      toast(result.awarded ? "You're in — charter signed" : "You're in", result.awarded ? 25 : undefined);
    },
    onError: (error) => toast(error.message),
  });
}

export interface UpdateShiftInput {
  shiftId: string;
  chapterId: string;
  title: string;
  day: number;
  time: string;
  duration: string;
  capacity: number;
  place: string;
  bring?: string[];
}

export function useUpdateShift() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: ({ shiftId, ...body }: UpdateShiftInput) =>
      api<ShiftDTO>(`/api/shifts/${shiftId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (shift) => {
      invalidateEdition(client);
      void client.invalidateQueries({ queryKey: ["roster", shift.id] });
      toast("Shift updated");
    },
    onError: (error) => toast(error.message),
  });
}

export function useRemoveMember() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: ({ leagueId, profileId }: { leagueId: string; profileId: string }) =>
      api(`/api/leagues/${leagueId}/members/${profileId}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateEdition(client);
      toast("Member removed from the roster");
    },
    onError: (error) => toast(error.message),
  });
}

export interface LeagueSettingsInput {
  leagueId: string;
  name: string;
  motto: string;
  cause: string;
  recruiting: boolean;
  archived?: boolean;
}

export function useUpdateLeagueSettings() {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: ({ leagueId, ...body }: LeagueSettingsInput) =>
      api<{ updated: true; archived: boolean }>(`/api/leagues/${leagueId}/settings`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (result) => {
      invalidateEdition(client);
      toast(result.archived ? "League archived" : "League settings saved");
    },
    onError: (error) => toast(error.message),
  });
}

export interface StandingsInput {
  scope: StandingsScope;
  cause?: Cause | "all";
  leagueId?: string | null;
  limit?: number;
  offset?: number;
}

export function useStandings({ scope, cause = "all", leagueId, limit = 50, offset = 0 }: StandingsInput) {
  const query = new URLSearchParams({ scope, cause, limit: String(limit), offset: String(offset) });
  if (leagueId) query.set("league", leagueId);

  return useQuery({
    queryKey: ["standings", scope, cause, leagueId ?? null, limit, offset],
    queryFn: () => api<StandingsDTO>(`/api/standings?${query.toString()}`),
    initialData: STATIC_PREVIEW ? () => staticStandings({ scope, cause, limit }) : undefined,
    enabled: !STATIC_PREVIEW,
    staleTime: 15_000,
    retry: 1,
  });
}

export function useImpact(leagueId: string | null = null) {
  return useQuery({
    queryKey: ["impact", leagueId ?? "city"],
    queryFn: () => api<ImpactDTO>(leagueId ? `/api/leagues/${leagueId}/impact` : "/api/impact"),
    initialData: STATIC_PREVIEW ? () => staticImpact(leagueId) : undefined,
    enabled: !STATIC_PREVIEW,
    staleTime: 15_000,
    retry: 1,
  });
}

export interface SearchInput {
  q?: string;
  cause?: Cause | "all";
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number | null;
  limit?: number;
}

/** Server-driven Atlas search; the printed edition uses the same rules offline. */
export function useSearch({ q = "", cause = "all", lat = null, lng = null, radiusKm = null, limit = 20 }: SearchInput = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (q.trim()) params.set("q", q.trim());
  if (cause !== "all") params.set("cause", cause);
  if (lat !== null && lng !== null) {
    params.set("lat", String(lat));
    params.set("lng", String(lng));
  }
  if (radiusKm !== null) params.set("radiusKm", String(radiusKm));

  return useQuery({
    queryKey: ["search", q.trim(), cause, lat, lng, radiusKm, limit],
    queryFn: () => api<SearchDTO>(`/api/search?${params.toString()}`),
    initialData: STATIC_PREVIEW ? () => staticSearch({ q, cause, lat, lng, radiusKm, limit }) : undefined,
    enabled: !STATIC_PREVIEW,
    staleTime: 10_000,
    retry: 1,
  });
}

export interface PublicLedgerInput {
  leagueId?: string | null;
  refType?: string | null;
  limit?: number;
  offset?: number;
  liveOnly?: boolean;
}

export function usePublicLedger({ leagueId, refType, limit = 25, offset = 0, liveOnly = false }: PublicLedgerInput = {}) {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (leagueId) query.set("league", leagueId);
  if (refType) query.set("type", refType);
  if (liveOnly) query.set("live", "1");

  return useQuery({
    queryKey: ["ledger", leagueId ?? "all", refType ?? "all", limit, offset, liveOnly],
    queryFn: () => api<PublicLedgerDTO>(`/api/ledger?${query.toString()}`),
    initialData: STATIC_PREVIEW
      ? () =>
          liveOnly
            ? {
                entries: [],
                total: 0,
                limit,
                offset,
                totals: { awarded: 0, reversed: 0 },
                source: "live" as const,
              }
            : staticPublicLedger({ leagueId, limit, offset })
      : undefined,
    enabled: !STATIC_PREVIEW,
    staleTime: 15_000,
    retry: 1,
  });
}

export function useAnomalies(leagueId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["anomalies", leagueId],
    queryFn: () => api<{ anomalies: AnomalyDTO[] }>(`/api/leagues/${leagueId}/anomalies`),
    enabled: Boolean(leagueId) && enabled && !STATIC_PREVIEW,
    staleTime: 5_000,
    retry: 1,
  });
}

export function useResolveAnomaly(leagueId: string) {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: ({
      anomalyId,
      decision,
      note,
    }: {
      anomalyId: string;
      decision: "clear" | "reverse";
      note?: string;
    }) =>
      api<{ resolved: boolean; reversed: boolean }>(`/api/anomalies/${anomalyId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ decision, note }),
      }),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["anomalies", leagueId] });
      invalidateEdition(client);
      toast(result.reversed ? "Entry reversed — a correction was posted" : "Review item cleared");
    },
    onError: (error) => toast(error.message),
  });
}

export function useReverseLedgerEntry(leagueId: string) {
  const client = useQueryClient();
  const { toast } = useApp();

  return useMutation({
    mutationFn: ({ entryId, note }: { entryId: string; note?: string }) =>
      api<{ reversed: boolean; delta: number }>(`/api/leagues/${leagueId}/ledger/${entryId}/reverse`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
    onSuccess: (result) => {
      invalidateEdition(client);
      void client.invalidateQueries({ queryKey: ["ledger"] });
      void client.invalidateQueries({ queryKey: ["anomalies", leagueId] });
      toast("Correction posted", result.delta);
    },
    onError: (error) => toast(error.message),
  });
}


// ---- Phase 5: the inbox, moderation, and the editor's desk ---------------

export function useInbox(enabled = true) {
  return useQuery({
    queryKey: ["inbox"],
    queryFn: () => api<NotificationInboxDTO>("/api/notifications"),
    enabled: enabled && !STATIC_PREVIEW,
    staleTime: 10_000,
    retry: 1,
  });
}

export function useMarkNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) =>
      api<{ updated: number; unread: number }>("/api/notifications/read", {
        method: "POST",
        body: JSON.stringify(ids && ids.length > 0 ? { ids } : {}),
      }),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["inbox"] });
      patchEdition(client, (edition) =>
        edition.me ? { ...edition, me: { ...edition.me, unread: result.unread } } : edition,
      );
    },
    onError: (error) => void error,
  });
}

export interface ReportInput {
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  detail?: string;
}

export function useReportContent() {
  const client = useQueryClient();
  const { toast } = useApp();
  return useMutation({
    mutationFn: (input: ReportInput) =>
      api<ReportDTO>("/api/reports", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "reports"] });
      toast("Report filed — the editor has it");
    },
    onError: (error) => toast(error.message),
  });
}

export function useStewardHide(leagueId: string) {
  const client = useQueryClient();
  const { toast } = useApp();
  return useMutation({
    mutationFn: ({
      targetType,
      targetId,
      note,
    }: {
      targetType: ReportTarget;
      targetId: string;
      note?: string;
    }) =>
      api<{ hidden: true }>(
        `/api/moderation/hide?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`,
        { method: "POST", body: JSON.stringify({ note }) },
      ),
    onSuccess: () => {
      invalidateEdition(client);
      void client.invalidateQueries({ queryKey: ["projects", leagueId] });
      toast("Hidden from the edition. The record stays on file.");
    },
    onError: (error) => toast(error.message),
  });
}

export function useAdminOverview(enabled = true) {
  return useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api<AdminOverviewDTO>("/api/admin/overview"),
    enabled: enabled && !STATIC_PREVIEW,
    staleTime: 15_000,
    retry: 1,
  });
}

export function useAdminReports(status: ReportStatus | "all" = "open", enabled = true) {
  return useQuery({
    queryKey: ["admin", "reports", status],
    queryFn: () => api<{ reports: ReportDTO[] }>(`/api/admin/reports?status=${status}`),
    enabled: enabled && !STATIC_PREVIEW,
    staleTime: 10_000,
    retry: 1,
  });
}

export function useHandleReport() {
  const client = useQueryClient();
  const { toast } = useApp();
  return useMutation({
    mutationFn: ({
      reportId,
      decision,
      note,
    }: {
      reportId: string;
      decision: "dismiss" | "hide" | "strike";
      note?: string;
    }) =>
      api<{ restrictedUntil: string | null }>(`/api/admin/reports/${reportId}`, {
        method: "POST",
        body: JSON.stringify({ decision, note }),
      }),
    onSuccess: (result, input) => {
      void client.invalidateQueries({ queryKey: ["admin"] });
      invalidateEdition(client);
      toast(
        input.decision === "dismiss"
          ? "Report dismissed"
          : result.restrictedUntil
            ? "Strike recorded — posting paused for a fortnight"
            : input.decision === "strike"
              ? "Strike recorded"
              : "Item hidden from the edition",
      );
    },
    onError: (error) => toast(error.message),
  });
}

export function useAdminUsers(q = "", enabled = true) {
  return useQuery({
    queryKey: ["admin", "users", q],
    queryFn: () => api<{ users: AdminUserDTO[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`),
    enabled: enabled && !STATIC_PREVIEW,
    staleTime: 10_000,
    retry: 1,
  });
}

export function useSetUserRole() {
  const client = useQueryClient();
  const { toast } = useApp();
  return useMutation({
    mutationFn: ({ profileId, role }: { profileId: string; role: "member" | "admin" }) =>
      api<{ role: string }>(`/api/admin/users/${profileId}/role`, {
        method: "POST",
        body: JSON.stringify({ role }),
      }),
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: ["admin"] });
      toast(input.role === "admin" ? "Editor access granted" : "Editor access removed");
    },
    onError: (error) => toast(error.message),
  });
}

export function useRestrictUser() {
  const client = useQueryClient();
  const { toast } = useApp();
  return useMutation({
    mutationFn: ({ profileId, days, reason }: { profileId: string; days: number; reason?: string }) =>
      api<{ restrictedUntil: string }>(`/api/admin/users/${profileId}/restrict`, {
        method: "POST",
        body: JSON.stringify({ days, reason }),
      }),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["admin"] });
      toast(`Posting paused until ${result.restrictedUntil.slice(0, 10)}`);
    },
    onError: (error) => toast(error.message),
  });
}

export function useRestoreUser() {
  const client = useQueryClient();
  const { toast } = useApp();
  return useMutation({
    mutationFn: (profileId: string) =>
      api<{ restored: true }>(`/api/admin/users/${profileId}/restore`, { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin"] });
      toast("Posting restored");
    },
    onError: (error) => toast(error.message),
  });
}

export function useFeatureFlags(enabled = true) {
  return useQuery({
    queryKey: ["admin", "flags"],
    queryFn: () => api<{ flags: FeatureFlagDTO[] }>("/api/admin/flags"),
    enabled: enabled && !STATIC_PREVIEW,
    staleTime: 15_000,
    retry: 1,
  });
}

export function useSetFeatureFlag() {
  const client = useQueryClient();
  const { toast } = useApp();
  return useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      api<FeatureFlagDTO>(`/api/admin/flags/${key}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
    onSuccess: (flag) => {
      void client.invalidateQueries({ queryKey: ["admin", "flags"] });
      invalidateEdition(client);
      toast(`${flag.label} ${flag.enabled ? "on" : "off"}`);
    },
    onError: (error) => toast(error.message),
  });
}

export function useAuditLog(enabled = true) {
  return useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => api<{ entries: AuditLogEntryDTO[] }>("/api/admin/audit?limit=150"),
    enabled: enabled && !STATIC_PREVIEW,
    staleTime: 15_000,
    retry: 1,
  });
}

export function useExportAccount() {
  const { toast } = useApp();
  return useMutation({
    mutationFn: () => api<DataExportDTO>("/api/me/export"),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "justice-leagues-export.json";
      anchor.click();
      URL.revokeObjectURL(url);
      toast("Your data file is downloading");
    },
    onError: (error) => toast(error.message),
  });
}

export function useDeleteAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ deleted: true }>("/api/me", { method: "DELETE", body: JSON.stringify({ confirm: "delete my account" }) }),
    onSuccess: () => {
      patchEdition(client, (edition) => ({ ...edition, me: null }));
      void client.invalidateQueries();
    },
  });
}

// ---- Phase 6: the pulse, pilot notes, and the crash desk -----------------

export function useAdminPulse(days = 28, enabled = true) {
  return useQuery({
    queryKey: ["admin", "pulse", days],
    queryFn: () => api<PulseDTO>(`/api/admin/pulse?days=${days}`),
    enabled: enabled && !STATIC_PREVIEW,
    staleTime: 15_000,
    retry: 1,
  });
}

export interface PilotNoteInput {
  body: string;
  kind?: PilotNoteKind;
  leagueId?: string | null;
}

export function useAddPilotNote() {
  const client = useQueryClient();
  const { toast } = useApp();
  return useMutation({
    mutationFn: (input: PilotNoteInput) =>
      api<PilotNoteDTO>("/api/admin/pulse/notes", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "pulse"] });
      toast("Pilot note filed for the weekly loop");
    },
    onError: (error) => toast(error.message),
  });
}

export function useResolveError() {
  const client = useQueryClient();
  const { toast } = useApp();
  return useMutation({
    mutationFn: (id: string) => api<{ resolved: true }>(`/api/admin/errors/${id}/resolve`, { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "pulse"] });
      toast("Crash report closed");
    },
    onError: (error) => toast(error.message),
  });
}
