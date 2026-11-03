-- ============================================================
-- Migration: 02_event_upi_and_accounts_config.sql
-- Directory: supabase/enhancements/
--
-- Features:
-- 1. Adds expense_accounts_config column to events table to allow
--    defining event-specific coordinator accounts/banks if needed.
-- 2. Backfills DeepAura 2K26 upi_rotation_configs in the database
--    with the 4 active UPI receiver accounts, decoupling them from code.
-- 3. Fully backward-compatible; touches zero existing transaction data.
-- ============================================================

-- 1. Ensure expense_accounts_config exists on events
ALTER TABLE events ADD COLUMN IF NOT EXISTS expense_accounts_config JSONB DEFAULT NULL;

-- 2. Ensure upi_rotation_configs column exists
ALTER TABLE events ADD COLUMN IF NOT EXISTS upi_rotation_configs JSONB DEFAULT NULL;

-- 3. Populate DeepAura 2K26 upi_rotation_configs & expense_accounts_config directly in the database row
UPDATE events
SET 
  upi_rotation_configs = COALESCE(
    NULLIF(upi_rotation_configs, '[]'::jsonb),
    '[
      {"upi_id": "9414177517@sbi", "qr_image_url": "/qr-1.png", "account_name": "Hari Narayan (SBI)"},
      {"upi_id": "jyotibala.nagar@axisbank", "qr_image_url": "/qr-2.png", "account_name": "Mitesh (Axis)"},
      {"upi_id": "9414936876@ibl", "qr_image_url": "/qr-3.png", "account_name": "Rajeev (ICICI)"},
      {"upi_id": "9001017275@ybl", "qr_image_url": "/qr-4.png", "account_name": "Mukesh (YES)"}
    ]'::jsonb
  ),
  expense_accounts_config = COALESCE(
    NULLIF(expense_accounts_config, '[]'::jsonb),
    '[
      {"id": "Hari Narayan", "label": "Hari Narayan (SBI)", "accountName": "Hari Narayan", "bankName": "SBI", "upiId": "9414177517@sbi"},
      {"id": "Mitesh", "label": "Mitesh (Axis)", "accountName": "Mitesh", "bankName": "AXIS", "upiId": "jyotibala.nagar@axisbank"},
      {"id": "Rajeev", "label": "Rajeev (ICICI)", "accountName": "Rajeev", "bankName": "ICICI", "upiId": "9414936876@ibl"},
      {"id": "Mukesh", "label": "Mukesh (YES)", "accountName": "Mukesh", "bankName": "YES", "upiId": "9001017275@ybl"},
      {"id": "Chetan", "label": "Chetan (UPI)", "accountName": "Chetan", "bankName": "UPI", "upiId": "9799951857@upi"},
      {"id": "Lokesh", "label": "Lokesh (ICICI)", "accountName": "Lokesh", "bankName": "ICICI", "upiId": "gautam.lucky-1@okicici"},
      {"id": "Bhawesh", "label": "Bhawesh (UPI)", "accountName": "Bhawesh", "bankName": "UPI"},
      {"id": "Manoj", "label": "Manoj (UPI)", "accountName": "Manoj", "bankName": "UPI"},
      {"id": "Shailendra", "label": "Shailendra (UPI)", "accountName": "Shailendra", "bankName": "UPI"},
      {"id": "Cash in Hand", "label": "💵 Cash in Hand / Spot Cash", "accountName": "Cash in Hand", "bankName": "Cash", "isCash": true}
    ]'::jsonb
  )
WHERE event_slug = 'deepaura-2k26';

