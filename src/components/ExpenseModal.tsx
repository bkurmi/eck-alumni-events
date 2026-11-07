import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Upload,
  FileText,
  AlertTriangle,
  ExternalLink,
  Phone,
  CreditCard,
  Loader2,
} from 'lucide-react';
import type {
  EventExpense,
  ExpensePaymentSplit,
  ExpenseStatus,
  EventRegistration,
  PaymentVerification,
  Sponsorship,
  ExpenseAccountConfig,
} from '../types';
import { EXPENSE_CATEGORIES } from '../types';
import {
  getPublicExpenseScreenshotUrl,
  formatINR,
  KNOWN_EXPENSE_ACCOUNTS,
  getExpenseSplits,
} from '../lib/expenses';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: Partial<EventExpense>, receiptFiles?: File[] | File | null) => Promise<boolean>;
  onDelete?: (id: string) => Promise<boolean>;
  initialData?: EventExpense | null;
  currentUserEmail?: string;
  eventId?: string;
  expenseAccountsConfig?: ExpenseAccountConfig[] | null;
  expenses?: EventExpense[];
  registrations?: EventRegistration[];
  verifications?: PaymentVerification[];
  sponsorships?: Sponsorship[];
}

const COMMON_ITEM_SUGGESTIONS = [
  'Catering & Gala Dinner',
  'Tent, Stage & Chairs',
  'DJ & Sound System',
  'Campus Lighting & Deco',
  'ID Cards & Lanyards',
  'Mementos & Trophies',
  'Photography & Drone',
  'Generator & Fuel',
];

export const PAYMENT_TRANSACTION_TYPES = [
  'Advance Payment',
  'Part Payment',
  'Final Settlement',
  'Full Payment',
  'Other / Misc',
];

