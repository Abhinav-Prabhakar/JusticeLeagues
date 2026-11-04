-- Phase 2 — give every citywide league neighbourhood chapters.
--
-- Fresh databases get three chapters from the seed; this migration brings
-- databases seeded by Phase 1 up to the same shape. Base points are split
-- 60 / 25 / 15 so the chapter totals still equal the league total.

INSERT INTO chapters (id, league_id, neighborhood_id, name, base_points, status)
SELECT 'ch_' || l.id || '_2', l.id, n.id, n.name || ' chapter', 0, 'active'
FROM leagues l
JOIN neighborhoods n ON n.id = (
  SELECT n2.id
  FROM neighborhoods n2
  WHERE n2.city_id = l.city_id
    AND n2.id <> (SELECT c.neighborhood_id FROM chapters c WHERE c.id = 'ch_' || l.id)
  ORDER BY n2.name
  LIMIT 1
)
WHERE NOT EXISTS (SELECT 1 FROM chapters x WHERE x.id = 'ch_' || l.id || '_2');

INSERT INTO chapters (id, league_id, neighborhood_id, name, base_points, status)
SELECT 'ch_' || l.id || '_3', l.id, n.id, n.name || ' chapter', 0, 'active'
FROM leagues l
JOIN neighborhoods n ON n.id = (
  SELECT n2.id
  FROM neighborhoods n2
  WHERE n2.city_id = l.city_id
    AND n2.id NOT IN (
      (SELECT c.neighborhood_id FROM chapters c WHERE c.id = 'ch_' || l.id),
      (SELECT c.neighborhood_id FROM chapters c WHERE c.id = 'ch_' || l.id || '_2')
    )
  ORDER BY n2.name
  LIMIT 1
)
WHERE NOT EXISTS (SELECT 1 FROM chapters x WHERE x.id = 'ch_' || l.id || '_3');

UPDATE chapters
SET base_points = CAST(
  (SELECT l.base_points FROM leagues l WHERE l.id = chapters.league_id) * 60 / 100
  AS INTEGER
)
WHERE id = 'ch_' || league_id;

UPDATE chapters
SET base_points = CAST(
  (SELECT l.base_points FROM leagues l WHERE l.id = chapters.league_id) * 25 / 100
  AS INTEGER
)
WHERE id = 'ch_' || league_id || '_2';

UPDATE chapters
SET base_points =
  (SELECT l.base_points FROM leagues l WHERE l.id = chapters.league_id)
  - (SELECT COALESCE(SUM(c2.base_points), 0)
       FROM chapters c2
      WHERE c2.league_id = chapters.league_id AND c2.id <> chapters.id)
WHERE id = 'ch_' || league_id || '_3';
