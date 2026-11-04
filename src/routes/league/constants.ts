export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const TIERS = [
  { name: "Bronze", at: 0, color: "#c0763a" },
  { name: "Silver", at: 20000, color: "#9a978f" },
  { name: "Gold", at: 35000, color: "#f2b705" },
  { name: "Platinum", at: 50000, color: "#2347c5" },
];

export function tierFor(points: number) {
  const index = TIERS.reduce((current, tier, i) => (points >= tier.at ? i : current), 0);
  const tier = TIERS[index];
  const next = TIERS[index + 1];
  const pct = next ? Math.min(100, Math.max(4, ((points - tier.at) / (next.at - tier.at)) * 100)) : 100;
  return { tier, next, pct };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
