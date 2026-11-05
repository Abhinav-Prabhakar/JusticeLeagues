import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, BookOpen, Scale, ShieldCheck } from "lucide-react";
import { fmt } from "../data";
import { SectionHead } from "../ui";
import { usePageTitle } from "../lib/usePageTitle";
import { useEdition, usePublicLedger } from "../lib/queries";
import { STATIC_PREVIEW, handleLabel } from "../lib/api";
import { cn } from "../utils/cn";

const PAGE_SIZE = 25;

const TYPE_LABELS: Record<string, string> = {
  all: "Every kind",
  sealed_history: "Imported chapter history",
  league_join: "Charter signings",
  shift_attendance: "Shift attendance",
  project: "Approved projects",
  reversal: "Steward corrections",
  resource: "Resource exchange",
  badge: "Badges",
};

function typeLabel(key: string): string {
  return TYPE_LABELS[key] ?? key.replace(/_/g, " ");
}

function dayStamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function LedgerPage() {
  usePageTitle("The public record — The Justice Leagues");
  const { data: edition } = useEdition();
  const [leagueId, setLeagueId] = useState<string>("");
  const [refType, setRefType] = useState<string>("all");
  const [offset, setOffset] = useState(0);

  const { data, isPending } = usePublicLedger({
    leagueId: leagueId || null,
    refType: refType === "all" ? null : refType,
    limit: PAGE_SIZE,
    offset,
  });

  const types = useMemo(() => {
    const seen = new Set<string>(["all"]);
    for (const entry of data?.entries ?? []) seen.add(entry.refType);
    return [...seen];
  }, [data?.entries]);

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  const reset = (fn: () => void) => {
    setOffset(0);
    fn();
  };

  return (
    <div className="space-y-12 pt-8 pb-10 md:pt-10">
      <h1 className="sr-only">The public record — every Justice Point award</h1>

      <section>
        <SectionHead
          kicker="The public record"
          title={
            <>
              Every Point, <em>on the record</em>
            </>
          }
          icon={<BookOpen size={40} className="text-forest" strokeWidth={1.8} />}
          right={
            <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
              <ShieldCheck size={13} /> Server-authored · append-only
            </span>
          }
        />
        <p className="text-ink-2 max-w-2xl font-serif text-lg">
          Nothing here is minted in a browser. Each line is a ledger row written by the server — a charter signed, a
          shift attended, a project approved, or a correction posted by a steward.
        </p>
        {STATIC_PREVIEW && (
          <p className="border-ink bg-paper-2 mt-4 border-2 border-dashed px-4 py-2.5 font-mono text-[10px]">
            Static edition: this is the printed record. Run the paper locally for the live ledger.
          </p>
        )}
      </section>

      <section className="border-ink grid grid-cols-2 border-y-2 md:grid-cols-4">
        {[
          { label: "Entries on file", value: fmt(total) },
          { label: "Points awarded", value: fmt(data?.totals.awarded ?? 0) },
          { label: "Points reversed", value: fmt(data?.totals.reversed ?? 0) },
          { label: "Net on the books", value: fmt((data?.totals.awarded ?? 0) - (data?.totals.reversed ?? 0)) },
        ].map((stat, index) => (
          <div
            key={stat.label}
            className={cn("px-3 py-4 md:px-4", index > 0 && "border-ink border-l", index === 2 && "max-md:border-l-0")}
          >
            <div className="font-display text-2xl leading-none font-black md:text-3xl">{stat.value}</div>
            <div className="kicker text-ink-3 mt-1 text-[9px]">{stat.label}</div>
          </div>
        ))}
      </section>

      <section aria-labelledby="ledger-filters">
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <h2 id="ledger-filters" className="kicker text-ink-2">
            Filter the record
          </h2>
          <label className="block min-w-0">
            <span className="sr-only">League</span>
            <select
              value={leagueId}
              onChange={(event) => reset(() => setLeagueId(event.target.value))}
              className="border-ink bg-paper max-w-[15rem] border-2 px-2.5 py-1.5 font-sans text-xs"
            >
              <option value="">Every league</option>
              {edition.leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Entry kind</span>
            <select
              value={refType}
              onChange={(event) => reset(() => setRefType(event.target.value))}
              className="border-ink bg-paper border-2 px-2.5 py-1.5 font-sans text-xs"
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <span className="text-ink-3 ml-auto font-mono text-[10px]">
            {total === 0 ? "No entries" : `${from}–${to} of ${fmt(total)}`}
          </span>
        </div>

        {data?.source === "imported" && (
          <p className="border-ink bg-paper-2 mb-4 border-2 border-dashed px-4 py-2.5 font-mono text-[10px]">
            No local awards yet — showing the record sealed into the printed edition. The first local award will push
            these rows aside.
          </p>
        )}

        {isPending ? (
          <div role="status" className="divide-ink/15 border-ink divide-y-2 border-y-2" aria-label="Loading the record">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 py-4">
                <div className="bg-paper-3 h-3 w-20 animate-pulse rounded" />
                <div className="bg-paper-3 h-3 flex-1 animate-pulse rounded" />
                <div className="bg-paper-3 h-3 w-12 animate-pulse rounded" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="border-ink/40 grid place-items-center gap-3 border-2 border-dashed px-6 py-16 text-center">
            <Scale size={30} className="text-ink-3" />
            <p className="font-display text-ink-3 text-xl italic">The page is blank — for now.</p>
            <p className="text-ink-2 max-w-md font-serif text-sm">
              Points appear the moment a steward records them. Join a league, sign the charter, and your first entry
              lands here.
            </p>
            <Link
              to="/leagues"
              className="btn-press border-ink bg-mustard mt-1 rounded-full border-2 px-5 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase"
            >
              Browse the Atlas
            </Link>
          </div>
        ) : (
          <ol className="divide-ink/20 border-ink divide-y-2 border-y-2">
            {entries.map((entry) => {
              const positive = entry.delta >= 0;
              return (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3.5">
                  <span className="text-ink-3 w-24 shrink-0 font-mono text-[10px] tracking-wider uppercase tabular-nums">
                    {dayStamp(entry.createdAt)}
                  </span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums",
                      positive ? "bg-forest/10 text-forest" : "bg-vermilion/10 text-vermilion",
                    )}
                  >
                    {positive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                    {positive ? "+" : ""}
                    {fmt(entry.delta)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-ink font-serif text-sm">{entry.reason}</div>
                    <div className="text-ink-3 flex flex-wrap items-center gap-x-2 font-mono text-[10px]">
                      <Link
                        to={`/leagues/${entry.leagueId}`}
                        className="hover:text-vermilion underline-offset-2 hover:underline"
                      >
                        {entry.leagueName}
                      </Link>
                      {entry.chapterName && <span>· {entry.chapterName}</span>}
                      <span>· {typeLabel(entry.refType)}</span>
                    </div>
                  </div>
                  <span className="text-ink-2 shrink-0 font-mono text-[10px]">
                    {entry.profile ? handleLabel(entry.profile) : "Imported"}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {total > PAGE_SIZE && (
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
              disabled={offset === 0}
              className="btn-press border-ink bg-paper rounded-full border-2 px-4 py-2 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:opacity-40"
            >
              Newer
            </button>
            <span className="text-ink-3 font-mono text-[10px]">
              Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.ceil(total / PAGE_SIZE)}
            </span>
            <button
              type="button"
              onClick={() => setOffset((value) => value + PAGE_SIZE)}
              disabled={to >= total}
              className="btn-press border-ink bg-paper rounded-full border-2 px-4 py-2 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:opacity-40"
            >
              Older
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
