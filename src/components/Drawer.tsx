import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CalendarCheck, Clock, ExternalLink, Flame, Hourglass, MapPin, Sparkles, Trophy, Users, X } from "lucide-react";
import { CAUSES, fmt } from "../data";
import { Emblem, Photo, Sparkline } from "../ui";
import { useApp } from "../ctx";
import { useEdition, useCancelShift, useSignupShift } from "../lib/queries";
import { isSignedUp } from "../lib/api";
import { JoinButton } from "./JoinButton";

const TIERS = [
  { name: "Bronze", at: 0, color: "#c0763a" },
  { name: "Silver", at: 20000, color: "#9a978f" },
  { name: "Gold", at: 35000, color: "#f2b705" },
  { name: "Platinum", at: 50000, color: "#2347c5" },
];

export function Drawer() {
  const { openLeague, setOpenLeague } = useApp();
  const { data } = useEdition();
  const signup = useSignupShift();
  const cancel = useCancelShift();
  const navigate = useNavigate();
  const location = useLocation();
  const me = data.me;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenLeague(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpenLeague]);

  if (!openLeague) return null;
  const l = data.leagues.find((item) => item.id === openLeague);
  if (!l) return null;
  const c = CAUSES[l.cause];
  const color = c.color;
  const rank = [...data.leagues].sort((a, b) => b.points - a.points).findIndex((x) => x.id === l.id) + 1;
  const tierIdx = TIERS.reduce((a, t, i) => (l.points >= t.at ? i : a), 0);
  const tier = TIERS[tierIdx];
  const next = TIERS[tierIdx + 1];
  const pct = next ? (l.points - tier.at) / (next.at - tier.at) : 1;
  const r = 46;
  const circ = 2 * Math.PI * r;
  const shifts = data.shifts.filter((s) => s.league === l.id).slice(0, 3);
  const wins = data.wins.filter((w) => w.league === l.id);

  const toggle = (shift: (typeof shifts)[number]) => {
    if (!me) {
      setOpenLeague(null);
      navigate(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    if (isSignedUp(me, shift.id)) cancel.mutate(shift);
    else signup.mutate(shift);
  };

  return (
    <div className="fixed inset-0 z-[90]">
      <div
        className="animate-fade-in bg-ink/60 absolute inset-0 backdrop-blur-[2px]"
        onClick={() => setOpenLeague(null)}
      />
      <aside className="animate-slide-in-right border-ink bg-paper absolute top-0 right-0 flex h-full w-full max-w-[480px] flex-col overflow-y-auto border-l-4 shadow-[-12px_0_0_rgba(20,17,13,.15)]">
        <div className="hover-color relative">
          <Photo id={l.photo} w={960} h={420} className="border-ink h-52 w-full border-b-2" />
          <button
            onClick={() => setOpenLeague(null)}
            aria-label="Close"
            className="border-ink bg-paper absolute top-4 right-4 grid h-10 w-10 place-items-center rounded-full border-2 transition-transform duration-300 hover:rotate-90"
          >
            <X size={18} />
          </button>
          <div className="absolute -bottom-9 left-6">
            <Emblem cause={l.cause} size={78} className="drop-shadow-[3px_3px_0_#14110d]" />
          </div>
        </div>

        <div className="px-6 pt-12 pb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div
                className="kicker flex items-center gap-1.5"
                style={{ color: color === "#14110d" ? "#d9381e" : color }}
              >
                <c.icon size={12} /> {c.label} League
              </div>
              <h3 className="font-display mt-1 text-3xl leading-[1.05] font-black">{l.name}</h3>
              <div className="text-ink-2 mt-2 flex items-center gap-1.5 font-mono text-xs">
                <MapPin size={12} /> {l.hood} · est. {l.founded}
              </div>
            </div>
            <div className="shrink-0 text-center">
              <div className="border-ink bg-mustard font-display grid h-14 w-14 place-items-center rounded-full border-2 text-2xl font-black">
                {rank}
              </div>
              <div className="kicker text-ink-3 mt-1">Rank</div>
            </div>
          </div>

          <p className="border-ink font-display text-ink-2 mt-4 border-l-4 pl-4 text-xl italic">“{l.motto}”</p>

          {/* tier ring + sparkline */}
          <div className="border-ink mt-6 flex items-center gap-6 border-y-2 py-5">
            <div className="relative h-28 w-28 shrink-0">
              <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
                <circle cx="55" cy="55" r={r} fill="none" stroke="#ddd1b5" strokeWidth="10" />
                <circle
                  cx="55"
                  cy="55"
                  r={r}
                  fill="none"
                  stroke={tier.color}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - pct)}
                  style={{ animation: "ring-fill 1.4s cubic-bezier(.2,.7,.2,1) both" }}
                />
              </svg>
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <Trophy size={18} className="mx-auto" style={{ color: tier.color }} fill="currentColor" />
                  <div className="font-sans text-[10px] font-extrabold tracking-wider uppercase">{tier.name}</div>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Sparkles size={15} className="text-vermilion" fill="#d9381e" />
                <span className="font-display text-4xl leading-none font-black">{fmt(l.points)}</span>
              </div>
              <Sparkline data={l.trend} color={color} w={200} h={40} className="mt-2 w-full" />
              {next && (
                <div className="text-ink-3 mt-1.5 font-mono text-[10px]">
                  {fmt(next.at - l.points)} to {next.name}
                </div>
              )}
            </div>
          </div>

          {/* stats */}
          <div className="grid grid-cols-4 gap-2 py-5">
            {[
              { i: Users, v: fmt(l.members), t: "Members" },
              { i: CalendarCheck, v: l.projects, t: "Projects" },
              { i: Hourglass, v: `${(l.hours / 1000).toFixed(1)}k`, t: "Hours" },
              { i: Flame, v: l.streak, t: "Week streak" },
            ].map((s) => (
              <div
                key={s.t}
                title={s.t}
                className="group border-ink bg-paper-2/50 flex flex-col items-center gap-1 border-2 py-3 transition-transform duration-300 hover:-translate-y-1"
              >
                <s.i size={18} className={s.t === "Week streak" ? "text-vermilion" : ""} />
                <span className="font-display text-xl leading-none font-black">{s.v}</span>
                <span className="kicker text-ink-3 text-[8px]">{s.t}</span>
              </div>
            ))}
          </div>

          {/* shifts */}
          {shifts.length > 0 && (
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <Clock size={14} />
                <span className="kicker">Upcoming shifts</span>
                <span className="bg-ink h-px flex-1" />
              </div>
              {shifts.map((s) => {
                const meSigned = isSignedUp(me, s.id);
                const filled = s.filled;
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s)}
                    className="group border-ink/30 hover:bg-paper-2 flex w-full items-center gap-3 border-b py-2.5 text-left transition-colors"
                  >
                    <span
                      className="font-mono text-sm font-semibold"
                      style={{ color: color === "#14110d" ? undefined : color }}
                    >
                      {s.time}
                    </span>
                    <span className="font-display flex-1 text-base font-bold">{s.title}</span>
                    <span className="flex gap-[3px]">
                      {Array.from({ length: Math.min(s.spots, 8) }).map((_, i) => (
                        <span
                          key={i}
                          className="border-ink h-2 w-2 rounded-full border"
                          style={{
                            background:
                              i < Math.round((Math.min(filled, s.spots) / s.spots) * Math.min(s.spots, 8))
                                ? color
                                : "transparent",
                          }}
                        />
                      ))}
                    </span>
                    <span
                      className={`border-ink grid h-6 w-6 place-items-center rounded-full border-2 text-[10px] font-black ${meSigned ? "bg-ink text-paper" : "bg-mustard"}`}
                    >
                      {meSigned ? "✓" : "+"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {wins.length > 0 && (
            <div className="bg-ink text-paper mb-6 flex items-center gap-3 p-3">
              <Sparkles size={18} className="text-mustard" />
              <span className="font-display flex-1 text-sm leading-snug italic">{wins[0].title}</span>
              <span className="text-mustard font-mono text-sm font-semibold">+{wins[0].jp}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <JoinButton id={l.id} className="flex-1 justify-center" />
            <Link
              to={`/leagues/${l.id}`}
              onClick={() => setOpenLeague(null)}
              className="btn-press border-ink bg-paper flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-sans text-xs font-extrabold tracking-wider uppercase"
            >
              <ExternalLink size={14} /> Full page
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
