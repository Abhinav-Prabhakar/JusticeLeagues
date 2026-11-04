import { cn } from "../utils/cn";

export function Sparkline({
  data,
  color = "#14110d",
  w = 120,
  h = 36,
  fill = true,
  play = true,
  stroke = 2,
  className,
}: {
  data: number[];
  color?: string;
  w?: number;
  h?: number;
  fill?: boolean;
  play?: boolean;
  stroke?: number;
  className?: string;
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pad = stroke + 1;
  const pts = data.map((d, i) => [
    (i / (data.length - 1)) * w,
    h - pad - ((d - min) / (max - min || 1)) * (h - pad * 2),
  ]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("overflow-visible", className)}
      width={w}
      height={h}
      preserveAspectRatio="none"
      aria-hidden
    >
      {fill && <path d={area} fill={color} opacity={play ? 0.12 : 0} style={{ transition: "opacity 1.2s ease .6s" }} />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        style={{
          strokeDasharray: 1,
          strokeDashoffset: play ? 0 : 1,
          transition: "stroke-dashoffset 1.5s cubic-bezier(.3,.7,.2,1)",
        }}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r={stroke + 1}
        fill={color}
        style={{ opacity: play ? 1 : 0, transition: "opacity .3s ease 1.3s" }}
      />
    </svg>
  );
}
