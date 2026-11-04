-- Phase 3 — standings cache, badges, streak tracking, anomalies, audit trail.
--
-- Phase 1 kept sealed fixture history in `leagues.base_points` /
-- `chapters.base_points` and added live ledger rows on top. Phase 3 makes the
-- ledger the single source of truth: sealed history is materialised into
-- `points_ledger` (see server/db/sealed.ts), and every displayed total is a
-- ledger sum. The base columns stay for provenance only.

CREATE TABLE league_standings (
  league_id         TEXT PRIMARY KEY REFERENCES leagues(id) ON DELETE CASCADE,
  cause             TEXT NOT NULL,
  city_id           TEXT NOT NULL,
  points            INTEGER NOT NULL DEFAULT 0,
  month_points      INTEGER NOT NULL DEFAULT 0,
  prev_month_points INTEGER NOT NULL DEFAULT 0,
  members           INTEGER NOT NULL DEFAULT 0,
  projects          INTEGER NOT NULL DEFAULT 0,
  hours             INTEGER NOT NULL DEFAULT 0,
  streak            INTEGER NOT NULL DEFAULT 0,
  trend             TEXT NOT NULL DEFAULT '[]',
  rank_global       INTEGER NOT NULL DEFAULT 0,
  rank_city         INTEGER NOT NULL DEFAULT 0,
  rank_cause        INTEGER NOT NULL DEFAULT 0,
  rank_month        INTEGER NOT NULL DEFAULT 0,
  rebuilt_at        TEXT NOT NULL
);

CREATE INDEX idx_standings_global ON league_standings (points DESC, members DESC, league_id);
CREATE INDEX idx_standings_month ON league_standings (month_points DESC, points DESC, league_id);
CREATE INDEX idx_standings_cause ON league_standings (cause, points DESC, members DESC, league_id);
CREATE INDEX idx_standings_rank_global ON league_standings (rank_global);
CREATE INDEX idx_standings_rank_month ON league_standings (rank_month);
CREATE INDEX idx_standings_rank_cause ON league_standings (rank_cause);

CREATE TABLE chapter_standings (
  chapter_id     TEXT PRIMARY KEY REFERENCES chapters(id) ON DELETE CASCADE,
  league_id      TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  points         INTEGER NOT NULL DEFAULT 0,
  month_points   INTEGER NOT NULL DEFAULT 0,
  rank_in_league INTEGER NOT NULL DEFAULT 0,
  rebuilt_at     TEXT NOT NULL
);

CREATE INDEX idx_chapter_standings_league ON chapter_standings (league_id, points DESC);

CREATE TABLE badges (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'sparkles',
  category    TEXT NOT NULL DEFAULT 'milestone',
  threshold   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE profile_badges (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_key  TEXT NOT NULL REFERENCES badges(key) ON DELETE CASCADE,
  league_id  TEXT REFERENCES leagues(id) ON DELETE SET NULL,
  awarded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (profile_id, badge_key)
);

CREATE INDEX idx_profile_badges_profile ON profile_badges (profile_id, awarded_at DESC);

CREATE TABLE anomalies (
  id              TEXT PRIMARY KEY,
  dedupe_key      TEXT NOT NULL UNIQUE,
  league_id       TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  profile_id      TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  ledger_id       TEXT REFERENCES points_ledger(id) ON DELETE SET NULL,
  category        TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'review'
                  CHECK (severity IN ('watch', 'review', 'severe')),
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'cleared', 'reversed')),
  detail          TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_by     TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at     TEXT,
  resolution_note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_anomalies_league ON anomalies (league_id, status, created_at DESC);

CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  league_id   TEXT REFERENCES leagues(id) ON DELETE CASCADE,
  actor_id    TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  meta        TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_audit_league ON audit_log (league_id, created_at DESC);

-- Time-scoped and per-chapter reads.
CREATE INDEX idx_ledger_created ON points_ledger (created_at);
CREATE INDEX idx_ledger_chapter ON points_ledger (chapter_id);
CREATE INDEX idx_ledger_ref ON points_ledger (ref_type, ref_id);
