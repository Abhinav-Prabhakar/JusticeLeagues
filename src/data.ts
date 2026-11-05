import { Leaf, Shield, Wheat, Bike, BookOpen, House, HeartPulse, Scale, type LucideIcon } from "lucide-react";
import { LEAGUES, SHIFTS, WINS, type Bring, type Cause, type League, type Shift, type Win } from "./data/fixtures";

export type { Bring, Cause, League, Shift, Win };
export { LEAGUES, SHIFTS, WINS };

export const CAUSES: Record<Cause, { label: string; color: string; icon: LucideIcon }> = {
  climate: { label: "Climate", color: "#14694d", icon: Leaf },
  safety: { label: "Safety", color: "#2347c5", icon: Shield },
  food: { label: "Food", color: "#e8a200", icon: Wheat },
  transit: { label: "Transit", color: "#b82d19", icon: Bike },
  education: { label: "Learning", color: "#7a3fb0", icon: BookOpen },
  housing: { label: "Housing", color: "#e0607e", icon: House },
  health: { label: "Health", color: "#0f8b9d", icon: HeartPulse },
  rights: { label: "Rights", color: "#14110d", icon: Scale },
};

export const CAUSE_KEYS = Object.keys(CAUSES) as Cause[];

const PAPER = "#f4eee1";
const INK = "#14110d";

function luminance(hex: string) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Pick the readable ink for text or icons sitting on a cause colour.
 * Mustard and rose take black; forest, cobalt, and vermilion take paper.
 */
export function onColor(background: string) {
  return contrast(PAPER, background) >= contrast(INK, background) ? PAPER : INK;
}

/**
 * Seed photography is vendored into `public/photos/`, so the app renders
 * without a network. Width and height stay in the signature for call sites
 * that want to express intent; the file is a single 1200px edition.
 *
 * `BASE_URL` keeps the files reachable from the GitHub Pages subpath.
 */
export const photo = (id: number, _w = 800, _h = 520) => `${import.meta.env.BASE_URL}photos/${id}.jpg`;

export const leagueById = (id: string) => LEAGUES.find((l) => l.id === id)!;

export function weekDays() {
  const t = new Date();
  const dow = (t.getDay() + 6) % 7;
  const mon = new Date(t);
  mon.setDate(t.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return { date: d, isToday: i === dow, idx: i };
  });
}

export const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const CHART_GROUPS = [
  { key: "Environment", color: "#14694d", values: [18, 20, 22, 26, 31, 36, 38, 41, 44, 46, 49, 54] },
  { key: "Safety", color: "#2347c5", values: [24, 25, 25, 27, 29, 30, 33, 34, 35, 38, 41, 43] },
  { key: "Hunger", color: "#f2b705", values: [14, 18, 22, 21, 25, 27, 30, 36, 39, 42, 47, 52] },
  { key: "Housing", color: "#e0607e", values: [10, 11, 13, 14, 15, 18, 19, 21, 22, 25, 26, 29] },
];

export const fmt = (n: number) => n.toLocaleString("en-US");
