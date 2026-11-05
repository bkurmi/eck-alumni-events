import { supabase } from './supabase';
import type { EventExpense, ExpensePaymentSplit } from '../types';

export interface ExpenseAccountOption {
  id: string;
  label: string;
  accountName: string;
  bankName: string;
  upiId?: string;
  isCash?: boolean;
}

export const KNOWN_EXPENSE_ACCOUNTS: ExpenseAccountOption[] = [
  { id: 'Cash in Hand', label: '💵 Cash in Hand / Spot Cash', accountName: 'Cash in Hand', bankName: 'Cash', isCash: true },
];

/**
 * Extracts normalized payment splits from an expense record.
 */
export function getExpenseSplits(expense: EventExpense): ExpensePaymentSplit[] {
  if (Array.isArray(expense.payment_splits) && expense.payment_splits.length > 0) {
    const valid = expense.payment_splits.filter((s) => Number(s.amount) > 0);
    if (valid.length > 0) return valid;
  }
  if (expense.paid_from_account && Number(expense.actual_amount || 0) > 0) {
    return [
      {
        account: expense.paid_from_account,
        amount: Number(expense.actual_amount || 0),
        date: expense.payment_date || null,
        mode: expense.payment_mode || null,
        note: expense.status === 'partially_paid' ? 'Advance Payment' : null,
      },
    ];
  }
  return [];
}

/**
 * Formats a friendly label and splits for an expense's payer.
 */
export function formatExpensePayerSummary(expense: EventExpense): {
  primaryLabel: string;
  isSplit: boolean;
  splits: ExpensePaymentSplit[];
} {
  const splits = getExpenseSplits(expense);
  if (splits.length === 0) {
    return {
      primaryLabel: expense.paid_from_account || '⚠️ Unassigned',
      isSplit: false,
      splits: [],
    };
  }
  if (splits.length === 1) {
    return {
      primaryLabel: splits[0].account,
      isSplit: false,
      splits,
    };
  }
  return {
    primaryLabel: `🔀 Split (${splits.length} accounts)`,
    isSplit: true,
    splits,
  };
}

export interface AccountSettlement {
  accountId: string;
  accountName: string;
  label: string;
  bankName: string;
  upiId?: string;
  isCash?: boolean;
  inflow: number; // collected from regs & sponsors
  outflow: number; // disbursed for real expenses
  transferredIn?: number; // internal transfers received from other coordinators
  transferredOut?: number; // internal transfers sent to other coordinators
  netBalance: number; // inflow + transferredIn - outflow - transferredOut
  status: 'surplus' | 'deficit' | 'settled';
  expenseCount: number;
  transferCount?: number;
}

/**
 * Resolves the in-hand available balance for a given account name or label from settlements.
 */
export function getAccountInHandBalance(
  accountIdentifier: string,
  settlements: AccountSettlement[]
): {
  inflow: number;
  outflow: number;
  transferredIn: number;
  transferredOut: number;
  netBalance: number;
  matched: AccountSettlement | null;
} {
  const clean = (accountIdentifier || '').toLowerCase().trim();
  if (!clean || clean.includes('unassigned') || clean === 'other') {
    return { inflow: 0, outflow: 0, transferredIn: 0, transferredOut: 0, netBalance: 0, matched: null };
  }

  const found = settlements.find((s) => {
    const sid = s.accountId.toLowerCase();
    const sname = s.accountName.toLowerCase();
    const slabel = s.label.toLowerCase();
    return (
      clean === sid ||
      clean === slabel ||
      clean.includes(sname) ||
      slabel.includes(clean)
    );
  });

  if (found) {
    return {
      inflow: found.inflow,
      outflow: found.outflow,
      transferredIn: found.transferredIn || 0,
      transferredOut: found.transferredOut || 0,
      netBalance: found.netBalance,
      matched: found,
    };
  }

  return { inflow: 0, outflow: 0, transferredIn: 0, transferredOut: 0, netBalance: 0, matched: null };
}

