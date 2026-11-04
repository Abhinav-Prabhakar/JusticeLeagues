import { CalendarDays, Clock, MapPin } from "lucide-react";
import { SectionHead } from "../../ui";
import { useLeagueContext } from "./context";
import { ShiftList } from "./ShiftList";

export default function LeagueShifts() {
  const { league: l, edition } = useLeagueContext();
  const shifts = edition.shifts
    .filter((shift) => shift.league === l.id)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const open = shifts.reduce((sum, shift) => sum + Math.max(0, shift.spots - shift.filled), 0);

  return (
    <div className="space-y-6">
      <SectionHead
        kicker="On the roster"
        title={
          <>
            Open <em>shifts</em>
          </>
        }
        right={
          <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
            <CalendarDays size={13} /> {shifts.length} scheduled · {open} spots open
          </span>
        }
      />

      <div className="border-ink bg-paper-2 flex flex-wrap items-center gap-x-6 gap-y-2 border-2 px-4 py-3 font-mono text-[10px]">
        <span className="flex items-center gap-1.5">
          <MapPin size={11} /> {l.hood} + chapters
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={11} /> Signup holds your spot; a steward checks you in
        </span>
        <span className="text-ink-3 ml-auto">Points land after attendance</span>
      </div>

      <ShiftList shifts={shifts} empty="This league has no open shifts this week." />
    </div>
  );
}
