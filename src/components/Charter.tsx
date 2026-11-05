import { useState } from "react";
import { Building2, Check, Feather, Home, Landmark, Stamp, type LucideIcon } from "lucide-react";
import { CAUSES, CAUSE_KEYS, onColor, type Cause } from "../data";
import { Emblem, type EmblemShape } from "../ui";
import { useApp } from "../ctx";
import { cn } from "../utils/cn";

const SCALES: { k: string; label: string; icon: LucideIcon; pips: number }[] = [
  { k: "block", label: "Block", icon: Home, pips: 1 },
  { k: "hood", label: "Neighbourhood", icon: Building2, pips: 2 },
  { k: "city", label: "City", icon: Landmark, pips: 3 },
];
const SHAPES: EmblemShape[] = ["roundel", "shield", "hex"];

export function Charter() {
  const [cause, setCause] = useState<Cause>("climate");
  const [shape, setShape] = useState<EmblemShape>("shield");
  const [scale, setScale] = useState("hood");
  const [name, setName] = useState("");
  const [filed, setFiled] = useState(false);
  const { toast } = useApp();
  const c = CAUSES[cause];
  const color = c.color === "#14110d" ? "#7a3fb0" : c.color;
  const sc = SCALES.find((s) => s.k === scale)!;

  const file = () => {
    setFiled(true);
    toast("Charter drafted — league registration opens in Phase 2");
  };

  return (
    <section id="charter" className="bg-ink text-paper relative scroll-mt-16 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: "radial-gradient(#f4eee1 1px, transparent 1.4px)", backgroundSize: "6px 6px" }}
      />
      <div className="relative mx-auto max-w-[1320px] px-4 py-14 md:px-8 md:py-20">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="kicker text-mustard">Found a movement</div>
            <h2 className="font-display text-5xl leading-[0.95] font-black tracking-tight md:text-7xl">
              Start your <em className="text-mustard">League</em>
            </h2>
          </div>
          <div className="text-paper/60 flex items-center gap-2 font-mono text-xs">
            {[1, 2, 3].map((n) => (
              <span key={n} className="border-paper/40 grid h-7 w-7 place-items-center rounded-full border text-[11px]">
                {n}
              </span>
            ))}
            <span>steps</span>
          </div>
        </div>

        <div className="grid gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div className="space-y-9">
            {/* 1 cause */}
            <div>
              <StepLabel n={1} />
              <div className="grid grid-cols-4 gap-2.5">
                {CAUSE_KEYS.map((k) => {
                  const cc = CAUSES[k];
                  const Icon = cc.icon;
                  const on = cause === k;
                  const col = cc.color === "#14110d" ? "#7a3fb0" : cc.color;
                  return (
                    <button
                      key={k}
                      onClick={() => setCause(k)}
                      aria-label={cc.label}
                      aria-pressed={on}
                      title={cc.label}
                      className={cn(
                        "group relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 transition-all duration-300",
                        on ? "border-paper -translate-y-1" : "border-paper/25 hover:border-paper/70",
                      )}
                      style={{ background: on ? col : "transparent", boxShadow: on ? "4px 4px 0 #f4eee1" : undefined }}
                    >
                      <Icon
                        size={26}
                        className={cn("transition-transform duration-300", on ? "scale-110" : "group-hover:scale-110")}
                        style={{ color: on ? onColor(col) : col }}
                      />
                      <span
                        className={cn(
                          "font-sans text-[10px] font-extrabold tracking-wider uppercase transition-opacity",
                          on ? "opacity-100" : "opacity-0 group-hover:opacity-70",
                        )}
                        style={on ? { color: onColor(col) } : undefined}
                      >
                        {cc.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2 emblem + scale */}
            <div className="grid gap-9 sm:grid-cols-2">
              <div>
                <StepLabel n={2} />
                <div className="flex gap-3">
                  {SHAPES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setShape(s)}
                      aria-label={`Emblem shape: ${s}`}
                      aria-pressed={shape === s}
                      className={cn(
                        "rounded-xl border-2 p-2.5 transition-all duration-300",
                        shape === s
                          ? "border-paper bg-paper/10 -translate-y-1"
                          : "border-paper/25 hover:border-paper/70",
                      )}
                    >
                      <Emblem cause={cause} shape={s} size={52} color={color} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <StepLabel n={3} />
                <div className="flex gap-3">
                  {SCALES.map((s) => {
                    const Icon = s.icon;
                    const on = scale === s.k;
                    return (
                      <button
                        key={s.k}
                        onClick={() => setScale(s.k)}
                        aria-label={`League scale: ${s.label}`}
                        aria-pressed={on}
                        title={s.label}
                        className={cn(
                          "flex flex-1 flex-col items-center gap-2 rounded-xl border-2 py-3 transition-all duration-300",
                          on
                            ? "border-paper bg-paper text-ink -translate-y-1"
                            : "border-paper/25 hover:border-paper/70",
                        )}
                      >
                        <Icon size={24} />
                        <span className="flex gap-1">
                          {[0, 1, 2].map((p) => (
                            <span
                              key={p}
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                p < s.pips ? (on ? "bg-ink" : "bg-paper") : on ? "bg-ink/20" : "bg-paper/20",
                              )}
                            />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* name */}
            <div>
              <label className="kicker text-paper/60 mb-2 flex items-center gap-2">
                <Feather size={13} /> Name it
              </label>
              <input
                value={name}
                maxLength={34}
                onChange={(e) => {
                  setName(e.target.value);
                  setFiled(false);
                }}
                placeholder="Elm Street Watch"
                className="border-paper/40 font-display placeholder:text-paper/25 focus:border-mustard w-full border-b-2 bg-transparent pb-2 text-3xl font-bold italic transition-colors outline-none md:text-5xl"
              />
            </div>

            <button
              onClick={file}
              disabled={!name.trim() || filed}
              className={cn(
                "btn-press border-paper flex items-center gap-2.5 rounded-full border-2 px-7 py-3.5 font-sans text-sm font-extrabold tracking-wider uppercase transition-opacity",
                filed ? "bg-forest text-paper" : "bg-mustard text-ink",
                !name.trim() && "cursor-not-allowed opacity-40",
              )}
              style={{ boxShadow: "4px 4px 0 #f4eee1" }}
            >
              {filed ? <Check size={18} strokeWidth={3} /> : <Stamp size={18} />}
              {filed ? "Chartered" : "File the charter"}
            </button>
          </div>

          {/* certificate */}
          <div className="relative mx-auto w-full max-w-md lg:mx-0 lg:ml-auto">
            <div
              className="bg-paper text-ink relative -rotate-1 p-3 shadow-[10px_10px_0_rgba(244,238,225,.18)] transition-transform duration-500 hover:rotate-0"
              style={{ backgroundImage: `linear-gradient(${color}14, transparent 40%)` }}
            >
              <div className="border-ink relative border-2 p-1.5">
                <div className="border-ink relative flex flex-col items-center border px-6 py-9 text-center">
                  {["top-1.5 left-1.5", "top-1.5 right-1.5", "bottom-1.5 left-1.5", "bottom-1.5 right-1.5"].map((p) => (
                    <span key={p} className={cn("absolute h-2.5 w-2.5 rotate-45", p)} style={{ background: color }} />
                  ))}
                  <div className="kicker text-ink-3">Charter of the</div>
                  <div key={cause + shape} className="animate-pop my-5">
                    <Emblem cause={cause} shape={shape} size={118} color={color} />
                  </div>
                  <h3
                    className="font-display min-h-[2.4em] text-3xl leading-[1.1] font-black text-balance"
                    style={{ color: name ? undefined : "#b7ab92" }}
                  >
                    {name || "Your League"}
                  </h3>
                  <div className="mt-3 flex items-center gap-3 font-sans text-[10px] font-extrabold tracking-wider uppercase">
                    <span
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                      style={{ background: color, color: onColor(color) }}
                    >
                      <c.icon size={12} /> {c.label}
                    </span>
                    <span className="border-ink flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                      <sc.icon size={12} /> {sc.label}
                    </span>
                  </div>
                  <svg
                    viewBox="0 0 160 40"
                    className="mt-7 h-10 w-40"
                    fill="none"
                    stroke="#14110d"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M4 28 C 14 6, 22 6, 24 20 S 36 34, 44 14 S 56 30, 66 22 S 84 6, 92 24 S 112 34, 124 18 L 156 24" />
                  </svg>
                  <div className="bg-ink h-px w-44" />
                  <div className="text-ink-3 mt-1.5 font-mono text-[10px]">Founder · {new Date().getFullYear()}</div>
                  {filed && (
                    <span className="animate-stamp border-vermilion font-display text-vermilion absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border-[5px] px-5 py-1.5 text-4xl font-black tracking-wide uppercase mix-blend-multiply">
                      Chartered
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepLabel({ n }: { n: number }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="bg-mustard text-ink grid h-6 w-6 place-items-center rounded-full font-mono text-xs font-semibold">
        {n}
      </span>
      <span className="bg-paper/25 h-px flex-1" />
    </div>
  );
}
