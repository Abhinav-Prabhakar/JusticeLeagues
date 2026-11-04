import { describe, expect, it } from "vitest";
import { LEAGUES, fmt, leagueById, weekDays } from "./data";

describe("fixtures", () => {
  it("formats numbers for the edition", () => {
    expect(fmt(1234567)).toBe("1,234,567");
  });

  it("finds a league by id and keeps ids unique", () => {
    expect(leagueById("harbor").name).toBe("Harbor Cleanup Coalition");
    expect(new Set(LEAGUES.map((l) => l.id)).size).toBe(LEAGUES.length);
  });

  it("builds a Monday-first week with exactly one today", () => {
    const days = weekDays();
    expect(days).toHaveLength(7);
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
    expect(days[0].idx).toBe(0);
    expect(days[6].idx).toBe(6);
    expect(days[6].date.getTime() - days[0].date.getTime()).toBe(6 * 24 * 60 * 60 * 1000);
  });
});
