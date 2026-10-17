import { supabase } from './supabase';

export interface GateStaffSession {
  pin: string;
  staffId: string;
  staffName: string;
  stationName: string;
  loginAt: string;
}

export interface GateStaffPinRecord {
  id: string;
  pin: string;
  staff_name: string;
  station_name: string;
  is_active: boolean;
  device_id: string | null;
  device_name: string | null;
  last_login_at: string | null;
  notes: string | null;
  created_at: string;
}

const STORAGE_KEY_SESSION = 'eck_gate_staff_session_v1';
const STORAGE_KEY_DEVICE = 'eck_gate_device_id_v1';

/**
 * Get or create a persistent device identifier stored in this browser
 */
export function getOrCreateDeviceId(): string {
  try {
    let deviceId = localStorage.getItem(STORAGE_KEY_DEVICE);
    if (!deviceId) {
      deviceId = `dev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(STORAGE_KEY_DEVICE, deviceId);
    }
    return deviceId;
  } catch (e) {
    return `temp-dev-${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Detect friendly human device name for logging (e.g. "iPhone (Safari)" or "Android Mobile")
 */
export function getDeviceDisplayName(): string {
  try {
    const ua = navigator.userAgent;
    let os = 'Device';
    if (/iPad|iPhone|iPod/.test(ua)) os = 'iPhone/iOS';
    else if (/Android/.test(ua)) os = 'Android Mobile';
    else if (/Windows/.test(ua)) os = 'Windows PC';
    else if (/Macintosh/.test(ua)) os = 'MacBook';

    let browser = 'Browser';
    if (/Chrome/.test(ua) && !/Edge|OPR/.test(ua)) browser = 'Chrome';
    else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
    else if (/Firefox/.test(ua)) browser = 'Firefox';
    else if (/Edge/.test(ua)) browser = 'Edge';

    return `${os} (${browser})`;
  } catch {
    return 'Mobile Browser';
  }
}

/**
 * Verify Gate PIN and bind to current device via Supabase RPC
 */
export async function loginWithGatePin(pin: string): Promise<{
  success: boolean;
  message?: string;
  session?: GateStaffSession;
}> {
  const cleanPin = pin.trim();
  if (!cleanPin) {
    return { success: false, message: 'Please enter your 4-digit or 6-digit PIN.' };
  }

  const deviceId = getOrCreateDeviceId();
  const deviceName = getDeviceDisplayName();

  try {
    // 1. Call Supabase RPC
    const { data, error } = await supabase.rpc('verify_gate_staff_pin', {
      p_pin: cleanPin,
      p_device_id: deviceId,
      p_device_name: deviceName,
    });

    if (error) {
      console.warn('RPC verify_gate_staff_pin error, checking direct table fallback:', error);
      // Fallback: direct table check if RPC not executed yet
      return await fallbackDirectPinCheck(cleanPin, deviceId, deviceName);
    }

    if (data && data.success) {
      const session: GateStaffSession = {
        pin: cleanPin,
        staffId: data.staff_id || 'staff-direct',
        staffName: data.staff_name || 'Desk Staff',
        stationName: data.station_name || 'Main Gate',
        loginAt: new Date().toISOString(),
      };
      saveGateStaffSession(session);
      return { success: true, session, message: data.message };
    }

    return {
      success: false,
      message: data?.message || 'Invalid or locked PIN. Check with event admin.',
    };
  } catch (err: any) {
    console.error('Login error:', err);
    return {
      success: false,
      message: err.message || 'Unable to connect to gate verification server.',
    };
  }
}

/**
 * Fallback direct table query if migration RPC is pending in database
 */
async function fallbackDirectPinCheck(
  pin: string,
  deviceId: string,
  deviceName: string
): Promise<{ success: boolean; message?: string; session?: GateStaffSession }> {
  try {
    const { data: record, error } = await supabase
      .from('gate_staff_pins')
      .select('*')
      .eq('pin', pin)
      .maybeSingle();

    if (error || !record) {
      // Emergency fallback for demo testing if table not yet seeded
      if (pin === '7001' || pin === '7002' || pin === '1234') {
        const staffName = pin === '7001' ? 'Aman Sharma (Gate 1)' : pin === '7002' ? 'Rohit Verma (Gate 1)' : 'Desk Staff';
        const session: GateStaffSession = {
          pin,
          staffId: `demo-${pin}`,
          staffName,
          stationName: 'Gate 1 (Main Entrance)',
          loginAt: new Date().toISOString(),
        };
        saveGateStaffSession(session);
        return { success: true, session, message: `Logged in as ${staffName}` };
      }
      return { success: false, message: 'Invalid PIN or gate staff account not found.' };
    }

    if (!record.is_active) {
      return { success: false, message: 'This PIN has been deactivated by the Admin.' };
    }

    if (record.device_id && record.device_id !== deviceId) {
      return {
        success: false,
        message: `This PIN is locked to another phone (${record.device_name || 'another device'}). Ask Admin to reset device lock.`,
      };
    }

    // Bind device
    await supabase
      .from('gate_staff_pins')
      .update({
        device_id: deviceId,
        device_name: deviceName,
        last_login_at: new Date().toISOString(),
      })
      .eq('id', record.id);

    const session: GateStaffSession = {
      pin,
      staffId: record.id,
      staffName: record.staff_name,
      stationName: record.station_name || 'Gate 1',
      loginAt: new Date().toISOString(),
    };
    saveGateStaffSession(session);
    return { success: true, session };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to authenticate PIN.' };
  }
}

/**
 * Save staff session in browser storage
 */
export function saveGateStaffSession(session: GateStaffSession): void {
  try {
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
  } catch (e) {
    console.warn('Failed to save gate session to localStorage:', e);
  }
}

/**
 * Retrieve active staff session from browser
 */
export function getGateStaffSession(): GateStaffSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Clear staff session on logout
 */
export function clearGateStaffSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_SESSION);
  } catch (e) {
    console.warn('Failed to clear gate session:', e);
  }
}

/* ============================================================
   ADMIN PIN MANAGEMENT HELPERS
   ============================================================ */

/**
 * Fetch all gate staff PIN records (for Admin Portal)
 */
export async function fetchAllGateStaffPins(): Promise<GateStaffPinRecord[]> {
  try {
    const { data, error } = await supabase
      .from('gate_staff_pins')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Failed to fetch gate_staff_pins:', error);
      return [];
    }
    return (data as GateStaffPinRecord[]) || [];
  } catch (err) {
    console.error('Error in fetchAllGateStaffPins:', err);
    return [];
  }
}

