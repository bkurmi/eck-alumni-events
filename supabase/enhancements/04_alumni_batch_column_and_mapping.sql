-- ============================================================
-- Migration 04: Alumni Batch Column, One-Time Mapping & RPC Updates
-- File: supabase/enhancements/04_alumni_batch_column_and_mapping.sql
--
-- Features:
-- 1. Adds 'batch' VARCHAR(20) column to 'alumni' table (additive & safe).
-- 2. One-time mapping to backfill existing alumni based on their year_of_passing:
--    - Batches A to Z represent 1985 through 2010 pass outs:
--        1985 -> 'A', 1986 -> 'B', ..., 2010 -> 'Z' (1985 + 25 = 2010)
--    - Post 2010 (2011 onwards): Batch is identical to the year ('2011', '2012', etc.)
-- 3. Safely drops older overloaded function signatures to prevent Postgres 42725 ambiguity.
-- 4. Recreates `update_alumni_profile` and `register_for_event` with full batch support.
-- 5. Grants execute permissions unambiguously via specific function signatures.
-- ============================================================

-- 1. Add batch column to alumni table
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS batch VARCHAR(20);

-- 2. One-time backfill / mapping of batch for all existing alumni records
UPDATE alumni
SET batch = CASE
  WHEN year_of_passing >= 1985 AND year_of_passing <= 2010
    THEN CHR(65 + (year_of_passing - 1985)) -- 1985 -> 'A', 2010 -> 'Z'
  WHEN year_of_passing > 2010
    THEN year_of_passing::TEXT
  WHEN year_of_passing IS NOT NULL AND year_of_passing > 1900
    THEN year_of_passing::TEXT
  ELSE '2020'
END
WHERE batch IS NULL OR TRIM(batch) = '';

-- Index on batch for lightning-fast cohort filtering in alumni directory
CREATE INDEX IF NOT EXISTS idx_alumni_batch ON alumni(batch);

-- 3. Safely drop existing overloaded function signatures to prevent 42725 ambiguity
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname IN ('register_for_event', 'update_alumni_profile')
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE;';
  END LOOP;
END;
$$;

-- 4. Create canonical `update_alumni_profile` RPC function with `p_batch`
CREATE OR REPLACE FUNCTION update_alumni_profile(
  p_alumni_id               UUID,
  p_mobile                  TEXT,
  p_name                    TEXT,
  p_email                   TEXT DEFAULT NULL,
  p_year_of_passing         INTEGER DEFAULT NULL,
  p_batch                   TEXT DEFAULT NULL,
  p_engineering_discipline  TEXT DEFAULT NULL,
  p_organization            TEXT DEFAULT NULL,
  p_employment_type         TEXT DEFAULT NULL,
  p_industry_domain         TEXT DEFAULT NULL,
  p_professional_category   TEXT DEFAULT NULL,
  p_city                    TEXT DEFAULT NULL,
  p_state                   TEXT DEFAULT NULL,
  p_country                 TEXT DEFAULT 'India',
  p_address                 TEXT DEFAULT NULL,
  p_work_location           TEXT DEFAULT NULL,
  p_linkedin_url            TEXT DEFAULT NULL,
  p_photo_url               TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INT := 0;
  v_clean_mobile TEXT;
  v_prof_category TEXT;
  v_resolved_batch TEXT;
BEGIN
  -- Normalize mobile string by stripping whitespace and +91
  v_clean_mobile := REGEXP_REPLACE(p_mobile, '[^0-9]', '', 'g');
  IF LENGTH(v_clean_mobile) > 10 THEN
    v_clean_mobile := SUBSTRING(v_clean_mobile FROM LENGTH(v_clean_mobile) - 9 FOR 10);
  END IF;

  v_prof_category := COALESCE(
    p_professional_category,
    CASE 
      WHEN p_employment_type IS NOT NULL AND p_industry_domain IS NOT NULL THEN p_employment_type || ' • ' || p_industry_domain
      ELSE COALESCE(p_employment_type, p_industry_domain)
    END
  );

  -- Derive fallback batch if p_batch not explicitly provided
  v_resolved_batch := COALESCE(
    NULLIF(TRIM(p_batch), ''),
    CASE
      WHEN p_year_of_passing >= 1985 AND p_year_of_passing <= 2010 THEN CHR(65 + (p_year_of_passing - 1985))
      WHEN p_year_of_passing > 2010 THEN p_year_of_passing::TEXT
      ELSE NULL
    END
  );

  -- 1. Update alumni record matching id
  UPDATE alumni
     SET name                   = COALESCE(NULLIF(p_name, ''), name),
         email                  = COALESCE(p_email, email),
         batch                  = COALESCE(v_resolved_batch, batch),
         year_of_passing        = COALESCE(p_year_of_passing, year_of_passing),
         engineering_discipline = COALESCE(NULLIF(p_engineering_discipline, ''), engineering_discipline),
         organization           = COALESCE(p_organization, organization),
         employment_type        = COALESCE(p_employment_type, employment_type),
         industry_domain        = COALESCE(p_industry_domain, industry_domain),
         professional_category  = COALESCE(v_prof_category, professional_category),
         city                   = COALESCE(NULLIF(p_city, ''), city),
         state                  = COALESCE(NULLIF(p_state, ''), state),
         country                = COALESCE(NULLIF(p_country, ''), country),
         address                = COALESCE(NULLIF(p_address, ''), address),
         work_location          = COALESCE(p_work_location, work_location),
         linkedin_url           = COALESCE(p_linkedin_url, linkedin_url),
         photo_url              = COALESCE(NULLIF(p_photo_url, ''), photo_url),
         updated_at             = NOW()
   WHERE id = p_alumni_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Alumni record not found for id: ' || p_alumni_id
    );
  END IF;

  -- 2. Sync photo_url to event_registrations if a new photo was uploaded
  IF p_photo_url IS NOT NULL AND p_photo_url <> '' THEN
    UPDATE event_registrations
       SET photo_url  = p_photo_url,
           updated_at = NOW()
     WHERE alumni_id = p_alumni_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Profile updated successfully.',
    'alumni_id', p_alumni_id
  );
