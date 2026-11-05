import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, CalendarClock, MapPin, ShieldCheck, UserRound, Users } from "lucide-react";
import { STATIC_PREVIEW, STATIC_PREVIEW_MESSAGE, handleLabel } from "../lib/api";
import { useEdition, useInvitePreview, useRedeemInvite } from "../lib/queries";
import { Emblem, Reveal } from "../ui";
import { usePageTitle } from "../lib/usePageTitle";
import { cn } from "../utils/cn";

const ROLE_STYLE = {
  member: "bg-paper-3 text-ink-2",
  steward: "bg-mustard text-ink",
} as const;

export default function JoinInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { data: edition } = useEdition();
  const me = edition.me;
  const preview = useInvitePreview(token ?? null);
  const redeem = useRedeemInvite();
  usePageTitle("An invitation — The Justice Leagues");

  const invite = preview.data;
  const next = `/join/${token ?? ""}`;

  if (STATIC_PREVIEW) {
    return (
      <div className="border-ink/40 mx-auto mt-10 max-w-2xl border-2 border-dashed px-6 py-14 text-center">
        <p className="font-display text-ink-3 text-2xl italic">Invitations live in the local edition.</p>
        <p className="text-ink-2 mx-auto mt-2 max-w-md font-serif text-sm">{STATIC_PREVIEW_MESSAGE}</p>
        <Link
          to="/"
          className="btn-press border-ink bg-ink text-paper mt-5 inline-flex rounded-full border-2 px-5 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase"
        >
          Back to the front page
        </Link>
      </div>
    );
  }

  if (preview.isPending) {
    return (
      <div role="status" className="mx-auto mt-10 max-w-2xl" aria-label="Loading invitation">
        <div className="bg-paper-3 h-3 w-32 animate-pulse rounded" />
        <div className="bg-paper-3 mt-4 h-12 w-3/4 animate-pulse rounded" />
        <div className="bg-paper-3 mt-6 h-40 w-full animate-pulse rounded" />
      </div>
    );
  }

  if (preview.isError || !invite) {
    return (
      <div className="mx-auto mt-10 max-w-2xl text-center">
        <p className="kicker text-vermilion">The invitation desk</p>
        <h1 className="font-display mt-2 text-4xl font-black">That link is not on file.</h1>
        <p className="text-ink-2 mx-auto mt-3 max-w-md font-serif">
          Invitations are single-use and expire. Ask the steward who sent it for a fresh link.
        </p>
        <Link
          to="/leagues"
          className="btn-press border-ink bg-ink text-paper mt-5 inline-flex rounded-full border-2 px-5 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase"
        >
          Browse the atlas
        </Link>
      </div>
    );
  }

  const closed = invite.status !== "open";
  const alreadyIn = me?.memberships.some(
    (membership) => membership.leagueId === invite.leagueId && membership.status === "active",
  );
  const expires = new Date(invite.expiresAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-3xl pt-8 pb-12 md:pt-12">
      <div className="kicker text-vermilion flex items-center gap-1.5">
        <Users size={13} /> An invitation to the league
      </div>

      <div className="mt-3 flex items-start gap-4">
        <Emblem cause={invite.leagueCause} size={54} />
        <div className="min-w-0">
          <h1 className="font-display text-[clamp(2.2rem,5vw,3.8rem)] leading-[0.96] font-black tracking-tight">
            {invite.leagueName}
          </h1>
          <div className="text-ink-2 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
            <span className="flex items-center gap-1">
              <MapPin size={11} /> {invite.chapterHood ?? invite.leagueHood}
            </span>
            <span className="flex items-center gap-1">
              <UserRound size={11} /> {invite.invitedBy ? `from ${handleLabel(invite.invitedBy)}` : "from the steward desk"}
            </span>
            <span className="text-ink-3">{closed ? "closed" : `expires ${expires}`}</span>
          </div>
        </div>
      </div>

      <div className="rule-thick-thin mt-5" />

      <Reveal className="mt-6">
        <div className="border-ink bg-paper-2 border-2 shadow-[6px_6px_0_#14110d]">
          <div className="border-ink flex flex-wrap items-center justify-between gap-2 border-b-2 px-5 py-3">
            <span className="kicker text-ink">The seat</span>
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 font-sans text-[9px] font-extrabold tracking-wider uppercase",
                ROLE_STYLE[invite.role],
              )}
            >
              {invite.role === "steward" ? <ShieldCheck size={10} /> : <UserRound size={10} />}
              {invite.role}
            </span>
          </div>

          <div className="space-y-4 px-5 py-5">
            <p className="font-serif text-lg leading-relaxed">
              {invite.role === "steward" ? (
                <>
                  You have been asked to keep the desk for <strong>{invite.leagueName}</strong>: post shifts, record
                  hours, and approve the projects that earn Justice Points.
                </>
              ) : (
                <>
                  You have been asked to sign the charter of <strong>{invite.leagueName}</strong> and take a seat with{" "}
                  {invite.chapterHood ?? invite.leagueHood}. Join a shift, borrow a ladder, file a project.
                </>
              )}
            </p>

            {invite.note && (
              <blockquote className="border-ink/40 text-ink-2 border-l-2 pl-3 font-serif text-sm italic">
                “{invite.note}”
              </blockquote>
            )}

            <ul className="text-ink-2 grid gap-2 font-serif text-sm sm:grid-cols-2">
              <li className="flex items-start gap-2">
                <span className="bg-forest text-paper mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full">
                  <ArrowRight size={10} strokeWidth={4} />
                </span>
                Joining awards 25 Justice Points once.
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-forest text-paper mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full">
                  <CalendarClock size={10} strokeWidth={3} />
                </span>
                This link works once, and only until {expires}.
              </li>
            </ul>

            <div className="border-ink/40 flex flex-wrap items-center gap-3 border-t border-dashed pt-4">
              {closed ? (
                <span className="text-ink-3 font-mono text-[10px]">
                  {invite.status === "used"
                    ? "This invitation has already been accepted."
                    : "This invitation has expired."}{" "}
                  Ask the steward for a fresh link.
                </span>
              ) : !me ? (
                <>
                  <Link
                    to={`/login?next=${encodeURIComponent(next)}`}
                    className="btn-press border-ink bg-ink text-paper hover:bg-vermilion flex items-center gap-1.5 rounded-full border-2 px-5 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase"
                  >
                    Sign in to accept <ArrowRight size={12} strokeWidth={3} />
                  </Link>
                  <Link
                    to={`/register?next=${encodeURIComponent(next)}`}
                    className="text-ink-2 hover:text-ink font-sans text-[10px] font-extrabold tracking-wider uppercase underline underline-offset-4"
                  >
                    Open an account first
                  </Link>
                  <span className="text-ink-3 w-full font-mono text-[9px]">Nothing is claimed until you accept.</span>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      redeem.mutate(token ?? "", { onSuccess: () => navigate(`/leagues/${invite.leagueId}`) })
                    }
                    disabled={redeem.isPending}
                    className="btn-press border-ink bg-verdant flex items-center gap-1.5 rounded-full border-2 px-5 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:opacity-40"
                  >
                    {redeem.isPending
                      ? "Signing the charter…"
                      : alreadyIn
                        ? "Accept and open the league"
                        : "Accept the seat"}
                    <ArrowRight size={12} strokeWidth={3} />
                  </button>
                  <span className="text-ink-3 font-mono text-[9px]">
                    Signed in as {handleLabel(me.profile)}
                    {alreadyIn ? " · already on the roster" : ""}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      <p className="text-ink-3 mt-4 font-mono text-[9px]">
        Invitation links are single-use. The token is hashed at rest; the steward sees it once.
      </p>
    </div>
  );
}
