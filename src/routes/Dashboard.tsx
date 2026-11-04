import { Link, useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Clock, LogIn, LogOut, MapPin, Plus, Sparkles, Users } from "lucide-react";
import { CAUSES, fmt } from "../data";
import { Emblem, SectionHead } from "../ui";
import { JoinButton } from "../components/JoinButton";
import { usePageTitle } from "../lib/usePageTitle";
import { useAuth, useEdition, useCancelShift, useSignupShift } from "../lib/queries";
import { isSignedUp } from "../lib/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Dashboard() {
  usePageTitle("Your desk — The Justice Leagues");
  const { data } = useEdition();
  const signup = useSignupShift();
  const cancel = useCancelShift();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const me = data.me;

  const myLeagues = me
    ? data.leagues.filter((l) =>
        me.memberships.some((membership) => membership.leagueId === l.id && membership.status === "active"),
      )
    : [];
  const roster = me ? data.shifts.filter((s) => isSignedUp(me, s.id)) : [];
  const suggestions = data.shifts
    .filter((s) => !me || !isSignedUp(me, s.id))
    .sort(
      (a, b) =>
        Number(myLeagues.some((l) => l.id === b.league)) - Number(myLeagues.some((l) => l.id === a.league)) ||
        a.day - b.day,
    )
    .slice(0, 4);

  const toggleShift = (shift: (typeof data.shifts)[number]) => {
    if (!me) {
      navigate(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    if (isSignedUp(me, shift.id)) cancel.mutate(shift);
    else signup.mutate(shift);
  };

  return (
    <div className="space-y-14 pt-8 pb-4 md:pt-10">
      <header>
        <div className="rule-double" />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="kicker text-vermilion">Personal edition</div>
            <h1 className="font-display text-5xl leading-none font-black tracking-tight md:text-6xl">
              Your <em>desk</em>
            </h1>
          </div>
          <div className="text-ink-3 flex items-center gap-2 font-mono text-[11px]">
            <CalendarDays size={14} />
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>
      </header>

      {!me ? (
        <section className="border-ink bg-paper-2/60 grid gap-6 border-2 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
          <div>
            <div className="kicker text-vermilion flex items-center gap-1.5">
              <LogIn size={12} /> Members only
            </div>
            <h2 className="font-display mt-1 text-3xl leading-none font-black">Sign in to keep a desk</h2>
            <p className="text-ink-2 mt-2 max-w-lg font-serif">
              Your leagues, claimed shifts, and Justice Points are stored against a local account — not in this browser
              tab. Sign in, or open one in under a minute.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/login?next=%2Fdashboard"
              className="btn-press border-ink bg-ink text-paper flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-sans text-xs font-extrabold tracking-wider uppercase"
            >
              <LogIn size={14} /> Sign in
            </Link>
            <Link
              to="/register?next=%2Fdashboard"
              className="btn-press border-ink bg-mustard flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-sans text-xs font-extrabold tracking-wider uppercase"
            >
              <Plus size={14} /> Open an account
            </Link>
          </div>
        </section>
      ) : (
        <>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
            <section className="border-ink bg-ink text-paper border-2 p-6">
              <div className="kicker text-mustard">Your Justice Points</div>
              <div className="mt-2 flex items-end gap-2">
                <span className="font-display text-6xl leading-none font-black">{fmt(me.points)}</span>
                <Sparkles size={18} className="text-mustard mb-2" fill="currentColor" />
              </div>
              <p className="text-paper/70 mt-3 font-serif text-sm">
                Points land when a steward checks you in — not when you tap sign up. That distinction is the whole
                leaderboard.
              </p>
              <div className="border-paper/20 mt-5 grid grid-cols-2 gap-2 border-t pt-4">
                <div>
                  <div className="font-display text-3xl leading-none font-black">{myLeagues.length}</div>
                  <div className="kicker text-paper/60 mt-1 text-[9px]">Leagues joined</div>
                </div>
                <div>
                  <div className="font-display text-3xl leading-none font-black">{roster.length}</div>
                  <div className="kicker text-paper/60 mt-1 text-[9px]">Shifts claimed</div>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center gap-3">
                <span className="kicker bg-vermilion text-paper px-2.5 py-1.5">Your leagues</span>
                <span className="bg-ink h-px flex-1" />
                <Link to="/leagues" className="kicker hover:text-vermilion flex items-center gap-1">
                  <Plus size={11} /> Find another
                </Link>
              </div>

              {myLeagues.length === 0 ? (
                <div className="border-ink/40 grid place-items-center gap-3 border-2 border-dashed px-6 py-12 text-center">
                  <Emblem cause="climate" size={44} />
                  <p className="font-display text-ink-3 text-xl italic">You haven't signed a charter yet.</p>
                  <Link
                    to="/leagues"
                    className="btn-press border-ink bg-mustard rounded-full border-2 px-5 py-2.5 font-sans text-xs font-extrabold tracking-wider uppercase"
                  >
                    Browse the Atlas
                  </Link>
                </div>
              ) : (
                <ul className="divide-ink/20 border-ink divide-y-2 border-y-2">
                  {myLeagues.map((l) => {
                    const c = CAUSES[l.cause];
                    return (
                      <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                        <Emblem cause={l.cause} size={34} />
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/leagues/${l.id}`}
                            className="font-display text-lg leading-tight font-bold underline-offset-4 hover:underline"
                          >
                            {l.name}
                          </Link>
                          <div className="text-ink-2 mt-0.5 flex items-center gap-1 font-mono text-[10px]">
                            <MapPin size={10} /> {l.hood} chapter · {fmt(l.members)} members
                          </div>
                        </div>
                        <span
                          className="font-mono text-xs font-semibold"
                          style={{ color: c.color === "#14110d" ? "#4a4338" : c.color }}
                        >
                          {fmt(l.points)} JP
                        </span>
                        <JoinButton id={l.id} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <section>
            <SectionHead
              kicker="Your roster"
              title={
                <>
                  Shifts you <em>claimed</em>
                </>
              }
              right={
                <span className="text-ink-2 flex items-center gap-1.5 font-mono text-[11px]">
                  <Clock size={13} /> {roster.length} on the books
                </span>
              }
            />
            {roster.length === 0 ? (
              <div className="border-ink/40 border-2 border-dashed px-6 py-10 text-center">
                <p className="font-display text-ink-3 text-lg italic">
                  Nothing claimed yet. The city is not going to fix itself.
                </p>
              </div>
            ) : (
              <div className="divide-ink/20 border-ink divide-y-2 border-y-2">
                {roster.map((s) => {
                  const l = data.leagues.find((x) => x.id === s.league);
                  if (!l) return null;
                  const c = CAUSES[l.cause];
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-3 py-3.5">
                      <div className="w-14 shrink-0 text-center">
                        <div className="text-ink-3 font-mono text-[10px] font-semibold tracking-wider uppercase">
                          {DAYS[s.day]}
                        </div>
                        <div className="font-mono text-sm font-semibold">{s.time}</div>
                      </div>
                      <span
                        className="text-paper grid h-9 w-9 shrink-0 place-items-center rounded-full"
                        style={{ background: c.color }}
                        aria-hidden
                      >
                        <c.icon size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-base leading-tight font-bold">{s.title}</div>
                        <div className="text-ink-2 mt-0.5 flex items-center gap-1.5 font-mono text-[10px]">
                          <MapPin size={10} /> {s.place} · {l.name}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleShift(s)}
                        className="border-ink hover:bg-paper-2 rounded-full border-2 px-3.5 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase"
                      >
                        Cancel
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <SectionHead
              kicker="The record"
              title={
                <>
                  Points <em>ledger</em>
                </>
              }
              right={
                <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
                  <Sparkles size={13} /> Server-awarded, append-only
                </span>
              }
            />
            {me.ledger.length === 0 ? (
              <div className="border-ink/40 border-2 border-dashed px-6 py-8 text-center">
                <p className="font-display text-ink-3 text-lg italic">
                  No entries yet. Join a league and your first 25 points appear here.
                </p>
              </div>
            ) : (
              <ol className="divide-ink/20 border-ink divide-y-2 border-y-2">
                {me.ledger.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="text-ink-3 font-mono text-[10px] font-semibold tracking-wider uppercase">
                      {new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span className="text-ink-2 flex-1 font-serif text-sm">{entry.reason}</span>
                    <span className="text-ink-3 font-mono text-[11px]">{entry.leagueName}</span>
                    <span className="text-vermilion font-mono text-sm font-semibold">+{entry.delta}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      <section>
        <SectionHead
          kicker="The dispatch"
          title={
            <>
              Worth <em>showing up</em> for
            </>
          }
          right={
            <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
              <Users size={13} /> Open to every member
            </span>
          }
        />
        <div className="grid gap-4 md:grid-cols-2">
          {suggestions.map((s) => {
            const l = data.leagues.find((x) => x.id === s.league);
            if (!l) return null;
            const c = CAUSES[l.cause];
            return (
              <article key={s.id} className="group border-ink bg-paper relative border-2 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Emblem cause={l.cause} size={24} />
                  <span className="text-ink-3 truncate font-sans text-[10px] font-bold tracking-wider uppercase">
                    {l.name}
                  </span>
                  <span className="ml-auto font-mono text-[10px] font-semibold">
                    {DAYS[s.day]} · {s.time}
                  </span>
                </div>
                <h3 className="font-display text-lg leading-tight font-bold">{s.title}</h3>
                <div className="text-ink-2 mt-1 flex items-center gap-1.5 font-mono text-[10px]">
                  <MapPin size={10} /> {s.place} · {s.spots - s.filled} spots left
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span
                    className="rounded-full px-2 py-0.5 font-sans text-[9px] font-extrabold tracking-wider uppercase"
                    style={{ background: `${c.color}1f`, color: c.color === "#14110d" ? "#4a4338" : c.color }}
                  >
                    {c.label}
                  </span>
                  <button
                    onClick={() => toggleShift(s)}
                    disabled={signup.isPending || cancel.isPending}
                    className="btn-press border-ink bg-mustard flex items-center gap-1.5 rounded-full border-2 px-4 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:opacity-60"
                  >
                    <Plus size={11} strokeWidth={3} /> Sign up
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-ink/30 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
        <p className="text-ink-3 font-serif text-sm">
          Your desk lives in this app's local SQLite database. Points are computed on the server and every award is
          recorded in the ledger above.
        </p>
        {me && (
          <div className="flex items-center gap-3">
            <span className="text-ink-2 font-mono text-[11px]">{me.profile.handle}</span>
            <button
              onClick={() =>
                logout.mutate(undefined, {
                  onSuccess: () => navigate("/"),
                })
              }
              className="kicker text-ink-2 hover:text-vermilion flex items-center gap-1.5"
            >
              <LogOut size={12} /> Sign out
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
