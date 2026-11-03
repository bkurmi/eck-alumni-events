import React, { useState, useMemo } from 'react';
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

  // Aggregated Financial Metrics & Feasibility (excludes internal transfers so real budget is not distorted)
  const stats = useMemo(() => {
    const realExpenses = expenses.filter((e) => e.category !== 'Internal Transfer');
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
        return { label: 'Settled', bg: '#064e3b', color: '#6ee7b7', border: '#059669' };
      case 'paid':
        return { label: 'Paid', bg: '#065f46', color: '#a7f3d0', border: '#10b981' };
      case 'partially_paid':
        return { label: 'Partial', bg: '#78350f', color: '#fde68a', border: '#d97706' };
      case 'cancelled':
        return { label: 'Cancelled', bg: '#450a0a', color: '#fca5a5', border: '#dc2626' };
      default:
        return { label: 'Planned', bg: '#1e293b', color: '#cbd5e1', border: '#475569' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 3 Stats Cards — responsive 1 col mobile, 3 cols desktop */}
      <div className="stats-grid budget-stats-grid">
        {/* Card 1: Total Available Funds */}
        <div className="stat-card">
          <span className="stat-label">Total Available Funds</span>
          <span className="stat-value font-accent">₹{formatINR(stats.totalAvailableFunds)}</span>
          <div className="stat-hint" style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
            <span>
              ₹{formatINR(registrationAmount)} Regs{registrationCount > 0 ? ` (${registrationCount} attending)` : ''} • ₹{formatINR(sponsorshipAmount)} Sponsors{sponsorshipCount > 0 ? ` (${sponsorshipCount})` : ''}
            </span>
            {totalHeadcount > 0 && (
              <span style={{ color: '#38bdf8', fontWeight: 600, fontSize: '0.73rem' }}>
                👥 {totalHeadcount} Total Headcount {totalHeadcount > registrationCount ? `(${registrationCount} alumni + ${totalHeadcount - registrationCount} guests)` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Expected Budget (Plan) with Projected Surplus/Deficit */}
        <div
          className="stat-card"
          style={stats.isDeficit ? { borderColor: 'rgba(239, 68, 68, 0.45)' } : undefined}
        >
          <span className="stat-label">Expected Budget (Plan)</span>
          <span className="stat-value">₹{formatINR(stats.totalExpected)}</span>
          <div className="stat-hint" style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '3px', alignItems: 'center' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '0.74rem',
                fontWeight: 700,
                backgroundColor: stats.isDeficit ? 'rgba(239, 68, 68, 0.16)' : 'rgba(16, 185, 129, 0.16)',
                color: stats.isDeficit ? '#f87171' : '#34d399',
                border: stats.isDeficit ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(16, 185, 129, 0.35)',
              }}
            >
              {stats.isDeficit
                ? `Projected Deficit: -₹${formatINR(Math.abs(stats.fundingGap))}`
                : `Projected Surplus: +₹${formatINR(stats.fundingGap)}`}
            </span>
            <span>
              {stats.totalItems} planned line items
              {totalHeadcount > 0 && stats.totalExpected > 0 ? ` • ₹${formatINR(Math.round(stats.totalExpected / totalHeadcount))}/head` : ''}
            </span>
          </div>
        </div>

        {/* Card 3: Real Paid Expenses with Real Surplus/Deficit */}
        <div
          className="stat-card"
          style={stats.liveCashBalance < 0 ? { borderColor: 'rgba(239, 68, 68, 0.45)' } : undefined}
        >
          <span className="stat-label">Real Paid Expenses</span>
          <span className="stat-value font-success">₹{formatINR(stats.totalActual)}</span>
          <div className="stat-hint" style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '3px', alignItems: 'center' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '0.74rem',
                fontWeight: 700,
                backgroundColor: stats.liveCashBalance >= 0 ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                color: stats.liveCashBalance >= 0 ? '#34d399' : '#f87171',
                border: stats.liveCashBalance >= 0 ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
              }}
            >
              {stats.liveCashBalance >= 0
                ? `Actual Surplus: +₹${formatINR(stats.liveCashBalance)}`
                : `Actual Deficit: -₹${formatINR(Math.abs(stats.liveCashBalance))}`}
            </span>
            <span>
              {stats.settledCount} settled{stats.actualVariance !== 0 ? ` • ₹${formatINR(Math.abs(stats.actualVariance))} ${stats.isUnderBudget ? 'saved vs budget' : 'over budget'}` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Minimalist Funding Feasibility Track (Mobile Optimized) */}
      {stats.totalExpected > 0 && (
        <div
          style={{
            backgroundColor: 'rgba(30, 41, 59, 0.6)',
            borderRadius: '12px',
            padding: '10px 14px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {/* Top Row: Status Pill & Target Budget */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span
              style={{
                backgroundColor: stats.isDeficit ? 'rgba(239, 68, 68, 0.18)' : 'rgba(16, 185, 129, 0.18)',
                border: stats.isDeficit ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                color: stats.isDeficit ? '#fca5a5' : '#86efac',
                fontSize: '0.76rem',
                fontWeight: 700,
                padding: '2px 10px',
                borderRadius: '999px',
                letterSpacing: '0.2px',
                whiteSpace: 'nowrap',
              }}
            >
              {stats.fundedPct}% Funded
            </span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
              Target: <strong style={{ color: '#cbd5e1' }}>₹{formatINR(stats.totalExpected)}</strong>
            </span>
          </div>

          {/* Dual Segment Progress Bar */}
          <div
            style={{
              height: '8px',
              width: '100%',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '999px',
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            <div
              style={{
                width: `${Math.min(stats.fundedPct, 100)}%`,
                backgroundColor: '#10b981',
                transition: 'width 0.4s ease',
              }}
              title={`Collected Funds: ₹${formatINR(stats.totalAvailableFunds)}`}
            />
            {stats.isDeficit && (
              <div
                style={{
                  width: `${Math.max(100 - stats.fundedPct, 0)}%`,
                  backgroundColor: '#ef4444',
                  transition: 'width 0.4s ease',
                }}
                title={`Deficit to Raise: ₹${formatINR(Math.abs(stats.fundingGap))}`}
              />
            )}
          </div>

          {/* Bottom Labels (Single Line on Mobile) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.76rem',
              fontWeight: 600,
              gap: '8px',
            }}
          >
            <span style={{ color: '#86efac', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: '9px' }}>●</span> Collected: ₹{formatINR(stats.totalAvailableFunds)}
            </span>
            <span
              style={{
                color: stats.isDeficit ? '#fca5a5' : '#34d399',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: '9px' }}>●</span>{' '}
              {stats.isDeficit
                ? `Deficit: ₹${formatINR(Math.abs(stats.fundingGap))}`
                : `Surplus: +₹${formatINR(stats.fundingGap)}`}
            </span>
          </div>
        </div>
      )}

      {/* ── ACCOUNT SETTLEMENT & CASH IN HAND CARD ── */}
      <div
        style={{
          backgroundColor: '#1e293b',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Settlement Header */}
        <div
          onClick={() => setIsSettlementOpen((prev) => !prev)}
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            cursor: 'pointer',
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            userSelect: 'none',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>💳</span>
            <div>
              <h4
                style={{
                  margin: 0,
                  fontSize: '0.94rem',
                  fontWeight: 700,
                  color: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>Account Settlement &amp; Net Balance</span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '1px 7px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(99, 102, 241, 0.18)',
                    color: '#a5b4fc',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                  }}
                >
                  Adjusted per Person
                </span>
              </h4>
              <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#94a3b8' }}>
                Total collections vs expenses disbursed from each account
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTransfer(null);
                setPresetFromAccount(undefined);
                setIsTransferModalOpen(true);
              }}
              style={{
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 12px',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                minHeight: '44px',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: '15px' }}>⇄</span>
              <span>Transfer Funds</span>
            </button>

            {selectedAccountFilter !== 'all' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedAccountFilter('all');
                }}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: '#cbd5e1',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  minHeight: '44px',
                }}
              >
                Clear Filter ✕
              </button>
            )}
            <span style={{ color: '#94a3b8', fontSize: '0.82rem', fontWeight: 600 }}>
              {isSettlementOpen ? '▲ Hide' : '▼ View Breakdown'}
            </span>
          </div>
        </div>

        {/* Settlement Content */}
        {isSettlementOpen && (
          <div
            style={{
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            {/* Account Cards Grid */}
            <div className="settlement-accounts-grid">
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
                    style={{
                      backgroundColor: isSelected ? '#1e293b' : '#0c1322',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      border: isSelected
                        ? '1.5px solid #6366f1'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 12px rgba(99, 102, 241, 0.25)' : 'none',
                      minWidth: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = '#111c30';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = '#0c1322';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                      }
                    }}
                  >
                    {/* Header: Name, Bank & Status Pill */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '1.05rem',
                            color: '#f8fafc',
                            letterSpacing: '-0.2px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {acc.accountName}
                        </span>
                        {acc.bankName && acc.bankName !== 'Other' && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              color: '#94a3b8',
                              letterSpacing: '0.3px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {acc.bankName}
                          </span>
                        )}
                      </div>

                      {/* Status Pill: Grey for SETTLED, Green for SURPLUS, Red for DUE */}
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: '9999px',
                          backgroundColor: isPositive
                            ? 'rgba(16, 185, 129, 0.1)'
                            : isNegative
                            ? 'rgba(239, 68, 68, 0.1)'
                            : 'rgba(148, 163, 184, 0.12)',
                          color: isPositive ? '#34d399' : isNegative ? '#f87171' : '#94a3b8',
                          border: isPositive
                            ? '1px solid rgba(16, 185, 129, 0.5)'
                            : isNegative
                            ? '1px solid rgba(239, 68, 68, 0.5)'
                            : '1px solid rgba(148, 163, 184, 0.35)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          whiteSpace: 'nowrap',
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '13px',
                            height: '13px',
                            borderRadius: '50%',
                            border: `1.5px solid ${isNegative ? '#f87171' : isPositive ? '#34d399' : '#94a3b8'}`,
                            fontSize: '9px',
                            fontWeight: 800,
                            lineHeight: 1,
                            color: isNegative ? '#f87171' : isPositive ? '#34d399' : '#94a3b8',
                          }}
                        >
                          {isNegative ? '!' : '✓'}
                        </span>
                        {isPositive ? 'SURPLUS' : isNegative ? 'DUE' : 'SETTLED'}
                      </span>
                    </div>

                    {/* Inflow vs Spent Row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.86rem',
                        gap: '8px',
                      }}
                    >
                      {/* Inflow */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '15px',
                            height: '15px',
                            borderRadius: '50%',
                            border: '1.5px solid #34d399',
                            color: '#34d399',
                            fontSize: '11px',
                            fontWeight: 700,
                            lineHeight: 1,
                          }}
                        >
                          +
                        </span>
                        <span style={{ color: '#cbd5e1' }}>Inflow:</span>
                        <strong style={{ color: '#34d399', fontWeight: 700, fontSize: '0.92rem' }}>
                          ₹{formatINR(acc.inflow)}
                        </strong>
                      </div>

                      {/* Spent */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '15px',
                            height: '15px',
                            borderRadius: '50%',
                            border: '1.5px solid #f87171',
                            color: '#f87171',
                            fontSize: '11px',
                            fontWeight: 700,
                            lineHeight: 1,
                          }}
                        >
                          −
                        </span>
                        <span style={{ color: '#cbd5e1' }}>Spent:</span>
                        <strong style={{ color: '#f87171', fontWeight: 700, fontSize: '0.92rem' }}>
                          ₹{formatINR(acc.outflow)}
                        </strong>
                      </div>
                    </div>

                    {/* Internal Transfers breakdown (if any) */}
                    {((acc.transferredIn || 0) > 0 || (acc.transferredOut || 0) > 0) && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.78rem',
                          backgroundColor: 'rgba(99, 102, 241, 0.08)',
                          border: '1px solid rgba(99, 102, 241, 0.22)',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          color: '#c7d2fe',
                        }}
                        title={`Transfers for ${acc.accountName}: +₹${formatINR(acc.transferredIn || 0)} received, -₹${formatINR(acc.transferredOut || 0)} sent`}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                          <span>⇄ Transfers:</span>
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                          {(acc.transferredIn || 0) > 0 && (
                            <span style={{ color: '#34d399' }}>
                              +₹{formatINR(acc.transferredIn || 0)}
                            </span>
                          )}
                          {(acc.transferredOut || 0) > 0 && (
                            <span style={{ color: '#f87171' }}>
                              -₹{formatINR(acc.transferredOut || 0)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Dashed Separator */}
                    <div style={{ borderTop: '1px dashed rgba(255, 255, 255, 0.1)', margin: '1px 0' }} />

                    {/* Dedicated Balance Pill Box */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#0a0f1d',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        padding: '9px 14px',
                      }}
                    >
                      <span style={{ color: '#94a3b8', fontSize: '0.92rem', fontWeight: 500 }}>
                        Balance
                      </span>
                      <strong
                        style={{
                          color: isPositive ? '#34d399' : isNegative ? '#f87171' : '#cbd5e1',
                          fontSize: '1.12rem',
                          fontWeight: 700,
                          letterSpacing: '0.2px',
                        }}
                      >
                        {isPositive
                          ? `+₹${formatINR(acc.netBalance)}`
                          : isNegative
                          ? `-₹${formatINR(Math.abs(acc.netBalance))}`
                          : '₹0'}
                      </strong>
                    </div>

                    {/* Footer: Expenses Count, Transfer Action & Filter Link */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.8rem',
                        color: '#94a3b8',
                        paddingTop: '2px',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>☑</span>
                        <span>
                          {acc.expenseCount} {acc.expenseCount === 1 ? 'expense' : 'expenses'} paid
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTransfer(null);
                            setPresetFromAccount(acc.accountName);
                            setIsTransferModalOpen(true);
                          }}
                          style={{
                            background: 'rgba(99, 102, 241, 0.15)',
                            border: '1px solid rgba(99, 102, 241, 0.35)',
                            borderRadius: '6px',
                            color: '#a5b4fc',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            padding: '4px 8px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            minHeight: '34px',
                          }}
                          title={`Transfer funds out from ${acc.accountName}`}
                        >
                          <span>⇄</span>
                          <span>Transfer</span>
                        </button>

                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: isSelected ? '#a5b4fc' : '#cbd5e1',
                            fontWeight: 600,
                            textDecoration: 'underline',
                            textUnderlineOffset: '2px',
                          }}
                        >
                          <span style={{ fontSize: '12px', textDecoration: 'none' }}>☰</span>
                          <span>{isSelected ? '✓ Filtered' : 'Filter by this'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── INTER-ACCOUNT TRANSFERS HISTORY SECTION ── */}
            {internalTransfers.length > 0 && (
              <div
                style={{
                  marginTop: '10px',
                  backgroundColor: '#0c1322',
                  borderRadius: '10px',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => setIsTransfersHistoryOpen((prev) => !prev)}
                  style={{
                    padding: '10px 14px',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '16px' }}>🔄</span>
                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#e0e7ff' }}>
                      Inter-Account Transfer History ({internalTransfers.length})
                    </span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        backgroundColor: 'rgba(99, 102, 241, 0.25)',
                        color: '#c7d2fe',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: 700,
                      }}
                    >
                      Total Transferred: ₹
                      {formatINR(
                        internalTransfers.reduce(
                          (sum, t) => sum + Number(t.actual_amount || 0),
                          0
                        )
                      )}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#a5b4fc', fontWeight: 600 }}>
                    {isTransfersHistoryOpen ? '▲ Hide' : '▼ View History'}
                  </span>
                </div>

                {isTransfersHistoryOpen && (
                  <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '9px 12px',
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            fontSize: '0.84rem',
                            cursor: 'pointer',
                            gap: '8px',
                            flexWrap: 'wrap',
                            transition: 'background-color 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.12)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                                color: '#a5b4fc',
                                fontSize: '14px',
                                fontWeight: 700,
                              }}
                            >
                              ⇄
                            </span>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <strong style={{ color: '#f87171' }}>{from}</strong>
                                <span style={{ color: '#94a3b8' }}>➔</span>
                                <strong style={{ color: '#34d399' }}>{to}</strong>
                                {tx.payment_mode && (
                                  <span
                                    style={{
                                      fontSize: '0.7rem',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                      color: '#94a3b8',
                                    }}
                                  >
                                    {tx.payment_mode}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '2px' }}>
                                {tx.payment_date || 'No date'}
                                {tx.notes ? ` • ${tx.notes}` : ''}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <strong style={{ color: '#a5b4fc', fontSize: '0.96rem', fontWeight: 700 }}>
                              ₹{formatINR(amt)}
                            </strong>
                            {receiptUrls.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewImageUrl(receiptUrls[0]);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '15px',
                                  padding: '4px',
                                }}
                                title="View transfer receipt"
                              >
                                📎
                              </button>
                            )}
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: '#818cf8',
                                textDecoration: 'underline',
                                fontWeight: 600,
                              }}
                            >
                              Edit ✏️
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          paddingTop: '2px',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '1.05rem',
              fontWeight: 800,
              color: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>
              {activeLedgerTab === 'transfers'
                ? 'Internal Transfers'
                : activeLedgerTab === 'all'
                ? 'All Ledger Transactions'
                : 'Itemized Expense Ledger'}
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                background:
                  activeLedgerTab === 'transfers'
                    ? 'rgba(99, 102, 241, 0.2)'
                    : 'rgba(16, 185, 129, 0.15)',
                color: activeLedgerTab === 'transfers' ? '#c7d2fe' : '#6ee7b7',
                border:
                  activeLedgerTab === 'transfers'
                    ? '1px solid rgba(99, 102, 241, 0.35)'
                    : '1px solid rgba(16, 185, 129, 0.35)',
              }}
            >
              {filteredExpenses.length} {activeLedgerTab === 'transfers' ? 'Transfers' : 'Items'}
            </span>
          </h3>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
            {activeLedgerTab === 'transfers'
              ? 'Coordinator-to-coordinator internal fund movements'
              : 'Vendor quotes, planned budgets & real event payments'}
          </p>
        </div>

        {/* Action Buttons: Add Expense / New Transfer & Share Report */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {activeLedgerTab === 'transfers' ? (
            <button
              type="button"
              onClick={() => {
                setSelectedTransfer(null);
                setPresetFromAccount(undefined);
                setIsTransferModalOpen(true);
              }}
              style={{
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 15px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                minHeight: '44px',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)',
                whiteSpace: 'nowrap',
              }}
            >
              <span>⇄</span>
              <span>New Transfer</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onAddExpense}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 15px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                minHeight: '44px',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                whiteSpace: 'nowrap',
              }}
            >
              <span>➕</span>
              <span>Add Expense</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="btn btn-whatsapp-primary btn-sm"
            style={{
              backgroundColor: '#25D366',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '9px 14px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              minHeight: '44px',
              whiteSpace: 'nowrap',
            }}
            title="Share itemized Budget report to WhatsApp"
          >
            <span>💬</span>
            <span>Share Report</span>
          </button>
        </div>
      </div>

      {/* ── 2 TABS / SEGMENTED CONTROL: Expenses vs Internal Transfers ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: '#0c1322',
          padding: '4px',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          width: 'fit-content',
          maxWidth: '100%',
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveLedgerTab('expenses')}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeLedgerTab === 'expenses' ? '#1e293b' : 'transparent',
            color: activeLedgerTab === 'expenses' ? '#34d399' : '#94a3b8',
            fontWeight: activeLedgerTab === 'expenses' ? 700 : 500,
            fontSize: '0.84rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
            boxShadow: activeLedgerTab === 'expenses' ? '0 2px 6px rgba(0,0,0,0.3)' : 'none',
            minHeight: '40px',
          }}
        >
          <span>📋</span>
          <span>Itemized Expenses</span>
          <span
            style={{
              fontSize: '0.72rem',
              padding: '1px 7px',
              borderRadius: '999px',
              backgroundColor:
                activeLedgerTab === 'expenses'
                  ? 'rgba(52, 211, 153, 0.18)'
                  : 'rgba(255, 255, 255, 0.06)',
              color: activeLedgerTab === 'expenses' ? '#34d399' : '#64748b',
              fontWeight: 700,
            }}
          >
            {stats.totalItems}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveLedgerTab('transfers')}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeLedgerTab === 'transfers' ? '#1e293b' : 'transparent',
            color: activeLedgerTab === 'transfers' ? '#a5b4fc' : '#94a3b8',
            fontWeight: activeLedgerTab === 'transfers' ? 700 : 500,
            fontSize: '0.84rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
            boxShadow: activeLedgerTab === 'transfers' ? '0 2px 6px rgba(0,0,0,0.3)' : 'none',
            minHeight: '40px',
          }}
        >
          <span>🔄</span>
          <span>Internal Transfers</span>
          <span
            style={{
              fontSize: '0.72rem',
              padding: '1px 7px',
              borderRadius: '999px',
              backgroundColor:
                activeLedgerTab === 'transfers'
                  ? 'rgba(99, 102, 241, 0.25)'
                  : 'rgba(255, 255, 255, 0.06)',
              color: activeLedgerTab === 'transfers' ? '#a5b4fc' : '#64748b',
              fontWeight: 700,
            }}
          >
            {internalTransfers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveLedgerTab('all')}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeLedgerTab === 'all' ? '#1e293b' : 'transparent',
            color: activeLedgerTab === 'all' ? '#f8fafc' : '#64748b',
            fontWeight: activeLedgerTab === 'all' ? 700 : 500,
            fontSize: '0.84rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
            boxShadow: activeLedgerTab === 'all' ? '0 2px 6px rgba(0,0,0,0.3)' : 'none',
            minHeight: '40px',
          }}
        >
          <span>All</span>
          <span
            style={{
              fontSize: '0.72rem',
              padding: '1px 6px',
              borderRadius: '999px',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              color: '#94a3b8',
              fontWeight: 600,
            }}
          >
            {expenses.length}
          </span>
        </button>
      </div>

      {/* ── SEARCH & FILTER BAR (Mobile Responsive) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: '#1e293b',
          padding: '8px 10px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          width: '100%',
          boxSizing: 'border-box',
          flexWrap: 'wrap',
        }}
      >
        {/* Search Input Box */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '160px' }}>
          <span
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#64748b',
              fontSize: '14px',
              pointerEvents: 'none',
            }}
          >
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search expenses, vendor, payer..."
            style={{
              width: '100%',
              padding: '8px 28px 8px 30px',
              borderRadius: '8px',
              backgroundColor: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '16px',
              outline: 'none',
              minHeight: '40px',
              boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '13px',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Dropdowns container */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Account Filter Dropdown */}
          <select
            value={selectedAccountFilter}
            onChange={(e) => setSelectedAccountFilter(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              backgroundColor: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '14px',
              outline: 'none',
              minHeight: '40px',
              flexShrink: 0,
              maxWidth: '150px',
              minWidth: '115px',
              boxSizing: 'border-box',
              cursor: 'pointer',
            }}
            title="Filter by paying account"
          >
            <option value="all">💳 Account: All</option>
            {settlementData.accounts.map((acc) => (
              <option key={acc.accountId} value={acc.accountName}>
                {acc.accountName}
              </option>
            ))}
            {settlementData.unassignedExpenseTotal > 0 && (
              <option value="unassigned">⚠️ Unassigned</option>
            )}
          </select>

          {/* Status Dropdown */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              backgroundColor: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '14px',
              outline: 'none',
              minHeight: '40px',
              flexShrink: 0,
              maxWidth: '135px',
              minWidth: '105px',
              boxSizing: 'border-box',
              cursor: 'pointer',
            }}
            title="Filter by expense status"
          >
            <option value="all">⚡ Status: All</option>
            <option value="planned">📝 Planned</option>
            <option value="partially_paid">🟡 Partial</option>
            <option value="paid">✅ Paid</option>
            <option value="settled">🎉 Settled</option>
            <option value="cancelled">❌ Cancelled</option>
          </select>
        </div>
      </div>

      {/* Main Expense Ledger List */}
      {filteredExpenses.length === 0 ? (
        <div
          style={{
            backgroundColor: '#1e293b',
            borderRadius: '14px',
            padding: '40px 20px',
            textAlign: 'center',
            border: '1px dashed rgba(255, 255, 255, 0.15)',
          }}
        >
          <span style={{ fontSize: '42px', display: 'block', marginBottom: '12px' }}>
            {activeLedgerTab === 'transfers' ? '🔄' : '📊'}
          </span>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', color: '#f8fafc', fontWeight: 600 }}>
            {activeLedgerTab === 'transfers'
              ? internalTransfers.length === 0
                ? 'No Internal Transfers Recorded Yet'
                : 'No Matching Transfers Found'
              : stats.totalItems === 0
              ? 'No Expense Items Recorded Yet'
              : 'No Matching Expenses Found'}
          </h3>
          <p style={{ margin: '0 0 16px 0', color: '#94a3b8', fontSize: '0.88rem' }}>
            {activeLedgerTab === 'transfers'
              ? 'Transfers between coordinators appear here without distorting event expenses.'
              : stats.totalItems === 0
              ? 'Start by entering expected budget items like Caterers, Tent, DJ, Lights, and ID cards.'
              : 'Try adjusting your search query or category filters.'}
          </p>
          {activeLedgerTab === 'transfers' && internalTransfers.length === 0 ? (
            <button
              type="button"
              onClick={() => {
                setSelectedTransfer(null);
                setPresetFromAccount(undefined);
                setIsTransferModalOpen(true);
              }}
              style={{
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                minHeight: '44px',
              }}
            >
              ⇄ Record First Transfer
            </button>
          ) : stats.totalItems === 0 ? (
            <button
              type="button"
              onClick={onAddExpense}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                minHeight: '44px',
              }}
            >
              ➕ Add First Expense Item
            </button>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#243248';
                  e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#1e293b';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                }}
              >
                {/* ── TIER 1: Item Name, Category, Budget % & Status/Actions ── */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '20px', flexShrink: 0, lineHeight: 1 }}>{categoryIcon}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc' }}>
                        {expense.item_name}
                      </h4>
                      <span
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          color: '#cbd5e1',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {expense.category}
                      </span>
                      {budgetSharePct > 0 && (
                        <span style={{ color: '#818cf8', fontSize: '0.72rem', fontWeight: 600 }}>
                          ({budgetSharePct}% of budget)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions & Status Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span
                      style={{
                        backgroundColor: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '999px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                      }}
                    >
                      {badge.label}
                    </span>

                    <span style={{ color: '#64748b', fontSize: '14px', cursor: 'pointer' }} title="Edit Item">
                      ✏️
                    </span>
                  </div>
                </div>

                {/* ── TIER 2: Context Bar (Vendor & Payment Details / Transfer Details) ── */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    padding: '6px 10px',
                    backgroundColor: '#0f172a',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    fontSize: '0.78rem',
                  }}
                >
                  {expense.category === 'Internal Transfer' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#a5b4fc', fontWeight: 600 }}>⇄ Transfer:</span>
                      <strong style={{ color: '#f87171' }}>{expense.paid_from_account || 'Sender'}</strong>
                      <span style={{ color: '#94a3b8' }}>➔</span>
                      <strong style={{ color: '#34d399' }}>{expense.vendor_name || 'Receiver'}</strong>
                    </div>
                  ) : (
                    /* Left: Vendor */
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', color: '#cbd5e1' }}>
                      {(expense.vendor_name || expense.vendor_phone) ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          <span style={{ color: '#94a3b8' }}>👤 Vendor:</span>
                          <strong style={{ color: '#f1f5f9' }}>{expense.vendor_name || 'Vendor'}</strong>
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
                                style={{
                                  marginLeft: '4px',
                                  color: '#38bdf8',
                                  textDecoration: 'none',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                }}
                                title={`Call ${display}`}
                              >
                                📞 {display}
                              </a>
                            );
                          })()}
                        </span>
                      ) : (
                        <span style={{ color: '#64748b', fontStyle: 'italic' }}>No vendor specified</span>
                      )}
                    </div>
                  )}

                  {expense.payment_mode && (
                    <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                      Mode: <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{expense.payment_mode}</span>
                    </div>
                  )}
                </div>

                {/* ── TIER 3: Financials & Budget Variance ── */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                    fontSize: '0.82rem',
                  }}
                >
                  {expense.category === 'Internal Transfer' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#94a3b8', fontSize: '0.74rem' }}>Transferred Amount: </span>
                      <strong style={{ color: '#a5b4fc', fontSize: '1rem', fontWeight: 800 }}>
                        ₹{formatINR(actAmt)}
                      </strong>
                      <span
                        style={{
                          backgroundColor: 'rgba(99, 102, 241, 0.15)',
                          color: '#c7d2fe',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                        }}
                      >
                        Internal Coordinator Transfer
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* Expected, Actual & Variance */}
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.74rem' }}>Expected: </span>
                        <strong style={{ color: '#93c5fd' }}>₹{formatINR(expAmt)}</strong>
                      </div>

                      <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>│</span>

                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.74rem' }}>Actual Paid: </span>
                        <strong style={{ color: hasActual ? '#86efac' : '#64748b' }}>
                          {hasActual ? `₹${formatINR(actAmt)}` : '₹0'}
                        </strong>
                      </div>

                      {hasActual && (
                        <div>
                          {diff >= 0 ? (
                            <span
                              style={{
                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                color: '#34d399',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '0.73rem',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              +₹{formatINR(diff)} Saved (Under Budget)
                            </span>
                          ) : (
                            <span
                              style={{
                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                color: '#f87171',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '0.73rem',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              -₹{formatINR(Math.abs(diff))} Over Budget
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* ── TIER 3.5: Disbursed Line (Consistent on EVERY card - Single or Split!) ── */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexWrap: 'wrap',
                    fontSize: '0.76rem',
                  }}
                >
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}>Disbursed:</span>
                  {payerSummary.isSplit && payerSummary.splits.length > 0 ? (
                    payerSummary.splits.map((sp, sIdx) => {
                      return (
                        <span
                          key={sIdx}
                          style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            color: '#cbd5e1',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span>{sp.account.split('(')[0].replace(/💵|👤/g, '').trim()}:</span>
                          <strong style={{ color: '#86efac' }}>₹{formatINR(sp.amount)}</strong>
                        </span>
                      );
                    })
                  ) : expense.paid_from_account ? (
                    <span
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        color: '#cbd5e1',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>{expense.paid_from_account.split('(')[0].replace(/💵|👤/g, '').trim()}:</span>
                      <strong style={{ color: '#86efac' }}>
                        ₹{formatINR(actAmt > 0 ? actAmt : expAmt)}
                      </strong>
                    </span>
                  ) : (
                    <span
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        color: '#fca5a5',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ⚠️ Unassigned
                    </span>
                  )}
                </div>

                {/* ── TIER 4: Bills & Notes (Only if present) ── */}
                {(receiptUrls.length > 0 || expense.notes) && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      paddingTop: '6px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                      fontSize: '0.76rem',
                    }}
                  >
                    {/* Direct Clickable Receipt Links */}
                    {receiptUrls.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Attached Bills:</span>
                        {receiptUrls.map((url, rIdx) => (
                          <a
                            key={rIdx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              backgroundColor: 'rgba(56, 189, 248, 0.12)',
                              border: '1px solid rgba(56, 189, 248, 0.35)',
                              color: '#38bdf8',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              textDecoration: 'none',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s',
                              whiteSpace: 'nowrap',
                            }}
                            title={`Open original bill #${rIdx + 1} in new tab`}
                          >
                            📄 Bill {receiptUrls.length > 1 ? `#${rIdx + 1}` : ''} ↗
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    {expense.notes && (
                      <div
                        style={{
                          color: '#94a3b8',
                          fontStyle: 'italic',
                          maxWidth: '100%',
                          wordBreak: 'break-word',
                        }}
                      >
                        💬 "{expense.notes}"
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
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.88)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '92vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImageUrl}
              alt="Receipt Bill"
              style={{
                maxWidth: '100%',
                maxHeight: '78vh',
                borderRadius: '8px',
                objectFit: 'contain',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            />
            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginTop: '14px',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              <a
                href={previewImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  backgroundColor: 'rgba(56, 189, 248, 0.2)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  color: '#38bdf8',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  cursor: 'pointer',
                  minHeight: '40px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                🔗 Open Original in New Tab ↗
              </a>
              <button
                type="button"
                onClick={() => setPreviewImageUrl(null)}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                  border: 'none',
                  color: '#ffffff',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: '40px',
                }}
              >
                ✕ Close Preview
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
