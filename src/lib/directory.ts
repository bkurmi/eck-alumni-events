// Directory and Alumni Profile management logic
import { supabase } from './supabase';
import { cleanMobileNumber } from './registrations';
import { compressAttendeePhoto } from './gate';
import { getBatchFromPassingYear } from './batchUtils';
import { COMMON_ORGANIZATIONS } from '../types';
import type { AlumniDirectoryItem, UpdateAlumniPayload, Alumni, AlumniRegistrationFormData } from '../types';

/**
 * Normalizes an alumni record with its latest registration photo.
 */
function normalizeAlumniWithPhoto(record: any): AlumniDirectoryItem {
  const registrations: any[] = Array.isArray(record.registrations)
    ? record.registrations
    : Array.isArray(record.event_registrations)
    ? record.event_registrations
    : [];

  // Sort registrations descending by created_at to get the latest
  registrations.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  // Find photo in alumni table first, then search registrations
  let photo = record.photo_url || null;
  if (!photo) {
    const regWithPhoto = registrations.find((r) => r.photo_url && r.photo_url.trim() !== '');
    if (regWithPhoto) {
      photo = regWithPhoto.photo_url;
    }
  }

  const latestReg = registrations[0];
  const passingYear = Number(record.year_of_passing) || 0;
  const resolvedBatch = record.batch || (passingYear ? getBatchFromPassingYear(passingYear) : null);

  return {
    id: record.id,
    name: record.name || 'Alumnus',
    email: record.email || null,
    mobile: record.mobile || '',
    address: record.address || '',
    country: record.country || 'India',
    city: record.city || 'Kota',
    state: record.state || 'Rajasthan',
    batch: resolvedBatch,
    year_of_passing: passingYear,
    engineering_discipline: record.engineering_discipline || 'Other',
    organization: record.organization || null,
    designation: record.designation || null,
    employment_type: record.employment_type || undefined,
    industry_domain: record.industry_domain || undefined,
    professional_category: record.professional_category || '',
    work_location: record.work_location || null,
    linkedin_url: record.linkedin_url || null,
    photo_url: photo,
    resolved_photo_url: photo,
    approval_status: record.approval_status || 'APPROVED',
    reviewed_at: record.reviewed_at || null,
    rejection_reason: record.rejection_reason || null,
    latest_event_registration_number: latestReg?.registration_number || null,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

/**
 * Fetches all registered alumni across all events for the Alumni Directory.
 */
export async function fetchAlumniDirectory(): Promise<AlumniDirectoryItem[]> {
  try {
    const { data, error } = await supabase
      .from('alumni')
      .select(`
        *,
        registrations:event_registrations (
          id,
          registration_number,
          photo_url,
          created_at
        )
      `)
      .or('approval_status.eq.APPROVED,approval_status.is.null')
      .order('year_of_passing', { ascending: false });

    if (error) {
      console.warn('Error fetching alumni directory with registrations join:', error);
      // Fallback query without relation
      const { data: fallbackData } = await supabase
        .from('alumni')
        .select('*')
        .or('approval_status.eq.APPROVED,approval_status.is.null')
        .order('year_of_passing', { ascending: false });

      if (fallbackData) {
        return (fallbackData as Alumni[]).map((a) => normalizeAlumniWithPhoto(a));
      }
      return [];
    }

    if (Array.isArray(data)) {
      return data.map(normalizeAlumniWithPhoto);
    }
  } catch (err) {
    console.error('Directory fetch exception:', err);
  }
  return [];
}

/**
 * Auto-suggest search by Name or partial keywords.
 * Returns up to `limit` matches for autocomplete (only approved alumni).
 */
export async function searchAlumniSuggestions(
  query: string,
  limit: number = 8
): Promise<AlumniDirectoryItem[]> {
  const cleanQuery = (query || '').trim();
  if (cleanQuery.length < 2) return [];

  try {
    const { data, error } = await supabase
      .from('alumni')
      .select(`
        *,
        registrations:event_registrations (
          id,
          registration_number,
          photo_url,
          created_at
        )
      `)
      .or('approval_status.eq.APPROVED,approval_status.is.null')
      .ilike('name', `%${cleanQuery}%`)
      .limit(limit);

    if (!error && Array.isArray(data)) {
      return data.map(normalizeAlumniWithPhoto);
    }
  } catch (err) {
    console.warn('Alumni suggestions error:', err);
  }
  return [];
}

let cachedOrganizations: string[] | null = null;

/**
 * Fetch distinct organizations previously entered by other alumni from the database.
 * Results are frequency-sorted (most popular first) and deduplicated.
 */
export async function fetchOrganizationSuggestions(): Promise<string[]> {
  if (cachedOrganizations && cachedOrganizations.length > 0) {
    return cachedOrganizations;
  }

  try {
    const { data, error } = await supabase
      .from('alumni')
      .select('organization')
      .not('organization', 'is', null);

    if (!error && Array.isArray(data)) {
      const frequencyMap = new Map<string, { count: number; canonical: string }>();

      for (const item of data) {
        const raw = (item.organization || '').trim();
        if (
          raw.length >= 2 &&
          raw.toLowerCase() !== 'not provided' &&
          raw.toLowerCase() !== 'null' &&
          raw.toLowerCase() !== 'undefined'
        ) {
          const key = raw.toLowerCase();
          const existing = frequencyMap.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            frequencyMap.set(key, { count: 1, canonical: raw });
          }
        }
      }

      const dbOrgs = Array.from(frequencyMap.values())
        .sort((a, b) => b.count - a.count)
        .map((item) => item.canonical);

      const mergedSet = new Set<string>();
      dbOrgs.forEach((org) => mergedSet.add(org));
      (COMMON_ORGANIZATIONS as readonly string[]).forEach((org) => mergedSet.add(org));

      cachedOrganizations = Array.from(mergedSet);
      return cachedOrganizations;
    }
  } catch (err) {
    console.warn('Organization suggestions fetch note:', err);
  }

  cachedOrganizations = Array.from(COMMON_ORGANIZATIONS);
  return cachedOrganizations;
}

/**
 * Exact search by mobile number (normalized to 10 digits).
 */
export async function lookupAlumniByMobile(rawMobile: string): Promise<AlumniDirectoryItem | null> {
  const clean = cleanMobileNumber(rawMobile);
  if (!clean || clean.length < 10) return null;

  try {
    const { data, error } = await supabase
      .from('alumni')
      .select(`
        *,
        registrations:event_registrations (
          id,
          registration_number,
          photo_url,
          created_at
        )
      `)
      .or(`mobile.eq.${clean},mobile.eq.+91${clean}`)
      .maybeSingle();

    if (!error && data) {
      return normalizeAlumniWithPhoto(data);
    }
  } catch (err) {
    console.error('Alumni mobile lookup error:', err);
  }
  return null;
}

/**
 * Client-side compression and upload of attendee photograph to Supabase Storage.
 */
export async function uploadAlumniPhoto(
  phone: string,
  name: string,
  file: File,
  regNumber?: string
): Promise<{ success: boolean; photoUrl?: string; error?: string }> {
  try {
    // 1. Compress image client-side to max 800px & ~90KB
    const compressedBlob = await compressAttendeePhoto(file);

    const cleanName = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'alumni';
    const contact = cleanMobileNumber(phone) || (regNumber ? regNumber.toLowerCase().replace(/[^a-z0-9]/g, '') : 'id');
    const fileName = `${cleanName}_${contact}.jpg`;

    // 2. Upload to Supabase Storage bucket 'id-photos'
    const { error: uploadError } = await supabase.storage
      .from('id-photos')
      .upload(fileName, compressedBlob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.warn('Storage upload notice:', uploadError);
      // Fallback to data URL if bucket is unreachable
      const photoUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(compressedBlob);
      });
      return { success: true, photoUrl };
    }

    const { data: publicUrlData } = supabase.storage
      .from('id-photos')
      .getPublicUrl(fileName);

    const photoUrl = publicUrlData?.publicUrl ? `${publicUrlData.publicUrl}?t=${Date.now()}` : '';
    return { success: true, photoUrl };
  } catch (err: any) {
    console.error('Failed to compress or upload alumni photo:', err);
    return { success: false, error: err?.message || 'Photo upload encountered an issue.' };
  }
}

