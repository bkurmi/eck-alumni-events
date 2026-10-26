-- ============================================================
-- Migration v12: Event Expenses & Budget Ledger
-- File: supabase/v12_event_expenses.sql
--
-- Tracks expected (budgeted) and real (actual) expenses for each
-- event item (e.g. Caterers, Tent, DJ/Sound, Lighting, Mementos, etc.)
-- with vendor details, payment status, receipts/bills, and variance.
-- ============================================================

CREATE TABLE IF NOT EXISTS event_expenses (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                UUID REFERENCES events(id) ON DELETE CASCADE,
  item_name               TEXT NOT NULL,
  category                TEXT NOT NULL DEFAULT 'General',
  expected_amount         NUMERIC NOT NULL DEFAULT 0,
  actual_amount           NUMERIC NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'planned'
                          CHECK (status IN ('planned', 'partially_paid', 'paid', 'settled', 'cancelled')),
  vendor_name             TEXT,
  vendor_phone            TEXT,
  payment_mode            TEXT DEFAULT 'UPI',
  payment_date            DATE,
  payment_screenshot_path TEXT,
  notes                   TEXT,
  created_by              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS expenses_updated_at ON event_expenses;
CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON event_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes for fast lookups & aggregation
CREATE INDEX IF NOT EXISTS idx_expenses_event_id ON event_expenses(event_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON event_expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON event_expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON event_expenses(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE event_expenses ENABLE ROW LEVEL SECURITY;

-- ADMIN (authenticated): full access to view, insert, update, delete
DROP POLICY IF EXISTS "admin_all_expenses" ON event_expenses;
CREATE POLICY "admin_all_expenses"
  ON event_expenses FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- PUBLIC (anon): can view expenses for read-only / transparency
DROP POLICY IF EXISTS "anon_select_expenses" ON event_expenses;
CREATE POLICY "anon_select_expenses"
  ON event_expenses FOR SELECT TO anon
  USING (true);

-- Grants
GRANT ALL ON event_expenses TO authenticated;
GRANT SELECT ON event_expenses TO anon;
