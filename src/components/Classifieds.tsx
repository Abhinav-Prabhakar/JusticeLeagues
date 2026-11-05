import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Tag, HandHeart, HandHelping } from "lucide-react";
import { CAUSES, leagueById } from "../data";
import { Emblem, Reveal, SectionHead } from "../ui";
import { useEdition } from "../lib/queries";
import type { ResourceDTO } from "../lib/types";
import { cn } from "../utils/cn";

function postedWhen(iso: string) {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function neededBy(date: string | null) {
  if (!date) return null;
  return `by ${new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function ClassifiedCard({ resource }: { resource: ResourceDTO }) {
  const league = leagueById(resource.league);
  const color = CAUSES[league.cause].color;
  const offer = resource.kind === "offer";
  const Icon = offer ? HandHeart : HandHelping;

  return (
    <article
      data-open="false"
      className="expand-host group relative h-full overflow-hidden p-5 transition-colors duration-500"
      style={{ background: offer ? undefined : "rgba(242,183,5,.16)" }}
    >
      <div className="flex items-start justify-between">
        <span
          className="kicker -rotate-2 border-2 px-2 py-1 transition-transform duration-300 group-hover:rotate-0"
          style={{ borderColor: offer ? "#14694d" : "#b82d19", color: offer ? "#14694d" : "#b82d19" }}
        >
          {offer ? "Offering" : "Wanted"}
        </span>
        <span className="text-ink-3 font-mono text-[11px]">{postedWhen(resource.createdAt)}</span>
      </div>
      <div className="mt-4 flex gap-4">
        <span
          className="border-ink bg-paper grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-12"
          style={{ color }}
        >
          <Icon size={28} strokeWidth={1.9} />
        </span>
        <Link
          to={`/leagues/${league.id}/resources`}
          className="font-display text-xl leading-tight font-bold text-balance decoration-2 underline-offset-4 hover:underline"
        >
          {resource.title}
        </Link>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Emblem cause={league.cause} size={22} />
        <span className="text-ink-3 truncate font-sans text-[10px] font-bold tracking-wider uppercase">
          {league.hood}
        </span>
      </div>

      <div className="expand">
        <div>
          {resource.description && (
            <p className="text-ink-2 mt-3 line-clamp-3 font-serif text-sm leading-snug">{resource.description}</p>
          )}
        </div>
      </div>

      <div className="border-ink/50 mt-4 flex items-center justify-between gap-3 border-t border-dashed pt-3">
        <span className="text-ink-2 font-mono text-[11px] font-semibold">
          {resource.quantity || neededBy(resource.neededBy) || (offer ? "Available now" : "Open need")}
        </span>
        <Link
          to={`/leagues/${league.id}/resources`}
          aria-label={`${offer ? "Claim" : "Help with"} ${resource.title}`}
          className="btn-press border-ink bg-ink text-paper hover:bg-vermilion flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase"
        >
          {offer ? "Claim" : "I can help"} <ArrowRight size={12} strokeWidth={3} />
        </Link>
      </div>
    </article>
  );
}

export function Classifieds() {
  const [kind, setKind] = useState<"all" | "offer" | "want">("all");
  const { data } = useEdition();
  const open = data.resources.filter((resource) => resource.status === "open");
  const offers = open.filter((resource) => resource.kind === "offer");
  const wants = open.filter((resource) => resource.kind === "want");
  const mixed = Array.from({ length: Math.max(offers.length, wants.length) }, (_, i) => [offers[i], wants[i]])
    .flat()
    .filter((resource): resource is ResourceDTO => Boolean(resource));
  const list = (kind === "all" ? mixed : open.filter((resource) => resource.kind === kind)).slice(0, 6);

  return (
    <section id="classifieds">
      <SectionHead
        kicker="Shared resources"
        title={
          <>
            The <em>Classifieds</em>
          </>
        }
        icon={<Tag size={40} className="text-rose" strokeWidth={1.8} />}
        right={
          <div className="border-ink bg-paper flex rounded-full border-2 p-0.5">
            {[
              { k: "all" as const, icon: <Tag size={14} />, l: "All" },
              { k: "offer" as const, icon: <HandHeart size={14} />, l: "Offering" },
              { k: "want" as const, icon: <HandHelping size={14} />, l: "Wanted" },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setKind(t.k)}
                aria-label={t.l}
                aria-pressed={kind === t.k}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-[11px] font-extrabold tracking-wider uppercase transition-all duration-300",
                  kind === t.k ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2",
                )}
              >
                {t.icon}
                <span className={cn(kind === t.k ? "inline" : "hidden sm:inline")}>{t.l}</span>
              </button>
            ))}
          </div>
        }
      />
      {list.length === 0 ? (
        <div className="border-ink grid place-items-center gap-2 border-2 border-dashed px-6 py-12 text-center">
          <Tag size={22} className="text-ink-3" />
          <p className="font-display text-ink-3 text-xl italic">The shelf is empty.</p>
          <p className="text-ink-2 max-w-md font-serif text-sm">
            Open a league and post the first offer or need. Borrowed ladders count.
          </p>
        </div>
      ) : (
        <div key={kind} className="border-ink grid border-t border-l sm:grid-cols-2 lg:grid-cols-3">
          {list.map((resource, i) => (
            <Reveal key={resource.id} delay={i * 80} className="border-ink border-r border-b">
              <ClassifiedCard resource={resource} />
            </Reveal>
          ))}
        </div>
      )}
      <p className="text-ink-3 mt-4 font-mono text-[10px]">
        Live from the exchange. Claiming happens inside the league, where your membership is known.
      </p>
    </section>
  );
}
