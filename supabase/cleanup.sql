-- ============================================================
-- ECK Alumni Events — Complete Database Cleanup / Reset
-- Execute this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Drop tables with CASCADE (automatically removes foreign keys, triggers, and RLS policies)
DROP TABLE IF EXISTS event_registrations CASCADE;
DROP TABLE IF EXISTS alumni CASCADE;
DROP TABLE IF EXISTS events CASCADE;

-- 2. Drop sequences
DROP SEQUENCE IF EXISTS registration_seq CASCADE;

-- 3. Drop stored functions
DROP FUNCTION IF EXISTS register_for_event CASCADE;
DROP FUNCTION IF EXISTS get_registration_by_mobile CASCADE;
DROP FUNCTION IF EXISTS get_event_registration_count CASCADE;
DROP FUNCTION IF EXISTS generate_registration_number CASCADE;
DROP FUNCTION IF EXISTS update_updated_at CASCADE;

-- 4. Drop storage policies
DROP POLICY IF EXISTS "anon_upload_screenshots" ON storage.objects;
DROP POLICY IF EXISTS "public_read_screenshots" ON storage.objects;
DROP POLICY IF EXISTS "admin_read_screenshots" ON storage.objects;

-- Optional: Delete all uploaded screenshots from bucket (uncomment if desired)
-- DELETE FROM storage.objects WHERE bucket_id = 'payment-screenshots';
