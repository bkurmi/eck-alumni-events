-- ============================================================
-- ECK Alumni Events — 20 Test Users & Registrations Seed Script
-- Includes Payment Verifications Ledger Data
-- Run this in: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================

-- Ensure payment_verifications table exists if migration v2 hasn't been run yet
CREATE TABLE IF NOT EXISTS payment_verifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id     UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  upi_id              TEXT NOT NULL,
  amount              NUMERIC NOT NULL DEFAULT 0,
  payment_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  verified_status     TEXT NOT NULL DEFAULT 'VERIFIED'
                        CHECK (verified_status IN ('VERIFIED', 'MISMATCH', 'PENDING', 'REJECTED')),
  notes               TEXT,
  verified_by         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_registration_verification UNIQUE (registration_id)
);

ALTER TABLE payment_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_payment_verifications" ON payment_verifications;
CREATE POLICY "admin_manage_payment_verifications"
  ON payment_verifications FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DO $$
DECLARE
  v_event_id UUID;
  v_first_names TEXT[] := ARRAY[
    'Aarav', 'Vihaan', 'Aditya', 'Reyansh', 'Arjun', 'Sai', 'Krishna', 'Ishaan', 'Shaurya', 'Aayush',
    'Dhruv', 'Kabir', 'Rohan', 'Bhawesh', 'Gaurav', 'Manish', 'Vikram', 'Naveen', 'Rahul', 'Amit',
    'Pooja', 'Ananya', 'Diya', 'Sneha', 'Neha', 'Priya', 'Kavita', 'Ritu', 'Sunita', 'Geeta',
    'Deepak', 'Sanjay', 'Rajesh', 'Alok', 'Manoj', 'Ashish', 'Kunal', 'Vikas', 'Pankaj', 'Suresh'
  ];
  v_last_names TEXT[] := ARRAY[
    'Sharma', 'Verma', 'Gupta', 'Singh', 'Meena', 'Agarwal', 'Jain', 'Kurmi', 'Yadav', 'Mishra',
    'Chauhan', 'Saxena', 'Bhatia', 'Tiwari', 'Pandey', 'Patel', 'Reddy', 'Nair', 'Kumar', 'Joshi'
  ];
  v_disciplines TEXT[] := ARRAY[
    'Computer Science & Engineering',
    'Information Technology',
    'Electronics & Communication Engineering',
    'Electrical Engineering',
    'Mechanical Engineering',
    'Civil Engineering',
    'Production & Industrial Engineering'
  ];
  v_cities TEXT[] := ARRAY[
    'Kota', 'Jaipur', 'Jodhpur', 'Udaipur', 'Ajmer',
    'Bengaluru', 'Pune', 'Hyderabad', 'Delhi NCR', 'Mumbai'
  ];
  v_orgs TEXT[] := ARRAY[
    'Tata Consultancy Services', 'Infosys', 'Wipro', 'Cognizant', 'Accenture',
    'Amazon', 'Microsoft', 'Oracle', 'Government of Rajasthan', 'Self Employed / Startup'
  ];
  v_emp_types TEXT[] := ARRAY['Private Sector', 'Government / PSU', 'Self-Employed / Business', 'Higher Studies'];
  v_statuses TEXT[] := ARRAY['yes', 'yes', 'yes', 'maybe', 'no']; -- 60% yes, 20% maybe, 20% no
  
  -- 4 Pre-configured UPI Accounts rotating across verified registrations
  v_upi_accounts TEXT[] := ARRAY[
    '9414177517@sbi',
    'jyotibala.nagar@axisbank',
    '9414936876@ybl',
    '9001017275@ybl'
  ];

  -- Single shared test screenshot path stored in the 'payment-screenshots' bucket
  v_test_screenshot_path TEXT := 'deepaura-2k26/test_payment_screenshot.png';

  v_idx INT;
  v_fname TEXT;
  v_lname TEXT;
  v_full_name TEXT;
  v_mobile TEXT;
  v_email TEXT;
  v_city TEXT;
  v_discipline TEXT;
  v_year INT;
  v_org TEXT;
  v_emp_type TEXT;
  v_status TEXT;
  v_adults INT;
  v_c_above_7 INT;
  v_c_under_7 INT;
  v_total_attendees INT;
  v_fee_per_adult NUMERIC := 800;
  v_fee_per_child NUMERIC := 400;
  v_amount NUMERIC;
  v_alumni_id UUID;
  v_reg_no TEXT;
  v_reg_id UUID;
  v_assigned_upi TEXT;
  v_verif_status TEXT;
  v_payment_date DATE;