const CALENDAR_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CALENDAR_MONTH_ABBRS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CALENDAR_DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const PaymentDatePicker: React.FC<{
  value: string; // YYYY-MM-DD
  onChange: (val: string) => void;
  className?: string;
}> = ({ value, onChange, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          return { year: y, month: m, day: d };
        }
      }
    }
    const today = new Date();
    return {
      year: today.getFullYear(),
      month: today.getMonth(),
      day: today.getDate(),
    };
  }, [value]);

  const [viewYear, setViewYear] = useState(parsed.year);
  const [viewMonth, setViewMonth] = useState(parsed.month);

  useEffect(() => {
    if (isOpen) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  }, [isOpen, parsed.year, parsed.month]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const displayLabel = useMemo(() => {
    if (!value) return '';
    const parts = value.split('-');
    if (parts.length === 3) {
      const d = parseInt(parts[2], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[0], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y) && m >= 0 && m < 12) {
        return `${String(d).padStart(2, '0')} ${CALENDAR_MONTH_ABBRS[m]} ${y}`;
      }
    }
    return value;
  }, [value]);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      day: number;
      month: number;
      year: number;
      isCurrentMonth: boolean;
      dateStr: string;
    }> = [];

    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      days.push({
        day: d,
        month: m,
        year: y,
        isCurrentMonth: false,
        dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        day: d,
        month: viewMonth,
        year: viewYear,
        isCurrentMonth: true,
        dateStr: `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      });
    }

    const totalCells = days.length <= 35 ? 35 : 42;
    const remaining = totalCells - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      days.push({
        day: d,
        month: m,
        year: y,
        isCurrentMonth: false,
        dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      });
    }

    return days;
  }, [viewYear, viewMonth]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={
          className ||
          'w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-left text-xs sm:text-sm text-white flex items-center justify-between gap-2 outline-none focus:border-amber-500'
        }
        title="Click to open calendar"
      >
        <span className={`truncate ${displayLabel ? 'text-white' : 'text-slate-400'}`}>
          {displayLabel || 'Select Date...'}
        </span>
        <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div
          className="absolute top-[calc(100%+4px)] right-0 z-50 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 text-slate-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-white">
              {CALENDAR_MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {CALENDAR_DAY_NAMES.map((d) => (
              <span key={d} className="text-[10px] font-bold text-slate-400">
                {d}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((cd) => {
              const isSelected = value === cd.dateStr;
              const isToday = cd.dateStr === todayStr;
              return (
                <button
                  key={cd.dateStr}
                  type="button"
                  onClick={() => {
                    onChange(cd.dateStr);
                    setIsOpen(false);
                  }}
                  className={`h-7 rounded-lg text-xs font-semibold flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : isToday
                      ? 'border border-amber-400/60 text-amber-300'
                      : cd.isCurrentMonth
                      ? 'text-slate-200 hover:bg-slate-800'
                      : 'text-slate-600 hover:bg-slate-800/40'
                  }`}
                >
                  {cd.day}
                </button>
              );
            })}
          </div>

          {/* Shortcuts */}
          <div className="flex justify-between mt-2 pt-2 border-t border-slate-800 text-xs">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(todayStr);
                setIsOpen(false);
              }}
              className="text-amber-400 hover:text-amber-300 font-semibold"
            >
              Today
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setIsOpen(false);
              }}
              className="text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialData,
  currentUserEmail,
  eventId,
  expenseAccountsConfig,
  expenses = [],
}) => {
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [expectedAmount, setExpectedAmount] = useState<string>('');
  const [vendorName, setVendorName] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Multiple Receipts State
  const [existingReceiptPaths, setExistingReceiptPaths] = useState<string[]>([]);
  const [newReceiptFiles, setNewReceiptFiles] = useState<File[]>([]);
  const [newReceiptPreviews, setNewReceiptPreviews] = useState<Array<{ name: string; url: string; size: number }>>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Payment transactions rows
  const [splits, setSplits] = useState<
    Array<{
      account: string;
      customAccount?: string;
      amount: string;
      date?: string;
      mode?: string;
      note?: string;
    }>
  >([]);

  // Dynamically resolve available payer account options
  const availableAccountOptions = useMemo(() => {
    const list = [...KNOWN_EXPENSE_ACCOUNTS];
    const seen = new Set(list.map((a) => a.accountName.toLowerCase().trim()));

    // 1. Include event-specific configured accounts if present
    if (expenseAccountsConfig && Array.isArray(expenseAccountsConfig)) {
      expenseAccountsConfig.forEach((cfg) => {
        const cleanName = (cfg.accountName || cfg.id || '').trim();
        if (cleanName && !seen.has(cleanName.toLowerCase())) {
          seen.add(cleanName.toLowerCase());
          list.push({
            id: cfg.id || cleanName,
            label: cfg.label || `👤 ${cleanName}`,
            accountName: cfg.accountName || cleanName,
            bankName: cfg.bankName || 'Other',
            upiId: cfg.upiId,
            isCash: cfg.isCash,
          });
        }
      });
    }

    if (expenses && expenses.length > 0) {
      expenses.forEach((e) => {
        const existingSplits = getExpenseSplits(e);
        existingSplits.forEach((s) => {
          const raw = (s.account || '').trim();
          const cleanName = raw.split('(')[0].replace(/💵|👤/g, '').trim();
          if (cleanName && !seen.has(cleanName.toLowerCase())) {
            seen.add(cleanName.toLowerCase());
            list.push({
              id: cleanName,
              label: `👤 ${cleanName}`,
              accountName: cleanName,
              bankName: 'Other',
            });
          }
        });
        if (e.category === 'Internal Transfer') {
          const sender = (e.paid_from_account || '').trim();
          const receiver = (e.vendor_name || '').trim();
          [sender, receiver].forEach((accName) => {
            const clean = accName.split('(')[0].replace(/💵|👤/g, '').trim();
            if (clean && !seen.has(clean.toLowerCase())) {
              seen.add(clean.toLowerCase());
              list.push({
                id: clean,
                label: `👤 ${clean}`,
                accountName: clean,
                bankName: 'Other',
              });
            }
          });
        }
      });
    }
    return list;
  }, [expenses, expenseAccountsConfig]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setItemName(initialData.item_name || '');
        setCategory(initialData.category || EXPENSE_CATEGORIES[0]);
        setExpectedAmount(initialData.expected_amount ? String(Math.round(Number(initialData.expected_amount))) : '');
        setVendorName(initialData.vendor_name || '');
        const rawPhone = (initialData.vendor_phone || '').replace(/\D/g, '');
        setVendorPhone(rawPhone.length > 10 ? rawPhone.slice(-10) : rawPhone);
        setNotes(initialData.notes || '');

        // Restore Multiple Receipts
        const rawPaths = (initialData.payment_screenshot_path || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        setExistingReceiptPaths(rawPaths);
        setNewReceiptFiles([]);
        setNewReceiptPreviews([]);
        setLightboxUrl(null);

        // Restore Account Disbursal & Splits
        const existingSplits = getExpenseSplits(initialData);
        if (existingSplits.length > 0) {
          setSplits(
            existingSplits.map((s) => {
              const matched = availableAccountOptions.find(
                (a) =>
                  a.label.toLowerCase() === s.account.toLowerCase() ||
                  a.accountName.toLowerCase() === s.account.toLowerCase() ||
                  a.id.toLowerCase() === s.account.toLowerCase()
              );
              return {
                account: matched ? matched.label : 'Other',
                customAccount: matched ? '' : s.account,
                amount: String(Math.round(Number(s.amount) || 0)),
                date: s.date || initialData.payment_date || '',
                mode: s.mode || initialData.payment_mode || 'UPI',
                note: s.note || (initialData.status === 'partially_paid' ? 'Advance Payment' : ''),
              };
            })
          );
        } else {
          setSplits([]);
        }
      } else {
        setItemName('');
        setCategory(EXPENSE_CATEGORIES[0]);
        setExpectedAmount('');
        setVendorName('');
        setVendorPhone('');
        setNotes('');
        setExistingReceiptPaths([]);
        setNewReceiptFiles([]);
        setNewReceiptPreviews([]);
        setLightboxUrl(null);
        setSplits([]);
      }
      setErrorMsg(null);
      setSaving(false);
      setDeleting(false);
    }
  }, [isOpen, initialData, availableAccountOptions]);

  // Handle multiple receipt file uploads
  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const f of files) {
      if (!f.type.startsWith('image/')) {
        setErrorMsg('Please select valid image files (JPG, PNG, WebP).');
        return;
      }
      if (f.size > 8 * 1024 * 1024) {
        setErrorMsg(`File "${f.name}" exceeds 8MB limit. Please choose a smaller photo.`);
        return;
      }
    }

    const newPreviews = files.map((file) => ({
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
    }));

    setNewReceiptFiles((prev) => [...prev, ...files]);
    setNewReceiptPreviews((prev) => [...prev, ...newPreviews]);
    setErrorMsg(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveExistingReceipt = (index: number) => {
    setExistingReceiptPaths((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveNewReceipt = (index: number) => {
    setNewReceiptPreviews((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== index);
    });
    setNewReceiptFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const numExpected = parseInt(expectedAmount, 10) || 0;
  const totalAllocatedSplits = splits.reduce(
    (sum, s) => sum + (parseInt(s.amount, 10) || 0),
    0
  );
  const numActual = totalAllocatedSplits;
  const diff = numExpected - numActual;

  const computedStatus = useMemo(() => {
    if (totalAllocatedSplits === 0) {
      return {
        status: 'planned' as ExpenseStatus,
        label: 'Planned (Estimate)',
        bg: 'bg-slate-800 text-slate-300 border-slate-700',
        icon: '📝',
      };
    }
    const hasFinalSettlement = splits.some(
      (s) => s.note === 'Final Settlement' || s.note === 'Full Payment'
    );
    if (numExpected > 0 && totalAllocatedSplits < numExpected && !hasFinalSettlement) {
      return {
        status: 'partially_paid' as ExpenseStatus,
        label: 'Advance Paid (Partial)',
        bg: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
        icon: '🟡',
      };
    }
    return {
      status: 'paid' as ExpenseStatus,
      label: totalAllocatedSplits >= numExpected && numExpected > 0 ? 'Fully Paid' : 'Paid',
      bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
      icon: '✅',
    };
  }, [totalAllocatedSplits, numExpected, splits]);

  const handleAddSplitRow = () => {
    setSplits((prev) => [
      ...prev,
      {
        account: '',
        customAccount: '',
        amount: '',
        date: '',
        mode: 'UPI',
        note: '',
      },
    ]);
  };

  const handleRemoveSplitRow = (index: number) => {
    setSplits((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearAllSplits = () => {
    setSplits([]);
  };

  const handleSplitChange = (
    index: number,
    field: 'account' | 'customAccount' | 'amount' | 'date' | 'mode' | 'note',
    val: string
  ) => {
    setSplits((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanItemName = itemName.trim();
    if (!cleanItemName) {
      setErrorMsg('Please enter an Expense Item Name (e.g. Caterers, Tent, DJ).');
      return;
    }

    if (numExpected <= 0 && numActual <= 0) {
      setErrorMsg('Please enter either an Expected Amount or Actual Amount.');
      return;
    }

    const cleanPhone = vendorPhone.trim().replace(/\D/g, '');
    if (cleanPhone && cleanPhone.length !== 10) {
      setErrorMsg(
        `Vendor contact number must be exactly 10 digits (currently ${cleanPhone.length} ${cleanPhone.length === 1 ? 'digit' : 'digits'}).`
      );
      return;
    }

    // Validate each payment transaction row if any rows are added
    let finalPaidFromAccount: string | null = null;
    let finalPaymentSplits: ExpensePaymentSplit[] = [];
    let totalDisbursedAmt = 0;

    if (splits.length > 0) {
      for (let i = 0; i < splits.length; i++) {
        const s = splits[i];
        const accLabel = s.account === 'Other' ? (s.customAccount || '').trim() : (s.account || '').trim();
        if (!accLabel) {
          setErrorMsg(
            s.account === 'Other'
              ? `Please specify the coordinator or account name for Transaction #${i + 1}.`
              : `Please select the payer account in "Paid By" for Transaction #${i + 1}.`
          );
          return;
        }

        const noteLabel = (s.note || '').trim();
        if (!noteLabel) {
          setErrorMsg(`Please select the Expense Type for Transaction #${i + 1}.`);
          return;
        }

        const dateVal = (s.date || '').trim();
        if (!dateVal) {
          setErrorMsg(`Please select the Payment Date for Transaction #${i + 1}.`);
          return;
        }

        const amt = parseInt(s.amount, 10) || 0;
        if (amt <= 0) {
          setErrorMsg(`Please enter a valid amount spent (greater than ₹0) for Transaction #${i + 1}.`);
          return;
        }

        totalDisbursedAmt += amt;
        finalPaymentSplits.push({
          account: accLabel,
          amount: amt,
          date: dateVal,
          mode: s.mode || 'UPI',
          note: noteLabel,
        });
      }

      if (finalPaymentSplits.length === 1) {
        finalPaidFromAccount = finalPaymentSplits[0].account;
      } else {
        finalPaidFromAccount = `Split: ${finalPaymentSplits
          .map((s) => `${s.account.split('(')[0].replace(/💵|👤/g, '').trim()} ₹${formatINR(s.amount)}`)
          .join(', ')}`;
      }
    } else {
      finalPaidFromAccount = null;
      finalPaymentSplits = [];
    }

    const finalActual = totalDisbursedAmt;
    const finalStatus = computedStatus.status;

    let resolvedPaymentDate: string | null = null;
    let resolvedPaymentMode = 'UPI';

    if (finalPaymentSplits.length > 0) {
      const dates = finalPaymentSplits.map((s) => s.date).filter(Boolean) as string[];
      if (dates.length > 0) {
        dates.sort();
        resolvedPaymentDate = dates[dates.length - 1];
      }
      const modes = Array.from(new Set(finalPaymentSplits.map((s) => s.mode).filter(Boolean)));
      if (modes.length === 1) {
        resolvedPaymentMode = modes[0] as string;
      } else if (modes.length > 1) {
        resolvedPaymentMode = modes.join(' / ');
      }
    }

    try {
      setSaving(true);
      const payload: Partial<EventExpense> = {
        id: initialData?.id,
        event_id: eventId || initialData?.event_id || null,
        item_name: cleanItemName,
        category,
        expected_amount: numExpected,
        actual_amount: finalActual,
        status: finalStatus,
        vendor_name: vendorName.trim() || null,
        vendor_phone: cleanPhone || null,
        payment_mode: resolvedPaymentMode,
        payment_date: resolvedPaymentDate,
        paid_from_account: finalPaidFromAccount,
        payment_splits: finalPaymentSplits,
        payment_screenshot_path: existingReceiptPaths.join(',') || null,
        notes: notes.trim() || null,
        created_by: initialData?.created_by || currentUserEmail || 'admin',
      };

      const success = await onSave(payload, newReceiptFiles);
      if (success) {
        onClose();
      } else {
        setErrorMsg('Failed to save expense. Please check connection and try again.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error occurred while saving expense.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initialData?.id || !onDelete) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${initialData.item_name}"? This cannot be undone.`
    );
    if (!confirmDelete) return;

    try {
      setDeleting(true);
      const success = await onDelete(initialData.id);
      if (success) {
        onClose();
      } else {
        setErrorMsg('Failed to delete expense item.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error occurred while deleting expense.');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving && !deleting) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-slate-900 border-t sm:border border-amber-500/30 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-slate-950 flex items-center justify-center font-bold text-lg shadow-md shadow-emerald-950/50 shrink-0">
              💰
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {initialData ? 'Edit Expense Item' : 'Add Expected / Real Expense'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Track budget estimates, actual payments & vendor bills
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || deleting}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/60 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-4 sm:p-6 tab-scrollbar space-y-4"
        >
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs sm:text-sm flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Quick Suggestions (Only when adding new) */}
          {!initialData && (
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-2">
                Quick Presets:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_ITEM_SUGGESTIONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setItemName(preset);
                      if (preset.includes('Catering')) setCategory('Catering & Food');
                      else if (preset.includes('Tent')) setCategory('Tent & Infrastructure');
                      else if (preset.includes('DJ') || preset.includes('Sound')) setCategory('Sound, DJ & Cultural');
                      else if (preset.includes('Lighting')) setCategory('Decorations & Lighting');
                      else if (preset.includes('ID Cards')) setCategory('Printing, Badges & ID Cards');
                      else if (preset.includes('Mementos')) setCategory('Mementos, Gifts & Souvenirs');
                      else if (preset.includes('Photography')) setCategory('Photography & Videography');
                      else setCategory('Venue, Electricity & Logistics');
                    }}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      itemName === preset
                        ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                        : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/80 text-slate-300'
                    }`}
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Item Name & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Item Name / Description <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Caterers (Dinner & Snacks)"
                className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-white placeholder-slate-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-white outline-none focus:border-amber-500"
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} className="bg-slate-900">
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Financial Amounts & Status */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-sky-300 mb-1.5">
                  📌 Expected Budget (₹) <span className="text-slate-500 font-normal">(Estimated)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-base">
                    ₹
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={expectedAmount}
                    onChange={(e) => setExpectedAmount(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 50000"
                    className="w-full min-h-[44px] text-base sm:text-sm pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-900 border border-sky-500/30 text-white font-mono font-bold outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-emerald-400 mb-1.5">
                  💳 Total Disbursed (₹)
                </label>
                <div className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center">
                  <span className="text-base sm:text-lg font-mono font-bold text-emerald-400">
                    ₹{formatINR(totalAllocatedSplits)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Expense Status
                </label>
                <div className="min-h-[44px] flex items-center">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${computedStatus.bg}`}>
                    <span>{computedStatus.icon}</span>
                    <span>{computedStatus.label}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Variance preview */}
            {(numExpected > 0 || numActual > 0) && (
              <div
                className={`p-3 rounded-xl border flex items-center justify-between gap-2 flex-wrap text-xs sm:text-sm ${
                  numActual === 0
                    ? 'bg-slate-900 border-slate-700/60 text-slate-400'
                    : diff >= 0
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}
              >
                <span>
                  {numActual === 0
                    ? 'Budget Allocation (Not yet spent)'
                    : numActual < numExpected
                    ? `Advance Paid: ₹${formatINR(numActual)} of ₹${formatINR(numExpected)}`
                    : 'Budget Variance:'}
                </span>
                <span className="font-bold font-mono">
                  {numActual === 0
                    ? `₹${formatINR(numExpected)} Budgeted`
                    : diff > 0
                    ? `₹${formatINR(diff)} Pending to Pay (Under Budget)`
                    : diff === 0
                    ? '✓ 100% Reconciled (Exact Budget)'
                    : `-₹${formatINR(Math.abs(diff))} Over Budget (Deficit)`}
                </span>
              </div>
            )}
          </div>

          {/* ── PAYMENT TRANSACTIONS (SINGLE ROW PER TRANSACTION) ── */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <label className="text-sm font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-amber-400" />
                  <span>Disbursed From / Paid By</span>
                  {splits.length > 1 && (
                    <span className="text-[11px] text-emerald-400 font-semibold">
                      (Split Across Accounts)
                    </span>
                  )}
                </label>
                <p className="text-xs text-slate-400 mt-0.5">
                  Log each transaction made to the vendor (advance, part payment, or settlement)
                </p>
              </div>

              {splits.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllSplits}
                  className="px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Transactions Rows */}
            <div className="space-y-2.5">
              {splits.map((s, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2"
                >
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <span className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-300 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSplitRow(idx)}
                      className="sm:hidden min-h-[36px] min-w-[36px] flex items-center justify-center text-red-400 hover:text-red-300 p-1"
                      title="Remove row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 1. Paid By */}
                  <div className="flex-1 min-w-[140px]">
                    <label className="block sm:hidden text-[11px] text-slate-400 mb-1">Paid By *</label>
                    <select
                      value={s.account || ''}
                      onChange={(e) => handleSplitChange(idx, 'account', e.target.value)}
                      className="w-full min-h-[40px] text-base sm:text-xs px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700 text-white outline-none focus:border-amber-500"
                    >
                      <option value="" className="bg-slate-900">Select Account...</option>
                      {availableAccountOptions.map((acc) => (
                        <option key={acc.id} value={acc.label} className="bg-slate-900">
                          {acc.label}
                        </option>
                      ))}
                      <option value="Other" className="bg-slate-900">👤 Other...</option>
                    </select>
                    {s.account === 'Other' && (
                      <input
                        type="text"
                        value={s.customAccount || ''}
                        onChange={(e) => handleSplitChange(idx, 'customAccount', e.target.value)}
                        placeholder="Coordinator name"
                        className="w-full min-h-[36px] mt-1.5 text-base sm:text-xs px-3 py-1.5 rounded-lg bg-slate-950 border border-amber-500/50 text-white placeholder-slate-500 outline-none"
                      />
                    )}
                  </div>

                  {/* 2. Expense Type */}
                  <div className="w-full sm:w-36">
                    <label className="block sm:hidden text-[11px] text-slate-400 mb-1">Expense Type *</label>
                    <select
                      value={s.note || ''}
                      onChange={(e) => handleSplitChange(idx, 'note', e.target.value)}
                      className="w-full min-h-[40px] text-base sm:text-xs px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700 text-white outline-none focus:border-amber-500"
                    >
                      <option value="" className="bg-slate-900">Select Type...</option>
                      {PAYMENT_TRANSACTION_TYPES.map((t) => (
                        <option key={t} value={t} className="bg-slate-900">
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 3. Payment Date */}
                  <div className="w-full sm:w-36">
                    <label className="block sm:hidden text-[11px] text-slate-400 mb-1">Payment Date *</label>
                    <PaymentDatePicker
                      value={s.date || ''}
                      onChange={(val) => handleSplitChange(idx, 'date', val)}
                    />
                  </div>

                  {/* 4. Amount Spent */}
                  <div className="w-full sm:w-32">
                    <label className="block sm:hidden text-[11px] text-slate-400 mb-1">Spent (₹) *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-xs">₹</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={s.amount}
                        onChange={(e) =>
                          handleSplitChange(idx, 'amount', e.target.value.replace(/\D/g, ''))
                        }
                        placeholder="0"
                        className="w-full min-h-[40px] text-base sm:text-xs pl-7 pr-3 py-2 rounded-xl bg-slate-950/80 border border-emerald-500/40 text-emerald-400 font-mono font-bold outline-none focus:border-emerald-400"
                      />
                    </div>
                  </div>

                  {/* Desktop Remove Button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveSplitRow(idx)}
                    className="hidden sm:flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition-colors shrink-0"
                    title="Remove row"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {splits.length === 0 && (
                <div className="p-6 text-center rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-slate-400 text-xs sm:text-sm">
                  No payment transactions logged yet. Click below to add an advance or full payment.
                </div>
              )}
            </div>

            {/* Add Another Row */}
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={handleAddSplitRow}
                className="min-h-[44px] px-6 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-dashed border-indigo-500/40 text-indigo-300 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Another Payment Row</span>
              </button>
            </div>
          </div>

          {/* Vendor Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Vendor / Payee Name <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="e.g. Royal Caterers / Sharma Tent"
                className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-white placeholder-slate-500 outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5 flex items-center gap-1">
                <Phone className="w-3 h-3 text-slate-400" /> Vendor Phone{' '}
                <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <div className="relative flex items-stretch rounded-xl overflow-hidden border border-slate-700 focus-within:border-amber-500">
                <span className="px-3 bg-slate-800 text-sky-400 font-bold text-xs sm:text-sm flex items-center justify-center select-none border-r border-slate-700">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={vendorPhone}
                  onChange={(e) => {
                    let digits = e.target.value.replace(/\D/g, '');
                    if (digits.length > 10) digits = digits.slice(-10);
                    setVendorPhone(digits);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="10-digit mobile number"
                  className="w-full min-h-[44px] text-base sm:text-sm px-3 py-2.5 bg-slate-950/70 text-white placeholder-slate-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Bill / Receipt Upload & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Bills / Receipts ({existingReceiptPaths.length + newReceiptPreviews.length})</span>
                </label>
                {(existingReceiptPaths.length > 0 || newReceiptPreviews.length > 0) && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-sky-400 hover:text-sky-300 font-semibold"
                  >
                    + Add More
                  </button>
                )}
              </div>

              {existingReceiptPaths.length === 0 && newReceiptPreviews.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[110px] p-4 rounded-xl bg-slate-950/50 border-2 border-dashed border-slate-800 hover:border-amber-500/50 transition-colors cursor-pointer flex flex-col items-center justify-center text-center"
                >
                  <Upload className="w-6 h-6 text-slate-500 mb-1" />
                  <span className="text-xs font-semibold text-slate-300">
                    Upload Bills / Receipts / Screenshots
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    Select one or multiple photos (PNG, JPG, WebP)
                  </span>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto tab-scrollbar">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {/* Existing Receipts */}
                    {existingReceiptPaths.map((path, idx) => {
                      const url = getPublicExpenseScreenshotUrl(path);
                      return (
                        <div
                          key={`existing-${idx}`}
                          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1 relative"
                        >
                          <div
                            onClick={() => url && setLightboxUrl(url)}
                            className="h-16 w-full rounded bg-slate-900 overflow-hidden cursor-pointer flex items-center justify-center"
                            title="Click to enlarge"
                          >
                            {url ? (
                              <img src={url} alt={`Bill ${idx + 1}`} className="w-full h-full object-cover" />
                            ) : (
                              <FileText className="w-5 h-5 text-slate-500" />
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[11px] px-0.5">
                            <span className="text-slate-400 truncate">Bill #{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveExistingReceipt(idx)}
                              className="text-red-400 hover:text-red-300 p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* New Previews */}
                    {newReceiptPreviews.map((item, idx) => (
                      <div
                        key={`new-${idx}`}
                        className="p-1.5 rounded-lg bg-slate-950 border border-sky-500/30 space-y-1 relative"
                      >
                        <div
                          onClick={() => setLightboxUrl(item.url)}
                          className="h-16 w-full rounded bg-slate-900 overflow-hidden cursor-pointer flex items-center justify-center"
                          title="Click to enlarge"
                        >
                          <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex items-center justify-between text-[11px] px-0.5">
                          <span className="text-sky-400 truncate">✨ New</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveNewReceipt(idx)}
                            className="text-red-400 hover:text-red-300 p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-sky-400 hover:underline font-semibold block pt-1"
                  >
                    + Add Another Bill / Screenshot
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFilesChange}
                className="hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Notes / Line Item Details <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Rate: ₹320/plate for 300 alumni, ₹10k advance paid on 15 Oct"
                className="w-full min-h-[110px] text-base sm:text-xs px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-white placeholder-slate-500 outline-none focus:border-amber-500 resize-none"
              />
            </div>
          </div>

          {/* Sticky Modal Actions */}
          <div className="sticky bottom-0 z-10 pt-3 pb-1 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            {initialData?.id && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleting}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{deleting ? 'Deleting...' : 'Delete Item'}</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={saving || deleting}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || deleting}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>{initialData ? 'Update Expense' : 'Save Expense'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Lightbox Modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxUrl}
              alt="Bill View"
              className="max-w-full max-h-[75vh] rounded-xl object-contain shadow-2xl border border-slate-800"
            />
            <div className="flex gap-3 mt-4 flex-wrap justify-center">
              <a
                href={lightboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-4 py-2 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-300 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-sky-500/30 transition-colors"
              >
                <span>Open in New Tab</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => setLightboxUrl(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
