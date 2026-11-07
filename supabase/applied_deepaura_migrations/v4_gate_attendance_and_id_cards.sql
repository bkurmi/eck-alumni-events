-- ============================================================
-- Migration v4: Gate Attendance Verification, ID Cards & Spot Registration
-- Execute this in: Supabase Dashboard → SQL Editor → New Query
--
-- Safe & Non-breaking:
-- 1. Adds photo_url and id_card_generated to event_registrations
-- 2. Creates gate_entries table to track actual physical entry
-- 3. Creates RPC functions for instant QR code gate verification
-- 4. Creates bucket and policies for attendee ID photos
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. COLUMNS: photo_url & id_card_generated on event_registrations
-- ────────────────────────────────────────────────────────────

ALTER TABLE event_registrations 
  ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS id_card_generated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS id_card_generated_at TIMESTAMPTZ DEFAULT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. TABLE: gate_entries
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gate_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id     UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  event_id            UUID REFERENCES events(id) ON DELETE SET NULL,
  phone_number        TEXT NOT NULL,
  attendee_name       TEXT NOT NULL,
  badge_category      TEXT DEFAULT 'Alumnus',
  branch              TEXT,
  year_of_passing     INTEGER,
  accompanying_count  INTEGER DEFAULT 1,
  payment_status      TEXT NOT NULL DEFAULT 'VERIFIED',
  entry_mode          TEXT NOT NULL DEFAULT 'qr_scan'
                        CHECK (entry_mode IN ('qr_scan', 'manual_phone', 'spot_registration')),
  verified_by         TEXT,
  entered_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Anti-Fraud: strictly 1 gate entry record per registration
  CONSTRAINT unique_gate_entry_per_registration UNIQUE (registration_id)
);

-- Indexes for instant gate lookups (< 5ms response time)
CREATE INDEX IF NOT EXISTS idx_gate_entries_reg_id ON gate_entries(registration_id);
CREATE INDEX IF NOT EXISTS idx_gate_entries_phone ON gate_entries(phone_number);
CREATE INDEX IF NOT EXISTS idx_gate_entries_entered_at ON gate_entries(entered_at);

