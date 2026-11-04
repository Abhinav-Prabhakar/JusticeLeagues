// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, transaction, type Db } from "./index";
import { runMigrations } from "./migrate";
import { seedIfEmpty } from "./seed";
import {
  ATTENDANCE_POINTS_CAP,
  DAILY_CHECKIN_CAP,
  checkInShift,
  createShift,
  getMe,
  joinLeague,
  listLeagueAnomalies,
  listLeagues,
  resolveLeagueAnomaly,
  reverseLedgerEntry,
  reviewProject,
  signupShift,
  submitProject,
} from "./repository";
import { listStandings, rebuildStandings } from "./standings";
import { getImpact } from "./impact";
import { listPublicLedger } from "./ledger";
import { materializeSealedLedger } from "./sealed";

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

function ledgerSum(leagueId: string): number {
  return Number(
    (
      db.prepare("SELECT COALESCE(SUM(delta), 0) AS points FROM points_ledger WHERE league_id = ?").get(leagueId) as {
        points: number;
      }
    ).points,
  );
}

describe("ledger invariants", () => {
  it("displayed totals are ledger sums, and chapters roll up exactly", () => {
    for (const league of listLeagues(db)) {
      const ledger = ledgerSum(league.id);
      expect(league.points, league.id).toBe(ledger);
      expect(
        league.chapters.reduce((sum, chapter) => sum + chapter.points, 0),
        league.id,
      ).toBe(ledger);
    }
  });

  it("materialises sealed history once, with weekly rows driving month and streak", () => {
    const before = Number(
      (db.prepare("SELECT COUNT(*) AS count FROM points_ledger WHERE ref_type = 'sealed_history'").get() as {
        count: number;
      }).count,
    );
    expect(before).toBeGreaterThan(0);
    expect(materializeSealedLedger(db)).toBe(0);

    const harbor = listLeagues(db).find((league) => league.id === "harbor")!;
    expect(harbor.streak).toBeGreaterThan(10);
    expect(harbor.month).toBeGreaterThan(0);
    expect(harbor.trend).toHaveLength(12);
  });

  it("awards a join once and updates the cache in the same write", () => {
    makeProfile("usr_invariant");
    const before = listLeagues(db).find((league) => league.id === "harbor")!.points;
    joinLeague(db, "usr_invariant", "harbor");
    joinLeague(db, "usr_invariant", "harbor");

    const league = listLeagues(db).find((item) => item.id === "harbor")!;
    expect(league.points).toBe(before + 25);
    expect(league.points).toBe(ledgerSum("harbor"));
    expect(
      (db.prepare("SELECT points FROM league_standings WHERE league_id = 'harbor'").get() as { points: number }).points,
    ).toBe(league.points);
  });
});

describe("leaderboard scopes", () => {
  it("serves global, month, cause and chapter scopes from the cache", () => {
    const all = listStandings(db, { scope: "global", limit: 100 });
    expect(all.rows).toHaveLength(10);
    expect(all.rows[0].rank).toBe(1);
    expect(all.rows.every((row, index) => index === 0 || row.points <= all.rows[index - 1].points)).toBe(true);

    const month = listStandings(db, { scope: "month", limit: 100 });
    expect(month.rows.every((row) => row.points === row.monthPoints)).toBe(true);

    const climate = listStandings(db, { scope: "cause", cause: "climate", limit: 100 });
    expect(climate.rows.length).toBeGreaterThan(0);
    expect(climate.rows.every((row) => row.cause === "climate")).toBe(true);

    const chapters = listStandings(db, { scope: "chapter", limit: 100 });
    expect(chapters.rows).toHaveLength(30);
    expect(chapters.rows[0].chapterId).toBeTruthy();

    const forLeague = listStandings(db, { scope: "chapter", leagueId: "harbor", limit: 100 });
    expect(forLeague.rows).toHaveLength(3);
    expect(forLeague.rows.reduce((sum, row) => sum + row.points, 0)).toBe(
      listLeagues(db).find((league) => league.id === "harbor")!.points,
    );
  });

  it("applies deterministic tie-breakers", () => {
    db.prepare(
      `INSERT INTO leagues (id, slug, name, cause, city_id, base_points, base_members, base_projects, base_hours)
       VALUES ('aaa_tie', 'aaa-tie', 'Aaa Tie', 'climate', 'city_millbrook', 0, 0, 0, 0),
              ('bbb_tie', 'bbb-tie', 'Bbb Tie', 'climate', 'city_millbrook', 0, 0, 0, 0)`,
    ).run();
    for (const id of ["aaa_tie", "bbb_tie"]) {
      db.prepare(
        `INSERT INTO chapters (id, league_id, neighborhood_id, name, base_points)
         VALUES (?, ?, 'nb_mill-river-docks', ?, 0)`,
      ).run(`ch_${id}`, id, `${id} chapter`);
    }
    rebuildStandings(db);

    const rows = listStandings(db, { scope: "global", cause: "climate", limit: 100 }).rows;
    const aaa = rows.find((row) => row.leagueId === "aaa_tie")!;
    const bbb = rows.find((row) => row.leagueId === "bbb_tie")!;
    expect(aaa.rank).toBeLessThan(bbb.rank);
  });
});

