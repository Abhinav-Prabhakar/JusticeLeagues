/**
 * Demo identities shared by the seed script, the pre-hydration shell, and the
 * read-only GitHub Pages edition. Keeping one source means a chapter's
 * steward has the same name, handle, and role everywhere.
 */

import { LEAGUES, type League } from "./fixtures";
import { hoodCoords } from "./geo";
import type { ChapterDTO, LeagueMemberDTO, ResourceDTO } from "../lib/types";

/** Password for every seeded chapter steward. Documented in the README. */
export const DEMO_PASSWORD = "millbrook";

export const DEMO_NAMES = [
  "Ada Okafor",
  "Bruno Salas",
  "Camille Duval",
  "Darius Reed",
  "Elena Petrova",
  "Farah Haddad",
  "Gideon Park",
  "Hana Mori",
  "Imani Brooks",
  "Jonas Weber",
  "Keiko Tan",
  "Lucas Moreau",
  "Maren Oduya",
  "Nadia Rahman",
  "Omar Haddad",
  "Priya Nair",
  "Quinn Alvarez",
  "Rosa Delgado",
  "Samir Patel",
  "Tessa Lindqvist",
  "Umar Bello",
  "Vera Kovac",
  "Wes Tanaka",
  "Ximena Ortiz",
  "Yara Haddad",
  "Zane Whitfield",
  "Aisha Bello",
  "Diego Ramos",
  "Freya Holm",
  "Hugo Mensah",
];

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Neighbourhoods heard from across the city, alphabetical. */
const HOODS = [...new Set(LEAGUES.map((league) => league.hood))].sort();

/**
 * Three chapters per league: the founding neighbourhood keeps 60% of the
 * sealed history, the next two neighbourhoods split the rest. The seeded
 * database builds exactly this shape.
 */
export function demoChapters(league: League): ChapterDTO[] {
  const founding = Math.round(league.points * 0.6);
  const second = Math.round(league.points * 0.25);
  const others = HOODS.filter((hood) => hood !== league.hood).slice(0, 2);
  const shares = [second, league.points - founding - second];

  return [
    {
      id: `ch_${league.id}`,
      leagueId: league.id,
      name: `${league.hood} chapter`,
      hood: league.hood,
      points: founding,
      status: "active",
      ...(hoodCoords(league.hood) ?? { lat: 0, lng: 0 }),
    },
    ...others.map((hood, index) => ({
      id: `ch_${league.id}_${index + 2}`,
      leagueId: league.id,
      name: `${hood} chapter`,
      hood,
      points: shares[index],
      status: "active" as const,
      ...(hoodCoords(hood) ?? { lat: 0, lng: 0 }),
    })),
  ];
}

/** The seeded steward roster for a league, one steward per chapter. */
export function demoMembers(league: League): LeagueMemberDTO[] {
  const leagueIndex = Math.max(
    0,
    LEAGUES.findIndex((item) => item.id === league.id),
  );

  return demoChapters(league).map((chapter, index) => {
    const name = DEMO_NAMES[(leagueIndex * 3 + index) % DEMO_NAMES.length];
    return {
      profile: {
        id: `usr_seed_${league.id}_${index + 1}`,
        handle: slugify(name),
        displayName: name,
      },
      role: index === 0 ? "owner" : "steward",
      chapterId: chapter.id,
      joinedAt: new Date(Date.UTC(league.founded, 4, index + 1, 9)).toISOString(),
    };
  });
}

export function demoStewardEmail(leagueId: string, chapterIndex: number): string {
  return `steward.${leagueId}.${chapterIndex + 1}@justiceleagues.local`;
}

interface ResourceCopy {
  offer: { title: string; description: string; quantity: string };
  want: { title: string; description: string; quantity: string; neededBy: boolean };
}