END;
$$;

-- 5. Create canonical `register_for_event` RPC function with `p_batch`
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
  p_children_under_7_count  INTEGER DEFAULT 0,
  p_batch                   TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_mobile        TEXT;
  v_event_id            UUID;
  v_event_status        TEXT;
  v_fee                 NUMERIC;
  v_pricing_config      JSONB;
  v_rate_single         NUMERIC := 0;
  v_rate_couple         NUMERIC := 0;
  v_rate_extra          NUMERIC := 0;
  v_rate_kid_above      NUMERIC := 0;
  v_total_amount        NUMERIC := 0;
  v_alumni_id           UUID;
  v_reg_id              UUID;
  v_reg_number          TEXT;
  v_is_update           BOOLEAN := FALSE;
  v_prof_category       TEXT;
  v_resolved_batch      TEXT;
BEGIN
  -- 1. Validate & normalize mobile
  v_clean_mobile := REGEXP_REPLACE(p_mobile, '[^0-9]', '', 'g');
  IF LENGTH(v_clean_mobile) > 10 THEN
    v_clean_mobile := SUBSTRING(v_clean_mobile FROM LENGTH(v_clean_mobile) - 9 FOR 10);
  END IF;

  IF LENGTH(v_clean_mobile) <> 10 THEN
    RETURN json_build_object('success', false, 'error', 'Mobile number must be exactly 10 digits.');
  END IF;

  -- 2. Lookup event
  SELECT id, status, registration_fee, pricing_config
    INTO v_event_id, v_event_status, v_fee, v_pricing_config
    FROM events
   WHERE event_slug = p_event_slug;

  IF v_event_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Event not found: ' || p_event_slug);
  END IF;

  IF v_event_status = 'CLOSED' OR v_event_status = 'COMPLETED' THEN
    RETURN json_build_object('success', false, 'error', 'Registration for this event is closed.');
  END IF;

  -- 3. Dynamic pricing calculation
  IF p_attendance_status = 'yes' OR p_attendance_status = 'payment_pending' THEN
    v_rate_single    := COALESCE((v_pricing_config->>'single_adult')::NUMERIC, v_fee, 0);
    v_rate_couple    := COALESCE((v_pricing_config->>'couple')::NUMERIC, v_rate_single, 0);
    v_rate_extra     := COALESCE((v_pricing_config->>'extra_adult')::NUMERIC, v_rate_single, 0);
    v_rate_kid_above := COALESCE((v_pricing_config->>'child_above_7')::NUMERIC, 0);

    IF p_adults_count IS NOT NULL AND p_adults_count > 0 THEN
      IF p_adults_count = 1 THEN
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

  -- Derive batch if not provided
  v_resolved_batch := COALESCE(
    NULLIF(TRIM(p_batch), ''),
    CASE
      WHEN p_year_of_passing >= 1985 AND p_year_of_passing <= 2010 THEN CHR(65 + (p_year_of_passing - 1985))
      WHEN p_year_of_passing > 2010 THEN p_year_of_passing::TEXT
      ELSE NULL
    END
  );

  v_prof_category := COALESCE(
    p_professional_category,
    CASE 
      WHEN p_employment_type IS NOT NULL AND p_industry_domain IS NOT NULL THEN p_employment_type || ' • ' || p_industry_domain
      ELSE COALESCE(p_employment_type, p_industry_domain)
    END
  );

  -- 4. Upsert alumni (reusable by mobile across all events)
  INSERT INTO alumni (
    name, email, mobile, address, country, city, state,
    batch, year_of_passing, engineering_discipline,
    organization, employment_type, industry_domain, professional_category, work_location
  ) VALUES (
    p_name, p_email, v_clean_mobile, p_address, COALESCE(p_country, 'India'), p_city, p_state,
    v_resolved_batch, p_year_of_passing, p_engineering_discipline,
    p_organization, p_employment_type, p_industry_domain, v_prof_category, p_work_location
  )
  ON CONFLICT (mobile) DO UPDATE SET
    name                   = EXCLUDED.name,
    email                  = COALESCE(EXCLUDED.email, alumni.email),
    address                = EXCLUDED.address,
    country                = EXCLUDED.country,
    city                   = EXCLUDED.city,
    state                  = EXCLUDED.state,
    batch                  = COALESCE(EXCLUDED.batch, alumni.batch),
    year_of_passing        = EXCLUDED.year_of_passing,
    engineering_discipline = EXCLUDED.engineering_discipline,
    organization           = COALESCE(EXCLUDED.organization, alumni.organization),
    employment_type        = COALESCE(EXCLUDED.employment_type, alumni.employment_type),
    industry_domain        = COALESCE(EXCLUDED.industry_domain, alumni.industry_domain),
    professional_category  = COALESCE(EXCLUDED.professional_category, alumni.professional_category),
    work_location          = COALESCE(EXCLUDED.work_location, alumni.work_location),
    updated_at             = NOW()
  RETURNING id INTO v_alumni_id;

  -- 5. Check if registration already exists for this event + alumnus
  SELECT id, registration_number
    INTO v_reg_id, v_reg_number
    FROM event_registrations
   WHERE event_id  = v_event_id
     AND alumni_id = v_alumni_id;

  IF v_reg_id IS NOT NULL THEN
    v_is_update := TRUE;
    UPDATE event_registrations
       SET attendance_status       = p_attendance_status,
           number_of_attendees     = GREATEST(COALESCE(p_number_of_attendees, 1), 1),
           adults_count            = COALESCE(p_adults_count, 1),
           children_above_7_count  = COALESCE(p_children_above_7_count, 0),
           children_under_7_count  = COALESCE(p_children_under_7_count, 0),
           amount                  = v_total_amount,
           payment_screenshot_path = COALESCE(p_payment_screenshot_path, payment_screenshot_path),
           updated_at              = NOW()
     WHERE id = v_reg_id;
  ELSE
    v_reg_number := 'REG-' || LPAD(nextval('registration_seq')::TEXT, 5, '0');

    INSERT INTO event_registrations (
      event_id, alumni_id, registration_number,
      attendance_status, number_of_attendees,
      adults_count, children_above_7_count, children_under_7_count,
      amount, payment_screenshot_path
    ) VALUES (
      v_event_id, v_alumni_id, v_reg_number,
      p_attendance_status, GREATEST(COALESCE(p_number_of_attendees, 1), 1),
      COALESCE(p_adults_count, 1), COALESCE(p_children_above_7_count, 0), COALESCE(p_children_under_7_count, 0),
      v_total_amount, p_payment_screenshot_path
    )
    RETURNING id INTO v_reg_id;
  END IF;

  RETURN json_build_object(
    'success',              true,
    'registration_id',      v_reg_id,
    'registration_number',  v_reg_number,
    'alumni_id',            v_alumni_id,
    'amount',               v_total_amount,
    'attendance_status',    p_attendance_status,
    'is_update',            v_is_update
  );
END;
$$;

-- 6. Unambiguously grant execute permissions to anon and authenticated
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname IN ('register_for_event', 'update_alumni_profile')
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.func_sig || ' TO anon, authenticated;';
  END LOOP;
END;
$$;