-- ────────────────────────────────────────────────────────────
-- 3. RPC: verify_and_log_gate_entry
-- High-speed atomic verification called by gate QR scanner / phone lookup
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION verify_and_log_gate_entry(
  p_phone_number      TEXT,
  p_verified_by       TEXT DEFAULT 'Gate Staff',
  p_entry_mode        TEXT DEFAULT 'qr_scan'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_mobile      TEXT;
  v_reg_record        RECORD;
  v_existing_entry    RECORD;
  v_new_entry_id      UUID;
  v_is_paid           BOOLEAN := false;
  v_badge             TEXT;
BEGIN
  -- Normalize mobile number to last 10 digits
  v_clean_mobile := RIGHT(REGEXP_REPLACE(COALESCE(p_phone_number, ''), '\D', '', 'g'), 10);
  
  IF LENGTH(v_clean_mobile) < 10 THEN
    RETURN json_build_object(
      'success', false,
      'status', 'INVALID_PHONE',
      'message', 'Phone number must be at least 10 digits'
    );
  END IF;

  -- 1. Find registration and alumnus details
  SELECT 
    er.id AS registration_id,
    er.registration_number,
    er.event_id,
    er.attendance_status,
    er.number_of_attendees,
    er.adults_count,
    er.children_above_7_count,
    er.children_under_7_count,
    er.amount,
    er.photo_url,
    a.id AS alumni_id,
    a.name AS alumni_name,
    a.mobile AS alumni_mobile,
    a.engineering_discipline,
    a.year_of_passing,
    a.professional_category,
    a.city,
    a.state
  INTO v_reg_record
  FROM event_registrations er
  JOIN alumni a ON a.id = er.alumni_id
  WHERE RIGHT(REGEXP_REPLACE(a.mobile, '\D', '', 'g'), 10) = v_clean_mobile
  ORDER BY er.created_at DESC
  LIMIT 1;

  IF v_reg_record.registration_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'status', 'NOT_FOUND',
      'message', 'No registration found for phone ' || v_clean_mobile
    );
  END IF;

  -- Determine badge category
  v_badge := COALESCE(v_reg_record.professional_category, 'Alumnus');
  IF v_badge = '' THEN
    v_badge := 'Alumnus';
  END IF;

  -- 2. Check if already checked in at gate
  SELECT id, entered_at, verified_by, entry_mode
    INTO v_existing_entry
    FROM gate_entries
   WHERE registration_id = v_reg_record.registration_id;

  IF v_existing_entry.id IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'status', 'ALREADY_ENTERED',
      'message', 'Attendee already entered at ' || to_char(v_existing_entry.entered_at, 'HH12:MI AM on DD Mon'),
      'entered_at', v_existing_entry.entered_at,
      'verified_by', v_existing_entry.verified_by,
      'attendee_name', v_reg_record.alumni_name,
      'registration_number', v_reg_record.registration_number,
      'phone_number', v_clean_mobile,
      'number_of_attendees', v_reg_record.number_of_attendees
    );
  END IF;

  -- 3. Check Payment Status
  -- Payment is considered valid if attendance_status is 'yes'
  -- OR there is a VERIFIED record in payment_verifications
  IF v_reg_record.attendance_status = 'yes' THEN
    v_is_paid := true;
  ELSIF EXISTS (
    SELECT 1 FROM payment_verifications
    WHERE registration_id = v_reg_record.registration_id
      AND verified_status = 'VERIFIED'
  ) THEN
    v_is_paid := true;
  ELSE
    v_is_paid := false;
  END IF;

  IF NOT v_is_paid THEN
    RETURN json_build_object(
      'success', false,
      'status', 'PAYMENT_PENDING',
      'message', 'Payment is pending or not yet approved. Please verify payment at helpdesk.',
      'attendee_name', v_reg_record.alumni_name,
      'registration_number', v_reg_record.registration_number,
      'phone_number', v_clean_mobile,
      'amount', v_reg_record.amount,
      'attendance_status', v_reg_record.attendance_status
    );
  END IF;

  -- 4. Mark Entry in gate_entries
  INSERT INTO gate_entries (
    registration_id,
    event_id,
    phone_number,
    attendee_name,
    badge_category,
    branch,
    year_of_passing,
    accompanying_count,
    payment_status,
    entry_mode,
    verified_by,
    entered_at
  ) VALUES (
    v_reg_record.registration_id,
    v_reg_record.event_id,
    v_clean_mobile,
    v_reg_record.alumni_name,
    v_badge,
    v_reg_record.engineering_discipline,
    v_reg_record.year_of_passing,
    COALESCE(v_reg_record.number_of_attendees, 1),
    'VERIFIED',
    COALESCE(p_entry_mode, 'qr_scan'),
    COALESCE(p_verified_by, 'Gate Staff'),
    NOW()
  )
  RETURNING id INTO v_new_entry_id;

  RETURN json_build_object(
    'success', true,
    'status', 'ENTERED',
    'message', 'Entry approved for ' || v_reg_record.alumni_name,
    'gate_entry_id', v_new_entry_id,
    'registration_id', v_reg_record.registration_id,
    'registration_number', v_reg_record.registration_number,
    'attendee_name', v_reg_record.alumni_name,
    'phone_number', v_clean_mobile,
    'badge_category', v_badge,
    'branch', v_reg_record.engineering_discipline,
    'year_of_passing', v_reg_record.year_of_passing,
    'number_of_attendees', v_reg_record.number_of_attendees,
    'adults_count', v_reg_record.adults_count,
    'children_above_7_count', v_reg_record.children_above_7_count,
    'children_under_7_count', v_reg_record.children_under_7_count,
    'photo_url', v_reg_record.photo_url,
    'entered_at', NOW(),
    'verified_by', p_verified_by
  );
END;
$$;

