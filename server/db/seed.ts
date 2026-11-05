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
import { rebuildLeagueSearch } from "./search-index";
import { CITY_CENTRE, HOOD_COORDS, hoodCoords } from "../../src/data/geo";
import { pruneOperationalData } from "./pulse";

const CITY = { id: "city_millbrook", name: "Millbrook", slug: "millbrook", lat: 43.6532, lng: -79.3832 };

export const EDITOR_ID = "usr_seed_editor";
export const EDITOR_EMAIL = "admin@justiceleagues.local";

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
      "INSERT INTO neighborhoods (id, city_id, name, slug, lat, lng) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
    );
    for (const hood of hoods) {
      const coords = hoodCoords(hood);
      insertHood.run(
        `nb_${slugify(hood)}`,
        CITY.id,
        hood,
        slugify(hood),
        coords?.lat ?? CITY_CENTRE.lat,
        coords?.lng ?? CITY_CENTRE.lng,
      );
    }

    const insertLeague = db.prepare(`
      INSERT INTO leagues (
        id, slug, name, cause, city_id, motto, description, founded_year, photo_id,
        atlas_x, atlas_y, lat, lng, delta, trend, base_points, base_city_points, base_month_points,
        base_members, base_projects, base_hours, base_streak, recruiting, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `);
    const insertChapter = db.prepare(`
      INSERT INTO chapters (id, league_id, neighborhood_id, name, lat, lng, base_points, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `);

    for (const league of LEAGUES) {
      const coords = hoodCoords(league.hood);
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
        coords?.lat ?? CITY_CENTRE.lat,
        coords?.lng ?? CITY_CENTRE.lng,
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
        const chapterCoords = hoodCoords(chapter.hood);
        insertChapter.run(
          chapter.id,
          league.id,
          `nb_${slugify(chapter.hood)}`,
          chapter.name,
          chapterCoords?.lat ?? coords?.lat ?? CITY_CENTRE.lat,
          chapterCoords?.lng ?? coords?.lng ?? CITY_CENTRE.lng,
          chapter.points,
        );
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

    // The editor's desk. One admin account ships with the edition so reports,
    // strikes, and flags can be handled without editing the database by hand.
    db.prepare(
      `INSERT INTO profiles (id, email, password_hash, handle, display_name, bio, city_id, home_neighborhood, causes, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '[]', 'admin')`,
    ).run(
      EDITOR_ID,
      EDITOR_EMAIL,
      demoPasswordHash(),
      "editor",
      "The Editor",
      "Keeps the citywide desk: reports, strikes, flags, and the audit log.",
      CITY.id,
    );

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
    rebuildLeagueSearch(db);
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

/**
 * Startup/backfill hook for databases seeded before Phase 4. Coordinates are
 * derived from the shared geography table, so printed-edition databases get
 * real positions without a reseed; then the FTS index is rebuilt.
 */
export function ensurePhase4(db: Db): { indexed: number; chapters: number } {
  return transaction(db, () => {
    db.prepare(
      "UPDATE cities SET center_lat = COALESCE(center_lat, ?), center_lng = COALESCE(center_lng, ?) WHERE id = ?",
    ).run(CITY_CENTRE.lat, CITY_CENTRE.lng, CITY.id);

    const updateHood = db.prepare("UPDATE neighborhoods SET lat = ?, lng = ? WHERE city_id = ? AND name = ?");
    for (const [hood, coords] of Object.entries(HOOD_COORDS)) {
      updateHood.run(coords.lat, coords.lng, CITY.id, hood);
    }

    // Seeded leagues keep their hand-drawn atlas position. The projection is
    // linear, so the real coordinate lands on exactly the same pin.
    const updateLeague = db.prepare("UPDATE leagues SET lat = ?, lng = ? WHERE id = ?");
    for (const league of LEAGUES) {
      const coords = hoodCoords(league.hood);
      if (coords) updateLeague.run(coords.lat, coords.lng, league.id);
    }

    const chapters = db
      .prepare(
        `UPDATE chapters
            SET lat = (SELECT n.lat FROM neighborhoods n WHERE n.id = chapters.neighborhood_id),
                lng = (SELECT n.lng FROM neighborhoods n WHERE n.id = chapters.neighborhood_id)
          WHERE EXISTS (
            SELECT 1 FROM neighborhoods n
             WHERE n.id = chapters.neighborhood_id AND n.lat IS NOT NULL AND n.lng IS NOT NULL
          )`,
      )
      .run();

    return { indexed: rebuildLeagueSearch(db), chapters: Number(chapters.changes) };
  });
}

const DEFAULT_FLAGS: { key: string; label: string; description: string }[] = [
  { key: "atlas_geolocation", label: "Near me", description: "Offer the browser location button on the Atlas." },
  { key: "printed_profile", label: "Printed profile", description: "Offer the printable league sheet." },
  {
    key: "resources_exchange",
    label: "Resource exchange",
    description: "Let members post and claim offers and needs.",
  },
  { key: "public_ledger", label: "Public ledger", description: "Publish the citywide Justice Points record." },
];

/**
 * Startup/backfill hook for databases that predate Phase 5. Flags are
 * idempotent, and exactly one editor account is guaranteed so the moderation
 * desk is never unreachable.
 */
export function ensurePhase5(db: Db): { flags: number; editor: boolean } {
  return transaction(db, () => {
    const insert = db.prepare(
      "INSERT OR IGNORE INTO feature_flags (key, label, description, enabled) VALUES (?, ?, ?, 1)",
    );
    for (const flag of DEFAULT_FLAGS) insert.run(flag.key, flag.label, flag.description);

    let editor = false;
    const existing = db.prepare("SELECT 1 FROM profiles WHERE role = 'admin'").get();
    if (!existing) {
      const byEmail = db.prepare("SELECT id FROM profiles WHERE email = ?").get(EDITOR_EMAIL) as
        | { id: string }
        | undefined;
      if (byEmail) {
        db.prepare("UPDATE profiles SET role = 'admin' WHERE id = ?").run(byEmail.id);
      } else {
        db.prepare(
          `INSERT INTO profiles (id, email, password_hash, handle, display_name, bio, city_id, home_neighborhood, causes, role)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '[]', 'admin')`,
        ).run(
          EDITOR_ID,
          EDITOR_EMAIL,
          demoPasswordHash(),
          "editor",
          "The Editor",
          "Keeps the citywide desk: reports, strikes, flags, and the audit log.",
          CITY.id,
        );
      }
      editor = true;
    }

    const { count } = db.prepare("SELECT COUNT(*) AS count FROM feature_flags").get() as { count: number };
    return { flags: Number(count), editor };
  });
}

/**
 * Startup hook for Phase 6. The operational tables are intentionally small:
 * expired page events and resolved crash reports are pruned, while the public
 * record (ledger, reports, audit) is never touched.
 */
export function ensurePhase6(db: Db): { events: number; errors: number } {
  return transaction(db, () => pruneOperationalData(db));
}
