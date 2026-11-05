import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Check,
  Clock,
  Copy,
  Link2,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { CAUSES, fmt } from "../../data";
import { activeMembership, handleLabel } from "../../lib/api";
import {
  useCancelShiftAsSteward,
  useCheckIn,
  useCreateInvite,
  useCreateShift,
  useShiftRoster,
  useUpdateShift,
} from "../../lib/queries";
import type { ChapterDTO, ShiftDTO } from "../../lib/types";
import type { CreatedInviteDTO, InviteRole } from "../../lib/types";
import { SectionHead } from "../../ui";
import { cn } from "../../utils/cn";
import { useLeagueContext } from "./context";
import { DAYS, initials } from "./constants";
import { ProjectReview } from "./ProjectReview";
import { AnomalyQueue } from "./AnomalyQueue";

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
  const createInvite = useCreateInvite();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    role: "member" as InviteRole,
    chapterId: l.chapters[0]?.id ?? "",
    note: "",
    days: 7,
  });
  const [minted, setMinted] = useState<CreatedInviteDTO | null>(null);
  const [copied, setCopied] = useState(false);
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

      <details className="border-ink bg-paper-2 group border-2" onToggle={() => setCopied(false)}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="kicker text-ink flex items-center gap-1.5">
            <Link2 size={13} /> Invite a neighbour
          </span>
          <span className="text-ink-3 font-mono text-[10px]">Single-use link · hashed at rest</span>
        </summary>
        <div className="border-ink/20 border-t px-4 py-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setMinted(null);
              setCopied(false);
              createInvite.mutate(
                {
                  leagueId: l.id,
                  role: inviteForm.role,
                  chapterId: inviteForm.chapterId || undefined,
                  note: inviteForm.note || undefined,
                  days: Number(inviteForm.days),
                },
                { onSuccess: (result) => setMinted(result) },
              );
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <fieldset className="sm:col-span-2 lg:col-span-4">
              <legend className="kicker text-ink-3 mb-1.5 text-[9px]">What are they joining as?</legend>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "member" as const, label: "A member", icon: UserRound },
                  { value: "steward" as const, label: "A steward", icon: ShieldCheck },
                ].map((option) => {
                  const on = inviteForm.role === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setInviteForm({ ...inviteForm, role: option.value })}
                      className={cn(
                        "border-ink flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase transition-colors",
                        on ? "bg-ink text-paper" : "bg-paper hover:bg-paper-3",
                      )}
                    >
                      <option.icon size={12} /> {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label className="block sm:col-span-2">
              <span className="kicker text-ink-3 text-[9px]">Home chapter</span>
              <select
                value={inviteForm.chapterId}
                onChange={(event) => setInviteForm({ ...inviteForm, chapterId: event.target.value })}
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
              <span className="kicker text-ink-3 text-[9px]">Link expires in</span>
              <select
                value={inviteForm.days}
                onChange={(event) => setInviteForm({ ...inviteForm, days: Number(event.target.value) })}
                className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
              >
                {[1, 7, 14, 30].map((days) => (
                  <option key={days} value={days}>
                    {days === 1 ? "1 day" : `${days} days`}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="kicker text-ink-3 text-[9px]">Note (optional)</span>
              <input
                maxLength={120}
                value={inviteForm.note}
                onChange={(event) => setInviteForm({ ...inviteForm, note: event.target.value })}
                placeholder="Bring the Tuesday crew"
                className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
              <button
                type="submit"
                disabled={createInvite.isPending}
                className="btn-press border-ink bg-verdant rounded-full border-2 px-5 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:opacity-40"
              >
                {createInvite.isPending ? "Minting…" : "Mint the invitation"}
              </button>
              <span className="text-ink-3 font-mono text-[9px]">
                {inviteForm.role === "steward"
                  ? "Steward links can post shifts and approve projects."
                  : "Member links join the roster and can claim shifts."}
              </span>
            </div>
          </form>

          {minted && (
            <div className="border-ink bg-paper mt-4 border-2 border-dashed px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="kicker text-ink-3 text-[9px]">Copy this now — it is not shown again</span>
                <span className="text-ink-3 font-mono text-[9px]">
                  {new Date(minted.preview.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={`${window.location.origin}${minted.path}`}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="Invitation link"
                  className="border-ink bg-paper-2 min-w-0 flex-1 border-2 px-2.5 py-2 font-mono text-[10px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(`${window.location.origin}${minted.path}`)
                      .then(() => setCopied(true))
                      .catch(() => setCopied(false));
                  }}
                  className="btn-press border-ink bg-mustard flex items-center gap-1.5 rounded-full border-2 px-3.5 py-2 font-sans text-[9px] font-extrabold tracking-wider uppercase"
                >
                  {copied ? <Check size={11} strokeWidth={3} /> : <Copy size={11} />}
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
              <p className="text-ink-3 mt-2 font-mono text-[9px]">
                {minted.preview.role} · {minted.preview.chapterHood ?? "home chapter"} · single use
              </p>
            </div>
          )}
        </div>
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
                    {shift.waitlist > 0 ? ` · ${shift.waitlist} waiting` : ""}
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
          {activeShift && <ShiftEditor key={activeShift.id} shift={activeShift} chapters={l.chapters} />}
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
                  {activeShift.waitlist > 0 ? ` · ${activeShift.waitlist} waiting` : ""}
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
            <div role="status" className="divide-ink/15 divide-y" aria-label="Loading roster">
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
                    const waitlisted = entry.status === "waitlist";
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
                          <div className="text-ink-3 font-mono text-[10px]">{handleLabel(entry.profile)}</div>
                        </div>

                        {final ? (
                          <span className="text-forest flex items-center gap-1 font-mono text-[10px] font-semibold">
                            <Sparkles size={11} /> {fmt(Math.round(entry.hours * pointsPerHour))} JP
                          </span>
                        ) : waitlisted ? (
                          <span className="text-ink-3 font-mono text-[9px]">Waiting · promoted when a spot opens</span>
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

      <section aria-labelledby="safeguarding" className="border-ink bg-paper-2 border-2 p-5">
        <div className="kicker text-vermilion flex items-center gap-1.5">
          <ShieldCheck size={12} /> Safeguarding on your roster
        </div>
        <h2 id="safeguarding" className="font-display mt-1 text-2xl leading-tight font-black">
          Keep young neighbours safe, without collecting their details
        </h2>
        <div className="text-ink-2 mt-2 grid gap-3 font-serif text-sm sm:grid-cols-3">
          <p>
            <strong className="font-sans text-[10px] tracking-wider uppercase">Contact.</strong> A neighbour under 18
            is shown by name only. Their handle and email are withheld from every view, including yours. Reach their
            guardian through the league, not by collecting a phone number.
          </p>
          <p>
            <strong className="font-sans text-[10px] tracking-wider uppercase">Photos.</strong> Get a guardian&apos;s
            written consent before publishing a photo of anyone under 18. No photo is ever required to earn points, and
            a young neighbour can decline at any time.
          </p>
          <p>
            <strong className="font-sans text-[10px] tracking-wider uppercase">Reports.</strong> If a young person is at
            risk, report the item to the editor immediately. Hiding it in your league is the first step, not the last.
          </p>
        </div>
        <Link
          to="/privacy#young-neighbours"
          className="kicker text-vermilion hover:text-ink mt-3 inline-flex transition-colors"
        >
          Read the full policy →
        </Link>
      </section>

      <ProjectReview />
      <AnomalyQueue leagueId={l.id} />
    </div>
  );
}

function ShiftEditor({ shift, chapters }: { shift: ShiftDTO; chapters: ChapterDTO[] }) {
  const update = useUpdateShift();
  const [form, setForm] = useState({
    chapterId: shift.chapterId,
    title: shift.title,
    day: shift.day,
    time: shift.time,
    duration: shift.dur,
    capacity: shift.spots,
    place: shift.place,
  });

  return (
    <details className="border-ink bg-paper-2 mt-4 border-2">
      <summary className="text-ink-2 flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
        <span className="kicker text-ink text-[9px]">Edit this shift</span>
        <span className="font-mono text-[9px]">capacity cannot drop below signups</span>
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate({ shiftId: shift.id, ...form, capacity: Number(form.capacity) });
        }}
        className="border-ink/20 grid gap-2.5 border-t px-3 py-3 sm:grid-cols-2"
      >
        <label className="block sm:col-span-2">
          <span className="kicker text-ink-3 text-[9px]">Title</span>
          <input
            required
            minLength={3}
            maxLength={80}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            className="border-ink bg-paper mt-1 w-full border-2 px-2 py-1.5 font-sans text-xs"
          />
        </label>
        <label className="block">
          <span className="kicker text-ink-3 text-[9px]">Chapter</span>
          <select
            value={form.chapterId}
            onChange={(event) => setForm({ ...form, chapterId: event.target.value })}
            className="border-ink bg-paper mt-1 w-full border-2 px-2 py-1.5 font-sans text-xs"
          >
            {chapters.map((chapter) => (
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
            className="border-ink bg-paper mt-1 w-full border-2 px-2 py-1.5 font-sans text-xs"
          />
        </label>
        <label className="block">
          <span className="kicker text-ink-3 text-[9px]">Day</span>
          <select
            value={form.day}
            onChange={(event) => setForm({ ...form, day: Number(event.target.value) })}
            className="border-ink bg-paper mt-1 w-full border-2 px-2 py-1.5 font-sans text-xs"
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
            className="border-ink bg-paper mt-1 w-full border-2 px-2 py-1.5 font-sans text-xs"
          />
        </label>
        <label className="block">
          <span className="kicker text-ink-3 text-[9px]">Duration</span>
          <select
            value={form.duration}
            onChange={(event) => setForm({ ...form, duration: event.target.value })}
            className="border-ink bg-paper mt-1 w-full border-2 px-2 py-1.5 font-sans text-xs"
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
            min={Math.max(1, shift.filled)}
            max={100}
            required
            value={form.capacity}
            onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })}
            className="border-ink bg-paper mt-1 w-full border-2 px-2 py-1.5 font-sans text-xs"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={update.isPending}
            className="btn-press border-ink bg-mustard rounded-full border-2 px-4 py-2 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
          >
            {update.isPending ? "Saving…" : "Save shift"}
          </button>
        </div>
      </form>
    </details>
  );
}
