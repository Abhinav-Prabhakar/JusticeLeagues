import { CalendarDays, MapPin, Sparkles, Users } from "lucide-react";
import { CAUSES, fmt } from "../../data";
import { activeMembership } from "../../lib/api";
import { useLeagueDetail } from "../../lib/queries";
import { SectionHead } from "../../ui";
import { useLeagueContext } from "./context";

export default function LeagueChapters() {
  const { league: l, edition } = useLeagueContext();
  const c = CAUSES[l.cause];
  const color = c.color === "#14110d" ? "#4a4338" : c.color;
  const membership = activeMembership(edition.me, l.id);
  const { data: detail, isPending } = useLeagueDetail(l.id);
  const members = detail?.members ?? [];
  const total = l.points || 1;

  return (
    <div className="space-y-6">
      <SectionHead
        kicker="Citywide structure"
        title={
          <>
            Neighbourhood <em>chapters</em>
          </>
        }
        right={
          <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
            <Sparkles size={13} /> {l.chapters.length} chapters · every point rolls up
          </span>
        }
      />

      <div className="grid gap-5 md:grid-cols-3">
        {l.chapters.map((chapter, index) => {
          const share = Math.round((chapter.points / total) * 100);
          const chapterMembers = members.filter((member) => member.chapterId === chapter.id).length;
          const chapterShifts = edition.shifts.filter((shift) => shift.chapterId === chapter.id).length;
          const isMine = chapter.id === membership?.chapterId;

          return (
            <article
              key={chapter.id}
              className="border-ink bg-paper relative flex flex-col border-2"
              style={isMine ? { boxShadow: "6px 6px 0 #f2b705" } : undefined}
            >
              <div className="h-2 w-full" style={{ background: color }} />
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="kicker text-ink-3 text-[9px]">
                    {index === 0 ? "Founding chapter" : `Chapter ${String(index + 1).padStart(2, "0")}`}
                  </div>
                  {isMine && (
                    <span className="bg-mustard border-ink rounded-full border px-2 py-0.5 font-sans text-[8px] font-extrabold tracking-wider uppercase">
                      Your chapter
                    </span>
                  )}
                </div>
                <h2 className="font-display mt-1 text-2xl leading-none font-black">{chapter.hood}</h2>
                <div className="text-ink-2 mt-1 flex items-center gap-1 font-mono text-[10px]">
                  <MapPin size={10} /> {chapter.name}
                </div>

                <div className="mt-5 flex items-end gap-1.5">
                  <span className="font-display text-4xl leading-none font-black">{fmt(chapter.points)}</span>
                  <span className="text-ink-3 mb-0.5 font-mono text-[10px]">JP</span>
                </div>
                <div className="text-ink-3 mt-2 flex items-center justify-between font-mono text-[9px]">
                  <span>{share}% of the league</span>
                  <span>{fmt(total)} total</span>
                </div>
                <div className="bg-paper-3 mt-1.5 h-2 overflow-hidden rounded-full">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(share, 2)}%`, background: color }} />
                </div>

                <div className="border-ink/15 mt-5 grid grid-cols-2 gap-2 border-t pt-3">
                  <div className="flex items-center gap-1.5 font-mono text-[10px]">
                    <Users size={11} />{" "}
                    {isPending ? "…" : `${chapterMembers} ${chapterMembers === 1 ? "member" : "members"}`}
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px]">
                    <CalendarDays size={11} /> {chapterShifts} {chapterShifts === 1 ? "shift" : "shifts"}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="border-ink/40 border-2 border-dashed p-4">
        <p className="text-ink-2 font-serif text-sm">
          Chapter points are the sealed history plus every ledger entry filed against that chapter. Because each award
          lands in exactly one chapter, the chapter totals always add up to the citywide league total.
        </p>
      </div>
    </div>
  );
}
