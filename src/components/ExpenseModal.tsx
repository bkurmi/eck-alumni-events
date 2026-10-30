import React, { useState, useEffect, useRef, useMemo } from 'react';
import type {
  EventExpense,
  ExpensePaymentSplit,
  ExpenseStatus,
  EventRegistration,
  PaymentVerification,
  Sponsorship,
} from '../types';
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_MODES } from '../types';
import {
  getPublicExpenseScreenshotUrl,
  formatINR,
  KNOWN_EXPENSE_ACCOUNTS,
  getExpenseSplits,
  computeAccountSettlements,
  getAccountInHandBalance,
} from '../lib/expenses';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: Partial<EventExpense>, receiptFiles?: File[] | File | null) => Promise<boolean>;
  onDelete?: (id: string) => Promise<boolean>;
  initialData?: EventExpense | null;
  currentUserEmail?: string;
  eventId?: string;
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

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialData,
  currentUserEmail,
  eventId,
  expenses = [],
  registrations = [],
  verifications = [],
  sponsorships = [],
}) => {
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [expectedAmount, setExpectedAmount] = useState<string>('');
  const [actualAmount, setActualAmount] = useState<string>('');
  const [status, setStatus] = useState<ExpenseStatus>('planned');
  const [vendorName, setVendorName] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<string>('UPI');
  const [paymentDate, setPaymentDate] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Multiple Receipts State
  const [existingReceiptPaths, setExistingReceiptPaths] = useState<string[]>([]);
  const [newReceiptFiles, setNewReceiptFiles] = useState<File[]>([]);
  const [newReceiptPreviews, setNewReceiptPreviews] = useState<Array<{ name: string; url: string; size: number }>>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Payment account & split states
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
  const [singleAccount, setSingleAccount] = useState<string>('');
  const [customAccountName, setCustomAccountName] = useState<string>('');
  const [splits, setSplits] = useState<
    Array<{ account: string; customAccount?: string; amount: string }>
  >([
    { account: KNOWN_EXPENSE_ACCOUNTS[0].label, customAccount: '', amount: '' },
    { account: KNOWN_EXPENSE_ACCOUNTS[1].label, customAccount: '', amount: '' },
  ]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Live in-hand balance per account across all expenses (matches the main Settlements card)
  const liveSettlementData = useMemo(() => {
    return computeAccountSettlements(
      expenses,
      registrations,
      verifications,
      sponsorships
    );
  }, [expenses, registrations, verifications, sponsorships]);

  // Splits recorded in initialData when editing
  const initialSplits = useMemo(() => {
    if (!initialData) return [];
    return getExpenseSplits(initialData);
  }, [initialData]);

  // Helper to get what was previously saved in this expense item for an account
  const getPreviouslySavedAmountForAccount = (targetAccount: string): number => {
    if (!initialSplits || initialSplits.length === 0) return 0;
    const cleanTarget = (targetAccount || '').toLowerCase().trim();
    if (!cleanTarget || cleanTarget === 'other') return 0;
    const found = initialSplits.find((s) => {
      const cleanSplit = (s.account || '').toLowerCase().trim();
      return (
        cleanSplit === cleanTarget ||
        cleanSplit.includes(cleanTarget) ||
        cleanTarget.includes(cleanSplit)
      );
    });
    return Number(found?.amount || 0);
  };

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setItemName(initialData.item_name || '');
        setCategory(initialData.category || EXPENSE_CATEGORIES[0]);
        setExpectedAmount(initialData.expected_amount ? String(Math.round(Number(initialData.expected_amount))) : '');
        setActualAmount(initialData.actual_amount ? String(Math.round(Number(initialData.actual_amount))) : '');
        setStatus(initialData.status || 'planned');
        setVendorName(initialData.vendor_name || '');
        const rawPhone = (initialData.vendor_phone || '').replace(/\D/g, '');
        setVendorPhone(rawPhone.length > 10 ? rawPhone.slice(-10) : rawPhone);
        setPaymentMode(initialData.payment_mode || 'UPI');
        setPaymentDate(initialData.payment_date || '');
        setNotes(initialData.notes || '');

        // Restore Multiple Receipts from comma-separated string
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
        if (existingSplits.length > 1) {
          setIsSplitMode(true);
          setSplits(
            existingSplits.map((s) => {
              const matched = KNOWN_EXPENSE_ACCOUNTS.find(
                (a) => a.label === s.account || a.accountName === s.account || a.id === s.account
              );
              return {
                account: matched ? matched.label : 'Other',
                customAccount: matched ? '' : s.account,
                amount: String(Math.round(Number(s.amount) || 0)),
              };
            })
          );
          setSingleAccount('');
          setCustomAccountName('');
        } else if (existingSplits.length === 1) {
          setIsSplitMode(false);
          const single = existingSplits[0];
          const matched = KNOWN_EXPENSE_ACCOUNTS.find(
            (a) => a.label === single.account || a.accountName === single.account || a.id === single.account
          );
          if (matched) {
            setSingleAccount(matched.label);
            setCustomAccountName('');
          } else {
            setSingleAccount('Other');
            setCustomAccountName(single.account || '');
          }
          setSplits([
            {
              account: matched ? matched.label : 'Other',
              customAccount: matched ? '' : single.account,
              amount: String(Math.round(Number(single.amount) || 0)),
            },
            { account: KNOWN_EXPENSE_ACCOUNTS[1].label, customAccount: '', amount: '' },
          ]);
        } else {
          // Unassigned / no splits
          setIsSplitMode(false);
          setSingleAccount('');
          setCustomAccountName('');
          setSplits([
            { account: KNOWN_EXPENSE_ACCOUNTS[0].label, customAccount: '', amount: '' },
            { account: KNOWN_EXPENSE_ACCOUNTS[1].label, customAccount: '', amount: '' },
          ]);
        }
      } else {
        setItemName('');
        setCategory(EXPENSE_CATEGORIES[0]);
        setExpectedAmount('');
        setActualAmount('');
        setStatus('planned');
        setVendorName('');
        setVendorPhone('');
        setPaymentMode('UPI');
        setPaymentDate('');
        setNotes('');
        setExistingReceiptPaths([]);
        setNewReceiptFiles([]);
        setNewReceiptPreviews([]);
        setLightboxUrl(null);
        setIsSplitMode(false);
        setSingleAccount('');
        setCustomAccountName('');
        setSplits([
          { account: KNOWN_EXPENSE_ACCOUNTS[0].label, customAccount: '', amount: '' },
          { account: KNOWN_EXPENSE_ACCOUNTS[1].label, customAccount: '', amount: '' },
        ]);
      }
      setErrorMsg(null);
      setSaving(false);
      setDeleting(false);
    }
  }, [isOpen, initialData]);

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
  const numActual = parseInt(actualAmount, 10) || 0;
  const diff = numExpected - numActual;

  const handleAddSplitRow = () => {
    const nextAcc = KNOWN_EXPENSE_ACCOUNTS[splits.length % KNOWN_EXPENSE_ACCOUNTS.length];
    setSplits((prev) => [
      ...prev,
      { account: nextAcc.label, customAccount: '', amount: '' },
    ]);
  };

  const handleRemoveSplitRow = (index: number) => {
    if (splits.length <= 1) {
      // If only 1 row remains and user crosses it, switch back to single unassigned mode
      setIsSplitMode(false);
      setSingleAccount('');
      setCustomAccountName('');
      setSplits([
        { account: KNOWN_EXPENSE_ACCOUNTS[0].label, customAccount: '', amount: '' },
        { account: KNOWN_EXPENSE_ACCOUNTS[1].label, customAccount: '', amount: '' },
      ]);
      return;
    }
    setSplits((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSplitChange = (
    index: number,
    field: 'account' | 'customAccount' | 'amount',
    val: string
  ) => {
    setSplits((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const totalAllocatedSplits = splits.reduce(
    (sum, s) => sum + (parseInt(s.amount, 10) || 0),
    0
  );
  const remainingToAllocate = numActual - totalAllocatedSplits;

  const handleAutoFillRemaining = (index: number) => {
    const otherAllocated = splits.reduce(
      (sum, s, i) => (i === index ? sum : sum + (parseInt(s.amount, 10) || 0)),
      0
    );
    const needed = Math.max(0, numActual - otherAllocated);
    if (needed > 0) {
      handleSplitChange(index, 'amount', String(needed));
    }
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

    let finalPaidFromAccount: string | null = null;
    let finalPaymentSplits: ExpensePaymentSplit[] = [];

    if (numActual > 0) {
      if (isSplitMode) {
        let totalSplitAmt = 0;
        for (let i = 0; i < splits.length; i++) {
          const s = splits[i];
          const amt = parseInt(s.amount, 10) || 0;
          if (amt <= 0) {
            setErrorMsg(`Please enter a valid amount for Split #${i + 1}.`);
            return;
          }
          const accLabel =
            s.account === 'Other'
              ? (s.customAccount || '').trim()
              : s.account;
          if (!accLabel) {
            setErrorMsg(`Please specify the coordinator or account name for Split #${i + 1}.`);
            return;
          }
          totalSplitAmt += amt;
          finalPaymentSplits.push({ account: accLabel, amount: amt });
        }

        if (totalSplitAmt !== numActual) {
          setErrorMsg(
            `Total split allocations (₹${formatINR(totalSplitAmt)}) must exactly match the Actual Amount (₹${formatINR(numActual)}). Difference: ₹${formatINR(Math.abs(numActual - totalSplitAmt))}`
          );
          return;
        }

        finalPaidFromAccount = `Split: ${finalPaymentSplits
          .map((s) => `${s.account.split('(')[0].replace(/💵|👤/g, '').trim()} ₹${formatINR(s.amount)}`)
          .join(', ')}`;
      } else {
        // Single Account Mode
        if (singleAccount === 'Other') {
          const customName = customAccountName.trim();
          if (!customName) {
            setErrorMsg('Please specify the custom coordinator/payer name or select Unassigned.');
            return;
          }
          finalPaidFromAccount = customName;
          finalPaymentSplits = [{ account: customName, amount: numActual }];
        } else if (singleAccount) {
          finalPaidFromAccount = singleAccount;
          finalPaymentSplits = [{ account: singleAccount, amount: numActual }];
        } else {
          // Explicitly Unassigned
          finalPaidFromAccount = null;
          finalPaymentSplits = [];
        }
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
        actual_amount: numActual,
        status,
        vendor_name: vendorName.trim() || null,
        vendor_phone: cleanPhone || null,
        payment_mode: paymentMode,
        payment_date: paymentDate || null,
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
      className="modal-overlay expense-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving && !deleting) onClose();
      }}
    >
      <div className="expense-modal-card">
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #1e293b, #0f172a)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                flexShrink: 0,
              }}
            >
              💰
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: '#f8fafc' }}>
                {initialData ? 'Edit Expense Item' : 'Add Expected / Real Expense'}
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#94a3b8' }}>
                Track budget estimates, actual payments &amp; vendor bills
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || deleting}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '22px',
              cursor: 'pointer',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              transition: 'color 0.15s, background-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form
          onSubmit={handleSubmit}
          className="expense-modal-body"
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            flex: 1,
            boxSizing: 'border-box',
          }}
        >
          {errorMsg && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '8px',
                padding: '12px 14px',
                color: '#fca5a5',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Quick Suggestions (Only when adding new) */}
          {!initialData && (
            <div>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                Quick Presets:
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
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
                    style={{
                      backgroundColor: itemName === preset ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      border: itemName === preset ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: itemName === preset ? '#a5b4fc' : '#cbd5e1',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      minHeight: '36px',
                    }}
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Item Name & Category */}
          <div className="expense-grid-2">
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9', display: 'block', marginBottom: '6px' }}>
                Item Name / Description <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Caterers (Dinner & Snacks)"
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  fontSize: '1rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9', display: 'block', marginBottom: '6px' }}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  fontSize: '1rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Financial Amounts (Expected vs Actual) */}
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div className="expense-grid-2">
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span>📌 Expected Amount (₹)</span>
                  <small style={{ color: '#94a3b8', fontWeight: 400 }}>(Estimated)</small>
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '14px', top: '12px', color: '#94a3b8', fontSize: '1rem', pointerEvents: 'none' }}>₹</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={expectedAmount}
                    onChange={(e) => setExpectedAmount(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 50000"
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '10px 14px 10px 32px',
                      borderRadius: '8px',
                      backgroundColor: '#1e293b',
                      border: '1px solid rgba(147, 197, 253, 0.3)',
                      color: '#f8fafc',
                      fontSize: '1rem',
                      fontWeight: 600,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#86efac', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span>💳 Actual Amount (₹)</span>
                  <small style={{ color: '#94a3b8', fontWeight: 400 }}>(Real Paid)</small>
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '14px', top: '12px', color: '#94a3b8', fontSize: '1rem', pointerEvents: 'none' }}>₹</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={actualAmount}
                    onChange={(e) => {
                      const intOnly = e.target.value.replace(/\D/g, '');
                      setActualAmount(intOnly);
                      if (Number(intOnly) > 0 && status === 'planned') {
                        setStatus('paid');
                      }
                    }}
                    placeholder="0"
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '10px 14px 10px 32px',
                      borderRadius: '8px',
                      backgroundColor: '#1e293b',
                      border: '1px solid rgba(134, 239, 172, 0.3)',
                      color: '#f8fafc',
                      fontSize: '1rem',
                      fontWeight: 600,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Variance preview */}
            {(numExpected > 0 || numActual > 0) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: numActual === 0
                    ? 'rgba(148, 163, 184, 0.1)'
                    : diff >= 0
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'rgba(239, 68, 68, 0.15)',
                  border: numActual === 0
                    ? '1px dashed rgba(148, 163, 184, 0.3)'
                    : diff >= 0
                    ? '1px solid rgba(16, 185, 129, 0.3)'
                    : '1px solid rgba(239, 68, 68, 0.3)',
                  fontSize: '0.85rem',
                }}
              >
                <span style={{ color: '#cbd5e1' }}>
                  {numActual === 0 ? 'Budget Allocation (Not yet spent)' : 'Variance / Comparison:'}
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    color: numActual === 0 ? '#94a3b8' : diff >= 0 ? '#34d399' : '#f87171',
                  }}
                >
                  {numActual === 0
                    ? `₹${formatINR(numExpected)} Budgeted`
                    : diff >= 0
                    ? `+₹${formatINR(diff)} Under Budget (Savings)`
                    : `-₹${formatINR(Math.abs(diff))} Over Budget (Deficit)`}
                </span>
              </div>
            )}
          </div>

          {/* Status, Payment Mode & Payment Date */}
          <div className="expense-grid-3">
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9', display: 'block', marginBottom: '6px' }}>
                Expense Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ExpenseStatus)}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  fontSize: '1rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <option value="planned">📝 Planned (Estimate)</option>
                <option value="partially_paid">🟡 Advance Paid</option>
                <option value="paid">✅ Fully Paid</option>
                <option value="settled">🎉 Settled</option>
                <option value="cancelled">❌ Cancelled</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9', display: 'block', marginBottom: '6px' }}>
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  fontSize: '1rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                {EXPENSE_PAYMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9', display: 'block', marginBottom: '6px' }}>
                Payment Date <span style={{ color: '#94a3b8', fontWeight: 400 }}>(Optional)</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  fontSize: '1rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Disbursal Account & Multi-Account Split */}
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '10px',
              padding: '14px',
              border:
                numActual > 0
                  ? '1px solid rgba(99, 102, 241, 0.35)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* Header: Title and Mode Switch */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    color: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    margin: 0,
                  }}
                >
                  <span>💳 Disbursed From / Paid By</span>
                  {numActual > 0 && (
                    <span style={{ fontSize: '0.72rem', color: '#86efac', fontWeight: 600 }}>
                      (Real Outflow)
                    </span>
                  )}
                </label>
                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Track which organizer account or cash pool was debited
                </p>
              </div>

              {/* Mode Toggle Pills (min 44px touch target) */}
              <div
                style={{
                  display: 'inline-flex',
                  backgroundColor: '#0f172a',
                  borderRadius: '8px',
                  padding: '3px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsSplitMode(false)}
                  style={{
                    padding: '6px 12px',
                    minHeight: '36px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: !isSplitMode ? 700 : 500,
                    backgroundColor: !isSplitMode ? '#4f46e5' : 'transparent',
                    color: !isSplitMode ? '#ffffff' : '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Single Account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSplitMode(true);
                    if (numActual > 0 && splits.every((s) => !s.amount)) {
                      setSplits([
                        { account: KNOWN_EXPENSE_ACCOUNTS[0].label, customAccount: '', amount: String(numActual) },
                        { account: KNOWN_EXPENSE_ACCOUNTS[1].label, customAccount: '', amount: '' },
                      ]);
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    minHeight: '36px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: isSplitMode ? 700 : 500,
                    backgroundColor: isSplitMode ? '#059669' : 'transparent',
                    color: isSplitMode ? '#ffffff' : '#94a3b8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>🔀 Split Across Accounts</span>
                </button>
              </div>
            </div>

            {/* Single Account Selector */}
            {!isSplitMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select
                    value={singleAccount}
                    onChange={(e) => setSingleAccount(e.target.value)}
                    style={{
                      flex: 1,
                      minHeight: '44px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: '#0f172a',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: singleAccount ? '#f8fafc' : '#94a3b8',
                      fontSize: '1rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">⚠️ Not Assigned / Unassigned</option>
                    {KNOWN_EXPENSE_ACCOUNTS.map((acc) => (
                      <option key={acc.id} value={acc.label}>
                        {acc.label}
                      </option>
                    ))}
                    <option value="Other">👤 Other / Custom Coordinator...</option>
                  </select>

                  {singleAccount && (
                    <button
                      type="button"
                      onClick={() => {
                        setSingleAccount('');
                        setCustomAccountName('');
                      }}
                      style={{
                        padding: '10px 14px',
                        minHeight: '44px',
                        borderRadius: '8px',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        color: '#fca5a5',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      title="Clear / Unassign account"
                    >
                      ✕ Unassign
                    </button>
                  )}
                </div>

                {/* Account In-Hand Balance Indicator for Single Account */}
                {singleAccount && singleAccount !== 'Other' && (() => {
                  const bal = getAccountInHandBalance(singleAccount, liveSettlementData.accounts);
                  const prevSaved = getPreviouslySavedAmountForAccount(singleAccount);
                  const delta = numActual - prevSaved;
                  const projectedBalance = bal.netBalance - delta;

                  return (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '6px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor:
                          bal.netBalance > 0
                            ? projectedBalance >= 0
                              ? 'rgba(16, 185, 129, 0.1)'
                              : 'rgba(245, 158, 11, 0.12)'
                            : 'rgba(148, 163, 184, 0.08)',
                        border: `1px solid ${
                          bal.netBalance > 0
                            ? projectedBalance >= 0
                              ? 'rgba(16, 185, 129, 0.25)'
                              : 'rgba(245, 158, 11, 0.35)'
                            : 'rgba(148, 163, 184, 0.18)'
                        }`,
                        fontSize: '0.8rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#94a3b8' }}>💰 Account Balance ({singleAccount.split('(')[0].trim()}):</span>
                        <strong style={{ color: bal.netBalance > 0 ? '#86efac' : bal.netBalance < 0 ? '#fca5a5' : '#cbd5e1' }}>
                          ₹{formatINR(bal.netBalance)} in hand
                        </strong>
                      </div>
                      {numActual > 0 && (
                        <div style={{ fontWeight: 600 }}>
                          {projectedBalance > 0 ? (
                            <span style={{ color: '#34d399' }}>
                              ✓ ₹{formatINR(projectedBalance)} will remain in hand
                            </span>
                          ) : projectedBalance === 0 ? (
                            <span style={{ color: '#cbd5e1' }}>
                              ✓ ₹0 (All funds utilized)
                            </span>
                          ) : (
                            <span style={{ color: '#fbbf24' }}>
                              ⚠️ Exceeds in hand by ₹{formatINR(Math.abs(projectedBalance))} (will be due for reimbursement)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {singleAccount === 'Other' && (
                  <input
                    type="text"
                    value={customAccountName}
                    onChange={(e) => setCustomAccountName(e.target.value)}
                    placeholder="Enter coordinator / payer name (e.g. Vikram or College Cash)"
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: '#0f172a',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      color: '#f8fafc',
                      fontSize: '1rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                )}
              </div>
            ) : (
              /* Multi-Account Split Builder */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    borderRadius: '8px',
                    border: '1px dashed rgba(255, 255, 255, 0.12)',
                    fontSize: '0.78rem',
                    color: '#cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}
                >
                  <span>
                    Total Actual Expense to Allocate: <strong>₹{formatINR(numActual)}</strong>
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        remainingToAllocate === 0
                          ? '#86efac'
                          : remainingToAllocate > 0
                          ? '#fde68a'
                          : '#fca5a5',
                    }}
                  >
                    {remainingToAllocate === 0
                      ? '✅ Fully Allocated'
                      : remainingToAllocate > 0
                      ? `⏳ ₹${formatINR(remainingToAllocate)} remaining`
                      : `🚨 Exceeds by ₹${formatINR(Math.abs(remainingToAllocate))}`}
                  </span>
                </div>

                {/* Split Rows */}
                {splits.map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#0f172a',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#94a3b8',
                        width: '20px',
                      }}
                    >
                      #{idx + 1}
                    </span>

                    {/* Account Selector */}
                    <div style={{ flex: '1 1 180px', minWidth: '150px' }}>
                      <select
                        value={s.account}
                        onChange={(e) => handleSplitChange(idx, 'account', e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: '44px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#1e293b',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: '#f8fafc',
                          fontSize: '0.92rem',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      >
                        {KNOWN_EXPENSE_ACCOUNTS.map((acc) => (
                          <option key={acc.id} value={acc.label}>
                            {acc.label}
                          </option>
                        ))}
                        <option value="Other">👤 Other Coordinator...</option>
                      </select>
                    </div>

                    {s.account === 'Other' && (
                      <div style={{ flex: '1 1 140px', minWidth: '130px' }}>
                        <input
                          type="text"
                          value={s.customAccount || ''}
                          onChange={(e) => handleSplitChange(idx, 'customAccount', e.target.value)}
                          placeholder="Payer name"
                          style={{
                            width: '100%',
                            minHeight: '44px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            backgroundColor: '#1e293b',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                            color: '#f8fafc',
                            fontSize: '0.92rem',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    )}

                    {/* In-Hand Available Money Indicator (Circled in UI) */}
                    {(() => {
                      const targetAccount = s.account === 'Other' ? (s.customAccount || 'Other') : s.account;
                      const bal = getAccountInHandBalance(targetAccount, liveSettlementData.accounts);
                      const prevSaved = getPreviouslySavedAmountForAccount(targetAccount);
                      const enteredAmt = parseInt(s.amount, 10) || 0;
                      const delta = enteredAmt - prevSaved;
                      const projectedBalance = bal.netBalance - delta;

                      return (
                        <div
                          style={{
                            flex: '1 1 180px',
                            minWidth: '140px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            backgroundColor:
                              bal.netBalance > 0
                                ? projectedBalance >= 0
                                  ? 'rgba(16, 185, 129, 0.12)'
                                  : 'rgba(245, 158, 11, 0.14)'
                                : bal.netBalance < 0
                                ? 'rgba(239, 68, 68, 0.12)'
                                : 'rgba(148, 163, 184, 0.08)',
                            border: `1px solid ${
                              bal.netBalance > 0
                                ? projectedBalance >= 0
                                  ? 'rgba(16, 185, 129, 0.3)'
                                  : 'rgba(245, 158, 11, 0.4)'
                                : bal.netBalance < 0
                                ? 'rgba(239, 68, 68, 0.3)'
                                : 'rgba(148, 163, 184, 0.18)'
                            }`,
                            fontSize: '0.75rem',
                            minHeight: '44px',
                            boxSizing: 'border-box',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                              <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>
                                💰 In Hand:
                              </span>
                              <strong
                                style={{
                                  color: bal.netBalance > 0 ? '#86efac' : bal.netBalance < 0 ? '#fca5a5' : '#cbd5e1',
                                  fontSize: '0.8rem',
                                }}
                              >
                                ₹{formatINR(bal.netBalance)}
                              </strong>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', fontSize: '0.7rem' }}>
                              <span style={{ color: '#64748b' }}>Remaining:</span>
                              <span
                                style={{
                                  fontWeight: 700,
                                  color:
                                    projectedBalance > 0
                                      ? '#34d399'
                                      : projectedBalance === 0
                                      ? '#cbd5e1'
                                      : '#fbbf24',
                                }}
                              >
                                {projectedBalance > 0
                                  ? `₹${formatINR(projectedBalance)} left`
                                  : projectedBalance === 0
                                  ? (bal.inflow > 0 ? '₹0 (All Spent)' : '₹0')
                                  : `⚠️ Over by ₹${formatINR(Math.abs(projectedBalance))}`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Amount Input */}
                    <div
                      style={{
                        position: 'relative',
                        flex: '0 1 120px',
                        minWidth: '105px',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          left: '10px',
                          top: '12px',
                          color: '#94a3b8',
                          fontSize: '0.9rem',
                          pointerEvents: 'none',
                        }}
                      >
                        ₹
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={s.amount}
                        onChange={(e) =>
                          handleSplitChange(idx, 'amount', e.target.value.replace(/\D/g, ''))
                        }
                        placeholder="0"
                        style={{
                          width: '100%',
                          minHeight: '44px',
                          padding: '8px 8px 8px 24px',
                          borderRadius: '6px',
                          backgroundColor: '#1e293b',
                          border: '1px solid rgba(134, 239, 172, 0.3)',
                          color: '#f8fafc',
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Auto-fill or Delete Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {remainingToAllocate > 0 && !s.amount && (
                        <button
                          type="button"
                          onClick={() => handleAutoFillRemaining(idx)}
                          style={{
                            minHeight: '44px',
                            padding: '0 8px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            color: '#6ee7b7',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                          title={`Auto-fill remaining ₹${remainingToAllocate}`}
                        >
                          Fill ₹{remainingToAllocate}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveSplitRow(idx)}
                        style={{
                          minHeight: '44px',
                          minWidth: '44px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#fca5a5',
                          fontSize: '15px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background-color 0.15s',
                        }}
                        title="Remove this split row"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                {/* Actions: Add Row & Clear Splits */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleAddSplitRow}
                    style={{
                      minHeight: '40px',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px dashed rgba(255, 255, 255, 0.2)',
                      color: '#93c5fd',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      width: 'fit-content',
                    }}
                  >
                    <span>➕ Add Another Account</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsSplitMode(false);
                      setSingleAccount('');
                      setCustomAccountName('');
                    }}
                    style={{
                      minHeight: '40px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#fca5a5',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    title="Clear all splits and return to unassigned"
                  >
                    ✕ Clear Splits (Unassign)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Vendor Details */}
          <div className="expense-grid-2">
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9', display: 'block', marginBottom: '6px' }}>
                Vendor / Payee Name <span style={{ color: '#94a3b8', fontWeight: 400 }}>(Optional)</span>
              </label>
              <input
                type="text"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="e.g. Royal Caterers / Sharma Tent"
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  fontSize: '1rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="field-vendor-phone"
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#f1f5f9',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Vendor Contact / Phone <span style={{ color: '#94a3b8', fontWeight: 400 }}>(Optional)</span>
              </label>
              <div
                className="input-prefix-wrap"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  backgroundColor: '#0f172a',
                  minHeight: '44px',
                }}
              >
                <span
                  className="input-prefix"
                  style={{
                    minWidth: '48px',
                    alignSelf: 'stretch',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    borderRight: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#38bdf8',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    userSelect: 'none',
                    padding: '0 12px',
                  }}
                >
                  +91
                </span>
                <input
                  id="field-vendor-phone"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={vendorPhone}
                  onChange={(e) => {
                    let digits = e.target.value.replace(/\D/g, '');
                    if (digits.length > 10) {
                      digits = digits.slice(-10);
                    }
                    setVendorPhone(digits);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="10-digit mobile number"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: '44px',
                    padding: '10px 12px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: '#f8fafc',
                    fontSize: '1rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {vendorPhone.length > 0 && (
                  <div style={{ padding: '0 10px', flexShrink: 0 }}>
                    {vendorPhone.length === 10 ? (
                      <span
                        style={{
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          color: '#34d399',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ✓ 10 digits
                      </span>
                    ) : (
                      <span
                        style={{
                          backgroundColor: 'rgba(245, 158, 11, 0.15)',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          color: '#fbbf24',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {vendorPhone.length}/10
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bill / Receipt Upload & Notes */}
          <div className="expense-grid-bottom">
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '6px',
                }}
              >
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9' }}>
                  Bills / Receipts / Screenshots{' '}
                  <span style={{ color: '#94a3b8', fontWeight: 400 }}>
                    ({existingReceiptPaths.length + newReceiptPreviews.length})
                  </span>
                </label>
                {(existingReceiptPaths.length > 0 || newReceiptPreviews.length > 0) && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#93c5fd',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '2px 6px',
                    }}
                  >
                    ➕ Add More
                  </button>
                )}
              </div>

              {/* Multiple Receipts Gallery */}
              {existingReceiptPaths.length === 0 && newReceiptPreviews.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed rgba(255, 255, 255, 0.2)',
                    borderRadius: '10px',
                    padding: '16px 14px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: 'rgba(15, 23, 42, 0.4)',
                    transition: 'border-color 0.2s',
                    height: '110px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                  }}
                >
                  <span style={{ fontSize: '22px', display: 'block', marginBottom: '2px' }}>📄</span>
                  <span style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 500 }}>
                    Upload Bills / Receipts / Screenshots
                  </span>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                    Tap to select one or multiple photos (PNG, JPG, WebP)
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    maxHeight: '190px',
                    overflowY: 'auto',
                    paddingRight: '4px',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                      gap: '8px',
                    }}
                  >
                    {/* Existing Saved Receipts */}
                    {existingReceiptPaths.map((path, idx) => {
                      const url = getPublicExpenseScreenshotUrl(path);
                      return (
                        <div
                          key={`existing-${idx}`}
                          style={{
                            position: 'relative',
                            backgroundColor: '#0f172a',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '8px',
                            padding: '6px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div
                            onClick={() => url && setLightboxUrl(url)}
                            style={{
                              height: '64px',
                              width: '100%',
                              backgroundColor: '#1e293b',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            title="Click to enlarge"
                          >
                            {url ? (
                              <img
                                src={url}
                                alt={`Receipt ${idx + 1}`}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                }}
                              />
                            ) : (
                              <span style={{ fontSize: '20px' }}>📄</span>
                            )}
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '4px',
                              fontSize: '0.72rem',
                            }}
                          >
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: '#93c5fd',
                                  textDecoration: 'none',
                                  fontWeight: 600,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title="Open original in new tab"
                              >
                                🔗 Bill #{idx + 1} ↗
                              </a>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>Bill #{idx + 1}</span>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRemoveExistingReceipt(idx)}
                              style={{
                                border: 'none',
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#fca5a5',
                                borderRadius: '4px',
                                padding: '2px 5px',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                              }}
                              title="Delete receipt"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Newly Selected Receipts */}
                    {newReceiptPreviews.map((item, idx) => (
                      <div
                        key={`new-${idx}`}
                        style={{
                          position: 'relative',
                          backgroundColor: '#0f172a',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          borderRadius: '8px',
                          padding: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div
                          onClick={() => setLightboxUrl(item.url)}
                          style={{
                            height: '64px',
                            width: '100%',
                            backgroundColor: '#1e293b',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Click to enlarge"
                        >
                          <img
                            src={item.url}
                            alt={item.name}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                          />
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '4px',
                            fontSize: '0.72rem',
                          }}
                        >
                          <span
                            style={{
                              color: '#38bdf8',
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={`${item.name} (${Math.round(item.size / 1024)} KB)`}
                          >
                            ✨ New ({Math.round(item.size / 1024)}K)
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveNewReceipt(idx)}
                            style={{
                              border: 'none',
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#fca5a5',
                              borderRadius: '4px',
                              padding: '2px 5px',
                              cursor: 'pointer',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                            }}
                            title="Remove file"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px dashed rgba(255, 255, 255, 0.2)',
                      color: '#93c5fd',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      alignSelf: 'flex-start',
                    }}
                  >
                    ➕ Add Another Bill / Screenshot
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFilesChange}
                style={{ display: 'none' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9', display: 'block', marginBottom: '6px' }}>
                Notes / Line Item Details <span style={{ color: '#94a3b8', fontWeight: 400 }}>(Optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Rate: ₹320/plate for 300 alumni, ₹10k advance paid on 15 Oct"
                style={{
                  width: '100%',
                  height: '110px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  fontSize: '0.92rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'none',
                }}
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: initialData?.id && onDelete ? 'space-between' : 'flex-end',
              gap: '12px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              marginTop: '4px',
              flexWrap: 'wrap',
            }}
          >
            {initialData?.id && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleting}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: '44px',
                  transition: 'background-color 0.15s',
                }}
              >
                {deleting ? 'Deleting...' : '🗑️ Delete Item'}
              </button>
            )}

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving || deleting}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#cbd5e1',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  minHeight: '44px',
                  transition: 'background-color 0.15s',
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving || deleting}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  color: '#ffffff',
                  padding: '10px 22px',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: '44px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'transform 0.1s, box-shadow 0.15s',
                }}
              >
                {saving ? 'Saving...' : initialData ? 'Update Expense' : 'Save Expense'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Fullscreen Lightbox Modal for Receipts */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.88)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 99999,
            cursor: 'zoom-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '92vw',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'default',
            }}
          >
            <div
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <a
                href={lightboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#93c5fd',
                  fontSize: '0.85rem',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.12)',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  minHeight: '40px',
                }}
              >
                🔗 Open Original in New Tab ↗
              </a>
              <button
                type="button"
                onClick={() => setLightboxUrl(null)}
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.85)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minHeight: '40px',
                }}
              >
                ✕ Close
              </button>
            </div>

            <img
              src={lightboxUrl}
              alt="Expense Receipt Full View"
              style={{
                maxWidth: '100%',
                maxHeight: '78vh',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
