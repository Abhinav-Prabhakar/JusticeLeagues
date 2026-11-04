import { LEAGUES, SHIFTS, WINS } from "../../src/data/fixtures";
import {
  DEMO_PASSWORD,
  demoChapters,
  demoMembers,
  demoResources,
  demoStewardEmail,
  slugify,
} from "../../src/data/demo";
import { hashPassword } from "../auth/password";
import { transaction, type Db } from "./index";
import { shiftStart } from "./schedule";
import { evaluateBadges, seedBadges } from "./badges";
import { materializeSealedLedger } from "./sealed";
import { rebuildStandings } from "./standings";

const CITY = { id: "city_millbrook", name: "Millbrook", slug: "millbrook", lat: 43.6532, lng: -79.3832 };

export { DEMO_PASSWORD, slugify };

let cachedDemoHash: string | null = null;
function demoPasswordHash(): string {
  cachedDemoHash ??= hashPassword(DEMO_PASSWORD);
  return cachedDemoHash;
}

export function seedIfEmpty(db: Db): boolean {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM leagues").get() as { count: number };
  if (count > 0) return false;

  transaction(db, () => {
    seedBadges(db);
    db.prepare("INSERT INTO cities (id, name, slug, center_lat, center_lng) VALUES (?, ?, ?, ?, ?)").run(
      CITY.id,
      CITY.name,
      CITY.slug,
      CITY.lat,
      CITY.lng,
    );

    const hoods = [...new Set(LEAGUES.map((l) => l.hood))].sort();
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
      // A citywide league rolls up neighbourhood chapters. The founding
      // chapter keeps the majority of the sealed history; the next two
      // neighbourhoods by name carry the rest, so chapter totals still sum
      // to the league total. Shared with the static edition.
      for (const chapter of demoChapters(league)) {
        insertChapter.run(chapter.id, league.id, `nb_${slugify(chapter.hood)}`, chapter.name, chapter.points);
      }
    }

    // Every chapter gets one seeded steward so roles, rosters, and check-in
    // are usable on a fresh database. The founding chapter's steward owns the
    // league; the other two steward their chapter. All share DEMO_PASSWORD.
    const insertProfile = db.prepare(`
      INSERT INTO profiles (id, email, password_hash, handle, display_name, bio, city_id, home_neighborhood, causes)
      VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)
    `);
    const insertDemoMembership = db.prepare(`
      INSERT INTO league_members (league_id, profile_id, chapter_id, role, status, joined_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `);
    const insertCharterBadge = db.prepare(`
      INSERT OR IGNORE INTO profile_badges (profile_id, badge_key, league_id, awarded_at)
      VALUES (?, 'charter_steward', ?, ?)
    `);

    for (const league of LEAGUES) {
      const chapters = demoChapters(league);
      for (const [index, member] of demoMembers(league).entries()) {
        insertProfile.run(
          member.profile.id,
          demoStewardEmail(league.id, index),
          demoPasswordHash(),
          member.profile.handle,
          member.profile.displayName,
          CITY.id,
          `nb_${slugify(chapters[index].hood)}`,
          JSON.stringify([league.cause]),
        );
        insertDemoMembership.run(league.id, member.profile.id, member.chapterId, member.role, member.joinedAt);
        insertCharterBadge.run(member.profile.id, league.id, member.joinedAt);
      }
    }

    // A pair of open classifieds per league, shared with the static edition.
    const insertResource = db.prepare(`
      INSERT INTO resources (
        id, league_id, chapter_id, kind, title, description, quantity, needed_by,
        status, created_by, claimed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const league of LEAGUES) {
      for (const resource of demoResources(league)) {
        insertResource.run(
          resource.id,
          resource.league,
          resource.chapterId,
          resource.kind,
          resource.title,
          resource.description,
          resource.quantity,
          resource.neededBy,
          resource.status,
          resource.createdBy?.id ?? null,
          null,
          resource.createdAt,
        );
      }
    }

    const insertShift = db.prepare(`      INSERT INTO shifts (
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

    // Phase 3: sealed history becomes ledger rows, then the standings cache
    // is built inside the same transaction as the seed.
    materializeSealedLedger(db);
    rebuildStandings(db);
    for (const row of db.prepare("SELECT id FROM profiles").all() as unknown as { id: string }[]) {
      evaluateBadges(db, row.id);
    }
  });

  return true;
}

/**
 * Startup/backfill hook for databases seeded before Phase 3. Idempotent:
 * sealed rows are keyed by chapter and week, badges by profile and key.
 */
export function ensurePhase3(db: Db): { inserted: number } {
  return transaction(db, () => {
    seedBadges(db);
    const inserted = materializeSealedLedger(db);
    rebuildStandings(db);
    // Printed-edition members hold roster seats but no ledger rows, so run the
    // badge rules once for every profile on startup.
    for (const row of db.prepare("SELECT id FROM profiles").all() as unknown as { id: string }[]) {
      evaluateBadges(db, row.id);
    }
    return { inserted };
  });
}
