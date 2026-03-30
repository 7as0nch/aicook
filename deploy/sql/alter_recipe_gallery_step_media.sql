-- Add multi-image columns (run on existing DBs). New installs: see base.sql.
SET search_path TO aicook, public;

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS gallery_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE recipe_steps
  ADD COLUMN IF NOT EXISTS media_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE recipe_steps
SET media_urls = jsonb_build_array(NULLIF(trim(media_url), ''))
WHERE (media_urls IS NULL OR media_urls = '[]'::jsonb)
  AND media_url IS NOT NULL
  AND trim(media_url) <> '';
