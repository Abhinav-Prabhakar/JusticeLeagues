import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Check, Clock, MapPin, Plus, ShieldCheck, Sparkles, UserRound, Users, X } from "lucide-react";
import { CAUSES, fmt } from "../../data";
import { activeMembership } from "../../lib/api";
import { useCancelShiftAsSteward, useCheckIn, useCreateShift, useShiftRoster } from "../../lib/queries";
import { SectionHead } from "../../ui";
import { cn } from "../../utils/cn";
import { useLeagueContext } from "./context";
import { DAYS, initials } from "./constants";
import { ProjectReview } from "./ProjectReview";

const STATUS_STYLE = {
  attended: "bg-forest text-paper",
  no_show: "bg-vermilion text-paper",
  confirmed: "bg-mustard text-ink",
  waitlist: "bg-paper-3 text-ink-2",
  reserved: "bg-paper-3 text-ink-2",
} as const;

export default function LeagueSteward() {
  const { league: l, edition } = useLeagueContext();
  const c = CAUSES[l.cause];
  const color = c.color === "#14110d" ? "#4a4338" : c.color;
  const membership = activeMembership(edition.me, l.id);
  const isSteward = membership?.role === "owner" || membership?.role === "steward";
  const shifts = edition.shifts
    .filter((shift) => shift.league === l.id)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const [selected, setSelected] = useState<string | null>(shifts[0]?.id ?? null);
  const activeId = selected && shifts.some((shift) => shift.id === selected) ? selected : (shifts[0]?.id ?? null);
  const roster = useShiftRoster(isSteward ? activeId : null);
  const checkIn = useCheckIn();
  const create = useCreateShift();
  const cancelShift = useCancelShiftAsSteward();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [form, setForm] = useState({
    chapterId: l.chapters[0]?.id ?? "",
    title: "",
    day: 5,
    time: "10:00",
    duration: "2h",
    capacity: 8,
    place: "",
  });

  if (!isSteward) {
    return (
      <div className="border-ink/40 grid place-items-center gap-3 border-2 border-dashed px-6 py-14 text-center">
        <span
          className="text-paper grid h-12 w-12 place-items-center rounded-full"
          style={{ background: color }}
          aria-hidden
        >
          <ShieldCheck size={22} />
        </span>
        <p className="font-display text-ink-3 text-xl italic">Stewards only.</p>
        <p className="text-ink-2 max-w-md font-serif text-sm">
          Attendance is recorded by a league owner or steward. If you run shifts for {l.name}, ask a steward of your
          chapter to add you to the desk.
        </p>
        <Link
          to={`/leagues/${l.id}`}
          className="btn-press border-ink bg-paper mt-1 rounded-full border-2 px-5 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase"
        >
          Back to the league
        </Link>
      </div>
    );
  }

  const busy = checkIn.isPending;
  const activeShift = roster.data?.shift ?? shifts.find((shift) => shift.id === activeId);
  const pointsPerHour = roster.data?.pointsPerHour ?? 12;

  const postShift = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate(
      { leagueId: l.id, ...form, capacity: Number(form.capacity) },
      {
        onSuccess: (shift) => {
          setSelected(shift.id);
          setForm((previous) => ({ ...previous, title: "", place: "" }));
        },
      },
    );
  };

  const cancelActiveShift = () => {
    if (!activeShift) return;
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    cancelShift.mutate(activeShift.id, {
      onSuccess: () => {
        setConfirmCancel(false);
        setSelected(null);
      },
    });
  };

  return (
    <div className="space-y-6">
      <SectionHead
        kicker="Behind the desk"
        title={
          <>
            Steward <em>check-in</em>
          </>
        }
        right={
          <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
            <ShieldCheck size={13} /> {membership.role} · {shifts.length} shifts this week
          </span>
        }
      />

      <div className="border-ink bg-paper-2 flex flex-wrap items-center gap-x-6 gap-y-2 border-2 px-4 py-3 font-mono text-[10px]">
        <span className="flex items-center gap-1.5">
          <Users size={11} /> Only local signups can be checked in
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles size={11} /> {pointsPerHour} JP per volunteer hour
        </span>
        <span className="text-ink-3 ml-auto">Signing up mints nothing. Attendance is final.</span>
      </div>

      <details className="border-ink bg-paper-2 group border-2">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="kicker text-ink flex items-center gap-1.5">
            <Plus size={13} /> Post a shift
          </span>
          <span className="text-ink-3 font-mono text-[10px]">Appears on the roster immediately</span>
        </summary>
        <form
          onSubmit={postShift}
          className="border-ink/20 grid gap-3 border-t px-4 py-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="block sm:col-span-2">
            <span className="kicker text-ink-3 text-[9px]">Title</span>
            <input
              required
              minLength={3}
              maxLength={80}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Riverfront tree planting"
              className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
            />
          </label>
          <label className="block">
            <span className="kicker text-ink-3 text-[9px]">Chapter</span>
            <select
              value={form.chapterId}
              onChange={(event) => setForm({ ...form, chapterId: event.target.value })}
              className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
            >
              {l.chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.hood}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="kicker text-ink-3 text-[9px]">Place</span>
            <input
              required
              minLength={2}
              maxLength={80}
              value={form.place}
              onChange={(event) => setForm({ ...form, place: event.target.value })}
              placeholder="Mill River footbridge"
              className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
            />
          </label>
          <label className="block">
            <span className="kicker text-ink-3 text-[9px]">Day</span>
            <select
              value={form.day}
              onChange={(event) => setForm({ ...form, day: Number(event.target.value) })}
              className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
            >
              {DAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="kicker text-ink-3 text-[9px]">Start</span>
            <input
              type="time"
              required
              value={form.time}
              onChange={(event) => setForm({ ...form, time: event.target.value })}
              className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
            />
          </label>
          <label className="block">
            <span className="kicker text-ink-3 text-[9px]">Duration</span>
            <select
              value={form.duration}
              onChange={(event) => setForm({ ...form, duration: event.target.value })}
              className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
            >
              {["1h", "2h", "3h", "4h"].map((duration) => (
                <option key={duration} value={duration}>
                  {duration}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="kicker text-ink-3 text-[9px]">Capacity</span>
            <input
              type="number"
              min={1}
              max={100}
              required
              value={form.capacity}
              onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })}
              className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
            />
          </label>
          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              disabled={create.isPending}
              className="btn-press border-ink bg-mustard rounded-full border-2 px-5 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:opacity-40"
            >
              {create.isPending ? "Posting…" : "Put it on the roster"}
            </button>
            <span className="text-ink-3 ml-3 font-mono text-[9px]">Signups open the moment it is posted.</span>
          </div>
        </form>
      </details>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-2.5">
          {shifts.length === 0 && (
            <div className="border-ink/40 border-2 border-dashed px-4 py-8 text-center">
              <p className="font-display text-ink-3 italic">No shifts posted this week.</p>
            </div>
          )}
          {shifts.map((shift) => {
            const active = shift.id === activeId;
            const open = Math.max(0, shift.spots - shift.filled);
            return (
              <button
                key={shift.id}
                type="button"
                onClick={() => {
                  setSelected(shift.id);
                  setConfirmCancel(false);
                }}
                aria-pressed={active}
                className={cn(
                  "btn-press block w-full border-2 px-4 py-3 text-left transition-colors",
                  active ? "border-ink bg-paper shadow-[4px_4px_0_#f2b705]" : "border-ink/25 bg-paper-2 hover:bg-paper",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="kicker text-ink-3 text-[9px]">
                    {DAYS[shift.day]} · {shift.time}
                  </span>
                  <span className="font-mono text-[10px]">
                    {shift.filled}/{shift.spots} filled
                  </span>
                </div>
                <div className="font-display mt-1 text-lg leading-tight font-bold">{shift.title}</div>
                <div className="text-ink-2 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px]">
                  <span className="flex items-center gap-1">
                    <MapPin size={10} /> {shift.place}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={10} /> {shift.dur}
                  </span>
                  <span className={open > 0 ? "text-vermilion" : "text-ink-3"}>
                    {open > 0 ? `${open} spots open` : "Full"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <section className="border-ink bg-paper self-start border-2" aria-live="polite">
          <div className="border-ink border-b-2 px-5 py-4">
            <div className="kicker text-vermilion flex items-center justify-between gap-2">
              <span>The roster</span>
              <span className="text-ink-3 flex items-center gap-1 normal-case">
                <CalendarDays size={11} />
                {activeShift ? `${DAYS[activeShift.day]} ${activeShift.time}` : "—"}
              </span>
            </div>
            <h3 className="font-display mt-1 text-2xl leading-tight font-black">
              {activeShift?.title ?? "Choose a shift"}
            </h3>
            {activeShift && (
              <div className="text-ink-2 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px]">
                <span className="flex items-center gap-1">
                  <MapPin size={10} /> {activeShift.place}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={10} /> {activeShift.dur}
                </span>
                <span>
                  {activeShift.filled}/{activeShift.spots} filled
                </span>
                <button
                  type="button"
                  onClick={cancelActiveShift}
                  disabled={cancelShift.isPending}
                  className={cn(
                    "btn-press ml-auto rounded-full border-2 px-2.5 py-1 font-sans text-[8px] font-extrabold tracking-wider uppercase disabled:opacity-40",
                    confirmCancel ? "border-vermilion bg-vermilion text-paper" : "border-vermilion/50 text-vermilion",
                  )}
                >
                  {cancelShift.isPending ? "Cancelling…" : confirmCancel ? "Confirm cancel" : "Cancel shift"}
                </button>
              </div>
            )}
          </div>

          {roster.isPending && activeId ? (
            <div className="divide-ink/15 divide-y" aria-label="Loading roster">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-4">
                  <div className="bg-paper-3 h-9 w-9 animate-pulse rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="bg-paper-3 h-3 w-36 animate-pulse rounded" />
                    <div className="bg-paper-3 h-2.5 w-20 animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : roster.isError ? (
            <div className="text-ink-2 px-5 py-8 text-center font-serif text-sm">
              The roster could not be loaded. The API may still be starting.
            </div>
          ) : (
            <>
              {roster.data && roster.data.sealed > 0 && (
                <p className="border-ink/15 text-ink-3 border-b px-5 py-2 font-mono text-[9px]">
                  The printed edition already counted {roster.data.sealed} filled{" "}
                  {roster.data.sealed === 1 ? "spot" : "spots"}; those volunteers have no local profile.
                </p>
              )}
              {roster.data && roster.data.entries.length === 0 ? (
                <div className="grid place-items-center gap-2 px-6 py-12 text-center">
                  <UserRound size={22} className="text-ink-3" />
                  <p className="font-display text-ink-3 italic">No one has claimed this shift yet.</p>
                  <p className="text-ink-2 max-w-xs font-serif text-xs">
                    Locally claimed spots appear here the moment a member signs up.
                  </p>
                </div>
              ) : (
                <ol className="divide-ink/15 divide-y">
                  {(roster.data?.entries ?? []).map((entry) => {
                    const isBusy = busy && checkIn.variables?.profileId === entry.profile.id;
                    const final = entry.status === "attended";
                    return (
                      <li
                        key={entry.profile.id}
                        className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:flex-nowrap"
                      >
                        <span
                          className="text-paper font-display grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-black"
                          style={{ background: color }}
                          aria-hidden
                        >
                          {initials(entry.profile.displayName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-display truncate text-base leading-tight font-bold">
                            {entry.profile.displayName}
                          </div>
                          <div className="text-ink-3 font-mono text-[10px]">@{entry.profile.handle}</div>
                        </div>

                        {final ? (
                          <span className="text-forest flex items-center gap-1 font-mono text-[10px] font-semibold">
                            <Sparkles size={11} /> {fmt(Math.round(entry.hours * pointsPerHour))} JP
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                checkIn.mutate({
                                  shiftId: activeId!,
                                  profileId: entry.profile.id,
                                  status: "attended",
                                })
                              }
                              disabled={busy}
                              aria-label={`Mark ${entry.profile.displayName} attended`}
                              className="btn-press border-ink bg-forest text-paper flex items-center gap-1 rounded-full border-2 px-2.5 py-1 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
                            >
                              <Check size={10} /> {isBusy ? "Saving" : "Attended"}
                            </button>
                            {entry.status !== "no_show" && (
                              <button
                                type="button"
                                onClick={() =>
                                  checkIn.mutate({
                                    shiftId: activeId!,
                                    profileId: entry.profile.id,
                                    status: "no_show",
                                  })
                                }
                                disabled={busy}
                                aria-label={`Mark ${entry.profile.displayName} as a no-show`}
                                className="btn-press border-ink bg-paper text-ink-2 hover:bg-paper-2 flex items-center gap-1 rounded-full border-2 px-2.5 py-1 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
                              >
                                <X size={10} /> No-show
                              </button>
                            )}
                          </div>
                        )}

                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 font-sans text-[8px] font-extrabold tracking-wider uppercase",
                            STATUS_STYLE[entry.status],
                          )}
                        >
                          {entry.status === "no_show" ? "No-show" : entry.status}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}

          <div className="border-ink/15 text-ink-3 border-t px-5 py-3 font-mono text-[9px]">
            A confirmed attendance writes one ledger row: {pointsPerHour} JP per hour, once.
          </div>
        </section>
      </div>

      <ProjectReview />
    </div>
  );
}
