-- ============================================================
-- ECK Alumni Events - Migration v7: Registration Number Lookup
-- Enables attendees to retrieve registration & download ID card 
-- using their 5-digit Registration Number (e.g. 'REG-00039')
-- ============================================================

CREATE OR REPLACE FUNCTION get_registration_by_reg_number(
  p_event_slug  TEXT,
  p_reg_number  TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id                UUID;
  v_clean_reg               TEXT;
  v_digits                  TEXT;
  v_reg_record              RECORD;
BEGIN
  -- 1. Extract digits and pad to 5 digits (e.g., '39' -> 'REG-00039')
  v_digits := REGEXP_REPLACE(p_reg_number, '\D', '', 'g');
  IF LENGTH(v_digits) > 5 THEN
    v_digits := RIGHT(v_digits, 5);
  END IF;
  
  IF v_digits = '' THEN
    RETURN json_build_object('found', false, 'error', 'Invalid registration number');
  END IF;

  v_clean_reg := 'REG-' || LPAD(v_digits, 5, '0');

  -- 2. Find Event ID
  SELECT id INTO v_event_id
    FROM events
   WHERE event_slug = p_event_slug;

  IF v_event_id IS NULL THEN
    RETURN json_build_object('found', false, 'error', 'Event not found');
  END IF;

  -- 3. Find registration and alumni details
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
    r.photo_url,
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
    AND UPPER(r.registration_number) = v_clean_reg
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
    'photo_url',               v_reg_record.photo_url,
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

GRANT EXECUTE ON FUNCTION get_registration_by_reg_number TO anon;
GRANT EXECUTE ON FUNCTION get_registration_by_reg_number TO authenticated;
