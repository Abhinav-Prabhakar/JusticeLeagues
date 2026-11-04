import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Car,
  Check,
  Clock,
  Droplets,
  Hand,
  Laptop,
  MapPin,
  Megaphone,
  Shirt,
  UserRound,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { CAUSES, weekDays, type Bring } from "../data";
import { Emblem, SectionHead } from "../ui";
import { useApp } from "../ctx";
import { useEdition, useCancelShift, useSignupShift } from "../lib/queries";
import { isSignedUp } from "../lib/api";
import { cn } from "../utils/cn";

const BRING: Record<Bring, { icon: LucideIcon; label: string }> = {
  gloves: { icon: Hand, label: "Gloves" },
  water: { icon: Droplets, label: "Water" },
  vest: { icon: Shirt, label: "Hi-vis vest" },
  laptop: { icon: Laptop, label: "Laptop" },
  car: { icon: Car, label: "Car" },
};

export function Dispatch() {
  const { cause } = useApp();
  const { data } = useEdition();
  const signup = useSignupShift();
  const cancel = useCancelShift();
  const navigate = useNavigate();
  const location = useLocation();
  const me = data.me;
  const days = useMemo(() => weekDays(), []);
  const [sel, setSel] = useState(days.find((d) => d.isToday)?.idx ?? 0);

  const leagueFor = (id: string) => data.leagues.find((l) => l.id === id);

  const filtered = data.shifts.filter((s) => {
    if (cause === "all") return true;
    return leagueFor(s.league)?.cause === cause;
  });
  const today = filtered.filter((s) => s.day === sel).sort((a, b) => a.time.localeCompare(b.time));

  const toggleShift = (shift: (typeof data.shifts)[number]) => {
    if (!me) {
      navigate(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    if (isSignedUp(me, shift.id)) cancel.mutate(shift);
    else signup.mutate(shift);
  };

  return (
    <section id="dispatch">
      <SectionHead
        kicker="Volunteer shifts"
        title={
          <>
            The <em>Dispatch</em>
          </>
        }
        icon={<Megaphone size={40} className="text-vermilion" strokeWidth={1.8} />}
        right={
          <div className="text-ink-2 flex items-center gap-2 font-mono text-[11px]">
            <UserRound size={14} /> <span className="font-semibold">{me?.signups.length ?? 0}</span> on your roster
          </div>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* week strip */}
        <div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d) => {
              const shifts = filtered.filter((s) => s.day === d.idx);
              const on = sel === d.idx;
              return (
                <button
                  key={d.idx}
                  onClick={() => setSel(d.idx)}
                  className={cn(
                    "group border-ink relative flex flex-col items-center gap-1.5 border-2 px-1 pt-2 pb-3 transition-all duration-300",
                    on
                      ? "bg-ink text-paper -translate-y-1 shadow-[4px_4px_0_#d9381e]"
                      : "bg-paper hover:bg-paper-2 hover:-translate-y-0.5",
                  )}
                >
                  <span className="font-mono text-[10px] font-semibold tracking-wider uppercase opacity-70">
                    {d.date.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span className="font-display text-2xl leading-none font-black md:text-3xl">{d.date.getDate()}</span>
                  <span className="flex h-8 flex-col-reverse flex-wrap content-center items-center justify-center gap-[3px]">
                    {shifts.slice(0, 4).map((s) => {
                      const shiftCause = leagueFor(s.league)?.cause;
                      return (
                        <span
                          key={s.id}
                          className="ring-paper/60 h-2 w-2 rounded-full ring-1 transition-transform duration-300 group-hover:scale-125"
                          style={{
                            background: shiftCause
                              ? CAUSES[shiftCause].color === "#14110d" && on
                                ? "#f4eee1"
                                : CAUSES[shiftCause].color
                              : "#14110d",
                          }}
                        />
                      );
                    })}
                  </span>
                  {d.isToday && (
                    <span
                      className={cn(
                        "border-ink absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2",
                        on ? "bg-mustard" : "bg-vermilion",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-ink/50 mt-5 flex items-center gap-3 border-2 border-dashed p-4">
            <span className="bg-mustard grid h-12 w-12 shrink-0 place-items-center rounded-full">
              <Wind size={22} />
            </span>
            <div className="flex-1">
              <div className="mb-1.5 flex justify-between font-mono text-[11px] font-semibold">
                <span>{today.length} shifts</span>
                <span>{today.reduce((a, s) => a + s.spots - s.filled, 0)} spots open</span>
              </div>
              <div className="bg-paper-3 h-2.5 overflow-hidden rounded-full">
                <div
                  key={sel + cause}
                  className="animate-grow-x bg-vermilion h-full rounded-full"
                  style={{
                    width: `${today.length ? (today.reduce((a, s) => a + s.filled, 0) / today.reduce((a, s) => a + s.spots, 0)) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* tickets */}
        <div key={`${sel}-${cause}`} className="flex flex-col gap-3.5">
          {today.length === 0 && (
            <div className="animate-fade-in border-ink/40 grid place-items-center gap-3 border-2 border-dashed py-14 text-center">
              <Megaphone size={34} className="text-ink-3" />
              <p className="font-display text-ink-3 text-xl italic">Quiet on the wire today.</p>
            </div>
          )}
          {today.map((s, i) => {
            const l = leagueFor(s.league);
            if (!l) return null;
            const c = CAUSES[l.cause];
            const Icon = c.icon;
            const meSigned = me ? isSignedUp(me, s.id) : false;
            const filled = s.filled;
            return (
              <article
                key={s.id}
                data-open="false"
                className="expand-host animate-rise group border-ink bg-paper relative flex border-2 transition-shadow duration-300 hover:shadow-[5px_5px_0_#14110d]"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div
                  className="border-ink text-paper relative flex w-24 shrink-0 flex-col items-center justify-center gap-1 border-r-2 border-dashed px-2 py-3 md:w-28"
                  style={{ background: c.color }}
                >
                  <Icon
                    size={22}
                    className="transition-transform duration-500 group-hover:scale-125 group-hover:rotate-[-10deg]"
                  />
                  <span className="font-mono text-xl leading-none font-semibold">{s.time}</span>
                  <span className="flex items-center gap-1 font-mono text-[10px] opacity-80">
                    <Clock size={10} />
                    {s.dur}
                  </span>
                  <span className="border-ink bg-paper absolute -top-[2px] -right-[9px] h-[9px] w-[16px] rounded-b-full border-2 border-t-0" />
                  <span className="border-ink bg-paper absolute -right-[9px] -bottom-[2px] h-[9px] w-[16px] rounded-t-full border-2 border-b-0" />
                </div>
                <div className="min-w-0 flex-1 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-display text-lg leading-tight font-bold md:text-xl">{s.title}</h4>
                      <div className="mt-1 flex items-center gap-2">
                        <Emblem cause={l.cause} size={18} />
                        <span className="text-ink-3 truncate font-sans text-[10px] font-bold tracking-wider uppercase">
                          {l.name}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleShift(s)}
                      className={cn(
                        "btn-press border-ink flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3.5 py-2 font-sans text-[11px] font-extrabold tracking-wider uppercase",
                        meSigned ? "bg-ink text-paper" : "bg-mustard",
                      )}
                    >
                      <span key={String(meSigned)} className="animate-pop">
                        {meSigned ? <Check size={13} strokeWidth={3} /> : <UserRound size={13} strokeWidth={2.6} />}
                      </span>
                      {meSigned ? "In" : "Sign up"}
                    </button>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-[5px]">
                    {Array.from({ length: s.spots }).map((_, j) => (
                      <span
                        key={j}
                        className={cn(
                          "border-ink h-2.5 w-2.5 rounded-full border transition-all duration-300",
                          j < filled ? "" : "bg-transparent",
                        )}
                        style={{
                          background: j < filled ? c.color : undefined,
                          transform: meSigned && j === filled - 1 ? "scale(1.5)" : undefined,
                          transitionDelay: `${j * 12}ms`,
                        }}
                      />
                    ))}
                    <span className="text-ink-3 ml-1.5 font-mono text-[10px] font-semibold">
                      {s.spots - filled === 0 ? "Full" : `${s.spots - filled} left`}
                    </span>
                  </div>
                  <div className="expand">
                    <div>
                      <div className="border-ink/40 mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-dashed pt-3">
                        <span className="flex items-center gap-1.5 font-sans text-xs font-semibold">
                          <MapPin size={14} className="text-vermilion" /> {s.place}
                        </span>
                        {s.bring.length > 0 && (
                          <span className="text-ink-2 flex items-center gap-2">
                            <span className="kicker text-ink-3">Bring</span>
                            {s.bring.map((b) => {
                              const B = BRING[b];
                              return (
                                <span
                                  key={b}
                                  title={B.label}
                                  className="border-ink bg-paper-2 grid h-7 w-7 place-items-center rounded-full border transition-transform hover:scale-125"
                                >
                                  <B.icon size={13} />
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
