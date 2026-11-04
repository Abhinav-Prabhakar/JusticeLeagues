import { CalendarCheck, Hourglass, Sparkles, TrendingUp, Users } from "lucide-react";
import { CAUSES, fmt } from "../../data";
import { Photo, SectionHead } from "../../ui";
import { useLeagueContext } from "./context";

export default function LeagueImpact() {
  const { league: l, edition } = useLeagueContext();
  const c = CAUSES[l.cause];
  const color = c.color === "#14110d" ? "#4a4338" : c.color;
  const wins = edition.wins.filter((win) => win.league === l.id);
  const total = l.points || 1;
  const peak = Math.max(...l.chapters.map((chapter) => chapter.points), 1);
  const hours = l.hours;

  return (
    <div className="space-y-10">
      <SectionHead
        kicker="The record"
        title={
          <>
            What the league has <em>done</em>
          </>
        }
        right={
          <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
            <TrendingUp size={13} /> {l.delta > 0 ? `+${l.delta}` : l.delta} this month
          </span>
        }
      />

      <div className="border-ink grid grid-cols-2 border-y-2 md:grid-cols-4">
        {[
          { icon: CalendarCheck, value: l.projects, label: "Projects delivered", tone: "#d9381e" },
          { icon: Hourglass, value: `${(hours / 1000).toFixed(1)}k`, label: "Hours given", tone: "#2347c5" },
          { icon: Users, value: fmt(l.members), label: "Members", tone: color },
          { icon: Sparkles, value: fmt(l.points), label: "Justice Points", tone: "#1b7f5c" },
        ].map((stat, index) => (
          <div
            key={stat.label}
            className={`flex items-center gap-3 px-1 py-4 md:px-3 ${index > 0 ? "border-ink border-l" : ""}`}
          >
            <span
              className="text-paper grid h-10 w-10 shrink-0 place-items-center rounded-full"
              style={{ background: stat.tone }}
            >
              <stat.icon size={17} />
            </span>
            <div>
              <div className="font-display text-2xl leading-none font-black">{stat.value}</div>
              <div className="kicker text-ink-3 mt-1 text-[9px]">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <section>
        <SectionHead
          kicker="Where the points live"
          title={
            <>
              Chapter by <em>chapter</em>
            </>
          }
        />
        <div className="space-y-4">
          {l.chapters.map((chapter, index) => {
            const share = Math.round((chapter.points / total) * 100);
            return (
              <div key={chapter.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="font-display flex items-baseline gap-2 text-base font-bold">
                    {chapter.hood}
                    {index === 0 && <span className="kicker text-forest text-[8px]">Founding</span>}
                  </span>
                  <span className="text-ink-2 font-mono text-[10px]">
                    {fmt(chapter.points)} JP · {share}%
                  </span>
                </div>
                <div className="bg-paper-3 border-ink/30 h-3 overflow-hidden border">
                  <div
                    className="h-full transition-[width] duration-700"
                    style={{ width: `${Math.max((chapter.points / peak) * 100, 2)}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-ink-3 mt-4 font-mono text-[10px]">
          Bars are scaled to the largest chapter. Totals always add up to {fmt(l.points)} JP.
        </p>
      </section>

      {wins.length > 0 && (
        <section>
          <SectionHead
            kicker="On the record"
            title={
              <>
                Recent <em>wins</em>
              </>
            }
            right={
              <span className="text-ink-3 font-mono text-[11px]">
                {wins.length} filed{edition.wins.length > wins.length ? ` · ${edition.wins.length} citywide` : ""}
              </span>
            }
          />
          <div className="grid gap-5 md:grid-cols-2">
            {wins.map((win) => (
              <article key={win.id} className="hover-color group border-ink flex flex-col border-2">
                <Photo id={win.photo} w={640} h={360} alt="" className="border-ink aspect-[16/9] w-full border-b-2" />
                <div className="flex flex-1 flex-col p-4">
                  <div className="kicker text-vermilion flex items-center gap-1.5">
                    <Sparkles size={11} /> +{win.jp} JP
                  </div>
                  <h3 className="font-display mt-1 text-lg leading-tight font-bold">{win.title}</h3>
                  <div className="text-ink-2 mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 font-mono text-[10px]">
                    <span>{win.facts.people} people</span>
                    <span>{win.facts.hours} hours</span>
                    <span className="font-semibold">{win.facts.amount}</span>
                    <span className="text-ink-3 ml-auto">{win.when}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {wins.length === 0 && (
        <div className="border-ink/40 border-2 border-dashed py-10 text-center">
          <p className="font-display text-ink-3 text-lg italic">No wins filed yet. The first one is the hardest.</p>
        </div>
      )}
    </div>
  );
}
