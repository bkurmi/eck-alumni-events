-- ============================================================
-- Migration v17: Event-Scoped Registration Numbering & Dynamic Pricing
-- File: supabase/v17_event_scoped_registration_and_pricing.sql
--
-- Features:
-- 1. Adds event_code and pricing_config to events table.
-- 2. Creates atomic per-event registration sequence counter
--    (event_registration_counters) so each event starts from 0001
--    with its unique prefix (e.g. DA26-0001, NY27-0001, HM27-0001).
-- 3. Updates register_for_event() to calculate amounts dynamically
--    based on each event's pricing_config (with seamless fallbacks).
-- 4. Updates spot_register_at_gate() to use event-scoped numbering
--    and dynamic spot pricing.
-- 5. Preserves 100% of existing registration records and numbering.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ADD COLUMNS TO events TABLE
-- ────────────────────────────────────────────────────────────

ALTER TABLE events ADD COLUMN IF NOT EXISTS event_code TEXT DEFAULT NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS pricing_config JSONB DEFAULT NULL;

-- Backfill existing DeepAura 2K26 with code 'DA26' and current pricing rules
UPDATE events
SET 
  event_code = COALESCE(event_code, 'DA26'),
  pricing_config = COALESCE(
    pricing_config,
    '{
      "single_adult": 800,
      "couple": 1500,
      "extra_adult": 800,
      "child_above_7": 300,
      "child_under_7": 0,
      "spot_adult": 1000,
      "spot_child_above_10": 500,
      "spot_child_under_10": 0
    }'::jsonb
  )
WHERE event_slug = 'deepaura-2k26';


