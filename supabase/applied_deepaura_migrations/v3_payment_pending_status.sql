-- ============================================================
-- Migration v3: Introduce 'payment_pending' Attendance Status
-- Execute this in: Supabase Dashboard → SQL Editor → New Query
--
-- Why:
-- When users click "Pay by UPI", their draft details are saved.
-- Previously, they were saved with attendance_status = 'yes',
-- causing uncompleted/abandoned payments to inflate attendee headcounts
-- and financial totals.
--
-- With this migration:
-- 1. attendance_status allows 'payment_pending'
-- 2. register_for_event calculates amount for 'payment_pending'
-- 3. Only when user submits their payment screenshot does the status
--    promote to 'yes' (Confirmed Attending).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. UPDATE CHECK CONSTRAINT ON event_registrations
-- ────────────────────────────────────────────────────────────

ALTER TABLE event_registrations 
  DROP CONSTRAINT IF EXISTS event_registrations_attendance_status_check;

ALTER TABLE event_registrations 
  ADD CONSTRAINT event_registrations_attendance_status_check 
  CHECK (attendance_status IN ('yes', 'maybe', 'no', 'payment_pending'));


-- ────────────────────────────────────────────────────────────
-- 2. UPDATE RPC FUNCTION: register_for_event
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION register_for_event(
  p_event_slug              TEXT,
  p_name                    TEXT,
  p_mobile                  TEXT DEFAULT NULL,
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
  v_total_amount          NUMERIC;
  v_prof_category         TEXT;
  v_is_update             BOOLEAN := false;
  v_mobile                TEXT;
BEGIN
  -- Normalize or generate unique offline identifier if mobile is omitted
  v_mobile := COALESCE(NULLIF(TRIM(p_mobile), ''), 'NOMOBILE-' || gen_random_uuid()::TEXT);
  -- Compute category if needed
  v_prof_category := COALESCE(
    p_professional_category,
    CASE 
      WHEN p_employment_type IS NOT NULL AND p_industry_domain IS NOT NULL THEN p_employment_type || ' • ' || p_industry_domain
      ELSE COALESCE(p_employment_type, p_industry_domain, 'Other')
    END
  );

  -- 1. Look up event
  SELECT id, registration_fee
    INTO v_event_id, v_fee
    FROM events
   WHERE event_slug = p_event_slug
     AND status = 'OPEN';

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Event not found or registration is closed';
  END IF;

  -- 2. Calculate total (for 'yes' or 'payment_pending'; if not attending/maybe, fee is 0)
  IF p_attendance_status IN ('yes', 'payment_pending') THEN
    IF p_adults_count IS NOT NULL THEN
      IF p_adults_count <= 0 THEN
        v_total_amount := 0;
      ELSIF p_adults_count = 1 THEN
        v_total_amount := 800;
      ELSIF p_adults_count = 2 THEN
        v_total_amount := 1500;
      ELSE
        v_total_amount := 1500 + (p_adults_count - 2) * 800;
      END IF;
      v_total_amount := v_total_amount + (COALESCE(p_children_above_7_count, 0) * 300);
    ELSE
      v_total_amount := v_fee * GREATEST(COALESCE(p_number_of_attendees, 1), 1);
    END IF;
  ELSE
    v_total_amount := 0;
  END IF;

  -- 3. Upsert alumni (by mobile)
  INSERT INTO alumni (
    name, email, mobile, address, country, city, state,
    year_of_passing, engineering_discipline,
    organization, employment_type, industry_domain, professional_category, work_location
  ) VALUES (
    p_name, p_email, v_mobile, p_address, COALESCE(p_country, 'India'), p_city, p_state,
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

  -- Check if this is an update to an existing registration
  SELECT registration_number INTO v_registration_number
  FROM event_registrations
  WHERE event_id = v_event_id AND alumni_id = v_alumni_id;

  IF v_registration_number IS NOT NULL THEN
    v_is_update := true;
  ELSE
    v_is_update := false;
    v_registration_number := 'REG-' || LPAD(nextval('registration_seq')::TEXT, 5, '0');
  END IF;

  -- 4. Create or update registration
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

  -- 5. Return result
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

GRANT EXECUTE ON FUNCTION register_for_event TO anon;

-- ────────────────────────────────────────────────────────────
-- 3. (OPTIONAL) RETROACTIVE CLEANUP
-- Uncomment and run the query below if you wish to convert any existing
-- 'yes' registrations that do not have any uploaded screenshot into 'payment_pending':
--
-- UPDATE event_registrations
--    SET attendance_status = 'payment_pending'
--  WHERE attendance_status = 'yes'
--    AND (payment_screenshot_path IS NULL OR payment_screenshot_path = '')
--    AND amount > 0;
-- ────────────────────────────────────────────────────────────
