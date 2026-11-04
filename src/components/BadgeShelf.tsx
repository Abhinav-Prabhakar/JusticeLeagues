import {
  Award,
  BookOpen,
  CalendarCheck,
  FileCheck2,
  Flame,
  Map,
  Medal,
  PenLine,
  Shield,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { BadgeDTO, StreakDTO } from "../lib/types";
import { cn } from "../utils/cn";

const ICONS: Record<string, LucideIcon> = {
  pen: PenLine,
  "calendar-check": CalendarCheck,
  "file-check": FileCheck2,
  sparkles: Sparkles,
  trophy: Trophy,
  flame: Flame,
  map: Map,
  book: BookOpen,
  shield: Shield,
  medal: Medal,
};

const TONES: Record<string, { bg: string; text: string }> = {
  milestone: { bg: "#2347c5", text: "#1b7f5c" },
  streak: { bg: "#d9381e", text: "#d9381e" },
  craft: { bg: "#14110d", text: "#14110d" },
  role: { bg: "#e8a200", text: "#c0763a" },
};

function BadgeCard({ badge }: { badge: BadgeDTO }) {
  const Icon = ICONS[badge.icon] ?? Award;
  const earned = Boolean(badge.awardedAt);
  const tone = TONES[badge.category] ?? TONES.milestone;

  return (
    <li
      className={cn(
        "border-ink relative flex items-start gap-2.5 border-2 px-2.5 py-2.5 transition-colors",
        earned ? "bg-paper" : "border-ink/20 bg-paper-2/50",
      )}
      title={badge.description}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ink",
          !earned && "opacity-30 grayscale",
        )}
        style={{ background: earned ? tone.bg : "#ddd1b5" }}
        aria-hidden
      >
        <Icon size={16} className={earned ? "text-paper" : "text-ink-2"} />
      </span>
      <div className="min-w-0">
        <div className={cn("font-display truncate text-xs leading-tight font-bold", !earned && "text-ink-3")}>
          {badge.label}
        </div>
        <div className="text-ink-3 mt-0.5 line-clamp-2 font-serif text-[10px] leading-snug">
          {earned ? badge.description : "Not yet earned."}
        </div>
        {earned && badge.awardedAt && (
          <div className="text-ink-3 mt-1 font-mono text-[8px] tracking-wider uppercase">
            {new Date(badge.awardedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </div>
        )}
      </div>
      <span className="sr-only">{earned ? "Earned" : "Locked"}</span>
    </li>
  );
}

export function BadgeShelf({ badges }: { badges: BadgeDTO[] }) {
  const earned = badges.filter((badge) => badge.awardedAt).length;
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-2xl leading-none font-black italic">Your badges</h3>
        <span className="text-ink-3 font-mono text-[10px]">
          {earned} of {badges.length} earned
        </span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {badges.map((badge) => (
          <BadgeCard key={badge.key} badge={badge} />
        ))}
      </ul>
    </div>
  );
}

export function StreakCard({ streak }: { streak: StreakDTO }) {
  return (
    <div className="border-ink bg-paper-2 border-2 px-4 py-3">
      <div className="kicker text-vermilion flex items-center gap-1.5">
        <Flame size={12} fill="currentColor" /> Weeks on
      </div>
      <div className="mt-1 flex items-end gap-2">
        <span className="font-display text-4xl leading-none font-black">{streak.current}</span>
        <span className="text-ink-3 mb-0.5 font-mono text-[10px]">current</span>
        <span className="text-ink-3 ml-auto mb-0.5 font-mono text-[10px]">best {streak.longest}</span>
      </div>
      <p className="text-ink-2 mt-2 font-serif text-[11px]">
        {streak.weekActive
          ? "This week already counts. Show up again next week to keep it alive."
          : "No points yet this week. One shift or one approval restarts the count."}
      </p>
    </div>
  );
}
