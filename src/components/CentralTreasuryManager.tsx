import React, { useState, useMemo } from 'react';
import type { EventExpense, EventRegistration, PaymentVerification, Sponsorship, ECKEvent } from '../types';
import {
  formatINR,
  computeAccountSettlements,
  saveExpenseToDb,
  deleteExpenseFromDb,
  getExpenseSplits,
} from '../lib/expenses';
import { getRegistrationStatusInfo } from '../lib/eventStatus';
import { AccountTransferModal } from './AccountTransferModal';

interface CentralTreasuryManagerProps {
  expenses: EventExpense[];
  registrations: EventRegistration[];
  verifications: PaymentVerification[];
  sponsorships: Sponsorship[];
  activeEvent: ECKEvent;
  allEvents?: ECKEvent[];
  onRefresh?: () => void;
  loading?: boolean;
}

export const CentralTreasuryManager: React.FC<CentralTreasuryManagerProps> = ({
  expenses,
  registrations,
  verifications,
  sponsorships,
  activeEvent,
  allEvents = [],
  onRefresh,
  loading = false,
}) => {
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<EventExpense | null>(null);
  const [presetFromAccount, setPresetFromAccount] = useState<string | undefined>(undefined);

  // 1. Compute Master Account Settlements across all accounts (supporting dynamic event coordinator accounts)
  const settlementData = useMemo(() => {
    return computeAccountSettlements(
      expenses,
      registrations,
      verifications,
      sponsorships,
      (activeEvent as any)?.expense_accounts_config || undefined
    );
  }, [expenses, registrations, verifications, sponsorships, (activeEvent as any)?.expense_accounts_config]);

  // 2. Total Liquid Cash across all coordinators
  const totalLiquidAssets = useMemo(() => {
    return settlementData.accounts.reduce((sum, a) => sum + a.netBalance, 0);
  }, [settlementData.accounts]);

  const cashInHandBalance = useMemo(() => {
    return settlementData.accounts.find((a) => a.isCash)?.netBalance || 0;
  }, [settlementData.accounts]);

  const bankBalancesTotal = useMemo(() => {
    return totalLiquidAssets - cashInHandBalance;
  }, [totalLiquidAssets, cashInHandBalance]);

  // 3. Campus Legacy Fund Ledger & Custodians
  const legacyFund = useMemo(() => {
    const legacyRecords = expenses.filter(
      (e) => e.category === 'Campus Legacy Fund' && e.status !== 'cancelled'
    );

    const corpusInflows = legacyRecords
      .filter((e) => {
        const note = (e.notes || '').toLowerCase();
        const item = (e.item_name || '').toLowerCase();
        return !(
          item.includes('disbursement') ||
          item.includes('scholarship') ||
          item.includes('payout') ||
          item.includes('grant') ||
          note.includes('disbursement') ||
          note.includes('scholarship') ||
          note.includes('payout') ||
          note.includes('grant')
        );
      })
      .reduce((sum, e) => sum + Number(e.actual_amount || 0), 0);

    const disbursements = legacyRecords
      .filter((e) => {
        const note = (e.notes || '').toLowerCase();
        const item = (e.item_name || '').toLowerCase();
        return (
          item.includes('disbursement') ||
          item.includes('scholarship') ||
          item.includes('payout') ||
          item.includes('grant') ||
          note.includes('disbursement') ||
          note.includes('scholarship') ||
          note.includes('payout') ||
          note.includes('grant')
        );
      })
      .reduce((sum, e) => sum + Number(e.actual_amount || 0), 0);

    const transfersSweptIn = expenses
      .filter((e) => {
        if (e.category !== 'Internal Transfer' || e.status === 'cancelled') return false;
        const note = (e.notes || '').toLowerCase();
        return note.includes('legacy') || note.includes('corpus');
      })
      .reduce((sum, e) => sum + Number(e.actual_amount || 0), 0);

    const totalCorpusPool = corpusInflows + transfersSweptIn;
    const netBalance = totalCorpusPool - disbursements;

    // Identify designated custodians holding the Legacy Fund from recorded transactions
    const legacyHoldingAccountNames = new Set<string>();
    legacyRecords.forEach((e) => {
      if (e.paid_from_account) legacyHoldingAccountNames.add(e.paid_from_account.toLowerCase().trim());
      getExpenseSplits(e).forEach((s) => {
        if (s.account) legacyHoldingAccountNames.add(s.account.toLowerCase().trim());
      });
    });
    expenses.forEach((e) => {
      if (e.category === 'Internal Transfer' && e.status !== 'cancelled') {
        const note = (e.notes || '').toLowerCase();
        if ((note.includes('legacy') || note.includes('corpus')) && e.vendor_name) {
          legacyHoldingAccountNames.add(e.vendor_name.toLowerCase().trim());
        }
      }
    });

    const custodianAcc = settlementData.accounts.find((a) =>
      legacyHoldingAccountNames.has(a.accountName.toLowerCase().trim()) ||
      legacyHoldingAccountNames.has(a.accountId.toLowerCase().trim()) ||
      Array.from(legacyHoldingAccountNames).some(
        (h) => a.accountName.toLowerCase().includes(h) || h.includes(a.accountName.toLowerCase())
      )
    ) || settlementData.accounts.find((a) => a.netBalance > 0);

    const effectiveLegacy = netBalance > 0 ? netBalance : (custodianAcc?.netBalance || 0);

    const custodians: { name: string; bank: string; upiId?: string; amount: number; isCash?: boolean }[] = [];
    if (effectiveLegacy > 0 && custodianAcc) {
      custodians.push({
        name: custodianAcc.accountName,
        bank: custodianAcc.bankName || 'Bank',
        upiId: custodianAcc.upiId || undefined,
        amount: effectiveLegacy,
        isCash: custodianAcc.isCash || false,
      });
    }

    return {
      netBalance: effectiveLegacy,
      disbursements,
      custodians,
    };
  }, [expenses, settlementData.accounts]);

  // 4. Operational Events (DeepAura 2026 + any other events) & their active Custodians
  const eventBlocks = useMemo(() => {
    // List all events (active event first)
    const eventsList = allEvents.length > 0 ? allEvents : [activeEvent];

    return eventsList.map((ev) => {
      const isCurrent = ev.id === activeEvent.id;

      // Calculate event-level inflows & real expenses
      const realEventExpenses = expenses.filter(
        (e) =>
          e.category !== 'Internal Transfer' &&
          e.category !== 'Campus Legacy Fund' &&
          e.status !== 'cancelled' &&
          (!e.event_id || e.event_id === ev.id)
      );

      const totalExpenses = realEventExpenses.reduce(
        (sum, e) => sum + Number(e.actual_amount || 0),
        0
      );

      const eventRegs = registrations.filter(
        (r) => !r.event_id || r.event_id === ev.id || r.events?.id === ev.id
      );

      const verifiedRegAmount = eventRegs
        .filter((r) => r.attendance_status === 'yes' || r.attendance_status === 'payment_pending')
        .reduce((sum, r) => {
          const verif = verifications.find((v) => v.registration_id === r.id);
          const amt =
            verif && verif.amount !== undefined && !isNaN(Number(verif.amount))
              ? Number(verif.amount)
              : Number(r.amount || 0);
          return sum + amt;
        }, 0);

      const eventSponsors = sponsorships.filter((s) => !s.event_id || s.event_id === ev.id);
      const totalSponsorAmount = eventSponsors.reduce(
        (sum, s) => sum + Number(s.amount || 0),
        0
      );

      const totalInflow = verifiedRegAmount + totalSponsorAmount;
      const netSurplus = totalInflow - totalExpenses;

      // Find who holds this event's funds:
      // Any coordinator with positive netBalance (excluding their legacy allocation if they are a legacy custodian)
      const legacyCustodianNames = new Set(
        legacyFund.custodians.map((c) => c.name.toLowerCase().trim())
      );

      const eventCustodians = settlementData.accounts
        .filter((a) => {
          const isLegacy = legacyCustodianNames.has(a.accountName.toLowerCase().trim());
          if (isLegacy) {
            const operationalSurplus = Math.max(0, a.netBalance - legacyFund.netBalance);
            return operationalSurplus > 0;
          }
          return a.netBalance > 0;
        })
        .map((a) => {
          const isLegacy = legacyCustodianNames.has(a.accountName.toLowerCase().trim());
          const holdingAmt = isLegacy
            ? Math.max(0, a.netBalance - legacyFund.netBalance)
            : a.netBalance;

          return {
            name: a.accountName,
            bank: a.bankName,
            upiId: a.upiId,
            amount: holdingAmt,
            isCash: a.isCash,
          };
        })
        .filter((c) => c.amount > 0);

      const deadlineInfo = getRegistrationStatusInfo(ev);
      const isClosed = ev.status === 'CLOSED' || deadlineInfo.isClosed;
      const effectiveStatus: 'OPEN' | 'CLOSED' = isClosed ? 'CLOSED' : 'OPEN';

      return {
        id: ev.id,
        name: ev.event_name,
        date: ev.event_date,
        status: effectiveStatus,
        isCurrent,
        netSurplus,
        custodians: eventCustodians,
      };
    });
  }, [allEvents, activeEvent, expenses, registrations, verifications, sponsorships, settlementData.accounts, legacyFund.netBalance]);

  // Handle saving internal transfer
  const handleSaveTransfer = async (
    payload: Partial<EventExpense>,
    receiptFile?: File | null
  ): Promise<boolean> => {
    try {
      await saveExpenseToDb(
        {
          ...payload,
          category: 'Internal Transfer',
          status: 'settled',
        },
        receiptFile,
        activeEvent.event_slug
      );
      if (onRefresh) onRefresh();
      return true;
    } catch (err: any) {
      console.error('Failed to save transfer:', err);
      alert('Failed to save transfer: ' + (err?.message || 'Unknown error'));
      return false;
    }
  };

  const handleDeleteTransfer = async (id: string): Promise<boolean> => {
    try {
      await deleteExpenseFromDb(id);
      if (onRefresh) onRefresh();
      return true;
    } catch (err: any) {
      console.error('Failed to delete transfer:', err);
      alert('Failed to delete transfer: ' + (err?.message || 'Unknown error'));
      return false;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 💰 1. Big Hero Block: Total Liquid Cash (In Hand) */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.98) 100%)',
          borderRadius: '18px',
          border: '1.5px solid rgba(16, 185, 129, 0.35)',
          padding: '24px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span
                style={{
                  fontSize: '0.74rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                  color: '#6ee7b7',
                  fontWeight: 700,
                  backgroundColor: 'rgba(16, 185, 129, 0.18)',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                }}
              >
                ✓ Central Association Treasury
              </span>
            </div>

            <span style={{ fontSize: '0.92rem', color: '#94a3b8', fontWeight: 600 }}>
              Total Liquid Cash (In Hand)
            </span>
            <div
              style={{
                fontSize: 'clamp(2rem, 5vw, 2.85rem)',
                fontWeight: 900,
                color: '#34d399',
                lineHeight: 1.15,
                marginTop: '4px',
                letterSpacing: '-0.5px',
              }}
            >
              ₹{formatINR(totalLiquidAssets)}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: '6px' }}>
              ₹{formatINR(bankBalancesTotal)} across bank accounts • ₹{formatINR(cashInHandBalance)} cash in hand
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setSelectedTransfer(null);
                setPresetFromAccount(undefined);
                setIsTransferModalOpen(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 18px',
                minHeight: '44px',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
              }}
            >
              <span>🔄</span>
              <span>Transfer / Sweep Funds</span>
            </button>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '12px 14px',
                  minHeight: '44px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
                title="Refresh Balances"
              >
                <span>🔄</span>
                <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Grid of Dedicated Blocks: Legacy Fund + Event Blocks */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {/* 🌱 Block 1: Campus Legacy Fund (Permanent Corpus) */}
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.95) 0%, rgba(12, 19, 34, 0.98) 100%)',
            borderRadius: '16px',
            border: '1.5px solid rgba(59, 130, 246, 0.35)',
            padding: '20px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.5rem' }}>🌱</span>
              <div>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8', fontWeight: 700 }}>
                  Permanent Endowment
                </span>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
                  Campus Legacy Fund
                </h2>
              </div>
            </div>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '999px',
                backgroundColor: 'rgba(59, 130, 246, 0.16)',
                color: '#93c5fd',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
            >
              Corpus
            </span>
          </div>

          {/* Big Fund Amount */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Net Available Fund:</span>
            <span style={{ fontSize: '1.85rem', fontWeight: 800, color: '#38bdf8' }}>
              ₹{formatINR(legacyFund.netBalance)}
            </span>
          </div>

          {/* Custodians (Who is holding this money?) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#94a3b8', fontWeight: 700 }}>
              👤 Fund Custodians (Holding Balance):
            </span>

            {legacyFund.custodians.length === 0 ? (
              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>No active custodian balance recorded yet.</span>
            ) : (
              legacyFund.custodians.map((c, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.6)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1rem' }}>{c.isCash ? '💵' : '🏦'}</span>
                    <div>
                      <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{c.name}</strong>
                      <span style={{ fontSize: '0.74rem', color: '#94a3b8', marginLeft: '6px' }}>({c.bank})</span>
                      {c.upiId && (
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>
                          {c.upiId}
                        </div>
                      )}
                    </div>
                  </div>
                  <strong style={{ color: '#34d399', fontSize: '1.05rem', fontWeight: 800 }}>
                    ₹{formatINR(c.amount)}
                  </strong>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 🎪 Event Blocks: One Clean Block for Each Reunion Event */}
        {eventBlocks.map((ev) => {
          const isSurplus = ev.netSurplus >= 0;

          return (
            <div
              key={ev.id}
              style={{
                background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.95) 0%, rgba(12, 19, 34, 0.98) 100%)',
                borderRadius: '16px',
                border: '1.5px solid rgba(245, 158, 11, 0.35)',
                padding: '20px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.5rem' }}>🎪</span>
                  <div>
                    <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8', fontWeight: 700 }}>
                      Reunion Event
                    </span>
                    <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
                      {ev.name}
                    </h2>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    backgroundColor:
                      ev.status === 'CLOSED'
                        ? 'rgba(239, 68, 68, 0.16)'
                        : 'rgba(16, 185, 129, 0.16)',
                    color: ev.status === 'CLOSED' ? '#f87171' : '#34d399',
                    border: `1px solid ${
                      ev.status === 'CLOSED'
                        ? 'rgba(239, 68, 68, 0.3)'
                        : 'rgba(16, 185, 129, 0.3)'
                    }`,
                  }}
                >
                  {ev.status}
                </span>
              </div>

              {/* Big Surplus / Balance Amount */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Event Operational Surplus:</span>
                <span
                  style={{
                    fontSize: '1.85rem',
                    fontWeight: 800,
                    color: isSurplus ? '#34d399' : '#f87171',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isSurplus ? '' : '-'}₹{formatINR(Math.abs(ev.netSurplus))}
                </span>
              </div>

              {/* Custodians (Who is holding this surplus money?) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#94a3b8', fontWeight: 700 }}>
                  👤 Custodians (Holding Leftover Cash):
                </span>

                {ev.custodians.length === 0 ? (
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>All event funds settled or disbursed.</span>
                ) : (
                  ev.custodians.map((c, idx) => (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: 'rgba(30, 41, 59, 0.6)',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1rem' }}>{c.isCash ? '💵' : '🏦'}</span>
                        <div>
                          <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{c.name}</strong>
                          <span style={{ fontSize: '0.74rem', color: '#94a3b8', marginLeft: '6px' }}>({c.bank})</span>
                          {c.upiId && (
                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>
                              {c.upiId}
                            </div>
                          )}
                        </div>
                      </div>
                      <strong style={{ color: '#34d399', fontSize: '1.05rem', fontWeight: 800 }}>
                        ₹{formatINR(c.amount)}
                      </strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Transfer Modal */}
      <AccountTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => {
          setIsTransferModalOpen(false);
          setSelectedTransfer(null);
          setPresetFromAccount(undefined);
        }}
        onSave={handleSaveTransfer}
        onDelete={handleDeleteTransfer}
        initialData={selectedTransfer}
        presetFromAccount={presetFromAccount}
        accounts={settlementData.accounts}
        eventId={activeEvent.id}
      />
    </div>
  );
};
