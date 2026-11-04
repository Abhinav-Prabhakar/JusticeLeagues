import { useState } from "react";
import { MapPin, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { CAUSES, fmt } from "../../data";
import { activeMembership } from "../../lib/api";
import { useLeagueDetail, useRemoveMember } from "../../lib/queries";
import { JoinButton } from "../../components/JoinButton";
import { SectionHead } from "../../ui";
import { cn } from "../../utils/cn";
import { useLeagueContext } from "./context";
import { initials } from "./constants";

const ROLE_STYLE = {
  owner: "bg-vermilion text-paper",
  steward: "bg-mustard text-ink",
  member: "bg-paper-3 text-ink-2",
} as const;

export default function LeagueMembers() {
  const { league: l, edition } = useLeagueContext();
  const membership = activeMembership(edition.me, l.id);
  const isSteward = membership?.role === "owner" || membership?.role === "steward";
  const removeMember = useRemoveMember();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const myProfileId = edition.me?.profile.id;
  const c = CAUSES[l.cause];
  const color = c.color === "#14110d" ? "#4a4338" : c.color;
  const { data: detail, isPending, isError } = useLeagueDetail(l.id);
  const members = detail?.members ?? [];

  return (
    <div className="space-y-6">
      <SectionHead
        kicker="The roster"
        title={
          <>
            People in the <em>league</em>
          </>
        }
        right={
          <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
            <Users size={13} /> {isPending ? "…" : fmt(members.length)} on the active roster
          </span>
        }
      />

      <p className="text-ink-2 max-w-2xl font-serif text-sm">
        Roster entries show display names, handles, and the chapter each member calls home. Email addresses never leave
        the database.
      </p>

      {isPending ? (
        <div className="divide-ink/20 border-ink divide-y-2 border-y-2" aria-label="Loading roster">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-4">
              <div className="bg-paper-3 h-10 w-10 animate-pulse rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="bg-paper-3 h-3 w-40 animate-pulse rounded" />
                <div className="bg-paper-3 h-2.5 w-24 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="border-vermilion bg-paper border-l-4 px-4 py-3 font-serif text-sm">
          The roster could not be loaded. The API may still be starting.
        </div>
      ) : members.length === 0 ? (
        <div className="border-ink/40 grid place-items-center gap-3 border-2 border-dashed px-6 py-12 text-center">
          <span
            className="text-paper grid h-12 w-12 place-items-center rounded-full"
            style={{ background: color }}
            aria-hidden
          >
            <UserRound size={22} />
          </span>
          <p className="font-display text-ink-3 text-xl italic">No one has signed this charter yet.</p>
          <p className="text-ink-2 max-w-md font-serif text-sm">
            You would be the founding member of the {l.hood} chapter. Joining awards 25 Justice Points once.
          </p>
          <JoinButton id={l.id} />
        </div>
      ) : (
        <ol className="divide-ink/20 border-ink divide-y-2 border-y-2">
          {members.map((member) => {
            const chapter = l.chapters.find((item) => item.id === member.chapterId);
            const canRemove =
              isSteward &&
              member.profile.id !== myProfileId &&
              member.role !== "owner" &&
              (membership?.role === "owner" || member.role === "member");
            return (
              <li key={member.profile.id} className="flex flex-wrap items-center gap-3 py-3">
                <span
                  className="text-paper font-display grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black"
                  style={{ background: color }}
                  aria-hidden
                >
                  {initials(member.profile.displayName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-lg leading-tight font-bold">{member.profile.displayName}</div>
                  <div className="text-ink-3 font-mono text-[10px]">@{member.profile.handle}</div>
                </div>
                <span className="text-ink-2 flex items-center gap-1 font-mono text-[10px]">
                  <MapPin size={10} /> {chapter?.hood ?? "Citywide"}
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[8px] font-extrabold tracking-wider uppercase",
                    ROLE_STYLE[member.role],
                  )}
                >
                  {member.role === "member" ? <UserRound size={9} /> : <ShieldCheck size={9} />}
                  {member.role}
                </span>
                <span className="text-ink-3 font-mono text-[9px]">
                  since {new Date(member.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirmId !== member.profile.id) {
                        setConfirmId(member.profile.id);
                        return;
                      }
                      removeMember.mutate(
                        { leagueId: l.id, profileId: member.profile.id },
                        { onSuccess: () => setConfirmId(null) },
                      );
                    }}
                    disabled={removeMember.isPending}
                    aria-label={`Remove ${member.profile.displayName} from the roster`}
                    className={cn(
                      "btn-press rounded-full border-2 px-2 py-0.5 font-sans text-[8px] font-extrabold tracking-wider uppercase disabled:opacity-40",
                      confirmId === member.profile.id
                        ? "border-vermilion bg-vermilion text-paper"
                        : "border-ink/25 text-ink-3 hover:border-vermilion hover:text-vermilion",
                    )}
                  >
                    <X size={9} className="mr-0.5 inline" />
                    {confirmId === member.profile.id ? "Confirm" : "Remove"}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