describe("impact and public ledger", () => {
  it("aggregates the ledger by chapter, month and category", () => {
    const impact = getImpact(db, "marrow");
    const league = listLeagues(db).find((item) => item.id === "marrow")!;
    expect(impact.totals.points).toBe(league.points);
    expect(impact.byChapter.reduce((sum, chapter) => sum + chapter.points, 0)).toBe(league.points);
    expect(impact.byCategory.reduce((sum, category) => sum + category.points, 0)).toBe(league.points);
    expect(impact.byMonth).toHaveLength(12);
    expect(impact.projects.length).toBeGreaterThan(0);
  });

  it("shows live awards with their author, and hides imported history by default", () => {
    makeProfile("usr_public");
    joinLeague(db, "usr_public", "harbor");

    const page = listPublicLedger(db, { limit: 10 });
    expect(page.entries.length).toBeGreaterThan(0);
    expect(page.entries.every((entry) => entry.refType !== "sealed_history")).toBe(true);
    expect(page.entries.some((entry) => entry.profile?.id === "usr_public")).toBe(true);

    const sealed = listPublicLedger(db, { includeSealed: true, limit: 100 });
    expect(sealed.total).toBeGreaterThan(page.total);
  });
});

describe("badges", () => {
  it("awards the charter badge and keeps it idempotent", () => {
    makeProfile("usr_badge");
    joinLeague(db, "usr_badge", "harbor");
    joinLeague(db, "usr_badge", "harbor");

    const me = getMe(db, "usr_badge");
    expect(me.badges.find((badge) => badge.key === "first_join")?.awardedAt).toBeTruthy();
    expect(me.streak.current).toBe(1);
    expect(me.badges.filter((badge) => badge.key === "first_join")).toHaveLength(1);
  });

  it("gives demo stewards the charter steward badge", () => {
    const me = getMe(db, "usr_seed_harbor_1");
    expect(me.badges.find((badge) => badge.key === "charter_steward")?.awardedAt).toBeTruthy();
  });
});

