import React, { useState, useMemo } from 'react';
import type { Sponsorship } from '../types';
import { buildAllSponsorshipsWhatsAppMessage } from '../lib/sponsorships';
import { formatDisplayMobile } from '../lib/registrations';
import { Search, Plus, Edit2, X } from 'lucide-react';

interface SponsorshipsManagerProps {
  sponsorships: Sponsorship[];
  registrationAmount: number;
  totalAttendeesCount: number;
  onAddSponsorship: () => void;
  onEditSponsorship: (sponsorship: Sponsorship) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

export const SponsorshipsManager: React.FC<SponsorshipsManagerProps> = ({
  sponsorships,
  registrationAmount,
  totalAttendeesCount,
  onAddSponsorship,
  onEditSponsorship,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Financial Summary Aggregation
  const stats = useMemo(() => {
    const totalCount = sponsorships.length;
    const totalAmount = sponsorships.reduce((sum, s) => sum + Number(s.amount || 0), 0);
    const grandEventTotal = registrationAmount + totalAmount;

    return {
      totalCount,
      totalAmount,
      grandEventTotal,
    };
  }, [sponsorships, registrationAmount]);

  // Filtered List based on Search Query
  const filteredList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return sponsorships;

    return sponsorships.filter((s) => {
      const name = (s.sponsor_name || '').toLowerCase();
      const contact = (s.contact_person || '').toLowerCase();
      const phone = (s.contact_phone || '').toLowerCase();
      const email = (s.contact_email || '').toLowerCase();
      const notes = (s.notes || '').toLowerCase();
      const upi = (s.receiving_upi_id || '').toLowerCase();

      return (
        name.includes(q) ||
        contact.includes(q) ||
        phone.includes(q) ||
        email.includes(q) ||
        notes.includes(q) ||
        upi.includes(q)
      );
    });
  }, [sponsorships, searchQuery]);

  const filteredAmount = useMemo(() => {
    return filteredList.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  }, [filteredList]);

