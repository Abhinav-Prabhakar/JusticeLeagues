import { MapPin, Sparkles, Users } from "lucide-react";
import { CAUSES, fmt, type Cause } from "../data";
import { latLngToAtlas } from "../data/geo";
import type { LeagueDTO, SearchResultDTO } from "../lib/types";
import { Photo } from "../ui";
import { cn } from "../utils/cn";

function blocks() {
  const out: { x: number; y: number; w: number; h: number; f: string }[] = [];
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 15; c++) {
      const h = (r * 31 + c * 17 + r * c) % 7;
      out.push({
        x: -60 + c * 54 + (h % 3) * 2,
        y: -50 + r * 48 + (h % 2) * 2,
        w: 42 + (h % 3) * 3,
        h: 36 + (h % 4) * 2,
        f: h % 3 === 0 ? "#e1d6ba" : h % 3 === 1 ? "#e7dcc3" : "#dcd0b2",
      });
    }
  }
  return out;
}
const BLOCKS = blocks();

function MapArt() {
  return (
    <svg viewBox="0 0 600 440" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#14110d" strokeWidth="0.8" opacity="0.3" />
        </pattern>
        <pattern id="stipple" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.9" fill="#14110d" opacity="0.35" />
          <circle cx="5.5" cy="5" r="0.7" fill="#14110d" opacity="0.3" />
        </pattern>
        <path id="river" d="M-20 205 C 60 250, 110 300, 190 298 S 330 258, 400 328 S 560 405, 620 380" />
      </defs>
      <rect width="600" height="440" fill="#efe6d0" />
      <g transform="rotate(-6 300 220)">
        {BLOCKS.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill={b.f}
            stroke="#14110d"
            strokeOpacity="0.14"
            strokeWidth="0.7"
          />
        ))}
      </g>
      {/* avenues */}
      {["M-10 140 C 150 120, 300 170, 610 110", "M300 -10 C 290 120, 330 260, 310 450", "M-10 400 L 610 40"].map(
        (d, i) => (
          <g key={i}>
            <path d={d} fill="none" stroke="#14110d" strokeWidth="6.5" strokeOpacity="0.55" />
            <path d={d} fill="none" stroke="#f7f1e2" strokeWidth="4.5" />
          </g>
        ),
      )}
      {/* parks */}
      <g>
        <ellipse cx="516" cy="258" rx="52" ry="36" fill="#bcd5a4" stroke="#14110d" strokeOpacity="0.4" />
        <ellipse cx="516" cy="258" rx="52" ry="36" fill="url(#stipple)" />
        <rect x="170" y="86" width="64" height="40" rx="12" fill="#bcd5a4" stroke="#14110d" strokeOpacity="0.4" />
        <rect x="170" y="86" width="64" height="40" rx="12" fill="url(#stipple)" />
        <rect x="400" y="170" width="46" height="34" rx="10" fill="#bcd5a4" stroke="#14110d" strokeOpacity="0.4" />
      </g>
      {/* river */}
      <use href="#river" fill="none" stroke="#14110d" strokeOpacity="0.5" strokeWidth="44" strokeLinecap="round" />
      <use href="#river" fill="none" stroke="#a9cfe0" strokeWidth="40" strokeLinecap="round" />
      <use href="#river" fill="none" stroke="url(#hatch)" strokeWidth="40" strokeLinecap="round" />
      <text
        fontFamily="Playfair Display, serif"
        fontStyle="italic"
        fontSize="15"
        fill="#14110d"
        opacity="0.65"
        letterSpacing="3"
      >
        <textPath href="#river" startOffset="34%">
          MILL RIVER
        </textPath>
      </text>
      <text
        x="505"
        y="262"
        fontFamily="Libre Franklin, sans-serif"
        fontWeight="800"
        fontSize="8"
        letterSpacing="2"
        fill="#14110d"
        opacity="0.5"
        textAnchor="middle"
      >
        GREENWAY
      </text>
      {/* compass */}
      <g transform="translate(562 46)">
        <circle r="22" fill="#f4eee1" stroke="#14110d" strokeWidth="1.5" />
        <path d="M0 -17 L5 0 L0 17 L-5 0 Z" fill="#14110d" />
        <path d="M0 -17 L5 0 L-5 0 Z" fill="#d9381e" />
        <text y="-26" textAnchor="middle" fontFamily="Playfair Display, serif" fontWeight="900" fontSize="11">
          N
        </text>
      </g>
      {/* scale */}
      <g transform="translate(20 418)">
        <rect width="60" height="4" fill="#14110d" />
        <rect x="30" width="30" height="4" fill="#f4eee1" stroke="#14110d" />
        <text y="-4" fontFamily="IBM Plex Mono, monospace" fontSize="8">
          0 · 1 km
        </text>
      </g>
      <rect x="1" y="1" width="598" height="438" fill="none" stroke="#14110d" strokeWidth="2" />
    </svg>
  );
}

