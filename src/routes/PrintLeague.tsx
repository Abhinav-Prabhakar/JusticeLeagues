import { Link, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, Printer, Sparkles, Users } from "lucide-react";
import { CAUSES, fmt } from "../data";
import { useEdition } from "../lib/queries";
import { usePageTitle } from "../lib/usePageTitle";
import { Emblem } from "../ui";
import { NotFound } from "./NotFound";

/** A clean, ink-on-paper league profile made for `window.print()`. */
export default function PrintLeague() {
  const { id = "" } = useParams<{ id: string }>();
  const { data } = useEdition();
  const league = data.leagues.find((item) => item.id === id || item.slug === id);

  usePageTitle(league ? `${league.name} — printed profile` : "League not found — The Justice Leagues", {
    description: league
      ? `${league.name}: ${fmt(league.points)} Justice Points across ${league.chapters.length} chapters in Millbrook.`
      : undefined,
    path: `/leagues/${id}/print`,
  });

  if (!league) return <NotFound />;

  const cause = CAUSES[league.cause];
  const rank = [...data.leagues].sort((a, b) => b.points - a.points).findIndex((item) => item.id === league.id) + 1;
  const wins = data.wins.filter((win) => win.league === league.id).slice(0, 5);

  return (
    <div className="pt-6 pb-10 print:pt-0 print:pb-0">
      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center gap-3">
        <Link to={`/leagues/${league.id}`} className="kicker text-ink-2 hover:text-vermilion flex items-center gap-1.5">
          <ArrowLeft size={12} /> Back to the league
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="border-ink bg-mustard hover:bg-paper ml-auto inline-flex items-center gap-2 border-2 px-3 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase shadow-[2px_2px_0_#14110d]"
        >
          <Printer size={13} /> Print this profile
        </button>
      </div>

      <article className="print-sheet border-ink bg-paper mx-auto max-w-3xl border-2 p-6 shadow-[8px_8px_0_#14110d] md:p-10 print:border-0 print:shadow-none">
        <header className="border-ink border-b-4 pb-4">
          <div className="kicker flex items-center justify-between text-[9px]">
            <span>The Justice Leagues · Millbrook</span>
            <span>
              League profile ·{" "}
              {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </span>
          </div>
          <div className="mt-3 flex items-start gap-3">
            <Emblem cause={league.cause} size={54} />
            <div>
              <h1 className="font-display text-4xl leading-[0.95] font-black tracking-tight md:text-5xl">
                {league.name}
              </h1>
              <p className="font-display text-ink-2 mt-1 text-lg italic">“{league.motto}”</p>
            </div>
          </div>
          <div className="text-ink-2 mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[10px]">
            <span className="flex items-center gap-1">
              <MapPin size={11} /> Founded in {league.hood}, {league.founded}
            </span>
            <span className="flex items-center gap-1">
              <Users size={11} /> {fmt(league.members)} members
            </span>
            <span style={{ color: cause.color === "#14110d" ? "#4a4338" : cause.color }}>{cause.label} league</span>
            <span>
              No. {rank} of {data.leagues.length} citywide
            </span>
          </div>
        </header>

        <section className="border-ink grid grid-cols-2 border-b-2 md:grid-cols-4">
          {[
            { label: "Justice Points", value: fmt(league.points) },
            { label: "This month", value: fmt(league.month) },
            { label: "Projects", value: fmt(league.projects) },
            { label: "Hours given", value: `${(league.hours / 1000).toFixed(1)}k` },
          ].map((stat, index) => (
            <div key={stat.label} className={index > 0 ? "border-ink border-l px-3 py-3" : "px-3 py-3"}>
              <div className="font-display text-2xl leading-none font-black">{stat.value}</div>
              <div className="kicker text-ink-3 mt-1 text-[8px]">{stat.label}</div>
            </div>
          ))}
        </section>

        <section className="mt-5">
          <h2 className="kicker text-vermilion border-ink border-b pb-1 text-[9px]">Neighbourhood chapters</h2>
          <table className="mt-2 w-full border-collapse text-left">
            <thead>
              <tr className="text-ink-3 font-mono text-[9px] uppercase">
                <th className="border-ink/30 border-b py-1.5 pr-2 font-normal">Chapter</th>
                <th className="border-ink/30 border-b py-1.5 pr-2 font-normal">Neighbourhood</th>
                <th className="border-ink/30 border-b py-1.5 pr-2 text-right font-normal">Points</th>
                <th className="border-ink/30 border-b py-1.5 text-right font-normal">Share</th>
              </tr>
            </thead>
            <tbody>
              {league.chapters.map((chapter) => (
                <tr key={chapter.id}>
                  <td className="border-ink/20 border-b py-2 pr-2 font-serif text-sm">{chapter.name}</td>
                  <td className="border-ink/20 border-b py-2 pr-2 font-mono text-[10px]">{chapter.hood}</td>
                  <td className="border-ink/20 border-b py-2 pr-2 text-right font-mono text-[11px]">
                    {fmt(chapter.points)}
                  </td>
                  <td className="border-ink/20 border-b py-2 text-right font-mono text-[10px]">
                    {Math.round((chapter.points / Math.max(league.points, 1)) * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {wins.length > 0 && (
          <section className="mt-5">
            <h2 className="kicker text-vermilion border-ink border-b pb-1 text-[9px]">Recent approved work</h2>
            <ul className="mt-2 space-y-2">
              {wins.map((win) => (
                <li key={win.id} className="border-ink/20 break-inside-avoid border-b pb-2">
                  <div className="font-display text-base leading-tight font-bold">{win.title}</div>
                  <div className="text-ink-3 font-mono text-[9px]">
                    {win.when} · {win.facts.people} people · {win.facts.hours} hours · +{win.jp} JP
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="border-ink mt-6 flex items-start justify-between gap-4 border-t-2 pt-3">
          <p className="text-ink-2 max-w-md font-serif text-xs">
            Displayed points are the sum of the public ledger. No number on this sheet was minted in a browser.
          </p>
          <div className="text-right font-mono text-[9px]">
            <div className="flex items-center justify-end gap-1">
              <Sparkles size={9} /> The Justice Leagues
            </div>
            <div className="text-ink-3 mt-0.5">Printed from the local edition</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
