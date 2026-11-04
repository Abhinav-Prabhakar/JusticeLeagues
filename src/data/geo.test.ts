import { describe, expect, it } from "vitest";
import { LEAGUES } from "./fixtures";
import {
  CITY_BOUNDS,
  CITY_CENTRE,
  HOOD_COORDS,
  atlasToLatLng,
  distanceKm,
  formatDistance,
  hoodCoords,
  latLngToAtlas,
  parseLatLng,
} from "./geo";

describe("city geography", () => {
  it("projects every fixture pin onto the same atlas position", () => {
    for (const league of LEAGUES) {
      const coords = hoodCoords(league.hood)!;
      const point = latLngToAtlas(coords);
      expect(point.x).toBeCloseTo(league.x, 6);
      expect(point.y).toBeCloseTo(league.y, 6);
      expect(atlasToLatLng({ x: league.x, y: league.y }).lat).toBeCloseTo(coords.lat, 6);
    }
  });

  it("keeps every neighbourhood inside the city bounds", () => {
    for (const [hood, coords] of Object.entries(HOOD_COORDS)) {
      expect(coords.lat, hood).toBeGreaterThanOrEqual(CITY_BOUNDS.south);
      expect(coords.lat, hood).toBeLessThanOrEqual(CITY_BOUNDS.north);
      expect(coords.lng, hood).toBeGreaterThanOrEqual(CITY_BOUNDS.west);
      expect(coords.lng, hood).toBeLessThanOrEqual(CITY_BOUNDS.east);
    }
  });

  it("measures a walkable city in kilometres", () => {
    const harbor = HOOD_COORDS["Mill River Docks"];
    expect(distanceKm(CITY_CENTRE, harbor)).toBeGreaterThan(3);
    expect(distanceKm(CITY_CENTRE, harbor)).toBeLessThan(5);
    expect(distanceKm(harbor, harbor)).toBe(0);
  });

  it("parses share links and rejects junk", () => {
    expect(parseLatLng("43.6532,-79.3832")).toEqual({ lat: 43.6532, lng: -79.3832 });
    expect(parseLatLng("43.6532")).toBeNull();
    expect(parseLatLng("not,a,place")).toBeNull();
    expect(parseLatLng("91,-79")).toBeNull();
    expect(parseLatLng("43,-181")).toBeNull();
    expect(parseLatLng(null)).toBeNull();
  });

  it("formats distances for the page", () => {
    expect(formatDistance(0.42)).toBe("420 m");
    expect(formatDistance(1.24)).toBe("1.2 km");
  });
});
