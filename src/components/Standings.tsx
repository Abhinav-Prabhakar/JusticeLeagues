import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  Flame,
  Globe2,
  Hourglass,
  MapPin,
  Trophy,
  Users,
} from "lucide-react";
import { CAUSES, fmt } from "../data";
import { Emblem, Sparkline, useInView } from "../ui";
import { useApp } from "../ctx";
import { useEdition, useStandings } from "../lib/queries";
import type { Cause } from "../data/fixtures";
import type { StandingRowDTO, StandingsScope } from "../lib/types";
import { cn } from "../utils/cn";

type Scope = Extract<StandingsScope, "global" | "month" | "chapter">;

const TABS: { key: Scope; label: string; icon: React.ReactNode }[] = [
  { key: "global", label: "Global", icon: <Globe2 size={13} /> },
  { key: "month", label: "Month", icon: <CalendarDays size={13} /> },
  { key: "chapter", label: "Chapters", icon: <MapPin size={13} /> },
];

const MEDAL = ["#f2b705", "#b8b5ad", "#c0763a"];

/**
 * The sidebar never shows a fixture number once the API answers. Until then
 * (or on GitHub Pages) the edition fixtures stand in, using the same shape the
 * server returns so the swap is invisible.
 */
function fallbackRows(
  leagues: { id: string; slug: string; name: string; cause: Cause; hood: string; points: number; month: number; members: number; projects: number; hours: number; streak: number; trend: number[]; chapters: { id: string; name: string; points: number }[] }[],
  scope: Scope,
  cause: Cause | "all",
): StandingRowDTO[] {
  const filtered = leagues.filter((league) => cause === "all" || league.cause === cause);
  if (scope === "chapter") {
    return filtered
      .flatMap((league) =>
        league.chapters.map((chapter) => ({
          rank: 0,
          leagueId: league.id,
          leagueSlug: league.slug,
          leagueName: league.name,
          cause: league.cause,
          hood: league.hood,
          points: chapter.points,
          monthPoints: 0,
          members: league.members,
          projects: league.projects,
          hours: league.hours,
          streak: league.streak,
          trend: league.trend,
          chapterId: chapter.id,
          chapterName: chapter.name,
        })),
      )
      .sort((a, b) => b.points - a.points || a.chapterName!.localeCompare(b.chapterName!))
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  return [...filtered]
    .sort((a, b) => (scope === "month" ? b.month - a.month : b.points - a.points) || b.members - a.members)
    .map((league, index) => ({
      rank: index + 1,
      leagueId: league.id,
      leagueSlug: league.slug,
      leagueName: league.name,
      cause: league.cause,
      hood: league.hood,
      points: scope === "month" ? league.month : league.points,
      monthPoints: league.month,
      members: league.members,
      projects: league.projects,
      hours: league.hours,
      streak: league.streak,
      trend: league.trend,
      chapterId: null,
      chapterName: null,
    }));
}

export function Standings() {
  const { cause, setOpenLeague } = useApp();
  const { data: edition } = useEdition();
  const [scope, setScope] = useState<Scope>("global");
  const [all, setAll] = useState(false);
  const [ref, seen] = useInView<HTMLDivElement>(0.1);

  const standings = useStandings({ scope, cause, limit: 100 });
  const rows = useMemo(
    () => standings.data?.rows ?? fallbackRows(edition.leagues, scope, cause),
    [standings.data, edition.leagues, scope, cause],
  );
  const total = standings.data?.total ?? rows.length;
  const max = Math.max(...rows.map((row) => row.points), 1);
  const shown = all ? rows : rows.slice(0, 7);
  const improved = standings.data?.mostImproved ?? null;

  return (
    <aside ref={ref} className="bg-paper-2/60 ring-ink p-4 ring-2 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="bg-ink text-mustard grid h-11 w-11 place-items-center rounded-full">
            <Trophy size={20} fill="currentColor" />
          </span>
          <div>
            <div className="kicker text-vermilion">Server-ranked leaderboard</div>
            <h3 className="font-display text-3xl leading-none font-black italic">The Standings</h3>
          </div>
        </div>
      </div>

      <div className="border-ink bg-paper relative mt-4 grid grid-cols-3 rounded-full border-2 p-0.5">
        <span
          className="bg-ink absolute top-0.5 bottom-0.5 left-0.5 w-[calc(33.333%-2px)] rounded-full transition-transform duration-500 ease-[cubic-bezier(.3,.8,.2,1)]"
          style={{ transform: `translateX(${TABS.findIndex((tab) => tab.key === scope) * 100}%)` }}
        />
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setScope(tab.key);
              setAll(false);
            }}
            aria-pressed={scope === tab.key}
            className={cn(
              "relative z-10 flex items-center justify-center gap-1.5 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase transition-colors duration-300",
              scope === tab.key ? "text-paper" : "text-ink-2 hover:text-ink",
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <p className="text-ink-3 mt-2 flex items-center gap-1 font-mono text-[9px]">
        <span className="bg-forest inline-block h-1.5 w-1.5 rounded-full" />
        {scope === "chapter" ? "Points earned in each neighbourhood chapter" : "Ledger totals · rebuilt on every award"}
        {improved && <span className="ml-auto truncate">▲ {improved.leagueName}</span>}
      </p>

      <ol key={`${scope}-${cause}`} className="mt-2">
        {shown.length === 0 && (
          <li className="font-display text-ink-3 py-10 text-center text-lg italic">No leagues yet — be the first.</li>
        )}
        {shown.map((row, index) => {
          const c = CAUSES[row.cause];
          const name = row.chapterName ?? row.leagueName;
          return (
            <li
              key={row.chapterId ?? row.leagueId}
              data-open="false"
              className="expand-host animate-rise border-ink/40 relative border-b last:border-b-0"
              style={{ animationDelay: `${index * 55}ms` }}
            >
              <button
                type="button"
                onClick={() => setOpenLeague(row.leagueId)}
                className="relative block w-full overflow-hidden px-1 py-2.5 text-left focus-visible:outline-offset-2"
              >
                <span
                  className="animate-grow-x absolute inset-y-1 left-0 -z-0 opacity-[0.16] transition-opacity duration-300 group-hover:opacity-30"
                  style={{ width: `${(row.points / max) * 100}%`, background: c.color, animationDelay: `${index * 55 + 150}ms` }}
                />
                <div className="relative flex items-center gap-3">
                  <span
                    className="font-display w-8 shrink-0 text-center text-3xl leading-none font-black"
                    style={{ color: index < 3 ? undefined : "#605747" }}
                  >
                    {index < 3 ? (
                      <span
                        className="border-ink mx-auto grid h-8 w-8 place-items-center rounded-full border-2 text-lg"
                        style={{ background: MEDAL[index] }}
                      >
                        {index + 1}
                      </span>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <Emblem cause={row.cause} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="font-display truncate text-[15px] leading-tight font-bold">{name}</div>
                    <div className="text-ink-3 flex items-center gap-1 truncate font-sans text-[10px] font-bold tracking-wider uppercase">
                      <MapPin size={10} />
                      {row.chapterName ? row.leagueName : row.hood}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold tabular-nums">{fmt(row.points)}</div>
                    <div
                      className={cn(
                        "flex items-center justify-end font-mono text-[10px] font-semibold",
                        row.monthPoints > 0 ? "text-forest" : "text-ink-3",
                      )}
                    >
                      {row.monthPoints > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {row.monthPoints !== 0 ? `${fmt(row.monthPoints)} this month` : "quiet month"}
                    </div>
                  </div>
                </div>
              </button>
              <div className="expand">
                <div>
                  <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-3 pl-12">
                    <Sparkline
                      data={row.trend}
                      color={c.color === "#14110d" ? "#14110d" : c.color}
                      w={108}
                      h={28}
                      play={seen}
                    />
                    <div className="text-ink-2 flex items-center gap-3 font-mono text-[10px] font-semibold">
                      <span className="flex items-center gap-1" title="Members">
                        <Users size={11} /> {fmt(row.members)}
                      </span>
                      <span className="flex items-center gap-1" title="Hours given">
                        <Hourglass size={11} /> {(row.hours / 1000).toFixed(1)}k
                      </span>
                      <span className="text-vermilion flex items-center gap-1" title="Weeks on">
                        <Flame size={11} fill="currentColor" /> {row.streak}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {total > 7 && (
        <button
          type="button"
          onClick={() => setAll((value) => !value)}
          className="hover:text-vermilion mx-auto mt-3 flex items-center gap-1.5 font-sans text-[11px] font-extrabold tracking-wider uppercase"
        >
          {all ? "Show fewer" : `All ${total} ${scope === "chapter" ? "chapters" : "leagues"}`}
          <ChevronDown size={14} className={cn("transition-transform duration-300", all && "rotate-180")} />
        </button>
      )}
    </aside>
  );
}
