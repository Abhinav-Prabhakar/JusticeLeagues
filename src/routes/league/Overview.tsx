import { Link } from "react-router-dom";
import { ArrowRight, CalendarCheck, Flame, Hourglass, MapPin, Sparkles, Trophy, Users } from "lucide-react";
import { CAUSES, fmt } from "../../data";
import { activeMembership } from "../../lib/api";
import { JoinButton } from "../../components/JoinButton";
import { Photo, SectionHead } from "../../ui";
import { useLeagueContext } from "./context";
import { ShiftList } from "./ShiftList";
import { tierFor } from "./constants";

export default function LeagueOverview() {
  const { league: l, edition } = useLeagueContext();
  const c = CAUSES[l.cause];
  const color = c.color === "#14110d" ? "#4a4338" : c.color;
  const membership = activeMembership(edition.me, l.id);
  const myChapter = l.chapters.find((chapter) => chapter.id === membership?.chapterId);
  const rank = [...edition.leagues].sort((a, b) => b.points - a.points).findIndex((x) => x.id === l.id) + 1;
  const { tier, next, pct } = tierFor(l.points);

  const shifts = edition.shifts
    .filter((shift) => shift.league === l.id)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const nextShift = shifts[0];
  const later = shifts.slice(1, 4);
  const latestWin = edition.wins.find((win) => win.league === l.id);
  const standingPoints = membership?.points ?? l.points;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
      <div className="space-y-11">
        <section>
          <SectionHead
            kicker="Next up"
            title={
              <>
                The next <em>shift</em>
              </>
            }
            right={
              <Link to="shifts" className="kicker hover:text-vermilion flex items-center gap-1">
                All shifts <ArrowRight size={12} />
              </Link>
            }
          />
          <ShiftList shifts={nextShift ? [nextShift] : []} empty="Nothing scheduled this week. Check back Monday." />
          {later.length > 0 && (
            <div className="mt-4">
              <div className="kicker text-ink-3 mb-2 text-[9px]">Also this week</div>
              <ShiftList shifts={later} />
            </div>
          )}
        </section>

        {latestWin && (
          <section>
            <SectionHead
              kicker="From the chapter"
              title={
                <>
                  A recent <em>win</em>
                </>
              }
              right={
                <Link to="impact" className="kicker hover:text-vermilion flex items-center gap-1">
                  Impact <ArrowRight size={12} />
                </Link>
              }
            />
            <article className="hover-color border-ink grid gap-0 border-2 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <Photo
                id={latestWin.photo}
                w={720}
                h={460}
                alt=""
                className="border-ink h-full w-full border-b-2 sm:border-r-2 sm:border-b-0"
              />
              <div className="flex flex-col justify-center p-5">
                <div className="kicker text-vermilion flex items-center gap-1.5">
                  <Sparkles size={12} /> +{latestWin.jp} JP
                </div>
                <h3 className="font-display mt-1 text-2xl leading-tight font-bold">{latestWin.title}</h3>
                <div className="text-ink-2 mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px]">
                  <span>{latestWin.facts.people} people</span>
                  <span>{latestWin.facts.hours} hours</span>
                  <span className="font-semibold">{latestWin.facts.amount}</span>
                  <span className="text-ink-3">{latestWin.when}</span>
                </div>
              </div>
            </article>
          </section>
        )}

        <section>
          <SectionHead
            kicker="The work"
            title={
              <>
                What this league <em>holds</em>
              </>
            }
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { icon: CalendarCheck, value: fmt(l.projects), label: "Projects done", tone: "#d9381e" },
              { icon: Hourglass, value: `${(l.hours / 1000).toFixed(1)}k`, label: "Hours given", tone: "#2347c5" },
              { icon: Flame, value: l.streak, label: "Week streak", tone: "#1b7f5c" },
              { icon: Users, value: fmt(l.members), label: "Members", tone: color },
            ].map((stat) => (
              <div key={stat.label} className="border-ink border-2 p-4">
                <span
                  className="text-paper grid h-9 w-9 place-items-center rounded-full"
                  style={{ background: stat.tone }}
                >
                  <stat.icon size={16} />
                </span>
                <div className="font-display mt-3 text-2xl leading-none font-black">{stat.value}</div>
                <div className="kicker text-ink-3 mt-1 text-[9px]">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="space-y-4 self-start lg:sticky lg:top-36">
        <div className="border-ink bg-paper-2 border-2 p-5">
          <div className="kicker text-vermilion">{membership ? "Your standing here" : "League standing"}</div>
          <div className="mt-2 flex items-end gap-2">
            <span className="font-display text-5xl leading-none font-black">{fmt(standingPoints)}</span>
            <span className="text-ink-3 mb-1 font-mono text-[11px]">JP</span>
          </div>
          <p className="text-ink-2 mt-1 font-serif text-xs">
            {membership
              ? `${myChapter ? `${myChapter.name} · ` : ""}league total ${fmt(l.points)}`
              : `Held by ${l.name} across every chapter`}
          </p>
          <div className="kicker text-ink-3 mt-3 text-[9px]">League tier</div>
          <div className="text-ink-2 mt-1 flex items-center justify-between font-mono text-[10px]">
            <span className="flex items-center gap-1">
              <Trophy size={11} style={{ color: tier.color }} /> {tier.name}
            </span>
            {next && (
              <span>
                {fmt(next.at - l.points)} to {next.name}
              </span>
            )}
          </div>
          <div className="bg-paper-3 mt-1.5 h-2 overflow-hidden rounded-full">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tier.color }} />
          </div>
          <div className="mt-5 flex flex-col gap-2.5">
            <JoinButton id={l.id} className="w-full justify-center" />
            <Link
              to="/dashboard"
              className="btn-press border-ink bg-paper flex items-center justify-center gap-2 rounded-full border-2 px-5 py-2.5 font-sans text-xs font-extrabold tracking-wider uppercase"
            >
              Open your desk
            </Link>
          </div>
        </div>

        <div className="border-ink bg-paper border-2 p-5">
          <div className="kicker text-ink-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <MapPin size={12} /> Chapters
            </span>
            <Link to="chapters" className="hover:text-vermilion normal-case">
              {l.chapters.length} across the city
            </Link>
          </div>
          <ul className="mt-3 space-y-2.5">
            {l.chapters.map((chapter, index) => {
              const isMine = chapter.id === membership?.chapterId;
              return (
                <li key={chapter.id} className="border-ink/15 flex items-center justify-between gap-2 border-b pb-2">
                  <div className="min-w-0">
                    <div className="truncate font-sans text-sm font-semibold">{chapter.hood}</div>
                    <div className="text-ink-3 font-mono text-[9px] uppercase">
                      {index === 0 ? "Founding" : isMine ? "Your chapter" : "Chapter"}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-semibold">{fmt(chapter.points)} JP</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-ink/40 border-2 border-dashed p-4">
          <div className="kicker text-ink-3">Table talk</div>
          <p className="font-display text-ink-2 mt-1 text-sm leading-snug italic">
            {l.recruiting ? "This league is recruiting across the city." : "This league is at capacity for now."}
          </p>
          <p className="text-ink-3 mt-2 font-mono text-[10px]">
            Ranked No. {rank} of {edition.leagues.length} citywide.
          </p>
        </div>
      </aside>
    </div>
  );
}
