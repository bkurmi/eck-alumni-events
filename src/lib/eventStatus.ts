import { supabase } from './supabase';
import type { ECKEvent } from '../types';

/**
 * Event Registration Deadline & Status Management
 * 
 * Deadline is stored in the database `events.registration_closes_at` column.
 * Defaults to 31st October 2026 post 6:00 PM IST (2026-10-31 18:00:00+05:30).
 * Any change made directly in the database is reflected live immediately!
 */

export const DEFAULT_DEADLINE_ISO = '2026-10-30T23:59:59+05:30';

/**
 * Resolves registration deadline date from event database record.
 */
export function getRegistrationDeadline(event?: ECKEvent | null): Date {
  const raw = event?.registration_closes_at;
  if (raw && typeof raw === 'string' && raw.trim()) {
    let dateStr = raw.trim();
    if (!dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.slice(10).includes('-')) {
      dateStr = `${dateStr}+05:30`;
    }
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(DEFAULT_DEADLINE_ISO);
}

/**
 * Check whether normal user registration has closed.
 * True if event.status is explicitly 'CLOSED' or current time >= registration_closes_at.
 */
export function isRegistrationClosed(event?: ECKEvent | null, now: Date = new Date()): boolean {
  if (event && event.status === 'CLOSED') {
    return true;
  }
  const deadline = getRegistrationDeadline(event);
  return now.getTime() >= deadline.getTime();
}

/**
 * Returns complete registration status info, deadline formatted string, and countdown text.
 */
export function getRegistrationStatusInfo(event?: ECKEvent | null, now: Date = new Date()) {
  const deadline = getRegistrationDeadline(event);
  const isTimePassed = now.getTime() >= deadline.getTime();
  const isClosed = (event && event.status === 'CLOSED') || isTimePassed;

  // Formatted deadline in Indian Standard Time
  const formattedDeadline = deadline.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

  const diffMs = deadline.getTime() - now.getTime();
  let timeRemainingText = '';
  if (isClosed) {
    timeRemainingText = 'Registration closed';
  } else {
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) {
      timeRemainingText = `${days} day${days > 1 ? 's' : ''}, ${hours} hr${hours > 1 ? 's' : ''} remaining`;
    } else if (hours > 0) {
      timeRemainingText = `${hours} hour${hours > 1 ? 's' : ''}, ${mins} min remaining`;
    } else {
      timeRemainingText = `${Math.max(1, mins)} minute${mins > 1 ? 's' : ''} remaining`;
    }
  }

  return {
    isClosed,
    status: (isClosed ? 'CLOSED' : 'OPEN') as 'OPEN' | 'CLOSED',
    deadline,
    deadlineIso: deadline.toISOString(),
    formattedDeadline: `${formattedDeadline} IST`,
    timeRemainingText,
  };
}

/**
 * Synchronizes the event's registration status ('OPEN' or 'CLOSED') with the Supabase `events` table.
 * If current time >= deadline, ensures status is 'CLOSED'.
 * If database admin changes status directly, it respects that status.
 */
export async function syncEventRegistrationStatus(
  eventSlug: string = 'deepaura-2k26',
  currentKnownStatus?: string,
  eventDeadline?: string | null
): Promise<'OPEN' | 'CLOSED'> {
  const dummyEvent: Partial<ECKEvent> = {
    registration_closes_at: eventDeadline || null,
    status: currentKnownStatus as any,
  };
  const info = getRegistrationStatusInfo(dummyEvent as ECKEvent);
  const expectedStatus = info.status;

  // If status is already up to date, skip database write
  if (currentKnownStatus && currentKnownStatus === expectedStatus) {
    return expectedStatus;
  }

  try {
    // 1. Try Security Definer RPC first (bypasses RLS for anon and auth)
    const { error: rpcError } = await supabase.rpc('sync_event_registration_status', {
      p_event_slug: eventSlug,
      p_status: expectedStatus,
    });

    if (!rpcError) {
      return expectedStatus;
    }
  } catch (_) {
    // Fallback to direct update
  }

  try {
    // 2. Direct table update fallback
    await supabase
      .from('events')
      .update({
        status: expectedStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('event_slug', eventSlug);
  } catch (tableErr) {
    console.warn('[syncEventRegistrationStatus warning]:', tableErr);
  }

  return expectedStatus;
}