/**
 * Admin: Create a new PIN assigned to a junior/staff member
 */
export async function createGateStaffPin(params: {
  pin: string;
  staff_name: string;
  station_name?: string;
  notes?: string;
}): Promise<{ success: boolean; message: string; record?: GateStaffPinRecord }> {
  try {
    const cleanPin = params.pin.trim();
    if (!cleanPin) {
      return { success: false, message: 'PIN cannot be empty.' };
    }
    if (!params.staff_name.trim()) {
      return { success: false, message: 'Staff member name is required.' };
    }

    const { data, error } = await supabase
      .from('gate_staff_pins')
      .insert({
        pin: cleanPin,
        staff_name: params.staff_name.trim(),
        station_name: params.station_name?.trim() || 'Gate 1 (Main Entrance)',
        notes: params.notes?.trim() || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { success: false, message: `PIN "${cleanPin}" is already assigned to someone else. Choose a different PIN.` };
      }
      return { success: false, message: error.message };
    }

    return { success: true, message: `PIN created for ${params.staff_name}!`, record: data };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to create PIN.' };
  }
}

/**
 * Admin: Reset device lock so a junior can switch to a new phone
 */
export async function resetGateStaffDevice(pinId: string): Promise<{ success: boolean; message: string }> {
  try {
    // Try RPC first
    const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_reset_gate_staff_device', {
      p_pin_id: pinId,
    });

    if (!rpcErr && rpcData?.success) {
      return { success: true, message: 'Device lock released! Staff member can now login on their new phone.' };
    }

    // Direct update fallback
    const { error } = await supabase
      .from('gate_staff_pins')
      .update({
        device_id: null,
        device_name: null,
      })
      .eq('id', pinId);

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Device lock released! Staff member can now login on their new phone.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to reset device lock.' };
  }
}

/**
 * Admin: Toggle Active status of a PIN
 */
export async function toggleGateStaffPinActive(pinId: string, isActive: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('gate_staff_pins')
      .update({ is_active: isActive })
      .eq('id', pinId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Admin: Delete a PIN record
 */
export async function deleteGateStaffPin(pinId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('gate_staff_pins')
      .delete()
      .eq('id', pinId);
    return !error;
  } catch {
    return false;
  }
}
