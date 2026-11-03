-- ============================================================
-- Migration v13: Event Registration Deadline & Status Management
-- File: supabase/v13_event_registration_deadline_and_status.sql
--
-- Features:
-- 1. Add registration_closes_at column to events table.
--    Allows changing the deadline directly in Supabase without code redeployment or restart!
-- 2. Security Definer RPC: sync_event_registration_status
-- 3. Automatically sets status to 'CLOSED' if NOW() >= registration_closes_at
-- ============================================================

-- 1. Add registration_closes_at column to events table
ALTER TABLE events 
  ADD COLUMN IF NOT EXISTS registration_closes_at TIMESTAMPTZ DEFAULT '2026-10-30 23:59:59+05:30'::TIMESTAMPTZ;

-- 2. Update existing event record (30th October night 12:00 midnight IST)
UPDATE events
   SET registration_closes_at = '2026-10-30 23:59:59+05:30'::TIMESTAMPTZ
 WHERE event_slug = 'deepaura-2k26';

-- 3. Create RPC function to synchronize event status ('OPEN' or 'CLOSED')
CREATE OR REPLACE FUNCTION sync_event_registration_status(
  p_event_slug  TEXT,
  p_status      TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_updated_status TEXT;
BEGIN
  -- Validate status parameter
  IF p_status NOT IN ('OPEN', 'CLOSED', 'DRAFT', 'COMPLETED') THEN
    RAISE EXCEPTION 'Invalid event status: %', p_status;
  END IF;

  UPDATE events
     SET status = p_status,
         updated_at = NOW()
   WHERE event_slug = p_event_slug
  RETURNING id, status INTO v_event_id, v_updated_status;

  IF v_event_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Event slug not found'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'event_id', v_event_id,
    'status', v_updated_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_event_registration_status(TEXT, TEXT) TO anon, authenticated;

-- 4. Immediate check: if system timestamp is past the deadline, set status to CLOSED
DO $$
BEGIN
  UPDATE events
     SET status = 'CLOSED',
         updated_at = NOW()
   WHERE event_slug = 'deepaura-2k26'
     AND status = 'OPEN'
     AND NOW() >= registration_closes_at;
END $$;
