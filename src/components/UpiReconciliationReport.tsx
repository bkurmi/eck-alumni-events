import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  X,
  Copy,
  Calendar,
  CreditCard,
  Edit2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import type { EventRegistration, PaymentVerification, Sponsorship, ECKEvent } from '../types';
import { getUpiAccountName, isCashAccount, CANONICAL_CASH_ACCOUNT } from '../lib/paymentRotation';
import { supabase } from '../lib/supabase';
import { isRealMobileNumber } from '../lib/registrations';
import { formatINR } from '../lib/expenses';

interface UpiReconciliationReportProps {
  registrations: EventRegistration[];
  verifications: PaymentVerification[];
  sponsorships?: Sponsorship[];
  event?: ECKEvent | null;
  onSaveVerification: (
    registrationId: string,
    upiId: string,
    amount: number,
    notes?: string
  ) => Promise<boolean>;
  onEditSponsorship?: (sponsorship: Sponsorship) => void;
  onRefresh?: () => void;
  loading?: boolean;
  currentUserEmail?: string;
}

interface KnownAccount {
  upi_id: string;
  label: string;
  badge: string;
  bankName: string;
  accountName: string;
  isSponsorAccount?: boolean;
}

const getPublicScreenshotUrl = (path: string | null | undefined) => {
  if (!path) return null;
  let cleanPath = path.trim().replace(/^["']|["']$/g, '');
  if (!cleanPath || cleanPath === 'manual-admin-entry') return null;
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) return cleanPath;
  if (cleanPath.startsWith('payment-screenshots/')) {
    cleanPath = cleanPath.replace(/^payment-screenshots\//, '');
  }
  const { data } = supabase.storage.from('payment-screenshots').getPublicUrl(cleanPath);
  return data?.publicUrl || null;
};

// Format date strictly as DD-MM-YYYY
const formatDDMMYYYY = (dateStr: string | null | undefined) => {
  if (!dateStr || dateStr === 'No Date') return '—';
  try {
    const clean = dateStr.slice(0, 10);
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  } catch {
    return dateStr || '—';
  }
};

export const UpiReconciliationReport: React.FC<UpiReconciliationReportProps> = ({
  registrations,
  verifications,
  sponsorships = [],
  event,
  onSaveVerification,
  onEditSponsorship,
  currentUserEmail: _currentUserEmail,
}) => {
  // Known accounts list dynamically merged from active event configs and actual recorded transactions
  const knownAccounts: KnownAccount[] = useMemo(() => {
    const list: KnownAccount[] = [];
    const seen = new Set<string>();

    // 1. Add event-specific configured UPI accounts first if present
    if (event?.upi_rotation_configs && Array.isArray(event.upi_rotation_configs)) {
      event.upi_rotation_configs.forEach((c) => {
        const upi = (c.upi_id || '').toLowerCase().trim();
        if (upi && !seen.has(upi) && !isCashAccount(upi)) {
          seen.add(upi);
          let bank = 'UPI';
          if (upi.includes('sbi')) bank = 'SBI';
          else if (upi.includes('axis')) bank = 'AXIS';
          else if (upi.includes('ybl')) bank = 'YES';
          else if (upi.includes('ibl') || upi.includes('icici')) bank = 'ICICI';
          const accName = c.account_name || getUpiAccountName(upi, event) || 'UPI Account';
          list.push({
            upi_id: upi,
            label: `${accName} (${bank})`,
            badge: accName,
            bankName: bank,
            accountName: accName,
            isSponsorAccount: false,
          });
        }
      });
    }

    // 2. Add genuine UPI accounts recorded in verifications
    verifications.forEach((v) => {
      const upi = (v.upi_id || '').toLowerCase().trim();
      if (upi && !seen.has(upi) && !isCashAccount(upi)) {
        seen.add(upi);
        const accName = getUpiAccountName(upi, event) || 'UPI Account';
        list.push({
          upi_id: upi,
          label: `${accName} (${upi})`,
          badge: accName,
          bankName: 'UPI',
          accountName: accName,
          isSponsorAccount: false,
        });
      }
    });

    // 3. Add genuine UPI accounts recorded in sponsorships
    sponsorships.forEach((s) => {
      const upi = (s.receiving_upi_id || '').toLowerCase().trim();
      if (upi && !seen.has(upi) && !isCashAccount(upi)) {
        seen.add(upi);
        const accName = getUpiAccountName(upi, event) || 'Sponsor Account';
        list.push({
          upi_id: upi,
          label: `${accName} (${upi})`,
          badge: accName,
          bankName: 'UPI',
          accountName: accName,
          isSponsorAccount: true,
        });
      }
    });

    return list;
  }, [event, verifications, sponsorships]);

  // All filterable account keys: genuine known UPI accounts + canonical 'Cash in Hand'
  const allAccountKeys = useMemo(() => {
    return [...knownAccounts.map((a) => a.upi_id), CANONICAL_CASH_ACCOUNT];
  }, [knownAccounts]);

  // Selected QR Checkbox accounts (Multi-select)
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(allAccountKeys);

  // Dedicated Ledger View: 'registrations' (default) vs 'sponsorships'
  const [activeLedgerTab, setActiveLedgerTab] = useState<'registrations' | 'sponsorships'>('registrations');

  // View Mode: 'overall' vs 'daywise' (Overall Flat View is default)
  const [viewMode, setViewMode] = useState<'daywise' | 'overall'>('overall');

  // Attendance Status Filter: 'all' | 'yes' | 'maybe' | 'no'
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'yes' | 'maybe' | 'no'>('all');

  // Search query & Date filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  // Quick edit modal state
  const [editingReg, setEditingReg] = useState<{
    registration: EventRegistration;
    verification?: PaymentVerification;
  } | null>(null);
  const [editUpiId, setEditUpiId] = useState<string>('');
  const [editCustomUpi, setEditCustomUpi] = useState<string>('');
  const [editAmount, setEditAmount] = useState<number>(800);
  const [editNotes, setEditNotes] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (editingReg) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [editingReg]);

  // Map verifications by registration_id for O(1) lookup
  const verifByRegId = useMemo(() => {
    const map = new Map<string, PaymentVerification>();
    verifications.forEach((v) => {
      map.set(v.registration_id, v);
    });
    return map;
  }, [verifications]);

  // Combine registration with verification record
  const enrichedList = useMemo(() => {
    return registrations.map((reg) => {
      const verif = verifByRegId.get(reg.id) || reg.payment_verifications?.[0];
      const rawUpi = verif?.upi_id ? verif.upi_id.trim() : null;

      let assignedUpi: string;
      let qrLabel: string;
      if (isCashAccount(rawUpi)) {
        assignedUpi = CANONICAL_CASH_ACCOUNT;
        qrLabel = '💵 Cash in Hand';
      } else if (rawUpi) {
        const norm = rawUpi.toLowerCase();
        const matchedAccount = knownAccounts.find((a) => a.upi_id === norm);
        if (matchedAccount) {
          assignedUpi = matchedAccount.upi_id;
          qrLabel = matchedAccount.label;
        } else {
          assignedUpi = norm;
          qrLabel = `${getUpiAccountName(norm, event)} (${norm})`;
        }
      } else {
        assignedUpi = CANONICAL_CASH_ACCOUNT;
        qrLabel = '⚠️ Not Tagged';
      }

      const paymentDate = reg.created_at.slice(0, 10);
      const amount = verif ? Number(verif.amount) : Number(reg.amount || 0);

      return {
        registration: reg,
        verification: verif,
        assignedUpi,
        qrLabel,
        isCash: isCashAccount(rawUpi) || assignedUpi === CANONICAL_CASH_ACCOUNT,
        paymentDate,
        amount,
        verifiedBy: verif?.verified_by || null,
        screenshotUrl: getPublicScreenshotUrl(
          reg.payment_screenshot_path ? reg.payment_screenshot_path.split(',')[0] : null
        ),
        isVerified: !!verif && verif.verified_status === 'VERIFIED',
      };
    }).sort((a, b) => {
      const regA = a.registration.registration_number || '';
      const regB = b.registration.registration_number || '';
      if (regA && regB) {
        const cmp = regB.localeCompare(regA, undefined, { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return cmp;
      }
      const timeA = a.registration.created_at ? new Date(a.registration.created_at).getTime() : 0;
      const timeB = b.registration.created_at ? new Date(b.registration.created_at).getTime() : 0;
      return timeB - timeA;
    });
  }, [registrations, verifByRegId, knownAccounts, event]);

  // Attendance Counts
  const attendanceCounts = useMemo(() => {
    return {
      all: enrichedList.length,
      yes: enrichedList.filter((i) => i.registration.attendance_status === 'yes').length,
      maybe: enrichedList.filter((i) => i.registration.attendance_status === 'maybe').length,
      no: enrichedList.filter((i) => i.registration.attendance_status === 'no').length,
    };
  }, [enrichedList]);

  // Distinct payment dates
  const availableDates = useMemo(() => {
    const set = new Set<string>();
    enrichedList.forEach((item) => {
      if (item.paymentDate) set.add(item.paymentDate);
    });
    return Array.from(set).sort().reverse();
  }, [enrichedList]);

  // Individual Account Tallies
  const accountStats = useMemo(() => {
    const stats: Record<
      string,
      { count: number; totalAmount: number; sponsorCount: number; sponsorAmount: number }
    > = {};
    knownAccounts.forEach((acc) => {
      stats[acc.upi_id] = { count: 0, totalAmount: 0, sponsorCount: 0, sponsorAmount: 0 };
    });
    stats[CANONICAL_CASH_ACCOUNT] = { count: 0, totalAmount: 0, sponsorCount: 0, sponsorAmount: 0 };

    enrichedList.forEach((item) => {
      if (attendanceFilter !== 'all' && item.registration.attendance_status !== attendanceFilter) {
        return;
      }
      const key = item.assignedUpi || CANONICAL_CASH_ACCOUNT;
      if (!stats[key]) {
        stats[key] = { count: 0, totalAmount: 0, sponsorCount: 0, sponsorAmount: 0 };
      }
      stats[key].count++;
      stats[key].totalAmount += item.amount;
    });

    sponsorships.forEach((s) => {
      const raw = (s.receiving_upi_id || '').trim();
      const key = isCashAccount(raw) || !raw ? CANONICAL_CASH_ACCOUNT : raw.toLowerCase();
      if (!stats[key]) {
        stats[key] = { count: 0, totalAmount: 0, sponsorCount: 0, sponsorAmount: 0 };
      }
      const amt = Number(s.amount || 0);
      stats[key].sponsorCount = (stats[key].sponsorCount || 0) + 1;
      stats[key].sponsorAmount = (stats[key].sponsorAmount || 0) + amt;
      stats[key].totalAmount += amt;
    });

    return stats;
  }, [enrichedList, knownAccounts, attendanceFilter, sponsorships]);

  // Checkbox Toggle Handlers
  const toggleAccount = (accountKey: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accountKey) ? prev.filter((k) => k !== accountKey) : [...prev, accountKey]
    );
  };

  const selectAllAccounts = () => {
    setSelectedAccounts(allAccountKeys);
  };

  const clearAllAccounts = () => {
    setSelectedAccounts([]);
  };

  // Filtered List
  const filteredList = useMemo(() => {
    return enrichedList.filter((item) => {
      if (attendanceFilter !== 'all' && item.registration.attendance_status !== attendanceFilter) {
        return false;
      }

      const key = item.assignedUpi || CANONICAL_CASH_ACCOUNT;
      const isSelected =
        selectedAccounts.includes(key) ||
        (key === CANONICAL_CASH_ACCOUNT && selectedAccounts.includes('unassigned'));
      if (!isSelected) {
        return false;
      }

      if (selectedDateFilter !== 'all' && item.paymentDate !== selectedDateFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const alumni = item.registration.alumni;
        const matchesName = alumni?.name?.toLowerCase().includes(q);
        const matchesRegNum = item.registration.registration_number?.toLowerCase().includes(q);
        const matchesMobile = isRealMobileNumber(alumni?.mobile) && alumni!.mobile.includes(q);
        const matchesUpi = item.assignedUpi?.includes(q);
        if (!matchesName && !matchesRegNum && !matchesMobile && !matchesUpi) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const regA = a.registration.registration_number || '';
      const regB = b.registration.registration_number || '';
      if (regA && regB) {
        const cmp = regB.localeCompare(regA, undefined, { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return cmp;
      }
      const timeA = a.registration.created_at ? new Date(a.registration.created_at).getTime() : 0;
      const timeB = b.registration.created_at ? new Date(b.registration.created_at).getTime() : 0;
      return timeB - timeA;
    });
  }, [enrichedList, attendanceFilter, selectedAccounts, selectedDateFilter, searchQuery]);

  // Filtered sponsorships
  const filteredSponsorships = useMemo(() => {
    return (sponsorships || []).filter((s) => {
      const rawUpi = (s.receiving_upi_id || '').trim();
      const isCash = isCashAccount(rawUpi) || !rawUpi;
      const norm = rawUpi.toLowerCase();
      const isKnown = knownAccounts.some((a) => a.upi_id === norm);
      const upi = isCash ? CANONICAL_CASH_ACCOUNT : isKnown ? norm : CANONICAL_CASH_ACCOUNT;
      const isSelected =
        selectedAccounts.includes(upi) ||
        (upi === CANONICAL_CASH_ACCOUNT && selectedAccounts.includes('unassigned'));
      if (!isSelected) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = s.sponsor_name?.toLowerCase().includes(q);
        const matchesPerson = s.contact_person?.toLowerCase().includes(q);
        const matchesPhone = s.contact_phone?.includes(q);
        const matchesUpi = upi.includes(q);
        if (!matchesName && !matchesPerson && !matchesPhone && !matchesUpi) {
          return false;
        }
      }

      if (selectedDateFilter !== 'all') {
        const d = (s.created_at || '').slice(0, 10);
        if (d !== selectedDateFilter) {
          return false;
        }
      }

      return true;
    });
  }, [sponsorships, selectedAccounts, searchQuery, selectedDateFilter, knownAccounts]);

  // Totals
  const currentTotals = useMemo(() => {
    const totalRegCount = filteredList.length;
    const regAmount = filteredList.reduce((sum, item) => sum + item.amount, 0);
    const totalSponsorCount = filteredSponsorships.length;
    const sponsorAmount = filteredSponsorships.reduce((sum, s) => sum + Number(s.amount || 0), 0);
    return {
      totalCount: totalRegCount + totalSponsorCount,
      totalRegCount,
      totalSponsorCount,
      regAmount,
      sponsorAmount,
      totalAmount: regAmount + sponsorAmount,
    };
  }, [filteredList, filteredSponsorships]);

  // Grouped by Date (Day-wise)
  const groupedByDate = useMemo(() => {
    const map = new Map<string, typeof filteredList>();

    filteredList.forEach((item) => {
      const d = item.paymentDate || 'No Date';
      if (!map.has(d)) {
        map.set(d, []);
      }
      map.get(d)!.push(item);
    });

    const sortedDates = Array.from(map.keys()).sort().reverse();

    return sortedDates.map((d) => {
      const items = map.get(d)!;
      const subtotalAmount = items.reduce((sum, i) => sum + i.amount, 0);
      return {
        date: d,
        items,
        subtotalAmount,
        subtotalCount: items.length,
      };
    });
  }, [filteredList]);

  // Open Edit Modal
  const handleOpenEdit = (item: (typeof enrichedList)[0]) => {
    const raw = item.assignedUpi || item.verification?.upi_id || '';
    const isCash = isCashAccount(raw) || item.assignedUpi === CANONICAL_CASH_ACCOUNT || isCashAccount(item.verification?.notes);
    const norm = raw.toLowerCase().trim();
    const isKnown = norm ? knownAccounts.some((a) => a.upi_id === norm) : false;

    setEditingReg({
      registration: item.registration,
      verification: item.verification,
    });
    setEditUpiId(
      isCash
        ? CANONICAL_CASH_ACCOUNT
        : isKnown
        ? norm
        : raw
        ? 'custom'
        : knownAccounts[0]?.upi_id || CANONICAL_CASH_ACCOUNT
    );
    setEditCustomUpi(isCash || isKnown ? '' : raw);
    setEditAmount(item.amount || item.registration.amount || 800);
    setEditNotes(item.verification?.notes || '');
  };

  // Save Edit
  const handleSaveEdit = async () => {
    if (!editingReg) return;
    const finalUpi =
      editUpiId === 'custom'
        ? editCustomUpi.trim()
        : isCashAccount(editUpiId)
        ? CANONICAL_CASH_ACCOUNT
        : editUpiId.trim();

    if (!finalUpi) {
      alert('Please select or specify a UPI ID or Cash in Hand');
      return;
    }

    setSavingEdit(true);
    try {
      const ok = await onSaveVerification(
        editingReg.registration.id,
        finalUpi,
        editAmount,
        editNotes
      );
      if (ok) {
        setEditingReg(null);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  // Build WhatsApp Summary Text
  const buildWhatsAppSummaryText = () => {
    let text = `*${event?.event_name || 'ECK-RTU Alumni'} — UPI Reconciliation Report*\n`;
    text += `📊 *View:* ${viewMode === 'daywise' ? 'Day-wise Breakdown' : 'Overall Consolidated'}\n`;
    text += `🎟️ *Attendance Filter:* ${attendanceFilter.toUpperCase()}\n`;
    text += `💰 *Selected Total:* ₹${formatINR(currentTotals.totalAmount)}\n`;
    text += `👥 *Total Registrations:* ${currentTotals.totalRegCount} (₹${formatINR(currentTotals.regAmount)})\n`;
    if (currentTotals.totalSponsorCount > 0) {
      text += `🤝 *Total Sponsorships:* ${currentTotals.totalSponsorCount} (₹${formatINR(currentTotals.sponsorAmount)})\n`;
    }
    text += `📅 *Generated On:* ${new Date().toLocaleString('en-IN')}\n\n`;

    if (viewMode === 'daywise') {
      groupedByDate.forEach((group) => {
        text += `\n🗓️ *Date: ${formatDDMMYYYY(group.date)}* (${group.subtotalCount} people • ₹${formatINR(group.subtotalAmount)})\n`;
        group.items.forEach((item, idx) => {
          text += `  ${idx + 1}. [${item.registration.registration_number}] ${item.registration.alumni?.name || 'Alumnus'} - ₹${item.amount} [${item.assignedUpi || 'Unassigned'}]\n`;
        });
      });
    } else {
      filteredList.forEach((item, idx) => {
        text += `${idx + 1}. [${item.registration.registration_number}] ${item.registration.alumni?.name || 'Alumnus'} — ₹${item.amount} [${item.assignedUpi || 'Unassigned'}]\n`;
      });
    }

    return text;
  };

  const handleCopySummary = () => {
    const text = buildWhatsAppSummaryText();
    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  const handleShareWhatsApp = () => {
    const text = buildWhatsAppSummaryText();
    const encoded = encodeURIComponent(text);
    const isMobile =
      typeof navigator !== 'undefined' &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      window.open(`whatsapp://send?text=${encoded}`, '_self');
      setTimeout(() => {
        window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
      }, 700);
    } else {
      window.open(`https://web.whatsapp.com/send?text=${encoded}`, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="flex flex-col gap-4 text-slate-100">
      {/* ── WhatsApp Broadcast & Action Banner ── */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              UPI WhatsApp Broadcast & Audit
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Account-wise collections ledger, reconciliation receipts, and audit trail
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md transition-colors"
            title="Broadcast report on WhatsApp"
          >
            <span>💬</span>
            <span>Broadcast Report</span>
          </button>
          <button
            type="button"
            onClick={handleCopySummary}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors"
            title="Copy WhatsApp text summary"
          >
            <Copy className="w-4 h-4 text-slate-400" />
            <span>{copiedSummary ? '✓ Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* ── VIEW MODE & RECONCILIATION TABS ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Category: Registrations vs Sponsorships */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto tab-scrollbar">
          <button
            type="button"
            onClick={() => setActiveLedgerTab('registrations')}
            className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
              activeLedgerTab === 'registrations'
                ? 'bg-slate-800 text-amber-300 shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🎟️</span>
            <span>Alumni Registrations ({filteredList.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveLedgerTab('sponsorships')}
            className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
              activeLedgerTab === 'sponsorships'
                ? 'bg-slate-800 text-amber-400 shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🤝</span>
            <span>Sponsorships ({filteredSponsorships.length})</span>
          </button>
        </div>

        {/* Display Mode: Overall vs Daywise */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setViewMode('overall')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'overall'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Overall View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('daywise')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'daywise'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Day-wise View
          </button>
        </div>
      </div>

      {/* ── MULTI-SELECT QR CODE CHECKBOXES ── */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Select Receiving UPI ID Accounts ({selectedAccounts.length}/{allAccountKeys.length})
          </span>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={selectAllAccounts}
              className="text-amber-400 hover:underline font-semibold"
            >
              Select All
            </button>
            <span className="text-slate-600">•</span>
            <button
              type="button"
              onClick={clearAllAccounts}
              className="text-slate-400 hover:text-slate-200 font-semibold"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {knownAccounts.map((acc) => {
            const isChecked = selectedAccounts.includes(acc.upi_id);
            const stats = accountStats[acc.upi_id] || { count: 0, totalAmount: 0, sponsorCount: 0, sponsorAmount: 0 };

            return (
              <label
                key={acc.upi_id}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                  isChecked
                    ? 'bg-amber-950/20 border-amber-500/50 ring-1 ring-amber-500/30'
                    : 'bg-slate-950/50 hover:bg-slate-900 border-slate-800 opacity-60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleAccount(acc.upi_id)}
                  className="mt-1 rounded border-slate-700 text-amber-500 focus:ring-amber-500/30"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                      {acc.bankName}
                    </span>
                    <span className="text-slate-400 font-mono">
                      {stats.count} Regs{stats.sponsorCount > 0 ? ` + ${stats.sponsorCount} Spons` : ''}
                    </span>
                  </div>
                  <strong className="block text-sm font-bold text-white truncate">
                    {acc.accountName}
                  </strong>
                  <span className="block text-[11px] text-slate-400 font-mono truncate" title={acc.upi_id}>
                    {acc.upi_id}
                  </span>
                  <div className="text-xs sm:text-sm font-mono font-bold text-amber-400 pt-0.5">
                    ₹{formatINR(stats.totalAmount)}
                  </div>
                </div>
              </label>
            );
          })}

          {/* Canonical Cash in Hand Checkbox */}
          {(() => {
            const isChecked = selectedAccounts.includes(CANONICAL_CASH_ACCOUNT) || selectedAccounts.includes('unassigned');
            const stats = accountStats[CANONICAL_CASH_ACCOUNT] || { count: 0, totalAmount: 0, sponsorCount: 0, sponsorAmount: 0 };
            return (
              <label
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                  isChecked
                    ? 'bg-amber-950/20 border-amber-500/50 ring-1 ring-amber-500/30'
                    : 'bg-slate-950/50 hover:bg-slate-900 border-slate-800 opacity-60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {
                    toggleAccount(CANONICAL_CASH_ACCOUNT);
                    if (selectedAccounts.includes('unassigned')) toggleAccount('unassigned');
                  }}
                  className="mt-1 rounded border-slate-700 text-amber-500 focus:ring-amber-500/30"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 font-semibold">
                      💵 Cash
                    </span>
                    <span className="text-slate-400 font-mono">
                      {stats.count} Entries
                    </span>
                  </div>
                  <strong className="block text-sm font-bold text-white truncate">
                    Cash in Hand
                  </strong>
                  <span className="block text-[11px] text-slate-400 truncate">
                    Spot Cash / Handover
                  </span>
                  <div className="text-xs sm:text-sm font-mono font-bold text-amber-400 pt-0.5">
                    ₹{formatINR(stats.totalAmount)}
                  </div>
                </div>
              </label>
            );
          })()}
        </div>
      </div>

      {/* ── LIVE SELECTION BANNER ── */}
      <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-slate-900 via-indigo-950/20 to-slate-900 border border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="text-xs font-semibold text-slate-400 block">
            {selectedAccounts.length === allAccountKeys.length
              ? `All (${selectedAccounts.length}) Accounts Selected`
              : `${selectedAccounts.length} Account(s) Selected`}
          </span>
          <span className="text-xs text-slate-300 mt-0.5 block">
            {currentTotals.totalRegCount} matching registrations
            {currentTotals.totalSponsorCount > 0 ? ` + ${currentTotals.totalSponsorCount} sponsorships` : ''}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-slate-400 block">Total Pool Amount</span>
          <span className="text-xl sm:text-2xl font-mono font-extrabold text-amber-400">
            ₹{formatINR(currentTotals.totalAmount)}
          </span>
        </div>
      </div>

      {/* ── ATTENDANCE STATUS FILTER CHIPS & TOOLBAR ── */}
      <div className="space-y-3">
        {activeLedgerTab === 'registrations' && (
          <div className="flex items-center gap-1.5 overflow-x-auto tab-scrollbar">
            {(['all', 'yes', 'maybe', 'no'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setAttendanceFilter(status)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border ${
                  attendanceFilter === status
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {status === 'all' && `All (${attendanceCounts.all})`}
                {status === 'yes' && `Attending (${attendanceCounts.yes})`}
                {status === 'maybe' && `Maybe (${attendanceCounts.maybe})`}
                {status === 'no' && `No (${attendanceCounts.no})`}
              </button>
            ))}
          </div>
        )}

        {/* Toolbar: Search & Date */}
        <div className="flex items-center gap-2 bg-slate-900 p-2 sm:p-2.5 rounded-2xl border border-slate-800 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder={
                activeLedgerTab === 'registrations'
                  ? 'Search by Name, mobile, reg ID...'
                  : 'Search by Sponsor name, UPI...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[40px] text-base sm:text-sm pl-9 pr-8 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-white placeholder-slate-500 outline-none focus:border-amber-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Date:</span>
            <select
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="min-h-[40px] text-base sm:text-xs px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-slate-200 outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Dates ({availableDates.length})</option>
              {availableDates.map((d) => (
                <option key={d} value={d} className="bg-slate-900">
                  {formatDDMMYYYY(d)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── REPORT CONTENT ── */}
      {activeLedgerTab === 'sponsorships' ? (
        filteredSponsorships.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/60 border border-dashed border-slate-800 text-slate-400 text-xs sm:text-sm">
            No sponsorships found for current selection.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs sm:text-sm text-slate-300">
                <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">Sponsor</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3">UPI ID</th>
                    <th className="p-3">Date</th>
                    <th className="p-3 text-center w-12">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                  {filteredSponsorships.map((sp, idx) => (
                    <tr
                      key={sp.id}
                      onClick={() => onEditSponsorship?.(sp)}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="p-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                      <td className="p-3 font-bold text-amber-400">{sp.sponsor_name}</td>
                      <td className="p-3 text-right font-mono font-bold text-white">
                        ₹{formatINR(Number(sp.amount || 0))}
                      </td>
                      <td className="p-3 font-mono text-slate-400">{sp.receiving_upi_id || 'Direct'}</td>
                      <td className="p-3 font-mono text-slate-400">{formatDDMMYYYY(sp.created_at)}</td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditSponsorship?.(sp);
                          }}
                          className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center text-amber-400 hover:text-amber-300"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="sm:hidden space-y-2.5">
              {filteredSponsorships.map((sp, idx) => (
                <div
                  key={sp.id}
                  onClick={() => onEditSponsorship?.(sp)}
                  className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2 cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-500">#{idx + 1} • {formatDDMMYYYY(sp.created_at)}</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      ₹{formatINR(Number(sp.amount || 0))}
                    </span>
                  </div>
                  <div className="font-bold text-white text-sm">{sp.sponsor_name}</div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                    <span className="font-mono text-slate-400">{sp.receiving_upi_id || 'Direct'}</span>
                    <span className="text-amber-400 font-semibold flex items-center gap-1">
                      <Edit2 className="w-3 h-3" /> Edit
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : filteredList.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-slate-900/60 border border-dashed border-slate-800 text-slate-400 text-xs sm:text-sm">
          No registrations found for current selection.
        </div>
      ) : viewMode === 'daywise' ? (
        /* DAY-WISE VIEW */
        <div className="space-y-4">
          {groupedByDate.map((group) => (
            <div key={group.date} className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
              <div className="p-3 sm:px-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-white text-sm">{formatDDMMYYYY(group.date)}</span>
                  <span className="text-xs text-slate-400">({group.subtotalCount} attendees)</span>
                </div>
                <div className="font-mono font-bold text-amber-400 text-sm sm:text-base">
                  Subtotal: ₹{formatINR(group.subtotalAmount)}
                </div>
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm text-slate-300">
                  <thead className="bg-slate-950/40 text-slate-400 border-b border-slate-800/60 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="p-2.5 w-10 text-center">#</th>
                      <th className="p-2.5">Name</th>
                      <th className="p-2.5 text-right">Amount</th>
                      <th className="p-2.5">UPI ID</th>
                      <th className="p-2.5">Reg ID</th>
                      <th className="p-2.5 text-center w-12">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {group.items.map((item, idx) => (
                      <tr
                        key={item.registration.id}
                        onClick={() => handleOpenEdit(item)}
                        className="hover:bg-slate-850 cursor-pointer transition-colors"
                      >
                        <td className="p-2.5 text-center text-slate-500 font-mono">{idx + 1}</td>
                        <td className="p-2.5 font-bold text-white">{item.registration.alumni?.name}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-400">
                          ₹{formatINR(item.amount)}
                        </td>
                        <td className="p-2.5 font-mono text-slate-400">{item.assignedUpi}</td>
                        <td className="p-2.5 font-mono text-amber-400">{item.registration.registration_number}</td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(item);
                            }}
                            className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center text-slate-400 hover:text-white"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="sm:hidden p-2.5 space-y-2">
                {group.items.map((item) => (
                  <div
                    key={item.registration.id}
                    onClick={() => handleOpenEdit(item)}
                    className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5 cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-amber-400 font-bold">{item.registration.registration_number}</span>
                      <span className="font-mono font-bold text-emerald-400">₹{formatINR(item.amount)}</span>
                    </div>
                    <div className="text-sm font-bold text-white">{item.registration.alumni?.name}</div>
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                      <span className="font-mono truncate">{item.assignedUpi}</span>
                      <span className="text-indigo-400 font-semibold flex items-center gap-1">
                        <Edit2 className="w-3 h-3" /> Edit
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* OVERALL FLAT VIEW */
        <div className="space-y-3">
          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs sm:text-sm text-slate-300">
              <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3">Name</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3">UPI ID</th>
                  <th className="p-3">Reg ID</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-center w-12">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {filteredList.map((item, idx) => (
                  <tr
                    key={item.registration.id}
                    onClick={() => handleOpenEdit(item)}
                    className="hover:bg-slate-850 cursor-pointer transition-colors"
                  >
                    <td className="p-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                    <td className="p-3 font-bold text-white">{item.registration.alumni?.name}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-400">
                      ₹{formatINR(item.amount)}
                    </td>
                    <td className="p-3 font-mono text-slate-400">{item.assignedUpi}</td>
                    <td className="p-3 font-mono text-amber-400">{item.registration.registration_number}</td>
                    <td className="p-3 font-mono text-slate-400">{formatDDMMYYYY(item.paymentDate)}</td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(item);
                        }}
                        className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center text-slate-400 hover:text-white"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="sm:hidden space-y-2.5">
            {filteredList.map((item) => (
              <div
                key={item.registration.id}
                onClick={() => handleOpenEdit(item)}
                className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 cursor-pointer shadow-sm"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-amber-400 font-bold">{item.registration.registration_number}</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">₹{formatINR(item.amount)}</span>
                </div>
                <div className="text-sm font-bold text-white">{item.registration.alumni?.name}</div>
                <div className="text-xs text-slate-400">
                  Batch {item.registration.alumni?.year_of_passing || '—'} • {item.registration.alumni?.engineering_discipline || '—'}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1.5 border-t border-slate-800/80">
                  <span className="font-mono truncate">{item.assignedUpi}</span>
                  <span className="text-indigo-400 font-semibold flex items-center gap-1">
                    <Edit2 className="w-3 h-3" /> Edit
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EDIT UPI MODAL ── */}
      {editingReg && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => !savingEdit && setEditingReg(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-lg max-h-[92vh] sm:max-h-[85vh] flex flex-col bg-slate-900 border-t sm:border border-amber-500/30 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4 border-b border-slate-800 bg-slate-950/50">
              <div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                  {editingReg.registration.registration_number}
                </span>
                <h2 className="text-base sm:text-lg font-bold text-white mt-1">
                  Record / Change Receiving UPI ID
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingReg(null)}
                disabled={savingEdit}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 tab-scrollbar space-y-4">
              {/* Summary */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <strong className="block text-white text-sm sm:text-base">
                    {editingReg.registration.alumni?.name}
                  </strong>
                  <span className="text-xs text-slate-400 block mt-0.5">
                    Batch {editingReg.registration.alumni?.year_of_passing} • {formatDDMMYYYY(editingReg.registration.created_at)}
                  </span>
                </div>
                <span className="text-base sm:text-lg font-mono font-bold text-emerald-400">
                  ₹{editingReg.registration.amount}
                </span>
              </div>

              {/* Notes Display */}
              {editingReg.verification?.notes && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                  <strong className="block text-amber-400 mb-1">📝 Notes:</strong>
                  <span>{editingReg.verification.notes}</span>
                </div>
              )}

              {/* Payment Screenshot Display */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-200">
                    📄 Attached Payment Screenshot(s)
                  </label>
                  {editingReg.registration.payment_screenshot_path && (
                    <span className="text-[11px] text-slate-400 font-mono">
                      {(editingReg.registration.payment_screenshot_path || '')
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean).length}{' '}
                      receipt(s)
                    </span>
                  )}
                </div>

                {editingReg.registration.payment_screenshot_path ? (
                  <div className="space-y-3">
                    {(editingReg.registration.payment_screenshot_path || '')
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((singlePath, idx, arr) => {
                        if (singlePath === 'manual-admin-entry') {
                          return (
                            <div
                              key={idx}
                              className="p-3 rounded-xl bg-indigo-500/10 border border-dashed border-indigo-500/30 text-indigo-300 text-xs text-center"
                            >
                              ⚡ Manual Admin Entry (Direct verification, no screenshot uploaded)
                            </div>
                          );
                        }

                        const url = getPublicScreenshotUrl(singlePath);

                        return (
                          <div
                            key={idx}
                            className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-amber-400">
                                {arr.length > 1
                                  ? idx === 0
                                    ? 'Receipt 1 (Initial Payment)'
                                    : `Receipt ${idx + 1} (Additional / Top-up)`
                                  : 'Payment Receipt'}
                              </span>
                              {url && (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 transition-colors"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>Open Full Image</span>
                                </a>
                              )}
                            </div>

                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block rounded-lg overflow-hidden border border-slate-800 bg-black/40 hover:border-amber-500/50 transition-colors group cursor-zoom-in"
                                title="Click to open full screenshot in new tab"
                              >
                                <img
                                  src={url}
                                  alt={`Payment screenshot ${idx + 1}`}
                                  className="w-full max-h-72 object-contain rounded-lg group-hover:scale-[1.01] transition-transform duration-200"
                                  loading="lazy"
                                />
                              </a>
                            ) : (
                              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-xs text-center">
                                ⚠️ Could not resolve receipt image URL
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-slate-400 text-xs text-center">
                    ℹ️ No payment screenshot attached to this registration.
                  </div>
                )}
              </div>

              {/* Form fields */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Receiving Account / Payment Mode *
                  </label>
                  <select
                    value={editUpiId}
                    onChange={(e) => setEditUpiId(e.target.value)}
                    className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500"
                  >
                    <optgroup label="🏦 Receiving UPI Accounts">
                      {knownAccounts.map((acc) => (
                        <option key={acc.upi_id} value={acc.upi_id} className="bg-slate-900">
                          {acc.accountName} ({acc.upi_id})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="💵 Cash Collections">
                      <option value={CANONICAL_CASH_ACCOUNT} className="bg-slate-900">
                        💵 Cash in Hand (Physical / Spot Cash)
                      </option>
                    </optgroup>
                    <optgroup label="✏️ Custom">
                      <option value="custom" className="bg-slate-900">✏️ Other / Custom UPI ID...</option>
                    </optgroup>
                  </select>
                </div>

                {editUpiId === 'custom' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                      Custom UPI ID *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. name@bank"
                      value={editCustomUpi}
                      onChange={(e) => setEditCustomUpi(e.target.value)}
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-amber-500/50 text-white font-mono outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Additional Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Verified via Bank passbook"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 p-3 sm:p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingReg(null)}
                disabled={savingEdit}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {savingEdit ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>💾 Save UPI Record</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
