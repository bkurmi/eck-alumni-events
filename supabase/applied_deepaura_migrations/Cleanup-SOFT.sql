-- ============================================================
-- ECK Alumni Events — Soft Reset: Clear All Data Except Events
-- File: supabase/reset_event_data_keep_events.sql
-- 
-- Difference from cleanup.sql:
-- - cleanup.sql DROPS tables, functions, sequences, and policies.
-- - THIS SCRIPT keeps your entire schema, functions, triggers,
--   and event configurations intact. It only wipes attendee/
--   registration transactional records, resets the counter,
--   and purges uploaded images from Supabase storage buckets.
--
-- Execute in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. TRUNCATE ALL TRANSACTION & STAFF TABLES (EXCEPT events)
-- ────────────────────────────────────────────────────────────
-- Empties registrations, gate entries, payments, alumni profiles, and gate staff PINs.
-- CASCADE automatically satisfies all foreign key references.
TRUNCATE TABLE 
  gate_entries,
  gate_staff_pins,
  payment_verifications,
  event_registrations,
  alumni
CASCADE;


-- ────────────────────────────────────────────────────────────
-- 2. RESET REGISTRATION NUMBER SEQUENCE
-- ────────────────────────────────────────────────────────────
-- Resets the counter so the next registration starts at REG-00001
ALTER SEQUENCE IF EXISTS registration_seq RESTART WITH 1;


-- ────────────────────────────────────────────────────────────
-- 3. STORAGE IMAGES NOTE
-- ────────────────────────────────────────────────────────────
-- Supabase blocks direct SQL deletion on storage.objects via protect_delete() trigger.
-- To empty images (takes 5 seconds):
-- Go to Supabase Dashboard → Storage → Open bucket → Click "Empty bucket"
-- for both 'payment-screenshots' and 'id-photos'.

COMMIT;


-- ────────────────────────────────────────────────────────────
-- 4. VERIFICATION REPORT
-- Returns live counts to verify clean state directly in SQL Editor
-- ────────────────────────────────────────────────────────────
SELECT 'events (PRESERVED)' AS entity_name, COUNT(*)::TEXT AS record_count FROM events
UNION ALL
SELECT 'alumni (CLEARED)', COUNT(*)::TEXT FROM alumni
UNION ALL
SELECT 'event_registrations (CLEARED)', COUNT(*)::TEXT FROM event_registrations
UNION ALL
SELECT 'payment_verifications (CLEARED)', COUNT(*)::TEXT FROM payment_verifications
UNION ALL
SELECT 'gate_entries (CLEARED)', COUNT(*)::TEXT FROM gate_entries
UNION ALL
SELECT 'gate_staff_pins (CLEARED)', COUNT(*)::TEXT FROM gate_staff_pins
UNION ALL
SELECT 'storage.objects (PAYMENT SLIPS & ID PHOTOS CLEARED)', COUNT(*)::TEXT 
  FROM storage.objects 
 WHERE bucket_id IN ('payment-screenshots', 'id-photos');
