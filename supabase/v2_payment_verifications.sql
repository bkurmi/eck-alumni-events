-- ============================================================
-- Migration v2: Manual Payment Verifications & UPI Ledger
-- Execute this in: Supabase Dashboard → SQL Editor → New Query
--
-- Safe & Non-breaking:
-- Does NOT modify existing event_registrations, alumni, or events tables.
-- Creates an independent ledger table linked by foreign key.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABLE: payment_verifications
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_verifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id     UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  upi_id              TEXT NOT NULL,
  amount              NUMERIC NOT NULL DEFAULT 0,
  verified_status     TEXT NOT NULL DEFAULT 'VERIFIED'
                        CHECK (verified_status IN ('VERIFIED', 'MISMATCH', 'PENDING', 'REJECTED')),
  notes               TEXT,
  verified_by         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensures 1 primary verification ledger entry per registration for easy upsert
  CONSTRAINT unique_registration_verification UNIQUE (registration_id)
);

-- Ensure payment_date is dropped if table was previously created with it
ALTER TABLE payment_verifications DROP COLUMN IF EXISTS payment_date;

-- Trigger to maintain updated_at
DROP TRIGGER IF EXISTS payment_verifications_updated_at ON payment_verifications;
CREATE TRIGGER payment_verifications_updated_at
  BEFORE UPDATE ON payment_verifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- 2. INDEXES for fast aggregation & lookup
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_payment_verifications_reg_id ON payment_verifications(registration_id);
CREATE INDEX IF NOT EXISTS idx_payment_verifications_upi_id ON payment_verifications(upi_id);
DROP INDEX IF EXISTS idx_payment_verifications_date;
CREATE INDEX IF NOT EXISTS idx_payment_verifications_status ON payment_verifications(verified_status);

-- ────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────

ALTER TABLE payment_verifications ENABLE ROW LEVEL SECURITY;

-- ADMIN (authenticated): full access to manage ledger
DROP POLICY IF EXISTS "admin_select_payment_verifications" ON payment_verifications;
CREATE POLICY "admin_select_payment_verifications"
  ON payment_verifications FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_insert_payment_verifications" ON payment_verifications;
CREATE POLICY "admin_insert_payment_verifications"
  ON payment_verifications FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_payment_verifications" ON payment_verifications;
CREATE POLICY "admin_update_payment_verifications"
  ON payment_verifications FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_payment_verifications" ON payment_verifications;
CREATE POLICY "admin_delete_payment_verifications"
  ON payment_verifications FOR DELETE TO authenticated
  USING (true);

-- ────────────────────────────────────────────────────────────
-- 4. PERMISSIONS / GRANTS
-- ────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON payment_verifications TO authenticated;

