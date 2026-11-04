import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation, useParams, Link } from "react-router-dom";
import {
  CalendarDays,
  Compass,
  LayoutGrid,
  MapPin,
  Printer,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import { CAUSES, fmt, photo } from "../data";
import { activeMembership } from "../lib/api";
import { useEdition } from "../lib/queries";
import { usePageTitle } from "../lib/usePageTitle";
import { Emblem, Photo } from "../ui";
import { cn } from "../utils/cn";
import { NotFound } from "./NotFound";
import { ShareButton } from "../components/ShareButton";
import type { LeagueContextValue } from "./league/context";

const TABS = [
  { to: "", label: "Overview", icon: LayoutGrid, end: true },
  { to: "shifts", label: "Shifts", icon: CalendarDays, end: false },
  { to: "chapters", label: "Chapters", icon: MapPin, end: false },
  { to: "members", label: "Members", icon: Users, end: false },
  { to: "resources", label: "Resources", icon: Tag, end: false },
  { to: "impact", label: "Impact", icon: Sparkles, end: false },
];

const STEWARD_TAB = { to: "steward", label: "Steward", icon: ShieldCheck, end: false };
const SETTINGS_TAB = { to: "settings", label: "Settings", icon: Settings2, end: false };

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useEdition();
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const membership = activeMembership(data.me, id ?? "");
  const isSteward = membership?.role === "owner" || membership?.role === "steward";
  const l = data.leagues.find((x) => x.id === id);
  usePageTitle(
    l ? `${l.name} — The Justice Leagues` : "League not found — The Justice Leagues",
    l
      ? {
          description: `${l.name}: ${fmt(l.points)} Justice Points, ${fmt(l.members)} members and ${l.chapters.length} neighbourhood chapters in Millbrook. “${l.motto}”`,
          image: new URL(photo(l.photo), window.location.origin).toString(),
          path: `/leagues/${l.id}`,
        }
      : { path: "/leagues" },
  );

  // Keep the active tab in view on narrow screens without moving the page.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    nav.scrollTo({
      left: active.offsetLeft - nav.clientWidth / 2 + active.clientWidth / 2,
      behavior: "smooth",
    });
  }, [pathname, isSteward]);

  if (!l) return <NotFound />;

  const c = CAUSES[l.cause];
  const color = c.color === "#14110d" ? "#4a4338" : c.color;
  const tabs = isSteward ? [...TABS, STEWARD_TAB, SETTINGS_TAB] : TABS;
  const myChapter = l.chapters.find((chapter) => chapter.id === membership?.chapterId);
  const rank = [...data.leagues].sort((a, b) => b.points - a.points).findIndex((x) => x.id === l.id) + 1;
  const context: LeagueContextValue = { league: l, edition: data };

  return (
    <div className="pt-8 pb-10 md:pt-10">
      <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
        <Link
          to="/leagues"
          className="kicker text-ink-2 hover:text-vermilion flex items-center gap-1.5 transition-colors"
        >
          <Compass size={12} /> The Atlas
        </Link>
        <span className="bg-ink hidden h-px flex-1 sm:block" />
        <span className="kicker flex items-center gap-1.5 sm:ml-auto" style={{ color }}>
          <c.icon size={12} /> {c.label} League
        </span>
        <ShareButton />
        <Link
          to={`/leagues/${l.id}/print`}
          className="border-ink bg-paper hover:bg-mustard inline-flex items-center gap-1.5 border-2 px-2.5 py-1 font-sans text-[9px] font-extrabold tracking-wider uppercase transition-colors"
        >
          <Printer size={12} /> Print
        </Link>
      </div>

      <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="hover-color group relative">
          <Photo
            id={l.photo}
            w={1100}
            h={700}
            alt={`${l.name} at work`}
            className="border-ink aspect-[16/10] w-full border-2"
          />
          <Emblem
            cause={l.cause}
            size={76}
            className="absolute -bottom-9 left-5 drop-shadow-[3px_3px_0_#14110d] transition-transform duration-700 group-hover:rotate-[360deg]"
          />
          <span className="border-ink bg-paper absolute top-3 right-3 flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 font-mono text-[11px] font-semibold">
            <Trophy size={12} className="text-vermilion" /> No. {rank} of {data.leagues.length}
          </span>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="kicker text-paper rounded-full px-2.5 py-1 text-[9px]" style={{ background: color }}>
              Citywide
            </span>
            {membership ? (
              <span className="bg-mustard border-ink flex items-center gap-1 rounded-full border px-2.5 py-1 font-sans text-[9px] font-extrabold tracking-wider uppercase">
                <UserCheck size={10} /> Member
                {myChapter ? ` · ${myChapter.hood}` : ""}
              </span>
            ) : (
              <span className="border-ink text-ink-2 rounded-full border px-2.5 py-1 font-sans text-[9px] font-extrabold tracking-wider uppercase">
                {l.recruiting ? "Recruiting" : "Closed for now"}
              </span>
            )}
            <span className="text-ink-3 font-mono text-[10px]">{l.chapters.length} neighbourhood chapters</span>
          </div>

          <h1 className="font-display mt-3 text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[0.95] font-black tracking-tight text-balance">
            {l.name}
          </h1>
          <p className="border-ink font-display text-ink-2 mt-3 border-l-4 pl-4 text-lg italic">“{l.motto}”</p>
          <div className="text-ink-2 mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px]">
            <span className="flex items-center gap-1.5">
              <MapPin size={12} /> Founded in {l.hood} · {l.founded}
            </span>
            <span className="flex items-center gap-1.5">
              <Users size={12} /> {fmt(l.members)} members
            </span>
          </div>
        </div>
      </div>

      <div className="border-ink mt-8 grid grid-cols-2 border-y-2 md:grid-cols-4">
        {[
          { label: "Projects", value: fmt(l.projects), color: "#d9381e" },
          { label: "Hours given", value: `${(l.hours / 1000).toFixed(1)}k`, color: "#2347c5" },
          { label: "Week streak", value: l.streak, color: "#1b7f5c" },
          { label: "Justice Points", value: fmt(l.points), color: "#14110d" },
        ].map((stat, index) => (
          <div key={stat.label} className={cn("px-1 py-3.5 md:px-3", index > 0 && "border-ink border-l")}>
            <div className="font-display text-xl leading-none font-black">{stat.value}</div>
            <div className="kicker text-ink-3 mt-1 flex items-center gap-1.5 text-[9px]">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: stat.color }} />
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <nav
        ref={navRef}
        aria-label="League sections"
        className="border-ink bg-paper/95 no-scrollbar sticky top-[60px] z-30 -mx-4 mt-6 flex gap-1 overflow-x-auto border-b-2 px-4 backdrop-blur-md md:mx-0 md:px-0"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                "group flex shrink-0 items-center gap-1 border-b-[3px] px-2 py-3 font-sans text-[10px] font-extrabold tracking-normal uppercase transition-colors sm:gap-1.5 sm:px-3 sm:text-[11px] sm:tracking-wider",
                isActive ? "border-vermilion text-ink" : "text-ink-3 hover:text-ink border-transparent",
              )
            }
          >
            {({ isActive }) => (
              <>
                <tab.icon
                  size={13}
                  className={cn("hidden sm:block", isActive ? "text-vermilion" : "group-hover:text-ink")}
                />
                {tab.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-8">
        <Outlet context={context} />
      </div>
    </div>
  );
}