/**
 * Saves alumni profile updates to Supabase.
 * First tries RPC `update_alumni_profile`; if not yet deployed, falls back to direct table update.
 */
export async function saveAlumniProfile(
  payload: UpdateAlumniPayload
): Promise<{ success: boolean; error?: string; photoUrl?: string }> {
  try {
    const cleanMobile = cleanMobileNumber(payload.mobile);

    // 1. Try secure RPC
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('update_alumni_profile', {
        p_alumni_id: payload.alumni_id,
        p_mobile: cleanMobile,
        p_name: payload.name.trim(),
        p_email: payload.email?.trim() || null,
        p_year_of_passing: payload.year_of_passing ? Number(payload.year_of_passing) : null,
        p_batch: payload.batch?.trim() || null,
        p_engineering_discipline: payload.engineering_discipline?.trim() || null,
        p_organization: payload.organization?.trim() || null,
        p_designation: payload.designation?.trim() || null,
        p_employment_type: payload.employment_type?.trim() || null,
        p_industry_domain: payload.industry_domain?.trim() || null,
        p_professional_category: payload.professional_category?.trim() || null,
        p_city: payload.city?.trim() || null,
        p_state: payload.state?.trim() || null,
        p_country: payload.country?.trim() || 'India',
        p_address: payload.address?.trim() || null,
        p_work_location: payload.work_location?.trim() || null,
        p_linkedin_url: payload.linkedin_url?.trim() || null,
        p_photo_url: payload.photo_url || null,
      });

      if (!rpcError && rpcData?.success) {
        return { success: true, photoUrl: payload.photo_url || undefined };
      }
      if (rpcError) {
        console.warn('RPC update_alumni_profile notice, trying direct fallback:', rpcError.message);
      }
    } catch (rpcErr) {
      console.warn('RPC exception, falling back to direct table update:', rpcErr);
    }

    // 2. Direct table update fallback
    const updateObj: Record<string, any> = {
      name: payload.name.trim(),
      email: payload.email?.trim() || null,
      city: payload.city?.trim() || 'Kota',
      state: payload.state?.trim() || 'Rajasthan',
      country: payload.country?.trim() || 'India',
      address: payload.address?.trim() || '',
      organization: payload.organization?.trim() || null,
      designation: payload.designation?.trim() || null,
      work_location: payload.work_location?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (payload.batch) {
      updateObj.batch = payload.batch.trim();
    }
    if (payload.year_of_passing) {
      updateObj.year_of_passing = Number(payload.year_of_passing);
    }
    if (payload.engineering_discipline) {
      updateObj.engineering_discipline = payload.engineering_discipline.trim();
    }
    if (payload.employment_type !== undefined) {
      updateObj.employment_type = payload.employment_type?.trim() || null;
    }
    if (payload.industry_domain !== undefined) {
      updateObj.industry_domain = payload.industry_domain?.trim() || null;
    }
    if (payload.professional_category !== undefined) {
      updateObj.professional_category = payload.professional_category?.trim() || '';
    }
    if (payload.linkedin_url !== undefined) {
      updateObj.linkedin_url = payload.linkedin_url?.trim() || null;
    }
    if (payload.photo_url) {
      updateObj.photo_url = payload.photo_url;
    }

    const { error: alumniError } = await supabase
      .from('alumni')
      .update(updateObj)
      .eq('id', payload.alumni_id);

    if (alumniError) {
      console.error('Alumni direct update error:', alumniError);
      return { success: false, error: alumniError.message };
    }

    // If photo was changed, sync to event_registrations too
    if (payload.photo_url) {
      try {
        await supabase
          .from('event_registrations')
          .update({
            photo_url: payload.photo_url,
            updated_at: new Date().toISOString(),
          })
          .eq('alumni_id', payload.alumni_id);
      } catch (regPhotoErr) {
        console.warn('Registration photo sync notice:', regPhotoErr);
      }
    }

    return { success: true, photoUrl: payload.photo_url || undefined };
  } catch (err: any) {
    console.error('Failed to save alumni profile:', err);
    return { success: false, error: err?.message || 'Failed to update record.' };
  }
}

