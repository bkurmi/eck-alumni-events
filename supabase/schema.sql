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
  google_sheet_id     TEXT,
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
  amount                      NUMERIC NOT NULL DEFAULT 0,
  payment_screenshot_path     TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(event_id, alumni_id)
);

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
  p_country                 TEXT DEFAULT 'India',
  p_city                    TEXT,
  p_state                   TEXT,
  p_year_of_passing         INTEGER,
  p_engineering_discipline  TEXT,
  p_professional_category   TEXT DEFAULT NULL,
  p_attendance_status       TEXT DEFAULT 'yes',
  p_number_of_attendees     INTEGER DEFAULT 1,
  p_email                   TEXT DEFAULT NULL,
  p_organization            TEXT DEFAULT NULL,
  p_work_location           TEXT DEFAULT NULL,
  p_payment_screenshot_path TEXT DEFAULT NULL,
  p_employment_type         TEXT DEFAULT NULL,
  p_industry_domain         TEXT DEFAULT NULL
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
    v_total_amount := v_fee * GREATEST(COALESCE(p_number_of_attendees, 1), 1);
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

  -- 4. Create or update registration
  INSERT INTO event_registrations (
    event_id, alumni_id, attendance_status,
    number_of_attendees, amount, payment_screenshot_path
  ) VALUES (
    v_event_id, v_alumni_id, p_attendance_status,
    p_number_of_attendees, v_total_amount, p_payment_screenshot_path
  )
  ON CONFLICT (event_id, alumni_id) DO UPDATE SET
    attendance_status       = EXCLUDED.attendance_status,
    number_of_attendees     = EXCLUDED.number_of_attendees,
    amount                  = EXCLUDED.amount,
    payment_screenshot_path = COALESCE(EXCLUDED.payment_screenshot_path, event_registrations.payment_screenshot_path),
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
    'attendance_status',   p_attendance_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION register_for_event TO anon;


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
  google_sheet_id,
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
  NULL,
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

