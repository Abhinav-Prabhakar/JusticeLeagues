-- Phase 4 — real coordinates, full-text discovery, shareable chapters.

-- Leagues gain a real position. Neighbourhoods and chapters already carry
-- one from Phase 1; the startup backfill fills them for older databases.
ALTER TABLE leagues ADD COLUMN lat REAL;
ALTER TABLE leagues ADD COLUMN lng REAL;

-- A small FTS5 index over the fields a newcomer would type. It is a cache:
-- rebuilt on startup and after any league identity change, never trusted as
-- the source of truth.
CREATE VIRTUAL TABLE league_search USING fts5(
  league_id UNINDEXED,
  name,
  hood,
  cause,
  motto,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE INDEX idx_leagues_position ON leagues (lat, lng);
CREATE INDEX idx_chapters_position ON chapters (lat, lng);
