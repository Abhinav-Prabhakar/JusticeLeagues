import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Compass, MapPin, Search, Crosshair, Sparkles, Users, X } from "lucide-react";
import { CAUSES, fmt, type Cause } from "../data";
import { HOOD_COORDS, distanceKm, formatDistance, parseLatLng } from "../data/geo";
import { useSearch } from "../lib/queries";
import { Emblem, Photo, SectionHead } from "../ui";
import { JoinButton } from "../components/JoinButton";
import { AtlasMap } from "../components/AtlasMap";
import { usePageTitle } from "../lib/usePageTitle";
import { cn } from "../utils/cn";

const CAUSE_KEYS: (Cause | "all")[] = ["all", ...(Object.keys(CAUSES) as Cause[])];
const RADIUS_OPTIONS = [1, 2, 5, 10, 25];

/** Keep typing responsive while the server sees one query per pause. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function causeFrom(value: string | null): Cause | "all" {
  return value && value in CAUSES ? (value as Cause) : "all";
}

function radiusFrom(value: string | null, hasOrigin: boolean): number | null {
  if (value === "any") return null;
  if (value !== null) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return hasOrigin ? 5 : null;
}

export default function Leagues() {
  usePageTitle("The Atlas — every League, citywide and local");
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const q = params.get("q") ?? "";
  const cause = causeFrom(params.get("cause"));
  const near = parseLatLng(params.get("near"));
  const radiusKm = radiusFrom(params.get("radius"), Boolean(near));

  const [hover, setHover] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [geoState, setGeoState] = useState<"idle" | "locating" | "blocked" | "unsupported">("idle");

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === "") next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Typing updates the URL immediately; the query waits for a pause.
  const debouncedQ = useDebounced(q, 300);

  const { data, isPending, isFetching } = useSearch({
    q: debouncedQ,
    cause,
    lat: near?.lat ?? null,
    lng: near?.lng ?? null,
    radiusKm,
    limit: 30,
  });

  const results = data?.results ?? [];
  const total = data?.total ?? results.length;

  const nearHood = useMemo(() => {
    if (!near) return null;
    return Object.entries(HOOD_COORDS).find(([, coords]) => distanceKm(coords, near) < 0.08)?.[0] ?? null;
  }, [near]);

  function locate() {
    if (!("geolocation" in navigator)) {
      setGeoState("unsupported");
      return;
    }
    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoState("idle");
        update({
          near: `${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}`,
          radius: radiusKm === null ? "5" : String(radiusKm),
        });
      },
      () => setGeoState("blocked"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600_000 },
    );
  }

  function pickHood(hood: string) {
    const coords = HOOD_COORDS[hood];
    if (!coords) return;
    setGeoState("idle");
    update({ near: `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`, radius: String(radiusKm ?? 5) });
  }

  const emptyLabel = q
    ? `Nothing matches “${q}”${cause !== "all" ? ` in ${CAUSES[cause].label}` : ""}.`
    : near
      ? "No league inside this radius."
      : "No league on the map yet.";

  return (
    <div className="space-y-10 pt-8 pb-10 md:pt-10">
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
              {isPending ? "Reading the map…" : `${fmt(total)} ${total === 1 ? "league" : "leagues"} found`}
            </span>
          }
        />

        <p className="text-ink-2 mb-6 max-w-2xl font-serif text-lg">
          A League belongs to the whole city. Its work happens in neighbourhood chapters — search by name, cause, or the
          streets you can walk to, then show up for the shifts it posts.
        </p>

        <div className="border-ink bg-paper-2 mb-6 border-2 shadow-[4px_4px_0_#14110d]">
          <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:p-4">
            <label className="block">
              <span className="kicker text-ink-3 mb-1.5 block text-[9px]">Search the atlas</span>
              <span className="relative block">
                <Search size={16} className="text-ink-3 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
                <input
                  type="search"
                  value={q}
                  onChange={(event) => update({ q: event.target.value || null })}
                  placeholder="Harbor, Marrow Street, food…"
                  aria-label="Search leagues by name, neighbourhood, cause, or motto"
                  className="border-ink bg-paper w-full border-2 py-2.5 pr-9 pl-9 font-serif text-base outline-none focus:shadow-[3px_3px_0_#14110d]"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => update({ q: null })}
                    aria-label="Clear search"
                    className="text-ink-3 hover:text-vermilion absolute top-1/2 right-2 -translate-y-1/2 p-1.5"
                  >
                    <X size={14} />
                  </button>
                )}
              </span>
            </label>

            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={locate}
                disabled={geoState === "locating"}
                className="border-ink bg-mustard hover:bg-paper inline-flex items-center gap-2 border-2 px-3 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase shadow-[2px_2px_0_#14110d] transition-colors disabled:opacity-60"
              >
                <Crosshair size={14} />
                {geoState === "locating" ? "Finding you…" : "Near me"}
              </button>
              <label className="block">
                <span className="kicker text-ink-3 mb-1.5 block text-[9px]">Or a neighbourhood</span>
                <select
                  aria-label="Pick a neighbourhood to search near"
                  value={nearHood ?? ""}
                  onChange={(event) => event.target.value && pickHood(event.target.value)}
                  className="border-ink bg-paper min-w-44 border-2 px-2.5 py-2.5 font-mono text-[11px]"
                >
                  <option value="">Pick a place…</option>
                  {Object.keys(HOOD_COORDS)
                    .sort()
                    .map((hood) => (
                      <option key={hood} value={hood}>
                        {hood}
                      </option>
                    ))}
                </select>
              </label>
              {near && (
                <label className="block">
                  <span className="kicker text-ink-3 mb-1.5 block text-[9px]">Distance</span>
                  <select
                    aria-label="Search radius"
                    value={radiusKm === null ? "any" : String(radiusKm)}
                    onChange={(event) => update({ radius: event.target.value })}
                    className="border-ink bg-paper border-2 px-2.5 py-2.5 font-mono text-[11px]"
                  >
                    {RADIUS_OPTIONS.map((km) => (
                      <option key={km} value={String(km)}>
                        Within {km} km
                      </option>
                    ))}
                    <option value="any">Anywhere in the city</option>
                  </select>
                </label>
              )}
            </div>
          </div>

          <div className="border-ink/20 flex flex-wrap items-center gap-1.5 border-t px-3 py-2.5 md:px-4">
            <span className="kicker text-ink-3 mr-1 text-[9px]">Cause</span>
            {CAUSE_KEYS.map((key) => {
              const label = key === "all" ? "All" : CAUSES[key].label;
              const active = cause === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ cause: key === "all" ? null : key })}
                  className={cn(
                    "border-ink rounded-full border px-2.5 py-1 font-sans text-[9px] font-extrabold tracking-wider uppercase transition-colors",
                    active ? "bg-ink text-paper" : "bg-paper text-ink-2 hover:bg-paper-3",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {(near || geoState === "blocked" || geoState === "unsupported") && (
            <div className="border-ink/20 flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 font-mono text-[10px] md:px-4">
              {near && (
                <>
                  <span className="flex items-center gap-1">
                    <MapPin size={11} /> Near {nearHood ?? `${near.lat.toFixed(4)}, ${near.lng.toFixed(4)}`}
                  </span>
                  <span className="text-ink-3">{radiusKm === null ? "any distance" : `within ${radiusKm} km`}</span>
                  <button
                    type="button"
                    onClick={() => update({ near: null, radius: null })}
                    className="hover:text-vermilion underline underline-offset-2"
                  >
                    Use the whole city
                  </button>
                </>
              )}
              {geoState === "blocked" && (
                <span className="text-vermilion">Location was blocked — pick a place above.</span>
              )}
              {geoState === "unsupported" && (
                <span className="text-vermilion">This browser has no location — pick a place above.</span>
              )}
            </div>
          )}
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <figure>
            <AtlasMap
              leagues={results}
              cause={cause}
              hover={hover}
              onHover={setHover}
              onOpen={(id) => navigate(`/leagues/${id}`)}
              emptyLabel={isPending ? "Reading the atlas…" : emptyLabel}
            />
            <figcaption className="text-ink-3 mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <MapPin size={12} />
              Fig. 1 — {fmt(results.length)} of {fmt(total)} leagues plotted
              {isFetching && !isPending ? " · updating" : ""}
            </figcaption>
          </figure>

          <div className="border-ink bg-paper border-2 p-4">
            <h2 className="font-display text-2xl leading-tight font-black">
              {q ? (
                <>
                  Searching for <em>“{q}”</em>
                </>
              ) : (
                <>
                  Every <em>League</em>
                </>
              )}
            </h2>
            <p className="text-ink-2 mt-2 font-serif text-sm">
              {q
                ? "Names, neighbourhoods, causes and mottos all count. Results rank by match, then by how close they are."
                : near
                  ? "No query yet, so the atlas lists leagues nearest you first."
                  : "The whole city, ranked by Justice Points. Add a place to sort by walking distance."}
            </p>
            <dl className="border-ink/30 mt-4 grid grid-cols-2 gap-3 border-t pt-3 font-mono text-[10px]">
              <div>
                <dt className="text-ink-3">Leagues</dt>
                <dd className="font-display text-xl font-black">{fmt(total)}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Cause</dt>
                <dd className="font-display text-xl font-black">{cause === "all" ? "Every" : CAUSES[cause].label}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
              className="kicker mt-5 inline-block underline underline-offset-4"
            >
              {copied ? "Link copied" : "Share this view"}
            </button>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((l) => {
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
                      <div className="text-ink-2 mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px]">
                        <span className="flex items-center gap-1">
                          <MapPin size={10} /> {l.hood} chapter
                        </span>
                        {l.distanceKm !== null && (
                          <span className="bg-mustard/40 border-ink/30 rounded-full border px-1.5 py-0.5">
                            {formatDistance(l.distanceKm)} away
                          </span>
                        )}
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

        {results.length === 0 && !isPending && (
          <div className="border-ink/40 grid place-items-center gap-3 border-2 border-dashed py-16 text-center">
            <Compass size={34} className="text-ink-3" />
            <p className="font-display text-ink-3 text-xl italic">{emptyLabel}</p>
            <button
              type="button"
              onClick={() => update({ q: null, cause: null, near: null, radius: null })}
              className="kicker underline underline-offset-4"
            >
              Reset the atlas
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
