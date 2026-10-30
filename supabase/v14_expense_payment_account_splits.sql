-- ============================================================
-- Migration v14: Expense Payment Attribution & Account Splits
-- File: supabase/v14_expense_payment_account_splits.sql
--
-- Features:
-- 1. Add paid_from_account (TEXT) to event_expenses.
--    Stores the paying coordinator/account label or summary (e.g. 'Account Name', 'Cash in Hand', or 'Split: Account A ₹100, Account B ₹20').
-- 2. Add payment_splits (JSONB) to event_expenses.
--    Stores multi-account splits:
--    [{"account": "Account A", "amount": 100}, {"account": "Account B", "amount": 20}]
-- ============================================================

ALTER TABLE event_expenses
  ADD COLUMN IF NOT EXISTS paid_from_account TEXT,
  ADD COLUMN IF NOT EXISTS payment_splits JSONB DEFAULT '[]'::jsonb;

-- Create an index on paid_from_account for fast filtering & reporting
CREATE INDEX IF NOT EXISTS idx_expenses_paid_from_account ON event_expenses(paid_from_account);

COMMENT ON COLUMN event_expenses.paid_from_account IS 'Paying coordinator account or summary string (e.g. Account Name, Cash in Hand, or Split summary)';
COMMENT ON COLUMN event_expenses.payment_splits IS 'Array of account split objects: [{"account": "Account A", "amount": 100}, {"account": "Account B", "amount": 20}]';