BEGIN
  -- 1. Locate the event
  SELECT id INTO v_event_id FROM events WHERE event_slug = 'deepaura-2k26' LIMIT 1;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Event "deepaura-2k26" not found. Please ensure the events table is seeded.';
  END IF;

  -- 2. Generate 20 records
  FOR v_idx IN 1..20 LOOP
    v_fname := v_first_names[1 + ((v_idx * 7) % array_length(v_first_names, 1))];
    v_lname := v_last_names[1 + ((v_idx * 13) % array_length(v_last_names, 1))];
    v_full_name := v_fname || ' ' || v_lname;
    v_mobile := '98' || LPAD(v_idx::TEXT, 8, '0');
    v_email := lower(v_fname) || '.' || lower(v_lname) || v_idx::TEXT || '@example.com';
    v_city := v_cities[1 + (v_idx % array_length(v_cities, 1))];
    v_discipline := v_disciplines[1 + (v_idx % array_length(v_disciplines, 1))];
    v_year := 1985 + (v_idx % 40); -- Years from 1985 to 2024
    v_org := v_orgs[1 + (v_idx % array_length(v_orgs, 1))];
    v_emp_type := v_emp_types[1 + (v_idx % array_length(v_emp_types, 1))];
    v_status := v_statuses[1 + (v_idx % array_length(v_statuses, 1))];
    
    -- Attendees calculation
    IF v_status = 'yes' THEN
      v_adults := 1 + (v_idx % 3); -- 1 to 3 adults
      v_c_above_7 := CASE WHEN (v_idx % 4) = 0 THEN 1 ELSE 0 END;
      v_c_under_7 := CASE WHEN (v_idx % 3) = 0 THEN 1 ELSE 0 END;
    ELSE
      v_adults := 1;
      v_c_above_7 := 0;
      v_c_under_7 := 0;
    END IF;

    v_total_attendees := v_adults + v_c_above_7 + v_c_under_7;
    IF v_status = 'yes' THEN
      v_amount := (v_adults * v_fee_per_adult) + (v_c_above_7 * v_fee_per_child);
    ELSE
      v_amount := 0;
    END IF;

    -- Upsert Alumni
    INSERT INTO alumni (
      name, email, mobile, address, country, city, state,
      year_of_passing, engineering_discipline, organization,
      employment_type, industry_domain, professional_category, work_location
    ) VALUES (
      v_full_name,
      v_email,
      v_mobile,
      'Test Address #' || v_idx || ', ' || v_city,
      'India',
      v_city,
      CASE WHEN v_city IN ('Kota', 'Jaipur', 'Jodhpur', 'Udaipur', 'Ajmer') THEN 'Rajasthan'
           WHEN v_city = 'Bengaluru' THEN 'Karnataka'
           WHEN v_city IN ('Pune', 'Mumbai') THEN 'Maharashtra'
           WHEN v_city = 'Hyderabad' THEN 'Telangana'
           ELSE 'Delhi' END,
      v_year,
      v_discipline,
      v_org,
      v_emp_type,
      'Engineering & Technology',
      'Engineering / Technology',
      v_city
    )
    ON CONFLICT (mobile) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email
    RETURNING id INTO v_alumni_id;

    -- Upsert Event Registration
    v_reg_no := 'REG-' || LPAD((1000 + v_idx)::TEXT, 5, '0');

    INSERT INTO event_registrations (
      registration_number,
      event_id,
      alumni_id,
      attendance_status,
      number_of_attendees,
      adults_count,
      children_above_7_count,
      children_under_7_count,
      amount,
      payment_screenshot_path
    ) VALUES (
      v_reg_no,
      v_event_id,
      v_alumni_id,
      v_status,
      v_total_attendees,
      v_adults,
      v_c_above_7,
      v_c_under_7,
      v_amount,
      CASE WHEN v_status = 'yes' THEN v_test_screenshot_path ELSE NULL END
    )
    ON CONFLICT (event_id, alumni_id) DO UPDATE SET
      attendance_status = EXCLUDED.attendance_status,
      number_of_attendees = EXCLUDED.number_of_attendees,
      adults_count = EXCLUDED.adults_count,
      children_above_7_count = EXCLUDED.children_above_7_count,
      children_under_7_count = EXCLUDED.children_under_7_count,
      amount = EXCLUDED.amount,
      payment_screenshot_path = EXCLUDED.payment_screenshot_path
    RETURNING id INTO v_reg_id;

    -- Upsert Payment Verification for confirmed attendees
    IF v_status = 'yes' THEN
      v_assigned_upi := v_upi_accounts[1 + (v_idx % array_length(v_upi_accounts, 1))];
      v_payment_date := CURRENT_DATE - ((v_idx % 7) || ' days')::INTERVAL;

      -- Realistic test statuses: predominantly VERIFIED with sample PENDING and MISMATCH
      IF (v_idx % 7) = 0 THEN
        v_verif_status := 'PENDING';
      ELSIF (v_idx % 9) = 0 THEN
        v_verif_status := 'MISMATCH';
      ELSE
        v_verif_status := 'VERIFIED';
      END IF;

      INSERT INTO payment_verifications (
        registration_id,
        upi_id,
        amount,
        payment_date,
        verified_status,
        notes,
        verified_by
      ) VALUES (
        v_reg_id,
        v_assigned_upi,
        v_amount,
        v_payment_date,
        v_verif_status,
        'Seeded UPI test verification for ' || v_full_name,
        'admin@eckalumni.org'
      )
      ON CONFLICT (registration_id) DO UPDATE SET
        upi_id = EXCLUDED.upi_id,
        amount = EXCLUDED.amount,
        payment_date = EXCLUDED.payment_date,
        verified_status = EXCLUDED.verified_status,
        notes = EXCLUDED.notes,
        verified_by = EXCLUDED.verified_by,
        updated_at = NOW();
    END IF;

  END LOOP;

  RAISE NOTICE 'Successfully generated and loaded 20 test alumni, registrations, and payment verifications!';
END $$;
