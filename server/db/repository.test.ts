// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./index";
import { runMigrations } from "./migrate";
import { seedIfEmpty } from "./seed";
import {
  AppError,
  JOIN_POINTS,
  cancelShift,
  getMe,
  joinLeague,
  leaveLeague,
  listLeagues,
  listShifts,
  signupShift,
} from "./repository";

let db: Db;

function makeProfile(id: string) {
  db.prepare("INSERT INTO profiles (id, email, password_hash, handle, display_name) VALUES (?, ?, 'x', ?, ?)").run(
    id,
    `${id}@example.com`,
    id,
    id,
  );
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
    expect(harbor.members).toBe(1284);
    expect(harbor.chapters[0].hood).toBe("Mill River Docks");
  });

  it("chapter points roll up to the league", () => {
    for (const league of listLeagues(db)) {
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

    const league = listLeagues(db).find((item) => item.id === "harbor")!;
    expect(league.points).toBe(48210 + JOIN_POINTS);
    expect(league.members).toBe(1285);
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
