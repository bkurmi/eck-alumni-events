import { supabase } from './supabase';
import { cleanMobileNumber } from './registrations';
import type { GateEntry, GateVerificationResult } from '../types';

/**
 * Feature flag helpers checking Vite environment variables
 */
export const isAlumniIdCardsEnabled = (): boolean => {
  return import.meta.env.VITE_ENABLE_ALUMNI_ID_CARDS === 'true';
};

export const isAdminGatePortalEnabled = (): boolean => {
  return import.meta.env.VITE_ENABLE_ADMIN_GATE_PORTAL === 'true';
};

/**
 * Native Web Audio sound synthesizers for instant gate auditory feedback.
 * No external mp3 files required.
 */
export const playGateSound = (type: 'success' | 'warning' | 'error'): void => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === 'success') {
      // Pleasant high-pitch double chime (880Hz -> 1320Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
      gain1.gain.setValueAtTime(0.3, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.25);
    } else if (type === 'warning') {
      // Urgent double beep (440Hz -> 330Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(330, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else {
      // Low error buzz (180Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (err) {
    // Audio synthesis not critical; silently pass
  }
};

/**
 * Compresses an image file client-side to max 800px width/height and ~90KB size
 * completely free without heavy external dependencies.
 */
export async function compressAttendeePhoto(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_SIZE = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas to Blob conversion failed'));
            }
          },
          'image/jpeg',
          0.82
        );
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads compressed photo to Supabase Storage bucket 'id-photos'
 * and updates the attendee's registration record.
 */
export async function uploadAndSaveAttendeePhoto(
  registrationId: string,
  phone: string,
  imageBlob: Blob
): Promise<{ success: boolean; photoUrl?: string; error?: string }> {
  try {
    const clean = cleanMobileNumber(phone);
    const fileName = `${clean}_${registrationId.slice(0, 8)}_${Date.now()}.jpg`;

    // 1. Upload to Supabase Storage bucket 'id-photos'
    const { error: uploadError } = await supabase.storage
      .from('id-photos')
      .upload(fileName, imageBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    let photoUrl = '';
    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage
        .from('id-photos')
        .getPublicUrl(fileName);
      photoUrl = publicUrlData?.publicUrl || '';
    } else {
      console.warn('Supabase storage upload notice:', uploadError);
      // Fallback: convert to small base64 data URL if storage bucket is not yet created
      photoUrl = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result as string);
        r.readAsDataURL(imageBlob);
      });
    }

    // 2. Update registration record with photo_url and id_card_generated
    try {
      const { error: rpcError } = await supabase.rpc('update_attendee_photo_card', {
        p_registration_id: registrationId,
        p_photo_url: photoUrl,
      });

      if (rpcError) {
        // Fallback direct table update
        await supabase
          .from('event_registrations')
          .update({
            photo_url: photoUrl,
            id_card_generated: true,
            id_card_generated_at: new Date().toISOString(),
          })
          .eq('id', registrationId);
      }
    } catch (dbErr) {
      console.warn('Direct update notice:', dbErr);
    }

    return { success: true, photoUrl };
  } catch (err: any) {
    console.error('Failed to upload attendee photo:', err);
    return { success: false, error: err?.message || 'Failed to process photo' };
  }
}

/**
 * Verifies an attendee at the gate using their scanned QR code phone number or manual input.
 */
