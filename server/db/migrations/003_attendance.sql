-- Phase 2 — steward check-in and hour accounting.
--
-- A signup is a reservation. A steward records what actually happened:
-- attended (with hours) or no-show. The points ledger row is written once
-- per attendance with an idempotency key, so re-checking someone cannot mint
-- a second award.

ALTER TABLE shift_signups ADD COLUMN hours REAL NOT NULL DEFAULT 0;
ALTER TABLE shift_signups ADD COLUMN checked_in_at TEXT;
ALTER TABLE shift_signups ADD COLUMN checked_in_by TEXT REFERENCES profiles(id);

CREATE INDEX idx_signups_shift ON shift_signups (shift_id);
