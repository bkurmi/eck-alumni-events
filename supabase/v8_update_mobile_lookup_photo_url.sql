-- ────────────────────────────────────────────────────────────
-- V8: Ensure update_attendee_photo_card RPC and return photo_url in get_registration_by_mobile
-- ────────────────────────────────────────────────────────────

-- 1. Ensure update_attendee_photo_card exists and can be executed by anon and authenticated
CREATE OR REPLACE FUNCTION update_attendee_photo_card(
  p_registration_id   UUID,
  p_photo_url         TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE event_registrations
     SET photo_url = COALESCE(p_photo_url, photo_url),
         updated_at = NOW()
   WHERE id = p_registration_id;

  RETURN json_build_object(
    'success', true,
    'registration_id', p_registration_id,
    'photo_url', p_photo_url
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_attendee_photo_card TO anon, authenticated;

-- 2. Update get_registration_by_mobile to return photo_url
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

GRANT EXECUTE ON FUNCTION get_registration_by_mobile TO anon, authenticated;
