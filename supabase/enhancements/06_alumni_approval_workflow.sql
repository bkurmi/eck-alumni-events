-- ============================================================
-- Migration 06: Alumni Manual Approval Workflow
-- File: supabase/enhancements/06_alumni_approval_workflow.sql
-- ============================================================

-- 1. ADD COMPATIBILITY & APPROVAL COLUMNS TO alumni TABLE
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS batch VARCHAR(20);
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE alumni 
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'PENDING' 
  CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Drop reviewed_by if present from prior execution
ALTER TABLE alumni DROP COLUMN IF EXISTS reviewed_by;

-- Instruct PostgREST to immediately reload schema cache
NOTIFY pgrst, 'reload schema';

-- 2. ONE-TIME BACKFILL: Auto-approve legacy alumni records
-- Auto-approves existing alumni who were registered for events or have legacy records
UPDATE alumni 
SET approval_status = 'APPROVED' 
WHERE approval_status IS NULL 
   OR approval_status = 'PENDING'
   OR id IN (SELECT alumni_id FROM event_registrations WHERE alumni_id IS NOT NULL);

-- 3. ENSURE INDEXES FOR FAST FILTERING
CREATE INDEX IF NOT EXISTS idx_alumni_approval_status ON alumni(approval_status);

-- 4. RLS POLICIES FOR ANONYMOUS ALUMNI SELF-REGISTRATION & ADMIN UPDATES
DROP POLICY IF EXISTS "allow_anon_insert_alumni" ON alumni;
CREATE POLICY "allow_anon_insert_alumni"
  ON alumni FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "allow_anon_select_alumni" ON alumni;
CREATE POLICY "allow_anon_select_alumni"
  ON alumni FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "allow_anon_update_alumni" ON alumni;
CREATE POLICY "allow_anon_update_alumni"
  ON alumni FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON alumni TO anon;
GRANT ALL ON alumni TO authenticated;

