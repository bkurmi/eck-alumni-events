import React, { useState, useMemo, useEffect } from 'react';
import type { EventRegistration, PaymentVerification } from '../types';
import { DEFAULT_UPI_CONFIGS, UPI_ACCOUNT_NAMES } from '../lib/paymentRotation';
import { supabase } from '../lib/supabase';

interface UpiReconciliationReportProps {
  registrations: EventRegistration[];
  verifications: PaymentVerification[];
  onSaveVerification: (
    registrationId: string,
    upiId: string,
    amount: number,
    notes?: string
  ) => Promise<boolean>;
  onRefresh: () => void;
  loading?: boolean;
  currentUserEmail?: string;
}

interface KnownAccount {
  upi_id: string;
  label: string;
  badge: string;
  bankName: string;
  accountName: string;
}

const getPublicScreenshotUrl = (path: string | null | undefined) => {
  if (!path) return null;
  const firstPath = path.split(',')[0]?.trim();
  if (!firstPath) return null;
  if (firstPath.startsWith('http://') || firstPath.startsWith('https://')) return firstPath;
  const { data } = supabase.storage.from('payment-screenshots').getPublicUrl(firstPath);
  return data?.publicUrl || null;
};


// Receiving accounts tracked specifically for UPI Reconciliation Reporting
const RECONCILIATION_ACCOUNTS: { upi_id: string; bankName: string; accountName: string }[] = [
  ...DEFAULT_UPI_CONFIGS.map((c, idx) => {
    let bank = 'UPI';
    const upi = c.upi_id.toLowerCase().trim();
    if (upi.includes('sbi')) bank = 'SBI';
    else if (upi.includes('axis')) bank = 'Axis';
    else if (upi.includes('ybl')) bank = 'Yes Bank';
    else if (upi.includes('ibl')) bank = 'ICICI';
    return {
      upi_id: upi,
      bankName: bank,
      accountName: c.account_name || UPI_ACCOUNT_NAMES[upi] || `Account ${idx + 1}`,
    };
  }),
  {
    upi_id: '9799951857@upi',
    bankName: 'UPI',
    accountName: UPI_ACCOUNT_NAMES['9799951857@upi'] || 'Chetan',
  },
];

