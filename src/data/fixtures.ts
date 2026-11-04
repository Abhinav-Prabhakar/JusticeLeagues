/**
 * Pure domain fixtures — no React, no icons.
 *
 * Both the browser and the seed script import from here, so a seeded
 * database and the type layer can never drift apart.
 */

export type Cause = "climate" | "safety" | "food" | "transit" | "education" | "housing" | "health" | "rights";

export type Bring = "gloves" | "water" | "vest" | "laptop" | "car";

export interface League {
  id: string;
  name: string;
  cause: Cause;
  hood: string;
  points: number;
  city: number;
  month: number;
  delta: number;
  trend: number[];
  members: number;
  projects: number;
  streak: number;
  hours: number;
  photo: number;
  x: number;
  y: number;
  founded: number;
  recruiting: boolean;
  motto: string;
}

export interface Shift {
  id: string;
  league: string;
  title: string;
  day: number;
  time: string;
  dur: string;
  spots: number;
  filled: number;
  place: string;
  bring: Bring[];
}

export interface Win {
  id: string;
  league: string;
  title: string;
  jp: number;
  photo: number;
  when: string;
  facts: { people: number; hours: number; amount: string };
}

function series(seed: number, start: number, end: number, n = 12) {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const noise = (s / 233280 - 0.5) * 0.28;
    const base = start + ((end - start) * i) / (n - 1);
    out.push(Math.max(1, Math.round(base * (1 + noise))));
  }
  out[n - 1] = end;
  return out;
}

export const LEAGUES: League[] = [
  {
    id: "harbor",
    name: "Harbor Cleanup Coalition",
    cause: "climate",
    hood: "Mill River Docks",
    points: 48210,
    city: 12940,
    month: 3120,
    delta: 14,
    trend: series(3, 12, 48, 12),
    members: 1284,
    projects: 96,
    streak: 31,
    hours: 14200,
    photo: 36713110,
    x: 24,
    y: 62,
    founded: 2021,
    recruiting: true,
    motto: "Leave the water better.",
  },
  {
    id: "eastside",
    name: "Eastside Neighborhood Watch",
    cause: "safety",
    hood: "Eastside",
    points: 44870,
    city: 14210,
    month: 2780,
    delta: 9,
    trend: series(7, 15, 44, 12),
    members: 962,
    projects: 74,
    streak: 58,
    hours: 11800,
    photo: 4595706,
    x: 78,
    y: 30,
    founded: 2019,
    recruiting: true,
    motto: "Eyes up, lights on.",
  },
  {
    id: "marrow",
    name: "Marrow Street Food Network",
    cause: "food",
    hood: "Marrow St.",
    points: 41300,
    city: 11030,
    month: 3560,
    delta: 21,
    trend: series(11, 8, 41, 12),
    members: 1103,
    projects: 131,
    streak: 44,
    hours: 16700,
    photo: 6591154,
    x: 52,
    y: 46,
    founded: 2020,
    recruiting: true,
    motto: "No neighbour goes hungry.",
  },
  {
    id: "ridgeline",
    name: "Ridgeline Tenants Union",
    cause: "housing",
    hood: "Ridgeline Heights",
    points: 38940,
    city: 9120,
    month: 2210,
    delta: 6,
    trend: series(19, 14, 38, 12),
    members: 740,
    projects: 52,
    streak: 19,
    hours: 8900,
    photo: 6301906,
    x: 66,
    y: 76,
    founded: 2022,
    recruiting: false,
    motto: "Home is a right.",
  },
  {
    id: "spoke",
    name: "Spoke & Lane Collective",
    cause: "transit",
    hood: "Old Town",
    points: 36120,
    city: 10800,
    month: 2890,
    delta: 17,
    trend: series(23, 6, 36, 12),
    members: 688,
    projects: 41,
    streak: 27,
    hours: 7300,
    photo: 34261218,
    x: 40,
    y: 28,
    founded: 2022,
    recruiting: true,
    motto: "Safe streets for every wheel.",
  },
  {
    id: "openpage",
    name: "Open Page Tutors",
    cause: "education",
    hood: "Library Quarter",
    points: 33780,
    city: 7640,
    month: 1960,
    delta: 5,
    trend: series(29, 13, 33, 12),
    members: 521,
    projects: 63,
    streak: 36,
    hours: 9400,
    photo: 5940832,
    x: 14,
    y: 28,
    founded: 2020,
    recruiting: true,
    motto: "Every child, a reader.",
  },
  {
    id: "southbank",
    name: "Southbank Care Circle",
    cause: "health",
    hood: "Southbank",
    points: 29450,
    city: 8320,
    month: 2440,
    delta: 12,
    trend: series(31, 7, 29, 12),
    members: 455,
    projects: 38,
    streak: 22,
    hours: 6200,
    photo: 9090903,
    x: 36,
    y: 84,
    founded: 2023,
    recruiting: true,
    motto: "Care, delivered.",
  },
  {
    id: "civic",
    name: "Civic Counsel Rights Desk",
    cause: "rights",
    hood: "City Centre",
    points: 27900,
    city: 6890,
    month: 1530,
    delta: 3,
    trend: series(37, 14, 28, 12),
    members: 392,
    projects: 29,
    streak: 12,
    hours: 5100,
    photo: 8342411,
    x: 56,
    y: 18,
    founded: 2021,
    recruiting: false,
    motto: "Know it. Claim it.",
  },
  {
    id: "greenway",
    name: "Greenway Gardeners",
    cause: "climate",
    hood: "Greenway Park",
    points: 25310,
    city: 13300,
    month: 3010,
    delta: 24,
    trend: series(41, 3, 25, 12),
    members: 604,
    projects: 47,
    streak: 33,
    hours: 6800,
    photo: 39778154,
    x: 86,
    y: 62,
    founded: 2023,
    recruiting: true,
    motto: "Grow it together.",
  },
  {
    id: "nightlights",
    name: "Night Lights Patrol",
    cause: "safety",
    hood: "Foundry Row",
    points: 22640,
    city: 5910,
    month: 1720,
    delta: 8,
    trend: series(43, 6, 22, 12),
    members: 318,
    projects: 24,
    streak: 15,
    hours: 4200,
    photo: 40068319,
    x: 10,
    y: 82,
    founded: 2024,
    recruiting: true,
    motto: "Light every corner.",
  },
];

