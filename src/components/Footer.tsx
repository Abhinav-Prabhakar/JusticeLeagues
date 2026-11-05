import { Scale, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { CAUSES, CAUSE_KEYS } from "../data";
import { useApp } from "../ctx";

export function Footer() {
  const { setCause } = useApp();
  return (
    <footer className="bg-paper-2 pt-14 pb-8">
      <div className="mx-auto max-w-[1320px] px-4 md:px-8">
        <div className="rule-thick-thin" />
        <div className="flex flex-col items-center gap-6 py-10 text-center">
          <Scale size={34} className="text-vermilion" strokeWidth={2} />
          <div className="font-display text-5xl leading-none font-black tracking-tight md:text-7xl">
            Justice <em>Leagues</em>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {CAUSE_KEYS.map((k) => {
              const c = CAUSES[k];
              return (
                <a
                  key={k}
                  href="#top"
                  title={c.label}
                  onClick={() => setCause(k)}
                  className="border-ink text-paper grid h-11 w-11 place-items-center rounded-full border-2 transition-all duration-300 hover:-translate-y-1.5 hover:rotate-6 hover:shadow-[3px_3px_0_#14110d]"
                  style={{ background: c.color }}
                >
                  <c.icon size={18} />
                </a>
              );
            })}
          </div>
          <nav aria-label="Sections" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {[
              { to: "/", label: "Front page" },
              { to: "/leagues", label: "The Atlas" },
              { to: "/ledger", label: "The public record" },
              { to: "/dashboard", label: "Your desk" },
              { to: "/inbox", label: "Your inbox" },
              { to: "/#charter", label: "The Charter" },
              { to: "/terms", label: "House rules" },
              { to: "/privacy", label: "Privacy & data" },
            ].map((item) => (
              <Link key={item.to} to={item.to} className="kicker text-ink-2 hover:text-vermilion inline-flex min-h-6 items-center px-1 transition-colors">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-ink text-ink-2 flex flex-wrap items-center justify-between gap-3 border-t pt-5 font-mono text-[11px]">
          <span>© {new Date().getFullYear()} The Justice Leagues. Printed on recycled pixels.</span>
          <span className="text-ink-3">Runs locally · no telemetry · points are server-authored</span>
          <span className="flex items-center gap-1.5">
            <Sparkles size={12} className="text-vermilion" /> Set in Playfair &amp; Source Serif
          </span>
        </div>
      </div>
    </footer>
  );
}