  // Broadcast / Share All Sponsorships on WhatsApp (Toolbar Action)
  const handleShareAllWhatsApp = () => {
    if (filteredList.length === 0) {
      alert('No sponsorship data to share.');
      return;
    }
    const text = buildAllSponsorshipsWhatsAppMessage(filteredList, filteredAmount);
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

  // Format date strictly as DD-MM-YYYY
  const formatDDMMYYYY = (dateStr: string | null | undefined) => {
    if (!dateStr || dateStr === 'No Date') return '—';
    try {
      const clean = dateStr.slice(0, 10);
      const parts = clean.split('-');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr || '—';
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* ── TOOLBAR HEADER ── */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
        <div className="flex items-start gap-2.5">
          <span className="text-2xl shrink-0 mt-0.5">💎</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2 flex-wrap">
              <span>Event Sponsorships</span>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-bold shrink-0">
                {sponsorships.length}
              </span>
            </h2>
            <div className="text-xs sm:text-sm text-slate-400 mt-1 break-words">
              Total Collected: <strong className="text-emerald-400 font-bold">₹{stats.totalAmount.toLocaleString('en-IN')}</strong>
              {registrationAmount > 0 && (
                <> • Combined Fund: <strong className="text-indigo-300 font-bold">₹{stats.grandEventTotal.toLocaleString('en-IN')}</strong> ({totalAttendeesCount} guests attending)</>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center gap-3 mt-3.5">
          <button
            type="button"
            onClick={onAddSponsorship}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-amber-500/25 active:scale-[0.98] transition-all cursor-pointer"
          >
            <span className="text-sm">💎</span>
            <span>+ Add Sponsorship</span>
          </button>

          <button
            type="button"
            onClick={handleShareAllWhatsApp}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#025907] via-[#087f10] to-[#0d9616] hover:from-[#036809] hover:via-[#0a8e13] hover:to-[#0fa81a] border border-[#0d9616]/60 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-green-950/50 active:scale-[0.98] transition-all cursor-pointer"
            title="Share all sponsorships on WhatsApp"
          >
            <span className="text-sm">💬</span>
            <span>Share</span>
          </button>
        </div>
      </div>

      {/* ── SEARCH BAR ── */}
      <div className="relative w-full">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search sponsor, contact, phone, notes, UPI..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full min-h-[44px] pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-base sm:text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-200 cursor-pointer"
            title="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── EMPTY STATE ── */}
      {filteredList.length === 0 ? (
        <div className="py-12 px-4 text-center bg-slate-900/60 rounded-2xl border border-dashed border-slate-800 flex flex-col items-center">
          <div className="text-4xl mb-3">💎</div>
          <h3 className="text-base sm:text-lg font-bold text-slate-100 mb-1">
            {searchQuery ? 'No sponsorships match your search' : 'No sponsorships recorded yet'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mb-5">
            Record corporate partners, alumni patrons, and batch contributions with payment screenshots and notes.
          </p>
          <button
            type="button"
            onClick={onAddSponsorship}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-bold text-sm inline-flex items-center gap-2 shadow-md shadow-amber-500/20 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add First Sponsorship</span>
          </button>
        </div>
      ) : (
        <>
          {/* ── DESKTOP TABLE VIEW (Screens >= 640px) ── */}
          <div className="hidden sm:block overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="w-10 text-center py-3.5 px-2">#</th>
                  <th className="py-3.5 px-3 text-left w-[220px] max-w-[220px]">NAME</th>
                  <th className="w-28 py-3.5 px-3 text-left">AMOUNT</th>
                  <th className="w-44 text-center py-3.5 px-2">UPI ID</th>
                  <th className="w-28 text-center py-3.5 px-2">DATE</th>
                  <th className="w-12 text-center py-3.5 px-2" title="Actions">
                    <Edit2 className="w-3.5 h-3.5 text-amber-500 inline-block" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredList.map((s, idx) => {
                  return (
                    <tr
                      key={s.id}
                      onClick={() => onEditSponsorship(s)}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                      title="Click to view & edit details"
                    >
                      {/* # Index */}
                      <td className="text-center py-3.5 px-2 text-slate-300 font-mono text-xs font-bold">
                        {idx + 1}
                      </td>

                      {/* Name */}
                      <td className="py-3.5 px-3 w-[220px] max-w-[220px] overflow-hidden">
                        <div
                          className="font-black text-white group-hover:text-amber-400 transition-colors text-sm truncate"
                          title={s.sponsor_name}
                        >
                          {s.sponsor_name}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="text-left py-3.5 px-3 font-black text-amber-400 text-sm whitespace-nowrap">
                        ₹{Number(s.amount || 0).toLocaleString('en-IN')}
                      </td>

                      {/* UPI ID */}
                      <td className="text-center py-3.5 px-2 whitespace-nowrap">
                        {s.receiving_upi_id ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-normal bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                            {s.receiving_upi_id}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-400">
                            Untagged
                          </span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="text-center py-3.5 px-2 text-xs font-mono text-slate-400 whitespace-nowrap">
                        {formatDDMMYYYY(s.created_at)}
                      </td>

                      {/* Action */}
                      <td className="text-center py-3.5 px-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onEditSponsorship(s)}
                          className="min-h-[32px] min-w-[32px] p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-amber-500 hover:text-amber-400 hover:bg-slate-700/60 transition-colors inline-flex items-center justify-center cursor-pointer"
                          title="Edit Sponsorship"
                          aria-label="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-amber-500/20 bg-amber-950/30 font-bold text-slate-200">
                  <td colSpan={2} className="py-3.5 px-4 text-center text-sm font-bold text-slate-100">
                    Grand Total:
                  </td>
                  <td className="py-3.5 px-3 text-left font-black text-amber-400 text-base whitespace-nowrap">
                    ₹{filteredAmount.toLocaleString('en-IN')}
                  </td>
                  <td colSpan={3} className="py-3.5 px-4 text-center text-sm font-bold text-slate-300">
                    {filteredList.length} {filteredList.length === 1 ? 'Sponsor' : 'Sponsors'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── MOBILE CARDS VIEW (Screens < 640px) ── */}
          <div className="sm:hidden flex flex-col gap-3">
            {filteredList.map((s, idx) => {
              const isTagged = Boolean(s.receiving_upi_id);

              return (
                <div
                  key={s.id}
                  onClick={() => onEditSponsorship(s)}
                  className={`p-4 rounded-2xl bg-[#111422] border border-slate-800/80 shadow-md cursor-pointer transition-all flex flex-col gap-2 hover:border-amber-500/30 ${
                    isTagged
                      ? 'border-l-[3.5px] border-l-emerald-500'
                      : 'border-l-[3.5px] border-l-red-500 bg-gradient-to-br from-red-500/5 to-[#111422]'
                  }`}
                >
                  {/* Card Header: Index, Date, Amount */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-400 bg-slate-800/80 border border-slate-700/50 px-2 py-0.5 rounded-md">
                        #{idx + 1}
                      </span>
                      <span className="font-mono text-xs text-slate-300 bg-slate-800/80 border border-slate-700/50 px-2.5 py-0.5 rounded-md">
                        {formatDDMMYYYY(s.created_at)}
                      </span>
                    </div>
                    <div className="font-serif font-black text-amber-400 text-xl tracking-tight">
                      ₹{Number(s.amount || 0).toLocaleString('en-IN')}
                    </div>
                  </div>

                  {/* Card Body: Name, Contact & Notes */}
                  <div className="flex flex-col gap-1.5 pt-0.5">
                    <h4 className="text-base font-bold text-white leading-snug break-words">
                      {s.sponsor_name}
                    </h4>

                    {(s.contact_person || s.contact_phone || s.contact_email) && (
                      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                        {s.contact_person && (
                          <span className="text-slate-300 font-medium flex items-center gap-1">
                            <span className="text-blue-400">👤</span>
                            <span>{s.contact_person}</span>
                          </span>
                        )}
                        {s.contact_phone && (
                          <>
                            {s.contact_person && <span className="text-slate-600">•</span>}
                            <a
                              href={`tel:${s.contact_phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-400 font-mono hover:underline flex items-center gap-1 min-h-[32px] items-center"
                            >
                              <span>📞</span>
                              <span>{formatDisplayMobile(s.contact_phone, '')}</span>
                            </a>
                          </>
                        )}
                        {s.contact_email && (
                          <>
                            {(s.contact_person || s.contact_phone) && <span className="text-slate-600">•</span>}
                            <span className="text-slate-400 flex items-center gap-1">
                              <span>✉️</span>
                              <span>{s.contact_email}</span>
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {s.notes && (
                      <div className="mt-1 text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border-l-2 border-l-amber-500 leading-relaxed break-words">
                        📝 {s.notes}
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Credited Account & Edit button */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                        CREDITED TO:
                      </span>
                      {s.receiving_upi_id ? (
                        <span
                          className="inline-flex items-center text-xs font-mono font-bold px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/35 text-emerald-400 truncate max-w-[200px]"
                          title={s.receiving_upi_id}
                        >
                          {s.receiving_upi_id}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 text-red-400">
                          Untagged
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditSponsorship(s);
                      }}
                      className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 flex items-center justify-center transition-colors cursor-pointer ml-auto"
                      title="Edit Sponsorship"
                      aria-label="Edit"
                    >
                      <span className="text-sm">✏️</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Mobile Grand Total Card */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏆</span>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Sponsorships</h4>
                  <p className="text-xs text-slate-400">
                    {filteredList.length} {filteredList.length === 1 ? 'Sponsor' : 'Sponsors'} accounted
                  </p>
                </div>
              </div>
              <div className="text-lg font-mono font-bold text-amber-400">
                ₹{filteredAmount.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