export const SHIFTS: Shift[] = [
  {
    id: "s1",
    league: "eastside",
    title: "Evening patrol walk",
    day: 0,
    time: "19:00",
    dur: "2h",
    spots: 8,
    filled: 5,
    place: "Eastside Plaza",
    bring: ["vest", "water"],
  },
  {
    id: "s2",
    league: "openpage",
    title: "After-school tutor hour",
    day: 0,
    time: "16:30",
    dur: "1h",
    spots: 10,
    filled: 6,
    place: "Central Library, Rm 2",
    bring: ["laptop"],
  },
  {
    id: "s3",
    league: "marrow",
    title: "Community meal prep",
    day: 1,
    time: "10:00",
    dur: "4h",
    spots: 12,
    filled: 9,
    place: "Marrow St. Kitchen",
    bring: ["gloves"],
  },
  {
    id: "s4",
    league: "ridgeline",
    title: "Tenant rights clinic",
    day: 1,
    time: "18:00",
    dur: "2h",
    spots: 6,
    filled: 2,
    place: "Ridgeline Hall",
    bring: ["laptop"],
  },
  {
    id: "s5",
    league: "spoke",
    title: "Bike lane count",
    day: 2,
    time: "07:30",
    dur: "2h",
    spots: 6,
    filled: 4,
    place: "Old Town Bridge",
    bring: ["vest", "water"],
  },
  {
    id: "s6",
    league: "southbank",
    title: "Care package assembly",
    day: 2,
    time: "14:00",
    dur: "3h",
    spots: 10,
    filled: 4,
    place: "Southbank Clinic",
    bring: ["gloves"],
  },
  {
    id: "s7",
    league: "civic",
    title: "Know-your-rights desk",
    day: 3,
    time: "17:00",
    dur: "3h",
    spots: 5,
    filled: 3,
    place: "City Centre Annex",
    bring: ["laptop"],
  },
  {
    id: "s8",
    league: "greenway",
    title: "Garden watering round",
    day: 3,
    time: "08:00",
    dur: "2h",
    spots: 8,
    filled: 3,
    place: "Greenway Park",
    bring: ["gloves", "water"],
  },
  {
    id: "s9",
    league: "nightlights",
    title: "Streetlight audit walk",
    day: 4,
    time: "20:00",
    dur: "2h",
    spots: 6,
    filled: 5,
    place: "Foundry Row",
    bring: ["vest"],
  },
  {
    id: "s10",
    league: "marrow",
    title: "Pantry sort & stock",
    day: 4,
    time: "13:00",
    dur: "3h",
    spots: 10,
    filled: 4,
    place: "Marrow St. Pantry",
    bring: ["gloves"],
  },
  {
    id: "s11",
    league: "harbor",
    title: "Storm-drain stencilling",
    day: 4,
    time: "15:00",
    dur: "2h",
    spots: 8,
    filled: 2,
    place: "Dock 4",
    bring: ["gloves", "water"],
  },
  {
    id: "s12",
    league: "harbor",
    title: "Mill River cleanup",
    day: 5,
    time: "08:00",
    dur: "4h",
    spots: 20,
    filled: 17,
    place: "Mill River Docks",
    bring: ["gloves", "water", "vest"],
  },
  {
    id: "s13",
    league: "greenway",
    title: "Seed & plant swap",
    day: 5,
    time: "10:00",
    dur: "3h",
    spots: 12,
    filled: 6,
    place: "Greenway Park",
    bring: ["gloves"],
  },
  {
    id: "s14",
    league: "ridgeline",
    title: "Pop-up repair café",
    day: 5,
    time: "11:00",
    dur: "4h",
    spots: 8,
    filled: 3,
    place: "Ridgeline Hall",
    bring: ["gloves"],
  },
  {
    id: "s15",
    league: "openpage",
    title: "Saturday reading circle",
    day: 5,
    time: "10:30",
    dur: "2h",
    spots: 8,
    filled: 7,
    place: "Library Quarter",
    bring: [],
  },
  {
    id: "s16",
    league: "eastside",
    title: "Street safety audit",
    day: 6,
    time: "09:00",
    dur: "3h",
    spots: 10,
    filled: 4,
    place: "Eastside Ave.",
    bring: ["vest", "water"],
  },
  {
    id: "s17",
    league: "marrow",
    title: "Meal delivery run",
    day: 6,
    time: "11:00",
    dur: "3h",
    spots: 9,
    filled: 8,
    place: "Marrow St. Kitchen",
    bring: ["car"],
  },
  {
    id: "s18",
    league: "spoke",
    title: "Bike-to-market ride",
    day: 6,
    time: "10:00",
    dur: "2h",
    spots: 15,
    filled: 9,
    place: "Old Town Square",
    bring: ["water"],
  },
];

export const WINS: Win[] = [
  {
    id: "w1",
    league: "greenway",
    title: "Forty fruit trees planted along the Greenway in a single weekend",
    jp: 360,
    photo: 26614518,
    when: "2h ago",
    facts: { people: 58, hours: 5, amount: "40 trees" },
  },
  {
    id: "w2",
    league: "marrow",
    title: "Marrow Street packs 3,000 meals for winter pantry shelves",
    jp: 520,
    photo: 6590928,
    when: "Yesterday",
    facts: { people: 84, hours: 6, amount: "3,000 meals" },
  },
  {
    id: "w3",
    league: "spoke",
    title: "Old Town gets its first protected bike lane after 400 signatures",
    jp: 440,
    photo: 17837310,
    when: "2 days ago",
    facts: { people: 41, hours: 12, amount: "1.2 km lane" },
  },
];
