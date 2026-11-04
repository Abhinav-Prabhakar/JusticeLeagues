import { useState } from "react";
import { BarChart3, Lightbulb, Route, TreePine, Utensils, Recycle, type LucideIcon } from "lucide-react";
import { CHART_GROUPS, MONTHS, MONTH_NAMES, fmt } from "../data";
import { CountUp, SectionHead, useInView } from "../ui";
import { cn } from "../utils/cn";

const ROWS: {
  icon: LucideIcon;
  label: string;
  total: number;
  per: number;
  unit: string;
  color: string;
  filled: number;
}[] = [
  { icon: TreePine, label: "Trees planted", total: 9400, per: 500, unit: "trees", color: "#1b7f5c", filled: 19 },
  { icon: Utensils, label: "Meals served", total: 412000, per: 20000, unit: "meals", color: "#e8a200", filled: 21 },
  { icon: Lightbulb, label: "Streetlights fixed", total: 1360, per: 80, unit: "lights", color: "#2347c5", filled: 17 },
  { icon: Recycle, label: "Tons of waste", total: 228, per: 12, unit: "tons", color: "#0f8b9d", filled: 19 },
  { icon: Route, label: "Km of safe lanes", total: 38, per: 2, unit: "km", color: "#d9381e", filled: 15 },
];
const GOAL = 24;

function Pictograms() {
  const [ref, seen] = useInView<HTMLDivElement>(0.2);
  return (
    <div ref={ref} className="space-y-1">
      {ROWS.map((r, ri) => {
        const Icon = r.icon;
        return (
          <div
            key={r.label}
            className="group border-ink/30 relative flex items-center gap-4 border-b py-3 last:border-b-0"
          >
            <span
              className="text-paper grid h-12 w-12 shrink-0 place-items-center rounded-full transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6"
              style={{ background: r.color }}
              title={r.label}
            >
              <Icon size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-x-[5px] gap-y-1">
                {Array.from({ length: GOAL }).map((_, i) => {
                  const on = i < r.filled;
                  return (
                    <Icon
                      key={i}
                      size={20}
                      strokeWidth={on ? 2.2 : 1.5}
                      className={seen ? "animate-pop" : "opacity-0"}
                      style={{
                        color: on ? r.color : "#c9bd9f",
                        animationDelay: `${ri * 120 + i * 28}ms`,
                        transition: "transform .25s",
                      }}
                    />
                  );
                })}
              </div>
              <div className="text-ink-3 max-h-0 overflow-hidden font-mono text-[11px] opacity-0 transition-all duration-300 group-hover:mt-1.5 group-hover:max-h-5 group-hover:opacity-100">
                1 icon = {fmt(r.per)} {r.unit} · goal {fmt(r.per * GOAL)}
              </div>
            </div>
            <div className="font-display w-20 shrink-0 text-right text-2xl leading-none font-black md:w-24 md:text-3xl">
              <CountUp value={r.total} run={seen} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Chart() {
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  const [hover, setHover] = useState<number | null>(null);
  const totals = MONTHS.map((_, i) => CHART_GROUPS.reduce((a, g) => a + g.values[i], 0));
  const max = Math.max(...totals);
  const H = 220;

  return (
    <div ref={ref}>
      <div className="border-ink relative flex items-end gap-1.5 border-b-2 md:gap-2" style={{ height: H }}>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <div
            key={g}
            className="border-ink/20 absolute inset-x-0 border-t border-dashed"
            style={{ bottom: `${g * 100}%` }}
          />
        ))}
        {MONTHS.map((_, i) => {
          const on = hover === i;
          return (
            <div
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="relative flex h-full flex-1 flex-col-reverse"
            >
              <div
                className={cn(
                  "flex w-full flex-col-reverse transition-all duration-300",
                  hover !== null && !on && "opacity-30",
                )}
                style={{ height: `${(totals[i] / max) * 100}%` }}
              >
                {seen && (
                  <div
                    className="animate-grow-y border-ink flex h-full w-full flex-col-reverse border-2 border-b-0"
                    style={{
                      animationDelay: `${i * 60}ms`,
                      scale: on ? "1.14 1" : "1 1",
                      transition: "scale .25s ease",
                    }}
                  >
                    {CHART_GROUPS.map((g) => (
                      <div key={g.key} style={{ height: `${(g.values[i] / totals[i]) * 100}%`, background: g.color }} />
                    ))}
                  </div>
                )}
              </div>
              <div
                className={cn(
                  "border-ink bg-paper pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-32 -translate-x-1/2 border-2 p-2 shadow-[3px_3px_0_#14110d] transition-all duration-200",
                  on ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
                )}
                style={{ bottom: `${(totals[i] / max) * 100}%` }}
              >
                <div className="font-mono text-[11px] font-semibold">
                  {MONTH_NAMES[i]} · {totals[i]}k JP
                </div>
                {CHART_GROUPS.map((g) => (
                  <div key={g.key} className="mt-1 flex items-center gap-1.5 font-mono text-[10px]">
                    <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
                    <span className="flex-1">{g.key}</span>
                    {g.values[i]}k
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 md:gap-2">
        {MONTHS.map((m, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 text-center font-mono text-[11px] transition-colors",
              hover === i ? "text-vermilion font-semibold" : "text-ink-3",
            )}
          >
            {m}
          </span>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-4">
        {CHART_GROUPS.map((g) => (
          <span
            key={g.key}
            className="flex items-center gap-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase"
          >
            <span className="border-ink h-3 w-3 rounded-full border" style={{ background: g.color }} />
            {g.key}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Ledger() {
  return (
    <section id="ledger">
      <SectionHead
        kicker="Collective impact"
        title={
          <>
            The <em>Ledger</em>
          </>
        }
        icon={<BarChart3 size={40} className="text-forest" strokeWidth={1.8} />}
        right={<span className="text-ink-3 font-mono text-[11px]">Year to date · all leagues</span>}
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          <Pictograms />
        </div>
        <div className="lg:border-ink lg:border-l lg:pl-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="font-display text-2xl font-bold italic">Justice Points, by month</h3>
          </div>
          <Chart />
        </div>
      </div>
    </section>
  );
}
