import React, { useState, useMemo } from 'react';
import {
  ArrowRightLeft,
  Plus,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Phone,
  FileText,
  Edit2,
  Receipt,
  PlusCircle,
  MinusCircle,
  CheckCircle2,
} from 'lucide-react';
import type {
  EventExpense,
  EventRegistration,
  PaymentVerification,
  Sponsorship,
  ECKEvent,
  ExpenseAccountConfig,
} from '../types';
import {
  formatINR,
  getExpenseCategoryIcon,
  getAllExpenseScreenshotUrls,
  buildExpensesWhatsAppMessage,
  computeAccountSettlements,
  formatExpensePayerSummary,
  getExpenseSplits,
} from '../lib/expenses';
import { AccountTransferModal } from './AccountTransferModal';

interface EventExpensesManagerProps {
  expenses: EventExpense[];
  registrationAmount: number;
  sponsorshipAmount: number;
  registrationCount?: number;
  totalHeadcount?: number;
  sponsorshipCount?: number;
  eventName?: string;
  eventId?: string;
  event?: ECKEvent | null;
  expenseAccountsConfig?: ExpenseAccountConfig[] | null;
  registrations?: EventRegistration[];
  verifications?: PaymentVerification[];
  sponsorships?: Sponsorship[];
  onAddExpense: () => void;
  onEditExpense: (expense: EventExpense) => void;
  onSaveExpense?: (expense: Partial<EventExpense>, receiptFiles?: File[] | File | null) => Promise<boolean>;
  onDeleteExpense?: (id: string) => Promise<boolean>;
  onRefresh?: () => void;
  loading?: boolean;
}

