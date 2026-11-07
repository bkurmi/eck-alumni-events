import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  X,
  Calendar,
  Edit2,
  Loader2,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import type { EventRegistration, PaymentVerification, Sponsorship, ECKEvent } from '../types';
import { getUpiAccountName, isCashAccount, CANONICAL_CASH_ACCOUNT } from '../lib/paymentRotation';
import { supabase } from '../lib/supabase';
import { isRealMobileNumber, formatDisplayMobile } from '../lib/registrations';
import { formatINR } from '../lib/expenses';
import { getBatchFromPassingYear } from '../lib/batchUtils';

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
  const [accountDropdownOpen, setAccountDropdownOpen] = useState<boolean>(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // Close account dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        accountDropdownRef.current &&
        !accountDropdownRef.current.contains(e.target as Node)
      ) {
        setAccountDropdownOpen(false);
      }
    };
    if (accountDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [accountDropdownOpen]);

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

      const isExplicitCash = isCashAccount(rawUpi) || isCashAccount(verif?.notes);
      const isUntagged = !rawUpi && !isExplicitCash;

      let assignedUpi: string;
      let qrLabel: string;
      if (isExplicitCash) {
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
        qrLabel = '⚠️ Untagged';
      }

      const paymentDate = reg.created_at.slice(0, 10);
      const amount = verif ? Number(verif.amount) : Number(reg.amount || 0);

      return {
        registration: reg,
        verification: verif,
        assignedUpi,
        qrLabel,
        isExplicitCash,
        isUntagged,
        isCash: isExplicitCash || isUntagged,
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
    const verifUpi = item.verification?.upi_id ? item.verification.upi_id.trim() : '';
    const isExplicitCash = isCashAccount(verifUpi) || isCashAccount(item.verification?.notes);
    const norm = verifUpi.toLowerCase();
    const isKnown = norm ? knownAccounts.some((a) => a.upi_id === norm) : false;

    // Check if this registration is untagged or has no verification record
    const hasExistingTag = !item.isUntagged && !!verifUpi;

    setEditingReg({
      registration: item.registration,
      verification: item.verification,
    });
    setAccountDropdownOpen(false);

    // Default to NOTHING pre-selected if untagged or no verification record
    if (!hasExistingTag) {
      setEditUpiId('');
      setEditCustomUpi('');
    } else if (isExplicitCash) {
      setEditUpiId(CANONICAL_CASH_ACCOUNT);
      setEditCustomUpi('');
    } else if (isKnown) {
      setEditUpiId(norm);
      setEditCustomUpi('');
    } else {
      setEditUpiId('custom');
      setEditCustomUpi(verifUpi);
    }

    setEditAmount(item.amount || item.registration.amount || 800);
    setEditNotes(item.verification?.notes || '');
  };

  // Save Edit
  const handleSaveEdit = async () => {
    if (!editingReg) return;

    if (!editUpiId || editUpiId === '') {
      alert('⚠️ Receiving Account is mandatory! Please select an account or Cash in Hand.');
      return;
    }

    if (editUpiId === 'custom' && !editCustomUpi.trim()) {
      alert('⚠️ Please specify the Custom UPI ID (mandatory).');
      return;
    }

    const finalUpi =
      editUpiId === 'custom'
        ? editCustomUpi.trim()
        : isCashAccount(editUpiId)
          ? CANONICAL_CASH_ACCOUNT
          : editUpiId.trim();

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
        setAccountDropdownOpen(false);
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

  // CSV Export for filtered selection
  const handleExportCSV = () => {
    if (activeLedgerTab === 'sponsorships') {
      const headers = [
        'Sponsor Name',
        'Category / Tier',
        'Amount (INR)',
        'Receiving UPI ID',
        'Date',
        'Contact Person',
        'Contact Phone',
        'Payment Status',
        'Payment Mode',
        'Transaction Ref',
        'Notes',
      ];
      const rows = filteredSponsorships.map((sp) => [
        `"${(sp.sponsor_name || '').replace(/"/g, '""')}"`,
        `"${(sp.category || '').replace(/"/g, '""')}"`,
        `"${sp.amount || 0}"`,
        `"${sp.receiving_upi_id || ''}"`,
        `"${formatDDMMYYYY((sp.created_at || '').slice(0, 10))}"`,
        `"${(sp.contact_person || '').replace(/"/g, '""')}"`,
        `"${formatDisplayMobile(sp.contact_phone || '', '')}"`,
        `"${sp.payment_status || 'CONFIRMED'}"`,
        `"${sp.payment_mode || 'UPI'}"`,
        `"${(sp.transaction_reference || '').replace(/"/g, '""')}"`,
        `"${(sp.notes || '').replace(/"/g, '""')}"`,
      ].join(','));

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute(
        'download',
        `ECK_Sponsorships_Report_${new Date().toISOString().slice(0, 10)}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const headers = [
      'Person Name',
      'Attendance Status',
      'Total Headcount',
      'Adult',
      'Kids (10+)',
      'Kids (<10)',
      'Contribution (INR)',
      'Credited UPI ID',
      'Registration Number',
      'Payment Date',
      'Verified By',
      'Mobile Number',
      'Passing Year',
      'Discipline',
      'City',
    ];

    const rows = filteredList.map((item) => {
      const reg = item.registration;
      const alumni = reg.alumni;
      const attStatus =
        reg.attendance_status === 'yes'
          ? 'Attending'
          : reg.attendance_status === 'payment_pending'
            ? 'Payment Pending'
            : reg.attendance_status === 'maybe'
              ? 'Maybe'
              : 'No';

      const isNotAttending = reg.attendance_status === 'no';
      const adults = isNotAttending
        ? 0
        : (reg.adults_count !== undefined && reg.adults_count !== null
          ? Number(reg.adults_count)
          : Math.max(1, Number(reg.number_of_attendees || 1) - Number(reg.children_above_7_count || 0) - Number(reg.children_under_7_count || 0)));
      const kidsAbove10 = isNotAttending ? 0 : Number(reg.children_above_7_count || 0);
      const kidsUnder10 = isNotAttending ? 0 : Number(reg.children_under_7_count || 0);
      const totalHeadcount = isNotAttending
        ? 0
        : (Number(reg.number_of_attendees) || (adults + kidsAbove10 + kidsUnder10));

      return [
        `"${(alumni?.name || '').replace(/"/g, '""')}"`,
        `"${attStatus}"`,
        `"${totalHeadcount}"`,
        `"${adults}"`,
        `"${kidsAbove10}"`,
        `"${kidsUnder10}"`,
        `"${item.amount}"`,
        `"${item.assignedUpi || 'Unassigned'}"`,
        `"${reg.registration_number || ''}"`,
        `"${formatDDMMYYYY(item.paymentDate)}"`,
        `"${item.verifiedBy || 'Not Verified'}"`,
        `"${formatDisplayMobile(alumni?.mobile, '')}"`,
        `"${alumni?.year_of_passing || ''}"`,
        `"${alumni?.engineering_discipline || ''}"`,
        `"${(alumni?.city || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `ECK_UPI_Report_${viewMode}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      {/* ── WhatsApp Broadcast Banner ── */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0d2818]/90 via-[#0a1f14] to-slate-950 border border-[#0d9616]/60 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl shrink-0">💳</span>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              UPI WhatsApp Broadcast
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Share account-wise collections report to WhatsApp, copy summary or export CSV!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="flex-1 sm:flex-none min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#025907] via-[#087f10] to-[#0d9616] hover:from-[#036809] hover:via-[#0a8e13] hover:to-[#0fa81a] border border-[#0d9616]/60 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-green-950/50 transition-all cursor-pointer active:scale-[0.98]"
            title="Broadcast report on WhatsApp"
          >
            <span>💬</span>
            <span>Broadcast Report</span>
          </button>
          <button
            type="button"
            onClick={handleCopySummary}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            title="Copy WhatsApp text summary"
          >
            <span>{copiedSummary ? '✓ Copied' : '📋 Copy'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            title="Download CSV to open in Excel"
          >
            <span>📥</span>
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* ── VIEW MODE SWITCHER ── */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5">
        <span className="text-xs sm:text-sm font-bold text-amber-400 block">
          Display Mode:
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer ${viewMode === 'overall'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-950/70 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            onClick={() => setViewMode('overall')}
          >
            <span>📊</span>
            <span>Overall Flat View</span>
          </button>
          <button
            type="button"
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer ${viewMode === 'daywise'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-950/70 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            onClick={() => setViewMode('daywise')}
          >
            <span>📅</span>
            <span>Day-wise View</span>
          </button>
        </div>
      </div>

      {/* ── MULTI-SELECT QR CODE CHECKBOXES ── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider">
            Select Receiving UPI ID Accounts ({selectedAccounts.length}/{allAccountKeys.length})
          </span>
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={selectAllAccounts}
              className="text-amber-400 hover:underline font-bold cursor-pointer"
            >
              Select All
            </button>
            <span className="text-slate-600">•</span>
            <button
              type="button"
              onClick={clearAllAccounts}
              className="text-amber-400 hover:underline font-bold cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        {/* 2-column responsive grid on mobile, 3 on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-2.5">
          {knownAccounts.map((acc) => {
            const isChecked = selectedAccounts.includes(acc.upi_id);
            const stats = accountStats[acc.upi_id] || { count: 0, totalAmount: 0, sponsorCount: 0, sponsorAmount: 0 };

            return (
              <label
                key={acc.upi_id}
                className={`p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${isChecked
                  ? 'bg-slate-900/90 border-amber-500 shadow-sm'
                  : 'bg-slate-950/50 hover:bg-slate-900 border-slate-800 opacity-60'
                  }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleAccount(acc.upi_id)}
                        className="w-4 h-4 rounded border-slate-700 text-amber-500 accent-amber-500 focus:ring-amber-500/30 cursor-pointer"
                      />
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold text-[10px]">
                        {acc.bankName}
                      </span>
                    </div>
                    <span className="text-slate-400 font-mono text-[10px] sm:text-[11px] truncate">
                      {stats.sponsorCount > 0 && stats.count > 0
                        ? `${stats.count} Reg + ${stats.sponsorCount} S`
                        : stats.sponsorCount > 0
                          ? `${stats.sponsorCount} Spons`
                          : `${stats.count} Regs`}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <strong className="block text-sm font-bold text-white truncate">
                      {acc.accountName}
                    </strong>
                    <span className="block text-[11px] text-slate-400 font-mono truncate mt-0.5" title={acc.upi_id}>
                      {acc.upi_id}
                    </span>
                  </div>
                </div>
                <div className="font-black text-amber-400 text-base sm:text-lg mt-1.5 tracking-tight">
                  ₹{formatINR(stats.totalAmount)}
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
                className={`p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${isChecked
                  ? 'bg-slate-900/90 border-amber-500 shadow-sm'
                  : 'bg-slate-950/50 hover:bg-slate-900 border-slate-800 opacity-60'
                  }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          toggleAccount(CANONICAL_CASH_ACCOUNT);
                          if (selectedAccounts.includes('unassigned')) toggleAccount('unassigned');
                        }}
                        className="w-4 h-4 rounded border-slate-700 text-amber-500 accent-amber-500 focus:ring-amber-500/30 cursor-pointer"
                      />
                      <span className="px-1.5 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-500/30 font-semibold text-[10px]">
                        💵 Cash
                      </span>
                    </div>
                    <span className="text-slate-400 font-mono text-[10px] sm:text-[11px] truncate">
                      {stats.count} Regs
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <strong className="block text-sm font-bold text-white truncate">
                      Cash in Hand
                    </strong>
                    <span className="block text-[11px] text-slate-400 truncate mt-0.5">
                      Spot Cash / Untagged
                    </span>
                  </div>
                </div>
                <div className="font-black text-amber-400 text-base sm:text-lg mt-1.5 tracking-tight">
                  ₹{formatINR(stats.totalAmount)}
                </div>
              </label>
            );
          })()}
        </div>
      </div>

      {/* ── LIVE SELECTION BANNER (Section 3: Total Amount & Account Selection Summary) ── */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-950 border border-amber-500/30 shadow-xl flex flex-col gap-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl shrink-0">🎯</span>
            <div>
              <div className="text-base sm:text-lg font-bold text-white tracking-tight">
                {selectedAccounts.length === allAccountKeys.length
                  ? `All (${selectedAccounts.length}) UPI Accounts Selected`
                  : selectedAccounts.length === 0
                    ? 'No Accounts Selected'
                    : `${selectedAccounts.length} UPI Account${selectedAccounts.length === 1 ? '' : 's'} Selected`}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {currentTotals.totalRegCount} matching registration{currentTotals.totalRegCount === 1 ? '' : 's'}
                {currentTotals.totalSponsorCount > 0
                  ? ` + ${currentTotals.totalSponsorCount} sponsorship${currentTotals.totalSponsorCount === 1 ? '' : 's'}`
                  : ''}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:items-end shrink-0">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              TOTAL AMOUNT
            </span>
            <div className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight">
              ₹{formatINR(currentTotals.totalAmount)}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800/60">
          {selectedAccounts.length === allAccountKeys.length ? (
            <span className="inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              ✓ Showing all {allAccountKeys.length} receiving accounts (including Sponsorships)
            </span>
          ) : selectedAccounts.length === 0 ? (
            <span className="inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400">
              ⚠️ No accounts selected (showing 0)
            </span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {selectedAccounts.map((key) => {
                const match = knownAccounts.find((a) => a.upi_id === key);
                const label = match
                  ? `${match.bankName} (${match.accountName})`
                  : isCashAccount(key) || key === CANONICAL_CASH_ACCOUNT || key === 'unassigned'
                    ? '💵 Cash in Hand'
                    : key;
                return (
                  <span
                    key={key}
                    className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800/90 border border-slate-700/80 text-slate-200"
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── DEDICATED VIEW TOGGLE (REGISTRATIONS vs SPONSORSHIPS) ── */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900 border border-slate-800">
        <button
          type="button"
          onClick={() => setActiveLedgerTab('registrations')}
          className={`flex-1 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer whitespace-nowrap ${activeLedgerTab === 'registrations'
            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
            : 'text-slate-400 hover:text-slate-200'
            }`}
        >
          <span>🎟️</span>
          <span>Registrations ({filteredList.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveLedgerTab('sponsorships')}
          className={`flex-1 min-h-[44px] px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer whitespace-nowrap ${activeLedgerTab === 'sponsorships'
            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
            : 'text-slate-400 hover:text-slate-200'
            }`}
        >
          <span>🤝</span>
          <span>Sponsorships ({filteredSponsorships.length})</span>
        </button>
      </div>

      {/* ── ATTENDANCE STATUS FILTER CHIPS & TOOLBAR ── */}
      <div className="space-y-3">
        {activeLedgerTab === 'registrations' && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 w-full">
            {(['all', 'yes', 'maybe', 'no'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setAttendanceFilter(status)}
                className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs sm:text-sm whitespace-nowrap shrink-0 transition-colors cursor-pointer ${attendanceFilter === status
                  ? 'border border-amber-500 bg-amber-500/10 text-amber-400 font-bold shadow-sm shadow-amber-500/10'
                  : 'border border-slate-800 bg-slate-900/90 text-slate-300 font-semibold hover:bg-slate-800'
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

        {/* Toolbar: Search on left, Date on right in single row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder={
                activeLedgerTab === 'registrations'
                  ? 'Search by Name, mobile, reg ID...'
                  : 'Search by Sponsor name, UPI...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[42px] text-base sm:text-sm pl-10 pr-9 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-white placeholder-slate-500 outline-none focus:border-amber-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-auto justify-between sm:justify-start">
            <span className="text-xs sm:text-sm font-bold text-slate-300 pl-1">Date:</span>
            <select
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="flex-1 sm:flex-initial min-h-[42px] text-base sm:text-sm px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 outline-none focus:border-amber-500 cursor-pointer font-medium"
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
            {/* Desktop Table (High Real-Estate Density, zero horizontal scrollbar) */}
            <div className="hidden md:block rounded-2xl border border-slate-800 bg-[#0d101d] shadow-xl overflow-hidden">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/90 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-2 w-[35px] text-center">#</th>
                    <th className="py-2.5 px-2.5 w-[220px] text-left">Sponsor</th>
                    <th className="py-2.5 px-2 w-[80px] text-left">Amount</th>
                    <th className="py-2.5 px-2 w-[170px] text-center">UPI ID</th>
                    <th className="py-2.5 px-2 w-[95px] text-center">Date</th>
                    <th className="py-2.5 px-1.5 w-[35px] text-center">
                      <Edit2 className="w-3.5 h-3.5 text-amber-500 mx-auto" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs text-slate-200">
                  {filteredSponsorships.map((sp, idx) => (
                    <tr
                      key={sp.id}
                      onClick={() => onEditSponsorship?.(sp)}
                      className="group hover:bg-slate-800/60 cursor-pointer transition-colors"
                    >
                      <td className="py-2 px-2 text-center text-slate-400 font-bold text-xs">{idx + 1}</td>
                      <td className="py-2 px-2.5 align-middle overflow-hidden text-left">
                        <div className="font-bold text-white group-hover:text-amber-400 transition-colors text-sm truncate" title={sp.sponsor_name}>
                          {sp.sponsor_name}
                        </div>
                        {(sp.contact_person || sp.category) && (
                          <div className="text-[11px] text-slate-400 truncate">
                            💼 {sp.contact_person || sp.category}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-left align-middle whitespace-nowrap">
                        <span className="text-sm font-black text-amber-400">
                          ₹{formatINR(Number(sp.amount || 0))}
                        </span>
                      </td>
                      <td className="py-2 px-2 align-middle text-center whitespace-nowrap overflow-hidden">
                        {isCashAccount(sp.receiving_upi_id) || sp.receiving_upi_id === CANONICAL_CASH_ACCOUNT ? (
                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-normal bg-rose-500/10 border border-rose-500/30 text-rose-400">
                            Cash in Hand
                          </span>
                        ) : !sp.receiving_upi_id ? (
                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-normal bg-rose-500/10 border border-rose-500/30 text-rose-400">
                            Untagged
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-mono font-normal bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 max-w-[160px] truncate" title={sp.receiving_upi_id}>
                            {sp.receiving_upi_id}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center align-middle whitespace-nowrap font-mono text-xs text-slate-300">
                        {formatDDMMYYYY(sp.created_at)}
                      </td>
                      <td className="py-2 px-1.5 text-center align-middle whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditSponsorship?.(sp);
                          }}
                          className="p-1 text-amber-500 hover:text-amber-400 hover:scale-110 transition-all cursor-pointer inline-flex items-center justify-center"
                          title="Edit Sponsorship"
                          aria-label="Edit Sponsorship"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Adaptive Cards */}
            <div className="md:hidden space-y-3">
              {filteredSponsorships.map((sp, idx) => (
                <div
                  key={sp.id}
                  onClick={() => onEditSponsorship?.(sp)}
                  className="p-4 rounded-2xl bg-[#111422] border border-slate-800/80 border-l-[3.5px] border-l-amber-500 shadow-md cursor-pointer hover:border-amber-500/40 transition-all flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-400">
                        #{idx + 1}
                      </span>
                      <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded">
                        SPONSOR
                      </span>
                      <span className="font-mono text-xs text-slate-300 bg-slate-800/80 border border-slate-700/50 px-2 py-0.5 rounded">
                        {formatDDMMYYYY(sp.created_at)}
                      </span>
                    </div>
                    <div className="font-black text-amber-400 text-xl tracking-tight">
                      ₹{formatINR(Number(sp.amount || 0))}
                    </div>
                  </div>
                  <div className="font-bold text-amber-400 text-base">{sp.sponsor_name}</div>
                  {(sp.contact_person || sp.category) && (
                    <div className="text-xs text-slate-400">
                      💼 {sp.contact_person || sp.category}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                        CREDITED TO:
                      </span>
                      {isCashAccount(sp.receiving_upi_id) || sp.receiving_upi_id === CANONICAL_CASH_ACCOUNT ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-400">
                          <span>💵</span>
                          <span>Cash in Hand</span>
                        </span>
                      ) : !sp.receiving_upi_id ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-400">
                          <span>⚠️</span>
                          <span>Untagged</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs font-mono font-bold px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/35 text-emerald-400 truncate max-w-[200px]">
                          {sp.receiving_upi_id}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditSponsorship?.(sp);
                      }}
                      className="min-h-[38px] px-3 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/35 text-amber-400 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ml-auto"
                      title="Edit Sponsorship"
                    >
                      <span>✏️</span>
                      <span>Edit</span>
                    </button>
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
            <div key={group.date} className="rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl overflow-hidden">
              <div className="p-3 sm:px-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-white text-sm">{formatDDMMYYYY(group.date)}</span>
                  <span className="text-xs text-slate-400">({group.subtotalCount} attendees)</span>
                </div>
                <div className="text-sm sm:text-base font-black text-amber-400">
                  Subtotal: ₹{formatINR(group.subtotalAmount)}
                </div>
              </div>

              {/* Desktop Table (High Real-Estate Density) */}
              <div className="hidden md:block overflow-hidden">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-xs font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-2 w-[35px] text-center">#</th>
                      <th className="py-2.5 px-2.5 w-[220px] text-left">Name</th>
                      <th className="py-2.5 px-2 w-[75px] text-left">Amount</th>
                      <th className="py-2.5 px-2 w-[170px] text-center">UPI ID</th>
                      <th className="py-2.5 px-2 w-[100px] text-center">Reg ID</th>
                      <th className="py-2.5 px-1.5 w-[35px] text-center">
                        <Edit2 className="w-3.5 h-3.5 text-amber-500 mx-auto" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs text-slate-200">
                    {group.items.map((item, idx) => (
                      <tr
                        key={item.registration.id}
                        onClick={() => handleOpenEdit(item)}
                        className="group hover:bg-slate-800/60 cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-2 text-center text-slate-400 font-bold text-xs">{idx + 1}</td>
                        <td className="py-2 px-2.5 align-middle overflow-hidden text-left">
                          <span className="font-bold text-white text-sm truncate block" title={item.registration.alumni?.name}>
                            {item.registration.alumni?.name || 'Unknown Alumni'}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-left align-middle whitespace-nowrap">
                          <span className="text-sm font-black text-amber-400">
                            ₹{formatINR(item.amount)}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center align-middle whitespace-nowrap overflow-hidden">
                          {item.assignedUpi && item.assignedUpi !== CANONICAL_CASH_ACCOUNT && !item.isUntagged ? (
                            <span
                              className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-mono font-normal bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 max-w-[160px] truncate"
                              title={item.assignedUpi}
                            >
                              {item.assignedUpi}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-normal bg-rose-500/10 border border-rose-500/30 text-rose-400">
                              Untagged
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center align-middle whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/10 border border-amber-500/25 text-amber-400">
                            {item.registration.registration_number}
                          </span>
                        </td>
                        <td className="py-2 px-1.5 text-center align-middle whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(item);
                            }}
                            className="p-1 text-amber-500 hover:text-amber-400 hover:scale-110 transition-all cursor-pointer inline-flex items-center justify-center"
                            title="Edit UPI ID"
                            aria-label="Edit UPI ID"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Adaptive Cards */}
              <div className="md:hidden space-y-3">
                {group.items.map((item, idx) => {
                  const alumni = item.registration.alumni;

                  return (
                    <div
                      key={item.registration.id}
                      onClick={() => handleOpenEdit(item)}
                      className={`p-4 rounded-2xl bg-[#111422] border border-slate-800/80 shadow-md cursor-pointer transition-all flex flex-col gap-2 hover:border-amber-500/30 ${item.assignedUpi && item.assignedUpi !== CANONICAL_CASH_ACCOUNT && !item.isUntagged
                        ? 'border-l-[3.5px] border-l-emerald-500'
                        : 'border-l-[3.5px] border-l-red-500 bg-gradient-to-br from-red-500/5 to-[#111422]'
                        }`}
                    >
                      {/* Header: #1, REG-00305, Date | Amount */}
                      <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-400">
                            #{idx + 1}
                          </span>
                          <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded">
                            {item.registration.registration_number}
                          </span>
                          <span className="font-mono text-xs text-slate-300 bg-slate-800/80 border border-slate-700/50 px-2 py-0.5 rounded">
                            {formatDDMMYYYY(item.paymentDate)}
                          </span>
                        </div>
                        <div className="font-black text-amber-400 text-xl tracking-tight">
                          ₹{formatINR(item.amount)}
                        </div>
                      </div>

                      {/* Body: Name & Attendance Status Badge */}
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <h4 className="text-base font-bold text-white truncate" title={alumni?.name}>
                          {alumni?.name || 'Unknown Alumni'}
                        </h4>
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase shrink-0 ${item.registration.attendance_status === 'yes'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : item.registration.attendance_status === 'payment_pending'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : item.registration.attendance_status === 'maybe'
                              ? 'bg-slate-800 text-slate-300 border border-slate-700'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}>
                          {item.registration.attendance_status === 'yes' ? 'ATTENDING' : item.registration.attendance_status === 'maybe' ? 'MAYBE' : 'NOT ATTENDING'}
                        </span>
                      </div>

                      {/* Alumnus Meta: Batch, Discipline & City */}
                      <div className="text-xs text-slate-400">
                        <span>Batch {alumni?.batch || (alumni?.year_of_passing ? getBatchFromPassingYear(alumni.year_of_passing) : '—')}</span>
                        <span className="mx-1">•</span>
                        <span>{alumni?.engineering_discipline || 'Other'}</span>
                        {alumni?.city && (
                          <>
                            <span className="mx-1">•</span>
                            <span>📍 {alumni.city}</span>
                          </>
                        )}
                      </div>

                      {/* Footer: Credited Account & Edit button */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                          <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                            CREDITED TO:
                          </span>
                          {item.assignedUpi && item.assignedUpi !== CANONICAL_CASH_ACCOUNT && !item.isUntagged ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/35 text-emerald-400 truncate max-w-[220px]" title={item.assignedUpi}>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                              <span>{item.qrLabel.split('(')[0]?.trim() || item.assignedUpi}</span>
                              <span className="opacity-75 font-normal">{item.assignedUpi}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 text-red-400">
                              <span className="text-amber-400 text-xs">⚠️</span>
                              <span>Untagged</span>
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(item);
                          }}
                          className="min-h-[38px] px-3 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/35 text-amber-400 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ml-auto"
                          title="Edit UPI Account"
                        >
                          <span>✏️</span>
                          <span>Edit</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* OVERALL FLAT VIEW */
        <div className="space-y-3">
          {/* Desktop Table (Matching production screenshot pixel-for-pixel) */}
          <div className="hidden md:block rounded-2xl border border-slate-800 bg-[#0d101d] shadow-xl overflow-hidden">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/90 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-2 w-[35px] text-center">#</th>
                  <th className="py-2.5 px-2.5 w-[220px] text-left">Name</th>
                  <th className="py-2.5 px-2 w-[75px] text-left">Amount</th>
                  <th className="py-2.5 px-2 w-[170px] text-center">UPI ID</th>
                  <th className="py-2.5 px-2 w-[100px] text-center">Reg ID</th>
                  <th className="py-2.5 px-2 w-[90px] text-center">Date</th>
                  <th className="py-2.5 px-1.5 w-[35px] text-center">
                    <Edit2 className="w-3.5 h-3.5 text-amber-500 mx-auto" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs text-slate-200">
                {filteredList.map((item, idx) => (
                  <tr
                    key={item.registration.id}
                    onClick={() => handleOpenEdit(item)}
                    className="group hover:bg-slate-800/60 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-2 text-center text-slate-400 font-bold text-xs">{idx + 1}</td>
                    <td className="py-2 px-2.5 align-middle overflow-hidden text-left">
                      <span className="font-bold text-white text-sm truncate block" title={item.registration.alumni?.name}>
                        {item.registration.alumni?.name || 'Unknown Alumni'}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-left align-middle whitespace-nowrap">
                      <span className="text-sm font-black text-amber-400">
                        ₹{formatINR(item.amount)}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center align-middle whitespace-nowrap overflow-hidden">
                      {item.assignedUpi && item.assignedUpi !== CANONICAL_CASH_ACCOUNT && !item.isUntagged ? (
                        <span
                          className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-mono font-normal bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 max-w-[160px] truncate"
                          title={item.assignedUpi}
                        >
                          {item.assignedUpi}
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-normal bg-rose-500/10 border border-rose-500/30 text-rose-400">
                          Untagged
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center align-middle whitespace-nowrap">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/10 border border-amber-500/25 text-amber-400">
                        {item.registration.registration_number}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center align-middle whitespace-nowrap font-mono text-xs text-slate-300">
                      {formatDDMMYYYY(item.paymentDate)}
                    </td>
                    <td className="py-2 px-1.5 text-center align-middle whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(item);
                        }}
                        className="p-1 text-amber-500 hover:text-amber-400 hover:scale-110 transition-all cursor-pointer inline-flex items-center justify-center"
                        title="Edit UPI ID"
                        aria-label="Edit UPI ID"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Adaptive Cards */}
          <div className="md:hidden space-y-3">
            {filteredList.map((item, idx) => {
              const alumni = item.registration.alumni;

              return (
                <div
                  key={item.registration.id}
                  onClick={() => handleOpenEdit(item)}
                  className={`p-4 rounded-2xl bg-[#111422] border border-slate-800/80 shadow-md cursor-pointer transition-all flex flex-col gap-2 hover:border-amber-500/30 ${item.assignedUpi && item.assignedUpi !== CANONICAL_CASH_ACCOUNT && !item.isUntagged
                    ? 'border-l-[3.5px] border-l-emerald-500'
                    : 'border-l-[3.5px] border-l-red-500 bg-gradient-to-br from-red-500/5 to-[#111422]'
                    }`}
                >
                  {/* Header: #1, REG-00305, Date | Amount */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-400">
                        #{idx + 1}
                      </span>
                      <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded">
                        {item.registration.registration_number}
                      </span>
                      <span className="font-mono text-xs text-slate-300 bg-slate-800/80 border border-slate-700/50 px-2 py-0.5 rounded">
                        {formatDDMMYYYY(item.paymentDate)}
                      </span>
                    </div>
                    <div className="font-black text-amber-400 text-xl tracking-tight">
                      ₹{formatINR(item.amount)}
                    </div>
                  </div>

                  {/* Body: Name & Attendance Status Badge */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <h4 className="text-base font-bold text-white truncate" title={alumni?.name}>
                      {alumni?.name || 'Unknown Alumni'}
                    </h4>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase shrink-0 ${item.registration.attendance_status === 'yes'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : item.registration.attendance_status === 'payment_pending'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : item.registration.attendance_status === 'maybe'
                          ? 'bg-slate-800 text-slate-300 border border-slate-700'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                      {item.registration.attendance_status === 'yes' ? 'ATTENDING' : item.registration.attendance_status === 'maybe' ? 'MAYBE' : 'NOT ATTENDING'}
                    </span>
                  </div>

                  {/* Alumnus Meta: Batch, Discipline & City */}
                  <div className="text-xs text-slate-400">
                    <span>Batch {alumni?.batch || (alumni?.year_of_passing ? getBatchFromPassingYear(alumni.year_of_passing) : '—')}</span>
                    <span className="mx-1">•</span>
                    <span>{alumni?.engineering_discipline || 'Other'}</span>
                    {alumni?.city && (
                      <>
                        <span className="mx-1">•</span>
                        <span>📍 {alumni.city}</span>
                      </>
                    )}
                  </div>

                  {/* Footer: Credited Account & Edit button */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                        CREDITED TO:
                      </span>
                      {item.assignedUpi && item.assignedUpi !== CANONICAL_CASH_ACCOUNT && !item.isUntagged ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/35 text-emerald-400 truncate max-w-[220px]" title={item.assignedUpi}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span>{item.qrLabel.split('(')[0]?.trim() || item.assignedUpi}</span>
                          <span className="opacity-75 font-normal">{item.assignedUpi}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 text-red-400">
                          <span className="text-amber-400 text-xs">⚠️</span>
                          <span>Untagged</span>
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(item);
                      }}
                      className="min-h-[38px] px-3 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/35 text-amber-400 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ml-auto"
                      title="Edit UPI Account"
                    >
                      <span>✏️</span>
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── EDIT UPI MODAL ── */}
      {editingReg && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => {
            if (!savingEdit) {
              setEditingReg(null);
              setAccountDropdownOpen(false);
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-md max-h-[85vh] sm:max-h-[80vh] flex flex-col bg-slate-900 border-t sm:border border-amber-500/30 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-800 bg-slate-950/50">
              <div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                  {editingReg.registration.registration_number}
                </span>
                <h2 className="text-sm sm:text-base font-bold text-white mt-0.5">
                  Record / Change Receiving UPI ID
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingReg(null);
                  setAccountDropdownOpen(false);
                }}
                disabled={savingEdit}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 tab-scrollbar space-y-3.5">
              {/* Summary */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <strong className="block text-white text-xs sm:text-sm font-bold truncate">
                    {editingReg.registration.alumni?.name}
                  </strong>
                  <span className="text-[11px] text-slate-400 block mt-0.5 truncate">
                    Batch {editingReg.registration.alumni?.batch || (editingReg.registration.alumni?.year_of_passing ? getBatchFromPassingYear(editingReg.registration.alumni.year_of_passing) : '—')} • {formatDDMMYYYY(editingReg.registration.created_at)}
                  </span>
                </div>
                <span className="text-sm sm:text-base font-mono font-bold text-emerald-400 shrink-0">
                  ₹{editingReg.registration.amount}
                </span>
              </div>

              {/* Notes Display */}
              {editingReg.verification?.notes && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                  <strong className="block text-amber-400 mb-0.5 text-[11px]">📝 Notes:</strong>
                  <span>{editingReg.verification.notes}</span>
                </div>
              )}

              {/* Payment Screenshot Display */}
              <div className="space-y-1.5">
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
                  <div className="space-y-2">
                    {(editingReg.registration.payment_screenshot_path || '')
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((singlePath, idx, arr) => {
                        if (singlePath === 'manual-admin-entry') {
                          return (
                            <div
                              key={idx}
                              className="p-2.5 rounded-xl bg-indigo-500/10 border border-dashed border-indigo-500/30 text-indigo-300 text-xs text-center"
                            >
                              ⚡ Manual Admin Entry (Direct verification, no screenshot uploaded)
                            </div>
                          );
                        }

                        const url = getPublicScreenshotUrl(singlePath);

                        return (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5"
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
                                  className="inline-flex items-center gap-1.5 min-h-[44px] px-2.5 py-1 rounded-lg text-xs font-semibold text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 transition-colors"
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
                                  className="w-full max-h-40 sm:max-h-52 object-contain rounded-lg group-hover:scale-[1.01] transition-transform duration-200"
                                  loading="lazy"
                                />
                              </a>
                            ) : (
                              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-xs text-center">
                                ⚠️ Could not resolve receipt image URL
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-slate-400 text-xs text-center">
                    ℹ️ No payment screenshot attached to this registration.
                  </div>
                )}
              </div>

              {/* Form fields */}
              <div className="space-y-3">
                <div ref={accountDropdownRef} className="relative">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-200">
                      Receiving Account / Payment Mode <span className="text-rose-400">*</span>
                    </label>
                    {!editUpiId && (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                        Mandatory
                      </span>
                    )}
                  </div>

                  {/* Trigger Button */}
                  <button
                    type="button"
                    onClick={() => setAccountDropdownOpen((prev) => !prev)}
                    className={`w-full min-h-[44px] text-xs px-3 py-2 rounded-xl bg-slate-950 border flex items-center justify-between gap-2 transition-all cursor-pointer ${!editUpiId
                        ? 'border-amber-500/60 ring-1 ring-amber-500/25 bg-amber-500/5 text-amber-300'
                        : 'border-slate-700 hover:border-slate-600 text-white'
                      }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 truncate text-left">
                      {!editUpiId ? (
                        <span className="text-amber-300/90 font-medium truncate flex items-center gap-1.5 text-xs">
                          <span>⚠️</span>
                          <span>-- Select Receiving Account --</span>
                        </span>
                      ) : editUpiId === CANONICAL_CASH_ACCOUNT ? (
                        <span className="text-emerald-400 font-semibold truncate text-xs flex items-center gap-1.5">
                          <span>💵</span>
                          <span>Cash in Hand (Physical / Spot Cash)</span>
                        </span>
                      ) : editUpiId === 'custom' ? (
                        <span className="text-amber-300 font-semibold truncate text-xs flex items-center gap-1.5">
                          <span>✏️</span>
                          <span>Custom UPI: {editCustomUpi || '(Specify below)'}</span>
                        </span>
                      ) : (
                        (() => {
                          const acc = knownAccounts.find((a) => a.upi_id === editUpiId);
                          return (
                            <span className="text-xs text-slate-100 font-medium truncate flex items-center gap-1.5 w-full justify-between">
                              <span className="font-semibold text-white truncate shrink-0 max-w-[50%]">
                                {acc?.accountName || editUpiId}
                              </span>
                              <span className="text-[11px] font-mono text-slate-400 truncate flex-1 text-right">
                                {editUpiId}
                              </span>
                            </span>
                          );
                        })()
                      )}
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${accountDropdownOpen ? 'rotate-180 text-amber-400' : ''
                        }`}
                    />
                  </button>

                  {/* Dropdown Options Popup */}
                  {accountDropdownOpen && (
                    <div className="mt-1.5 w-full rounded-xl bg-slate-950 border border-slate-700 shadow-2xl overflow-hidden z-30 animate-in fade-in zoom-in-95 duration-150">
                      <div className="p-1 max-h-56 sm:max-h-64 overflow-y-auto tab-scrollbar space-y-0.5">
                        {/* UPI Accounts Header */}
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-900/60 rounded">
                          🏦 Receiving UPI Accounts
                        </div>

                        {knownAccounts.map((acc) => {
                          const isSelected = editUpiId === acc.upi_id;
                          return (
                            <button
                              type="button"
                              key={acc.upi_id}
                              onClick={() => {
                                setEditUpiId(acc.upi_id);
                                setAccountDropdownOpen(false);
                              }}
                              className={`w-full min-h-[44px] px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${isSelected
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'hover:bg-slate-900 text-slate-200 border border-transparent'
                                }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
                                <span
                                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-amber-400 bg-amber-400' : 'border-slate-600'
                                    }`}
                                >
                                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                                </span>
                                <span className="text-[11px] sm:text-xs font-semibold text-slate-100 truncate shrink-0 max-w-[42%] sm:max-w-[48%]">
                                  {acc.accountName}
                                </span>
                                <span className="text-[10px] sm:text-[11px] font-mono text-slate-400 truncate flex-1 text-right">
                                  {acc.upi_id}
                                </span>
                              </div>
                            </button>
                          );
                        })}

                        {/* Cash Collections Header */}
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-900/60 rounded mt-1">
                          💵 Cash Collections
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditUpiId(CANONICAL_CASH_ACCOUNT);
                            setAccountDropdownOpen(false);
                          }}
                          className={`w-full min-h-[44px] px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${editUpiId === CANONICAL_CASH_ACCOUNT
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'hover:bg-slate-900 text-slate-200 border border-transparent'
                            }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
                            <span
                              className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${editUpiId === CANONICAL_CASH_ACCOUNT ? 'border-amber-400 bg-amber-400' : 'border-slate-600'
                                }`}
                            >
                              {editUpiId === CANONICAL_CASH_ACCOUNT && (
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                              )}
                            </span>
                            <span className="text-[11px] sm:text-xs font-semibold text-emerald-400 truncate">
                              💵 Cash in Hand (Physical / Spot Cash)
                            </span>
                          </div>
                        </button>

                        {/* Custom Header */}
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-900/60 rounded mt-1">
                          ✏️ Custom
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditUpiId('custom');
                            setAccountDropdownOpen(false);
                          }}
                          className={`w-full min-h-[44px] px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${editUpiId === 'custom'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'hover:bg-slate-900 text-slate-200 border border-transparent'
                            }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
                            <span
                              className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${editUpiId === 'custom' ? 'border-amber-400 bg-amber-400' : 'border-slate-600'
                                }`}
                            >
                              {editUpiId === 'custom' && (
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                              )}
                            </span>
                            <span className="text-[11px] sm:text-xs font-semibold text-amber-300 truncate">
                              ✏️ Other / Custom UPI ID...
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {editUpiId === 'custom' && (
                  <div className="animate-in fade-in slide-in-from-top-1 duration-150">
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                      Custom UPI ID <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. name@bank (Mandatory)"
                      value={editCustomUpi}
                      onChange={(e) => setEditCustomUpi(e.target.value)}
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-amber-500/50 text-white font-mono outline-none focus:border-amber-400"
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
            <div className="shrink-0 p-3 sm:p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between gap-3">
              <div className="text-[11px] text-slate-400 truncate">
                {!editUpiId && (
                  <span className="text-amber-400 font-medium">⚠️ Account selection is mandatory</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingReg(null);
                    setAccountDropdownOpen(false);
                  }}
                  disabled={savingEdit}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={savingEdit || !editUpiId || (editUpiId === 'custom' && !editCustomUpi.trim())}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
        </div>
      )}
    </div>
  );
};
