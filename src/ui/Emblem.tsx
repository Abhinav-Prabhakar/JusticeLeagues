import type { CSSProperties } from "react";
import { CAUSES, type Cause } from "../data";
import { cn } from "../utils/cn";

export type EmblemShape = "roundel" | "shield" | "hex";

const SHAPES: Record<EmblemShape, string> = {
  roundel: "M50 4a46 46 0 1 0 0.01 0Z",
  shield: "M50 4 L90 16 V50 C90 74 72 90 50 97 C28 90 10 74 10 50 V16 Z",
  hex: "M50 3 L91 26 V74 L50 97 L9 74 L9 26 Z",
};

export function Emblem({
  cause,
  size = 40,
  shape = "roundel",
  color,
  className,
  style,
}: {
  cause: Cause;
  size?: number;
  shape?: EmblemShape;
  color?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const c = CAUSES[cause];
  const Icon = c.icon;
  const fillColor = color ?? c.color;

  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size, ...style }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <path d={SHAPES[shape]} fill={fillColor} />
        <path
          d={SHAPES[shape]}
          fill="none"
          stroke="#f4eee1"
          strokeWidth={3}
          transform="translate(50 50) scale(.84) translate(-50 -50)"
          opacity={0.9}
        />
      </svg>
      <Icon className="text-paper relative" size={size * 0.44} strokeWidth={2.2} />
    </span>
  );
}