/** Each cause lends and needs different things, so the front page never repeats. */
const RESOURCE_COPY: Record<League["cause"], ResourceCopy> = {
  climate: {
    offer: {
      title: "Ladders, loppers & a van for riverside work days",
      description:
        "The chapter keeps a shared kit of hand tools, long loppers, and a van. Borrow it for a cleanup; return it swept and fuelled.",
      quantity: "12 items · pick-up Sat",
    },
    want: {
      title: "A trailer for hauling cleanup bags to the depot",
      description:
        "One good trailer would end the four-trip walk to the transfer station after every riverside sweep.",
      quantity: "1 trailer",
      neededBy: true,
    },
  },
  safety: {
    offer: {
      title: "Two-way radios and hi-vis vests for night walks",
      description:
        "Eight charged radios and a bundle of vests live at the chapter cupboard. Sign them out for a walk and bring them back by morning.",
      quantity: "8 radios · 20 vests",
    },
    want: {
      title: "Warm-white LED bulbs for the Foundry Row relight",
      description:
        "Forty bulbs would finish the lane behind the foundry, where the streetlights have been out since spring.",
      quantity: "40 bulbs",
      neededBy: true,
    },
  },
  food: {
    offer: {
      title: "A chest freezer and stock pots for the kitchen",
      description:
        "The church kitchen lends its chest freezer and two large stock pots between services. Pick-up on weekday mornings.",
      quantity: "Freezer · 2 pots",
    },
    want: {
      title: "Six folding tables for the next community meal",
      description:
        "Six sturdy folding tables would let the chapter serve the whole block without borrowing from the school every week.",
      quantity: "6 tables",
      neededBy: true,
    },
  },
  transit: {
    offer: {
      title: "A cargo bike for flyer runs and supply drops",
      description:
        "Two panniers, a lock, and a front rack. Book it for an afternoon and leave it charged for the next rider.",
      quantity: "1 bike · weekend loan",
    },
    want: {
      title: "Two brass padlocks for the new bike rack",
      description:
        "The rack is up outside the library; two weatherproof locks would let volunteers leave their bikes while they work.",
      quantity: "2 locks",
      neededBy: true,
    },
  },
  education: {
    offer: {
      title: "Free printing for flyers, up to 500 pages a month",
      description:
        "The Library Quarter print room has offered the league a monthly allowance. Send artwork a day ahead and collect in person.",
      quantity: "500 pages / month",
    },
    want: {
      title: "Twenty reading lamps for the homework room",
      description:
        "Clip-on lamps would give every desk in the after-school room its own light before the winter term.",
      quantity: "20 lamps",
      neededBy: true,
    },
  },
  housing: {
    offer: {
      title: "Power tools & ladders, free to borrow for build days",
      description:
        "Drills, saws, two ladders, and a work light. Borrow the kit for a repair day; return it clean and complete.",
      quantity: "12 items · pick-up Sat",
    },
    want: {
      title: "A pickup truck for hauling donated furniture",
      description:
        "One Saturday a month, a truck would move beds and tables from the storage unit into new homes.",
      quantity: "1 truck · Sat mornings",
      neededBy: true,
    },
  },
  health: {
    offer: {
      title: "Spanish & Arabic interpreters on call for clinics",
      description:
        "Four trained volunteers can join a clinic by phone or in person on weekday evenings. Book a slot through the chapter.",
      quantity: "Weeknights · 2h slots",
    },
    want: {
      title: "A wheelchair-accessible van for clinic runs",
      description:
        "A loaner van would get neighbours to appointments when the bus route is too far from the clinic door.",
      quantity: "1 van · weekdays",
      neededBy: true,
    },
  },
  rights: {
    offer: {
      title: "A quiet room and a laptop for drop-in advice",
      description:
        "The union hall lends its back room and a laptop every Thursday. Claim the slot and the key code comes with it.",
      quantity: "Thursdays · 2h",
    },
    want: {
      title: "Folding chairs for the Saturday legal clinic",
      description:
        "Twelve chairs would let the clinic seat everyone who arrives without asking them to stand in the corridor.",
      quantity: "12 chairs",
      neededBy: true,
    },
  },
};

/**
 * A pair of open classifieds per league so a fresh edition has something in
 * the exchange. The database seed and the static build share these.
 */
export function demoResources(league: League): ResourceDTO[] {
  const members = demoMembers(league);
  const chapters = demoChapters(league);
  const copy = RESOURCE_COPY[league.cause];
  const posted = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
  const neededBy = new Date(Date.now() + 4 * 24 * 3600_000).toISOString().slice(0, 10);

  return [
    {
      id: `res_${league.id}_offer`,
      league: league.id,
      chapterId: chapters[1]?.id ?? chapters[0].id,
      kind: "offer",
      title: copy.offer.title,
      description: copy.offer.description,
      quantity: copy.offer.quantity,
      neededBy: null,
      status: "open",
      createdBy: members[1]?.profile ?? members[0].profile,
      claimedBy: null,
      createdAt: posted(2),
    },
    {
      id: `res_${league.id}_want`,
      league: league.id,
      chapterId: chapters[0].id,
      kind: "want",
      title: copy.want.title,
      description: copy.want.description,
      quantity: copy.want.quantity,
      neededBy: copy.want.neededBy ? neededBy : null,
      status: "open",
      createdBy: members[0].profile,
      claimedBy: null,
      createdAt: posted(5),
    },
  ];
}
