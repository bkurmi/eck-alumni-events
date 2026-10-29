import { supabase } from './supabase';
import type { EventExpense } from '../types';

/**
 * Resolves the public URL for an expense receipt/bill screenshot.
 */
export function getPublicExpenseScreenshotUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const cleanPath = path.trim();
  if (!cleanPath) return null;
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) return cleanPath;
  const { data } = supabase.storage.from('payment-screenshots').getPublicUrl(cleanPath);
  return data?.publicUrl || null;
}

/**
 * Uploads an expense receipt/bill file to Supabase storage.
 */
export async function uploadExpenseReceipt(
  file: File,
  itemName: string,
  eventSlug = 'deepaura-2k26'
): Promise<string | null> {
  const cleanName = (itemName || 'expense').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
  const timestamp = Date.now();
  const fileExt = file.name.split('.').pop() || 'jpg';
  const cleanExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, '');
  const fileName = `expenses/${eventSlug}/${cleanName}_${timestamp}.${cleanExt}`;

  try {
    const { data, error } = await supabase.storage
      .from('payment-screenshots')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.error('[Expense Receipt Upload Error]:', error);
      throw error;
    }

    return data?.path || fileName;
  } catch (err) {
    console.error('Failed to upload expense receipt:', err);
    throw err;
  }
}

/**
 * Fetches all expenses, optionally filtered by event ID.
 */
export async function fetchExpensesFromDb(eventId?: string): Promise<EventExpense[]> {
  try {
    let query = supabase
      .from('event_expenses')
      .select('*')
      .order('created_at', { ascending: false });

    const isUUID =
      typeof eventId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId.trim());

    if (isUUID) {
      query = query.or(`event_id.eq.${eventId.trim()},event_id.is.null`);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[Expenses] Notice fetching expenses:', error.message);
      return [];
    }
    return (data as EventExpense[]) || [];
  } catch (err) {
    console.warn('[Expenses] Exception fetching expenses:', err);
    return [];
  }
}

/**
 * Saves (inserts or updates) an expense record.
 */
export async function saveExpenseToDb(
  expense: Partial<EventExpense>,
  receiptFile?: File | null,
  eventSlug = 'deepaura-2k26'
): Promise<EventExpense> {
  let receiptPath = expense.payment_screenshot_path || null;

  if (receiptFile) {
    const uploaded = await uploadExpenseReceipt(
      receiptFile,
      expense.item_name || 'expense',
      eventSlug
    );
    if (uploaded) {
      receiptPath = uploaded;
    }
  }

  const isUUID =
    typeof expense.event_id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expense.event_id.trim());

  const payload: any = {
    ...expense,
    event_id: isUUID ? expense.event_id?.trim() : null,
    expected_amount: Number(expense.expected_amount) || 0,
    actual_amount: Number(expense.actual_amount) || 0,
    status: expense.status || 'planned',
    payment_screenshot_path: receiptPath,
    updated_at: new Date().toISOString(),
  };

  // If new record without existing ID
  if (!payload.id) {
    delete payload.id;
    payload.created_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('event_expenses')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[Expense Insert Error]:', error);
      throw error;
    }
    return data as EventExpense;
  }

  // Update existing record
  const { data, error } = await supabase
    .from('event_expenses')
    .update(payload)
    .eq('id', payload.id)
    .select()
    .single();

  if (error) {
    console.error('[Expense Update Error]:', error);
    throw error;
  }

  return data as EventExpense;
}

/**
 * Deletes an expense item by ID.
 */
export async function deleteExpenseFromDb(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('event_expenses')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Expense Delete Error]:', error);
      throw error;
    }
    return true;
  } catch (err) {
    console.error('Failed to delete expense item:', err);
    throw err;
  }
}

/**
 * Helper to get icon for category.
 */
export function getExpenseCategoryIcon(category: string): string {
  switch (category) {
    case 'Catering & Food':
      return '🍽️';
    case 'Tent & Infrastructure':
      return '⛺';
    case 'Sound, DJ & Cultural':
      return '🎵';
    case 'Decorations & Lighting':
      return '✨';
    case 'Printing, Badges & ID Cards':
      return '🪪';
    case 'Mementos, Gifts & Souvenirs':
      return '🏆';
    case 'Photography & Videography':
      return '📸';
    case 'Venue, Electricity & Logistics':
      return '🏛️';
    case 'Marketing & Communication':
      return '📢';
    default:
      return '📦';
  }
}

