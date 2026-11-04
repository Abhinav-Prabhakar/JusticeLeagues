import { useMemo, useState } from "react";
import { Compass, MapPin, Users } from "lucide-react";
import { CAUSES, fmt } from "../data";
import { useEdition } from "../lib/queries";
import { Emblem, Photo, SectionHead } from "../ui";
import { useApp } from "../ctx";
import { cn } from "../utils/cn";
import { JoinButton } from "./JoinButton";
import { AtlasMap } from "./AtlasMap";

export function Atlas() {
  const { cause, setOpenLeague } = useApp();
  const { data } = useEdition();
  const leagues = data.leagues;
  const [hover, setHover] = useState<string | null>(null);

  const list = useMemo(
    () =>
      leagues
        .filter((l) => cause === "all" || l.cause === cause)
        .sort((a, b) => Number(b.recruiting) - Number(a.recruiting) || b.points - a.points)
        .slice(0, 5),
    [cause, leagues],
  );
  const visible = useMemo(
    () => leagues.filter((l) => cause === "all" || l.cause === cause),
    [cause, leagues],
  );

  return (
    <section id="atlas">
      <SectionHead
        kicker="Leagues near you"
        title={
          <>
            The <em>Atlas</em>
          </>
        }
        icon={<Compass size={40} className="text-cobalt" strokeWidth={1.8} />}
        right={
          <div className="text-ink-2 flex items-center gap-2 font-mono text-[11px]">
            <span className="border-ink grid h-5 w-5 place-items-center rounded-full border-2">
              <span className="bg-ink h-1.5 w-1.5 rounded-full" />
            </span>
            Bigger pin, more points
          </div>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <figure>
          <AtlasMap
            leagues={visible}
            cause={cause}
            hover={hover}
            onHover={setHover}
            onOpen={setOpenLeague}
            emptyLabel="No league on the map in this section yet."
          />
          <figcaption className="text-ink-3 mt-3 flex items-center gap-2 font-mono text-[11px]">
            <MapPin size={12} /> Fig. 1 — Active leagues across the metro
          </figcaption>
        </figure>

        <div>
          <ul key={cause}>
            {list.map((l, i) => {
              const c = CAUSES[l.cause];
              const on = hover === l.id;
              return (
                <li
                  key={l.id}
                  onMouseEnter={() => setHover(l.id)}
                  onMouseLeave={() => setHover(null)}
                  className={cn(
                    "hover-color animate-rise group border-ink/50 relative flex items-center gap-4 border-b py-3 pr-1 pl-2 transition-all duration-300 first:pt-0 focus-within:translate-x-2",
                    on && "translate-x-2",
                  )}
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <button
                    onClick={() => setOpenLeague(l.id)}
                    aria-label={`Open ${l.name}`}
                    className="absolute inset-0 z-0 rounded-sm focus-visible:outline-offset-[-3px]"
                  />
                  <span
                    className="pointer-events-none absolute inset-y-2 -left-2 z-10 w-1 origin-top scale-y-0 transition-transform duration-300 group-focus-within:scale-y-100 group-hover:scale-y-100"
                    style={{ background: c.color }}
                  />
                  <Photo
                    id={l.photo}
                    w={160}
                    h={160}
                    className="border-ink pointer-events-none relative z-10 h-16 w-16 shrink-0 border-2"
                  />
                  <div className="pointer-events-none relative z-10 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Emblem cause={l.cause} size={18} />
                      <h4 className="font-display truncate text-lg leading-tight font-bold">{l.name}</h4>
                    </div>
                    <div className="text-ink-2 mt-1 flex items-center gap-3 font-mono text-[11px]">
                      <span className="flex items-center gap-1">
                        <MapPin size={11} /> {l.hood}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={11} /> {fmt(l.members)}
                      </span>
                    </div>
                    <div className="font-display text-ink-3 max-h-0 overflow-hidden text-sm italic opacity-0 transition-all duration-500 group-focus-within:mt-1 group-focus-within:max-h-6 group-focus-within:opacity-100 group-hover:mt-1 group-hover:max-h-6 group-hover:opacity-100">
                      “{l.motto}”
                    </div>
                  </div>
                  <div className="relative z-20">
                    {l.recruiting ? (
                      <JoinButton id={l.id} variant="round" />
                    ) : (
                      <span className="kicker border-ink/50 text-ink-3 rounded-full border px-2 py-1">Full</span>
                    )}
                  </div>
                </li>
              );
            })}
            {list.length === 0 && (
              <li className="font-display text-ink-3 py-8 text-center text-lg italic">No leagues here yet.</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