describe("anomaly queue and reversal", () => {
  const OWNER = "usr_seed_harbor_1";

  it("flags a high project without evidence and lets a steward reverse it", () => {
    makeProfile("usr_anomaly");
    joinLeague(db, "usr_anomaly", "harbor");

    const project = submitProject(db, "usr_anomaly", "harbor", {
      chapterId: "ch_harbor_2",
      title: "A very large weekend",
      summary: "Ninety volunteer hours across the whole neighbourhood in one enormous weekend push.",
      occurredOn: new Date().toISOString().slice(0, 10),
      people: 10,
      hours: 90,
      amount: "A lot",
    });
    const approved = reviewProject(db, OWNER, project.id, "approve");
    expect(approved.points).toBeGreaterThanOrEqual(400);

    const queue = listLeagueAnomalies(db, OWNER, "harbor");
    const anomaly = queue.find((item) => item.category === "project_without_evidence");
    expect(anomaly).toBeTruthy();
    expect(anomaly?.delta).toBe(approved.points);

    const before = listLeagues(db).find((league) => league.id === "harbor")!.points;
    const result = resolveLeagueAnomaly(db, OWNER, anomaly!.id, "reverse", "No evidence on file.");
    expect(result).toEqual({ resolved: true, reversed: true });

    const after = listLeagues(db).find((league) => league.id === "harbor")!;
    expect(after.points).toBe(before - approved.points);
    expect(getMe(db, "usr_anomaly").points).toBe(25);
    expect(() => resolveLeagueAnomaly(db, OWNER, anomaly!.id, "clear", "")).toThrowError(/already/);
  });

  it("reverses an arbitrary entry exactly once and refuses non-stewards", () => {
    makeProfile("usr_member");
    joinLeague(db, "usr_member", "harbor");
    const entry = getMe(db, "usr_member").ledger[0];

    expect(() => reverseLedgerEntry(db, "usr_member", entry.id, "")).toThrowError(/steward/);

    const reversed = reverseLedgerEntry(db, "usr_seed_harbor_1", entry.id, "Duplicate charter.");
    expect(reversed.delta).toBe(-25);
    expect(getMe(db, "usr_member").points).toBe(0);
    expect(() => reverseLedgerEntry(db, "usr_seed_harbor_1", entry.id, "")).toThrowError(/already/);
  });

  it("caps attendance points and blocks more than five check-ins in a day", () => {
    makeProfile("usr_cap");
    joinLeague(db, "usr_cap", "harbor");

    const shifts = Array.from({ length: DAILY_CHECKIN_CAP + 1 }, (_, index) =>
      createShift(db, OWNER, "harbor", {
        chapterId: "ch_harbor",
        title: `Cap shift ${index}`,
        day: 1,
        time: "09:00",
        duration: "8h",
        capacity: 4,
        place: "Dock",
      }),
    );

    let awarded = 0;
    for (let index = 0; index < DAILY_CHECKIN_CAP; index++) {
      signupShift(db, "usr_cap", shifts[index].id);
      awarded = checkInShift(db, OWNER, shifts[index].id, "usr_cap", "attended").awarded;
    }
    expect(awarded).toBe(ATTENDANCE_POINTS_CAP);

    signupShift(db, "usr_cap", shifts[DAILY_CHECKIN_CAP].id);
    expect(() => checkInShift(db, OWNER, shifts[DAILY_CHECKIN_CAP].id, "usr_cap", "attended")).toThrowError(
      new RegExp(`${DAILY_CHECKIN_CAP} check-ins`),
    );
  });
});

describe("leaderboard performance", () => {
  it("ranks 10,000 leagues and serves the top 50 in under 300ms", () => {
    const perf = openDatabase(":memory:");
    runMigrations(perf);
    transaction(perf, () => {
      perf.prepare("INSERT INTO cities (id, name, slug) VALUES ('c', 'Perf', 'perf')").run();
      perf.prepare("INSERT INTO neighborhoods (id, city_id, name, slug) VALUES ('n', 'c', 'Perf', 'perf')").run();
      const league = perf.prepare(
        `INSERT INTO leagues (id, slug, name, cause, city_id, base_points)
         VALUES (?, ?, ?, 'climate', 'c', 0)`,
      );
      const chapter = perf.prepare(
        `INSERT INTO chapters (id, league_id, neighborhood_id, name, base_points)
         VALUES (?, ?, 'n', ?, 0)`,
      );
      const point = perf.prepare(
        `INSERT INTO points_ledger (id, league_id, chapter_id, delta, reason, ref_type, ref_id, idempotency_key, created_at)
         VALUES (?, ?, ?, ?, 'Perf', 'perf', ?, ?, ?)`,
      );
      const now = new Date().toISOString();
      for (let index = 0; index < 10_000; index++) {
        const id = `l${String(index).padStart(5, "0")}`;
        league.run(id, id, `League ${index}`);
        chapter.run(`ch_${id}`, id, `Chapter ${index}`);
        point.run(`p_${id}`, id, `ch_${id}`, index + 1, id, `k_${id}`, now);
      }
    });

    const started = performance.now();
    rebuildStandings(perf);
    const rows = listStandings(perf, { scope: "global", limit: 50 });
    const elapsed = performance.now() - started;

    expect(rows.rows).toHaveLength(50);
    expect(rows.rows[0].points).toBe(10_000);
    expect(elapsed).toBeLessThan(300);
    perf.close();
  });
});