function Pin({
  l,
  hover,
  setHover,
  dim,
  onOpen,
  maxPoints,
}: {
  l: LeagueDTO;
  hover: string | null;
  setHover: (id: string | null) => void;
  dim: boolean;
  onOpen: (id: string) => void;
  maxPoints: number;
}) {
  const c = CAUSES[l.cause];
  const Icon = c.icon;
  const point = latLngToAtlas({ lat: l.lat, lng: l.lng });
  const x = Math.min(97, Math.max(3, point.x));
  const y = Math.min(97, Math.max(3, point.y));
  const size = 28 + (l.points / Math.max(maxPoints, 1)) * 16;
  const on = hover === l.id;
  const below = y < 38;
  const distance = (l as SearchResultDTO).distanceKm;

  return (
    <div
      className={cn("absolute transition-all duration-500", on ? "z-30" : "z-10")}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -100%) scale(${dim ? 0.7 : on ? 1.18 : 1})`,
        opacity: dim ? 0.18 : 1,
        filter: dim ? "grayscale(1)" : undefined,
        pointerEvents: dim ? "none" : "auto",
      }}
    >
      <button
        onMouseEnter={() => setHover(l.id)}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover(l.id)}
        onBlur={() => setHover(null)}
        onClick={() => onOpen(l.id)}
        aria-label={`Open ${l.name}`}
        className="relative block"
      >
        {on && (
          <span className="animate-ping-ring absolute inset-0 -z-10 rounded-full" style={{ background: c.color }} />
        )}
        <span
          className="border-ink text-paper relative z-10 grid place-items-center rounded-full border-2 shadow-[2px_2px_0_rgba(20,17,13,.8)]"
          style={{ width: size, height: size, background: c.color }}
        >
          <Icon size={size * 0.48} strokeWidth={2.4} />
        </span>
        <span
          className="border-ink absolute -bottom-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-r-2 border-b-2"
          style={{ background: c.color }}
        />
      </button>
      <div
        className={cn(
          "border-ink bg-paper pointer-events-none absolute w-52 border-2 p-2 shadow-[4px_4px_0_#14110d] transition-all duration-300",
          x < 20 ? "left-0" : x > 80 ? "right-0" : "left-1/2 -translate-x-1/2",
          below ? "top-[calc(100%+14px)]" : "bottom-[calc(100%+12px)]",
          on ? "translate-y-0 opacity-100" : below ? "-translate-y-2 opacity-0" : "translate-y-2 opacity-0",
        )}
      >
        <Photo id={l.photo} w={320} h={140} className="border-ink h-16 w-full border" />
        <div className="font-display mt-1.5 text-sm leading-tight font-bold">{l.name}</div>
        <div className="text-ink-3 mt-0.5 flex items-center gap-1 font-mono text-[9px]">
          <MapPin size={9} /> {l.hood}
          {distance !== null && distance !== undefined && (
            <span>· {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}</span>
          )}
        </div>
        <div className="text-ink-2 mt-1 flex items-center justify-between font-mono text-[10px] font-semibold">
          <span className="flex items-center gap-1">
            <Sparkles size={10} className="text-vermilion" fill="#d9381e" />
            {fmt(l.points)}
          </span>
          <span className="flex items-center gap-1">
            <Users size={10} />
            {fmt(l.members)}
          </span>
        </div>
      </div>
    </div>
  );
}

export interface AtlasMapProps {
  leagues: LeagueDTO[];
  cause?: Cause | "all";
  hover: string | null;
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
  emptyLabel?: string;
}

/** The drawn editorial map. It needs no tiles, so it works entirely offline. */
export function AtlasMap({ leagues, cause = "all", hover, onHover, onOpen, emptyLabel }: AtlasMapProps) {
  const maxPoints = leagues.reduce((max, league) => Math.max(max, league.points), 1);

  return (
    <div className="border-ink bg-paper-2 relative aspect-[600/440] w-full overflow-hidden border-2 shadow-[6px_6px_0_#14110d]">
      <MapArt />
      {leagues.map((league) => (
        <Pin
          key={league.id}
          l={league}
          hover={hover}
          setHover={onHover}
          dim={cause !== "all" && league.cause !== cause}
          onOpen={onOpen}
          maxPoints={maxPoints}
        />
      ))}
      {leagues.length === 0 && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <p className="border-ink bg-paper/95 border-2 px-4 py-3 font-mono text-[11px] shadow-[4px_4px_0_#14110d]">
            {emptyLabel ?? "No league on the map yet."}
          </p>
        </div>
      )}
    </div>
  );
}
