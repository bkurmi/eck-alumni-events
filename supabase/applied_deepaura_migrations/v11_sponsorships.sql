-- ============================================================
-- Migration v11: Sponsorships & Partner Contributions Ledger
-- File: supabase/v11_sponsorships.sql
--
-- Allows event admins to manually record sponsorships, corporate
-- partnerships, and alumni patrons with optional payment screenshot,
-- notes, and receiving UPI account tracking.
-- ============================================================

CREATE TABLE IF NOT EXISTS event_sponsorships (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                UUID REFERENCES events(id) ON DELETE SET NULL,
  sponsor_name            TEXT NOT NULL,
  amount                  NUMERIC NOT NULL DEFAULT 0,
  receiving_upi_id        TEXT,
  contact_person          TEXT,
  contact_phone           TEXT,
  contact_email           TEXT,
  payment_screenshot_path TEXT,
  notes                   TEXT,
  created_by              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drop existing policies first so column drops won't fail due to policy dependencies
DROP POLICY IF EXISTS "admin_all_sponsorships" ON event_sponsorships;
DROP POLICY IF EXISTS "anon_select_sponsorships" ON event_sponsorships;

-- Prune deprecated/unwanted columns if the table was created previously (CASCADE drops dependent constraints/policies)
ALTER TABLE event_sponsorships DROP COLUMN IF EXISTS category CASCADE;
ALTER TABLE event_sponsorships DROP COLUMN IF EXISTS payment_status CASCADE;
ALTER TABLE event_sponsorships DROP COLUMN IF EXISTS payment_mode CASCADE;
ALTER TABLE event_sponsorships DROP COLUMN IF EXISTS transaction_reference CASCADE;
ALTER TABLE event_sponsorships DROP COLUMN IF EXISTS logo_url CASCADE;

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS sponsorships_updated_at ON event_sponsorships;
CREATE TRIGGER sponsorships_updated_at
  BEFORE UPDATE ON event_sponsorships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes for lightning fast lookups & aggregation
CREATE INDEX IF NOT EXISTS idx_sponsorships_event_id ON event_sponsorships(event_id);
CREATE INDEX IF NOT EXISTS idx_sponsorships_upi ON event_sponsorships(receiving_upi_id);
CREATE INDEX IF NOT EXISTS idx_sponsorships_created_at ON event_sponsorships(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE event_sponsorships ENABLE ROW LEVEL SECURITY;

-- ADMIN (authenticated): full access to view, insert, update, delete
DROP POLICY IF EXISTS "admin_all_sponsorships" ON event_sponsorships;
CREATE POLICY "admin_all_sponsorships"
  ON event_sponsorships FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- PUBLIC (anon): can view sponsorships for event sponsor acknowledgments
DROP POLICY IF EXISTS "anon_select_sponsorships" ON event_sponsorships;
CREATE POLICY "anon_select_sponsorships"
  ON event_sponsorships FOR SELECT TO anon
  USING (true);

-- Grants
GRANT ALL ON event_sponsorships TO authenticated;
GRANT SELECT ON event_sponsorships TO anon;
