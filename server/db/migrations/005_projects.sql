-- Phase 2 — projects filed by members and approved by stewards.
-- A win is an approved project; pending and rejected rows stay in the same
-- table so review history is preserved and the public feed can filter.

ALTER TABLE wins ADD COLUMN summary TEXT NOT NULL DEFAULT '';
ALTER TABLE wins ADD COLUMN evidence_url TEXT;
ALTER TABLE wins ADD COLUMN submitted_by TEXT REFERENCES profiles(id);
ALTER TABLE wins ADD COLUMN reviewed_by TEXT REFERENCES profiles(id);
ALTER TABLE wins ADD COLUMN reviewed_at TEXT;
ALTER TABLE wins ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
  CHECK (status IN ('submitted', 'approved', 'rejected'));

CREATE INDEX idx_wins_league_status ON wins (league_id, status);
