import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Compass, MapPin, Printer, Sparkles, Users } from "lucide-react";
import { CAUSES, fmt, photo } from "../data";
import { distanceKm, formatDistance } from "../data/geo";
import { useEdition, useLeagueDetail } from "../lib/queries";
import { usePageTitle } from "../lib/usePageTitle";
import { Emblem, Photo } from "../ui";
import { JoinButton } from "../components/JoinButton";
import { ShareButton } from "../components/ShareButton";
import { NotFound } from "./NotFound";

export default function ChapterPage() {
  const { id = "", chapterId = "" } = useParams<{ id: string; chapterId: string }>();
  const { data } = useEdition();
  const league = data.leagues.find((item) => item.id === id || item.slug === id);
  const chapter = league?.chapters.find((item) => item.id === chapterId || item.hood === chapterId);
  const { data: detail } = useLeagueDetail(league?.id ?? "");
  const members = detail?.members ?? [];

  usePageTitle(
    league && chapter ? `${chapter.hood} chapter — ${league.name}` : "Chapter not found — The Justice Leagues",
    league && chapter
      ? {
          description: `${chapter.name} of ${league.name}: ${fmt(chapter.points)} Justice Points, ${chapter.status} and organising in ${chapter.hood}.`,
          image: new URL(photo(league.photo), window.location.origin).toString(),
          path: `/leagues/${league.id}/chapters/${chapter.id}`,
        }
      : { path: "/leagues" },
  );

  const nearby = useMemo(() => {
    if (!league || !chapter) return [];
    return data.leagues
      .filter((item) => item.id !== league.id)
      .map((item) => ({
        league: item,
        km: distanceKm({ lat: chapter.lat, lng: chapter.lng }, { lat: item.lat, lng: item.lng }),
      }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 3);
  }, [chapter, data.leagues, league]);

  if (!league || !chapter) return <NotFound />;

  const c = CAUSES[league.cause];
  const color = c.color === "#14110d" ? "#4a4338" : c.color;
  const chapterMembers = members.filter((member) => member.chapterId === chapter.id).length;
  const shifts = data.shifts.filter((shift) => shift.chapterId === chapter.id);
  const wins = data.wins.filter((win) => win.chapterId === chapter.id || (!win.chapterId && win.league === league.id));

  return (
    <div className="space-y-10 pt-8 pb-10 md:pt-10">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/leagues" className="kicker text-ink-2 hover:text-vermilion flex items-center gap-1.5">
          <Compass size={12} /> The Atlas
        </Link>
        <span className="text-ink-3">/</span>
        <Link to={`/leagues/${league.id}`} className="kicker text-ink-2 hover:text-vermilion truncate">
          {league.name}
        </Link>
        <span className="text-ink-3">/</span>
        <span className="kicker truncate">{chapter.hood}</span>
        <span className="ml-auto flex items-center gap-2">
          <ShareButton />
          <Link
            to={`/leagues/${league.id}/print`}
            className="border-ink bg-paper hover:bg-mustard inline-flex items-center gap-1.5 border-2 px-2.5 py-1 font-sans text-[9px] font-extrabold tracking-wider uppercase"
          >
            <Printer size={12} /> Print
          </Link>
        </span>
      </div>

      <header className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="kicker text-paper rounded-full px-2.5 py-1 text-[9px]" style={{ background: color }}>
              <c.icon size={10} className="mr-1 inline" /> {c.label}
            </span>
            <span className="border-ink text-ink-2 rounded-full border px-2.5 py-1 font-sans text-[9px] font-extrabold tracking-wider uppercase">
              {chapter.status === "active" ? "Active chapter" : "Dormant"}
            </span>
            <span className="text-ink-3 font-mono text-[10px]">A chapter of {league.name}</span>
          </div>
          <h1 className="font-display mt-3 text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.92] font-black tracking-tight">
            {chapter.hood}
            <span className="text-ink-3 block text-[0.42em] font-bold tracking-normal italic">
              neighbourhood chapter
            </span>
          </h1>
          <p className="text-ink-2 mt-4 max-w-xl font-serif text-lg">
            {chapter.name} keeps the {c.label.toLowerCase()} work going in {chapter.hood}. Every shift and project filed
            here rolls up into the citywide league — and into the public ledger.
          </p>
          <div className="text-ink-2 mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px]">
            <span className="flex items-center gap-1.5">
              <MapPin size={12} /> {chapter.hood}, Millbrook
            </span>
            <span className="flex items-center gap-1.5">
              <Users size={12} /> {fmt(chapterMembers)} chapter {chapterMembers === 1 ? "member" : "members"}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays size={12} /> {shifts.length} {shifts.length === 1 ? "shift" : "shifts"} posted
            </span>
          </div>
        </div>

        <div className="border-ink bg-paper-2 border-2 p-5 shadow-[5px_5px_0_#14110d]">
          <div className="kicker text-ink-3 flex items-center gap-1.5 text-[9px]">
            <Sparkles size={11} className="text-vermilion" /> Justice Points on the books
          </div>
          <div className="font-display mt-1 text-5xl leading-none font-black">{fmt(chapter.points)}</div>
          <div className="text-ink-3 mt-2 font-mono text-[10px]">
            {Math.round((chapter.points / Math.max(league.points, 1)) * 100)}% of {league.name}
          </div>
          <div className="border-ink/20 mt-4 border-t pt-4">
            <JoinButton id={league.id} />
            <p className="text-ink-3 mt-2 font-mono text-[9px]">
              Joining puts you on the {league.name} roster. Pick this chapter when your steward files the seat.
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className="space-y-6">
          <div>
            <h2 className="font-display border-ink border-b-2 pb-1 text-2xl font-black">
              Shifts <em>posted here</em>
            </h2>
            {shifts.length === 0 ? (
              <p className="text-ink-3 mt-3 font-serif italic">
                No shift is posted at this chapter yet. The league still posts citywide work.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--color-ink)]/20">
                {shifts.map((shift) => (
                  <li key={shift.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="border-ink bg-paper grid h-10 w-10 shrink-0 place-items-center border-2 font-mono text-[10px] font-bold">
                      {shift.time}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-lg leading-tight font-bold">{shift.title}</div>
                      <div className="text-ink-3 font-mono text-[10px]">
                        {shift.place} · {shift.spots - shift.filled} spots left
                      </div>
                    </div>
                    <Link
                      to={`/leagues/${league.id}/shifts`}
                      className="kicker border-ink hover:bg-mustard border-b-2 pb-0.5"
                    >
                      See shifts
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="font-display border-ink border-b-2 pb-1 text-2xl font-black">
              Recent <em>wins</em>
            </h2>
            {wins.length === 0 ? (
              <p className="text-ink-3 mt-3 font-serif italic">The chapter's wins will appear here once approved.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {wins.slice(0, 4).map((win) => (
                  <li
                    key={win.id}
                    className="border-ink/40 flex gap-3 border border-l-4 border-l-[var(--color-vermilion)] p-3"
                  >
                    <Photo
                      id={win.photo}
                      w={200}
                      h={140}
                      alt=""
                      className="border-ink hidden h-20 w-28 shrink-0 border sm:block"
                    />
                    <div>
                      <div className="font-display text-base leading-tight font-bold">{win.title}</div>
                      <div className="text-ink-3 mt-1 font-mono text-[10px]">
                        {win.facts.people} people · {win.facts.hours} hours · +{win.jp} JP
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="border-ink border-2">
            <div className="border-ink bg-paper-3 flex items-center gap-2 border-b-2 px-3 py-2">
              <Emblem cause={league.cause} size={20} />
              <span className="font-display text-lg font-bold">The league</span>
            </div>
            <div className="p-4">
              <Link
                to={`/leagues/${league.id}`}
                className="font-display hover:text-vermilion text-xl leading-tight font-black"
              >
                {league.name}
              </Link>
              <p className="font-display text-ink-3 mt-1 text-sm italic">“{league.motto}”</p>
              <div className="text-ink-2 mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px]">
                <span>{fmt(league.points)} JP</span>
                <span>{fmt(league.members)} members</span>
                <span>{league.chapters.length} chapters</span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="font-display border-ink border-b-2 pb-1 text-xl font-black">
              Nearby <em>leagues</em>
            </h2>
            <ul className="mt-2 divide-y divide-[var(--color-ink)]/20">
              {nearby.map(({ league: other, km }) => (
                <li key={other.id} className="py-2.5">
                  <Link to={`/leagues/${other.id}`} className="group flex items-center gap-2">
                    <Emblem cause={other.cause} size={16} />
                    <span className="font-display group-hover:text-vermilion min-w-0 flex-1 truncate text-base font-bold">
                      {other.name}
                    </span>
                    <span className="text-ink-3 font-mono text-[9px]">{formatDistance(km)}</span>
                  </Link>
                  <div className="text-ink-3 mt-0.5 font-mono text-[9px]">
                    {other.hood} · {CAUSES[other.cause].label}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-ink/40 border-2 border-dashed p-3">
            <p className="text-ink-2 font-serif text-sm">
              Every point on this page is a ledger row, not a browser number.{" "}
              <Link to="/ledger" className="underline underline-offset-2">
                Read the public record
              </Link>
              .
            </p>
          </div>

          <Link
            to={`/leagues/${league.id}`}
            className="kicker text-ink-2 hover:text-vermilion flex items-center gap-1.5"
          >
            <ArrowLeft size={12} /> Back to {league.name}
          </Link>
        </aside>
      </div>
    </div>
  );
}