export const UpiReconciliationReport: React.FC<UpiReconciliationReportProps> = ({
  registrations,
  verifications,
  onSaveVerification,
  onRefresh,
  loading = false,
  currentUserEmail,
}) => {
  // Known accounts list specifically for reconciliation reporting
  const knownAccounts: KnownAccount[] = useMemo(() => {
    const list: KnownAccount[] = RECONCILIATION_ACCOUNTS.map((c) => ({
      upi_id: c.upi_id.toLowerCase().trim(),
      label: `${c.accountName} (${c.bankName})`,
      badge: c.accountName,
      bankName: c.bankName,
      accountName: c.accountName,
    }));

    // Include any verified UPI IDs from database not already in default list
    verifications.forEach((v) => {
      if (!v.upi_id) return;
      const upi = v.upi_id.toLowerCase().trim();
      if (!list.some((a) => a.upi_id === upi)) {
        let bank = 'UPI';
        if (upi.includes('sbi')) bank = 'SBI';
        else if (upi.includes('axis')) bank = 'Axis';
        else if (upi.includes('ybl')) bank = 'Yes Bank';
        else if (upi.includes('ibl')) bank = 'ICICI';
        const name = UPI_ACCOUNT_NAMES[upi] || upi;
        list.push({
          upi_id: upi,
          label: `${name} (${bank})`,
          badge: name,
          bankName: bank,
          accountName: name,
        });
      }
    });

    return list;
  }, [verifications]);

  // All filterable account keys: known accounts + 'unassigned'
  const allAccountKeys = useMemo(() => {
    return [...knownAccounts.map((a) => a.upi_id), 'unassigned'];
  }, [knownAccounts]);

  // Selected QR Checkbox accounts (Multi-select)
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(allAccountKeys);

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
  // Date strictly comes from event_registrations (created_at)
  const enrichedList = useMemo(() => {
    return registrations.map((reg) => {
      const verif = verifByRegId.get(reg.id) || reg.payment_verifications?.[0];
      const assignedUpi = verif?.upi_id ? verif.upi_id.toLowerCase().trim() : null;
      const paymentDate = reg.created_at.slice(0, 10);
      const amount = verif ? Number(verif.amount) : Number(reg.amount || 0);

      // Match friendly QR label
      const matchedAccount = knownAccounts.find((a) => a.upi_id === assignedUpi);
      const qrLabel = matchedAccount
        ? matchedAccount.label
        : assignedUpi
          ? `Custom (${assignedUpi})`
          : '⚠️ Not Tagged';

      return {
        registration: reg,
        verification: verif,
        assignedUpi,
        qrLabel,
        paymentDate,
        amount,
        verifiedBy: verif?.verified_by || null,
        screenshotUrl: getPublicScreenshotUrl(reg.payment_screenshot_path),
        isVerified: !!verif && verif.verified_status === 'VERIFIED',
      };
    }).sort((a, b) => {
      const regA = a.registration.registration_number || '';
      const regB = b.registration.registration_number || '';
      return regA.localeCompare(regB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [registrations, verifByRegId, knownAccounts]);

  // Attendance Counts for the filter chips
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

  // Individual Account Tallies (Reflects active attendance filter)
  const accountStats = useMemo(() => {
    const stats: Record<string, { count: number; totalAmount: number }> = {};
    knownAccounts.forEach((acc) => {
      stats[acc.upi_id] = { count: 0, totalAmount: 0 };
    });
    stats['unassigned'] = { count: 0, totalAmount: 0 };

    enrichedList.forEach((item) => {
      if (attendanceFilter !== 'all' && item.registration.attendance_status !== attendanceFilter) {
        return;
      }
      const key = item.assignedUpi || 'unassigned';
      if (!stats[key]) {
        stats[key] = { count: 0, totalAmount: 0 };
      }
      stats[key].count++;
      stats[key].totalAmount += item.amount;
    });

    return stats;
  }, [enrichedList, knownAccounts, attendanceFilter]);

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

  // Filtered List based on:
  // 1. Attendance Status Filter
  // 2. Multi-Selected QR Checkboxes
  // 3. Date Filter
  // 4. Search Query
  const filteredList = useMemo(() => {
    return enrichedList.filter((item) => {
      // Attendance status filter
      if (attendanceFilter !== 'all' && item.registration.attendance_status !== attendanceFilter) {
        return false;
      }

      // QR account filter
      const key = item.assignedUpi || 'unassigned';
      if (!selectedAccounts.includes(key)) {
        return false;
      }

      // Date filter
      if (selectedDateFilter !== 'all' && item.paymentDate !== selectedDateFilter) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const alumni = item.registration.alumni;
        const matchesName = alumni?.name?.toLowerCase().includes(q);
        const matchesRegNum = item.registration.registration_number?.toLowerCase().includes(q);
        const matchesMobile = alumni?.mobile?.includes(q);
        const matchesUpi = item.assignedUpi?.includes(q);
        if (!matchesName && !matchesRegNum && !matchesMobile && !matchesUpi) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const regA = a.registration.registration_number || '';
      const regB = b.registration.registration_number || '';
      return regA.localeCompare(regB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [enrichedList, attendanceFilter, selectedAccounts, selectedDateFilter, searchQuery]);

  // Totals for the currently active filtered view
  const currentTotals = useMemo(() => {
    const totalCount = filteredList.length;
    const totalAmount = filteredList.reduce((sum, item) => sum + item.amount, 0);
    return { totalCount, totalAmount };
  }, [filteredList]);

  // Grouped by Date (Used when viewMode === 'daywise')
  const groupedByDate = useMemo(() => {
    const groups: {
      date: string;
      items: typeof filteredList;
      subtotalAmount: number;
      subtotalCount: number;
    }[] = [];

    const map = new Map<string, typeof filteredList>();

    filteredList.forEach((item) => {
      const d = item.paymentDate || 'No Date';
      if (!map.has(d)) {
        map.set(d, []);
      }
      map.get(d)!.push(item);
    });

    const sortedDates = Array.from(map.keys()).sort().reverse();

    sortedDates.forEach((d) => {
      const items = map.get(d)!.sort((a, b) => {
        const regA = a.registration.registration_number || '';
        const regB = b.registration.registration_number || '';
        return regA.localeCompare(regB, undefined, { numeric: true, sensitivity: 'base' });
      });
      const subtotalAmount = items.reduce((sum, i) => sum + i.amount, 0);
      groups.push({
        date: d,
        items,
        subtotalAmount,
        subtotalCount: items.length,
      });
    });

    return groups;
  }, [filteredList]);

  // Open Edit Modal
  const handleOpenEdit = (item: (typeof enrichedList)[0]) => {
    const initialUpi = item.assignedUpi || '';
    const isKnown = knownAccounts.some((a) => a.upi_id === initialUpi);

    setEditingReg({
      registration: item.registration,
      verification: item.verification,
    });
    setEditUpiId(isKnown ? initialUpi : initialUpi ? 'custom' : knownAccounts[0]?.upi_id || '');
    setEditCustomUpi(isKnown ? '' : initialUpi);
    setEditAmount(item.amount || item.registration.amount || 800);
    setEditNotes(item.verification?.notes || '');
  };

  // Save Edit
  const handleSaveEdit = async () => {
    if (!editingReg) return;
    const finalUpi = editUpiId === 'custom' ? editCustomUpi.trim().toLowerCase() : editUpiId.trim().toLowerCase();

    if (!finalUpi) {
      alert('Please select or specify a UPI ID');
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

  // CSV Export for filtered selection
  const handleExportCSV = () => {
    const headers = [
      'Person Name',
      'Attendance Status',
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
      const alumni = item.registration.alumni;
      const attStatus = item.registration.attendance_status === 'yes' ? 'Attending' : item.registration.attendance_status === 'maybe' ? 'Maybe' : 'No';
      return [
        `"${alumni?.name || ''}"`,
        `"${attStatus}"`,
        `"${item.amount}"`,
        `"${item.assignedUpi || 'Unassigned'}"`,
        `"${item.registration.registration_number}"`,
        `"${formatDDMMYYYY(item.paymentDate)}"`,
        `"${item.verifiedBy || 'Not Verified'}"`,
        `"${alumni?.mobile || ''}"`,
        `"${alumni?.year_of_passing || ''}"`,
        `"${alumni?.engineering_discipline || ''}"`,
        `"${alumni?.city || ''}"`,
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

  // Build WhatsApp Summary Text
  const buildWhatsAppSummaryText = () => {
    let text = `*ECK-RTU Alumni DeepAura 2K26 — UPI Reconciliation Report*\n`;
    text += `📊 *View:* ${viewMode === 'daywise' ? 'Day-wise Breakdown' : 'Overall Consolidated'}\n`;
    text += `🎟️ *Attendance Filter:* ${attendanceFilter.toUpperCase()}\n`;
    text += `💰 *Selected Total:* ₹${currentTotals.totalAmount.toLocaleString('en-IN')}\n`;
    text += `👥 *Total Registrations:* ${currentTotals.totalCount}\n`;
    text += `📅 *Generated On:* ${new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })}\n\n`;

    if (viewMode === 'daywise') {
      groupedByDate.forEach((group) => {
        text += `\n🗓️ *Date: ${formatDDMMYYYY(group.date)}* (${group.subtotalCount} people • ₹${group.subtotalAmount.toLocaleString('en-IN')})\n`;
        group.items.forEach((item, idx) => {
          text += `  ${idx + 1}. [${item.registration.registration_number}] ${item.registration.alumni?.name || 'Alumnus'} - ₹${item.amount} [${item.assignedUpi || 'Unassigned'}]\n`;
        });
      });
    } else {
      filteredList.forEach((item, idx) => {
        text += `${idx + 1}. [${item.registration.registration_number}] ${item.registration.alumni?.name || 'Alumnus'} — ₹${item.amount} [${item.assignedUpi || 'Unassigned'}] (Date: ${formatDDMMYYYY(item.paymentDate)})\n`;
      });
    }

    return text;
  };

  // Copy WhatsApp Summary
  const handleCopySummary = () => {
    const text = buildWhatsAppSummaryText();
    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  // Broadcast / Share Report on WhatsApp
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

  // Format date display (e.g., Sun, 11 Oct 2026)
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr || dateStr === 'No Date') return 'No Date Recorded';
    try {
      const clean = dateStr.slice(0, 10);
      const parts = clean.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('en-IN', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
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

  // Render a Mobile-First Transaction Card for mobile screens (<= 640px)
  const renderMobileCard = (item: (typeof enrichedList)[0], index: number) => {
    const alumni = item.registration.alumni;
    const isUnassigned = !item.assignedUpi;
    const hasMultipleGuests =
      item.registration.attendance_status === 'yes' && item.registration.number_of_attendees > 1;

    return (
      <div
        key={item.registration.id}
        className={`upi-m-card ${isUnassigned ? 'upi-m-card-unassigned' : 'upi-m-card-tagged'}`}
      >
        {/* Card Header: Index, Reg ID, Date, Amount */}
        <div className="upi-m-card-header">
          <div className="upi-m-card-meta">
            <span className="upi-m-card-idx font-mono">#{index + 1}</span>
            <span className="reg-id-badge">{item.registration.registration_number}</span>
            <span className="upi-m-card-date font-mono">{formatDDMMYYYY(item.paymentDate)}</span>
          </div>
          <div className="upi-m-card-amount font-accent">
            ₹{item.amount.toLocaleString('en-IN')}
          </div>
        </div>

        {/* Card Body: Alumnus Name & Academic Background */}
        <div className="upi-m-card-body">
          <div className="upi-m-name-row">
            <h4 className="upi-m-name" title={alumni?.name || 'Unknown Alumni'}>
              {alumni?.name || 'Unknown Alumni'}
            </h4>
            <span className={`status-pill pill-${item.registration.attendance_status}`}>
              {item.registration.attendance_status === 'yes'
                ? `Attending${hasMultipleGuests ? ` (${item.registration.number_of_attendees})` : ''}`
                : item.registration.attendance_status === 'maybe'
                ? 'Maybe'
                : 'No'}
            </span>
          </div>
          <div className="upi-m-alumni-meta">
            <span>Batch {alumni?.year_of_passing || '—'}</span>
            <span className="meta-sep">•</span>
            <span>{alumni?.engineering_discipline || '—'}</span>
            {alumni?.city && (
              <>
                <span className="meta-sep">•</span>
                <span>📍 {alumni.city}</span>
              </>
            )}
          </div>
        </div>

        {/* Card Footer: Credited Account Tag & Edit Action */}
        <div className="upi-m-card-footer">
          <div className="upi-m-account-wrap">
            <span className="upi-m-account-label">Credited To:</span>
            {item.assignedUpi ? (
              <span className="assigned-upi-pill" title={item.assignedUpi}>
                <span className="upi-pill-dot" />
                <span className="upi-pill-name">
                  {item.qrLabel.split('(')[0]?.trim() || item.assignedUpi}
                </span>
                <span className="upi-pill-raw font-mono">{item.assignedUpi}</span>
              </span>
            ) : (
              <span className="unassigned-warning-pill">⚠️ Untagged</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleOpenEdit(item)}
            className="upi-m-edit-btn"
            title="Edit Receiving UPI Account"
            aria-label="Edit UPI Account"
          >
            ✏️ Edit
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="upi-report-container">
      {/* ── TOP ACTIONS (Mobile-First) ── */}
      <div className="upi-report-header">
        <div className="upi-report-actions">
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="btn btn-whatsapp-primary upi-btn-share-main"
            title="Broadcast report on WhatsApp"
          >
            💬 Broadcast on WhatsApp
          </button>
          <div className="upi-secondary-actions-group">
            <button
              type="button"
              onClick={handleCopySummary}
              className={`btn btn-secondary btn-sm ${copiedSummary ? 'btn-copied' : ''}`}
              title="Copy WhatsApp text summary"
            >
              {copiedSummary ? '✓ Copied' : '📋 Copy'}
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="btn btn-secondary btn-sm"
              title="Download CSV to open in Excel"
            >
              📥 CSV
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="btn btn-secondary btn-sm"
              title="Refresh database records"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── VIEW MODE SWITCHER (Overall Flat View as First Option) ── */}
      <div className="view-mode-toggle-card">
        <div className="view-mode-toggle-label">
          <span>Display Mode:</span>
        </div>
        <div className="view-mode-buttons">
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'overall' ? 'active' : ''}`}
            onClick={() => setViewMode('overall')}
          >
            📊 Overall Flat View
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'daywise' ? 'active' : ''}`}
            onClick={() => setViewMode('daywise')}
          >
            🗓️ Day-wise View
          </button>
        </div>
      </div>

      {/* ── MULTI-SELECT QR CODE CHECKBOXES ── */}
      <div className="qr-checkbox-section">
        <div className="qr-checkbox-header">
          <span className="qr-checkbox-section-title">
            Select Receiving UPI ID Accounts ({selectedAccounts.length}/{allAccountKeys.length})
          </span>
          <div className="qr-checkbox-quick-actions">
            <button
              type="button"
              onClick={selectAllAccounts}
              className="btn-link-action"
            >
              Select All
            </button>
            <span className="divider">•</span>
            <button
              type="button"
              onClick={clearAllAccounts}
              className="btn-link-action"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="qr-checkbox-grid">
          {knownAccounts.map((acc) => {
            const isChecked = selectedAccounts.includes(acc.upi_id);
            const stats = accountStats[acc.upi_id] || { count: 0, totalAmount: 0 };

            return (
              <label
                key={acc.upi_id}
                className={`qr-checkbox-card ${isChecked ? 'checked' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleAccount(acc.upi_id)}
                  className="qr-native-checkbox"
                />
                <div className="qr-checkbox-info">
                  <div className="qr-checkbox-top">
                    <span className="qr-checkbox-badge">{acc.bankName}</span>
                    <span className="qr-checkbox-count">{stats.count} Regs</span>
                  </div>
                  <div className="qr-checkbox-account-label">
                    <strong className="qr-checkbox-name">{acc.accountName}</strong>
                  </div>
                  <span className="qr-checkbox-upi font-mono" title={acc.upi_id}>
                    {acc.upi_id}
                  </span>
                  <span className="qr-checkbox-amount font-accent">
                    ₹{stats.totalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </label>
            );
          })}

          {/* Unassigned Checkbox */}
          <label className={`qr-checkbox-card unassigned ${selectedAccounts.includes('unassigned') ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={selectedAccounts.includes('unassigned')}
              onChange={() => toggleAccount('unassigned')}
              className="qr-native-checkbox"
            />
            <div className="qr-checkbox-info">
              <div className="qr-checkbox-top">
                <span className="qr-checkbox-badge badge-unassigned">Untagged</span>
                <span className="qr-checkbox-count">{accountStats['unassigned']?.count || 0} Regs</span>
              </div>
              <div className="qr-checkbox-account-label">
                <strong className="qr-checkbox-name">Unassigned Payments</strong>
              </div>
              <span className="qr-checkbox-upi font-mono">Not Linked to Account</span>
              <span className="qr-checkbox-amount font-accent">
                ₹{(accountStats['unassigned']?.totalAmount || 0).toLocaleString('en-IN')}
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* ── LIVE SELECTION BANNER (Always Prominent on Mobile) ── */}
      <div className="live-selection-banner">
        <div className="live-banner-top-row">
          <div className="live-banner-left">
            <span className="live-banner-icon">🎯</span>
            <div>
              <span className="live-banner-title">
                {selectedAccounts.length === allAccountKeys.length
                  ? `All (${selectedAccounts.length}) UPI Accounts Selected`
                  : `${selectedAccounts.length} UPI Account${selectedAccounts.length === 1 ? '' : 's'} Selected`}
              </span>
              <span className="live-banner-sub">
                {currentTotals.totalCount} matching registrations
              </span>
            </div>
          </div>
          <div className="live-banner-right">
            <span className="live-banner-label">Total Amount</span>
            <span className="live-banner-amount font-accent">₹{currentTotals.totalAmount.toLocaleString('en-IN')}</span>
          </div>
        </div>
        <div className="live-banner-chips-row">
          {selectedAccounts.length === allAccountKeys.length ? (
            <span className="live-chip-all">✓ Showing all 6 receiving accounts</span>
          ) : selectedAccounts.length === 0 ? (
            <span className="live-chip-none">⚠️ No accounts selected (showing 0)</span>
          ) : (
            <div className="live-chips-container">
              {selectedAccounts.map((key) => {
                const match = knownAccounts.find((a) => a.upi_id === key);
                const label = match ? `${match.bankName} (${match.accountName})` : 'Untagged';
                return (
                  <span key={key} className="live-account-chip">
                    {label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── ATTENDANCE STATUS FILTER CHIPS & TOOLBAR ── */}
      <div className="upi-filter-section">
        <div className="filter-chips upi-attendance-chips">
          <button
            type="button"
            className={`filter-chip ${attendanceFilter === 'all' ? 'active' : ''}`}
            onClick={() => setAttendanceFilter('all')}
          >
            All ({attendanceCounts.all})
          </button>
          <button
            type="button"
            className={`filter-chip ${attendanceFilter === 'yes' ? 'active' : ''}`}
            onClick={() => setAttendanceFilter('yes')}
          >
            Attending ({attendanceCounts.yes})
          </button>
          <button
            type="button"
            className={`filter-chip ${attendanceFilter === 'maybe' ? 'active' : ''}`}
            onClick={() => setAttendanceFilter('maybe')}
          >
            Maybe ({attendanceCounts.maybe})
          </button>
          <button
            type="button"
            className={`filter-chip ${attendanceFilter === 'no' ? 'active' : ''}`}
            onClick={() => setAttendanceFilter('no')}
          >
            No ({attendanceCounts.no})
          </button>
        </div>

        <div className="upi-toolbar">
          <div className="search-box upi-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by Name, mobile, reg ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="search-clear-btn">
                ✕
              </button>
            )}
          </div>

          <div className="upi-date-filter-wrap">
            <label className="upi-filter-label">Date:</label>
            <select
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="upi-select-input"
            >
              <option value="all">All Dates ({availableDates.length})</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {formatDDMMYYYY(d)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── REPORT CONTENT (DAY-WISE vs OVERALL FLAT VIEW) ── */}
      {filteredList.length === 0 ? (
        <div className="empty-state-card" style={{ marginTop: '20px' }}>
          <p className="empty-title">No registrations found for current selection</p>
          <p className="empty-desc">
            Try checking more QR Code accounts above or clearing your search filters.
          </p>
        </div>
      ) : viewMode === 'daywise' ? (
        /* ════════════ DAY-WISE VIEW ════════════ */
        <div className="upi-date-groups">
          {groupedByDate.map((group) => (
            <div key={group.date} className="upi-date-group-card">
              {/* Day Header */}
              <div className="upi-date-header">
                <div className="upi-date-title-wrap">
                  <span className="upi-calendar-icon">🗓️</span>
                  <div>
                    <h3 className="upi-date-title">{formatDDMMYYYY(group.date)}</h3>
                    <span className="upi-date-raw">{formatDateDisplay(group.date)}</span>
                  </div>
                </div>
                <div className="upi-date-subtotal-badge">
                  <span>
                    <strong>{group.subtotalCount}</strong> {group.subtotalCount === 1 ? 'Person' : 'People'}
                  </span>
                  <span className="divider">•</span>
                  <span className="font-accent">
                    ₹<strong>{group.subtotalAmount.toLocaleString('en-IN')}</strong>
                  </span>
                </div>
              </div>

              {/* 1. Desktop Table (Screens > 640px) */}
              <div className="upi-table-responsive upi-desktop-only">
                <table className="upi-report-table">
                  <thead>
                    <tr>
                      <th style={{ width: '26px', textAlign: 'center', padding: '8px 2px' }}>#</th>
                      <th style={{ width: '135px', textAlign: 'center' }}>Name</th>
                      <th style={{ width: '84px', textAlign: 'right', padding: '8px 4px' }}>Amount</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center' }}>UPI ID</th>
                      <th style={{ width: '82px', padding: '8px 4px', textAlign: 'center' }}>Reg ID</th>
                      <th style={{ width: '28px', textAlign: 'center', padding: '8px 2px' }} title="Edit Record">✏️</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item, idx) => (
                      <tr key={item.registration.id}>
                        <td className="cell-muted font-mono" style={{ textAlign: 'center', padding: '6px 2px' }}>
                          {idx + 1}
                        </td>
                        <td className="td-nowrap" style={{ padding: '6px 4px', textAlign: 'center' }}>
                          <strong className="alumni-name-text" title={item.registration.alumni?.name || 'Unknown Alumni'}>
                            {item.registration.alumni?.name || 'Unknown Alumni'}
                          </strong>
                        </td>
                        <td style={{ textAlign: 'right', padding: '6px 4px' }}>
                          <span className="amount-cell">₹{item.amount.toLocaleString('en-IN')}</span>
                        </td>
                        <td className="td-nowrap" style={{ padding: '6px 4px', textAlign: 'center' }}>
                          {item.assignedUpi ? (
                            <span className="assigned-upi-pill" title={item.assignedUpi}>
                              {item.assignedUpi}
                            </span>
                          ) : (
                            <span className="unassigned-warning-pill">Untagged</span>
                          )}
                        </td>
                        <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                          <span className="reg-id-badge">{item.registration.registration_number}</span>
                        </td>
                        <td style={{ textAlign: 'center', padding: '6px 2px' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="btn-edit-compact"
                            title="Edit UPI account and payment details"
                            aria-label="Edit UPI account"
                          >
                            ✏️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="subtotal-row">
                      <td colSpan={2} style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', padding: '8px 4px' }}>
                        Subtotal:
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 800,
                          fontSize: '0.94rem',
                          color: 'var(--primary-light)',
                          whiteSpace: 'nowrap',
                          overflow: 'visible',
                          padding: '8px 4px',
                        }}
                        title={`₹${group.subtotalAmount.toLocaleString('en-IN')}`}
                      >
                        ₹{group.subtotalAmount.toLocaleString('en-IN')}
                      </td>
                      <td colSpan={3} style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', padding: '8px 4px' }}>
                        {group.subtotalCount} {group.subtotalCount === 1 ? 'Alumnus' : 'Alumni'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* 2. Mobile Cards List (Screens <= 640px) */}
              <div className="upi-mobile-card-list upi-mobile-only">
                {group.items.map((item, idx) => renderMobileCard(item, idx))}
                <div className="upi-m-subtotal-card">
                  <span>Day Subtotal ({group.subtotalCount} {group.subtotalCount === 1 ? 'Person' : 'People'})</span>
                  <span className="upi-m-subtotal-val font-accent">
                    ₹{group.subtotalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {/* Grand Total Footer Card */}
          <div className="upi-grand-total-card">
            <div className="grand-total-left">
              <span className="grand-total-icon">🏆</span>
              <div>
                <h4 className="grand-total-title">Total for Selected Accounts</h4>
                <p className="grand-total-sub">
                  {currentTotals.totalCount} Alumni across {selectedAccounts.length} selected UPI account{selectedAccounts.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="grand-total-right">
              <span className="grand-total-amount">₹{currentTotals.totalAmount.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      ) : (
        /* ════════════ OVERALL FLAT VIEW ════════════ */
        <div className="upi-overall-flat-card">
          {/* 1. Desktop Table (Screens > 640px) */}
          <div className="upi-table-responsive upi-desktop-only">
            <table className="upi-report-table">
              <thead>
                <tr>
                  <th style={{ width: '26px', textAlign: 'center', padding: '8px 2px' }}>#</th>
                  <th style={{ width: '120px', padding: '8px 4px', textAlign: 'center' }}>Name</th>
                  <th style={{ width: '84px', textAlign: 'right', padding: '8px 4px' }}>Amount</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>UPI ID</th>
                  <th style={{ width: '82px', padding: '8px 4px', textAlign: 'center' }}>Reg ID</th>
                  <th style={{ width: '96px', padding: '8px 4px', textAlign: 'center' }}>Date</th>
                  <th style={{ width: '28px', textAlign: 'center', padding: '8px 2px' }} title="Edit Record">✏️</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((item, idx) => (
                  <tr key={item.registration.id}>
                    <td className="cell-muted font-mono" style={{ textAlign: 'center', padding: '6px 2px' }}>
                      {idx + 1}
                    </td>
                    <td className="td-nowrap" style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <strong className="alumni-name-text" title={item.registration.alumni?.name || 'Unknown Alumni'}>
                        {item.registration.alumni?.name || 'Unknown Alumni'}
                      </strong>
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 4px' }}>
                      <span className="amount-cell">₹{item.amount.toLocaleString('en-IN')}</span>
                    </td>
                    <td className="td-nowrap" style={{ padding: '6px 4px', textAlign: 'center' }}>
                      {item.assignedUpi ? (
                        <span className="assigned-upi-pill" title={item.assignedUpi}>
                          {item.assignedUpi}
                        </span>
                      ) : (
                        <span className="unassigned-warning-pill">Untagged</span>
                      )}
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <span className="reg-id-badge">{item.registration.registration_number}</span>
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <span className="date-cell font-mono">{formatDDMMYYYY(item.paymentDate)}</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '6px 2px' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        className="btn-edit-compact"
                        title="Edit UPI account and payment details"
                        aria-label="Edit UPI account"
                      >
                        ✏️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="subtotal-row" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                  <td colSpan={2} style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', padding: '8px 4px' }}>
                    Grand Total:
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontWeight: 800,
                      fontSize: '0.94rem',
                      color: 'var(--primary-light)',
                      whiteSpace: 'nowrap',
                      overflow: 'visible',
                      padding: '8px 4px',
                    }}
                    title={`₹${currentTotals.totalAmount.toLocaleString('en-IN')}`}
                  >
                    ₹{currentTotals.totalAmount.toLocaleString('en-IN')}
                  </td>
                  <td colSpan={4} style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.78rem', whiteSpace: 'nowrap', padding: '8px 4px' }}>
                    {currentTotals.totalCount} Alumni
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 2. Mobile Cards List (Screens <= 640px) */}
          <div className="upi-mobile-card-list upi-mobile-only" style={{ padding: '8px 0' }}>
            {filteredList.map((item, idx) => renderMobileCard(item, idx))}
            
            {/* Mobile Grand Total Summary Card */}
            <div className="upi-grand-total-card upi-mobile-grand-total">
              <div className="grand-total-left">
                <span className="grand-total-icon">🏆</span>
                <div>
                  <h4 className="grand-total-title">Total for Selected Accounts</h4>
                  <p className="grand-total-sub">
                    {currentTotals.totalCount} Alumni • {selectedAccounts.length} Accounts
                  </p>
                </div>
              </div>
              <div className="grand-total-right">
                <span className="grand-total-amount">₹{currentTotals.totalAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ASSIGN / EDIT UPI MODAL (Mobile-Optimized Bottom Sheet / Center Modal) ── */}
      {editingReg && (
        <div className="modal-overlay" onClick={() => !savingEdit && setEditingReg(null)}>
          <div className="modal-content upi-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-tag">{editingReg.registration.registration_number}</span>
                <h2 className="modal-title">Record / Change Receiving UPI ID</h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                disabled={savingEdit}
                onClick={() => setEditingReg(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body upi-modal-body">
              <div className="upi-modal-alumni-summary">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <strong>{editingReg.registration.alumni?.name}</strong>
                    <span className={`status-pill pill-${editingReg.registration.attendance_status}`}>
                      {editingReg.registration.attendance_status === 'yes' ? 'Attending' : editingReg.registration.attendance_status === 'maybe' ? 'Maybe' : 'No'}
                    </span>
                  </div>
                  <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    📞 {editingReg.registration.alumni?.mobile} • Batch of{' '}
                    {editingReg.registration.alumni?.year_of_passing} • 📅 {formatDDMMYYYY(editingReg.registration.created_at.slice(0, 10))}
                    {editingReg.registration.attendance_status === 'yes' && editingReg.registration.number_of_attendees > 1 && ` • ${editingReg.registration.number_of_attendees} persons`}
                  </span>
                </div>
                <span className="font-accent font-bold" style={{ fontSize: '1.15rem' }}>
                  ₹{editingReg.registration.amount}
                </span>
              </div>

              {/* Receipt Image Preview in Edit Modal */}
              {editingReg.registration.payment_screenshot_path ? (
                <div className="modal-edit-receipt-box">
                  <div className="modal-edit-receipt-header">
                    <span className="modal-edit-receipt-label">📄 Attached Payment Receipt:</span>
                    <a
                      href={getPublicScreenshotUrl(editingReg.registration.payment_screenshot_path) || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-link-action"
                    >
                      🔍 Open Full Image
                    </a>
                  </div>
                  <div className="modal-edit-receipt-img-wrap">
                    <img
                      src={getPublicScreenshotUrl(editingReg.registration.payment_screenshot_path) || ''}
                      alt="Payment receipt preview"
                      className="modal-edit-receipt-img"
                    />
                  </div>
                </div>
              ) : (
                <div className="modal-no-receipt-note">ℹ️ No payment screenshot attached.</div>
              )}

              <div className="upi-modal-form">
                <div className="upi-form-group">
                  <label className="upi-form-label">Receiving UPI Account *</label>
                  <select
                    value={editUpiId}
                    onChange={(e) => setEditUpiId(e.target.value)}
                    className="upi-form-select"
                  >
                    {knownAccounts.map((acc) => {
                      const name = acc.accountName || UPI_ACCOUNT_NAMES[acc.upi_id] || '';
                      const hasName = name && name.toLowerCase().trim() !== acc.upi_id.toLowerCase().trim();
                      const bankLabel = acc.bankName && acc.bankName !== 'UPI' ? ` (${acc.bankName})` : '';
                      const displayText = hasName
                        ? `${name} — ${acc.upi_id}${bankLabel}`
                        : `${acc.upi_id}${bankLabel}`;

                      return (
                        <option key={acc.upi_id} value={acc.upi_id}>
                          {displayText}
                        </option>
                      );
                    })}
                    <option value="custom">✏️ Other / Custom UPI ID...</option>
                  </select>
                </div>

                {editUpiId === 'custom' && (
                  <div className="upi-form-group">
                    <label className="upi-form-label">Custom UPI ID *</label>
                    <input
                      type="text"
                      placeholder="e.g. name@bank"
                      value={editCustomUpi}
                      onChange={(e) => setEditCustomUpi(e.target.value)}
                      className="upi-form-input font-mono"
                      autoFocus
                    />
                  </div>
                )}

                <div className="upi-form-group">
                  <label className="upi-form-label">Verified By</label>
                  <div className="upi-verified-by-field">
                    <div className="upi-verified-by-current">
                      <span className="font-mono">👤 {currentUserEmail || 'Admin (You)'}</span>
                      <span className="upi-badge-user-current">Logged In User</span>
                    </div>
                    {editingReg.verification?.verified_by && (
                      <span className="upi-verified-by-prev">
                        Record previously verified by: <strong>{editingReg.verification.verified_by}</strong>
                      </span>
                    )}
                  </div>
                </div>

                <div className="upi-form-group">
                  <label className="upi-form-label">Additional Notes (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Verified via Bank passbook"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="upi-form-input"
                  />
                </div>
              </div>
            </div>

            <div className="upi-modal-actions">
              <button
                type="button"
                onClick={() => setEditingReg(null)}
                disabled={savingEdit}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="btn btn-primary"
              >
                {savingEdit ? 'Saving...' : '💾 Save UPI Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
