-- ============================================================
-- ECK Alumni Events - Migration v9: Spot Check-in Payment Screenshot Fix
-- ============================================================

-- 1. Create SECURITY DEFINER function to attach spot payment screenshot
CREATE OR REPLACE FUNCTION attach_spot_payment_screenshot(
  p_registration_id   UUID,
  p_screenshot_path   TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_registration_id IS NULL OR p_screenshot_path IS NULL OR p_screenshot_path = '' THEN
    RETURN json_build_object('success', false, 'error', 'Invalid arguments');
  END IF;

  UPDATE event_registrations
     SET payment_screenshot_path = CASE
           WHEN payment_screenshot_path IS NOT NULL 
                AND payment_screenshot_path <> '' 
                AND position(p_screenshot_path in payment_screenshot_path) = 0 THEN
             payment_screenshot_path || ',' || p_screenshot_path
           ELSE COALESCE(p_screenshot_path, payment_screenshot_path)
         END,
         updated_at = NOW()
   WHERE id = p_registration_id;

  RETURN json_build_object(
    'success', true,
    'registration_id', p_registration_id,
    'payment_screenshot_path', p_screenshot_path
  );
END;
$$;

GRANT EXECUTE ON FUNCTION attach_spot_payment_screenshot(UUID, TEXT) TO anon, authenticated;

-- 2. Drop previous overloads of spot_register_at_gate to prevent ambiguous function conflicts
DROP FUNCTION IF EXISTS spot_register_at_gate(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS spot_register_at_gate(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, NUMERIC, TEXT, TEXT);

-- 3. Create updated spot_register_at_gate function
CREATE OR REPLACE FUNCTION spot_register_at_gate(
  p_event_slug              TEXT,
  p_name                    TEXT,
  p_mobile                  TEXT,
  p_discipline              TEXT,
  p_year_of_passing         INTEGER,
  p_number_of_attendees     INTEGER DEFAULT 1,
  p_payment_mode            TEXT DEFAULT 'CASH',
  p_amount                  NUMERIC DEFAULT 800,
  p_verified_by             TEXT DEFAULT 'Gate Spot Desk',
  p_payment_screenshot_path TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_mobile        TEXT;
  v_event_id            UUID;
  v_alumni_id           UUID;
  v_reg_id              UUID;
  v_reg_number          TEXT;
  v_gate_id             UUID;
BEGIN
  v_clean_mobile := RIGHT(REGEXP_REPLACE(COALESCE(p_mobile, ''), '\D', '', 'g'), 10);
  IF LENGTH(v_clean_mobile) < 10 THEN
    v_clean_mobile := '99999' || LPAD((FLOOR(RANDOM() * 90000 + 10000))::TEXT, 5, '0');
  END IF;

  -- 1. Find event
  SELECT id INTO v_event_id FROM events WHERE event_slug = p_event_slug LIMIT 1;
  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id FROM events ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- 2. Upsert Alumni
  INSERT INTO alumni (
    name, mobile, address, city, state, country,
    year_of_passing, engineering_discipline, professional_category
  ) VALUES (
    p_name, v_clean_mobile, 'Kota (Spot Walk-in)', 'Kota', 'Rajasthan', 'India',
    p_year_of_passing, p_discipline, 'Alumnus'
  )
  ON CONFLICT (mobile) DO UPDATE SET
    name = EXCLUDED.name,
    year_of_passing = EXCLUDED.year_of_passing,
    engineering_discipline = EXCLUDED.engineering_discipline,
    updated_at = NOW()
  RETURNING id INTO v_alumni_id;

  -- 3. Create Event Registration
  v_reg_number := 'REG-' || LPAD(nextval('registration_seq')::TEXT, 5, '0');

  INSERT INTO event_registrations (
    registration_number,
    event_id,
    alumni_id,
    attendance_status,
    number_of_attendees,
    adults_count,
    amount,
    payment_screenshot_path,
    id_card_generated,
    id_card_generated_at
  ) VALUES (
    v_reg_number,
    v_event_id,
    v_alumni_id,
    'yes',
    COALESCE(p_number_of_attendees, 1),
    COALESCE(p_number_of_attendees, 1),
    p_amount,
    p_payment_screenshot_path,
    true,
    NOW()
  )
  ON CONFLICT (event_id, alumni_id) DO UPDATE SET
    attendance_status = 'yes',
    number_of_attendees = EXCLUDED.number_of_attendees,
    amount = EXCLUDED.amount,
    payment_screenshot_path = COALESCE(EXCLUDED.payment_screenshot_path, event_registrations.payment_screenshot_path),
    updated_at = NOW()
  RETURNING id, registration_number INTO v_reg_id, v_reg_number;

  -- 4. Record Payment Verification (Spot payment confirmed)
  INSERT INTO payment_verifications (
    registration_id,
    upi_id,
    amount,
    verified_status,
    notes,
    verified_by
  ) VALUES (
    v_reg_id,
    p_payment_mode,
    p_amount,
    'VERIFIED',
    'Spot registration completed at gate (' || p_payment_mode || ')',
    p_verified_by
  )
  ON CONFLICT (registration_id) DO UPDATE SET
    verified_status = 'VERIFIED',
    amount = EXCLUDED.amount,
    notes = EXCLUDED.notes,
    verified_by = EXCLUDED.verified_by,
    updated_at = NOW();

  -- 5. Record Gate Entry immediately
  INSERT INTO gate_entries (
    registration_id,
    event_id,
    phone_number,
    attendee_name,
    badge_category,
    branch,
    year_of_passing,
    accompanying_count,
    payment_status,
    entry_mode,
    verified_by
  ) VALUES (
    v_reg_id,
    v_event_id,
    v_clean_mobile,
    p_name,
    'Alumnus',
    p_discipline,
    p_year_of_passing,
    COALESCE(p_number_of_attendees, 1),
    'VERIFIED (' || p_payment_mode || ')',
    'spot_registration',
    p_verified_by
  )
  ON CONFLICT (registration_id) DO NOTHING
  RETURNING id INTO v_gate_id;

  RETURN json_build_object(
    'success', true,
    'registration_id', v_reg_id,
    'registration_number', v_reg_number,
    'attendee_name', p_name,
    'phone_number', v_clean_mobile,
    'number_of_attendees', p_number_of_attendees,
    'branch', p_discipline,
    'year_of_passing', p_year_of_passing,
    'amount', p_amount,
    'payment_screenshot_path', p_payment_screenshot_path,
    'gate_entry_id', v_gate_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION spot_register_at_gate(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, NUMERIC, TEXT, TEXT) TO anon, authenticated;

-- 4. Link the already uploaded screenshot for REG-00080
UPDATE event_registrations
   SET payment_screenshot_path = 'deepaura-2k26/spot_3437686787_bjbjhbjbjbkj_1792679861696.jpg',
       updated_at = NOW()
 WHERE registration_number = 'REG-00080';