export async function verifyGateAttendee(
  phone: string,
  verifiedBy = 'Gate Staff',
  entryMode: 'qr_scan' | 'manual_phone' | 'spot_registration' = 'qr_scan'
): Promise<GateVerificationResult> {
  const cleanPhone = cleanMobileNumber(phone);
  if (cleanPhone.length < 10) {
    playGateSound('error');
    return {
      success: false,
      status: 'INVALID_PHONE',
      message: 'Please enter a valid 10-digit mobile number.',
    };
  }

  // 1. Primary: Try high-speed atomic RPC function
  try {
    const { data, error } = await supabase.rpc('verify_and_log_gate_entry', {
      p_phone_number: cleanPhone,
      p_verified_by: verifiedBy,
      p_entry_mode: entryMode,
    });

    if (!error && data) {
      const result = data as GateVerificationResult;
      if (result.success) {
        playGateSound('success');
      } else if (result.status === 'ALREADY_ENTERED') {
        playGateSound('warning');
      } else {
        playGateSound('error');
      }
      return result;
    }
  } catch (rpcErr) {
    console.warn('RPC verify_and_log_gate_entry notice:', rpcErr);
  }

  // 2. Secondary Fallback: Direct table operations if migration not executed yet
  try {
    // A. Check Alumni
    const { data: alumni } = await supabase
      .from('alumni')
      .select('*')
      .eq('mobile', cleanPhone)
      .maybeSingle();

    if (!alumni) {
      playGateSound('error');
      return {
        success: false,
        status: 'NOT_FOUND',
        message: `No registration found for mobile: ${cleanPhone}`,
      };
    }

    // B. Check Registration
    const { data: reg } = await supabase
      .from('event_registrations')
      .select(`
        *,
        payment_verifications (*)
      `)
      .eq('alumni_id', alumni.id)
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (!reg) {
      playGateSound('error');
      return {
        success: false,
        status: 'NOT_FOUND',
        message: `No event registration found for ${alumni.name}`,
      };
    }

    // C. Check Gate Entries table for duplicate check
    const { data: existingGate } = await supabase
      .from('gate_entries')
      .select('*')
      .eq('registration_id', reg.id)
      .maybeSingle();

    if (existingGate) {
      playGateSound('warning');
      return {
        success: false,
        status: 'ALREADY_ENTERED',
        message: `Attendee already entered at ${new Date(existingGate.entered_at).toLocaleTimeString()}`,
        attendee_name: alumni.name,
        registration_number: reg.registration_number,
        phone_number: cleanPhone,
        entered_at: existingGate.entered_at,
        verified_by: existingGate.verified_by,
      };
    }

    // D. Check Payment Status
    const isPaid =
      reg.attendance_status === 'yes' ||
      reg.payment_verifications?.some((v: any) => v.verified_status === 'VERIFIED');

    if (!isPaid) {
      playGateSound('error');
      return {
        success: false,
        status: 'PAYMENT_PENDING',
        message: 'Payment is pending or unapproved. Collect payment at helpdesk.',
        attendee_name: alumni.name,
        registration_number: reg.registration_number,
        phone_number: cleanPhone,
        amount: reg.amount,
      };
    }

    // E. Insert Gate Entry
    const { data: newGateEntry, error: insertErr } = await supabase
      .from('gate_entries')
      .insert({
        registration_id: reg.id,
        event_id: reg.event_id,
        phone_number: cleanPhone,
        attendee_name: alumni.name,
        badge_category: alumni.professional_category || 'Alumnus',
        branch: alumni.engineering_discipline,
        year_of_passing: alumni.year_of_passing,
        accompanying_count: reg.number_of_attendees || 1,
        payment_status: 'VERIFIED',
        entry_mode: entryMode,
        verified_by: verifiedBy,
        entered_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!insertErr && newGateEntry) {
      playGateSound('success');
      return {
        success: true,
        status: 'ENTERED',
        message: `Verified and entry logged for ${alumni.name}`,
        gate_entry_id: newGateEntry.id,
        registration_id: reg.id,
        registration_number: reg.registration_number,
        attendee_name: alumni.name,
        phone_number: cleanPhone,
        badge_category: alumni.professional_category || 'Alumnus',
        branch: alumni.engineering_discipline,
        year_of_passing: alumni.year_of_passing,
        number_of_attendees: reg.number_of_attendees,
        adults_count: reg.adults_count,
        children_above_7_count: reg.children_above_7_count,
        photo_url: reg.photo_url,
      };
    }
  } catch (err: any) {
    console.error('Direct gate verification check failure:', err);
  }

  playGateSound('error');
  return {
    success: false,
    status: 'ERROR',
    message: 'Verification check failed. Please retry.',
  };
}

/**
 * Quick spot registration at gate
 */
export async function spotRegisterAtGate(params: {
  name: string;
  mobile: string;
  discipline: string;
  year_of_passing: number;
  numberOfAttendees: number;
  paymentMode: 'CASH' | 'UPI_SPOT' | 'COMPLIMENTARY' | string;
  amount: number;
  verifiedBy: string;
  eventSlug?: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('spot_register_at_gate', {
      p_event_slug: params.eventSlug || 'deepaura-2k26',
      p_name: params.name,
      p_mobile: params.mobile,
      p_discipline: params.discipline,
      p_year_of_passing: params.year_of_passing,
      p_number_of_attendees: params.numberOfAttendees,
      p_payment_mode: params.paymentMode,
      p_amount: params.amount,
      p_verified_by: params.verifiedBy,
    });

    if (!error && data?.success) {
      playGateSound('success');
      return { success: true, data };
    }
    return { success: false, error: error?.message || 'Spot registration failed' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Spot registration failed' };
  }
}

/**
 * Fetch all gate entries for live statistics and gate table
 */
export async function fetchGateEntries(): Promise<GateEntry[]> {
  try {
    const { data, error } = await supabase
      .from('gate_entries')
      .select(`
        *,
        registration:registration_id (
          id,
          registration_number,
          attendance_status,
          number_of_attendees,
          adults_count,
          children_above_7_count,
          amount,
          photo_url,
          alumni:alumni_id (*)
        )
      `)
      .order('entered_at', { ascending: false });

    if (error) {
      console.warn('fetchGateEntries error:', error);
      return [];
    }
    return (data as GateEntry[]) || [];
  } catch (err) {
    console.warn('fetchGateEntries exception:', err);
    return [];
  }
}

export interface GatePortalStats {
  totalRegistered: number;
  totalPaid: number;
  totalNotPaid: number;
  totalIdCardsGenerated: number;
  totalVerifiedAtGate: number;
  totalHeadsInside: number;
  turnoutPercent: number;
}

/**
 * Fetch aggregated gate dashboard statistics directly via high-speed RPC
 * Works seamlessly for both PIN-authenticated gate staff (anon) and Admin.
 */
export async function fetchGateStats(): Promise<GatePortalStats | null> {
  try {
    const { data, error } = await supabase.rpc('get_gate_dashboard_stats');
    if (!error && data) {
      return data as GatePortalStats;
    }
    if (error) {
      console.warn('RPC get_gate_dashboard_stats notice:', error.message);
    }
  } catch (err) {
    console.warn('fetchGateStats exception:', err);
  }
  return null;
}
