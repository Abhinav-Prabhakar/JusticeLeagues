-- Phase 6 — hardening, observability, and launch.
--
-- Three small tables carry the operational edition:
--   error_reports  client crashes, so a real neighbour's broken screen is
--                  visible on the editor's desk instead of only in a console.
--   pulse_events   a private, local funnel. Page names and server-authored
--                  actions only; no IP, user agent, or cross-site identifier.
--   pilot_notes    the weekly feedback loop, filed by the editor.
--
-- Backups are files on disk (see scripts/db/cli `backup`), deliberately not a
-- table: a backup inside the database it protects is not a backup.

CREATE TABLE error_reports (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  message     TEXT NOT NULL,
  stack       TEXT NOT NULL DEFAULT '',
  component   TEXT NOT NULL DEFAULT '',
  path        TEXT NOT NULL DEFAULT '',
  request_id  TEXT NOT NULL DEFAULT '',
  resolved_at TEXT,
  resolved_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_error_reports_recent ON error_reports (created_at DESC);
CREATE INDEX idx_error_reports_open ON error_reports (resolved_at, created_at DESC);

CREATE TABLE pulse_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  league_id  TEXT REFERENCES leagues(id) ON DELETE SET NULL,
  path       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_pulse_events_name ON pulse_events (event_name, created_at DESC);
CREATE INDEX idx_pulse_events_recent ON pulse_events (created_at DESC);

CREATE TABLE pilot_notes (
  id         TEXT PRIMARY KEY,
  league_id  TEXT REFERENCES leagues(id) ON DELETE SET NULL,
  author_id  TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL DEFAULT 'note'
             CHECK (kind IN ('note', 'friction', 'win')),
  body       TEXT NOT NULL,
  week       TEXT NOT NULL DEFAULT (strftime('%Y-%W', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_pilot_notes_recent ON pilot_notes (created_at DESC);
