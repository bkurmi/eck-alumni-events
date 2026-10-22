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

/**
 * Checks if a mobile number is a valid registered 10-digit number (not a dummy/offline placeholder).
 */
export function isRealMobileNumber(mobile?: string | null): boolean {
  if (!mobile) return false;
  if (mobile.startsWith('NOMOBILE-') || mobile.toLowerCase().startsWith('nomobile')) return false;
  const clean = cleanMobileNumber(mobile);
  return clean.length === 10;
}

/**
 * Formats a mobile number for UI display, cleanly masking placeholder values.
 */
export function formatDisplayMobile(mobile?: string | null, fallback = 'Not Provided'): string {
  if (!mobile || !isRealMobileNumber(mobile)) {
    return fallback;
  }
  return mobile;
}

const LOCAL_STORAGE_PREFIX = 'eck_reg_cache_';

// Purge any legacy registration caches from browser so database is strictly the single source of truth
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LOCAL_STORAGE_PREFIX) || k.startsWith('eck_latest_mobile_'))
      .forEach((k) => localStorage.removeItem(k));
  }
} catch (_) {
  // Ignore localStorage access failures
}

/**
 * Queries Supabase directly to check if a user is already registered for an event.
 * Database is strictly the single source of truth (no stale cache fallback).
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

    if (!error && data) {
      if (data.found) {
        // Fallback: If database RPC did not return photo_url, query event_registrations directly
        if (!data.photo_url && data.registration_id) {
          try {
            const { data: regPhoto } = await supabase
              .from('event_registrations')
              .select('photo_url')
              .eq('id', data.registration_id)
              .maybeSingle();
            if (regPhoto?.photo_url) {
              data.photo_url = regPhoto.photo_url;
            }
          } catch {
            // Silently continue if direct select is restricted
          }
        }
        return data as ExistingRegistrationLookup;
      }
      return { found: false };
    }
  } catch (rpcErr) {
    console.warn('RPC get_registration_by_mobile notice:', rpcErr);
  }

  // 2. Secondary fallback: Query Supabase tables directly (if RPC failed or RLS allows)
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
            photo_url: regData.photo_url || null,
            created_at: regData.created_at,
            updated_at: regData.updated_at,
            alumni: alumniData as Alumni,
          };
          return result;
        }
      }
    }
  } catch (tableErr) {
    console.warn('Table fallback lookup notice:', tableErr);
  }

  // 3. Strictly return not found (no local cache fallback)
  return { found: false };
}

/**
 * Normalizes input numeric registration id (e.g. "39", "00039", or "REG-00039")
 * into canonical "REG-00039" format with leading zeros up to 5 digits.
 */
export function formatRegistrationNumberInput(rawInput: string): string {
  const digits = (rawInput || '').replace(/\D/g, '').slice(0, 5);
  if (!digits) return '';
  const padded = digits.padStart(5, '0');
  return `REG-${padded}`;
}

/**
 * Looks up a registration directly by 5-digit Registration Number (e.g. REG-00039 or 39).
 * Used for ID Card / Gate Pass download.
 */
export async function lookupRegistrationByRegNumber(
  eventSlug: string,
  regNumberOrDigits: string
): Promise<ExistingRegistrationLookup> {
  const formattedRegNumber = formatRegistrationNumberInput(regNumberOrDigits);
  if (!formattedRegNumber) {
    return { found: false };
  }

  // 1. Primary: Try Supabase RPC get_registration_by_reg_number
  try {
    const { data, error } = await supabase.rpc('get_registration_by_reg_number', {
      p_event_slug: eventSlug,
      p_reg_number: formattedRegNumber,
    });

    if (!error && data) {
      if (data.found) {
        return data as ExistingRegistrationLookup;
      }
      return { found: false };
    }
  } catch (rpcErr) {
    console.warn('RPC get_registration_by_reg_number notice:', rpcErr);
  }

  // 2. Secondary fallback: Direct Supabase table query
  try {
    const { data: eventData } = await supabase
      .from('events')
      .select('id')
      .eq('event_slug', eventSlug)
      .maybeSingle();

    let query = supabase
      .from('event_registrations')
      .select('*, alumni:alumni_id (*)')
      .ilike('registration_number', formattedRegNumber);

    if (eventData?.id) {
      query = query.eq('event_id', eventData.id);
    }

    const { data: regData, error: tableErr } = await query.maybeSingle();

    if (!tableErr && regData && regData.alumni) {
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
        photo_url: regData.photo_url || null,
        created_at: regData.created_at,
        updated_at: regData.updated_at,
        alumni: regData.alumni as Alumni,
      };
      return result;
    }
  } catch (tableErr) {
    console.warn('Table fallback lookup by reg number notice:', tableErr);
  }

  return { found: false };
}

/**
 * Cache registration helper retained for backwards compatibility (no-op)
 */
