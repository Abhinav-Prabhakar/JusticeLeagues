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
import { useEdition } from "../lib/queries";
import { cn } from "../utils/cn";

type Scope = "points" | "city" | "month";
const TABS: { key: Scope; label: string; icon: React.ReactNode }[] = [
  { key: "points", label: "Global", icon: <Globe2 size={14} /> },
  { key: "city", label: "City", icon: <MapPin size={14} /> },
  { key: "month", label: "Month", icon: <CalendarDays size={14} /> },
];

const MEDAL = ["#f2b705", "#b8b5ad", "#c0763a"];

export function Standings() {
  const { cause, setOpenLeague } = useApp();
  const { data } = useEdition();
  const [scope, setScope] = useState<Scope>("points");
  const [all, setAll] = useState(false);
  const [ref, seen] = useInView<HTMLDivElement>(0.1);

  const rows = useMemo(() => {
    const list = data.leagues.filter((l) => cause === "all" || l.cause === cause).sort((a, b) => b[scope] - a[scope]);
    return list;
  }, [cause, scope, data.leagues]);
  const max = rows[0]?.[scope] ?? 1;
  const shown = all ? rows : rows.slice(0, 7);

  return (
    <aside ref={ref} className="bg-paper-2/60 ring-ink p-4 ring-2 md:p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-ink text-mustard grid h-11 w-11 place-items-center rounded-full">
            <Trophy size={20} fill="currentColor" />
          </span>
          <div>
            <div className="kicker text-vermilion">Global leaderboard</div>
            <h3 className="font-display text-3xl leading-none font-black italic">The Standings</h3>
          </div>
        </div>
      </div>

      <div className="border-ink bg-paper relative mt-4 grid grid-cols-3 rounded-full border-2 p-0.5">
        <span
          className="bg-ink absolute top-0.5 bottom-0.5 left-0.5 w-[calc(33.333%-2px)] rounded-full transition-transform duration-500 ease-[cubic-bezier(.3,.8,.2,1)]"
          style={{ transform: `translateX(${TABS.findIndex((t) => t.key === scope) * 100}%)` }}
        />
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setScope(t.key)}
            className={cn(
              "relative z-10 flex items-center justify-center gap-1.5 py-1.5 font-sans text-[11px] font-extrabold tracking-wider uppercase transition-colors duration-300",
              scope === t.key ? "text-paper" : "text-ink-2 hover:text-ink",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <ol key={`${scope}-${cause}`} className="mt-3">
        {shown.length === 0 && (
          <li className="font-display text-ink-3 py-10 text-center text-lg italic">No leagues yet — be the first.</li>
        )}
        {shown.map((l, i) => {
          const c = CAUSES[l.cause];
          const v = l[scope];
          return (
            <li
              key={l.id}
              data-open="false"
              className="expand-host animate-rise border-ink/40 relative border-b last:border-b-0"
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <button
                onClick={() => setOpenLeague(l.id)}
                className="relative block w-full overflow-hidden px-1 py-2.5 text-left"
              >
                <span
                  className="animate-grow-x absolute inset-y-1 left-0 -z-0 opacity-[0.16] transition-opacity duration-300 group-hover:opacity-30"
                  style={{ width: `${(v / max) * 100}%`, background: c.color, animationDelay: `${i * 55 + 150}ms` }}
                />
                <div className="relative flex items-center gap-3">
                  <span
                    className="font-display w-8 text-center text-3xl leading-none font-black"
                    style={{ color: i < 3 ? undefined : "#857b6a" }}
                  >
                    {i < 3 ? (
                      <span
                        className="border-ink mx-auto grid h-8 w-8 place-items-center rounded-full border-2 text-lg"
                        style={{ background: MEDAL[i] }}
                      >
                        {i + 1}
                      </span>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <Emblem cause={l.cause} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="font-display truncate text-[15px] leading-tight font-bold">{l.name}</div>
                    <div className="text-ink-3 flex items-center gap-1 truncate font-sans text-[10px] font-bold tracking-wider uppercase">
                      <MapPin size={10} /> {l.hood}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold tabular-nums">{fmt(v)}</div>
                    <div
                      className={cn(
                        "flex items-center justify-end font-mono text-[10px] font-semibold",
                        l.delta > 10 ? "text-forest" : "text-ink-3",
                      )}
                    >
                      {l.delta > 5 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {l.delta}%
                    </div>
                  </div>
                </div>
              </button>
              <div className="expand">
                <div>
                  <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-3 pl-12">
                    <Sparkline
                      data={l.trend}
                      color={c.color === "#14110d" ? "#14110d" : c.color}
                      w={110}
                      h={30}
                      play={seen}
                    />
                    <div className="text-ink-2 flex items-center gap-3.5 font-mono text-[11px] font-semibold">
                      <span className="flex items-center gap-1" title="Members">
                        <Users size={12} /> {fmt(l.members)}
                      </span>
                      <span className="flex items-center gap-1" title="Hours given">
                        <Hourglass size={12} /> {(l.hours / 1000).toFixed(1)}k
                      </span>
                      <span className="text-vermilion flex items-center gap-1" title="Week streak">
                        <Flame size={12} fill="currentColor" /> {l.streak}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {rows.length > 7 && (
        <button
          onClick={() => setAll((a) => !a)}
          className="hover:text-vermilion mx-auto mt-3 flex items-center gap-1.5 font-sans text-[11px] font-extrabold tracking-wider uppercase"
        >
          {all ? "Show fewer" : `All ${rows.length} leagues`}
          <ChevronDown size={14} className={cn("transition-transform duration-300", all && "rotate-180")} />
        </button>
      )}
    </aside>
  );
}
