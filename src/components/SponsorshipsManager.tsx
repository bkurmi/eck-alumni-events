import React, { useState, useMemo } from 'react';
import type { Sponsorship } from '../types';
import { buildAllSponsorshipsWhatsAppMessage } from '../lib/sponsorships';
import { formatDisplayMobile } from '../lib/registrations';
import { Search, Plus, MessageCircle, Edit2, X, Phone, Mail, User, FileText } from 'lucide-react';

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
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-amber-500/20 backdrop-blur-md">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <span className="text-xl sm:text-2xl shrink-0 mt-0.5">💎</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2 flex-wrap">
              <span>Event Sponsorships</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                {sponsorships.length}
              </span>
            </h2>
            <div className="text-xs sm:text-sm text-slate-400 mt-1 break-words">
              Total Collected: <strong className="text-emerald-400 font-semibold">₹{stats.totalAmount.toLocaleString('en-IN')}</strong>
              {registrationAmount > 0 && (
                <> • Combined Fund: <strong className="text-indigo-300 font-semibold">₹{stats.grandEventTotal.toLocaleString('en-IN')}</strong> ({totalAttendeesCount} guests attending)</>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={onAddSponsorship}
            className="min-h-[44px] px-3.5 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm inline-flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Sponsorship</span>
          </button>

          <button
            type="button"
            onClick={handleShareAllWhatsApp}
            className="min-h-[44px] px-3 sm:px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm inline-flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-[0.98] transition-all cursor-pointer"
            title="Share all sponsorships on WhatsApp"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="hidden xs:inline">Share</span>
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
          className="w-full min-h-[44px] pl-10 pr-10 py-2.5 bg-slate-900/90 text-slate-100 placeholder-slate-500 border border-slate-800 rounded-xl text-base sm:text-sm focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 transition-colors"
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
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-sm inline-flex items-center gap-2 shadow-md shadow-amber-500/20 active:scale-[0.98] transition-all cursor-pointer"
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
                  <th className="w-10 text-center py-3 px-2">#</th>
                  <th className="py-3 px-3">Sponsor / Partner</th>
                  <th className="w-28 text-right py-3 px-3">Amount</th>
                  <th className="w-44 text-center py-3 px-2">Receiving UPI</th>
                  <th className="w-28 text-center py-3 px-2">Date</th>
                  <th className="w-14 text-center py-3 px-2" title="Actions">Edit</th>
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
                      <td className="text-center py-3 px-2 text-slate-500 font-mono text-xs">
                        {idx + 1}
                      </td>

                      {/* Name & Contact */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-100 group-hover:text-amber-400 transition-colors">
                          {s.sponsor_name}
                        </div>
                        {(s.contact_person || s.contact_phone) && (
                          <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                            {s.contact_person && <span>👤 {s.contact_person}</span>}
                            {s.contact_phone && (
                              <span className="text-slate-500">
                                • 📞 {formatDisplayMobile(s.contact_phone, '')}
                              </span>
                            )}
                          </div>
                        )}
                        {s.notes && (
                          <div className="text-xs text-slate-400/90 line-clamp-1 mt-0.5 font-sans italic">
                            📝 {s.notes}
                          </div>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="text-right py-3 px-3 font-mono font-bold text-amber-400 text-sm whitespace-nowrap">
                        ₹{Number(s.amount || 0).toLocaleString('en-IN')}
                      </td>

                      {/* UPI ID */}
                      <td className="text-center py-3 px-2 whitespace-nowrap">
                        {s.receiving_upi_id ? (
                          <span className="inline-block text-xs font-mono px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
                            {s.receiving_upi_id}
                          </span>
                        ) : (
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/30">
                            Untagged
                          </span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="text-center py-3 px-2 text-xs font-mono text-slate-400 whitespace-nowrap">
                        {formatDDMMYYYY(s.created_at)}
                      </td>

                      {/* Action */}
                      <td className="text-center py-3 px-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onEditSponsorship(s)}
                          className="min-h-[36px] min-w-[36px] p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 transition-colors cursor-pointer inline-flex items-center justify-center"
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
                <tr className="border-t border-slate-700 bg-amber-500/10 font-bold text-slate-200">
                  <td colSpan={2} className="py-3 px-3 text-right text-xs uppercase tracking-wider text-slate-400">
                    Grand Total:
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-amber-400 text-sm">
                    ₹{filteredAmount.toLocaleString('en-IN')}
                  </td>
                  <td colSpan={3} className="py-3 px-3 text-center text-xs text-slate-400 font-normal">
                    {filteredList.length} {filteredList.length === 1 ? 'Sponsor' : 'Sponsors'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── MOBILE CARDS VIEW (Screens < 640px) ── */}
          <div className="sm:hidden flex flex-col gap-3">
            {filteredList.map((s, idx) => {
              return (
                <div
                  key={s.id}
                  onClick={() => onEditSponsorship(s)}
                  className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 active:border-amber-500/50 transition-colors flex flex-col gap-2.5 cursor-pointer"
                >
                  {/* Card Header: Index, Date, Amount */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                      <span className="font-bold text-amber-400/90">#{idx + 1}</span>
                      <span>•</span>
                      <span>{formatDDMMYYYY(s.created_at)}</span>
                    </div>
                    <div className="text-base font-bold font-mono text-amber-400">
                      ₹{Number(s.amount || 0).toLocaleString('en-IN')}
                    </div>
                  </div>

                  {/* Card Body: Name, Contact & Notes */}
                  <div>
                    <h4 className="text-base font-bold text-slate-100">
                      {s.sponsor_name}
                    </h4>

                    {(s.contact_person || s.contact_phone || s.contact_email) && (
                      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mt-1.5">
                        {s.contact_person && (
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-500" />
                            <span>{s.contact_person}</span>
                          </span>
                        )}
                        {s.contact_phone && (
                          <a
                            href={`tel:${s.contact_phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-sky-400 hover:underline min-h-[32px] items-center"
                          >
                            <Phone className="w-3 h-3" />
                            <span>{formatDisplayMobile(s.contact_phone, '')}</span>
                          </a>
                        )}
                        {s.contact_email && (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <Mail className="w-3 h-3 text-slate-500" />
                            <span>{s.contact_email}</span>
                          </span>
                        )}
                      </div>
                    )}

                    {s.notes && (
                      <div className="mt-2 text-xs text-slate-300 bg-slate-950/50 p-2 rounded-lg border-l-2 border-amber-500 flex items-start gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{s.notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Credited Account & Edit button */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/40">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span>Credited:</span>
                      {s.receiving_upi_id ? (
                        <span className="font-mono text-slate-300 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/60 truncate max-w-[170px]">
                          {s.receiving_upi_id}
                        </span>
                      ) : (
                        <span className="text-rose-400 font-semibold px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/30">
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
                      className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 flex items-center justify-center transition-colors cursor-pointer"
                      title="Edit Sponsorship"
                      aria-label="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
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
