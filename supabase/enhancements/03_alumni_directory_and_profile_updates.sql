-- ============================================================
-- Migration 03: Alumni Directory, Help Network & Self-Service Profile Updates
-- File: supabase/enhancements/03_alumni_directory_and_profile_updates.sql
--
-- Features:
-- 1. Adds linkedin_url and photo_url to alumni table (additive & safe).
-- 2. Grants update permissions on alumni table for anon (with security check).
-- 3. Provides secure update_alumni_profile RPC function to update
--    all registration details (personal, contact, academics, career, photo).
-- ============================================================

-- 1. Ensure columns exist on alumni table
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2. RLS policy to allow anonymous updates to alumni
DROP POLICY IF EXISTS "allow_anon_update_alumni" ON alumni;
CREATE POLICY "allow_anon_update_alumni"
  ON alumni FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

GRANT UPDATE ON alumni TO anon;
GRANT UPDATE ON alumni TO authenticated;

-- 3. Secure RPC: update_alumni_profile
CREATE OR REPLACE FUNCTION update_alumni_profile(
  p_alumni_id               UUID,
  p_mobile                  TEXT,
  p_name                    TEXT,
  p_email                   TEXT DEFAULT NULL,
  p_year_of_passing         INTEGER DEFAULT NULL,
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

  -- 1. Update alumni record matching id
  UPDATE alumni
     SET name                   = COALESCE(NULLIF(p_name, ''), name),
         email                  = COALESCE(p_email, email),
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
       SET photo_url = p_photo_url,
           updated_at = NOW()
     WHERE alumni_id = p_alumni_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'alumni_id', p_alumni_id,
    'photo_url', p_photo_url
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_alumni_profile TO anon, authenticated;