-- 5. SECURE RPC: register_alumni_member
-- Allows any alumnus to self-register for the ECK-RTU Alumni Network.
-- Stored with approval_status = 'PENDING' for committee review.
CREATE OR REPLACE FUNCTION register_alumni_member(
  p_name                    TEXT,
  p_mobile                  TEXT,
  p_email                   TEXT DEFAULT NULL,
  p_address                 TEXT DEFAULT '',
  p_city                    TEXT DEFAULT 'Kota',
  p_state                   TEXT DEFAULT 'Rajasthan',
  p_country                 TEXT DEFAULT 'India',
  p_year_of_passing         INTEGER DEFAULT 2024,
  p_engineering_discipline  TEXT DEFAULT 'Other',
  p_batch                   TEXT DEFAULT NULL,
  p_organization            TEXT DEFAULT NULL,
  p_designation             TEXT DEFAULT NULL,
  p_employment_type         TEXT DEFAULT NULL,
  p_industry_domain         TEXT DEFAULT NULL,
  p_professional_category   TEXT DEFAULT NULL,
  p_work_location           TEXT DEFAULT NULL,
  p_linkedin_url            TEXT DEFAULT NULL,
  p_photo_url               TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_mobile    TEXT;
  v_existing_alumni RECORD;
  v_alumni_id       UUID;
  v_batch           TEXT;
  v_category        TEXT;
BEGIN
  -- Normalize mobile to last 10 digits
  v_clean_mobile := REGEXP_REPLACE(COALESCE(p_mobile, ''), '\D', '', 'g');
  IF LENGTH(v_clean_mobile) > 10 THEN
    v_clean_mobile := SUBSTRING(v_clean_mobile FROM LENGTH(v_clean_mobile) - 9);
  END IF;

  IF LENGTH(v_clean_mobile) < 10 THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'INVALID_MOBILE',
      'message', 'Please provide a valid 10-digit mobile number.'
    );
  END IF;

  -- Derive batch if omitted
  v_batch := COALESCE(
    NULLIF(TRIM(p_batch), ''),
    CASE 
      WHEN p_year_of_passing >= 1985 AND p_year_of_passing <= 2010 THEN
        CASE 
          WHEN p_year_of_passing = 1985 THEN 'Founding'
          WHEN p_year_of_passing = 1986 THEN '1st'
          WHEN p_year_of_passing = 1987 THEN '2nd'
          WHEN p_year_of_passing = 1988 THEN '3rd'
          ELSE (p_year_of_passing - 1985)::TEXT || 'th'
        END
      WHEN p_year_of_passing > 2010 THEN p_year_of_passing::TEXT
      ELSE 'Alumni'
    END
  );

  -- Derive combined professional category
  v_category := COALESCE(
    p_professional_category,
    CASE 
      WHEN p_employment_type IS NOT NULL AND p_industry_domain IS NOT NULL THEN p_employment_type || ' | ' || p_industry_domain
      ELSE COALESCE(p_employment_type, p_industry_domain, 'Other')
    END
  );

  -- Check if already registered
  SELECT id, approval_status, name INTO v_existing_alumni
  FROM alumni
  WHERE mobile = v_clean_mobile OR mobile = '+91' || v_clean_mobile
  LIMIT 1;

  IF v_existing_alumni.id IS NOT NULL THEN
    IF v_existing_alumni.approval_status = 'APPROVED' THEN
      RETURN jsonb_build_object(
        'success', false,
        'status', 'ALREADY_APPROVED',
        'alumni_id', v_existing_alumni.id,
        'message', 'You are already a verified and approved member of the ECK-RTU Alumni Network!'
      );
    ELSIF v_existing_alumni.approval_status = 'PENDING' THEN
      RETURN jsonb_build_object(
        'success', false,
        'status', 'ALREADY_PENDING',
        'alumni_id', v_existing_alumni.id,
        'message', 'Your alumni registration is already received and is pending committee approval.'
      );
    ELSE
      -- Previously rejected: allow re-submission and reset to PENDING
      UPDATE alumni SET
        name                   = TRIM(p_name),
        email                  = NULLIF(TRIM(p_email), ''),
        address                = TRIM(p_address),
        city                   = TRIM(p_city),
        state                  = TRIM(p_state),
        country                = COALESCE(NULLIF(TRIM(p_country), ''), 'India'),
        year_of_passing        = p_year_of_passing,
        batch                  = v_batch,
        engineering_discipline = TRIM(p_engineering_discipline),
        organization           = NULLIF(TRIM(p_organization), ''),
        designation            = NULLIF(TRIM(p_designation), ''),
        employment_type        = NULLIF(TRIM(p_employment_type), ''),
        industry_domain        = NULLIF(TRIM(p_industry_domain), ''),
        professional_category  = v_category,
        work_location          = NULLIF(TRIM(p_work_location), ''),
        linkedin_url           = NULLIF(TRIM(p_linkedin_url), ''),
        photo_url              = COALESCE(NULLIF(TRIM(p_photo_url), ''), photo_url),
        approval_status        = 'PENDING',
        rejection_reason       = NULL,
        reviewed_at            = NULL,
        updated_at             = NOW()
      WHERE id = v_existing_alumni.id;

      RETURN jsonb_build_object(
        'success', true,
        'status', 'RE_SUBMITTED',
        'alumni_id', v_existing_alumni.id,
        'message', 'Your registration details have been updated and resubmitted for committee approval.'
      );
    END IF;
  END IF;

  -- Insert new alumnus with status PENDING
  INSERT INTO alumni (
    name, email, mobile, address, country, city, state,
    year_of_passing, batch, engineering_discipline,
    organization, designation, employment_type, industry_domain,
    professional_category, work_location, linkedin_url, photo_url,
    approval_status, created_at, updated_at
  ) VALUES (
    TRIM(p_name),
    NULLIF(TRIM(p_email), ''),
    v_clean_mobile,
    TRIM(p_address),
    COALESCE(NULLIF(TRIM(p_country), ''), 'India'),
    TRIM(p_city),
    TRIM(p_state),
    p_year_of_passing,
    v_batch,
    TRIM(p_engineering_discipline),
    NULLIF(TRIM(p_organization), ''),
    NULLIF(TRIM(p_designation), ''),
    NULLIF(TRIM(p_employment_type), ''),
    NULLIF(TRIM(p_industry_domain), ''),
    v_category,
    NULLIF(TRIM(p_work_location), ''),
    NULLIF(TRIM(p_linkedin_url), ''),
    NULLIF(TRIM(p_photo_url), ''),
    'PENDING',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_alumni_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'PENDING',
    'alumni_id', v_alumni_id,
    'message', 'Your alumni registration has been submitted successfully and is awaiting committee approval.'
  );
END;
$$;

-- 6. SECURE RPC: approve_alumni_member
CREATE OR REPLACE FUNCTION approve_alumni_member(
  p_alumni_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE alumni
  SET 
    approval_status  = 'APPROVED',
    reviewed_at      = NOW(),
    rejection_reason = NULL,
    updated_at       = NOW()
  WHERE id = p_alumni_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Alumni record not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Alumni successfully approved');
END;
$$;

-- 7. SECURE RPC: reject_alumni_member
CREATE OR REPLACE FUNCTION reject_alumni_member(
  p_alumni_id UUID,
  p_reason    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE alumni
  SET 
    approval_status  = 'REJECTED',
    reviewed_at      = NOW(),
    rejection_reason = p_reason,
    updated_at       = NOW()
  WHERE id = p_alumni_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Alumni record not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Alumni record rejected');
END;
$$;

-- 8. GRANT EXECUTE PERMISSIONS TO anon & authenticated ROLES
GRANT EXECUTE ON FUNCTION register_alumni_member TO anon, authenticated;
GRANT EXECUTE ON FUNCTION approve_alumni_member(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reject_alumni_member(UUID, TEXT) TO anon, authenticated;

-- 9. NOTIFY PostgREST TO RELOAD SCHEMA CACHE IMMEDIATELY
NOTIFY pgrst, 'reload schema';

