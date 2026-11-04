-- Phase 5 — trust, comms, and operations.
--
-- Notifications are the paper's internal post: one row per recipient per
-- event, written inside the same transaction as the action that caused it.
-- Moderation is a queue plus an append-only strike record; hiding content
-- never deletes it, so the audit trail survives.

ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE profiles ADD COLUMN age_band TEXT NOT NULL DEFAULT 'adult';
ALTER TABLE profiles ADD COLUMN guardian_consent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN restricted_until TEXT;

ALTER TABLE wins ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE resources ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;

CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  league_id   TEXT REFERENCES leagues(id) ON DELETE SET NULL,
  ref_type    TEXT NOT NULL DEFAULT '',
  ref_id      TEXT NOT NULL DEFAULT '',
  read_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_notifications_inbox ON notifications (profile_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (profile_id, read_at);

CREATE TABLE reports (
  id              TEXT PRIMARY KEY,
  reporter_id     TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  target_type     TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  league_id       TEXT REFERENCES leagues(id) ON DELETE SET NULL,
  reason          TEXT NOT NULL,
  detail          TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'open',
  handled_by      TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  handled_at      TEXT,
  resolution_note TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_reports_status ON reports (status, created_at DESC);
-- One open report per neighbour per item: a pile-on should not flood the queue.
CREATE UNIQUE INDEX idx_reports_open_dedupe
  ON reports (target_type, target_id, reporter_id)
  WHERE status = 'open';

CREATE TABLE strikes (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  league_id   TEXT REFERENCES leagues(id) ON DELETE SET NULL,
  report_id   TEXT REFERENCES reports(id) ON DELETE SET NULL,
  reason      TEXT NOT NULL,
  created_by  TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_strikes_profile ON strikes (profile_id, created_at DESC);

CREATE TABLE feature_flags (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled     INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by  TEXT REFERENCES profiles(id) ON DELETE SET NULL
);

INSERT INTO feature_flags (key, label, description, enabled) VALUES
  ('atlas_geolocation', 'Near me', 'Offer the browser location button on the Atlas.', 1),
  ('printed_profile', 'Printed profile', 'Offer the printable league sheet.', 1),
  ('resources_exchange', 'Resource exchange', 'Let members post and claim offers and needs.', 1),
  ('public_ledger', 'Public ledger', 'Publish the citywide Justice Points record.', 1);

CREATE INDEX idx_wins_hidden ON wins (hidden, status);
CREATE INDEX idx_resources_hidden ON resources (hidden, status);
