/**
 * City geography shared by the seed, the API and the static edition.
 *
 * The editorial map is a drawn rectangle, and the fixtures place every
 * league on it as a percentage (x left→right, y top→bottom). Real
 * coordinates are projected linearly onto the same rectangle, so the pins
 * that were designed by hand keep their exact positions while the server
 * gains a true lat/lng to measure from.
 */

import { LEAGUES } from "./fixtures";

export interface LatLng {
  lat: number;
  lng: number;
}

/** A generous rectangle around Millbrook. */
export const CITY_BOUNDS = {
  west: -79.46,
  east: -79.3,
  south: 43.6,
  north: 43.7,
} as const;

export const CITY_CENTRE: LatLng = { lat: 43.6532, lng: -79.3832 };

const EARTH_RADIUS_KM = 6371;

/** Atlas percentages for every neighbourhood, taken from its home league. */
export const HOOD_ATLAS: Record<string, { x: number; y: number }> = Object.fromEntries(
  LEAGUES.map((league) => [league.hood, { x: league.x, y: league.y }]),
);

export function atlasToLatLng(point: { x: number; y: number }): LatLng {
  return {
    lat: CITY_BOUNDS.north - (point.y / 100) * (CITY_BOUNDS.north - CITY_BOUNDS.south),
    lng: CITY_BOUNDS.west + (point.x / 100) * (CITY_BOUNDS.east - CITY_BOUNDS.west),
  };
}

/** Inverse of `atlasToLatLng`; used to keep hand-placed pins in alignment. */
export function latLngToAtlas(point: LatLng): { x: number; y: number } {
  return {
    x: ((point.lng - CITY_BOUNDS.west) / (CITY_BOUNDS.east - CITY_BOUNDS.west)) * 100,
    y: ((CITY_BOUNDS.north - point.lat) / (CITY_BOUNDS.north - CITY_BOUNDS.south)) * 100,
  };
}

export function hoodCoords(hood: string): LatLng | null {
  const point = HOOD_ATLAS[hood];
  return point ? atlasToLatLng(point) : null;
}

export const HOOD_COORDS: Record<string, LatLng> = Object.fromEntries(
  Object.entries(HOOD_ATLAS).map(([hood, point]) => [hood, atlasToLatLng(point)]),
);

/** Great-circle distance in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLat(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLng(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

/** Parse a `lat,lng` URL parameter, returning null for anything unusable. */
export function parseLatLng(value: string | null | undefined): LatLng | null {
  if (!value) return null;
  const [rawLat, rawLng] = value.split(",");
  if (rawLat === undefined || rawLng === undefined) return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!isValidLat(lat) || !isValidLng(lng)) return null;
  return { lat, lng };
}

export function formatLatLng(value: string): string {
  return value.replace(/,/g, ", ");
}

/** "320 m" under a kilometre, one decimal above it. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return `${km.toFixed(1)} km`;
}
