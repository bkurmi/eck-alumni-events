import { supabase } from './supabase';
import type { Sponsorship } from '../types';

/**
 * Resolves the public URL for a sponsorship payment screenshot.
 */
export function getPublicSponsorshipScreenshotUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const cleanPath = path.trim();
  if (!cleanPath) return null;
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) return cleanPath;
  const { data } = supabase.storage.from('payment-screenshots').getPublicUrl(cleanPath);
  return data?.publicUrl || null;
}

/**
 * Uploads a sponsorship payment screenshot to Supabase storage.
 */
export async function uploadSponsorshipScreenshot(
  file: File,
  sponsorName: string,
  eventSlug = 'deepaura-2k26'
): Promise<string | null> {
  const cleanName = (sponsorName || 'sponsor').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
  const timestamp = Date.now();
  const fileExt = file.name.split('.').pop() || 'jpg';
  const cleanExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, '');
  const fileName = `sponsorships/${eventSlug}/${cleanName}_${timestamp}.${cleanExt}`;

  try {
    const { data, error } = await supabase.storage
      .from('payment-screenshots')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.error('[Sponsorship Upload Error]:', error);
      throw error;
    }

    return data?.path || fileName;
  } catch (err) {
    console.error('Failed to upload sponsorship screenshot:', err);
    throw err;
  }
}

/**
 * Fetches all sponsorships, optionally filtered by event ID.
 */
export async function fetchSponsorshipsFromDb(eventId?: string): Promise<Sponsorship[]> {
  try {
    let query = supabase
      .from('event_sponsorships')
      .select('*')
      .order('created_at', { ascending: false });

    if (eventId) {
      query = query.or(`event_id.eq.${eventId},event_id.is.null`);
    }

    const { data, error } = await query;
    if (error) {
      // If table doesn't exist yet, return empty list gracefully
      console.warn('[Sponsorships] Notice fetching sponsorships:', error.message);
      return [];
    }
    return (data as Sponsorship[]) || [];
  } catch (err) {
    console.warn('[Sponsorships] Exception fetching sponsorships:', err);
    return [];
  }
}

/**
 * Saves (inserts or updates) a sponsorship record.
 */
export async function saveSponsorshipToDb(
  sponsorship: Partial<Sponsorship>,
  screenshotFile?: File | null,
  eventSlug = 'deepaura-2k26'
): Promise<Sponsorship> {
  let screenshotPath = sponsorship.payment_screenshot_path || null;

  if (screenshotFile) {
    const uploaded = await uploadSponsorshipScreenshot(
      screenshotFile,
      sponsorship.sponsor_name || 'sponsor',
      eventSlug
    );
    if (uploaded) {
      screenshotPath = uploaded;
    }
  }

  const payload: any = {
    ...sponsorship,
    amount: Number(sponsorship.amount) || 0,
    payment_screenshot_path: screenshotPath,
    updated_at: new Date().toISOString(),
  };

  // If new record without ID
  if (!payload.id) {
    delete payload.id;
    payload.created_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('event_sponsorships')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[Sponsorships] Error inserting sponsorship:', error);
      throw error;
    }
    return data as Sponsorship;
  } else {
    const { data, error } = await supabase
      .from('event_sponsorships')
      .update(payload)
      .eq('id', payload.id)
      .select()
      .single();

    if (error) {
      console.error('[Sponsorships] Error updating sponsorship:', error);
      throw error;
    }
    return data as Sponsorship;
  }
}

/**
 * Deletes a sponsorship record by ID.
 */
export async function deleteSponsorshipFromDb(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('event_sponsorships')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Sponsorships] Error deleting sponsorship:', error);
      throw error;
    }
    return true;
  } catch (err) {
    console.error('[Sponsorships] Exception deleting sponsorship:', err);
    throw err;
  }
}

/**
 * Builds a friendly WhatsApp acknowledgment message for a sponsor.
 */
export function buildSponsorWhatsAppMessage(
  sponsor: Sponsorship,
  eventName = 'ECK-RTU Alumni DeepAura 2K26'
): string {
  const name = sponsor.sponsor_name || 'Esteemed Patron';
  const amountStr = sponsor.amount > 0 ? `₹${Number(sponsor.amount).toLocaleString('en-IN')}` : 'Sponsorship Contribution';

  const lines = [
    `🪔✨ *ECK-RTU ALUMNI ASSOCIATION* ✨🪔`,
    `🙏 *Heartfelt Thanks for Your Sponsorship & Support!*`,
    '',
    `Dear *${name}*,`,
    `We gratefully acknowledge your generous sponsorship contribution of *${amountStr}* for *${eventName}*.`,
    '',
    sponsor.receiving_upi_id ? `💳 *Credited Account:* ${sponsor.receiving_upi_id}` : '',
    sponsor.notes ? `📝 *Notes:* ${sponsor.notes}` : '',
    '',
    `Your kind patronage fuels alumni bonding and strengthens our alma mater's legacy.`,
    '',
    `Warm regards,`,
    `*Organising Committee, ECK-RTU Alumni Kota Chapter*`,
    `“दीप जले, यादें मुस्कुराएँ।” 🪔`,
  ];

  return lines.filter(Boolean).join('\n');
}

/**
 * Builds a comprehensive WhatsApp summary message for all sponsorships.
 */
export function buildAllSponsorshipsWhatsAppMessage(
  sponsorships: Sponsorship[],
  totalAmount: number,
  eventName = 'ECK-RTU Alumni DeepAura 2K26'
): string {
  const lines = [
    `💎✨ *${eventName} — Sponsorships Summary* ✨💎`,
    `📊 *Total Sponsors:* ${sponsorships.length}`,
    `💰 *Total Collected:* ₹${totalAmount.toLocaleString('en-IN')}`,
    `📅 *Generated On:* ${new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })}`,
    '',
    `*Sponsorship Details:*`,
  ];

  sponsorships.forEach((s, idx) => {
    const name = s.sponsor_name || 'Contributor';
    const amount = `₹${Number(s.amount || 0).toLocaleString('en-IN')}`;
    const upi = s.receiving_upi_id ? ` [${s.receiving_upi_id}]` : '';
    const contact = s.contact_person ? ` • 👤 ${s.contact_person}` : '';
    const phone = s.contact_phone ? ` (${s.contact_phone})` : '';
    lines.push(`${idx + 1}. *${name}* — ${amount}${upi}${contact}${phone}`);
    if (s.notes) {
      lines.push(`   📝 _${s.notes}_`);
    }
  });

  lines.push('');
  lines.push(`🪔 *Organising Committee, ECK-RTU Alumni Kota Chapter*`);

  return lines.join('\n');
}