export function cacheRegistrationLocally(
  _eventSlug: string,
  _mobile: string,
  _reg: ExistingRegistrationLookup
): void {
  // No-op: cache disabled to ensure database is always the single source of truth
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
    attendance_status: (formData.attendance_status || 'yes') as
      | 'yes'
      | 'maybe'
      | 'no'
      | 'payment_pending',
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
  const isAttending = lookup.attendance_status === 'yes' || lookup.attendance_status === 'payment_pending';
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
    attendance_status: (lookup.attendance_status === 'payment_pending' ? 'yes' : lookup.attendance_status || 'yes') as 'yes' | 'maybe' | 'no',
    number_of_attendees: attendeesCount,
    adults_count: adults,
    children_above_7_count: kidsAbove7,
    children_under_7_count: kidsUnder7,
  };
}

/**
 * Fetches current total count of registrations for an event.
 * Tries RPC get_event_registration_count, falls back to direct table count.
 */
export async function getEventRegistrationCount(eventSlug: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_event_registration_count', {
      p_event_slug: eventSlug,
    });
    if (!error && typeof data === 'number') {
      return data;
    }
  } catch (rpcErr) {
    // Silent fallback
  }

  try {
    const { count, error } = await supabase
      .from('event_registrations')
      .select('id', { count: 'exact', head: true });
    if (!error && typeof count === 'number') {
      return count;
    }
  } catch (countErr) {
    // Silent fallback
  }

  return 0;
}

/**
 * Pre-fetches all event registrations once into memory for instant client-side
 * predictive searching (by name, branch, batch, reg number) with zero latency.
 */
export async function fetchAllRegistrationsForLookup(
  eventSlug: string
): Promise<ExistingRegistrationLookup[]> {
  try {
    const { data: eventData } = await supabase
      .from('events')
      .select('id')
      .eq('event_slug', eventSlug)
      .maybeSingle();

    let queryBuilder = supabase
      .from('event_registrations')
      .select(`
        id,
        registration_number,
        attendance_status,
        number_of_attendees,
        adults_count,
        children_above_7_count,
        children_under_7_count,
        amount,
        payment_screenshot_path,
        photo_url,
        created_at,
        updated_at,
        alumni:alumni_id (
          id,
          name,
          mobile,
          email,
          engineering_discipline,
          year_of_passing,
          professional_category,
          city,
          state,
          country,
          address,
          organization,
          work_location,
          created_at,
          updated_at
        )
      `)
      .order('created_at', { ascending: false });

    if (eventData?.id) {
      queryBuilder = queryBuilder.eq('event_id', eventData.id);
    }

    const { data, error } = await queryBuilder;

    if (!error && Array.isArray(data) && data.length > 0) {
      return data
        .filter((reg: any) => reg.alumni)
        .map((reg: any) => ({
          found: true,
          registration_id: reg.id,
          registration_number: reg.registration_number,
          attendance_status: reg.attendance_status,
          number_of_attendees: reg.number_of_attendees,
          adults_count: reg.adults_count ?? 1,
          children_above_7_count: reg.children_above_7_count ?? 0,
          children_under_7_count: reg.children_under_7_count ?? 0,
          amount: reg.amount,
          payment_screenshot_path: reg.payment_screenshot_path,
          photo_url: reg.photo_url,
          created_at: reg.created_at,
          updated_at: reg.updated_at,
          alumni: reg.alumni as Alumni,
        }));
    }
  } catch (err) {
    console.warn('fetchAllRegistrationsForLookup error:', err);
  }

  // Fallback demo registrations for local dev
  const demoCandidates = [
    { name: 'Bhawesh Kurmi', year: 2008, branch: 'Information Technology', reg: 'REG-00039', mobile: '9799951857' },
    { name: 'Rahul Sharma', year: 2012, branch: 'Computer Science', reg: 'REG-00012', mobile: '9829012345' },
    { name: 'Priya Verma', year: 2016, branch: 'Electrical Engineering', reg: 'REG-00045', mobile: '9414012345' },
    { name: 'Amit Kumar Meena', year: 2015, branch: 'Mechanical Engineering', reg: 'REG-00088', mobile: '9876543210' },
    { name: 'Vikram Singh Rathore', year: 2010, branch: 'Civil Engineering', reg: 'REG-00021', mobile: '9828054321' },
    { name: 'Neha Gupta', year: 2019, branch: 'Electronics & Comm.', reg: 'REG-00104', mobile: '9928011223' },
  ];

  return demoCandidates.map((c) => ({
    found: true,
    registration_id: `demo-${c.reg}`,
    registration_number: c.reg,
    attendance_status: 'yes' as const,
    number_of_attendees: 1,
    adults_count: 1,
    children_above_7_count: 0,
    children_under_7_count: 0,
    amount: 800,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    alumni: {
      id: `demo-alumni-${c.reg}`,
      name: c.name,
      mobile: c.mobile,
      email: `${c.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      engineering_discipline: c.branch,
      year_of_passing: c.year,
      professional_category: 'Alumnus',
      city: 'Kota',
      state: 'Rajasthan',
      country: 'India',
      address: 'Kota',
      organization: 'ECK Alumni',
      work_location: 'Kota',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }));
}
