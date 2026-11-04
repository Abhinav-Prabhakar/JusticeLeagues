import { LEAGUES, SHIFTS, WINS } from "../../src/data/fixtures";
import { transaction, type Db } from "./index";

const CITY = { id: "city_millbrook", name: "Millbrook", slug: "millbrook", lat: 43.6532, lng: -79.3832 };

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Monday of the current local week, so seeded shifts always read "this week". */
function startOfWeek(): Date {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow, 0, 0, 0, 0);
}

function shiftStart(day: number, time: string): string {
  const d = new Date(startOfWeek());
  d.setDate(d.getDate() + day);
  const [hours, minutes] = time.split(":").map(Number);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export function seedIfEmpty(db: Db): boolean {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM leagues").get() as { count: number };
  if (count > 0) return false;

  transaction(db, () => {
    db.prepare("INSERT INTO cities (id, name, slug, center_lat, center_lng) VALUES (?, ?, ?, ?, ?)").run(
      CITY.id,
      CITY.name,
      CITY.slug,
      CITY.lat,
      CITY.lng,
    );

    const hoods = [...new Set(LEAGUES.map((l) => l.hood))];
    const insertHood = db.prepare(
      "INSERT INTO neighborhoods (id, city_id, name, slug) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
    );
    for (const hood of hoods) {
      insertHood.run(`nb_${slugify(hood)}`, CITY.id, hood, slugify(hood));
    }

    const insertLeague = db.prepare(`
      INSERT INTO leagues (
        id, slug, name, cause, city_id, motto, description, founded_year, photo_id,
        atlas_x, atlas_y, delta, trend, base_points, base_city_points, base_month_points,
        base_members, base_projects, base_hours, base_streak, recruiting, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `);
    const insertChapter = db.prepare(`
      INSERT INTO chapters (id, league_id, neighborhood_id, name, base_points, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `);

    for (const league of LEAGUES) {
      insertLeague.run(
        league.id,
        league.id,
        league.name,
        league.cause,
        CITY.id,
        league.motto,
        league.motto,
        league.founded,
        league.photo,
        league.x,
        league.y,
        league.delta,
        JSON.stringify(league.trend),
        league.points,
        league.city,
        league.month,
        league.members,
        league.projects,
        league.hours,
        league.streak,
        league.recruiting ? 1 : 0,
      );
      insertChapter.run(
        `ch_${league.id}`,
        league.id,
        `nb_${slugify(league.hood)}`,
        `${league.hood} chapter`,
        league.points,
      );
    }

    const insertShift = db.prepare(`
      INSERT INTO shifts (
        id, league_id, chapter_id, title, day, starts_at, duration, place_name,
        capacity, base_filled, bring, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
    `);
    for (const shift of SHIFTS) {
      insertShift.run(
        shift.id,
        shift.league,
        `ch_${shift.league}`,
        shift.title,
        shift.day,
        shiftStart(shift.day, shift.time),
        shift.dur,
        shift.place,
        shift.spots,
        Math.min(shift.filled, shift.spots),
        JSON.stringify(shift.bring),
      );
    }

    const insertWin = db.prepare(`
      INSERT INTO wins (id, league_id, chapter_id, title, points, photo_id, facts, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const ago: Record<string, number> = {
      "2h ago": 2 * 3600_000,
      Yesterday: 26 * 3600_000,
      "2 days ago": 50 * 3600_000,
    };
    for (const win of WINS) {
      insertWin.run(
        win.id,
        win.league,
        `ch_${win.league}`,
        win.title,
        win.jp,
        win.photo,
        JSON.stringify(win.facts),
        new Date(now - (ago[win.when] ?? 0)).toISOString(),
      );
    }
  });

  return true;
}
