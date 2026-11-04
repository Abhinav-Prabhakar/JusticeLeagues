// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./index";
import { runMigrations } from "./migrate";
import { ensurePhase4, seedIfEmpty } from "./seed";
import { searchLeagues } from "./search";
import { rebuildLeagueSearch, searchTokens } from "./search-index";
import { listLeagues, updateLeagueSettings } from "./repository";
import { HOOD_COORDS, distanceKm } from "../../src/data/geo";
import { LEAGUES } from "../../src/data/fixtures";

let db: Db;

beforeEach(() => {
  db = openDatabase(":memory:");
  runMigrations(db);
  seedIfEmpty(db);
});

describe("coordinates", () => {
  it("gives every seeded league, neighbourhood and chapter a real position", () => {
    for (const league of listLeagues(db)) {
      expect(Number.isFinite(league.lat), league.id).toBe(true);
      expect(Number.isFinite(league.lng), league.id).toBe(true);
      for (const chapter of league.chapters) {
        expect(Number.isFinite(chapter.lat), chapter.id).toBe(true);
        expect(Number.isFinite(chapter.lng), chapter.id).toBe(true);
      }
    }

    const rows = db.prepare("SELECT name, lat, lng FROM neighborhoods ORDER BY name").all() as unknown as {
      name: string;
      lat: number;
      lng: number;
    }[];
    expect(rows).toHaveLength(Object.keys(HOOD_COORDS).length);
    for (const row of rows) {
      expect(row.lat, row.name).toBeCloseTo(HOOD_COORDS[row.name].lat, 6);
      expect(row.lng, row.name).toBeCloseTo(HOOD_COORDS[row.name].lng, 6);
    }
  });

  it("backfills an older database from the shared geography table", () => {
    db.prepare("UPDATE leagues SET lat = NULL, lng = NULL").run();
    db.prepare("UPDATE neighborhoods SET lat = NULL, lng = NULL").run();
    db.prepare("UPDATE chapters SET lat = NULL, lng = NULL").run();

    const result = ensurePhase4(db);
    expect(result.indexed).toBe(LEAGUES.length);
    expect(result.chapters).toBeGreaterThan(0);

    for (const league of listLeagues(db)) {
      expect(Number.isFinite(league.lat), league.id).toBe(true);
      expect(Number.isFinite(league.lng), league.id).toBe(true);
    }
    expect(
      Number(
        (
          db.prepare("SELECT COUNT(*) AS count FROM neighborhoods WHERE lat IS NULL OR lng IS NULL").get() as {
            count: number;
          }
        ).count,
      ),
    ).toBe(0);
  });
});

describe("FTS search", () => {
  it("finds a league by name, neighbourhood, cause and motto", () => {
    expect(searchLeagues(db, { q: "harbor" }).results.map((r) => r.id)).toEqual(["harbor"]);
    expect(searchLeagues(db, { q: "mill river" }).results.map((r) => r.id)).toEqual(["harbor"]);
    expect(searchLeagues(db, { q: "food" }).results.map((r) => r.id)).toContain("marrow");
    expect(searchLeagues(db, { q: "leave the water" }).results.map((r) => r.id)).toContain("harbor");
  });

  it("matches prefixes and is case-insensitive", () => {
    expect(searchLeagues(db, { q: "HARB" }).results.map((r) => r.id)).toEqual(["harbor"]);
    expect(searchLeagues(db, { q: "clean" }).results.map((r) => r.id)).toEqual(["harbor"]);
  });

  it("treats punctuation and FTS operators as text, never syntax", () => {
    expect(searchTokens(`harbor" OR 1=1 --`)).toEqual(["harbor", "or"]);
    expect(() => searchLeagues(db, { q: `harbor" OR 1=1 --` })).not.toThrow();
    expect(searchLeagues(db, { q: `harbor" OR 1=1 --` }).results).toEqual([]);
    expect(searchLeagues(db, { q: "***" }).results.length).toBe(LEAGUES.length);
  });

  it("applies a cause filter after matching", () => {
    const climate = searchLeagues(db, { q: "green", cause: "climate" });
    expect(climate.results.map((r) => r.id)).toEqual(["greenway"]);
    expect(searchLeagues(db, { q: "green", cause: "food" }).results).toEqual([]);
  });

  it("orders an empty query by distance when an origin is given", () => {
    const origin = HOOD_COORDS["Mill River Docks"];
    const result = searchLeagues(db, { origin, limit: 50 });
    expect(result.results).toHaveLength(LEAGUES.length);
    const distances = result.results.map((row) => row.distanceKm!);
    expect(distances[0]).toBe(0);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it("filters by radius and reports the distance in kilometres", () => {
    const origin = HOOD_COORDS["Mill River Docks"];
    const result = searchLeagues(db, { origin, radiusKm: 5, limit: 50 });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.length).toBeLessThan(LEAGUES.length);
    for (const row of result.results) {
      expect(row.distanceKm).not.toBeNull();
      expect(row.distanceKm!).toBeLessThanOrEqual(5);
      expect(row.distanceKm!).toBeCloseTo(distanceKm(origin, { lat: row.lat, lng: row.lng }), 6);
    }
    expect(result.centre).toEqual(origin);
    expect(result.radiusKm).toBe(5);
  });

  it("keeps the index in step with league settings", () => {
    updateLeagueSettings(db, "usr_seed_harbor_1", "harbor", {
      name: "Tidewater Neighbours",
      motto: "The river remembers.",
      cause: "climate",
      recruiting: true,
    });

    expect(searchLeagues(db, { q: "tidewater" }).results.map((r) => r.id)).toEqual(["harbor"]);
    expect(searchLeagues(db, { q: "harbor" }).results).toEqual([]);
    expect(searchLeagues(db, { q: "remembers" }).results.map((r) => r.id)).toEqual(["harbor"]);
  });

  it("rebuilds idempotently and only indexes active leagues", () => {
    expect(rebuildLeagueSearch(db)).toBe(LEAGUES.length);
    expect(rebuildLeagueSearch(db)).toBe(LEAGUES.length);
    db.prepare("UPDATE leagues SET status = 'archived' WHERE id = 'harbor'").run();
    expect(rebuildLeagueSearch(db)).toBe(LEAGUES.length - 1);
    expect(searchLeagues(db, { q: "harbor" }).results).toEqual([]);
  });

  it("keeps the total before the limit", () => {
    const result = searchLeagues(db, { limit: 3 });
    expect(result.results).toHaveLength(3);
    expect(result.total).toBe(LEAGUES.length);
    expect(result.query).toBe("");
  });
});
