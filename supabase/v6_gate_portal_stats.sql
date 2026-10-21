-- ============================================================
-- Migration v6: Live Gate Dashboard Stats & Gate Access Permissions
-- Execute this in: Supabase Dashboard → SQL Editor → New Query
--
-- Why this is needed:
-- Gate staff / volunteers log in to the Gate Portal using a PIN
-- (not Supabase Auth email/password), so their Supabase client
-- operates with the 'anon' role.
--
-- Previously, Row Level Security (RLS) on event_registrations,
-- alumni, and payment_verifications only permitted 'authenticated'
-- users (admins) to SELECT rows. Therefore:
-- 1. Admins could see Total Registered, Paid & Approved, and ID Cards Generated.
-- 2. PIN-authenticated gate staff always saw 0 for those 3 cards.
--
-- This script fixes that by:
-- 1. Creating a high-speed SECURITY DEFINER RPC 'get_gate_dashboard_stats'
--    granting instant, aggregated metrics to both anon and authenticated.
-- 2. Adding SELECT policies for anon on event_registrations, alumni, and
--    payment_verifications so any fallback client queries succeed.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. RPC: get_gate_dashboard_stats
-- Instant, atomic metric aggregation for gate portal dashboard
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_gate_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_registered        INT := 0;
  v_total_paid              INT := 0;
  v_total_not_paid          INT := 0;
  v_total_id_cards          INT := 0;
  v_total_verified_at_gate  INT := 0;
  v_total_heads_inside      INT := 0;
  v_turnout_percent         INT := 0;
BEGIN
  -- 1. Total portal registrations
  SELECT COUNT(*) INTO v_total_registered
    FROM event_registrations;

  -- 2. Paid & Approved registrations
  -- (attendance_status = 'yes' OR has a VERIFIED record in payment_verifications)
  SELECT COUNT(DISTINCT er.id) INTO v_total_paid
    FROM event_registrations er
   WHERE er.attendance_status = 'yes'
      OR EXISTS (
        SELECT 1 
          FROM payment_verifications pv
         WHERE pv.registration_id = er.id 
           AND pv.verified_status = 'VERIFIED'
      );

  v_total_not_paid := GREATEST(0, v_total_registered - v_total_paid);

  -- 3. ID Cards Generated (id_card_generated = true OR photo_url is provided)
  SELECT COUNT(*) INTO v_total_id_cards
    FROM event_registrations
   WHERE id_card_generated = true 
      OR (photo_url IS NOT NULL AND photo_url <> '');

  -- 4. Gate entries count & heads inside venue
  SELECT 
    COUNT(*),
    COALESCE(SUM(COALESCE(accompanying_count, 1)), 0)
    INTO v_total_verified_at_gate, v_total_heads_inside
    FROM gate_entries;

  -- 5. Turnout percentage (Verified at gate vs Paid)
  IF v_total_paid > 0 THEN
    v_turnout_percent := ROUND((v_total_verified_at_gate::NUMERIC / v_total_paid::NUMERIC) * 100);
  ELSE
    v_turnout_percent := 0;
  END IF;

  RETURN json_build_object(
    'totalRegistered', v_total_registered,
    'totalPaid', v_total_paid,
    'totalNotPaid', v_total_not_paid,
    'totalIdCardsGenerated', v_total_id_cards,
    'totalVerifiedAtGate', v_total_verified_at_gate,
    'totalHeadsInside', v_total_heads_inside,
    'turnoutPercent', v_turnout_percent
  );
END;
$$;

-- Allow both anon (Gate PIN staff) and authenticated (Admin) to execute
GRANT EXECUTE ON FUNCTION get_gate_dashboard_stats() TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. RLS POLICIES FOR ANONYMOUS READ ACCESS (GATE COUNTER FALLBACK)
-- ────────────────────────────────────────────────────────────

-- Allow anon to select from event_registrations for gate counters
DROP POLICY IF EXISTS "allow_anon_read_gate_registrations" ON event_registrations;
CREATE POLICY "allow_anon_read_gate_registrations"
  ON event_registrations FOR SELECT TO anon
  USING (true);

-- Allow anon to select from alumni for gate verification lookups
DROP POLICY IF EXISTS "allow_anon_read_gate_alumni" ON alumni;
CREATE POLICY "allow_anon_read_gate_alumni"
  ON alumni FOR SELECT TO anon
  USING (true);

-- Allow anon to select payment_verifications to check paid status
DROP POLICY IF EXISTS "allow_anon_read_gate_payment_verifications" ON payment_verifications;
CREATE POLICY "allow_anon_read_gate_payment_verifications"
  ON payment_verifications FOR SELECT TO anon
  USING (true);

-- Ensure grants are in place for the anon role
GRANT SELECT ON event_registrations TO anon;
GRANT SELECT ON alumni TO anon;
GRANT SELECT ON payment_verifications TO anon;