export const EventExpensesManager: React.FC<EventExpensesManagerProps> = ({
  expenses,
  registrationAmount,
  sponsorshipAmount,
  registrationCount = 0,
  totalHeadcount = 0,
  sponsorshipCount = 0,
  eventName = 'ECK-RTU Alumni DeepAura 2K26',
  eventId,
  event,
  expenseAccountsConfig,
  registrations = [],
  verifications = [],
  sponsorships = [],
  onAddExpense,
  onEditExpense,
  onSaveExpense,
  onDeleteExpense,
  onRefresh: _onRefresh,
  loading: _loading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('all');
  const [isSettlementOpen, setIsSettlementOpen] = useState<boolean>(true);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Inter-Account Transfers Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<EventExpense | null>(null);
  const [presetFromAccount, setPresetFromAccount] = useState<string | undefined>(undefined);
  const [isTransfersHistoryOpen, setIsTransfersHistoryOpen] = useState<boolean>(true);
  const [activeLedgerTab, setActiveLedgerTab] = useState<'expenses' | 'transfers' | 'all'>('expenses');

  // Internal transfers records
  const internalTransfers = useMemo(() => {
    return expenses.filter(
      (e) => e.category === 'Internal Transfer' && e.status !== 'cancelled'
    );
  }, [expenses]);

  // Live account settlements & cash balances
  const settlementData = useMemo(() => {
    return computeAccountSettlements(
      expenses,
      registrations,
      verifications,
      sponsorships,
      expenseAccountsConfig || event?.expense_accounts_config || undefined
    );
  }, [expenses, registrations, verifications, sponsorships, expenseAccountsConfig, event]);

  // Aggregated Financial Metrics & Feasibility (excludes internal transfers & campus legacy fund so real event budget is not distorted)
  const stats = useMemo(() => {
    const realExpenses = expenses.filter(
      (e) => e.category !== 'Internal Transfer' && e.category !== 'Campus Legacy Fund'
    );
    const totalItems = realExpenses.length;
    const totalExpected = realExpenses.reduce((sum, e) => sum + Number(e.expected_amount || 0), 0);
    const totalActual = realExpenses.reduce((sum, e) => sum + Number(e.actual_amount || 0), 0);

    // Total available pool collected so far
    const totalAvailableFunds = registrationAmount + sponsorshipAmount;

    // Budget Feasibility: Is the expected budget breaking available funds?
    const fundingGap = totalAvailableFunds - totalExpected; // negative means deficit / breaking balance
    const isDeficit = fundingGap < 0;
    const fundedPct =
      totalExpected > 0 ? Math.min(Math.round((totalAvailableFunds / totalExpected) * 100), 999) : 100;

    // Liquid Cash remaining in hand right now (Inflow - Actual paid)
    const liveCashBalance = totalAvailableFunds - totalActual;

    // Actual vs Expected variance on executed items
    const actualVariance = totalExpected - totalActual;
    const isUnderBudget = actualVariance >= 0;

    const settledCount = realExpenses.filter(
      (e) => e.status === 'settled' || e.status === 'paid'
    ).length;

    return {
      totalItems,
      totalExpected,
      totalActual,
      totalAvailableFunds,
      fundingGap,
      isDeficit,
      fundedPct,
      liveCashBalance,
      actualVariance,
      isUnderBudget,
      settledCount,
    };
  }, [expenses, registrationAmount, sponsorshipAmount]);

  // Filtered expenses based on active ledger tab, search, status & paying account
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      // Exclude Campus Legacy Fund from Event Expenses list (it is managed exclusively in Central Treasury)
      if (e.category === 'Campus Legacy Fund') return false;
      const isTransfer = e.category === 'Internal Transfer';

      // 1. Filter by Active Ledger Tab (Expenses vs Transfers)
      if (activeLedgerTab === 'expenses' && isTransfer) return false;
      if (activeLedgerTab === 'transfers' && !isTransfer) return false;

      // 2. Search query filter
      const q = searchQuery.toLowerCase().trim();
      const splits = getExpenseSplits(e);
      const payerText = splits.map((s) => s.account).join(' ') + ' ' + (e.paid_from_account || '');

      const matchesSearch =
        !q ||
        (e.item_name || '').toLowerCase().includes(q) ||
        (e.vendor_name || '').toLowerCase().includes(q) ||
        (e.vendor_phone || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q) ||
        payerText.toLowerCase().includes(q);

      // 3. Status filter
      const matchesStatus =
        selectedStatus === 'all' ? true : e.status === selectedStatus;

      // 4. Account filter
      let matchesAccount = true;
      if (selectedAccountFilter !== 'all') {
        const accLower = selectedAccountFilter.toLowerCase();
        if (selectedAccountFilter === 'unassigned') {
          matchesAccount = !isTransfer && Number(e.actual_amount || 0) > 0 && splits.length === 0;
        } else if (isTransfer) {
          const sender = (e.paid_from_account || '').toLowerCase();
          const receiver = (e.vendor_name || '').toLowerCase();
          matchesAccount = sender.includes(accLower) || receiver.includes(accLower);
        } else {
          matchesAccount =
            splits.some((s) => s.account.toLowerCase().includes(accLower)) ||
            (e.paid_from_account || '').toLowerCase().includes(accLower);
        }
      }

      return matchesSearch && matchesStatus && matchesAccount;
    });
  }, [expenses, activeLedgerTab, searchQuery, selectedStatus, selectedAccountFilter]);

  // WhatsApp Share Action
  const handleShareWhatsApp = () => {
    if (expenses.length === 0) {
      alert('No expense items to share yet. Add some items first!');
      return;
    }
    const text = buildExpensesWhatsAppMessage(
      filteredExpenses,
      stats.totalExpected,
      stats.totalActual,
      eventName,
      stats.totalAvailableFunds,
      registrationAmount,
      sponsorshipAmount,
      registrationCount,
      totalHeadcount,
      settlementData.accounts
    );
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'settled':
        return { label: 'Settled', bg: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' };
      case 'paid':
        return { label: 'Paid', bg: 'bg-emerald-900/50 border-emerald-500/50 text-emerald-200' };
      case 'partially_paid':
        return { label: 'Partial', bg: 'bg-amber-950/60 border-amber-500/40 text-amber-300' };
      case 'cancelled':
        return { label: 'Cancelled', bg: 'bg-red-950/60 border-red-500/40 text-red-300' };
      default:
        return { label: 'Planned', bg: 'bg-slate-800 border-slate-700 text-slate-300' };
    }
  };

  return (
    <div className="flex flex-col gap-4 text-slate-100">
      {/* 3 Stats Cards — responsive 1 col mobile, 3 cols desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 1: Total Available Funds */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 shadow-lg flex flex-col items-center justify-center text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
            TOTAL AVAILABLE FUNDS
          </span>
          <span className="text-2xl sm:text-[1.65rem] font-black text-white my-1 tracking-tight">
            ₹{formatINR(stats.totalAvailableFunds)}
          </span>
          <div className="text-amber-400 font-semibold text-xs">
            ₹{formatINR(registrationAmount)} Regs{registrationCount > 0 ? ` (${registrationCount} attending)` : ''} • ₹{formatINR(sponsorshipAmount)} Sponsors{sponsorshipCount > 0 ? ` (${sponsorshipCount})` : ''}
          </div>
          {totalHeadcount > 0 && (
            <div className="text-sky-400 font-semibold text-xs flex items-center justify-center gap-1 mt-0.5">
              <span>👥</span>
              <span>
                {totalHeadcount} Total Headcount {totalHeadcount > registrationCount ? `(${registrationCount} alumni + ${totalHeadcount - registrationCount} guests)` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Card 2: Expected Budget (Plan) with Projected Surplus/Deficit */}
        <div
          className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border shadow-lg flex flex-col items-center justify-center text-center ${
            stats.isDeficit ? 'border-red-500/40' : 'border-amber-500/30'
          }`}
        >
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
            EXPECTED BUDGET (PLAN)
          </span>
          <span className="text-2xl sm:text-[1.65rem] font-black text-white my-1 tracking-tight">
            ₹{formatINR(stats.totalExpected)}
          </span>
          <div className="flex flex-col items-center gap-1 mt-0.5">
            <span
              className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                stats.isDeficit
                  ? 'bg-red-500/15 text-red-400 border-red-500/30'
                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              }`}
            >
              {stats.isDeficit
                ? `Projected Deficit: -₹${formatINR(Math.abs(stats.fundingGap))}`
                : `Projected Surplus: +₹${formatINR(stats.fundingGap)}`}
            </span>
            <span className="text-amber-400 font-semibold text-xs">
              {stats.totalItems} planned line items
              {totalHeadcount > 0 && stats.totalExpected > 0 ? ` • ₹${formatINR(Math.round(stats.totalExpected / totalHeadcount))}/head` : ''}
            </span>
          </div>
        </div>

        {/* Card 3: Real Paid Expenses with Real Surplus/Deficit */}
        <div
          className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border shadow-lg flex flex-col items-center justify-center text-center ${
            stats.liveCashBalance < 0 ? 'border-red-500/40' : 'border-amber-500/30'
          }`}
        >
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
            REAL PAID EXPENSES
          </span>
          <span className="text-2xl sm:text-[1.65rem] font-black text-white my-1 tracking-tight">
            ₹{formatINR(stats.totalActual)}
          </span>
          <div className="flex flex-col items-center gap-1 mt-0.5">
            <span
              className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                stats.liveCashBalance >= 0
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-red-500/15 text-red-400 border-red-500/30'
              }`}
            >
              {stats.liveCashBalance >= 0
                ? `Live Cash Balance: +₹${formatINR(stats.liveCashBalance)}`
                : `Actual Deficit: -₹${formatINR(Math.abs(stats.liveCashBalance))}`}
            </span>
            <span className="text-amber-400 font-semibold text-xs">
              {stats.settledCount} settled{stats.actualVariance !== 0 ? ` • ₹${formatINR(Math.abs(stats.actualVariance))} ${stats.isUnderBudget ? 'saved vs budget' : 'over budget'}` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Minimalist Funding Feasibility Track (Mobile Optimized) */}
      {stats.totalExpected > 0 && (
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 shadow-lg flex flex-col gap-2.5">
          {/* Top Row: Status Pill & Target Budget */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={`px-3 py-0.5 rounded-full text-xs font-bold border tracking-wide whitespace-nowrap ${
                stats.isDeficit
                  ? 'bg-red-500/15 border-red-500/30 text-red-300'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              }`}
            >
              {stats.fundedPct}% Funded
            </span>
            <span className="text-xs text-slate-400 whitespace-nowrap">
              Target: <strong className="text-slate-200 font-bold">₹{formatINR(stats.totalExpected)}</strong>
            </span>
          </div>

          {/* Dual Segment Progress Bar */}
          <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${Math.min(stats.fundedPct, 100)}%` }}
              title={`Collected Funds: ₹${formatINR(stats.totalAvailableFunds)}`}
            />
            {stats.isDeficit && (
              <div
                className="bg-red-500 transition-all duration-500"
                style={{ width: `${Math.max(100 - stats.fundedPct, 0)}%` }}
                title={`Deficit to Raise: ₹${formatINR(Math.abs(stats.fundingGap))}`}
              />
            )}
          </div>

          {/* Bottom Labels */}
          <div className="flex items-center justify-between text-xs font-semibold gap-2">
            <span className="text-emerald-400 inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span>Collected: ₹{formatINR(stats.totalAvailableFunds)}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1.5 whitespace-nowrap ${
                stats.isDeficit ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${stats.isDeficit ? 'bg-red-400' : 'bg-emerald-400'}`} />
              <span>
                {stats.isDeficit
                  ? `Deficit: ₹${formatINR(Math.abs(stats.fundingGap))}`
                  : `Surplus: +₹${formatINR(stats.fundingGap)}`}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* ── ACCOUNT SETTLEMENT & CASH IN HAND CARD ── */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
        {/* Settlement Header */}
        <div
          onClick={() => setIsSettlementOpen((prev) => !prev)}
          className="p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer bg-slate-950/60 hover:bg-slate-950/80 transition-colors select-none flex-wrap"
        >
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="text-xl shrink-0">💳</span>
            <div>
              <h4 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                <span>Account Settlement & Net Balance</span>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Adjusted per Person
                </span>
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Total collections vs expenses disbursed from each account
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTransfer(null);
                setPresetFromAccount(undefined);
                setIsTransferModalOpen(true);
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-indigo-950/40 transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>Transfer Funds</span>
            </button>

            {selectedAccountFilter !== 'all' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedAccountFilter('all');
                }}
                className="min-h-[44px] px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors"
              >
                Clear Filter ✕
              </button>
            )}

            <span className="text-xs text-slate-300 font-semibold flex items-center gap-1 pl-1">
              {isSettlementOpen ? (
                <>
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                  <span className="hidden sm:inline">Hide</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                  <span className="hidden sm:inline">Breakdown</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Settlement Content */}
        {isSettlementOpen && (
          <div className="p-3.5 sm:p-4 border-t border-slate-800/80 space-y-3">
            {/* Account Cards Grid — clean 2 columns for optimal real-estate without truncation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
              {settlementData.accounts.map((acc) => {
                const isSelected =
                  selectedAccountFilter.toLowerCase() === acc.accountName.toLowerCase();
                const isPositive = acc.netBalance > 0;
                const isNegative = acc.netBalance < 0;

                return (
                  <div
                    key={acc.accountId}
                    onClick={() =>
                      setSelectedAccountFilter((prev) =>
                        prev.toLowerCase() === acc.accountName.toLowerCase() ? 'all' : acc.accountName
                      )
                    }
                    className={`p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-slate-800 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-950/40'
                        : 'bg-slate-950/60 hover:bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Header: Name, Bank & Status Pill */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className="font-bold text-sm sm:text-base text-white tracking-tight truncate">
                          {acc.accountName}
                        </span>
                        {acc.bankName && acc.bankName !== 'Other' && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700/60">
                            {acc.bankName}
                          </span>
                        )}
                      </div>

                      {/* Status Pill: Grey for SETTLED, Green for SURPLUS, Red for DUE */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shrink-0 border ${
                          isPositive
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : isNegative
                            ? 'bg-red-500/15 text-red-400 border-red-500/30'
                            : 'bg-slate-800/80 text-slate-300 border-slate-700'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        {isPositive ? 'SURPLUS' : isNegative ? 'DUE' : 'SETTLED'}
                      </span>
                    </div>

                    {/* Inflow vs Spent Row */}
                    <div className="flex items-center justify-between text-xs gap-2 pt-1 font-bold">
                      <div className="flex items-center gap-1 text-emerald-400">
                        <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-slate-300 font-medium">Inflow:</span>
                        <span>₹{formatINR(acc.inflow)}</span>
                      </div>

                      <div className="flex items-center gap-1 text-rose-400">
                        <MinusCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-slate-300 font-medium">Spent:</span>
                        <span>₹{formatINR(acc.outflow)}</span>
                      </div>
                    </div>

                    {/* Internal Transfers breakdown (if any) */}
                    {((acc.transferredIn || 0) > 0 || (acc.transferredOut || 0) > 0) && (
                      <div className="flex items-center justify-between text-[11px] bg-indigo-950/30 border border-indigo-500/20 rounded-lg px-2.5 py-1 text-indigo-300">
                        <span className="flex items-center gap-1 font-semibold">
                          <ArrowRightLeft className="w-3 h-3 text-indigo-400" />
                          <span>Transfers:</span>
                        </span>
                        <div className="flex items-center gap-2 font-bold">
                          {(acc.transferredIn || 0) > 0 && (
                            <span className="text-emerald-400">+₹{formatINR(acc.transferredIn || 0)}</span>
                          )}
                          {(acc.transferredOut || 0) > 0 && (
                            <span className="text-red-400">-₹{formatINR(acc.transferredOut || 0)}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Dedicated Balance Pill Box */}
                    <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2">
                      <span className="text-xs text-slate-400 font-medium">Balance</span>
                      <strong
                        className={`text-sm sm:text-base font-bold ${
                          isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-white'
                        }`}
                      >
                        {isPositive
                          ? `₹${formatINR(acc.netBalance)}`
                          : isNegative
                          ? `-₹${formatINR(Math.abs(acc.netBalance))}`
                          : '₹0'}
                      </strong>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1 gap-2 flex-wrap">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <span>☑</span>
                        <span>{acc.expenseCount} {acc.expenseCount === 1 ? 'expense' : 'expenses'} paid</span>
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTransfer(null);
                            setPresetFromAccount(acc.accountName);
                            setIsTransferModalOpen(true);
                          }}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          title={`Transfer funds out from ${acc.accountName}`}
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          <span>Transfer</span>
                        </button>

                        <span
                          className={`text-[11px] font-semibold flex items-center gap-1 underline underline-offset-2 ${
                            isSelected ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <span>≡</span>
                          <span>{isSelected ? '✓ Filtered' : 'Filter by this'}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── INTER-ACCOUNT TRANSFERS HISTORY SECTION ── */}
            {internalTransfers.length > 0 && (
              <div className="mt-3 rounded-xl bg-slate-950/60 border border-indigo-500/25 overflow-hidden">
                <div
                  onClick={() => setIsTransfersHistoryOpen((prev) => !prev)}
                  className="p-3 bg-indigo-950/20 hover:bg-indigo-950/30 flex items-center justify-between cursor-pointer select-none gap-2 flex-wrap"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs sm:text-sm font-bold text-indigo-200">
                      Inter-Account Transfer History ({internalTransfers.length})
                    </span>
                    <span className="text-[11px] bg-indigo-500/25 text-indigo-300 px-2 py-0.5 rounded-md font-bold font-mono">
                      Total: ₹
                      {formatINR(
                        internalTransfers.reduce(
                          (sum, t) => sum + Number(t.actual_amount || 0),
                          0
                        )
                      )}
                    </span>
                  </div>
                  <span className="text-xs text-indigo-300 font-semibold flex items-center gap-1">
                    {isTransfersHistoryOpen ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" />
                        <span>Hide</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        <span>View History</span>
                      </>
                    )}
                  </span>
                </div>

                {isTransfersHistoryOpen && (
                  <div className="p-2 sm:p-3 space-y-2 border-t border-indigo-500/20">
                    {internalTransfers.map((tx) => {
                      const from = tx.paid_from_account || 'Unknown';
                      const to = tx.vendor_name || 'Unknown';
                      const amt = Number(tx.actual_amount || 0);
                      const receiptUrls = getAllExpenseScreenshotUrls(tx.payment_screenshot_path);

                      return (
                        <div
                          key={tx.id}
                          onClick={() => {
                            setSelectedTransfer(tx);
                            setIsTransferModalOpen(true);
                          }}
                          className="p-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/40 transition-colors cursor-pointer flex items-center justify-between gap-3 flex-wrap"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                              <ArrowRightLeft className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap text-xs sm:text-sm">
                                <strong className="text-red-400">{from}</strong>
                                <span className="text-slate-500">➔</span>
                                <strong className="text-emerald-400">{to}</strong>
                                {tx.payment_mode && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                    {tx.payment_mode}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {tx.payment_date || 'No date'}
                                {tx.notes ? ` • ${tx.notes}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 ml-auto">
                            <strong className="text-indigo-300 font-mono font-bold text-sm sm:text-base">
                              ₹{formatINR(amt)}
                            </strong>
                            {receiptUrls.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewImageUrl(receiptUrls[0]);
                                }}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-sky-400 hover:text-sky-300"
                                title="View transfer receipt"
                              >
                                <Receipt className="w-4 h-4" />
                              </button>
                            )}
                            <span className="text-xs text-indigo-400 hover:underline font-semibold flex items-center gap-1">
                              <Edit2 className="w-3 h-3" />
                              <span>Edit</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION HEADER & PRIMARY ACTIONS ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span>
              {activeLedgerTab === 'transfers'
                ? 'Internal Transfers'
                : activeLedgerTab === 'all'
                ? 'All Ledger Transactions'
                : 'Itemized Expense Ledger'}
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                activeLedgerTab === 'transfers'
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/35'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
              }`}
            >
              {filteredExpenses.length} {activeLedgerTab === 'transfers' ? 'Transfers' : 'Items'}
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {activeLedgerTab === 'transfers'
              ? 'Coordinator-to-coordinator internal fund movements'
              : 'Vendor quotes, planned budgets & real event payments'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {activeLedgerTab === 'transfers' ? (
            <button
              type="button"
              onClick={() => {
                setSelectedTransfer(null);
                setPresetFromAccount(undefined);
                setIsTransferModalOpen(true);
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-indigo-950/40 transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>New Transfer</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onAddExpense}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-emerald-950/40 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Expense</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#025907] via-[#087f10] to-[#0d9616] hover:from-[#036809] hover:via-[#0a8e13] hover:to-[#0fa81a] border border-[#0d9616]/60 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-green-950/50 transition-all cursor-pointer active:scale-[0.98]"
            title="Share itemized Budget report to WhatsApp"
          >
            <span>💬</span>
            <span>Share Report</span>
          </button>
        </div>
      </div>

      {/* ── 2 TABS / SEGMENTED CONTROL: Expenses vs Internal Transfers ── */}
      <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 w-full sm:w-fit overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveLedgerTab('expenses')}
          className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeLedgerTab === 'expenses'
              ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>📋</span>
          <span>Itemized Expenses</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
              activeLedgerTab === 'expenses'
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {stats.totalItems}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveLedgerTab('transfers')}
          className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeLedgerTab === 'transfers'
              ? 'bg-slate-800 text-indigo-300 shadow-sm border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>🔄</span>
          <span>Internal Transfers</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
              activeLedgerTab === 'transfers'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {internalTransfers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveLedgerTab('all')}
          className={`min-h-[40px] px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
            activeLedgerTab === 'all'
              ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>All</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-bold">
            {expenses.length}
          </span>
        </button>
      </div>

      {/* ── SEARCH & FILTER BAR (Mobile Responsive) ── */}
      <div className="flex items-center gap-2 bg-slate-900 p-2 sm:p-2.5 rounded-2xl border border-slate-800 w-full flex-wrap">
        {/* Search Input Box */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search expenses, vendor, payer..."
            className="w-full min-h-[40px] text-base sm:text-sm pl-9 pr-8 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-white placeholder-slate-500 outline-none focus:border-amber-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Account Filter Dropdown */}
          <select
            value={selectedAccountFilter}
            onChange={(e) => setSelectedAccountFilter(e.target.value)}
            className="min-h-[40px] text-base sm:text-xs px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-slate-200 outline-none focus:border-amber-500 cursor-pointer"
            title="Filter by paying account"
          >
            <option value="all" className="bg-slate-900">💳 Account: All</option>
            {settlementData.accounts.map((acc) => (
              <option key={acc.accountId} value={acc.accountName} className="bg-slate-900">
                {acc.accountName}
              </option>
            ))}
            {settlementData.unassignedExpenseTotal > 0 && (
              <option value="unassigned" className="bg-slate-900 text-red-400">⚠️ Unassigned</option>
            )}
          </select>

          {/* Status Dropdown */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="min-h-[40px] text-base sm:text-xs px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-slate-200 outline-none focus:border-amber-500 cursor-pointer"
            title="Filter by expense status"
          >
            <option value="all" className="bg-slate-900">⚡ Status: All</option>
            <option value="planned" className="bg-slate-900">📝 Planned</option>
            <option value="partially_paid" className="bg-slate-900">🟡 Partial</option>
            <option value="paid" className="bg-slate-900">✅ Paid</option>
            <option value="settled" className="bg-slate-900">🎉 Settled</option>
            <option value="cancelled" className="bg-slate-900">❌ Cancelled</option>
          </select>
        </div>
      </div>

      {/* Main Expense Ledger List */}
      {filteredExpenses.length === 0 ? (
        <div className="p-8 sm:p-12 text-center rounded-2xl bg-slate-900/60 border border-dashed border-slate-800">
          <span className="text-4xl block mb-3">
            {activeLedgerTab === 'transfers' ? '🔄' : '📊'}
          </span>
          <h3 className="text-base sm:text-lg font-bold text-white mb-1">
            {activeLedgerTab === 'transfers'
              ? internalTransfers.length === 0
                ? 'No Internal Transfers Recorded Yet'
                : 'No Matching Transfers Found'
              : stats.totalItems === 0
              ? 'No Expense Items Recorded Yet'
              : 'No Matching Expenses Found'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mb-4">
            {activeLedgerTab === 'transfers'
              ? 'Transfers between coordinators appear here without distorting event expenses.'
              : stats.totalItems === 0
              ? 'Start by entering expected budget items like Caterers, Tent, DJ, Lights, and ID cards.'
              : 'Try adjusting your search query or filters.'}
          </p>
          {activeLedgerTab === 'transfers' && internalTransfers.length === 0 ? (
            <button
              type="button"
              onClick={() => {
                setSelectedTransfer(null);
                setPresetFromAccount(undefined);
                setIsTransferModalOpen(true);
              }}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-sm shadow-lg shadow-indigo-950/40 inline-flex items-center gap-2"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>Record First Transfer</span>
            </button>
          ) : stats.totalItems === 0 ? (
            <button
              type="button"
              onClick={onAddExpense}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-sm shadow-lg shadow-emerald-950/40 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Expense Item</span>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredExpenses.map((expense) => {
            const expAmt = Number(expense.expected_amount || 0);
            const actAmt = Number(expense.actual_amount || 0);
            const diff = expAmt - actAmt;
            const hasActual = actAmt > 0;
            const badge = getStatusBadge(expense.status);
            const categoryIcon = getExpenseCategoryIcon(expense.category);
            const receiptUrls = getAllExpenseScreenshotUrls(expense.payment_screenshot_path);
            const budgetSharePct =
              stats.totalExpected > 0 ? Math.round((expAmt / stats.totalExpected) * 100) : 0;
            const payerSummary = formatExpensePayerSummary(expense);

            return (
              <div
                key={expense.id}
                onClick={() => {
                  if (expense.category === 'Internal Transfer') {
                    setSelectedTransfer(expense);
                    setIsTransferModalOpen(true);
                  } else {
                    onEditExpense(expense);
                  }
                }}
                className="p-3.5 sm:p-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/40 transition-all cursor-pointer flex flex-col gap-2.5 shadow-sm"
              >
                {/* ── TIER 1: Item Name, Category, Budget % & Status/Actions ── */}
                <div className="flex items-center justify-between gap-2.5 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="text-xl shrink-0 leading-none">{categoryIcon}</span>
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <h4 className="text-sm sm:text-base font-bold text-white tracking-tight">
                        {expense.item_name}
                      </h4>
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-medium whitespace-nowrap">
                        {expense.category}
                      </span>
                      {budgetSharePct > 0 && (
                        <span className="text-indigo-400 text-xs font-semibold">
                          ({budgetSharePct}% of budget)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions & Status Badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${badge.bg}`}>
                      {badge.label}
                    </span>
                    <Edit2 className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300" />
                  </div>
                </div>

                {/* ── TIER 2: Context Bar (Vendor & Payment Details / Transfer Details) ── */}
                <div className="p-2 sm:px-3 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
                  {expense.category === 'Internal Transfer' ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-indigo-300 font-semibold flex items-center gap-1">
                        <ArrowRightLeft className="w-3 h-3" /> Transfer:
                      </span>
                      <strong className="text-red-400">{expense.paid_from_account || 'Sender'}</strong>
                      <span className="text-slate-500">➔</span>
                      <strong className="text-emerald-400">{expense.vendor_name || 'Receiver'}</strong>
                    </div>
                  ) : (
                    /* Vendor Info */
                    <div className="flex items-center gap-2 flex-wrap text-slate-300">
                      {expense.vendor_name || expense.vendor_phone ? (
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-400">Vendor:</span>
                          <strong className="text-white">{expense.vendor_name || 'Vendor'}</strong>
                          {expense.vendor_phone && (() => {
                            const clean = expense.vendor_phone.replace(/\D/g, '').slice(-10);
                            const display = expense.vendor_phone.startsWith('+91')
                              ? expense.vendor_phone
                              : clean.length === 10
                              ? `+91 ${clean}`
                              : expense.vendor_phone;
                            const tel = clean.length === 10 ? `+91${clean}` : expense.vendor_phone;
                            return (
                              <a
                                href={`tel:${tel}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 font-semibold ml-1"
                                title={`Call ${display}`}
                              >
                                <Phone className="w-3 h-3" />
                                <span>{display}</span>
                              </a>
                            );
                          })()}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">No vendor specified</span>
                      )}
                    </div>
                  )}

                  {expense.payment_mode && (
                    <div className="text-slate-400 text-[11px]">
                      Mode: <span className="text-slate-200 font-semibold">{expense.payment_mode}</span>
                    </div>
                  )}
                </div>

                {/* ── TIER 3: Financials & Budget Variance ── */}
                <div className="flex items-center gap-2.5 flex-wrap text-xs sm:text-sm">
                  {expense.category === 'Internal Transfer' ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-400 text-xs">Transferred:</span>
                      <strong className="text-indigo-300 font-mono font-bold text-base">
                        ₹{formatINR(actAmt)}
                      </strong>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[11px] font-semibold">
                        Internal Coordinator Transfer
                      </span>
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className="text-slate-400 text-xs">Expected: </span>
                        <strong className="text-sky-300 font-mono font-bold">₹{formatINR(expAmt)}</strong>
                      </div>

                      <span className="text-slate-700">|</span>

                      <div>
                        <span className="text-slate-400 text-xs">Actual Paid: </span>
                        <strong className={`font-mono font-bold ${hasActual ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {hasActual ? `₹${formatINR(actAmt)}` : '₹0'}
                        </strong>
                      </div>

                      {hasActual && (
                        <div>
                          {diff >= 0 ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold whitespace-nowrap">
                              +₹{formatINR(diff)} Saved
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/30 text-[11px] font-bold whitespace-nowrap">
                              -₹{formatINR(Math.abs(diff))} Over Budget
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* ── TIER 3.5: Disbursed Line ── */}
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span className="text-slate-400 font-medium">Disbursed:</span>
                  {payerSummary.isSplit && payerSummary.splits.length > 0 ? (
                    payerSummary.splits.map((sp, sIdx) => {
                      return (
                        <span
                          key={sIdx}
                          className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[11px] inline-flex items-center gap-1"
                        >
                          <span>{sp.account.split('(')[0].replace(/💵|👤/g, '').trim()}:</span>
                          <strong className="text-emerald-400 font-mono font-bold">₹{formatINR(sp.amount)}</strong>
                        </span>
                      );
                    })
                  ) : expense.paid_from_account ? (
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[11px] inline-flex items-center gap-1">
                      <span>{expense.paid_from_account.split('(')[0].replace(/💵|👤/g, '').trim()}:</span>
                      <strong className="text-emerald-400 font-mono font-bold">
                        ₹{formatINR(actAmt > 0 ? actAmt : expAmt)}
                      </strong>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-red-500/15 border border-red-500/30 text-red-300 text-[11px] font-semibold whitespace-nowrap">
                      ⚠️ Unassigned
                    </span>
                  )}
                </div>

                {/* ── TIER 4: Bills & Notes ── */}
                {(receiptUrls.length > 0 || expense.notes) && (
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
                    {/* Attached Bills */}
                    {receiptUrls.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-slate-400 text-[11px]">Bills:</span>
                        {receiptUrls.map((url, rIdx) => (
                          <a
                            key={rIdx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-400 hover:bg-sky-500/25 text-[11px] font-semibold transition-colors"
                            title={`Open original bill #${rIdx + 1}`}
                          >
                            <FileText className="w-3 h-3" />
                            <span>Bill {receiptUrls.length > 1 ? `#${rIdx + 1}` : ''}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    {expense.notes && (
                      <div className="text-slate-400 italic text-[11px] max-w-full break-words">
                        "{expense.notes}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bill/Receipt Lightbox Modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImageUrl}
              alt="Receipt Bill"
              className="max-w-full max-h-[75vh] rounded-xl object-contain shadow-2xl border border-slate-800"
            />
            <div className="flex gap-3 mt-4 flex-wrap justify-center">
              <a
                href={previewImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-4 py-2 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-300 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-sky-500/30 transition-colors"
              >
                <span>Open Original in New Tab</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => setPreviewImageUrl(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inter-Account Transfer Modal */}
      <AccountTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => {
          setIsTransferModalOpen(false);
          setSelectedTransfer(null);
          setPresetFromAccount(undefined);
        }}
        onSave={async (payload, receiptFile) => {
          if (onSaveExpense) {
            return await onSaveExpense(payload, receiptFile);
          }
          return false;
        }}
        onDelete={async (id) => {
          if (onDeleteExpense) {
            return await onDeleteExpense(id);
          }
          return false;
        }}
        initialData={selectedTransfer}
        presetFromAccount={presetFromAccount}
        accounts={settlementData.accounts}
        eventId={eventId}
      />
    </div>
  );
};