/**
 * Formats currency in Indian Rupee style.
 */
export function formatINR(val: number): string {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(val);
}

/**
 * Generates an executive WhatsApp message summarizing expected vs real expenses and funding feasibility.
 */
export function buildExpensesWhatsAppMessage(
  expenses: EventExpense[],
  totalExpected: number,
  totalActual: number,
  eventName = 'ECK-RTU Alumni DeepAura 2K26',
  totalAvailableFunds = 0,
  registrationAmount = 0,
  sponsorshipAmount = 0,
  attendingRegistrationCount = 0,
  totalHeadcount = 0
): string {
  const fundingGap = totalAvailableFunds - totalExpected;
  const isDeficit = fundingGap < 0;
  const coveragePct =
    totalExpected > 0 ? Math.round((totalAvailableFunds / totalExpected) * 100) : 100;
  const liveCash = totalAvailableFunds - totalActual;

  const header = `📊 *EVENT BUDGET & EXPENSE FEASIBILITY REPORT*\n*Event:* ${eventName}\n📅 Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const attendingDetails = attendingRegistrationCount > 0
    ? ` (${attendingRegistrationCount} attending${totalHeadcount > 0 ? `, 👥 ${totalHeadcount} headcount` : ''})`
    : '';

  const costPerHead = totalHeadcount > 0 && totalExpected > 0
    ? ` (~₹${formatINR(Math.round(totalExpected / totalHeadcount))}/head for ${totalHeadcount} guests)`
    : '';

  const fundingSection = totalAvailableFunds > 0
    ? `\n💰 *FUNDS & BUDGET FEASIBILITY:*\n• *Available Inflow:* ₹${formatINR(totalAvailableFunds)} (Regs: ₹${formatINR(registrationAmount)}${attendingDetails} + Sponsors: ₹${formatINR(sponsorshipAmount)})\n• *Planned Budget:* ₹${formatINR(totalExpected)}${costPerHead}\n• *Funding Status:* ${isDeficit ? `🚨 Deficit of -₹${formatINR(Math.abs(fundingGap))} (${coveragePct}% funded)` : `✅ Fully Funded (+₹${formatINR(fundingGap)} surplus)`}\n• *Real Paid Outflow:* ₹${formatINR(totalActual)}\n• *Live Cash Balance:* ₹${formatINR(liveCash)}`
    : `\n💰 *EXPENSE OVERVIEW:*\n• *Expected Budget:* ₹${formatINR(totalExpected)}\n• *Actual Paid:* ₹${formatINR(totalActual)}`;

  // Itemized listing
  const itemsText = expenses
    .map((item, idx) => {
      const diff = item.expected_amount - item.actual_amount;
      const diffLabel =
        item.actual_amount === 0
          ? '⏳ Pending'
          : diff >= 0
          ? `(₹${formatINR(diff)} saved)`
          : `(₹${formatINR(Math.abs(diff))} over)`;
      const icon = getExpenseCategoryIcon(item.category);
      const statusEmoji =
        item.status === 'settled' || item.status === 'paid'
          ? '✅'
          : item.status === 'partially_paid'
          ? '🟡'
          : '📝';
      const formattedPhone = item.vendor_phone
        ? (item.vendor_phone.startsWith('+91')
            ? item.vendor_phone
            : `+91 ${item.vendor_phone.replace(/\D/g, '').slice(-10)}`)
        : '';
      const vendorDetails = [item.vendor_name, formattedPhone].filter(Boolean).join(' - ');
      const vendorInfo = vendorDetails ? ` [${vendorDetails}]` : '';

      return `${idx + 1}. ${icon} *${item.item_name}*${vendorInfo}\n   Expected: ₹${formatINR(item.expected_amount)} | Actual: ₹${formatINR(item.actual_amount)} ${diffLabel} ${statusEmoji}`;
    })
    .join('\n\n');

  const footer = `\n\n📌 _Generated from ECK-RTU Alumni Central Portal._`;

  return `${header}\n${fundingSection}\n\n📋 *ITEMIZED EXPENSES (${expenses.length}):*\n${itemsText}${footer}`;
}
