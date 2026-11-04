import { cn } from "../utils/cn";
import { useCountUp } from "./hooks";

export function CountUp({
  value,
  run = true,
  decimals = 0,
  suffix = "",
  className,
}: {
  value: number;
  run?: boolean;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const v = useCountUp(value, run);
  return (
    <span className={cn("tabular-nums", className)}>
      {v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}