/**
 * Computes live Inflow vs Outflow vs Net Balance for all individual accounts.
 */
export function computeAccountSettlements(
  expenses: EventExpense[],
  registrations: any[] = [],
  verifications: any[] = [],
  sponsorships: any[] = [],
  customAccounts?: ExpenseAccountOption[]
): {
  accounts: AccountSettlement[];
  unassignedExpenseTotal: number;
  totalInflow: number;
  totalOutflow: number;
  netEventBalance: number;
} {
  // 1. Build combined known accounts list (defaults + event specific custom accounts)
  const allKnownAccounts: ExpenseAccountOption[] = [...KNOWN_EXPENSE_ACCOUNTS];
  if (Array.isArray(customAccounts) && customAccounts.length > 0) {
    customAccounts.forEach((c) => {
      if (!allKnownAccounts.some((k) => k.id.toLowerCase() === c.id.toLowerCase())) {
        allKnownAccounts.push(c);
      }
    });
  }

  // 2. Map verifications by registration_id
  const verifByRegId = new Map<string, any>();
  verifications.forEach((v) => {
    verifByRegId.set(v.registration_id, v);
  });

  // 3. Initialize settlement data for known accounts
  const settlementsMap = new Map<string, AccountSettlement>();
  allKnownAccounts.forEach((acc) => {
    settlementsMap.set(acc.id.toLowerCase(), {
      accountId: acc.id,
      accountName: acc.accountName,
      label: acc.label,
      bankName: acc.bankName,
      upiId: acc.upiId,
      isCash: acc.isCash,
      inflow: 0,
      outflow: 0,
      transferredIn: 0,
      transferredOut: 0,
      netBalance: 0,
      status: 'settled',
      expenseCount: 0,
      transferCount: 0,
    });
  });

  // Helper to resolve or register an account in settlementsMap
  const getOrCreateAccountItem = (rawName: string): AccountSettlement | null => {
    const clean = (rawName || '').trim();
    if (!clean) return null;
    const lower = clean.toLowerCase();

    // Any variant of cash always resolves to the single 'Cash in Hand' account
    if (lower.includes('cash')) {
      return settlementsMap.get('cash in hand') || null;
    }

    for (const acc of allKnownAccounts) {
      const accId = acc.id.toLowerCase();
      const accName = acc.accountName.toLowerCase();
      if (
        lower === accId ||
        lower === accName ||
        lower.includes(accName) ||
        (acc.upiId && lower.includes(acc.upiId.toLowerCase()))
      ) {
        return settlementsMap.get(accId) || null;
      }
    }

    if (!settlementsMap.has(lower)) {
      settlementsMap.set(lower, {
        accountId: clean,
        accountName: clean,
        label: `👤 ${clean}`,
        bankName: 'Other',
        inflow: 0,
        outflow: 0,
        transferredIn: 0,
        transferredOut: 0,
        netBalance: 0,
        status: 'settled',
        expenseCount: 0,
        transferCount: 0,
      });
    }
    return settlementsMap.get(lower)!;
  };

  // 3. Compute Inflows from Registrations
  registrations.forEach((reg) => {
    const verif = verifByRegId.get(reg.id) || reg.payment_verifications?.[0];
    const upi = (verif?.upi_id || '').toLowerCase().trim();
    const amount =
      verif && verif.amount !== undefined && !isNaN(Number(verif.amount))
        ? Number(verif.amount)
        : Number(reg.amount || 0);

    let matched = false;
    for (const acc of allKnownAccounts) {
      if (acc.upiId && upi === acc.upiId.toLowerCase()) {
        const item = settlementsMap.get(acc.id.toLowerCase());
        if (item) item.inflow += amount;
        matched = true;
        break;
      }
    }

    // Untagged collections: genuine UPI IDs get resolved to their coordinator/account; all cash variants go to Cash in Hand
    if (!matched && amount > 0) {
      const notes = ((verif?.notes || '') + ' ' + (reg?.notes || '')).toLowerCase();
      const isExplicitCash =
        !upi ||
        upi === 'cash' ||
        upi.includes('cash') ||
        upi === 'spot' ||
        notes.includes('(cash)') ||
        notes.includes('spot cash');
      if (!isExplicitCash) {
        const upiItem = getOrCreateAccountItem(upi);
        if (upiItem) {
          upiItem.inflow += amount;
        } else {
          const cashItem = settlementsMap.get('cash in hand');
          if (cashItem) cashItem.inflow += amount;
        }
      } else {
        const cashItem = settlementsMap.get('cash in hand');
        if (cashItem) {
          cashItem.inflow += amount;
        }
      }
    }
  });

  // 4. Compute Inflows from Sponsorships
  sponsorships.forEach((sp) => {
    const upi = (sp.receiving_upi_id || 'gautam.lucky-1@okicici').toLowerCase().trim();
    const amount = Number(sp.amount || 0);
    let matched = false;
    for (const acc of allKnownAccounts) {
      if (acc.upiId && upi === acc.upiId.toLowerCase()) {
        const item = settlementsMap.get(acc.id.toLowerCase());
        if (item) item.inflow += amount;
        matched = true;
        break;
      }
    }

    // Untagged collections: genuine UPI IDs get resolved to their coordinator/account; all cash variants go to Cash in Hand
    if (!matched && amount > 0) {
      const isExplicitCash = !upi || upi.includes('cash') || upi === 'spot';
      if (!isExplicitCash) {
        const upiItem = getOrCreateAccountItem(upi);
        if (upiItem) {
          upiItem.inflow += amount;
        } else {
          const cashItem = settlementsMap.get('cash in hand');
          if (cashItem) cashItem.inflow += amount;
        }
      } else {
        const cashItem = settlementsMap.get('cash in hand');
        if (cashItem) {
          cashItem.inflow += amount;
        }
      }
    }
  });

  // 5. Compute Outflows & Internal Transfers from Expenses
  let unassignedExpenseTotal = 0;

  expenses.forEach((expense) => {
    if (expense.status === 'cancelled') return;
    const actualAmt = Number(expense.actual_amount || 0);
    if (actualAmt <= 0) return;

    // Handle Inter-Account Transfers
    if (expense.category === 'Internal Transfer') {
      const senderRaw = expense.paid_from_account || expense.payment_splits?.[0]?.account || '';
      const receiverRaw = expense.vendor_name || '';

      const senderItem = getOrCreateAccountItem(senderRaw);
      if (senderItem) {
        senderItem.transferredOut = (senderItem.transferredOut || 0) + actualAmt;
        senderItem.transferCount = (senderItem.transferCount || 0) + 1;
      }

      const receiverItem = getOrCreateAccountItem(receiverRaw);
      if (receiverItem) {
        receiverItem.transferredIn = (receiverItem.transferredIn || 0) + actualAmt;
        receiverItem.transferCount = (receiverItem.transferCount || 0) + 1;
      }
      return;
    }

    // Campus Legacy Fund is a permanent institutional endowment corpus managed exclusively
    // in Central Treasury and must never be counted as event operational inflow or expense.
    if (expense.category === 'Campus Legacy Fund') {
      return;
    }

    const splits = getExpenseSplits(expense);
    if (splits.length === 0) {
      unassignedExpenseTotal += actualAmt;
      return;
    }

    splits.forEach((split) => {
      const splitAmt = Number(split.amount || 0);
      if (splitAmt <= 0) return;

      const rawName = (split.account || '').toLowerCase().trim();
      let matchedKey: string | null = null;

      for (const acc of allKnownAccounts) {
        const accId = acc.id.toLowerCase();
        const accName = acc.accountName.toLowerCase();
        if (
          rawName === accId ||
          rawName.includes(accName) ||
          (acc.upiId && rawName.includes(acc.upiId.toLowerCase()))
        ) {
          matchedKey = accId;
          break;
        }
      }

      if (matchedKey && settlementsMap.has(matchedKey)) {
        const item = settlementsMap.get(matchedKey)!;
        item.outflow += splitAmt;
        item.expenseCount += 1;
      } else if (rawName) {
        const customItem = getOrCreateAccountItem(split.account);
        if (customItem) {
          customItem.outflow += splitAmt;
          customItem.expenseCount += 1;
        }
      } else {
        unassignedExpenseTotal += splitAmt;
      }
    });
  });

  // 6. Compute Net Balances & Status
  let totalInflow = 0;
  let totalOutflow = 0;

  settlementsMap.forEach((acc) => {
    // Preserve pure Inflow from registrations & sponsorships (never overwrite with transfers)
    const netTransfers = (acc.transferredIn || 0) - (acc.transferredOut || 0);
    acc.netBalance = acc.inflow + netTransfers - acc.outflow;
    if (acc.netBalance > 0) acc.status = 'surplus';
    else if (acc.netBalance < 0) acc.status = 'deficit';
    else acc.status = 'settled';

    totalInflow += acc.inflow;
    totalOutflow += acc.outflow;
  });

  // Keep accounts that have activity, plus standard organizer accounts
  const accounts = Array.from(settlementsMap.values()).filter((acc) => {
    if (
      acc.inflow > 0 ||
      acc.outflow > 0 ||
      (acc.transferredIn || 0) > 0 ||
      (acc.transferredOut || 0) > 0
    ) {
      return true;
    }
    return !acc.isCash && acc.bankName !== 'Other';
  });

  return {
    accounts,
    unassignedExpenseTotal,
    totalInflow,
    totalOutflow,
    netEventBalance: totalInflow - (totalOutflow + unassignedExpenseTotal),
  };
}

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
 * Returns an array of public URLs for comma-separated expense receipt paths.
 */
