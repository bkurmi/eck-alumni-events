-- ============================================================
-- ECK Alumni Events — Complete Database Schema
-- Execute this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. UTILITY: auto-update updated_at timestamp
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ────────────────────────────────────────────────────────────
-- 2. TABLE: events
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name          TEXT NOT NULL,
  event_slug          TEXT NOT NULL UNIQUE,
  event_date          DATE NOT NULL,
  event_time          TEXT,
  location            TEXT NOT NULL,
  description         TEXT,
  registration_fee    NUMERIC NOT NULL DEFAULT 0,
  upi_id              TEXT,
  banner_image_url    TEXT,
  tagline             TEXT,
  theme_primary_color TEXT DEFAULT '#6366f1',
  theme_accent_color  TEXT DEFAULT '#f59e0b',
  qr_image_url        TEXT,
  status              TEXT NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'COMPLETED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS events_updated_at ON events;
CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- 3. TABLE: alumni  (reusable across events)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alumni (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  email                   TEXT,
  mobile                  TEXT NOT NULL UNIQUE,
  address                 TEXT NOT NULL,
  country                 TEXT NOT NULL DEFAULT 'India',
  city                    TEXT NOT NULL,
  state                   TEXT NOT NULL,
  year_of_passing         INTEGER NOT NULL,
  engineering_discipline  TEXT NOT NULL,
  organization            TEXT,
  employment_type         TEXT,
  industry_domain         TEXT,
  professional_category   TEXT,
  work_location           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure country column exists if table was previously created
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'India';

DROP TRIGGER IF EXISTS alumni_updated_at ON alumni;
CREATE TRIGGER alumni_updated_at
  BEFORE UPDATE ON alumni
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- 4. TABLE: event_registrations
--    (includes payment screenshot — no separate payments table)
-- ────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS registration_seq START 1;

CREATE TABLE IF NOT EXISTS event_registrations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number         TEXT NOT NULL UNIQUE,
  event_id                    UUID NOT NULL REFERENCES events(id),
  alumni_id                   UUID NOT NULL REFERENCES alumni(id),
  attendance_status           TEXT NOT NULL
                                CHECK (attendance_status IN ('yes', 'maybe', 'no')),
  number_of_attendees         INTEGER NOT NULL DEFAULT 1,
  adults_count                INTEGER NOT NULL DEFAULT 1,
  children_above_7_count      INTEGER NOT NULL DEFAULT 0,
  children_under_7_count      INTEGER NOT NULL DEFAULT 0,
  amount                      NUMERIC NOT NULL DEFAULT 0,
  payment_screenshot_path     TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(event_id, alumni_id)
);

ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS adults_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS children_above_7_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS children_under_7_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION generate_registration_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.registration_number IS NULL OR NEW.registration_number = '' THEN
    NEW.registration_number := 'REG-' || LPAD(nextval('registration_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_registration_number ON event_registrations;
CREATE TRIGGER set_registration_number
  BEFORE INSERT ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION generate_registration_number();

DROP TRIGGER IF EXISTS registrations_updated_at ON event_registrations;
CREATE TRIGGER registrations_updated_at
  BEFORE UPDATE ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- 5. INDEXES
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_alumni_id ON event_registrations(alumni_id);
CREATE INDEX IF NOT EXISTS idx_alumni_city ON alumni(city);
CREATE INDEX IF NOT EXISTS idx_alumni_year ON alumni(year_of_passing);


-- ────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE alumni ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;

-- PUBLIC (anon): can read open events
DROP POLICY IF EXISTS "anon_select_events" ON events;
CREATE POLICY "anon_select_events"
  ON events FOR SELECT TO anon
  USING (status IN ('OPEN', 'CLOSED', 'COMPLETED'));

-- ADMIN (authenticated): full read on all tables
DROP POLICY IF EXISTS "admin_select_events" ON events;
CREATE POLICY "admin_select_events"
  ON events FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_select_alumni" ON alumni;
CREATE POLICY "admin_select_alumni"
  ON alumni FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_select_registrations" ON event_registrations;
CREATE POLICY "admin_select_registrations"
  ON event_registrations FOR SELECT TO authenticated
  USING (true);

-- ADMIN: can update events
DROP POLICY IF EXISTS "admin_update_events" ON events;
CREATE POLICY "admin_update_events"
  ON events FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- 7. GRANTS
-- ────────────────────────────────────────────────────────────

GRANT SELECT ON events TO anon;
GRANT SELECT ON alumni TO authenticated;
GRANT SELECT ON events TO authenticated;
GRANT SELECT ON event_registrations TO authenticated;
GRANT UPDATE ON events TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 8. RPC FUNCTION: register_for_event (SECURITY DEFINER)
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
  v_total_amount          NUMERIC;
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

  -- 1. Look up event
  SELECT id, registration_fee
    INTO v_event_id, v_fee
    FROM events
   WHERE event_slug = p_event_slug
     AND status = 'OPEN';

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Event not found or registration is closed';
  END IF;

  -- 2. Calculate total (if not attending, fee is 0)
  IF p_attendance_status = 'yes' THEN
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

  -- Check if this is an update to an existing registration
  SELECT EXISTS (
    SELECT 1 FROM event_registrations
    WHERE event_id = v_event_id AND alumni_id = v_alumni_id
  ) INTO v_is_update;

  -- 4. Create or update registration
  INSERT INTO event_registrations (
    event_id, alumni_id, attendance_status,
    number_of_attendees, adults_count, children_above_7_count, children_under_7_count,
    amount, payment_screenshot_path
  ) VALUES (
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
-- 8B. RPC FUNCTION: get_registration_by_mobile (SECURITY DEFINER)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_registration_by_mobile(
  p_event_slug  TEXT,
  p_mobile      TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id                UUID;
  v_clean_mobile            TEXT;
  v_reg_record              RECORD;
  v_alumni_record           RECORD;
BEGIN
  -- Normalize mobile to digits only, taking last 10 digits
  v_clean_mobile := REGEXP_REPLACE(p_mobile, '\D', '', 'g');
  IF LENGTH(v_clean_mobile) > 10 THEN
    v_clean_mobile := RIGHT(v_clean_mobile, 10);
  END IF;

  SELECT id INTO v_event_id
    FROM events
   WHERE event_slug = p_event_slug;

  IF v_event_id IS NULL THEN
    RETURN json_build_object('found', false, 'error', 'Event not found');
  END IF;

  -- Find registration and alumni
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
      a.mobile = v_clean_mobile
      OR RIGHT(REGEXP_REPLACE(a.mobile, '\D', '', 'g'), 10) = v_clean_mobile
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

GRANT EXECUTE ON FUNCTION get_registration_by_mobile TO anon;
GRANT EXECUTE ON FUNCTION get_registration_by_mobile TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 9. STORAGE: payment-screenshots bucket (public)
-- ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-screenshots', 'payment-screenshots', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "anon_upload_screenshots" ON storage.objects;
CREATE POLICY "anon_upload_screenshots"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'payment-screenshots');

DROP POLICY IF EXISTS "public_read_screenshots" ON storage.objects;
CREATE POLICY "public_read_screenshots"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'payment-screenshots');

DROP POLICY IF EXISTS "admin_read_screenshots" ON storage.objects;
CREATE POLICY "admin_read_screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-screenshots');


-- ────────────────────────────────────────────────────────────
-- 10. SEED: First Event (Pre-Diwali Milan 2026)
-- ────────────────────────────────────────────────────────────

INSERT INTO events (
  event_name,
  event_slug,
  event_date,
  event_time,
  location,
  description,
  registration_fee,
  upi_id,
  banner_image_url,
  tagline,
  theme_primary_color,
  theme_accent_color,
  qr_image_url,
  status
) VALUES (
  'Engineering College Kota Alumni – Pre-Diwali Milan 2026',
  'pre-diwali-milan-2026',
  '2026-11-01',
  '6:00 PM onwards',
  'Kota, Rajasthan (Venue to be announced)',
  'Reconnect • Relive • Celebrate — Join fellow ECK alumni for an evening of nostalgia, networking, cultural performances, dinner, and celebration before Diwali 2026.',
  800,
  'eckalumni@upi',
  NULL,
  'Reconnect • Relive • Celebrate',
  '#6366f1',
  '#f59e0b',
  '/upi-qr.png',
  'OPEN'
)
ON CONFLICT (event_slug) DO UPDATE SET
  event_name = EXCLUDED.event_name,
  event_date = EXCLUDED.event_date,
  event_time = EXCLUDED.event_time,
  location = EXCLUDED.location,
  description = EXCLUDED.description,
  registration_fee = EXCLUDED.registration_fee,
  status = EXCLUDED.status;

-- Migration helpers if database was initialized with earlier schema:
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS employment_type TEXT;
ALTER TABLE alumni ADD COLUMN IF NOT EXISTS industry_domain TEXT;
ALTER TABLE alumni ALTER COLUMN professional_category DROP NOT NULL;
ALTER TABLE events DROP COLUMN IF EXISTS google_sheet_id;

