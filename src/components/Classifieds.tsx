import { useState } from "react";
import {
  ArrowRight,
  Check,
  Hammer,
  Languages,
  Lightbulb,
  Printer,
  Table2,
  Truck,
  Tag,
  HandHeart,
  HandHelping,
  type LucideIcon,
} from "lucide-react";
import { CAUSES, CLASSIFIEDS, leagueById } from "../data";
import { Emblem, Reveal, SectionHead } from "../ui";
import { useApp } from "../ctx";
import { cn } from "../utils/cn";

const ICONS: Record<string, LucideIcon> = {
  drill: Hammer,
  table: Table2,
  lang: Languages,
  truck: Truck,
  print: Printer,
  bulb: Lightbulb,
};

export function Classifieds() {
  const [kind, setKind] = useState<"all" | "offer" | "want">("all");
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const { toast } = useApp();
  const list = CLASSIFIEDS.filter((c) => kind === "all" || c.kind === kind);

  return (
    <section id="classifieds">
      <SectionHead
        kicker="Shared resources"
        title={
          <>
            The <em>Classifieds</em>
          </>
        }
        icon={<Tag size={40} className="text-rose" strokeWidth={1.8} />}
        right={
          <div className="border-ink bg-paper flex rounded-full border-2 p-0.5">
            {[
              { k: "all" as const, icon: <Tag size={14} />, l: "All" },
              { k: "offer" as const, icon: <HandHeart size={14} />, l: "Offering" },
              { k: "want" as const, icon: <HandHelping size={14} />, l: "Wanted" },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setKind(t.k)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-[11px] font-extrabold tracking-wider uppercase transition-all duration-300",
                  kind === t.k ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2",
                )}
              >
                {t.icon}
                <span className={cn(kind === t.k ? "inline" : "hidden sm:inline")}>{t.l}</span>
              </button>
            ))}
          </div>
        }
      />
      <div key={kind} className="border-ink grid border-t border-l sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c, i) => {
          const l = leagueById(c.league);
          const Icon = ICONS[c.icon];
          const color = CAUSES[l.cause].color;
          const offer = c.kind === "offer";
          const done = claimed.has(c.id);
          return (
            <Reveal key={c.id} delay={i * 80} className="border-ink border-r border-b">
              <article
                data-open="false"
                className="expand-host group relative h-full overflow-hidden p-5 transition-colors duration-500"
                style={{ background: offer ? undefined : "rgba(242,183,5,.16)" }}
              >
                <div className="flex items-start justify-between">
                  <span
                    className="kicker -rotate-2 border-2 px-2 py-1 transition-transform duration-300 group-hover:rotate-0"
                    style={{ borderColor: offer ? "#1b7f5c" : "#d9381e", color: offer ? "#1b7f5c" : "#d9381e" }}
                  >
                    {offer ? "Offering" : "Wanted"}
                  </span>
                  <span className="text-ink-3 font-mono text-[11px]">{c.when} ago</span>
                </div>
                <div className="mt-4 flex gap-4">
                  <span
                    className="border-ink bg-paper grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-12"
                    style={{ color }}
                  >
                    <Icon size={28} strokeWidth={1.9} />
                  </span>
                  <h4 className="font-display text-xl leading-tight font-bold text-balance">{c.title}</h4>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Emblem cause={l.cause} size={22} />
                  <span className="text-ink-3 truncate font-sans text-[10px] font-bold tracking-wider uppercase">
                    {l.hood}
                  </span>
                </div>

                <div className="expand">
                  <div>
                    <div className="border-ink/50 mt-4 flex items-center justify-between gap-3 border-t border-dashed pt-3">
                      <span className="text-ink-2 font-mono text-[11px] font-semibold">{c.meta}</span>
                      <button
                        onClick={() => {
                          if (done) return;
                          setClaimed((s) => new Set(s).add(c.id));
                          toast(offer ? "Claimed — the League will be in touch" : "Offer sent — thank you");
                        }}
                        className="btn-press border-ink bg-ink text-paper hover:bg-vermilion flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase"
                      >
                        {done ? <Check size={12} strokeWidth={3} /> : <ArrowRight size={12} strokeWidth={3} />}
                        {done ? "Sent" : offer ? "Claim" : "I can help"}
                      </button>
                    </div>
                  </div>
                </div>

                {done && (
                  <span className="animate-stamp border-vermilion font-display text-vermilion/80 pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded border-4 px-4 py-1 text-3xl font-black uppercase">
                    {offer ? "Claimed" : "Pledged"}
                  </span>
                )}
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
