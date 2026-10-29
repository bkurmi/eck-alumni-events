import React, { useState, useEffect, useRef } from 'react';
import type { EventExpense, ExpenseStatus } from '../types';
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_MODES } from '../types';
import { getPublicExpenseScreenshotUrl, formatINR } from '../lib/expenses';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: Partial<EventExpense>, receiptFile?: File | null) => Promise<boolean>;
  onDelete?: (id: string) => Promise<boolean>;
  initialData?: EventExpense | null;
  currentUserEmail?: string;
  eventId?: string;
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
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [existingReceiptPath, setExistingReceiptPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        setExistingReceiptPath(initialData.payment_screenshot_path || null);
        setReceiptFile(null);
        setReceiptPreview(getPublicExpenseScreenshotUrl(initialData.payment_screenshot_path));
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
        setExistingReceiptPath(null);
        setReceiptFile(null);
        setReceiptPreview(null);
      }
      setErrorMsg(null);
      setSaving(false);
      setDeleting(false);
    }
  }, [isOpen, initialData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg('Receipt image size exceeds 8MB limit. Please choose a smaller photo.');
      return;
    }

    setReceiptFile(file);
    const objectUrl = URL.createObjectURL(file);
    setReceiptPreview(objectUrl);
    setErrorMsg(null);
  };

  const handleRemoveReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    setExistingReceiptPath(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const numExpected = parseInt(expectedAmount, 10) || 0;
  const numActual = parseInt(actualAmount, 10) || 0;
  const diff = numExpected - numActual;

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
        payment_screenshot_path: existingReceiptPath,
        notes: notes.trim() || null,
        created_by: initialData?.created_by || currentUserEmail || 'admin',
      };

      const success = await onSave(payload, receiptFile);
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
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9', display: 'block', marginBottom: '6px' }}>
                Bill / Receipt / Screenshot <span style={{ color: '#94a3b8', fontWeight: 400 }}>(Optional)</span>
              </label>

              {receiptPreview ? (
                <div
                  style={{
                    position: 'relative',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '110px',
                    boxSizing: 'border-box',
                  }}
                >
                  <img
                    src={receiptPreview}
                    alt="Receipt Preview"
                    style={{
                      maxHeight: '100px',
                      width: 'auto',
                      maxWidth: '90%',
                      objectFit: 'contain',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleRemoveReceipt}
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      backgroundColor: 'rgba(239, 68, 68, 0.9)',
                      border: 'none',
                      color: '#ffffff',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      minHeight: '28px',
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed rgba(255, 255, 255, 0.2)',
                    borderRadius: '10px',
                    padding: '12px 14px',
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
                    Upload Bill / Receipt / UPI Screenshot
                  </span>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                    PNG, JPG, WebP up to 8MB
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </div>
              )}
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
    </div>
  );
};
