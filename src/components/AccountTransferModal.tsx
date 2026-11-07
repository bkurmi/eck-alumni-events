import React, { useState, useEffect, useMemo } from 'react';
import type { EventExpense } from '../types';
import {
  KNOWN_EXPENSE_ACCOUNTS,
  formatINR,
  getPublicExpenseScreenshotUrl,
  type AccountSettlement,
} from '../lib/expenses';
import { ArrowLeftRight, X, AlertCircle, Trash2, ArrowRight } from 'lucide-react';

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

  // Build selectable accounts list from active accounts + fallback known accounts
  const availableAccounts = useMemo(() => {
    const list: { id: string; name: string; label: string; balance: number }[] = [];
    const seen = new Set<string>();

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
      const initialFrom =
        presetFromAccount ||
        accounts.find((a) => a.netBalance > 0)?.accountName ||
        availableAccounts[0]?.name ||
        '';

      const initialTo =
        availableAccounts.find(
          (a) => a.name.toLowerCase() !== initialFrom.toLowerCase()
        )?.name || '';

      setFromAccount(initialFrom);
      setToAccount(initialTo);
      setAmount('');
      setTransferDate(new Date().toISOString().split('T')[0]);
      setPaymentMode('UPI');
      setReferenceNote('');
      setReceiptPreview(null);
    }
    setIsSubmitting(false);
  }, [isOpen, initialData, presetFromAccount, accounts, availableAccounts]);

  const senderAcc = availableAccounts.find(
    (a) => a.name.toLowerCase() === fromAccount.toLowerCase()
  );
  const receiverAcc = availableAccounts.find(
    (a) => a.name.toLowerCase() === toAccount.toLowerCase()
  );

  const senderBalance = senderAcc?.balance || 0;
  const numAmount = Number(amount) || 0;

  const handleSwap = () => {
    const temp = fromAccount;
    setFromAccount(toAccount);
    setToAccount(temp);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setErrorMsg('Screenshot file size exceeds 10MB.');
        return;
      }
      setReceiptFile(file);
      setReceiptPreview(URL.createObjectURL(file));
      setErrorMsg(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fromAccount) {
      setErrorMsg('Please select a sender account (From).');
      return;
    }
    if (!toAccount) {
      setErrorMsg('Please select a receiver account (To).');
      return;
    }
    if (fromAccount.toLowerCase() === toAccount.toLowerCase()) {
      setErrorMsg('Sender and receiver cannot be the same account.');
      return;
    }
    if (!numAmount || numAmount <= 0) {
      setErrorMsg('Please enter a valid transfer amount greater than 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Partial<EventExpense> = {
        ...(initialData?.id ? { id: initialData.id } : {}),
        item_name: `Inter-Account Transfer (${fromAccount} ➔ ${toAccount})`,
        category: 'Internal Transfer',
        expected_amount: numAmount,
        actual_amount: numAmount,
        paid_from_account: fromAccount,
        vendor_name: toAccount,
        payment_date: transferDate,
        payment_mode: paymentMode,
        notes: referenceNote.trim() || `Transferred from ${fromAccount} to ${toAccount}`,
        status: 'settled',
        event_id: eventId || null,
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[94vh] sm:max-h-[85vh] bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center justify-center text-lg">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-100">
                {initialData ? 'Edit Internal Transfer' : 'Transfer Funds Between Accounts'}
              </h3>
              <p className="text-xs text-slate-400">
                Reshuffles coordinator cash/bank balances without inflating event expenses
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-100 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col gap-4 text-left">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs sm:text-sm flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="flex-1 font-medium">{errorMsg}</span>
            </div>
          )}

          {/* Accounts Transfer Row */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-3 sm:p-3.5 bg-slate-950/60 rounded-2xl border border-slate-800">
            {/* Sender (From) */}
            <div className="flex flex-col gap-1 min-w-0">
              <label className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">
                Debited (From)
              </label>
              <select
                value={fromAccount}
                onChange={(e) => setFromAccount(e.target.value)}
                className="w-full min-h-[44px] px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-100 text-sm font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {availableAccounts.map((acc) => (
                  <option key={`from-${acc.id}`} value={acc.name}>
                    {acc.name}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-400 truncate">
                Balance:{' '}
                <strong className={senderBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  ₹{formatINR(senderBalance)}
                </strong>
              </span>
            </div>

            {/* Swap Button */}
            <button
              type="button"
              onClick={handleSwap}
              title="Swap From and To"
              className="w-9 h-9 mt-4 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-amber-400 flex items-center justify-center transition-colors cursor-pointer self-center"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            {/* Receiver (To) */}
            <div className="flex flex-col gap-1 min-w-0">
              <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                Credited (To)
              </label>
              <select
                value={toAccount}
                onChange={(e) => setToAccount(e.target.value)}
                className="w-full min-h-[44px] px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-100 text-sm font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {availableAccounts
                  .filter((a) => a.name.toLowerCase() !== fromAccount.toLowerCase())
                  .map((acc) => (
                    <option key={`to-${acc.id}`} value={acc.name}>
                      {acc.name}
                    </option>
                  ))}
              </select>
              <span className="text-[11px] text-slate-400 truncate">
                Balance:{' '}
                <strong className={(receiverAcc?.balance || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  ₹{formatINR(receiverAcc?.balance || 0)}
                </strong>
              </span>
            </div>
          </div>

          {/* Amount Input & Quick Chips */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
              Transfer Amount (₹) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-indigo-400 font-mono">
                ₹
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 10000"
                className="w-full min-h-[44px] pl-8 pr-4 py-2.5 bg-slate-950 text-indigo-400 font-bold font-mono text-lg rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/60"
              />
            </div>

            {/* Quick Amount Chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[5000, 10000, 25000, 50000].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setAmount(String(chip))}
                  className="min-h-[32px] px-2.5 py-1 rounded-full text-xs font-semibold font-mono bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  ₹{formatINR(chip)}
                </button>
              ))}
              {senderBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(senderBalance))}
                  className="min-h-[32px] px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 border border-indigo-500/35 text-indigo-300 hover:bg-indigo-500/25 transition-colors cursor-pointer"
                >
                  Full Available (₹{formatINR(senderBalance)})
                </button>
              )}
            </div>

            {numAmount > senderBalance && senderBalance > 0 && (
              <span className="text-xs text-amber-400 mt-1.5 block">
                ⚠️ Note: Transfer amount exceeds {fromAccount}'s surplus balance (₹{formatINR(senderBalance)}).
              </span>
            )}
          </div>

          {/* Date & Mode Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                Date <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 text-slate-100 rounded-xl text-base sm:text-sm border border-slate-800 focus:outline-none focus:border-indigo-500/60"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 text-slate-100 rounded-xl text-base sm:text-sm border border-slate-800 focus:outline-none focus:border-indigo-500/60 cursor-pointer"
              >
                <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                <option value="Bank Transfer (NEFT/IMPS)">Bank Transfer (IMPS/NEFT)</option>
                <option value="Cash">Cash Handover</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Purpose / UTR */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
              Purpose / Reference Note / UTR
            </label>
            <input
              type="text"
              value={referenceNote}
              onChange={(e) => setReferenceNote(e.target.value)}
              placeholder="e.g. Sent ₹10k for Catering Advance / UTR 42398..."
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 text-slate-100 placeholder-slate-500 rounded-xl text-base sm:text-sm border border-slate-800 focus:outline-none focus:border-indigo-500/60"
            />
          </div>

          {/* Transfer Proof / Screenshot Upload */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
              Transfer Proof / Screenshot (Optional)
            </label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              className="w-full min-h-[44px] p-2 bg-slate-950 text-slate-400 rounded-xl border border-slate-800 text-xs sm:text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200 file:text-xs cursor-pointer"
            />
            {receiptPreview && (
              <div className="mt-2">
                <img
                  src={receiptPreview}
                  alt="Transfer Receipt Preview"
                  className="max-h-24 rounded-lg border border-slate-700 object-cover"
                />
              </div>
            )}
          </div>

          {/* Impact Preview Card */}
          {numAmount > 0 && fromAccount && toAccount && (
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-dashed border-indigo-500/35 text-xs flex flex-col gap-1.5">
              <span className="font-bold text-indigo-300">
                📊 Projected Post-Transfer Balances:
              </span>
              <div className="flex justify-between items-center text-slate-300">
                <span>{fromAccount} (Debit -₹{formatINR(numAmount)}):</span>
                <strong className={senderBalance - numAmount >= 0 ? 'text-emerald-400 font-mono' : 'text-rose-400 font-mono'}>
                  ₹{formatINR(senderBalance - numAmount)}
                </strong>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>{toAccount} (Credit +₹{formatINR(numAmount)}):</span>
                <strong className="text-emerald-400 font-mono">
                  ₹{formatINR((receiverAcc?.balance || 0) + numAmount)}
                </strong>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2.5 shrink-0">
            {initialData && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-400 font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 hover:bg-rose-500/20 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-sm inline-flex items-center gap-1.5 shadow-md shadow-indigo-600/30 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                <span>{isSubmitting ? 'Saving...' : initialData ? 'Update Transfer' : 'Record Transfer'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
