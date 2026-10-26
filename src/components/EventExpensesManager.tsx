import React, { useState, useMemo } from 'react';
import type { EventExpense } from '../types';
import {
  formatINR,
  getExpenseCategoryIcon,
  getPublicExpenseScreenshotUrl,
  buildExpensesWhatsAppMessage,
} from '../lib/expenses';

interface EventExpensesManagerProps {
  expenses: EventExpense[];
  registrationAmount: number;
  sponsorshipAmount: number;
  registrationCount?: number;
  totalHeadcount?: number;
  sponsorshipCount?: number;
  eventName?: string;
  onAddExpense: () => void;
  onEditExpense: (expense: EventExpense) => void;
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
  onAddExpense,
  onEditExpense,
  onRefresh: _onRefresh,
  loading: _loading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Aggregated Financial Metrics & Feasibility
  const stats = useMemo(() => {
    const totalItems = expenses.length;
    const totalExpected = expenses.reduce((sum, e) => sum + Number(e.expected_amount || 0), 0);
    const totalActual = expenses.reduce((sum, e) => sum + Number(e.actual_amount || 0), 0);

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

    const settledCount = expenses.filter(
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

  // Filtered expenses based on search and status
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (e.item_name || '').toLowerCase().includes(q) ||
        (e.vendor_name || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q);

      const matchesStatus =
        selectedStatus === 'all' ? true : e.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }, [expenses, searchQuery, selectedStatus]);

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
      totalHeadcount
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
      {/* 4 Stats Cards — Styled exactly like the Registration tab (.stats-grid & .stat-card) */}
      <div className="stats-grid">
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

        {/* Card 2: Expected Budget */}
        <div className="stat-card">
          <span className="stat-label">Expected Budget (Plan)</span>
          <span className="stat-value">₹{formatINR(stats.totalExpected)}</span>
          <span className="stat-hint">
            {stats.totalItems} planned line items
            {totalHeadcount > 0 && stats.totalExpected > 0 ? ` • ₹${formatINR(Math.round(stats.totalExpected / totalHeadcount))}/head` : ''}
          </span>
        </div>

        {/* Card 3: Real Paid Expenses */}
        <div className="stat-card">
          <span className="stat-label">Real Paid Expenses</span>
          <span className="stat-value font-success">₹{formatINR(stats.totalActual)}</span>
          <span className="stat-hint">
            Live Cash: ₹{formatINR(stats.liveCashBalance)} • {stats.settledCount} settled
          </span>
        </div>

        {/* Card 4: Budget Deficit / Surplus */}
        <div
          className="stat-card"
          style={stats.isDeficit ? { borderColor: 'rgba(239, 68, 68, 0.45)' } : { borderColor: 'rgba(16, 185, 129, 0.45)' }}
        >
          <span
            className="stat-label"
            style={{ color: stats.isDeficit ? '#f87171' : '#34d399' }}
          >
            {stats.isDeficit ? 'Budget Deficit (Shortfall)' : 'Projected Surplus'}
          </span>
          <span
            className={`stat-value ${stats.isDeficit ? 'text-error' : 'font-success'}`}
            style={{ color: stats.isDeficit ? '#ef4444' : '#10b981' }}
          >
            {stats.isDeficit ? '-' : '+'}₹{formatINR(Math.abs(stats.fundingGap))}
          </span>
          <span
            className="stat-hint"
            style={{ color: stats.isDeficit ? '#fca5a5' : '#86efac', fontWeight: 600 }}
          >
            {stats.isDeficit
              ? `${stats.fundedPct}% funded • Need ₹${formatINR(Math.abs(stats.fundingGap))} more`
              : '100% funded by collections'}
          </span>
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
            <span>Itemized Expense Ledger</span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#a5b4fc',
                border: '1px solid rgba(99, 102, 241, 0.3)',
              }}
            >
              {expenses.length} Items
            </span>
          </h3>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
            Vendor quotes, planned budgets &amp; real payments
          </p>
        </div>

        {/* Action Buttons: Add Expense & Share Report */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
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
              minHeight: '40px',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
              whiteSpace: 'nowrap',
            }}
          >
            <span>➕</span>
            <span>Add Expense</span>
          </button>

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
              minHeight: '40px',
              whiteSpace: 'nowrap',
            }}
            title="Share itemized Budget report to WhatsApp"
          >
            <span>💬</span>
            <span>Share Report</span>
          </button>
        </div>
      </div>

      {/* ── SEARCH & STATUS BAR (Single Line, Even on Mobile) ── */}
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
          flexWrap: 'nowrap',
        }}
      >
        {/* Search Input Box */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
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
            placeholder="Search expenses, vendor..."
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
          <span style={{ fontSize: '42px', display: 'block', marginBottom: '12px' }}>📊</span>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', color: '#f8fafc', fontWeight: 600 }}>
            {expenses.length === 0 ? 'No Expense Items Recorded Yet' : 'No Matching Expenses Found'}
          </h3>
          <p style={{ margin: '0 0 16px 0', color: '#94a3b8', fontSize: '0.88rem' }}>
            {expenses.length === 0
              ? 'Start by entering expected budget items like Caterers, Tent, DJ, Lights, and ID cards.'
              : 'Try adjusting your search query or category filters.'}
          </p>
          {expenses.length === 0 && (
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
          )}
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
            const receiptUrl = getPublicExpenseScreenshotUrl(expense.payment_screenshot_path);
            const budgetSharePct =
              stats.totalExpected > 0 ? Math.round((expAmt / stats.totalExpected) * 100) : 0;

            return (
              <div
                key={expense.id}
                onClick={() => onEditExpense(expense)}
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
                {/* Header Row: Icon, Title, Category Tag, Badges & Edit */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{categoryIcon}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: '#f8fafc' }}>
                        {expense.item_name}
                      </h4>
                      <span style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.72rem', color: '#94a3b8' }}>
                        {expense.category}
                      </span>
                      {budgetSharePct > 0 && (
                        <span style={{ color: '#a5b4fc', fontSize: '0.72rem' }}>
                          ({budgetSharePct}% of budget)
                        </span>
                      )}
                      {expense.vendor_name && (
                        <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                          • Vendor: <strong>{expense.vendor_name}</strong>
                        </span>
                      )}
                      {hasActual && expense.payment_date && (
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          • Paid: {expense.payment_date}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions & Status Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {receiptUrl && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewImageUrl(receiptUrl);
                        }}
                        style={{
                          background: 'rgba(99, 102, 241, 0.15)',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          color: '#a5b4fc',
                          borderRadius: '6px',
                          padding: '2px 7px',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        title="View Receipt"
                      >
                        📄 Receipt
                      </button>
                    )}

                    <span
                      style={{
                        backgroundColor: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                      }}
                    >
                      {badge.label}
                    </span>

                    <span style={{ color: '#64748b', fontSize: '13px' }} title="Edit Item">
                      ✏️
                    </span>
                  </div>
                </div>

                {/* Inline Compact Financial Details Row (No giant empty gap!) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                    fontSize: '0.84rem',
                    paddingTop: '4px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Expected: </span>
                    <strong style={{ color: '#93c5fd' }}>₹{formatINR(expAmt)}</strong>
                  </div>

                  <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>•</span>

                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Actual Paid: </span>
                    <strong style={{ color: hasActual ? '#86efac' : '#64748b' }}>
                      {hasActual ? `₹${formatINR(actAmt)}` : '₹0'}
                    </strong>
                  </div>

                  <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>•</span>

                  <div>
                    {!hasActual ? (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        ⏳ Payment not yet disbursed
                      </span>
                    ) : diff >= 0 ? (
                      <span
                        style={{
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: '#34d399',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
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
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        -₹{formatINR(Math.abs(diff))} Over Budget
                      </span>
                    )}
                  </div>

                  {expense.notes && (
                    <>
                      <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>•</span>
                      <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic' }}>
                        "{expense.notes}"
                      </span>
                    </>
                  )}
                </div>
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
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
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
              maxWidth: '90vw',
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
                maxHeight: '80vh',
                borderRadius: '8px',
                objectFit: 'contain',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              }}
            />
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              style={{
                marginTop: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.9rem',
                cursor: 'pointer',
                minHeight: '40px',
              }}
            >
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
