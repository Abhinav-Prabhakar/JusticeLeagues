// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./index";
import { runMigrations } from "./migrate";
import { seedIfEmpty } from "./seed";
import {
  AppError,
  JOIN_POINTS,
  cancelShift,
  cancelShiftAsSteward,
  checkInShift,
  createShift,
  getMe,
  getShiftRoster,
  joinLeague,
  leaveLeague,
  listLeagues,
  listMembers,
  listShifts,
  signupShift,
} from "./repository";

let db: Db;

function makeProfile(id: string, homeNeighborhood: string | null = null) {
  db.prepare(
    "INSERT INTO profiles (id, email, password_hash, handle, display_name, home_neighborhood) VALUES (?, ?, 'x', ?, ?, ?)",
  ).run(id, `${id}@example.com`, id, id, homeNeighborhood);
}

beforeEach(() => {
  db = openDatabase(":memory:");
  runMigrations(db);
  seedIfEmpty(db);
});

describe("seed", () => {
  it("imports the edition and is idempotent", () => {
    expect(listLeagues(db)).toHaveLength(10);
    expect(listShifts(db)).toHaveLength(18);
    expect(seedIfEmpty(db)).toBe(false);
    const harbor = listLeagues(db).find((league) => league.id === "harbor")!;
    expect(harbor.points).toBe(48210);
    expect(harbor.members).toBe(1287);
    expect(harbor.chapters).toHaveLength(3);
    expect(harbor.chapters[0].hood).toBe("Mill River Docks");
  });

  it("chapter points roll up to the league", () => {
    for (const league of listLeagues(db)) {
      expect(league.chapters).toHaveLength(3);
      const chapterTotal = league.chapters.reduce((sum, chapter) => sum + chapter.points, 0);
      expect(chapterTotal).toBe(league.points);
    }
  });
});

describe("membership", () => {
  it("awards points once and keeps the ledger append-only", () => {
    makeProfile("usr_a");

    expect(joinLeague(db, "usr_a", "harbor").awarded).toBe(true);
    expect(joinLeague(db, "usr_a", "harbor").awarded).toBe(false);

    const me = getMe(db, "usr_a");
    expect(me.points).toBe(JOIN_POINTS);
    expect(me.ledger).toHaveLength(1);
    expect(me.memberships[0].status).toBe("active");
    expect(me.memberships[0].chapterId).toBe("ch_harbor");
    expect(me.memberships[0].points).toBe(JOIN_POINTS);

    const league = listLeagues(db).find((item) => item.id === "harbor")!;
    expect(league.points).toBe(48210 + JOIN_POINTS);
    expect(league.members).toBe(1288);
  });

  it("leaving frees the roster spot but does not rewrite history", () => {
    makeProfile("usr_b");
    joinLeague(db, "usr_b", "harbor");
    leaveLeague(db, "usr_b", "harbor");

    const me = getMe(db, "usr_b");
    expect(me.memberships[0].status).toBe("left");
    expect(me.points).toBe(JOIN_POINTS);

    joinLeague(db, "usr_b", "harbor");
    expect(getMe(db, "usr_b").points).toBe(JOIN_POINTS);
  });

  it("refuses a league that is not recruiting", () => {
    makeProfile("usr_c");
    expect(() => joinLeague(db, "usr_c", "ridgeline")).toThrowError(AppError);
  });

  it("auto-joins the league when claiming a shift", () => {
    makeProfile("usr_d");
    const result = signupShift(db, "usr_d", "s11");
    expect(result.autoJoined).toBe(true);
    expect(getMe(db, "usr_d").memberships[0].leagueId).toBe("harbor");
  });

  it("files a member under their home chapter when the league has one", () => {
    makeProfile("usr_home", "nb_city-centre");
    joinLeague(db, "usr_home", "harbor");
    expect(getMe(db, "usr_home").memberships[0].chapterId).toBe("ch_harbor_2");
  });
});

describe("shift capacity", () => {
  it("never oversells and lets a cancellation free a spot", () => {
    const shift = listShifts(db).find((item) => item.id === "s12")!;
    const open = shift.spots - shift.filled;
    expect(open).toBe(3);

    for (let i = 0; i < open; i++) {
      const id = `usr_cap_${i}`;
      makeProfile(id);
      signupShift(db, id, "s12");
    }

    makeProfile("usr_late");
    try {
      signupShift(db, "usr_late", "s12");
      throw new Error("expected the shift to be full");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("shift_full");
    }

    cancelShift(db, "usr_cap_0", "s12");
    expect(signupShift(db, "usr_late", "s12").signedUp).toBe(true);
  });

  it("treats a repeat signup as a no-op", () => {
    makeProfile("usr_e");
    const first = signupShift(db, "usr_e", "s11");
    const second = signupShift(db, "usr_e", "s11");
    expect(second.filled).toBe(first.filled);
    expect(getMe(db, "usr_e").signups).toHaveLength(1);
  });
});

