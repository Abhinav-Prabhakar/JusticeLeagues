import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Check, HandHeart, HandHelping, MapPin, Plus, Tag, UserRound, X } from "lucide-react";
import { CAUSES } from "../../data";
import { activeMembership, handleLabel } from "../../lib/api";
import {
  useClaimResource,
  useCreateResource,
  useExpireResource,
  useFulfilResource,
  useReleaseResource,
} from "../../lib/queries";
import type { ResourceDTO, ResourceKind, ResourceStatus } from "../../lib/types";
import { ReportButton } from "../../components/ReportButton";
import { SectionHead } from "../../ui";
import { cn } from "../../utils/cn";
import { useLeagueContext } from "./context";

const STATUS_STYLE: Record<ResourceStatus, string> = {
  open: "bg-forest text-paper",
  claimed: "bg-mustard text-ink",
  fulfilled: "bg-paper-3 text-ink-2",
  expired: "bg-paper-3 text-ink-3",
};

function postedWhen(iso: string) {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function neededByLabel(date: string | null) {
  if (!date) return null;
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function LeagueResources() {
  const { league: l, edition } = useLeagueContext();
  const c = CAUSES[l.cause];
  const color = c.color === "#14110d" ? "#4a4338" : c.color;
  const membership = activeMembership(edition.me, l.id);
  const me = edition.me;

  const resources = edition.resources.filter((resource) => resource.league === l.id);
  const [kind, setKind] = useState<"all" | ResourceKind>("all");
  const [showClosed, setShowClosed] = useState(false);
  const [form, setForm] = useState({
    kind: "want" as ResourceKind,
    chapterId: l.chapters[0]?.id ?? "",
    title: "",
    description: "",
    quantity: "",
    neededBy: "",
  });

  const create = useCreateResource();
  const claim = useClaimResource();
  const release = useReleaseResource();
  const fulfil = useFulfilResource();
  const expire = useExpireResource();
  const busy = claim.isPending || release.isPending || fulfil.isPending || expire.isPending;

  const closedCount = resources.filter(
    (resource) => resource.status === "fulfilled" || resource.status === "expired",
  ).length;
  const visible = resources.filter((resource) => {
    if (kind !== "all" && resource.kind !== kind) return false;
    if (!showClosed && (resource.status === "fulfilled" || resource.status === "expired")) return false;
    return true;
  });

  const post = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate(
      { leagueId: l.id, ...form },
      {
        onSuccess: () =>
          setForm((previous) => ({ ...previous, title: "", description: "", quantity: "", neededBy: "" })),
      },
    );
  };

  return (
    <div className="space-y-8">
      <SectionHead
        kicker="The exchange"
        title={
          <>
            Offers &amp; <em>needs</em>
          </>
        }
        right={
          <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
            <Tag size={13} /> {resources.filter((resource) => resource.status === "open").length} open
          </span>
        }
      />

      <p className="text-ink-2 max-w-2xl font-serif text-sm">
        Neighbours lend tools, tables, vans, and time. Claiming a classified puts your name on it; fulfilling it closes
        the loop. No Justice Points change hands here — this is the borrow shelf, not the scoreboard.
      </p>

      {membership ? (
        <details key={l.id} className="border-ink bg-paper-2 group border-2">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="kicker text-ink flex items-center gap-1.5">
              <Plus size={13} /> Post an offer or a need
            </span>
            <span className="text-ink-3 font-mono text-[10px]">Visible to the whole league immediately</span>
          </summary>
          <form onSubmit={post} className="border-ink/20 grid gap-3 border-t px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <fieldset className="sm:col-span-2 lg:col-span-4">
              <legend className="kicker text-ink-3 mb-1.5 text-[9px]">Which way does it go?</legend>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "offer" as const, label: "I have something to lend", icon: HandHeart },
                  { value: "want" as const, label: "The league needs something", icon: HandHelping },
                ].map((option) => {
                  const on = form.kind === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setForm({ ...form, kind: option.value })}
                      className={cn(
                        "border-ink flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase transition-colors",
                        on ? "bg-ink text-paper" : "bg-paper hover:bg-paper-3",
                      )}
                    >
                      <option.icon size={12} /> {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="block sm:col-span-2">
              <span className="kicker text-ink-3 text-[9px]">Title</span>
              <input
                required
                minLength={3}
                maxLength={90}
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Folding tables for the Sunday meal"
                className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
              />
            </label>
            <label className="block">
              <span className="kicker text-ink-3 text-[9px]">Chapter</span>
              <select
                value={form.chapterId}
                onChange={(event) => setForm({ ...form, chapterId: event.target.value })}
                className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
              >
                {l.chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.hood}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="kicker text-ink-3 text-[9px]">Quantity / note</span>
              <input
                maxLength={60}
                value={form.quantity}
                onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                placeholder="6 tables · pick-up Sat"
                className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
              />
            </label>
            <label className="block">
              <span className="kicker text-ink-3 text-[9px]">Needed by (optional)</span>
              <input
                type="date"
                value={form.neededBy}
                onChange={(event) => setForm({ ...form, neededBy: event.target.value })}
                className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
              />
            </label>
            <label className="block sm:col-span-2 lg:col-span-4">
              <span className="kicker text-ink-3 text-[9px]">Details</span>
              <textarea
                rows={2}
                maxLength={500}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Where it is, when it can be collected, and anything the claimant should know."
                className="border-ink bg-paper mt-1 w-full resize-y border-2 px-2.5 py-2 font-serif text-sm"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
              <button
                type="submit"
                disabled={create.isPending}
                className="btn-press border-ink bg-verdant rounded-full border-2 px-5 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:opacity-40"
              >
                {create.isPending ? "Posting…" : "Pin it to the exchange"}
              </button>
              <span className="text-ink-3 font-mono text-[9px]">Posted under {l.name}.</span>
            </div>
          </form>
        </details>
      ) : (
        <div className="border-ink/40 flex flex-wrap items-center gap-3 border-2 border-dashed px-4 py-3">
          <p className="text-ink-2 flex-1 font-serif text-sm">Join {l.name} to post a classified or claim one.</p>
          <Link
            to={`/login?next=${encodeURIComponent(`/leagues/${l.id}/resources`)}`}
            className="btn-press border-ink bg-ink text-paper rounded-full border-2 px-4 py-2 font-sans text-[10px] font-extrabold tracking-wider uppercase"
          >
            Sign in
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="border-ink bg-paper flex rounded-full border-2 p-0.5">
          {[
            { value: "all" as const, label: "All", icon: Tag },
            { value: "offer" as const, label: "Offering", icon: HandHeart },
            { value: "want" as const, label: "Wanted", icon: HandHelping },
          ].map((option) => {
            const on = kind === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
                aria-pressed={on}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase transition-colors",
                  on ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2",
                )}
              >
                <option.icon size={12} /> {option.label}
              </button>
            );
          })}
        </div>
        {closedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowClosed((value) => !value)}
            aria-pressed={showClosed}
            className="text-ink-3 hover:text-ink font-mono text-[10px] underline underline-offset-2"
          >
            {showClosed ? "Hide closed" : `Show closed (${closedCount})`}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="border-ink/40 grid place-items-center gap-2 border-2 border-dashed px-6 py-12 text-center">
          <Tag size={22} className="text-ink-3" />
          <p className="font-display text-ink-3 text-xl italic">The shelf is empty.</p>
          <p className="text-ink-2 max-w-md font-serif text-sm">
            Post the first offer or need for {l.name}. Borrowed ladders count.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {visible.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              chapterHood={l.chapters.find((chapter) => chapter.id === resource.chapterId)?.hood}
              color={color}
              meId={me?.profile.id}
              signedIn={Boolean(me)}
              busy={busy}
              onClaim={() => claim.mutate(resource.id)}
              onRelease={() => release.mutate(resource.id)}
              onFulfil={() => fulfil.mutate(resource.id)}
              onExpire={() => expire.mutate(resource.id)}
            />
          ))}
        </div>
      )}

      <p className="text-ink-3 font-mono text-[9px]">
        Closed classifieds stay on file. Claim history is kept server-side so a handoff can always be traced.
      </p>
    </div>
  );
}

