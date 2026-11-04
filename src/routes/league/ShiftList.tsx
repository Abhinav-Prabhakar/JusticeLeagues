import { useLocation, useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import type { ShiftDTO } from "../../lib/types";
import { isSignedUp } from "../../lib/api";
import { useCancelShift, useEdition, useSignupShift } from "../../lib/queries";
import { cn } from "../../utils/cn";
import { DAYS } from "./constants";

export function ShiftList({ shifts, empty = "No shifts posted this week." }: { shifts: ShiftDTO[]; empty?: string }) {
  const { data } = useEdition();
  const signup = useSignupShift();
  const cancel = useCancelShift();
  const navigate = useNavigate();
  const location = useLocation();
  const me = data.me;
  const pending = signup.isPending || cancel.isPending;

  if (shifts.length === 0) {
    return (
      <div className="border-ink/40 border-2 border-dashed py-10 text-center">
        <p className="font-display text-ink-3 text-lg italic">{empty}</p>
      </div>
    );
  }

  const toggle = (shift: ShiftDTO) => {
    if (!me) {
      navigate(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    if (isSignedUp(me, shift.id)) cancel.mutate(shift);
    else signup.mutate(shift);
  };

  return (
    <div className="divide-ink/20 border-ink divide-y-2 border-y-2">
      {shifts.map((s) => {
        const meSigned = me ? isSignedUp(me, s.id) : false;
        const full = s.filled >= s.spots && !meSigned;
        const label = meSigned ? "You're in" : full ? "Full" : "Sign up";

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
            <div className="flex items-center gap-[3px]" aria-label={`${s.filled} of ${s.spots} spots filled`}>
              {Array.from({ length: Math.min(s.spots, 10) }).map((_, i) => (
                <span
                  key={i}
                  className="border-ink h-2 w-2 rounded-full border"
                  style={{
                    background:
                      i < Math.round((s.filled / s.spots) * Math.min(s.spots, 10)) ? "#d9381e" : "transparent",
                  }}
                />
              ))}
            </div>
            <button
              onClick={() => toggle(s)}
              disabled={pending || full}
              aria-pressed={meSigned}
              className={cn(
                "btn-press border-ink shrink-0 rounded-full border-2 px-3.5 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:cursor-not-allowed disabled:opacity-40",
                meSigned ? "bg-ink text-paper" : "bg-mustard",
              )}
            >
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
