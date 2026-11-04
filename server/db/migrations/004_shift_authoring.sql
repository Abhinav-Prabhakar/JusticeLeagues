-- Phase 2 — stewards can put new shifts on the roster.
-- Keep an audit trail for locally authored shifts; seeded shifts stay NULL.

ALTER TABLE shifts ADD COLUMN created_by TEXT REFERENCES profiles(id);
