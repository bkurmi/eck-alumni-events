import { supabase } from './supabase';
import type {
  ExistingRegistrationLookup,
  RegistrationFormData,
  RegistrationResult,
  Alumni,
} from '../types';

/**
 * Cleans phone number by removing non-digits and ensuring 10 digits format.
 */
export function cleanMobileNumber(mobile: string): string {
  const digits = (mobile || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

const LOCAL_STORAGE_PREFIX = 'eck_reg_cache_';

/**
 * Queries Supabase (and local fallback cache) to check if a user is already registered for an event.
 */
export async function lookupRegistrationByMobile(
  eventSlug: string,
  mobile: string
): Promise<ExistingRegistrationLookup> {
  const cleanMobile = cleanMobileNumber(mobile);
  if (cleanMobile.length < 10) {
    return { found: false };
  }

  // 1. Primary: Call Supabase RPC get_registration_by_mobile
  try {
    const { data, error } = await supabase.rpc('get_registration_by_mobile', {
      p_event_slug: eventSlug,
      p_mobile: cleanMobile,
    });

    if (!error && data && data.found) {
      const reg = data as ExistingRegistrationLookup;
      // Cache locally for offline/instant reload
      cacheRegistrationLocally(eventSlug, cleanMobile, reg);
      return reg;
    }
  } catch (rpcErr) {
    console.warn('RPC get_registration_by_mobile notice:', rpcErr);
  }

  // 2. Secondary fallback: Query Supabase tables directly (if RLS allows)
  try {
    const { data: eventData } = await supabase
      .from('events')
      .select('id')
      .eq('event_slug', eventSlug)
      .maybeSingle();

    if (eventData?.id) {
      const { data: alumniData } = await supabase
        .from('alumni')
        .select('*')
        .eq('mobile', cleanMobile)
        .maybeSingle();

      if (alumniData?.id) {
        const { data: regData } = await supabase
          .from('event_registrations')
          .select('*')
          .eq('event_id', eventData.id)
          .eq('alumni_id', alumniData.id)
          .maybeSingle();

        if (regData) {
          const result: ExistingRegistrationLookup = {
            found: true,
            registration_id: regData.id,
            registration_number: regData.registration_number,
            attendance_status: regData.attendance_status,
            number_of_attendees: regData.number_of_attendees,
            adults_count: regData.adults_count ?? 1,
            children_above_7_count: regData.children_above_7_count ?? 0,
            children_under_7_count: regData.children_under_7_count ?? 0,
            amount: regData.amount,
            payment_screenshot_path: regData.payment_screenshot_path,
            created_at: regData.created_at,
            updated_at: regData.updated_at,
            alumni: alumniData as Alumni,
          };
          cacheRegistrationLocally(eventSlug, cleanMobile, result);
          return result;
        }
      }
    }
  } catch (tableErr) {
    console.warn('Table fallback lookup notice:', tableErr);
  }

  // 3. Fallback to browser local cache
  try {
    const cacheKey = `${LOCAL_STORAGE_PREFIX}${eventSlug}_${cleanMobile}`;
    const cachedStr = localStorage.getItem(cacheKey);
    if (cachedStr) {
      const parsed = JSON.parse(cachedStr) as ExistingRegistrationLookup;
      return parsed;
    }
  } catch (cacheErr) {
    console.warn('Local cache read notice:', cacheErr);
  }

  return { found: false };
}

/**
 * Cache registration in localStorage
 */
export function cacheRegistrationLocally(
  eventSlug: string,
  mobile: string,
  reg: ExistingRegistrationLookup
): void {
  try {
    const cleanMobile = cleanMobileNumber(mobile);
    if (!cleanMobile) return;
    const cacheKey = `${LOCAL_STORAGE_PREFIX}${eventSlug}_${cleanMobile}`;
    localStorage.setItem(cacheKey, JSON.stringify(reg));
    // Also save latest mobile for current event for quick access
    localStorage.setItem(`eck_latest_mobile_${eventSlug}`, cleanMobile);
  } catch (e) {
    // Ignore localStorage write failures
  }
}

/**
 * Save newly completed registration into local cache
 */
export function recordCompletedRegistrationLocally(
  eventSlug: string,
  formData: RegistrationFormData,
  result: RegistrationResult,
  screenshotPath?: string | null
): void {
  const cleanMobile = cleanMobileNumber(formData.mobile);
  const lookupObj: ExistingRegistrationLookup = {
    found: true,
    registration_id: result.registration_id,
    registration_number: result.registration_number,
    attendance_status: (formData.attendance_status || 'yes') as 'yes' | 'maybe' | 'no',
    number_of_attendees: formData.number_of_attendees || 1,
    adults_count: formData.adults_count ?? 1,
    children_above_7_count: formData.children_above_7_count ?? 0,
    children_under_7_count: formData.children_under_7_count ?? 0,
    amount: result.amount,
    payment_screenshot_path: screenshotPath || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    alumni: {
      id: result.alumni_id || 'cached-alumni',
      name: formData.name,
      email: formData.email || null,
      mobile: cleanMobile,
      address: formData.address,
      country: formData.country,
      city: formData.city,
      state: formData.state,
      year_of_passing: Number(formData.year_of_passing) || 2024,
      engineering_discipline: formData.engineering_discipline,
      organization: formData.organization || null,
      employment_type: formData.employment_type || undefined,
      industry_domain: formData.industry_domain || undefined,
      professional_category: formData.professional_category || '',
      work_location: formData.work_location || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
  cacheRegistrationLocally(eventSlug, cleanMobile, lookupObj);
}

/**
 * Convert lookup registration data into RegistrationFormData format for pre-filling
 */
export function convertLookupToFormData(lookup: ExistingRegistrationLookup): RegistrationFormData {
  const alumni = lookup.alumni;
  const isAttending = lookup.attendance_status === 'yes';
  const adults = isAttending
    ? (lookup.adults_count !== undefined ? lookup.adults_count : Math.max(1, lookup.number_of_attendees || 1))
    : 1;
  const kidsAbove7 = isAttending ? (lookup.children_above_7_count ?? 0) : 0;
  const kidsUnder7 = isAttending ? (lookup.children_under_7_count ?? 0) : 0;
  const attendeesCount = lookup.number_of_attendees || (adults + kidsAbove7 + kidsUnder7);

  const isIndia = (alumni?.country || 'India') === 'India';

  return {
    name: alumni?.name || '',
    email: alumni?.email || '',
    mobile: alumni?.mobile || '',
    address: alumni?.address || '',
    country: isIndia ? 'India' : 'Other',
    country_other: isIndia ? '' : (alumni?.country || ''),
    city: alumni?.city || '',
    state: isIndia ? (alumni?.state || 'Rajasthan') : '',
    state_other: isIndia ? '' : (alumni?.state || ''),
    year_of_passing: alumni?.year_of_passing || '',
    engineering_discipline: alumni?.engineering_discipline || '',
    engineering_discipline_other: '',
    organization: alumni?.organization || '',
    employment_type: alumni?.employment_type || '',
    employment_type_other: '',
    industry_domain: alumni?.industry_domain || '',
    industry_domain_other: '',
    professional_category: alumni?.professional_category || '',
    work_location: alumni?.work_location || '',
    attendance_status: (lookup.attendance_status || 'yes') as 'yes' | 'maybe' | 'no',
    number_of_attendees: attendeesCount,
    adults_count: adults,
    children_above_7_count: kidsAbove7,
    children_under_7_count: kidsUnder7,
  };
}
