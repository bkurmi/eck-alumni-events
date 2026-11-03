-- ============================================================
-- Migration v16: Event Memory Wall & Social Highlights
-- File: supabase/v16_event_memory_media.sql
--
-- Adds memory_media JSONB column to events table to store:
-- {
--   "photos": ["https://.../photo1.jpg", "https://.../photo2.jpg"],
--   "youtube_url": "https://www.youtube.com/watch?v=...",
--   "instagram_url": "https://www.instagram.com/..."
-- }
-- ============================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS memory_media JSONB DEFAULT NULL;

