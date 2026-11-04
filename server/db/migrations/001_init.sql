-- Phase 1 — identity, citywide leagues, neighbourhood chapters, shifts.

CREATE TABLE cities (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  center_lat REAL,
  center_lng REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE neighborhoods (
  id         TEXT PRIMARY KEY,
  city_id    TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  lat        REAL,
  lng        REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (city_id, slug)
);

CREATE TABLE profiles (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash     TEXT NOT NULL,
  handle            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name      TEXT NOT NULL,
  bio               TEXT NOT NULL DEFAULT '',
  city_id           TEXT REFERENCES cities(id),
  home_neighborhood TEXT REFERENCES neighborhoods(id),
  causes            TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE leagues (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  cause         TEXT NOT NULL,
  city_id       TEXT NOT NULL REFERENCES cities(id),
  motto         TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  founded_year  INTEGER,
  photo_id      INTEGER,
  atlas_x       REAL,
  atlas_y       REAL,
  delta         INTEGER NOT NULL DEFAULT 0,
  trend         TEXT NOT NULL DEFAULT '[]',
  -- Sealed history imported from the founding chapters. Live action is
  -- appended to points_ledger; the public total is base + SUM(ledger.delta).
  base_points   INTEGER NOT NULL DEFAULT 0,
  base_city_points  INTEGER NOT NULL DEFAULT 0,
  base_month_points INTEGER NOT NULL DEFAULT 0,
  base_members  INTEGER NOT NULL DEFAULT 0,
  base_projects INTEGER NOT NULL DEFAULT 0,
  base_hours    INTEGER NOT NULL DEFAULT 0,
  base_streak   INTEGER NOT NULL DEFAULT 0,
  recruiting    INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE chapters (
  id              TEXT PRIMARY KEY,
  league_id       TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  neighborhood_id TEXT NOT NULL REFERENCES neighborhoods(id),
  name            TEXT NOT NULL,
  lat             REAL,
  lng             REAL,
  base_points     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (league_id, neighborhood_id)
);

CREATE TABLE league_members (
  league_id  TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id),
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'steward', 'member')),
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'left')),
  joined_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (league_id, profile_id)
);

CREATE TABLE shifts (
  id          TEXT PRIMARY KEY,
  league_id   TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  chapter_id  TEXT NOT NULL REFERENCES chapters(id),
  title       TEXT NOT NULL,
  day         INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
  starts_at   TEXT NOT NULL,
  duration    TEXT NOT NULL,
  place_name  TEXT NOT NULL,
  capacity    INTEGER NOT NULL CHECK (capacity > 0),
  -- Spots already filled before this local database existed.
  base_filled INTEGER NOT NULL DEFAULT 0,
  bring       TEXT NOT NULL DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'full', 'cancelled', 'done')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE shift_signups (
  shift_id   TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'reserved'
             CHECK (status IN ('reserved', 'confirmed', 'waitlist', 'attended', 'no_show', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (shift_id, profile_id)
);

CREATE TABLE wins (
  id          TEXT PRIMARY KEY,
  league_id   TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  chapter_id  TEXT REFERENCES chapters(id),
  title       TEXT NOT NULL,
  points      INTEGER NOT NULL DEFAULT 0,
  photo_id    INTEGER,
  facts       TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE points_ledger (
  id              TEXT PRIMARY KEY,
  profile_id      TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  league_id       TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  chapter_id      TEXT REFERENCES chapters(id),
  delta           INTEGER NOT NULL CHECK (delta <> 0),
  reason          TEXT NOT NULL,
  ref_type        TEXT NOT NULL,
  ref_id          TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_ledger_league ON points_ledger (league_id);
CREATE INDEX idx_ledger_profile ON points_ledger (profile_id);
CREATE INDEX idx_members_profile ON league_members (profile_id);
CREATE INDEX idx_signups_profile ON shift_signups (profile_id);
CREATE INDEX idx_shifts_league ON shifts (league_id);
CREATE INDEX idx_sessions_profile ON sessions (profile_id);
CREATE INDEX idx_sessions_expiry ON sessions (expires_at);
