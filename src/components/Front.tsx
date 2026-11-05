import {
  Camera,
  Clock,
  Crown,
  LayoutDashboard,
  Sparkles,
  Trash2,
  Users,
  CalendarCheck,
  Hourglass,
  Package,
} from "lucide-react";
import { CAUSES, fmt } from "../data";
import { AvatarStack, CountUp, Emblem, Photo, Reveal, useInView } from "../ui";
import { useApp } from "../ctx";
import { useEdition } from "../lib/queries";
import { JoinButton } from "./JoinButton";

function LeadStat({
  icon,
  value,
  decimals = 0,
  suffix = "",
  label,
  color,
  run,
}: {
  icon: React.ReactNode;
  value: number;
  decimals?: number;
  suffix?: string;
  label: string;
  color: string;
  run: boolean;
}) {
  return (
    <div
      className="group border-ink relative flex items-center gap-3 border-l-2 pl-3 first:border-l-0 first:pl-0"
      title={label}
    >
      <span
        className="text-paper grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-12"
        style={{ background: color }}
      >
        {icon}
      </span>
      <div className="leading-none">
        <div className="font-display text-2xl font-black md:text-3xl">
          <CountUp value={value} decimals={decimals} suffix={suffix} run={run} />
        </div>
        <div className="kicker text-ink-3 mt-1 -mb-1 max-h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:mt-1.5 group-hover:max-h-4 group-hover:opacity-100">
          {label}
        </div>
      </div>
    </div>
  );
}

export function Lead() {
  const { data } = useEdition();
  const l = data.leagues.find((item) => item.id === "harbor") ?? data.leagues[0];
  const { setOpenLeague } = useApp();
  const [ref, seen] = useInView<HTMLElement>(0.25);
  if (!l) return null;
  return (
    <article ref={ref} className="hover-color group">
      <div className="mb-3 flex items-center gap-3">
        <span className="kicker bg-vermilion text-paper flex items-center gap-1.5 px-2.5 py-1.5">
          <Crown size={12} fill="currentColor" /> League of the week
        </span>
        <span className="bg-ink h-px flex-1" />
        <Clock size={14} className="text-ink-3" />
        <span className="text-ink-3 font-mono text-[11px]">3 min</span>
      </div>

      <Photo
        id={l.photo}
        w={1400}
        h={760}
        alt="Volunteers cleaning a riverbank"
        className="border-ink aspect-[16/9] w-full border-2"
      >
        <div className="border-ink bg-mustard font-display absolute top-4 left-4 grid h-16 w-16 -rotate-12 place-items-center rounded-full border-2 text-3xl font-black shadow-[3px_3px_0_#14110d] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6">
          №1
        </div>
        <div className="from-ink/90 to-ink/60 text-paper absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t p-4 transition-transform duration-500 group-hover:translate-y-0">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <Camera size={13} /> {l.hood} · Saturday, 09:40
          </div>
        </div>
      </Photo>

      <div className="mt-5 grid gap-5 md:grid-cols-[1fr]">
        <h2 className="font-display text-[clamp(2rem,4.6vw,3.9rem)] leading-[0.98] font-black tracking-tight text-balance">
          <span className="relative inline-block">
            Harbor Cleanup Coalition
            <span className="bg-mustard/80 absolute -bottom-1 left-0 h-[6px] w-full origin-left scale-x-0 mix-blend-multiply transition-transform duration-700 group-hover:scale-x-100" />
          </span>{" "}
          <em className="text-ink-2 font-bold">hauls 14 tons from the Mill River</em>
        </h2>

        <div className="border-ink flex flex-wrap items-center gap-x-6 gap-y-4 border-y py-4">
          <LeadStat run={seen} icon={<Users size={20} />} value={l.members} label="Members" color="#2347c5" />
          <LeadStat
            run={seen}
            icon={<Trash2 size={20} />}
            value={14.2}
            decimals={1}
            suffix="t"
            label="Waste hauled"
            color="#14694d"
          />
          <LeadStat
            run={seen}
            icon={<CalendarCheck size={20} />}
            value={l.projects}
            label="Projects done"
            color="#b82d19"
          />
          <LeadStat run={seen} icon={<Sparkles size={20} />} value={l.points} label="Justice Points" color="#14110d" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Emblem
              cause={l.cause}
              size={46}
              className="transition-transform duration-500 group-hover:rotate-[360deg]"
            />
            <AvatarStack n={5} size={30} extra={`+${fmt(Math.max(0, l.members - 5))}`} />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpenLeague(l.id)}
              className="btn-press border-ink bg-paper flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-sans text-xs font-extrabold tracking-wider uppercase"
            >
              <LayoutDashboard size={14} /> Peek inside
            </button>
            <JoinButton id={l.id} />
          </div>
        </div>
      </div>
    </article>
  );
}

const FACT_ICON = [Users, Hourglass, Package];

export function Wins() {
  const { setOpenLeague } = useApp();
  const { data } = useEdition();
  const wins = data.wins;
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center gap-3">
        <span className="kicker bg-ink text-paper flex items-center gap-1.5 px-2.5 py-1.5">
          <Sparkles size={12} /> Fresh wins
        </span>
        <span className="bg-ink h-px flex-1" />
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {wins.map((w, i) => {
          const l = data.leagues.find((item) => item.id === w.league);
          if (!l) return null;
          const c = CAUSES[l.cause];
          const f = Object.values(w.facts);
          return (
            <Reveal
              key={w.id}
              delay={i * 120}
              className="border-ink md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:pl-6"
            >
              <article key={w.id} className="hover-color group relative">
                <button
                  onClick={() => setOpenLeague(l.id)}
                  aria-label={`Open ${w.title}`}
                  className="absolute inset-0 z-0 rounded-sm"
                />
                <div className="pointer-events-none relative z-10">
                  <div className="relative">
                    <Photo id={w.photo} w={640} h={420} alt="" className="border-ink aspect-[4/3] w-full border-2">
                      <div className="bg-ink/90 text-paper absolute inset-x-0 bottom-0 translate-y-full p-3 transition-transform duration-500 group-focus-within:translate-y-0 group-hover:translate-y-0">
                        <div className="flex items-center justify-around font-mono text-[11px]">
                          {f.map((v, j) => {
                            const Ic = FACT_ICON[j];
                            return (
                              <span key={j} className="flex items-center gap-1.5">
                                <Ic size={13} className="text-mustard" />
                                {v}
                                {j === 1 && "h"}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </Photo>
                    <div
                      className="border-ink text-paper absolute -top-3 -right-3 grid h-14 w-14 place-items-center rounded-full border-2 font-mono text-sm leading-none font-semibold shadow-[2px_2px_0_#14110d] transition-transform duration-700 group-hover:rotate-[360deg]"
                      style={{ background: c.color === "#14110d" ? "#b82d19" : c.color }}
                    >
                      <span className="text-center">
                        <span className="block text-[9px] opacity-80">JP</span>+{w.jp}
                      </span>
                    </div>
                  </div>
                  <h3 className="font-display mt-3 text-xl leading-tight font-bold text-balance">{w.title}</h3>
                  <div className="text-ink-3 mt-2 flex items-center gap-2">
                    <Emblem cause={l.cause} size={22} />
                    <span className="font-sans text-[11px] font-bold tracking-wide uppercase">{l.hood}</span>
                    <span className="ml-auto font-mono text-[11px]">{w.when}</span>
                  </div>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
      <p className="sr-only">{fmt(wins.length)} wins</p>
    </section>
  );
}
