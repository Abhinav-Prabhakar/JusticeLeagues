-- Phase 2 — shared resources: offers and needs posted by members.
-- A resource is claimed by one member at a time; claims keep their own history
-- so a handoff can be audited without rewriting rows.

CREATE TABLE resources (
  id          TEXT PRIMARY KEY,
  league_id   TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  chapter_id  TEXT REFERENCES chapters(id),
  kind        TEXT NOT NULL CHECK (kind IN ('offer', 'want')),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity    TEXT NOT NULL DEFAULT '',
  needed_by   TEXT,
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'claimed', 'fulfilled', 'expired')),
  created_by  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  claimed_by  TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE resource_claims (
  id          TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'released', 'fulfilled')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_resources_league_status ON resources (league_id, status);
CREATE INDEX idx_resource_claims_resource ON resource_claims (resource_id);