/**
 * Fetches all alumni applications awaiting manual committee approval.
 */
export async function fetchPendingAlumniApprovals(): Promise<AlumniDirectoryItem[]> {
  try {
    const { data, error } = await supabase
      .from('alumni')
      .select('*')
      .eq('approval_status', 'PENDING')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      return data.map((a) => normalizeAlumniWithPhoto(a));
    }
  } catch (err) {
    console.error('fetchPendingAlumniApprovals exception:', err);
  }
  return [];
}

/**
 * Fetches all alumni for organizer admin overview (includes pending, approved, and rejected).
 */
export async function fetchAllAlumniForAdmin(): Promise<AlumniDirectoryItem[]> {
  try {
    const { data, error } = await supabase
      .from('alumni')
      .select(`
        *,
        registrations:event_registrations (
          id,
          registration_number,
          photo_url,
          created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      return data.map((a) => normalizeAlumniWithPhoto(a));
    }
  } catch (err) {
    console.error('fetchAllAlumniForAdmin error:', err);
  }
  return [];
}

/**
 * Approves an alumni member's registration record.
 */
export async function approveAlumniRecord(
  alumniId: string
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Try secure RPC
    const { data, error } = await supabase.rpc('approve_alumni_member', {
      p_alumni_id: alumniId,
    });
    if (!error && data?.success) {
      return { success: true, message: data.message || 'Alumnus approved successfully.' };
    }
    if (error) {
      console.warn('RPC approve_alumni_member returned error:', error);
    }
  } catch (rpcErr) {
    console.warn('RPC approve_alumni_member notice, trying direct fallback:', rpcErr);
  }

  // 2. Direct table update fallback
  try {
    const { data, error } = await supabase
      .from('alumni')
      .update({
        approval_status: 'APPROVED',
        reviewed_at: new Date().toISOString(),
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', alumniId)
      .select('id, approval_status');

    if (!error && Array.isArray(data) && data.length > 0) {
      return { success: true, message: 'Alumnus approved successfully.' };
    }
    if (!error && (!data || data.length === 0)) {
      console.error('[Database Notice] Direct update affected 0 rows on alumni table for ID:', alumniId);
      return {
        success: false,
        message: 'Database permission denied: Please run the updated 06_alumni_approval_workflow.sql in Supabase SQL Editor.',
      };
    }
    return { success: false, message: error?.message || 'Approval update failed.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Approval failed' };
  }
}

/**
 * Rejects an alumni member's registration record with optional reason.
 */
export async function rejectAlumniRecord(
  alumniId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Try secure RPC
    const { data, error } = await supabase.rpc('reject_alumni_member', {
      p_alumni_id: alumniId,
      p_reason: reason || null,
    });
    if (!error && data?.success) {
      return { success: true, message: data.message || 'Alumnus application rejected.' };
    }
    if (error) {
      console.warn('RPC reject_alumni_member returned error:', error);
    }
  } catch (rpcErr) {
    console.warn('RPC reject_alumni_member notice, trying direct fallback:', rpcErr);
  }

  // 2. Direct table update fallback
  try {
    const { data, error } = await supabase
      .from('alumni')
      .update({
        approval_status: 'REJECTED',
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', alumniId)
      .select('id, approval_status');

    if (!error && Array.isArray(data) && data.length > 0) {
      return { success: true, message: 'Alumnus application rejected.' };
    }
    if (!error && (!data || data.length === 0)) {
      console.error('[Database Notice] Direct update affected 0 rows on alumni table for ID:', alumniId);
      return {
        success: false,
        message: 'Database permission denied: Please run the updated 06_alumni_approval_workflow.sql in Supabase SQL Editor.',
      };
    }
    return { success: false, message: error?.message || 'Rejection update failed.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Rejection failed' };
  }
}

/**
 * Submits self-registration for a new alumnus (stored as PENDING for admin review).
 */
export async function submitAlumniSelfRegistration(
  formData: AlumniRegistrationFormData,
  photoFile?: File | null
): Promise<{ success: boolean; status?: string; message: string; alumni_id?: string }> {
  try {
    const cleanMobile = cleanMobileNumber(formData.mobile);
    if (!cleanMobile || cleanMobile.length < 10) {
      return {
        success: false,
        status: 'INVALID_MOBILE',
        message: 'Please provide a valid 10-digit mobile number.',
      };
    }

    let finalPhotoUrl = formData.photo_url || null;

    // Upload photo if file provided
    if (photoFile) {
      const uploadRes = await uploadAlumniPhoto(cleanMobile, formData.name, photoFile);
      if (uploadRes.success && uploadRes.photoUrl) {
        finalPhotoUrl = uploadRes.photoUrl;
      }
    }

    const resolvedDiscipline =
      formData.engineering_discipline === 'Other'
        ? (formData.engineering_discipline_other?.trim() || 'Other')
        : formData.engineering_discipline;

    const resolvedCountry =
      formData.country === 'Other'
        ? (formData.country_other?.trim() || 'Other')
        : (formData.country || 'India');

    const resolvedState =
      formData.country === 'India'
        ? formData.state
        : (formData.state_other?.trim() || '');

    const resolvedEmployment =
      formData.employment_type === 'Other'
        ? (formData.employment_type_other?.trim() || 'Other')
        : (formData.employment_type || null);

    const resolvedIndustry =
      formData.industry_domain === 'Other'
        ? (formData.industry_domain_other?.trim() || 'Other')
        : (formData.industry_domain || null);

    const combinedCategory = [resolvedEmployment, resolvedIndustry].filter(Boolean).join(' | ') || 'Alumni';

    const passingYear = Number(formData.year_of_passing) || 2024;
    const resolvedBatch =
      formData.batch?.trim() ||
      (passingYear ? getBatchFromPassingYear(passingYear) : '2024');

    // 1. Try secure RPC register_alumni_member
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('register_alumni_member', {
        p_name: formData.name.trim(),
        p_mobile: cleanMobile,
        p_email: formData.email.trim() || null,
        p_address: formData.address.trim(),
        p_city: formData.city.trim() || 'Kota',
        p_state: resolvedState || 'Rajasthan',
        p_country: resolvedCountry,
        p_year_of_passing: passingYear,
        p_engineering_discipline: resolvedDiscipline,
        p_batch: resolvedBatch,
        p_organization: formData.organization.trim() || null,
        p_designation: formData.designation.trim() || null,
        p_employment_type: resolvedEmployment,
        p_industry_domain: resolvedIndustry,
        p_professional_category: combinedCategory,
        p_work_location: formData.work_location?.trim() || null,
        p_linkedin_url: formData.linkedin_url?.trim() || null,
        p_photo_url: finalPhotoUrl,
      });

      if (!rpcError && rpcData) {
        return {
          success: Boolean(rpcData.success),
          status: rpcData.status,
          message: rpcData.message || (rpcData.success ? 'Registration submitted successfully!' : 'Registration issue'),
          alumni_id: rpcData.alumni_id,
        };
      }
      if (rpcError) {
        console.warn('RPC register_alumni_member notice, trying direct fallback:', rpcError.message);
      }
    } catch (rpcErr) {
      console.warn('RPC register_alumni_member exception, trying direct table fallback:', rpcErr);
    }

    // 2. Fallback direct table query & insert
    const { data: existing } = await supabase
      .from('alumni')
      .select('id, approval_status, name')
      .or(`mobile.eq.${cleanMobile},mobile.eq.+91${cleanMobile}`)
      .maybeSingle();

    if (existing) {
      if (existing.approval_status === 'APPROVED') {
        return {
          success: false,
          status: 'ALREADY_APPROVED',
          alumni_id: existing.id,
          message: 'You are already a verified and approved member of the ECK-RTU Alumni Network!',
        };
      }
      if (existing.approval_status === 'PENDING') {
        return {
          success: false,
          status: 'ALREADY_PENDING',
          alumni_id: existing.id,
          message: 'Your registration has already been submitted and is awaiting committee review.',
        };
      }

      // Re-apply if previously rejected
      const updatePayload: Record<string, any> = {
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        address: formData.address.trim(),
        city: formData.city.trim() || 'Kota',
        state: resolvedState || 'Rajasthan',
        country: resolvedCountry,
        year_of_passing: passingYear,
        batch: resolvedBatch,
        engineering_discipline: resolvedDiscipline,
        organization: formData.organization.trim() || null,
        designation: formData.designation.trim() || null,
        employment_type: resolvedEmployment,
        industry_domain: resolvedIndustry,
        professional_category: combinedCategory,
        work_location: formData.work_location?.trim() || null,
        linkedin_url: formData.linkedin_url?.trim() || null,
        photo_url: finalPhotoUrl,
        approval_status: 'PENDING',
        rejection_reason: null,
        reviewed_at: null,
        updated_at: new Date().toISOString(),
      };

      let updateRes = await supabase.from('alumni').update(updatePayload).eq('id', existing.id);

      // Safe schema fallback if optional columns are pending migration
      if (updateRes.error && updateRes.error.message?.includes('linkedin_url')) {
        delete updatePayload.linkedin_url;
        updateRes = await supabase.from('alumni').update(updatePayload).eq('id', existing.id);
      }
      if (updateRes.error && updateRes.error.message?.includes('photo_url')) {
        delete updatePayload.photo_url;
        updateRes = await supabase.from('alumni').update(updatePayload).eq('id', existing.id);
      }
      if (updateRes.error && updateRes.error.message?.includes('batch')) {
        delete updatePayload.batch;
        updateRes = await supabase.from('alumni').update(updatePayload).eq('id', existing.id);
      }
      if (updateRes.error && updateRes.error.message?.includes('designation')) {
        delete updatePayload.designation;
        updateRes = await supabase.from('alumni').update(updatePayload).eq('id', existing.id);
      }

      if (updateRes.error) {
        return { success: false, message: updateRes.error.message };
      }

      return {
        success: true,
        status: 'RE_SUBMITTED',
        alumni_id: existing.id,
        message: 'Your alumni registration details have been updated and resubmitted for committee review.',
      };
    }

    // Insert new alumni row with approval_status = 'PENDING'
    const insertPayload: Record<string, any> = {
      name: formData.name.trim(),
      email: formData.email.trim() || null,
      mobile: cleanMobile,
      address: formData.address.trim(),
      city: formData.city.trim() || 'Kota',
      state: resolvedState || 'Rajasthan',
      country: resolvedCountry,
      year_of_passing: passingYear,
      batch: resolvedBatch,
      engineering_discipline: resolvedDiscipline,
      organization: formData.organization.trim() || null,
      designation: formData.designation.trim() || null,
      employment_type: resolvedEmployment,
      industry_domain: resolvedIndustry,
      professional_category: combinedCategory,
      work_location: formData.work_location?.trim() || null,
      linkedin_url: formData.linkedin_url?.trim() || null,
      photo_url: finalPhotoUrl,
      approval_status: 'PENDING',
    };

    let insertRes = await supabase
      .from('alumni')
      .insert(insertPayload)
      .select('id')
      .single();

    // Safe schema fallback if optional columns are pending migration
    if (insertRes.error && insertRes.error.message?.includes('linkedin_url')) {
      delete insertPayload.linkedin_url;
      insertRes = await supabase.from('alumni').insert(insertPayload).select('id').single();
    }
    if (insertRes.error && insertRes.error.message?.includes('photo_url')) {
      delete insertPayload.photo_url;
      insertRes = await supabase.from('alumni').insert(insertPayload).select('id').single();
    }
    if (insertRes.error && insertRes.error.message?.includes('batch')) {
      delete insertPayload.batch;
      insertRes = await supabase.from('alumni').insert(insertPayload).select('id').single();
    }
    if (insertRes.error && insertRes.error.message?.includes('designation')) {
      delete insertPayload.designation;
      insertRes = await supabase.from('alumni').insert(insertPayload).select('id').single();
    }

    if (insertRes.error) {
      return { success: false, message: insertRes.error.message };
    }

    return {
      success: true,
      status: 'PENDING',
      alumni_id: insertRes.data?.id,
      message: 'Your registration has been submitted successfully and is awaiting committee review.',
    };
  } catch (err: any) {
    console.error('Alumni self-registration exception:', err);
    return { success: false, message: err?.message || 'An unexpected error occurred during submission.' };
  }
}

