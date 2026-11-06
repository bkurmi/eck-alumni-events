-- ==============================================================================
-- Migration 05: Add Alumni Designation & Standardize ASCII Pipe Separator
-- ==============================================================================
-- 1. Strictly additive: adds `designation` column to `alumni` table.
-- 2. Standardizes professional_category concatenation to ASCII ' | ' instead of
--    Unicode ' • ' to prevent mojibake corruption ('â€¢') on Windows/Excel exports.
-- 3. One-time clean-up of corrupted 'â€¢' and bullet points in existing records.
-- ==============================================================================

-- 1. Add designation column to alumni table
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS designation TEXT;

-- 2. Clean up existing corrupted mojibake entries and bullets in professional_category
UPDATE alumni
   SET professional_category = REPLACE(professional_category, 'â€¢', ' | ')
 WHERE professional_category LIKE '%â€¢%';

UPDATE alumni
   SET professional_category = REPLACE(professional_category, ' • ', ' | ')
 WHERE professional_category LIKE '% • %';

-- 3. Create or replace canonical `update_alumni_profile` RPC with `p_designation` & ASCII separator
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
  p_photo_url               TEXT DEFAULT NULL,
  p_designation             TEXT DEFAULT NULL
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
      WHEN p_employment_type IS NOT NULL AND p_industry_domain IS NOT NULL THEN p_employment_type || ' | ' || p_industry_domain
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

  -- Update alumni record matching id
  UPDATE alumni
     SET name                   = COALESCE(NULLIF(p_name, ''), name),
         email                  = COALESCE(p_email, email),
         batch                  = COALESCE(v_resolved_batch, batch),
         year_of_passing        = COALESCE(p_year_of_passing, year_of_passing),
         engineering_discipline = COALESCE(NULLIF(p_engineering_discipline, ''), engineering_discipline),
         organization           = COALESCE(p_organization, organization),
         designation            = COALESCE(p_designation, designation),
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

  -- Sync photo_url to event_registrations if a new photo was uploaded
  IF p_photo_url IS NOT NULL AND p_photo_url <> '' THEN
    UPDATE event_registrations
       SET photo_url  = p_photo_url,
           updated_at = NOW()
     WHERE alumni_id  = p_alumni_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'alumni_id', p_alumni_id,
    'photo_url', p_photo_url
  );
END;
$$;

-- 4. Create or replace canonical `register_for_event` RPC with `p_designation` & ASCII separator
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
  p_batch                   TEXT DEFAULT NULL,
  p_designation             TEXT DEFAULT NULL
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
  -- Normalize mobile string by stripping whitespace and +91
  v_clean_mobile := REGEXP_REPLACE(p_mobile, '[^0-9]', '', 'g');
  IF LENGTH(v_clean_mobile) > 10 THEN
    v_clean_mobile := SUBSTRING(v_clean_mobile FROM LENGTH(v_clean_mobile) - 9 FOR 10);
  END IF;

  -- 1. Find the target event by slug
  SELECT id, status, registration_fee, pricing_config
    INTO v_event_id, v_event_status, v_fee, v_pricing_config
    FROM events
   WHERE event_slug = p_event_slug;

  IF v_event_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Event not found for slug: ' || p_event_slug
    );
  END IF;

  -- 2. Reject registrations if event is CLOSED or COMPLETED
  IF v_event_status IN ('CLOSED', 'COMPLETED') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Registration is currently closed for this event edition.'
    );
  END IF;

  -- 3. Calculate amount based on pricing config
  IF p_attendance_status IN ('yes', 'payment_pending') THEN
    IF v_pricing_config IS NOT NULL THEN
      v_rate_single    := COALESCE((v_pricing_config->>'single')::NUMERIC, COALESCE(v_fee, 1000));
      v_rate_couple    := COALESCE((v_pricing_config->>'couple')::NUMERIC, v_rate_single * 2);
      v_rate_extra     := COALESCE((v_pricing_config->>'extra_adult')::NUMERIC, v_rate_single);
      v_rate_kid_above := COALESCE((v_pricing_config->>'child_above_7')::NUMERIC, 500);

      IF COALESCE(p_adults_count, 1) = 1 THEN
        v_total_amount := v_rate_single;
      ELSIF COALESCE(p_adults_count, 1) = 2 THEN
        v_total_amount := v_rate_couple;
      ELSIF COALESCE(p_adults_count, 1) > 2 THEN
        v_total_amount := v_rate_couple + ((p_adults_count - 2) * v_rate_extra);
      ELSE
        v_total_amount := v_rate_single;
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

  -- Standardize category with ASCII ' | ' separator
  v_prof_category := COALESCE(
    p_professional_category,
    CASE 
      WHEN p_employment_type IS NOT NULL AND p_industry_domain IS NOT NULL THEN p_employment_type || ' | ' || p_industry_domain
      ELSE COALESCE(p_employment_type, p_industry_domain)
    END
  );

  -- 4. Upsert alumni (reusable across all events)
  INSERT INTO alumni (
    name, email, mobile, address, country, city, state,
    batch, year_of_passing, engineering_discipline,
    organization, designation, employment_type, industry_domain, professional_category, work_location
  ) VALUES (
    p_name, p_email, v_clean_mobile, p_address, COALESCE(p_country, 'India'), p_city, p_state,
    v_resolved_batch, p_year_of_passing, p_engineering_discipline,
    p_organization, p_designation, p_employment_type, p_industry_domain, v_prof_category, p_work_location
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
    designation            = COALESCE(EXCLUDED.designation, alumni.designation),
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
    v_reg_number := generate_event_registration_number(v_event_id);

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
    'success', true,
    'registration_id', v_reg_id,
    'registration_number', v_reg_number,
    'alumni_id', v_alumni_id,
    'amount', v_total_amount,
    'attendance_status', p_attendance_status,
    'is_update', v_is_update
  );
END;
$$;

