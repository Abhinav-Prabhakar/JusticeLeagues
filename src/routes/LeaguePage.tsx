import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CalendarCheck, Compass, Flame, Hourglass, MapPin, Sparkles, Trophy, Users } from "lucide-react";
import { CAUSES, fmt } from "../data";
import { useEdition, useCancelShift, useSignupShift } from "../lib/queries";
import { activeMembership, isSignedUp } from "../lib/api";
import { Emblem, Photo, SectionHead } from "../ui";
import { JoinButton } from "../components/JoinButton";
import { usePageTitle } from "../lib/usePageTitle";
import { cn } from "../utils/cn";
import { NotFound } from "./NotFound";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TIERS = [
  { name: "Bronze", at: 0, color: "#c0763a" },
  { name: "Silver", at: 20000, color: "#9a978f" },
  { name: "Gold", at: 35000, color: "#f2b705" },
  { name: "Platinum", at: 50000, color: "#2347c5" },
];

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useEdition();
  const l = data.leagues.find((x) => x.id === id);
  usePageTitle(l ? `${l.name} — The Justice Leagues` : "League not found — The Justice Leagues");
  if (!l) return <NotFound />;

  const c = CAUSES[l.cause];
  const rank = [...data.leagues].sort((a, b) => b.points - a.points).findIndex((x) => x.id === l.id) + 1;
  const tierIdx = TIERS.reduce((a, t, i) => (l.points >= t.at ? i : a), 0);
  const tier = TIERS[tierIdx];
  const next = TIERS[tierIdx + 1];
  const shifts = data.shifts.filter((s) => s.league === l.id);
  const wins = data.wins.filter((w) => w.league === l.id);
  const membership = activeMembership(data.me, l.id);

  return (
    <div className="pt-8 pb-10 md:pt-10">
      <div className="mb-4 flex items-center gap-3">
        <Link
          to="/leagues"
          className="kicker text-ink-2 hover:text-vermilion flex items-center gap-1.5 transition-colors"
        >
          <Compass size={12} /> The Atlas
        </Link>
        <span className="bg-ink h-px flex-1" />
        <span
          className="kicker flex items-center gap-1.5"
          style={{ color: c.color === "#14110d" ? "#4a4338" : c.color }}
        >
          <c.icon size={12} /> {c.label} League
        </span>
      </div>

      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="hover-color group relative">
            <Photo
              id={l.photo}
              w={1400}
              h={700}
              alt={`${l.name} at work`}
              className="border-ink aspect-[16/8] w-full border-2"
            />
            <Emblem
              cause={l.cause}
              size={86}
              className="absolute -bottom-10 left-6 drop-shadow-[3px_3px_0_#14110d] transition-transform duration-700 group-hover:rotate-[360deg]"
            />
            <span className="border-ink bg-paper absolute top-4 right-4 flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 font-mono text-xs font-semibold">
              <Trophy size={13} className="text-vermilion" /> No. {rank} of {data.leagues.length}
            </span>
          </div>

          <div className="mt-14">
            <h1 className="font-display text-[clamp(2.2rem,5vw,4rem)] leading-[0.95] font-black tracking-tight text-balance">
              {l.name}
            </h1>
            <p className="border-ink font-display text-ink-2 mt-3 border-l-4 pl-4 text-xl italic">“{l.motto}”</p>
            <div className="text-ink-2 mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px]">
              <span className="flex items-center gap-1.5">
                <MapPin size={12} /> {l.hood} chapter
              </span>
              <span className="flex items-center gap-1.5">
                <Compass size={12} /> Citywide since {l.founded}
              </span>
              <span className="flex items-center gap-1.5">
                <Users size={12} /> {fmt(l.members)} members
              </span>
            </div>

            <div className="border-ink mt-6 grid grid-cols-2 border-y-2 md:grid-cols-4">
              {[
                { icon: CalendarCheck, value: l.projects, label: "Projects", color: c.color },
                { icon: Hourglass, value: `${(l.hours / 1000).toFixed(1)}k`, label: "Hours given", color: "#2347c5" },
                { icon: Flame, value: l.streak, label: "Week streak", color: "#d9381e" },
                { icon: Sparkles, value: fmt(l.points), label: "Justice Points", color: "#14110d" },
              ].map((s, i) => (
                <div
                  key={s.label}
                  className={`group flex items-center gap-3 px-1 py-4 md:px-3 ${i > 0 ? "border-ink border-l" : ""}`}
                >
                  <span
                    className="text-paper grid h-10 w-10 shrink-0 place-items-center rounded-full transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-12"
                    style={{ background: s.color }}
                  >
                    <s.icon size={18} />
                  </span>
                  <div>
                    <div className="font-display text-2xl leading-none font-black">{s.value}</div>
                    <div className="kicker text-ink-3 mt-1 text-[9px]">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <section className="mt-10">
            <SectionHead
              kicker="On the roster"
              title={
                <>
                  Open <em>shifts</em>
                </>
              }
              right={
                <span className="text-ink-3 font-mono text-[11px]">
                  {shifts.length} scheduled · {shifts.reduce((a, s) => a + s.spots - s.filled, 0)} spots open
                </span>
              }
            />
            <ShiftList leagueId={l.id} />
          </section>

          {wins.length > 0 && (
            <section className="mt-12">
              <SectionHead
                kicker="Fresh from the chapter"
                title={
                  <>
                    Recent <em>wins</em>
                  </>
                }
              />
              <div className="grid gap-5 md:grid-cols-2">
                {wins.map((w) => (
                  <article key={w.id} className="hover-color group border-ink border-2">
                    <Photo id={w.photo} w={640} h={360} alt="" className="border-ink aspect-[16/9] w-full border-b-2" />
                    <div className="p-4">
                      <h3 className="font-display text-lg leading-tight font-bold">{w.title}</h3>
                      <div className="text-ink-3 mt-2 flex items-center justify-between font-mono text-[11px]">
                        <span>{w.when}</span>
                        <span className="text-vermilion flex items-center gap-1 font-semibold">
                          <Sparkles size={11} /> +{w.jp} JP
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="lg:col-span-4">
          <div className="space-y-4 lg:sticky lg:top-24">
            <div className="border-ink bg-paper-2 border-2 p-5">
              <div className="kicker text-vermilion">{membership ? "Your standing here" : "League standing"}</div>
              <div className="mt-2 flex items-end gap-2">
                <span className="font-display text-5xl leading-none font-black">
                  {fmt(membership ? membership.points : l.points)}
                </span>
                <span className="text-ink-3 mb-1 font-mono text-[11px]">JP</span>
              </div>
              <p className="text-ink-2 mt-1 font-serif text-xs">
                {membership
                  ? `Earned by you with ${l.name} · league total ${fmt(l.points)}`
                  : `Held by ${l.name} across every chapter`}
              </p>
              <div className="text-ink-3 kicker mt-3 text-[9px]">League tier</div>
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
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${next ? Math.min(100, Math.max(4, ((l.points - tier.at) / (next.at - tier.at)) * 100)) : 100}%`,
                    background: tier.color,
                  }}
                />
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
              <div className="kicker text-ink-3 flex items-center gap-1.5">
                <MapPin size={12} /> Chapters
              </div>
              <ul className="mt-3 space-y-2">
                {l.chapters.map((chapter, index) => (
                  <li
                    key={chapter.id}
                    className="border-ink/20 flex items-center justify-between border-b pb-2 font-sans text-sm font-semibold"
                  >
                    <span>{chapter.hood}</span>
                    <span className={cn("kicker text-[9px]", index === 0 ? "text-forest" : "text-ink-3")}>
                      {index === 0 ? "Founding" : `${fmt(chapter.points)} JP`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-ink-3 mt-3 font-serif text-xs">
                One citywide league, many neighbourhood chapters. {l.hood} is the founding chapter; new chapters open as
                members organise.
              </p>
            </div>

            <div className="border-ink/40 border-2 border-dashed p-4">
              <div className="kicker text-ink-3">Table talk</div>
              <p className="font-display text-ink-2 mt-1 text-sm leading-snug italic">
                {l.recruiting ? "This league is recruiting across the city." : "This league is at capacity for now."}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ShiftList({ leagueId }: { leagueId: string }) {
  const { data } = useEdition();
  const signup = useSignupShift();
  const cancel = useCancelShift();
  const navigate = useNavigate();
  const location = useLocation();
  const me = data.me;
  const shifts = data.shifts.filter((s) => s.league === leagueId);

  const toggle = (shift: (typeof shifts)[number]) => {
    if (!me) {
      navigate(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    if (isSignedUp(me, shift.id)) cancel.mutate(shift);
    else signup.mutate(shift);
  };

  if (shifts.length === 0) {
    return (
      <div className="border-ink/40 border-2 border-dashed py-10 text-center">
        <p className="font-display text-ink-3 text-lg italic">No shifts posted this week.</p>
      </div>
    );
  }

  return (
    <div className="divide-ink/20 border-ink divide-y-2 border-y-2">
      {shifts.map((s) => {
        const meSigned = me ? isSignedUp(me, s.id) : false;
        const filled = s.filled;
        return (
          <div key={s.id} className="group flex flex-wrap items-center gap-3 py-3.5 sm:flex-nowrap">
            <div className="w-14 shrink-0 text-center">
              <div className="text-ink-3 font-mono text-[10px] font-semibold tracking-wider uppercase">
                {DAYS[s.day]}
              </div>
              <div className="font-mono text-sm font-semibold">{s.time}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-base leading-tight font-bold">{s.title}</div>
              <div className="text-ink-2 mt-0.5 flex items-center gap-2 font-mono text-[10px]">
                <MapPin size={10} /> {s.place} · {s.dur}
              </div>
            </div>
            <div className="flex items-center gap-[3px]" aria-label={`${filled} of ${s.spots} spots filled`}>
              {Array.from({ length: Math.min(s.spots, 10) }).map((_, i) => (
                <span
                  key={i}
                  className="border-ink h-2 w-2 rounded-full border"
                  style={{
                    background: i < Math.round((filled / s.spots) * Math.min(s.spots, 10)) ? "#d9381e" : "transparent",
                  }}
                />
              ))}
            </div>
            <button
              onClick={() => toggle(s)}
              aria-pressed={meSigned}
              className={`btn-press border-ink shrink-0 rounded-full border-2 px-3.5 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase ${
                meSigned ? "bg-ink text-paper" : "bg-mustard"
              }`}
            >
              {meSigned ? "You're in" : filled >= s.spots ? "Full" : "Sign up"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
