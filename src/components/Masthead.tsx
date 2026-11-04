import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarClock, Compass, Newspaper, Plus, Scale, Search, Sparkles, X } from "lucide-react";
import { CAUSES, CAUSE_KEYS, LEAGUES, SHIFTS, weekDays } from "../data";
import { CountUp, Sparkline, useInView } from "../ui";
import { useApp } from "../ctx";
import { useEdition } from "../lib/queries";
import { cn } from "../utils/cn";

const TOTAL_JP = LEAGUES.reduce((a, l) => a + l.points, 0) * 6.4;

function PulseRing() {
  const dow = weekDays().findIndex((d) => d.isToday);
  const today = SHIFTS.filter((s) => s.day === dow);
  const open = today.reduce((a, s) => a + (s.spots - s.filled), 0) || 14;
  const pct = 0.72;
  const r = 28;
  const c = 2 * Math.PI * r;
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  return (
    <div ref={ref} className="group flex items-center gap-4" title="Open volunteer spots today">
      <div className="relative h-[76px] w-[76px]">
        <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
          <circle cx="36" cy="36" r={r} fill="none" stroke="#ddd1b5" strokeWidth="7" />
          <circle
            cx="36"
            cy="36"
            r={r}
            fill="none"
            stroke="#d9381e"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={seen ? c * (1 - pct) : c}
            style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(.2,.7,.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <CalendarClock
            size={22}
            className="text-ink transition-transform duration-500 group-hover:scale-125 group-hover:-rotate-12"
          />
        </div>
      </div>
      <div>
        <div className="font-display text-4xl leading-none font-black tabular-nums">
          <CountUp value={open} run={seen} />
        </div>
        <div className="kicker text-ink-3 mt-1">Spots open today</div>
      </div>
    </div>
  );
}

function PointsEar() {
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  return (
    <div ref={ref} className="flex flex-col items-end text-right">
      <div className="flex items-center gap-1.5">
        <Sparkles size={13} className="text-mustard" fill="#f2b705" />
        <span className="kicker text-ink-3">Justice Points, all leagues</span>
      </div>
      <div className="font-display text-4xl leading-none font-black">
        <CountUp value={Math.round(TOTAL_JP)} run={seen} />
      </div>
      <Sparkline
        data={[12, 14, 13, 18, 22, 21, 27, 33, 31, 40, 46, 52]}
        color="#d9381e"
        w={150}
        h={26}
        play={seen}
        className="mt-1.5"
      />
    </div>
  );
}

export function Masthead() {
  const now = new Date();
  const { pathname } = useLocation();
  const Wordmark = pathname === "/" ? "h1" : "div";
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return (
    <header className="mx-auto max-w-[1320px] px-4 pt-5 md:px-8">
      <div className="text-ink-2 flex items-center justify-between font-mono text-[11px] tracking-wide uppercase">
        <span>{date}</span>
        <span className="hidden sm:inline">Free for every neighbour</span>
        <span>Vol. IV · No. 112</span>
      </div>
      <div className="border-ink mt-2 border-t-[5px]" />
      <div className="grid items-center gap-4 py-5 lg:grid-cols-[1fr_auto_1fr] lg:py-7">
        <div className="hidden lg:block">
          <PulseRing />
        </div>
        <div className="text-center">
          <div className="font-display text-ink-2 text-lg font-medium italic">The</div>
          <Link to="/" aria-label="The Justice Leagues — front page" className="group inline-block">
            <Wordmark className="font-display relative text-[clamp(2.8rem,10vw,6.5rem)] leading-[0.85] font-black tracking-[-0.03em] transition-transform duration-500 group-hover:scale-[1.01] lg:text-[clamp(3rem,6.4vw,6.5rem)]">
              <span className="inline-block">Justice</span> <span className="inline-block italic">Leagues</span>
              <Scale
                className="animate-bob text-vermilion absolute -top-3 -right-4 hidden xl:block"
                size={34}
                strokeWidth={2.2}
              />
            </Wordmark>
          </Link>
          <div className="mx-auto mt-4 flex max-w-md items-center gap-3">
            <span className="bg-ink h-px flex-1" />
            <span className="font-display text-sm tracking-[0.25em] uppercase italic">Organised neighbours</span>
            <span className="bg-ink h-px flex-1" />
          </div>
        </div>
        <div className="hidden lg:block">
          <PointsEar />
        </div>
      </div>
      <div className="rule-thick-thin" />
    </header>
  );
}

export function Nav() {
  const { cause, setCause } = useApp();
  const { data } = useEdition();
  const me = data.me;
  const myPoints = me?.points ?? 0;
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searching) input.current?.focus();
  }, [searching]);

  const results = q.trim()
    ? data.leagues.filter((l) => (l.name + l.hood).toLowerCase().includes(q.toLowerCase())).slice(0, 4)
    : [];

  return (
    <div className="border-ink bg-paper/90 sticky top-0 z-40 border-b-2 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-2.5 md:px-8">
        <div className="no-scrollbar -mx-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1 py-1">
          <NavChip
            active={cause === "all"}
            onClick={() => setCause("all")}
            color="#14110d"
            label="All"
            icon={<Newspaper size={16} />}
          />
          {CAUSE_KEYS.map((k) => {
            const c = CAUSES[k];
            const Icon = c.icon;
            return (
              <NavChip
                key={k}
                active={cause === k}
                onClick={() => setCause(k)}
                color={c.color}
                label={c.label}
                icon={<Icon size={16} />}
              />
            );
          })}
        </div>

        <div className="relative flex items-center gap-2">
          <Link
            to="/leagues"
            title="The Atlas"
            aria-label="Browse every league"
            className="border-ink bg-paper hover:bg-paper-2 grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition-colors"
          >
            <Compass size={16} />
          </Link>

          <Link
            to="/ledger"
            title="The public record"
            aria-label="Read the public points ledger"
            className="border-ink bg-paper hover:bg-paper-2 hidden h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition-colors sm:grid"
          >
            <Scale size={16} />
          </Link>

          <div
            className={cn(
              "border-ink bg-paper flex items-center overflow-hidden rounded-full border-2 transition-all duration-500",
              searching ? "w-44 sm:w-60" : "w-10",
            )}
          >
            <button
              aria-label={searching ? "Close search" : "Search leagues"}
              aria-expanded={searching}
              onClick={() => {
                setSearching((s) => !s);
                setQ("");
              }}
              className="grid h-9 w-9 shrink-0 place-items-center"
            >
              {searching ? <X size={16} /> : <Search size={16} />}
            </button>
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearching(false);
                  setQ("");
                }
              }}
              aria-label="Find a league"
              placeholder="Find a league…"
              className="placeholder:text-ink-3 w-full bg-transparent pr-3 font-sans text-sm outline-none"
            />
          </div>
          {results.length > 0 && (
            <div className="animate-rise border-ink bg-paper absolute top-12 right-0 z-50 w-72 border-2 p-1 shadow-[5px_5px_0_#14110d]">
              {results.map((l) => {
                const c = CAUSES[l.cause];
                const Icon = c.icon;
                return (
                  <Link
                    key={l.id}
                    to={`/leagues/${l.id}`}
                    onClick={() => {
                      setSearching(false);
                      setQ("");
                    }}
                    className="hover:bg-paper-2 flex w-full items-center gap-3 p-2 text-left font-sans text-sm font-semibold transition-colors"
                  >
                    <span
                      className="text-paper grid h-7 w-7 place-items-center rounded-full"
                      style={{ background: c.color }}
                    >
                      <Icon size={14} />
                    </span>
                    {l.name}
                  </Link>
                );
              })}
            </div>
          )}

          <Link
            to="/#charter"
            className="btn-press border-ink bg-vermilion text-paper hidden items-center gap-1.5 rounded-full border-2 px-4 py-2 font-sans text-xs font-extrabold tracking-wide uppercase sm:flex"
          >
            <Plus size={14} strokeWidth={3} />
            <span>Start a League</span>
          </Link>
          <Link
            to="/#charter"
            aria-label="Start a league"
            className="border-ink bg-vermilion text-paper grid h-10 w-10 place-items-center rounded-full border-2 sm:hidden"
          >
            <Plus size={16} strokeWidth={3} />
          </Link>

          <Link
            to="/dashboard"
            key={myPoints}
            title={me ? "Your desk" : "Sign in"}
            aria-label={`Your Justice Points: ${myPoints}. Open your desk.`}
            className={cn(
              "animate-pop flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1",
              me ? "bg-ink text-paper" : "border-ink bg-paper text-ink border-2",
            )}
          >
            <span
              className={cn(
                "grid h-7 w-7 place-items-center rounded-full font-sans text-[11px] font-black",
                me ? "bg-mustard text-ink" : "bg-ink text-paper",
              )}
            >
              {me ? "You" : "In"}
            </span>
            <Sparkles size={12} className={me ? "text-mustard" : "text-ink-3"} fill={me ? "#f2b705" : "none"} />
            <span className="font-mono text-xs font-semibold tabular-nums">{myPoints}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function NavChip({
  active,
  onClick,
  color,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        "group border-ink flex h-10 shrink-0 items-center rounded-full border-2 px-[9px] transition-all duration-300",
        active ? "text-paper" : "bg-paper hover:-translate-y-0.5",
      )}
      style={{
        background: active ? color : undefined,
        boxShadow: active ? "3px 3px 0 #14110d" : undefined,
        color: active ? "#f4eee1" : undefined,
      }}
    >
      <span className="grid h-5 w-5 place-items-center transition-colors" style={{ color: active ? "#f4eee1" : color }}>
        {icon}
      </span>
      <span
        className={cn(
          "overflow-hidden font-sans text-xs font-extrabold tracking-wide whitespace-nowrap uppercase transition-all duration-300",
          active
            ? "ml-1.5 max-w-24 pr-1 opacity-100"
            : "ml-0 max-w-0 opacity-0 group-hover:ml-1.5 group-hover:max-w-24 group-hover:pr-1 group-hover:opacity-100",
        )}
      >
        {label}
      </span>
    </button>
  );
}
