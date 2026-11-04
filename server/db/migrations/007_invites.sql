-- Phase 2 — chapter invitations. A steward mints a single-use link; the token
-- is stored as a SHA-256 hash so a leaked database cannot replay it.
CREATE TABLE league_invites (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  league_id   TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  chapter_id  TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  role        TEXT NOT NULL DEFAULT 'member'
              CHECK (role IN ('member', 'steward')),
  note        TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  used_by     TEXT REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_league_invites_league ON league_invites (league_id, expires_at);
