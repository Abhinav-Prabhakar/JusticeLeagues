import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EditionDTO, LeagueDTO, LeagueMemberDTO, MeDTO, ProjectDTO, ShiftDTO, ShiftRosterDTO } from "./types";
import { api, initialEdition, STATIC_PREVIEW, staticLeagueDetail } from "./api";
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
    enabled: !STATIC_PREVIEW,
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
      api<{ signedUp: boolean; filled: number; autoJoined: boolean }>(`/api/shifts/${shift.id}/signup`, {
        method: "POST",
      }),
    onMutate: (shift) => {
      const previous = patchEdition(client, (edition) => {
        if (!edition.me) return edition;
        return {
          ...edition,
          shifts: edition.shifts.map((item) =>
            item.id === shift.id ? { ...item, filled: Math.min(item.spots, item.filled + 1) } : item,
          ),
          me: {
            ...edition.me,
            signups: [
              ...edition.me.signups,
              { shiftId: shift.id, status: "reserved" as const, createdAt: new Date().toISOString() },
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
      toast(result.autoJoined ? `Joined the league and claimed ${shift.title}` : `You're on: ${shift.title}`);
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
      const previous = patchEdition(client, (edition) => {
        if (!edition.me) return edition;
        return {
          ...edition,
          shifts: edition.shifts.map((item) =>
            item.id === shift.id ? { ...item, filled: Math.max(0, item.filled - 1) } : item,
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

interface AuthPayload {
  displayName?: string;
  email: string;
  password: string;
  homeNeighborhood?: string;
  causes?: string[];
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
