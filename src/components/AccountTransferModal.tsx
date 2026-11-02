import React, { useState, useEffect, useMemo } from 'react';
import type { EventExpense } from '../types';
import {
  KNOWN_EXPENSE_ACCOUNTS,
  formatINR,
  getPublicExpenseScreenshotUrl,
  type AccountSettlement,
} from '../lib/expenses';

interface AccountTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transferPayload: Partial<EventExpense>, receiptFile?: File | null) => Promise<boolean>;
  onDelete?: (id: string) => Promise<boolean>;
  initialData?: EventExpense | null;
  presetFromAccount?: string;
  accounts: AccountSettlement[];
  eventId?: string;
}

export const AccountTransferModal: React.FC<AccountTransferModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialData,
  presetFromAccount,
  accounts,
  eventId,
}) => {
  const [fromAccount, setFromAccount] = useState<string>('');
  const [toAccount, setToAccount] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [paymentMode, setPaymentMode] = useState<string>('UPI');
  const [referenceNote, setReferenceNote] = useState<string>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Build selectable accounts list from known accounts + active accounts
  const availableAccounts = useMemo(() => {
    const list: { id: string; name: string; label: string; balance: number }[] = [];
    const seen = new Set<string>();

    // First include active accounts from settlements
    accounts.forEach((acc) => {
      const key = acc.accountName.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          id: acc.accountId || acc.accountName,
          name: acc.accountName,
          label: acc.label || acc.accountName,
          balance: acc.netBalance,
        });
      }
    });

    // Then ensure all known accounts are present
    KNOWN_EXPENSE_ACCOUNTS.forEach((k) => {
      const key = k.accountName.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          id: k.id,
          name: k.accountName,
          label: k.label,
          balance: 0,
        });
      }
    });

    return list;
  }, [accounts]);

  // Sync state on open / initialData change
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);
    setReceiptFile(null);

    if (initialData && initialData.category === 'Internal Transfer') {
      setFromAccount(initialData.paid_from_account || '');
      setToAccount(initialData.vendor_name || '');
      setAmount(initialData.actual_amount ? String(initialData.actual_amount) : '');
      setTransferDate(
        initialData.payment_date || new Date().toISOString().split('T')[0]
      );
      setPaymentMode(initialData.payment_mode || 'UPI');
      setReferenceNote(initialData.notes || '');

      const existingUrl = getPublicExpenseScreenshotUrl(
        initialData.payment_screenshot_path
      );
      setReceiptPreview(existingUrl);
    } else {
      // Default new transfer
      const defaultFrom =
        presetFromAccount ||
        (availableAccounts.length > 0 ? availableAccounts[0].name : 'Hari Narayan');
      setFromAccount(defaultFrom);

      const defaultTo =
        availableAccounts.find(
          (a) => a.name.toLowerCase() !== defaultFrom.toLowerCase()
        )?.name || 'Mukesh';
      setToAccount(defaultTo);

      setAmount('');
      setTransferDate(new Date().toISOString().split('T')[0]);
      setPaymentMode('UPI');
      setReferenceNote('');
      setReceiptPreview(null);
    }
  }, [isOpen, initialData, presetFromAccount, availableAccounts]);

  if (!isOpen) return null;

  // Selected sender details & balance
  const senderAcc = availableAccounts.find(
    (a) => a.name.toLowerCase() === fromAccount.toLowerCase()
  );
  const senderBalance = senderAcc ? senderAcc.balance : 0;

  // Selected receiver details
  const receiverAcc = availableAccounts.find(
    (a) => a.name.toLowerCase() === toAccount.toLowerCase()
  );

  const numAmount = Number(amount) || 0;

  // Quick swap sender and receiver
  const handleSwap = () => {
    const temp = fromAccount;
    setFromAccount(toAccount);
    setToAccount(temp);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setReceiptFile(file);
    if (file) {
      setReceiptPreview(URL.createObjectURL(file));
    } else {
      setReceiptPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fromAccount.trim()) {
      setErrorMsg('Please select a sender account.');
      return;
    }
    if (!toAccount.trim()) {
      setErrorMsg('Please select a receiver account.');
      return;
    }
    if (fromAccount.toLowerCase() === toAccount.toLowerCase()) {
      setErrorMsg('Sender and Receiver accounts must be different.');
      return;
    }
    if (numAmount <= 0) {
      setErrorMsg('Please enter a valid transfer amount greater than ₹0.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Partial<EventExpense> = {
        id: initialData?.id,
        event_id: eventId || null,
        item_name: `Transfer: ${fromAccount} ➔ ${toAccount}`,
        category: 'Internal Transfer',
        expected_amount: 0,
        actual_amount: numAmount,
        status: 'settled',
        paid_from_account: fromAccount,
        vendor_name: toAccount, // stores target recipient
        notes: referenceNote.trim() || `Inter-account transfer to ${toAccount}`,
        payment_mode: paymentMode,
        payment_date: transferDate,
        payment_splits: [
          {
            account: fromAccount,
            amount: numAmount,
            date: transferDate,
            mode: paymentMode,
            note: `Transfer to ${toAccount}`,
          },
        ],
      };

      const success = await onSave(payload, receiptFile);
      if (success) {
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to record transfer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initialData?.id || !onDelete) return;
    const confirmed = window.confirm(
      'Are you sure you want to delete this internal transfer record?'
    );
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const success = await onDelete(initialData.id);
      if (success) {
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete transfer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '94vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: 'rgba(30, 41, 59, 0.8)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: 'rgba(99, 102, 241, 0.18)',
                color: '#818cf8',
                fontSize: '20px',
                border: '1px solid rgba(99, 102, 241, 0.3)',
              }}
            >
              ⇄
            </span>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.08rem',
                  fontWeight: 700,
                  color: '#f8fafc',
                }}
              >
                {initialData ? 'Edit Internal Transfer' : 'Transfer Funds Between Accounts'}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#94a3b8' }}>
                Reshuffles coordinator cash/bank balances without inflating event expenses
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              lineHeight: 1,
              minWidth: '44px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {errorMsg && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#fca5a5',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Accounts Transfer Row (From ➔ To with Swap Button) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#1e293b',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            {/* Sender (From) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#f87171',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Debited (From)
              </label>
              <select
                value={fromAccount}
                onChange={(e) => setFromAccount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 8px',
                  borderRadius: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  fontSize: '1rem',
                  fontWeight: 600,
                  minHeight: '44px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {availableAccounts.map((acc) => (
                  <option key={`from-${acc.id}`} value={acc.name}>
                    {acc.name}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                Balance:{' '}
                <strong
                  style={{
                    color: senderBalance >= 0 ? '#34d399' : '#f87171',
                  }}
                >
                  ₹{formatINR(senderBalance)}
                </strong>
              </span>
            </div>

            {/* Swap Button */}
            <button
              type="button"
              onClick={handleSwap}
              title="Swap From and To"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '50%',
                width: '38px',
                height: '38px',
                color: '#cbd5e1',
                fontSize: '16px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                alignSelf: 'center',
                marginTop: '12px',
                transition: 'all 0.15s ease',
              }}
            >
              ⇄
            </button>

            {/* Receiver (To) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#34d399',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Credited (To)
              </label>
              <select
                value={toAccount}
                onChange={(e) => setToAccount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 8px',
                  borderRadius: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  fontSize: '1rem',
                  fontWeight: 600,
                  minHeight: '44px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {availableAccounts
                  .filter((a) => a.name.toLowerCase() !== fromAccount.toLowerCase())
                  .map((acc) => (
                    <option key={`to-${acc.id}`} value={acc.name}>
                      {acc.name}
                    </option>
                  ))}
              </select>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                Balance:{' '}
                <strong
                  style={{
                    color: (receiverAcc?.balance || 0) >= 0 ? '#34d399' : '#f87171',
                  }}
                >
                  ₹{formatINR(receiverAcc?.balance || 0)}
                </strong>
              </span>
            </div>
          </div>

          {/* Amount Input & Quick Chips */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              style={{
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#e2e8f0',
              }}
            >
              Transfer Amount (₹) <span style={{ color: '#f87171' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                }}
              >
                ₹
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 10000"
                style={{
                  width: '100%',
                  padding: '11px 12px 11px 32px',
                  borderRadius: '8px',
                  backgroundColor: '#1e293b',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  minHeight: '44px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Quick Amount Chips */}
            <div
              style={{
                display: 'flex',
                gap: '6px',
                flexWrap: 'wrap',
                marginTop: '4px',
              }}
            >
              {[5000, 10000, 25000, 50000].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setAmount(String(chip))}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#cbd5e1',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    minHeight: '32px',
                  }}
                >
                  ₹{formatINR(chip)}
                </button>
              ))}
              {senderBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(senderBalance))}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.35)',
                    color: '#a5b4fc',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    minHeight: '32px',
                  }}
                >
                  Full Available (₹{formatINR(senderBalance)})
                </button>
              )}
            </div>

            {numAmount > senderBalance && senderBalance > 0 && (
              <span
                style={{
                  fontSize: '0.74rem',
                  color: '#fbbf24',
                  marginTop: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                ⚠️ Note: Transfer amount exceeds {fromAccount}'s surplus balance (₹{formatINR(senderBalance)}).
              </span>
            )}
          </div>

          {/* Date & Mode Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            {/* Transfer Date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>
                Date <span style={{ color: '#f87171' }}>*</span>
              </label>
              <input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 10px',
                  borderRadius: '8px',
                  backgroundColor: '#1e293b',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  fontSize: '1rem',
                  minHeight: '44px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Payment Mode */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 10px',
                  borderRadius: '8px',
                  backgroundColor: '#1e293b',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  fontSize: '1rem',
                  minHeight: '44px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                <option value="Bank Transfer (NEFT/IMPS)">Bank Transfer (IMPS/NEFT)</option>
                <option value="Cash">Cash Handover</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Reference / Note */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>
              Purpose / Reference Note / UTR
            </label>
            <input
              type="text"
              value={referenceNote}
              onChange={(e) => setReferenceNote(e.target.value)}
              placeholder="e.g. Sent ₹10k for Catering Advance / UTR 42398..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: '#1e293b',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#f8fafc',
                fontSize: '1rem',
                minHeight: '44px',
                outline: 'none',
              }}
            />
          </div>

          {/* Optional Receipt / Screenshot Upload */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>
              Transfer Proof / Screenshot (Optional)
            </label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '8px',
                backgroundColor: '#1e293b',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#94a3b8',
                fontSize: '0.85rem',
                minHeight: '44px',
                cursor: 'pointer',
              }}
            />
            {receiptPreview && (
              <div style={{ marginTop: '4px' }}>
                <img
                  src={receiptPreview}
                  alt="Transfer Receipt Preview"
                  style={{
                    maxHeight: '120px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    objectFit: 'cover',
                  }}
                />
              </div>
            )}
          </div>

          {/* Impact Preview Card */}
          {numAmount > 0 && fromAccount && toAccount && (
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.7)',
                borderRadius: '10px',
                padding: '12px 14px',
                border: '1px dashed rgba(99, 102, 241, 0.35)',
                fontSize: '0.82rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <span style={{ fontWeight: 700, color: '#a5b4fc' }}>
                📊 Projected Post-Transfer Balances:
              </span>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: '#cbd5e1' }}>
                  {fromAccount} (Debit -₹{formatINR(numAmount)}):
                </span>
                <strong style={{ color: senderBalance - numAmount >= 0 ? '#34d399' : '#f87171' }}>
                  ₹{formatINR(senderBalance - numAmount)}
                </strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: '#cbd5e1' }}>
                  {toAccount} (Credit +₹{formatINR(numAmount)}):
                </span>
                <strong style={{ color: '#34d399' }}>
                  ₹{formatINR((receiverAcc?.balance || 0) + numAmount)}
                </strong>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: initialData ? 'space-between' : 'flex-end',
              gap: '10px',
              marginTop: '8px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              flexWrap: 'wrap',
            }}
          >
            {initialData && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  color: '#f87171',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  minHeight: '44px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>🗑️</span>
                <span>Delete</span>
              </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  color: '#cbd5e1',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  minHeight: '44px',
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  minHeight: '44px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                <span>{isSubmitting ? 'Saving...' : initialData ? 'Update Transfer' : 'Record Transfer'}</span>
                <span>➔</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