describe("steward check-in", () => {
  const OWNER = "usr_seed_harbor_1";

  it("awards points once for an attended shift and records hours", () => {
    makeProfile("usr_vol");
    signupShift(db, "usr_vol", "s11");

    const result = checkInShift(db, OWNER, "s11", "usr_vol", "attended");
    expect(result.awarded).toBe(24);

    const me = getMe(db, "usr_vol");
    expect(me.points).toBe(JOIN_POINTS + 24);
    expect(me.signups[0].status).toBe("attended");
    expect(me.ledger.find((entry) => entry.reason.includes("Storm-drain"))?.delta).toBe(24);

    const again = checkInShift(db, OWNER, "s11", "usr_vol", "attended");
    expect(again.awarded).toBe(0);
    expect(getMe(db, "usr_vol").points).toBe(JOIN_POINTS + 24);
  });

  it("records a no-show without minting points, then allows a correction", () => {
    makeProfile("usr_late2");
    signupShift(db, "usr_late2", "s11");

    expect(checkInShift(db, OWNER, "s11", "usr_late2", "no_show").awarded).toBe(0);
    expect(getMe(db, "usr_late2").points).toBe(JOIN_POINTS);

    expect(checkInShift(db, OWNER, "s11", "usr_late2", "attended").awarded).toBe(24);
    expect(getMe(db, "usr_late2").points).toBe(JOIN_POINTS + 24);
  });

  it("locks the record once attendance is filed", () => {
    makeProfile("usr_att");
    signupShift(db, "usr_att", "s11");
    checkInShift(db, OWNER, "s11", "usr_att", "attended");

    expect(() => cancelShift(db, "usr_att", "s11")).toThrowError(/final/);
  });

  it("refuses a member who is not a steward", () => {
    makeProfile("usr_plain");
    joinLeague(db, "usr_plain", "harbor");
    makeProfile("usr_vol2");
    signupShift(db, "usr_vol2", "s11");

    expect(() => checkInShift(db, "usr_plain", "s11", "usr_vol2", "attended")).toThrowError(/steward/);
  });

  it("credits the volunteer's chapter and exposes the sealed roster", () => {
    makeProfile("usr_ch2", "nb_city-centre");
    signupShift(db, "usr_ch2", "s11");
    checkInShift(db, OWNER, "s11", "usr_ch2", "attended");

    expect(getMe(db, "usr_ch2").memberships[0].chapterId).toBe("ch_harbor_2");

    const roster = getShiftRoster(db, OWNER, "s11");
    expect(roster.sealed).toBe(2);
    expect(
      roster.entries.some(
        (entry) => entry.profile.id === "usr_ch2" && entry.status === "attended" && entry.hours === 2,
      ),
    ).toBe(true);
  });

  it("seeds one steward per chapter", () => {
    const members = listMembers(db, "harbor");
    expect(members.filter((member) => member.role === "owner")).toHaveLength(1);
    expect(members.filter((member) => member.role === "steward")).toHaveLength(2);
  });
});

describe("shift authoring", () => {
  const OWNER = "usr_seed_harbor_1";

  it("posts a shift to a chapter and cancels it with its reservations", () => {
    const shift = createShift(db, OWNER, "harbor", {
      chapterId: "ch_harbor_2",
      title: "Lantern walk",
      day: 2,
      time: "18:30",
      duration: "2h",
      capacity: 6,
      place: "City Centre square",
    });

    expect(shift.league).toBe("harbor");
    expect(shift.chapterId).toBe("ch_harbor_2");
    expect(shift.spots).toBe(6);
    expect(shift.time).toBe("18:30");

    makeProfile("usr_newshift");
    signupShift(db, "usr_newshift", shift.id);
    expect(listShifts(db).find((item) => item.id === shift.id)?.filled).toBe(1);

    cancelShiftAsSteward(db, OWNER, shift.id);
    expect(listShifts(db).find((item) => item.id === shift.id)).toBeUndefined();
    expect(getMe(db, "usr_newshift").signups).toHaveLength(0);
  });

  it("refuses a plain member and a chapter from another league", () => {
    makeProfile("usr_plain2");
    joinLeague(db, "usr_plain2", "harbor");

    expect(() =>
      createShift(db, "usr_plain2", "harbor", {
        chapterId: "ch_harbor",
        title: "Unauthorised shift",
        day: 1,
        time: "09:00",
        duration: "2h",
        capacity: 4,
        place: "Dock 4",
      }),
    ).toThrowError(/steward/);

    expect(() =>
      createShift(db, OWNER, "harbor", {
        chapterId: "ch_spoke",
        title: "Wrong chapter",
        day: 1,
        time: "09:00",
        duration: "2h",
        capacity: 4,
        place: "Dock 4",
      }),
    ).toThrowError(/chapter/);
  });
});
