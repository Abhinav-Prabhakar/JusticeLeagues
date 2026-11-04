import { Hourglass, Flag, Network, HeartHandshake, TrendingUp } from "lucide-react";
import { CountUp, Sparkline, useInView } from "../ui";

const STATS = [
  {
    icon: Hourglass,
    value: 182440,
    label: "Volunteer hours",
    color: "#d9381e",
    delta: "+12%",
    data: [8, 10, 9, 13, 15, 14, 19, 22, 21, 27, 31, 36],
  },
  {
    icon: Flag,
    value: 3912,
    label: "Projects completed",
    color: "#2347c5",
    delta: "+8%",
    data: [14, 13, 17, 16, 20, 24, 23, 26, 30, 29, 33, 38],
  },
  {
    icon: Network,
    value: 1208,
    label: "Active leagues",
    color: "#1b7f5c",
    delta: "+21%",
    data: [5, 6, 8, 8, 11, 13, 16, 18, 21, 25, 29, 34],
  },
  {
    icon: HeartHandshake,
    value: 64300,
    label: "Neighbours engaged",
    color: "#7a3fb0",
    delta: "+15%",
    data: [9, 11, 10, 14, 17, 18, 21, 20, 26, 29, 32, 37],
  },
];

export function Numbers() {
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  return (
    <section ref={ref} className="border-ink border-y-4 border-double">
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {STATS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="group border-ink hover:bg-paper-2/70 relative flex flex-col gap-3 overflow-hidden px-4 py-6 transition-colors duration-500 md:px-6 lg:[&:not(:first-child)]:border-l [&:nth-child(2n)]:border-l"
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-paper grid h-12 w-12 place-items-center rounded-full transition-all duration-500 group-hover:scale-110 group-hover:rotate-[-8deg]"
                  style={{ background: s.color }}
                >
                  <Icon size={22} />
                </span>
                <span
                  className="flex translate-x-3 items-center gap-1 rounded-full px-2 py-1 font-mono text-[11px] font-semibold opacity-0 transition-all duration-500 group-hover:translate-x-0 group-hover:opacity-100"
                  style={{ background: `${s.color}22`, color: s.color }}
                >
                  <TrendingUp size={12} /> {s.delta}
                </span>
              </div>
              <div className="font-display text-[clamp(2.4rem,5vw,4.2rem)] leading-none font-black tracking-tight">
                <CountUp value={s.value} run={seen} />
              </div>
              <div className="flex items-end justify-between gap-2">
                <span className="kicker text-ink-3">{s.label}</span>
                <Sparkline
                  data={s.data}
                  color={s.color}
                  w={86}
                  h={26}
                  play={seen}
                  stroke={2}
                  fill={false}
                  className="opacity-60 transition-opacity duration-300 group-hover:opacity-100"
                />
              </div>
              <span
                className="absolute bottom-0 left-0 h-1 w-0 transition-all duration-700 group-hover:w-full"
                style={{ background: s.color, transitionDelay: `${i * 0}ms` }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
