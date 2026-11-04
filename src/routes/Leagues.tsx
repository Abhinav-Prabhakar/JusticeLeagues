import { Link } from "react-router-dom";
import { Compass, MapPin, Sparkles, Users } from "lucide-react";
import { CAUSES, fmt } from "../data";
import { useApp } from "../ctx";
import { useEdition } from "../lib/queries";
import { Emblem, Photo, SectionHead } from "../ui";
import { JoinButton } from "../components/JoinButton";
import { usePageTitle } from "../lib/usePageTitle";

export default function Leagues() {
  usePageTitle("The Atlas — every League, citywide and local");
  const { cause } = useApp();
  const { data } = useEdition();

  const list = data.leagues.filter((l) => cause === "all" || l.cause === cause).sort((a, b) => b.points - a.points);

  return (
    <div className="space-y-16 pt-8 pb-10 md:pt-10">
      <h1 className="sr-only">The Atlas — every Justice League, citywide and local</h1>
      <section>
        <SectionHead
          kicker="Citywide leagues, neighbourhood chapters"
          title={
            <>
              The <em>Atlas</em>
            </>
          }
          icon={<Compass size={40} className="text-cobalt" strokeWidth={1.8} />}
          right={
            <span className="text-ink-3 font-mono text-[11px]">
              {fmt(list.length)} {list.length === 1 ? "league" : "leagues"} in this edition
            </span>
          }
        />

        <p className="text-ink-2 mb-6 max-w-2xl font-serif text-lg">
          A League belongs to the whole city. Its work happens in neighbourhood chapters — pick the cell nearest you,
          then show up for the shifts it posts.
        </p>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((l) => {
            const c = CAUSES[l.cause];
            const Icon = c.icon;
            return (
              <article
                key={l.id}
                className="group border-ink bg-paper relative flex flex-col border-2 p-4 transition-shadow duration-300 focus-within:shadow-[5px_5px_0_#14110d] hover:shadow-[5px_5px_0_#14110d]"
              >
                <Link
                  to={`/leagues/${l.id}`}
                  className="absolute inset-0 z-0 rounded-sm focus-visible:outline-offset-4"
                  aria-label={`Open ${l.name}`}
                />
                <div className="pointer-events-none relative z-10">
                  <Photo id={l.photo} w={520} h={300} alt="" className="border-ink aspect-[16/9] w-full border-2" />
                  <div className="mt-3 flex items-start gap-2">
                    <Emblem cause={l.cause} size={28} className="mt-0.5" />
                    <div className="min-w-0">
                      <h2 className="font-display text-xl leading-tight font-bold">{l.name}</h2>
                      <div className="text-ink-2 mt-1 flex items-center gap-2 font-mono text-[10px]">
                        <span className="flex items-center gap-1">
                          <MapPin size={10} /> {l.hood} chapter
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="font-display text-ink-3 mt-2 text-sm italic">“{l.motto}”</p>
                  <div className="border-ink/30 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 font-mono text-[11px] font-semibold">
                    <span className="flex items-center gap-1" title="Justice Points">
                      <Sparkles size={11} className="text-vermilion" /> {fmt(l.points)}
                    </span>
                    <span className="flex items-center gap-1" title="Members">
                      <Users size={11} /> {fmt(l.members)}
                    </span>
                    <span
                      className="ml-auto rounded-full px-2 py-0.5 font-sans text-[9px] font-extrabold tracking-wider uppercase"
                      style={{ background: `${c.color}1f`, color: c.color === "#14110d" ? "#4a4338" : c.color }}
                    >
                      <Icon size={9} className="mr-1 inline" />
                      {c.label}
                    </span>
                  </div>
                </div>
                <div className="relative z-10 mt-4 flex justify-end">
                  <JoinButton id={l.id} />
                </div>
              </article>
            );
          })}
        </div>

        {list.length === 0 && (
          <div className="border-ink/40 grid place-items-center gap-3 border-2 border-dashed py-16 text-center">
            <Compass size={34} className="text-ink-3" />
            <p className="font-display text-ink-3 text-xl italic">No leagues in this section yet.</p>
            <Link to="/leagues" className="kicker underline underline-offset-4">
              Show every league
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