function ResourceCard({
  resource,
  chapterHood,
  color,
  meId,
  signedIn,
  busy,
  onClaim,
  onRelease,
  onFulfil,
  onExpire,
}: {
  resource: ResourceDTO;
  chapterHood?: string;
  color: string;
  meId?: string;
  signedIn: boolean;
  busy: boolean;
  onClaim: () => void;
  onRelease: () => void;
  onFulfil: () => void;
  onExpire: () => void;
}) {
  const offer = resource.kind === "offer";
  const mine = Boolean(meId && resource.createdBy?.id === meId);
  const claimant = Boolean(meId && resource.claimedBy?.id === meId);
  const open = resource.status === "open";
  const claimed = resource.status === "claimed";
  const closed = resource.status === "fulfilled" || resource.status === "expired";
  const needed = neededByLabel(resource.neededBy);

  return (
    <article className={cn("border-ink flex flex-col border-2", closed && "opacity-70", claimed && "bg-paper-2")}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span
          className="kicker -rotate-2 border-2 px-2 py-0.5 text-[8px]"
          style={{ borderColor: offer ? "#14694d" : "#b82d19", color: offer ? "#14694d" : "#b82d19" }}
        >
          {offer ? "Offering" : "Wanted"}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-sans text-[8px] font-extrabold tracking-wider uppercase",
            STATUS_STYLE[resource.status],
          )}
        >
          {resource.status}
        </span>
        <span className="text-ink-3 ml-auto font-mono text-[9px]">{postedWhen(resource.createdAt)}</span>
      </div>

      <div className="flex-1 px-4 pb-4">
        <div className="flex items-start gap-3">
          <span
            className="border-ink bg-paper grid h-11 w-11 shrink-0 place-items-center rounded-full border-2"
            style={{ color }}
            aria-hidden
          >
            {offer ? <HandHeart size={20} /> : <HandHelping size={20} />}
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-xl leading-tight font-bold text-balance">{resource.title}</h3>
            <div className="text-ink-2 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px]">
              <span className="flex items-center gap-1">
                <MapPin size={10} /> {chapterHood ?? "Citywide"}
              </span>
              {resource.quantity && <span>{resource.quantity}</span>}
              {needed && (
                <span className="flex items-center gap-1">
                  <CalendarDays size={10} /> by {needed}
                </span>
              )}
            </div>
          </div>
        </div>

        {resource.description && (
          <p className="text-ink-2 mt-3 font-serif text-sm leading-relaxed">{resource.description}</p>
        )}

        <div className="text-ink-3 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px]">
          <span className="flex items-center gap-1">
            <UserRound size={10} /> {resource.createdBy ? handleLabel(resource.createdBy) : "the league"}
          </span>
          {resource.claimedBy && <span className="text-vermilion">held by {handleLabel(resource.claimedBy)}</span>}
          {mine && <span className="text-forest font-semibold">your post</span>}
        </div>
      </div>

      <div className="border-ink/15 flex flex-wrap items-center gap-2 border-t px-4 py-3">
        {open && signedIn && !mine && (
          <button
            type="button"
            onClick={onClaim}
            disabled={busy}
            className="btn-press border-ink bg-ink text-paper hover:bg-vermilion flex items-center gap-1.5 rounded-full border-2 px-3.5 py-2 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
          >
            <Check size={11} strokeWidth={3} /> {offer ? "Claim this offer" : "I can help"}
          </button>
        )}
        {open && !signedIn && (
          <span className="text-ink-3 font-mono text-[9px]">
            Sign in to claim · posted by {handleLabel(resource.createdBy)}
          </span>
        )}
        {(claimed || (open && mine)) && !closed && (
          <button
            type="button"
            onClick={onFulfil}
            disabled={busy}
            className="btn-press border-ink bg-verdant rounded-full border-2 px-3.5 py-2 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
          >
            <Check size={11} strokeWidth={3} /> Mark fulfilled
          </button>
        )}
        {claimed && (claimant || mine) && (
          <button
            type="button"
            onClick={onRelease}
            disabled={busy}
            className="btn-press border-ink/40 text-ink-2 hover:border-ink hover:text-ink rounded-full border-2 px-3.5 py-2 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
          >
            Release claim
          </button>
        )}
        {!closed && (mine || claimant) && (
          <button
            type="button"
            onClick={onExpire}
            disabled={busy}
            className="text-ink-3 hover:text-vermilion font-mono text-[9px] underline underline-offset-2 disabled:opacity-40"
          >
            <X size={9} className="mr-0.5 inline" /> Expire
          </button>
        )}
        <ReportButton
          targetType="resource"
          targetId={resource.id}
          targetTitle={resource.title}
          signedIn={signedIn && !mine}
          className="ml-auto"
        />
      </div>
    </article>
  );
}
