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
import { ArrowLeftRight, RefreshCw, CheckCircle2 } from 'lucide-react';

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

  // 1. Compute Master Account Settlements across all accounts
  const settlementData = useMemo(() => {
    return computeAccountSettlements(
      expenses,
      registrations,
      verifications,
      sponsorships,
      (activeEvent as any)?.expense_accounts_config || undefined
    );
  }, [expenses, registrations, verifications, sponsorships, (activeEvent as any)?.expense_accounts_config]);

  // 2. Campus Legacy Fund Ledger & Custodians (Independent Permanent Corpus)
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

  // 3. Total Liquid Cash across all coordinators
  const totalLiquidAssets = useMemo(() => {
    const eventLiquid = settlementData.accounts.reduce((sum, a) => sum + a.netBalance, 0);
    return eventLiquid + (legacyFund?.netBalance || 0);
  }, [settlementData.accounts, legacyFund?.netBalance]);

  const cashInHandBalance = useMemo(() => {
    return settlementData.accounts.find((a) => a.isCash)?.netBalance || 0;
  }, [settlementData.accounts]);

  const bankBalancesTotal = useMemo(() => {
    return totalLiquidAssets - cashInHandBalance;
  }, [totalLiquidAssets, cashInHandBalance]);

  // 4. Operational Events & their active Custodians
  const eventBlocks = useMemo(() => {
    const eventsList = allEvents.length > 0 ? allEvents : [activeEvent];

    return eventsList.map((ev) => {
      const isCurrent = ev.id === activeEvent.id;

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

      const eventCustodians = settlementData.accounts
        .filter((a) => a.netBalance > 0)
        .map((a) => ({
          name: a.accountName,
          bank: a.bankName,
          upiId: a.upiId,
          amount: a.netBalance,
          isCash: a.isCash,
        }))
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
    <div className="flex flex-col gap-5 w-full text-left">
      {/* 💰 1. Big Hero Block: Total Liquid Cash (In Hand) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs uppercase tracking-wider text-emerald-400 font-bold bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Central Association Treasury</span>
              </span>
            </div>

            <span className="text-xs sm:text-sm text-slate-400 font-semibold block">
              Total Liquid Cash (In Hand)
            </span>
            <div className="text-3xl sm:text-4xl md:text-5xl font-black text-emerald-400 font-mono tracking-tight mt-1">
              ₹{formatINR(totalLiquidAssets)}
            </div>
            <div className="text-xs sm:text-sm text-slate-300 mt-2">
              ₹{formatINR(bankBalancesTotal)} across bank accounts • ₹{formatINR(cashInHandBalance)} cash in hand
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectedTransfer(null);
                setPresetFromAccount(undefined);
                setIsTransferModalOpen(true);
              }}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm inline-flex items-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>Transfer / Sweep Funds</span>
            </button>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                title="Refresh Balances"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Grid of Dedicated Blocks: Legacy Fund + Event Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 🌱 Block 1: Campus Legacy Fund (Permanent Endowment) */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-indigo-500/30 shadow-lg flex flex-col gap-3.5">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🌱</span>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
                  Permanent Endowment
                </span>
                <h2 className="text-base sm:text-lg font-bold text-slate-100">
                  Campus Legacy Fund
                </h2>
              </div>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              Corpus
            </span>
          </div>

          {/* Fund Amount */}
          <div className="flex items-baseline justify-between border-b border-slate-800 pb-3">
            <span className="text-xs text-slate-400 font-medium">Net Available Fund:</span>
            <span className="text-2xl sm:text-3xl font-black text-sky-400 font-mono">
              ₹{formatINR(legacyFund.netBalance)}
            </span>
          </div>

          {/* Custodians */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
              👤 Fund Custodians (Holding Balance):
            </span>

            {legacyFund.custodians.length === 0 ? (
              <span className="text-xs text-slate-500">No active custodian balance recorded yet.</span>
            ) : (
              legacyFund.custodians.map((c, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-lg shrink-0">{c.isCash ? '💵' : '🏦'}</span>
                    <div className="min-w-0">
                      <strong className="text-sm font-bold text-slate-100 block truncate">{c.name}</strong>
                      <span className="text-xs text-slate-400">({c.bank})</span>
                      {c.upiId && (
                        <div className="text-[11px] text-slate-500 font-mono truncate">
                          {c.upiId}
                        </div>
                      )}
                    </div>
                  </div>
                  <strong className="text-sm sm:text-base font-bold font-mono text-emerald-400 shrink-0">
                    ₹{formatINR(c.amount)}
                  </strong>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 🎪 Event Blocks */}
        {eventBlocks.map((ev) => {
          const isSurplus = ev.netSurplus >= 0;

          return (
            <div
              key={ev.id}
              className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-amber-500/30 shadow-lg flex flex-col gap-3.5"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">🎪</span>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
                      Reunion Event
                    </span>
                    <h2 className="text-base sm:text-lg font-bold text-slate-100">
                      {ev.name}
                    </h2>
                  </div>
                </div>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    ev.status === 'CLOSED'
                      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                      : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  }`}
                >
                  {ev.status}
                </span>
              </div>

              {/* Event Surplus / Balance */}
              <div className="flex items-baseline justify-between border-b border-slate-800 pb-3">
                <span className="text-xs text-slate-400 font-medium">Event Operational Surplus:</span>
                <span
                  className={`text-2xl sm:text-3xl font-black font-mono whitespace-nowrap ${
                    isSurplus ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isSurplus ? '' : '-'}₹{formatINR(Math.abs(ev.netSurplus))}
                </span>
              </div>

              {/* Custodians */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                  👤 Custodians (Holding Leftover Cash):
                </span>

                {ev.custodians.length === 0 ? (
                  <span className="text-xs text-slate-500">All event funds settled or disbursed.</span>
                ) : (
                  ev.custodians.map((c, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-lg shrink-0">{c.isCash ? '💵' : '🏦'}</span>
                        <div className="min-w-0">
                          <strong className="text-sm font-bold text-slate-100 block truncate">{c.name}</strong>
                          <span className="text-xs text-slate-400">({c.bank})</span>
                          {c.upiId && (
                            <div className="text-[11px] text-slate-500 font-mono truncate">
                              {c.upiId}
                            </div>
                          )}
                        </div>
                      </div>
                      <strong className="text-sm sm:text-base font-bold font-mono text-emerald-400 shrink-0">
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