GRANT EXECUTE ON FUNCTION verify_and_log_gate_entry TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. RPC: update_attendee_photo_card
-- Attendee uploads photo & marks card as generated
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_attendee_photo_card(
  p_registration_id   UUID,
  p_photo_url         TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE event_registrations
     SET photo_url = COALESCE(p_photo_url, photo_url),
         id_card_generated = true,
         id_card_generated_at = NOW(),
         updated_at = NOW()
   WHERE id = p_registration_id;

  RETURN json_build_object(
    'success', true,
    'registration_id', p_registration_id,
    'photo_url', p_photo_url
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_attendee_photo_card TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. RPC: spot_register_at_gate
-- Instant on-the-spot walk-in registration at the event gate
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION spot_register_at_gate(
  p_event_slug            TEXT,
  p_name                  TEXT,
  p_mobile                TEXT,
  p_discipline            TEXT,
  p_year_of_passing       INTEGER,
  p_number_of_attendees   INTEGER DEFAULT 1,
  p_payment_mode          TEXT DEFAULT 'CASH',
  p_amount                NUMERIC DEFAULT 800,
  p_verified_by           TEXT DEFAULT 'Gate Spot Desk'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_mobile        TEXT;
  v_event_id            UUID;
  v_alumni_id           UUID;
  v_reg_id              UUID;
  v_reg_number          TEXT;
  v_gate_id             UUID;
BEGIN
  v_clean_mobile := RIGHT(REGEXP_REPLACE(COALESCE(p_mobile, ''), '\D', '', 'g'), 10);
  IF LENGTH(v_clean_mobile) < 10 THEN
    v_clean_mobile := '99999' || LPAD((FLOOR(RANDOM() * 90000 + 10000))::TEXT, 5, '0');
  END IF;

  -- 1. Find event
  SELECT id INTO v_event_id FROM events WHERE event_slug = p_event_slug LIMIT 1;
  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id FROM events ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- 2. Upsert Alumni
  INSERT INTO alumni (
    name, mobile, address, city, state, country,
    year_of_passing, engineering_discipline, professional_category
  ) VALUES (
    p_name, v_clean_mobile, 'Kota (Spot Walk-in)', 'Kota', 'Rajasthan', 'India',
    p_year_of_passing, p_discipline, 'Alumnus'
  )
  ON CONFLICT (mobile) DO UPDATE SET
    name = EXCLUDED.name,
    year_of_passing = EXCLUDED.year_of_passing,
    engineering_discipline = EXCLUDED.engineering_discipline,
    updated_at = NOW()
  RETURNING id INTO v_alumni_id;

  -- 3. Create Event Registration
  v_reg_number := 'REG-' || LPAD(nextval('registration_seq')::TEXT, 5, '0');

  INSERT INTO event_registrations (
    registration_number,
    event_id,
    alumni_id,
    attendance_status,
    number_of_attendees,
    adults_count,
    amount,
    id_card_generated,
    id_card_generated_at
  ) VALUES (
    v_reg_number,
    v_event_id,
    v_alumni_id,
    'yes',
    COALESCE(p_number_of_attendees, 1),
    COALESCE(p_number_of_attendees, 1),
    p_amount,
    true,
    NOW()
  )
  ON CONFLICT (event_id, alumni_id) DO UPDATE SET
    attendance_status = 'yes',
    number_of_attendees = EXCLUDED.number_of_attendees,
    amount = EXCLUDED.amount,
    updated_at = NOW()
  RETURNING id, registration_number INTO v_reg_id, v_reg_number;

  -- 4. Record Payment Verification (Spot payment confirmed)
  INSERT INTO payment_verifications (
    registration_id,
    upi_id,
    amount,
    verified_status,
    notes,
    verified_by
  ) VALUES (
    v_reg_id,
    p_payment_mode,
    p_amount,
    'VERIFIED',
    'Spot registration completed at gate (' || p_payment_mode || ')',
    p_verified_by
  )
  ON CONFLICT (registration_id) DO UPDATE SET
    verified_status = 'VERIFIED',
    amount = EXCLUDED.amount,
    notes = EXCLUDED.notes,
    verified_by = EXCLUDED.verified_by,
    updated_at = NOW();

  -- 5. Record Gate Entry immediately
  INSERT INTO gate_entries (
    registration_id,
    event_id,
    phone_number,
    attendee_name,
    badge_category,
    branch,
    year_of_passing,
    accompanying_count,
    payment_status,
    entry_mode,
    verified_by
  ) VALUES (
    v_reg_id,
    v_event_id,
    v_clean_mobile,
    p_name,
    'Alumnus',
    p_discipline,
    p_year_of_passing,
    COALESCE(p_number_of_attendees, 1),
    'VERIFIED (' || p_payment_mode || ')',
    'spot_registration',
    p_verified_by
  )
  ON CONFLICT (registration_id) DO NOTHING
  RETURNING id INTO v_gate_id;

  RETURN json_build_object(
    'success', true,
    'registration_id', v_reg_id,
    'registration_number', v_reg_number,
    'attendee_name', p_name,
    'phone_number', v_clean_mobile,
    'number_of_attendees', p_number_of_attendees,
    'branch', p_discipline,
    'year_of_passing', p_year_of_passing,
    'amount', p_amount,
    'payment_mode', p_payment_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION spot_register_at_gate TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY (RLS) FOR gate_entries
-- ────────────────────────────────────────────────────────────

ALTER TABLE gate_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_read_gate_entries" ON gate_entries;
CREATE POLICY "allow_read_gate_entries"
  ON gate_entries FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "allow_insert_gate_entries" ON gate_entries;
CREATE POLICY "allow_insert_gate_entries"
  ON gate_entries FOR INSERT TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS "allow_update_gate_entries" ON gate_entries;
CREATE POLICY "allow_update_gate_entries"
  ON gate_entries FOR UPDATE TO public
  USING (true);

DROP POLICY IF EXISTS "allow_delete_gate_entries" ON gate_entries;
CREATE POLICY "allow_delete_gate_entries"
  ON gate_entries FOR DELETE TO authenticated
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON gate_entries TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 7. SUPABASE STORAGE BUCKET: id-photos
-- ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('id-photos', 'id-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public read of attendee ID photos
DROP POLICY IF EXISTS "Public can view id photos" ON storage.objects;
CREATE POLICY "Public can view id photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'id-photos');

-- Allow public upload of attendee ID photos
DROP POLICY IF EXISTS "Public can upload id photos" ON storage.objects;
CREATE POLICY "Public can upload id photos"
  ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'id-photos');

-- Allow public update of attendee ID photos
DROP POLICY IF EXISTS "Public can update id photos" ON storage.objects;
CREATE POLICY "Public can update id photos"
  ON storage.objects FOR UPDATE TO public
  USING (bucket_id = 'id-photos');