export function getAllExpenseScreenshotUrls(path: string | null | undefined): string[] {
  if (!path) return [];
  const parts = path.split(',').map((s) => s.trim()).filter(Boolean);
  return parts
    .map((p) => getPublicExpenseScreenshotUrl(p))
    .filter(Boolean) as string[];
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
 * Uploads multiple expense receipt/bill files to Supabase storage.
 */
export async function uploadMultipleExpenseReceipts(
  files: File[],
  itemName: string,
  eventSlug = 'deepaura-2k26'
): Promise<string[]> {
  const cleanBase = (itemName || 'expense').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 25);
  const baseTime = Date.now();

  const uploadPromises = files.map(async (file, idx) => {
    const fileExt = file.name.split('.').pop() || 'jpg';
    const cleanExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, '');
    const fileName = `expenses/${eventSlug}/${cleanBase}_${baseTime}_${idx + 1}.${cleanExt}`;

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
  });

  const results = await Promise.all(uploadPromises);
  return results.filter(Boolean);
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
  receiptFiles?: File[] | File | null,
  eventSlug = 'deepaura-2k26'
): Promise<EventExpense> {
  // Existing paths preserved from expense record
  const existingPaths = (expense.payment_screenshot_path || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let newUploadedPaths: string[] = [];

  if (Array.isArray(receiptFiles) && receiptFiles.length > 0) {
    newUploadedPaths = await uploadMultipleExpenseReceipts(
      receiptFiles,
      expense.item_name || 'expense',
      eventSlug
    );
  } else if (receiptFiles instanceof File) {
    const single = await uploadExpenseReceipt(
      receiptFiles,
      expense.item_name || 'expense',
      eventSlug
    );
    if (single) newUploadedPaths.push(single);
  }

  const allCombined = [...existingPaths, ...newUploadedPaths];
  const finalReceiptPath = allCombined.length > 0 ? allCombined.join(',') : null;

  const isUUID =
    typeof expense.event_id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expense.event_id.trim());

  // Prepare splits and summary
  const splits = Array.isArray(expense.payment_splits)
    ? expense.payment_splits.filter((s) => s && s.account && Number(s.amount) > 0)
    : [];

  let payerSummary = expense.paid_from_account || null;
  if (splits.length > 1) {
    payerSummary = `Split: ${splits.map((s) => `${s.account.split('(')[0].trim()} ₹${s.amount}`).join(', ')}`;
  } else if (splits.length === 1 && !payerSummary) {
    payerSummary = splits[0].account;
  }

  const payload: any = {
    ...expense,
    event_id: isUUID ? expense.event_id?.trim() : null,
    expected_amount: Number(expense.expected_amount) || 0,
    actual_amount: Number(expense.actual_amount) || 0,
    status: expense.status || 'planned',
    paid_from_account: payerSummary,
    payment_splits: splits,
    payment_screenshot_path: finalReceiptPath,
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
    case 'Internal Transfer':
      return '🔄';
    case 'Campus Legacy Fund':
      return '🌱';
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
  totalHeadcount = 0,
  settlements: AccountSettlement[] = []
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

  // Real vendor expenses vs inter-account transfers (excludes institutional legacy fund)
  const realExpenses = expenses.filter(
    (e) => e.category !== 'Internal Transfer' && e.category !== 'Campus Legacy Fund'
  );
  const transferItems = expenses.filter((e) => e.category === 'Internal Transfer');

  // Itemized listing
  const itemsText = realExpenses
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

      const payerSummary = formatExpensePayerSummary(item);
      const payerText =
        payerSummary.primaryLabel && payerSummary.primaryLabel !== '⚠️ Unassigned'
          ? `\n   💳 Paid From: ${payerSummary.primaryLabel}`
          : '';

      return `${idx + 1}. ${icon} *${item.item_name}*${vendorInfo}\n   Expected: ₹${formatINR(item.expected_amount)} | Actual: ₹${formatINR(item.actual_amount)} ${diffLabel} ${statusEmoji}${payerText}`;
    })
    .join('\n\n');

  const settlementsSection =
    settlements && settlements.length > 0
      ? `\n\n💳 *ACCOUNT SETTLEMENT & CASH IN HAND:*\n` +
        settlements
          .map((s) => {
            const transferPart =
              (s.transferredIn || 0) > 0 || (s.transferredOut || 0) > 0
                ? ` (⇄ ${(s.transferredIn || 0) > 0 ? `+₹${formatINR(s.transferredIn || 0)}` : ''}${(s.transferredOut || 0) > 0 ? ` -₹${formatINR(s.transferredOut || 0)}` : ''})`
                : '';
            return `• *${s.accountName}*: In ₹${formatINR(s.inflow)} - Out ₹${formatINR(s.outflow)}${transferPart} = *${s.netBalance >= 0 ? '+' : ''}₹${formatINR(s.netBalance)}* ${s.netBalance > 0 ? '🟢 (Surplus)' : s.netBalance < 0 ? '🔴 (Due)' : '⚪ (Settled)'}`;
          })
          .join('\n')
      : '';

  const transfersSection =
    transferItems.length > 0
      ? `\n\n🔄 *INTER-ACCOUNT TRANSFERS (${transferItems.length}):*\n` +
        transferItems
          .map((t, idx) => {
            const from = t.paid_from_account || 'Unknown';
            const to = t.vendor_name || 'Unknown';
            const note = t.notes ? ` (${t.notes})` : '';
            return `• ${idx + 1}. *${from} ➔ ${to}*: ₹${formatINR(t.actual_amount)}${note}`;
          })
          .join('\n')
      : '';

  const footer = `\n\n📌 _Generated from ECK-RTU Alumni Central Portal._`;

  return `${header}\n${fundingSection}${settlementsSection}${transfersSection}\n\n📋 *ITEMIZED EXPENSES (${realExpenses.length}):*\n${itemsText}${footer}`;
}
