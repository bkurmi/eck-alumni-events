-- ============================================================
-- Migration v5: Gate Staff PIN Access & Single-Device Lock
-- Execute this in: Supabase Dashboard → SQL Editor → New Query
--
-- Features:
-- 1. Creates gate_staff_pins table for junior gatekeepers
-- 2. Each PIN is bound to exactly 1 person (and their specific device)
-- 3. High-speed RPC verify_gate_staff_pin for atomic login + device binding
-- 4. Admin functions to manage PINs and reset device locks if phones change
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABLE: gate_staff_pins
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gate_staff_pins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin           TEXT NOT NULL UNIQUE,
  staff_name    TEXT NOT NULL,
  station_name  TEXT DEFAULT 'Gate 1 (Main Entrance)',
  is_active     BOOLEAN DEFAULT TRUE,
  device_id     TEXT DEFAULT NULL,
  device_name   TEXT DEFAULT NULL,
  last_login_at TIMESTAMPTZ DEFAULT NULL,
  notes         TEXT DEFAULT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gate_staff_pins_pin ON gate_staff_pins(pin);
CREATE INDEX IF NOT EXISTS idx_gate_staff_pins_active ON gate_staff_pins(is_active);

-- ────────────────────────────────────────────────────────────
-- 2. RPC: verify_gate_staff_pin
-- Checks PIN and binds it to the first device that claims it
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION verify_gate_staff_pin(
  p_pin         TEXT,
  p_device_id   TEXT,
  p_device_name TEXT DEFAULT 'Mobile Browser'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record RECORD;
BEGIN
  -- Trim input PIN
  p_pin := TRIM(p_pin);

  IF p_pin IS NULL OR p_pin = '' THEN
    RETURN json_build_object(
      'success', false,
      'code', 'EMPTY_PIN',
      'message', 'Please enter your assigned Gate Access PIN.'
    );
  END IF;

  -- 1. Find the PIN entry
  SELECT *
    INTO v_record
    FROM gate_staff_pins
   WHERE pin = p_pin;

  -- Not found
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'code', 'INVALID_PIN',
      'message', 'Invalid PIN. Please check with Event Admin or Helpdesk.'
    );
  END IF;

  -- Check if active
  IF v_record.is_active IS NOT TRUE THEN
    RETURN json_build_object(
      'success', false,
      'code', 'DEACTIVATED',
      'message', 'This PIN has been deactivated. Contact Admin.'
    );
  END IF;

  -- 2. Device binding check
  IF v_record.device_id IS NULL OR v_record.device_id = '' THEN
    -- First time this PIN is used on any phone! Bind to this device.
    UPDATE gate_staff_pins
       SET device_id = p_device_id,
           device_name = COALESCE(p_device_name, 'Mobile Device'),
           last_login_at = NOW(),
           updated_at = NOW()
     WHERE id = v_record.id;

    RETURN json_build_object(
      'success', true,
      'code', 'BOUND_AND_LOGGED_IN',
      'message', 'Welcome, ' || v_record.staff_name || '! Your phone has been securely linked to this PIN.',
      'staff_id', v_record.id,
      'staff_name', v_record.staff_name,
      'station_name', COALESCE(v_record.station_name, 'Gate 1'),
      'device_locked', true
    );

  ELSIF v_record.device_id = p_device_id THEN
    -- Same device returning: allow immediate login
    UPDATE gate_staff_pins
       SET last_login_at = NOW(),
           device_name = COALESCE(p_device_name, device_name),
           updated_at = NOW()
     WHERE id = v_record.id;

    RETURN json_build_object(
      'success', true,
      'code', 'LOGGED_IN',
      'message', 'Welcome back, ' || v_record.staff_name,
      'staff_id', v_record.id,
      'staff_name', v_record.staff_name,
      'station_name', COALESCE(v_record.station_name, 'Gate 1'),
      'device_locked', true
    );

  ELSE
    -- Device mismatch! Another person or phone tried to open with this PIN.
    RETURN json_build_object(
      'success', false,
      'code', 'DEVICE_MISMATCH',
      'message', 'Access Denied: This PIN is already locked to another device (' || COALESCE(v_record.device_name, 'another phone') || '). Each PIN is strictly for 1 person only. Ask Admin to reset device lock if you changed phones.',
      'registered_to', v_record.staff_name
    );
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION verify_gate_staff_pin TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. RPC: admin_reset_gate_staff_device
-- Allows Admin to release a device lock if a volunteer changes phone
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_reset_gate_staff_device(
  p_pin_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE gate_staff_pins
     SET device_id = NULL,
         device_name = NULL,
         updated_at = NOW()
   WHERE id = p_pin_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Device lock cleared. The volunteer can now log in on their new phone.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_gate_staff_device TO authenticated, anon;

-- ────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────

ALTER TABLE gate_staff_pins ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated admins and anon via public API
DROP POLICY IF EXISTS "allow_read_gate_pins" ON gate_staff_pins;
CREATE POLICY "allow_read_gate_pins"
  ON gate_staff_pins FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "allow_insert_gate_pins" ON gate_staff_pins;
CREATE POLICY "allow_insert_gate_pins"
  ON gate_staff_pins FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "allow_update_gate_pins" ON gate_staff_pins;
CREATE POLICY "allow_update_gate_pins"
  ON gate_staff_pins FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "allow_delete_gate_pins" ON gate_staff_pins;
CREATE POLICY "allow_delete_gate_pins"
  ON gate_staff_pins FOR DELETE
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON gate_staff_pins TO anon, authenticated;