-- ────────────────────────────────────────────────────────────
-- 2. TABLE: event_registration_counters
-- Tracks atomic integer counters per event
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_registration_counters (
  event_id    UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  last_val    INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE event_registration_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_event_registration_counters" ON event_registration_counters;
CREATE POLICY "admin_manage_event_registration_counters"
  ON event_registration_counters FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed current count for existing events so future registrations continue cleanly
INSERT INTO event_registration_counters (event_id, last_val)
SELECT 
  e.id, 
  COALESCE((
    SELECT COUNT(*) 
    FROM event_registrations r 
    WHERE r.event_id = e.id
  ), 0)
FROM events e
ON CONFLICT (event_id) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 3. HELPER FUNCTION: get_next_event_registration_number
-- Atomically generates e.g. DA26-0001, NY27-0001, HM27-0001
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_next_event_registration_number(p_event_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix    TEXT;
  v_next_val  INTEGER;
BEGIN
  -- 1. Determine prefix from events table
  SELECT COALESCE(
    NULLIF(TRIM(event_code), ''),
    UPPER(SUBSTRING(REGEXP_REPLACE(event_slug, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 4)),
    'REG'
  )
  INTO v_prefix
  FROM events
  WHERE id = p_event_id;

  IF v_prefix IS NULL OR v_prefix = '' THEN
    v_prefix := 'REG';
  END IF;

  -- 2. Atomically increment counter for this specific event
  INSERT INTO event_registration_counters (event_id, last_val, updated_at)
  VALUES (
    p_event_id,
    COALESCE((SELECT COUNT(*) FROM event_registrations WHERE event_id = p_event_id), 0) + 1,
    NOW()
  )
  ON CONFLICT (event_id)
  DO UPDATE SET 
    last_val = event_registration_counters.last_val + 1,
    updated_at = NOW()
  RETURNING last_val INTO v_next_val;

  RETURN v_prefix || '-' || LPAD(v_next_val::TEXT, 4, '0');
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 4. UPDATE TRIGGER ON event_registrations
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_registration_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.registration_number IS NULL OR NEW.registration_number = '' THEN
    IF NEW.event_id IS NOT NULL THEN
      NEW.registration_number := get_next_event_registration_number(NEW.event_id);
    ELSE
      -- Fallback to global sequence if event_id somehow omitted
      NEW.registration_number := 'REG-' || LPAD(nextval('registration_seq')::TEXT, 5, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ────────────────────────────────────────────────────────────
-- 5. RPC: register_for_event (DYNAMIC PRICING & EVENT SCOPING)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION register_for_event(
  p_event_slug              TEXT,
  p_name                    TEXT,
  p_mobile                  TEXT,
  p_address                 TEXT,
  p_city                    TEXT,
  p_state                   TEXT,
  p_year_of_passing         INTEGER,
  p_engineering_discipline  TEXT,
  p_country                 TEXT DEFAULT 'India',
  p_professional_category   TEXT DEFAULT NULL,
  p_attendance_status       TEXT DEFAULT 'yes',
  p_number_of_attendees     INTEGER DEFAULT 1,
  p_email                   TEXT DEFAULT NULL,
  p_organization            TEXT DEFAULT NULL,
  p_work_location           TEXT DEFAULT NULL,
  p_payment_screenshot_path TEXT DEFAULT NULL,
  p_employment_type         TEXT DEFAULT NULL,
  p_industry_domain         TEXT DEFAULT NULL,
  p_adults_count            INTEGER DEFAULT 1,
  p_children_above_7_count  INTEGER DEFAULT 0,
  p_children_under_7_count  INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id              UUID;
  v_alumni_id             UUID;
  v_registration_id       UUID;
  v_registration_number   TEXT;
  v_fee                   NUMERIC;
  v_pricing_config        JSONB;
  v_rate_single           NUMERIC;
  v_rate_couple           NUMERIC;
  v_rate_extra            NUMERIC;
  v_rate_kid_above        NUMERIC;
  v_total_amount          NUMERIC := 0;
  v_prof_category         TEXT;
  v_is_update             BOOLEAN := false;
BEGIN
  -- Compute category if needed
  v_prof_category := COALESCE(
    p_professional_category,
    CASE 
      WHEN p_employment_type IS NOT NULL AND p_industry_domain IS NOT NULL THEN p_employment_type || ' • ' || p_industry_domain
      ELSE COALESCE(p_employment_type, p_industry_domain, 'Other')
    END
  );

  -- 1. Look up event and pricing config
  SELECT id, registration_fee, pricing_config
    INTO v_event_id, v_fee, v_pricing_config
    FROM events
   WHERE event_slug = p_event_slug
     AND status IN ('OPEN', 'DRAFT');

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Event not found or registration is closed';
  END IF;

  -- 2. Extract dynamic pricing rates strictly from event (NO hardcoded 800)
  v_rate_single := COALESCE((v_pricing_config->>'single_adult')::NUMERIC, v_fee);
  IF v_rate_single IS NULL OR v_rate_single <= 0 THEN
    RAISE EXCEPTION 'Registration fee is not configured for event "%"', p_event_slug;
  END IF;

  v_rate_couple    := COALESCE((v_pricing_config->>'couple')::NUMERIC, (v_rate_single * 2) - 100);
  v_rate_extra     := COALESCE((v_pricing_config->>'extra_adult')::NUMERIC, v_rate_single);
  v_rate_kid_above := COALESCE(
    (v_pricing_config->>'child_above_7')::NUMERIC,
    (v_pricing_config->>'child_above_10')::NUMERIC,
    ROUND(v_rate_single * 0.375)
  );

  -- 3. Calculate total contribution
  IF p_attendance_status IN ('yes', 'payment_pending') THEN
    IF p_adults_count IS NOT NULL THEN
      IF p_adults_count <= 0 THEN
        v_total_amount := 0;
      ELSIF p_adults_count = 1 THEN
        v_total_amount := v_rate_single;
      ELSIF p_adults_count = 2 THEN
        v_total_amount := v_rate_couple;
      ELSE
        v_total_amount := v_rate_couple + ((p_adults_count - 2) * v_rate_extra);
      END IF;
      v_total_amount := v_total_amount + (COALESCE(p_children_above_7_count, 0) * v_rate_kid_above);
    ELSE
      v_total_amount := v_rate_single * GREATEST(COALESCE(p_number_of_attendees, 1), 1);
    END IF;
  ELSE
    v_total_amount := 0;
  END IF;

  -- 4. Upsert alumni (reusable by mobile across all events)
  INSERT INTO alumni (
    name, email, mobile, address, country, city, state,
    year_of_passing, engineering_discipline,
    organization, employment_type, industry_domain, professional_category, work_location
  ) VALUES (
    p_name, p_email, p_mobile, p_address, COALESCE(p_country, 'India'), p_city, p_state,
    p_year_of_passing, p_engineering_discipline,
    p_organization, p_employment_type, p_industry_domain, v_prof_category, p_work_location
  )
  ON CONFLICT (mobile) DO UPDATE SET
    name                   = EXCLUDED.name,
    email                  = COALESCE(EXCLUDED.email, alumni.email),
    address                = EXCLUDED.address,
    country                = EXCLUDED.country,
    city                   = EXCLUDED.city,
    state                  = EXCLUDED.state,
    year_of_passing        = EXCLUDED.year_of_passing,
    engineering_discipline = EXCLUDED.engineering_discipline,
    organization           = COALESCE(EXCLUDED.organization, alumni.organization),
    employment_type        = COALESCE(EXCLUDED.employment_type, alumni.employment_type),
    industry_domain        = COALESCE(EXCLUDED.industry_domain, alumni.industry_domain),
    professional_category  = COALESCE(EXCLUDED.professional_category, alumni.professional_category),
    work_location          = COALESCE(EXCLUDED.work_location, alumni.work_location),
    updated_at             = NOW()
  RETURNING id INTO v_alumni_id;

  -- 5. Check if alumnus is already registered for this specific event
  SELECT registration_number INTO v_registration_number
  FROM event_registrations
  WHERE event_id = v_event_id AND alumni_id = v_alumni_id;

  IF v_registration_number IS NOT NULL THEN
    v_is_update := true;
  ELSE
    v_is_update := false;
    v_registration_number := get_next_event_registration_number(v_event_id);
  END IF;

  -- 6. Insert or Update Event Registration
  INSERT INTO event_registrations (
    registration_number,
    event_id, alumni_id, attendance_status,
    number_of_attendees, adults_count, children_above_7_count, children_under_7_count,
    amount, payment_screenshot_path
  ) VALUES (
    v_registration_number,
    v_event_id, v_alumni_id, p_attendance_status,
    p_number_of_attendees, COALESCE(p_adults_count, 1), COALESCE(p_children_above_7_count, 0), COALESCE(p_children_under_7_count, 0),
    v_total_amount, p_payment_screenshot_path
  )
  ON CONFLICT (event_id, alumni_id) DO UPDATE SET
    attendance_status       = EXCLUDED.attendance_status,
    number_of_attendees     = EXCLUDED.number_of_attendees,
    adults_count            = EXCLUDED.adults_count,
    children_above_7_count  = EXCLUDED.children_above_7_count,
    children_under_7_count  = EXCLUDED.children_under_7_count,
    amount                  = EXCLUDED.amount,
    payment_screenshot_path = CASE
      WHEN EXCLUDED.payment_screenshot_path IS NOT NULL AND EXCLUDED.payment_screenshot_path <> '' THEN
        CASE
          WHEN event_registrations.payment_screenshot_path IS NOT NULL 
               AND event_registrations.payment_screenshot_path <> '' 
               AND position(EXCLUDED.payment_screenshot_path in event_registrations.payment_screenshot_path) = 0 THEN
            event_registrations.payment_screenshot_path || ',' || EXCLUDED.payment_screenshot_path
          ELSE COALESCE(event_registrations.payment_screenshot_path, EXCLUDED.payment_screenshot_path)
        END
      ELSE event_registrations.payment_screenshot_path
    END,
    updated_at              = NOW()
  RETURNING id, registration_number
    INTO v_registration_id, v_registration_number;

  -- 7. Return Result
  RETURN json_build_object(
    'success',             true,
    'registration_id',     v_registration_id,
    'registration_number', v_registration_number,
    'alumni_id',           v_alumni_id,
    'amount',              v_total_amount,
    'attendance_status',   p_attendance_status,
    'is_update',           v_is_update
  );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 6. RPC: spot_register_at_gate (DYNAMIC EVENT NUMBERING & PRICING)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION spot_register_at_gate(
  p_event_slug              TEXT,
  p_name                    TEXT,
  p_mobile                  TEXT,
  p_discipline              TEXT,
  p_year_of_passing         INTEGER,
  p_number_of_attendees     INTEGER DEFAULT 1,
  p_payment_mode            TEXT DEFAULT 'CASH',
  p_amount                  NUMERIC DEFAULT NULL,
  p_verified_by             TEXT DEFAULT 'Gate Spot Desk',
  p_payment_screenshot_path TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_mobile        TEXT;
  v_event_id            UUID;
  v_fee                 NUMERIC;
  v_pricing_config      JSONB;
  v_default_spot_rate   NUMERIC;
  v_final_amount        NUMERIC;
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
  SELECT id, registration_fee, pricing_config 
    INTO v_event_id, v_fee, v_pricing_config 
    FROM events 
   WHERE event_slug = p_event_slug 
   LIMIT 1;

  IF v_event_id IS NULL THEN
    SELECT id, registration_fee, pricing_config 
      INTO v_event_id, v_fee, v_pricing_config 
      FROM events 
     ORDER BY event_date DESC 
     LIMIT 1;
  END IF;

  -- Compute default spot rate from event's pricing_config or base registration_fee
  v_default_spot_rate := COALESCE(
    (v_pricing_config->>'spot_adult')::NUMERIC,
    CASE WHEN v_fee IS NOT NULL AND v_fee > 0 THEN ROUND(v_fee * 1.25) ELSE NULL END,
    1000
  );
  v_final_amount := COALESCE(p_amount, v_default_spot_rate * GREATEST(COALESCE(p_number_of_attendees, 1), 1));

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

  -- 3. Check if alumnus is ALREADY registered for this event
  SELECT registration_number INTO v_reg_number
    FROM event_registrations
   WHERE event_id = v_event_id AND alumni_id = v_alumni_id;

  -- Only generate new registration number if not registered yet
  IF v_reg_number IS NULL THEN
    v_reg_number := get_next_event_registration_number(v_event_id);
  END IF;

  -- 4. Create or Update Event Registration
  INSERT INTO event_registrations (
    registration_number,
    event_id,
    alumni_id,
    attendance_status,
    number_of_attendees,
    adults_count,
    amount,
    payment_screenshot_path,
    id_card_generated,
    id_card_generated_at
  ) VALUES (
    v_reg_number,
    v_event_id,
    v_alumni_id,
    'yes',
    COALESCE(p_number_of_attendees, 1),
    COALESCE(p_number_of_attendees, 1),
    v_final_amount,
    p_payment_screenshot_path,
    true,
    NOW()
  )
  ON CONFLICT (event_id, alumni_id) DO UPDATE SET
    attendance_status = 'yes',
    number_of_attendees = EXCLUDED.number_of_attendees,
    adults_count = EXCLUDED.adults_count,
    amount = EXCLUDED.amount,
    payment_screenshot_path = COALESCE(EXCLUDED.payment_screenshot_path, event_registrations.payment_screenshot_path),
    updated_at = NOW()
  RETURNING id INTO v_reg_id;

  -- 5. Auto-Verify Payment for Spot Registration
  INSERT INTO payment_verifications (
    registration_id,
    verified_status,
    verified_by,
    verified_at,
    notes
  ) VALUES (
    v_reg_id,
    'verified',
    COALESCE(p_verified_by, 'Gate Spot Desk'),
    NOW(),
    'Spot Desk Walk-in • Mode: ' || UPPER(COALESCE(p_payment_mode, 'CASH')) || ' • ₹' || v_final_amount
  )
  ON CONFLICT (registration_id) DO UPDATE SET
    verified_status = 'verified',
    verified_by = EXCLUDED.verified_by,
    verified_at = NOW(),
    notes = EXCLUDED.notes;

  -- 6. Log Gate Check-in Entry
  INSERT INTO gate_checkins (
    registration_id,
    event_id,
    alumni_id,
    headcount,
    status,
    checked_in_by,
    notes
  ) VALUES (
    v_reg_id,
    v_event_id,
    v_alumni_id,
    COALESCE(p_number_of_attendees, 1),
    'checked_in',
    COALESCE(p_verified_by, 'Gate Spot Desk'),
    'Spot registration instant entry'
  )
  RETURNING id INTO v_gate_id;

  RETURN json_build_object(
    'success', true,
    'registration_id', v_reg_id,
    'registration_number', v_reg_number,
    'alumni_id', v_alumni_id,
    'amount', v_final_amount,
    'gate_checkin_id', v_gate_id
  );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 7. RPC: get_registration_by_reg_number (SUPPORTS ANY PREFIX)
-- Supports DA26-0001, NY27-0001, REG-00001, or raw digits
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_registration_by_reg_number(
  p_event_slug  TEXT,
  p_reg_number  TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id    UUID;
  v_event_code  TEXT;
  v_clean_input TEXT;
  v_digits      TEXT;
  v_reg_record  RECORD;
BEGIN
  v_clean_input := UPPER(TRIM(COALESCE(p_reg_number, '')));
  v_digits := REGEXP_REPLACE(v_clean_input, '\D', '', 'g');

  IF v_clean_input = '' THEN
    RETURN json_build_object('found', false, 'error', 'Invalid registration number');
  END IF;

  -- 1. Find Event
  SELECT id, event_code 
    INTO v_event_id, v_event_code
    FROM events
   WHERE event_slug = p_event_slug;

  IF v_event_id IS NULL THEN
    RETURN json_build_object('found', false, 'error', 'Event not found');
  END IF;

  -- 2. Find registration by exact number, with or without prefix
  SELECT
    r.id AS registration_id,
    r.registration_number,
    r.attendance_status,
    r.number_of_attendees,
    COALESCE(r.adults_count, 1) AS adults_count,
    COALESCE(r.children_above_7_count, 0) AS children_above_7_count,
    COALESCE(r.children_under_7_count, 0) AS children_under_7_count,
    r.amount,
    r.payment_screenshot_path,
    r.photo_url,
    r.created_at,
    r.updated_at,
    a.id AS alumni_id,
    a.name,
    a.email,
    a.mobile,
    a.address,
    a.country,
    a.city,
    a.state,
    a.year_of_passing,
    a.engineering_discipline,
    a.organization,
    a.employment_type,
    a.industry_domain,
    a.professional_category,
    a.work_location
  INTO v_reg_record
  FROM event_registrations r
  JOIN alumni a ON a.id = r.alumni_id
  WHERE r.event_id = v_event_id
    AND (
      UPPER(r.registration_number) = v_clean_input
      OR (v_digits <> '' AND UPPER(r.registration_number) = 'REG-' || LPAD(v_digits, 5, '0'))
      OR (v_digits <> '' AND v_event_code IS NOT NULL AND UPPER(r.registration_number) = UPPER(v_event_code) || '-' || LPAD(v_digits, 4, '0'))
      OR (v_digits <> '' AND RIGHT(REGEXP_REPLACE(r.registration_number, '\D', '', 'g'), LENGTH(v_digits)) = v_digits)
    )
  ORDER BY r.updated_at DESC
  LIMIT 1;

  IF v_reg_record.registration_id IS NULL THEN
    RETURN json_build_object('found', false);
  END IF;

  RETURN json_build_object(
    'found',                   true,
    'registration_id',         v_reg_record.registration_id,
    'registration_number',     v_reg_record.registration_number,
    'attendance_status',       v_reg_record.attendance_status,
    'number_of_attendees',     v_reg_record.number_of_attendees,
    'adults_count',            v_reg_record.adults_count,
    'children_above_7_count',  v_reg_record.children_above_7_count,
    'children_under_7_count',  v_reg_record.children_under_7_count,
    'amount',                  v_reg_record.amount,
    'payment_screenshot_path', v_reg_record.payment_screenshot_path,
    'photo_url',               v_reg_record.photo_url,
    'created_at',              v_reg_record.created_at,
    'updated_at',              v_reg_record.updated_at,
    'alumni', json_build_object(
      'id',                     v_reg_record.alumni_id,
      'name',                   v_reg_record.name,
      'email',                  v_reg_record.email,
      'mobile',                 v_reg_record.mobile,
      'address',                v_reg_record.address,
      'country',                v_reg_record.country,
      'city',                   v_reg_record.city,
      'state',                  v_reg_record.state,
      'year_of_passing',        v_reg_record.year_of_passing,
      'engineering_discipline', v_reg_record.engineering_discipline,
      'organization',           v_reg_record.organization,
      'employment_type',        v_reg_record.employment_type,
      'industry_domain',        v_reg_record.industry_domain,
      'professional_category',  v_reg_record.professional_category,
      'work_location',          v_reg_record.work_location
    )
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 8. PERMISSIONS & GRANTS
-- ────────────────────────────────────────────────────────────

GRANT ALL ON event_registration_counters TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_event_registration_number(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION register_for_event TO anon, authenticated;
GRANT EXECUTE ON FUNCTION spot_register_at_gate TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_registration_by_reg_number TO anon, authenticated;

