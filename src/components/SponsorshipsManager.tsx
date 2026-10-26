import React, { useState, useMemo } from 'react';
import type { Sponsorship } from '../types';
import { buildAllSponsorshipsWhatsAppMessage } from '../lib/sponsorships';
import { formatDisplayMobile } from '../lib/registrations';

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

  // Format date strictly as DD-MM-YYYY (matching UPI Reconciliation screen)
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* ── STREAMLINED COMPACT HEADER TOOLBAR (No Unused Spacing) ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 27, 75, 0.7) 100%)',
          borderRadius: '12px',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          padding: '12px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0, flex: '1 1 auto' }}>
          <span style={{ fontSize: '20px', flexShrink: 0, lineHeight: 1.2, marginTop: '2px' }}>💎</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>Event Sponsorships</span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}
              >
                {sponsorships.length}
              </span>
            </h2>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px', wordBreak: 'break-word' }}>
              Total Collected: <strong style={{ color: '#10b981' }}>₹{stats.totalAmount.toLocaleString('en-IN')}</strong>
              {registrationAmount > 0 && (
                <> • Combined Fund: <strong style={{ color: '#a5b4fc' }}>₹{stats.grandEventTotal.toLocaleString('en-IN')}</strong> ({totalAttendeesCount} guests attending)</>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onAddSponsorship}
            style={{
              minHeight: '44px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
            }}
          >
            <span>💎</span>
            <span>+ Add Sponsorship</span>
          </button>

          <button
            type="button"
            onClick={handleShareAllWhatsApp}
            className="btn btn-whatsapp-primary btn-sm"
            style={{ minHeight: '44px' }}
            title="Share all sponsorships on WhatsApp"
          >
            💬 Share
          </button>
        </div>
      </div>

      {/* ── FULL-WIDTH SEARCH BAR (Tightened, No Unwanted Dropdowns) ── */}
      <div style={{ position: 'relative', width: '100%', boxSizing: 'border-box' }}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            position: 'absolute',
            left: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#94a3b8',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search sponsor, contact, phone, notes, UPI..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '10px 40px 10px 42px',
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '10px',
            fontSize: '16px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            title="Clear search"
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '16px',
              cursor: 'pointer',
              padding: '6px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* ── EMPTY STATE ── */}
      {filteredList.length === 0 ? (
        <div
          style={{
            padding: '36px 20px',
            textAlign: 'center',
            backgroundColor: '#1e293b',
            borderRadius: '14px',
            border: '1px dashed rgba(255, 255, 255, 0.15)',
          }}
        >
          <div style={{ fontSize: '38px', marginBottom: '8px' }}>💎</div>
          <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', color: '#f8fafc' }}>
            {searchQuery ? 'No sponsorships match your search' : 'No sponsorships recorded yet'}
          </h3>
          <p style={{ margin: '0 0 16px', color: '#94a3b8', fontSize: '0.88rem', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
            Record corporate partners, alumni patrons, and batch contributions with payment screenshots and notes.
          </p>
          <button
            type="button"
            onClick={onAddSponsorship}
            style={{
              minHeight: '44px',
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>💎</span>
            <span>+ Add First Sponsorship</span>
          </button>
        </div>
      ) : (
        <>
          {/* ══════════════════════════════════════════════════════════════
              1. LAPTOP / DESKTOP TABLE VIEW (Screens > 640px)
              Exact same format as UPI Reconciliation Report Table
          ══════════════════════════════════════════════════════════════ */}
          <div className="upi-table-responsive upi-desktop-only" style={{ borderRadius: '12px', overflow: 'hidden' }}>
            <table className="upi-report-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '36px', textAlign: 'center', padding: '8px 4px' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>Name</th>
                  <th style={{ width: '110px', textAlign: 'right', padding: '8px 8px' }}>Amount</th>
                  <th style={{ width: '180px', textAlign: 'center', padding: '8px 6px' }}>UPI ID</th>
                  <th style={{ width: '110px', textAlign: 'center', padding: '8px 6px' }}>Date</th>
                  <th style={{ width: '60px', textAlign: 'center', padding: '8px 4px' }} title="Actions">✏️</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((s, idx) => {
                  return (
                    <tr
                      key={s.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onEditSponsorship(s)}
                      title="Click to view & edit details"
                      className={!s.receiving_upi_id ? 'row-unassigned' : ''}
                    >
                      {/* # Index */}
                      <td className="cell-muted font-mono" style={{ textAlign: 'center', padding: '8px 4px' }}>
                        {idx + 1}
                      </td>

                      {/* Name */}
                      <td style={{ padding: '8px 12px' }}>
                        <strong
                          style={{ color: '#f8fafc', fontSize: '0.94rem', fontWeight: 700 }}
                          title={s.sponsor_name}
                        >
                          {s.sponsor_name}
                        </strong>
                      </td>

                      {/* Amount */}
                      <td style={{ textAlign: 'right', padding: '8px 8px' }}>
                        <span className="amount-cell" style={{ color: 'var(--primary-light)', fontSize: '0.96rem', fontWeight: 800 }}>
                          ₹{Number(s.amount || 0).toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* UPI ID (Without green dot) */}
                      <td style={{ textAlign: 'center', padding: '8px 6px' }}>
                        {s.receiving_upi_id ? (
                          <span className="assigned-upi-pill" title={s.receiving_upi_id}>
                            <span>{s.receiving_upi_id}</span>
                          </span>
                        ) : (
                          <span className="unassigned-warning-pill">Untagged</span>
                        )}
                      </td>

                      {/* Date (DD-MM-YYYY) */}
                      <td style={{ textAlign: 'center', padding: '8px 6px' }}>
                        <span className="date-cell font-mono" style={{ fontSize: '0.84rem', color: '#94a3b8' }}>
                          {formatDDMMYYYY(s.created_at)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                        <div
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => onEditSponsorship(s)}
                            className="btn-edit-compact"
                            title="Edit Sponsorship"
                            aria-label="Edit"
                          >
                            ✏️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="subtotal-row" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                  <td colSpan={2} style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', padding: '8px 4px' }}>
                    Grand Total:
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontWeight: 800,
                      fontSize: '0.94rem',
                      color: 'var(--primary-light)',
                      whiteSpace: 'nowrap',
                      overflow: 'visible',
                      padding: '8px 4px',
                    }}
                    title={`₹${filteredAmount.toLocaleString('en-IN')}`}
                  >
                    ₹{filteredAmount.toLocaleString('en-IN')}
                  </td>
                  <td colSpan={3} style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.78rem', whiteSpace: 'nowrap', padding: '8px 4px' }}>
                    {filteredList.length} {filteredList.length === 1 ? 'Sponsor' : 'Sponsors'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              2. MOBILE CARDS VIEW (Screens <= 640px)
              Exact same card format as UPI Reconciliation Mobile List
          ══════════════════════════════════════════════════════════════ */}
          <div className="upi-mobile-card-list upi-mobile-only" style={{ padding: '8px 0' }}>
            {filteredList.map((s, idx) => {
              const isUnassigned = !s.receiving_upi_id;

              return (
                <div
                  key={s.id}
                  className={`upi-m-card ${isUnassigned ? 'upi-m-card-unassigned' : 'upi-m-card-tagged'}`}
                  style={{ cursor: 'default' }}
                >
                  {/* Card Header: Index, Date, Amount */}
                  <div className="upi-m-card-header">
                    <div className="upi-m-card-meta">
                      <span className="upi-m-card-idx font-mono">#{idx + 1}</span>
                      <span className="upi-m-card-date font-mono">{formatDDMMYYYY(s.created_at)}</span>
                    </div>
                    <div className="upi-m-card-amount font-accent" style={{ color: 'var(--primary-light)', fontWeight: 800 }}>
                      ₹{Number(s.amount || 0).toLocaleString('en-IN')}
                    </div>
                  </div>

                  {/* Card Body: Sponsor Name, Contact Person, Phone, Notes */}
                  <div className="upi-m-card-body">
                    <div className="upi-m-name-row">
                      <h4 className="upi-m-name" style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>
                        {s.sponsor_name}
                      </h4>
                    </div>

                    {(s.contact_person || s.contact_phone || s.contact_email) && (
                      <div className="upi-m-alumni-meta" style={{ marginTop: '4px' }}>
                        {s.contact_person && <span>👤 {s.contact_person}</span>}
                        {s.contact_phone && (
                          <>
                            {s.contact_person && <span className="meta-sep">•</span>}
                            <a
                              href={`tel:${s.contact_phone}`}
                              style={{ color: '#60a5fa', textDecoration: 'none' }}
                            >
                              📞 {formatDisplayMobile(s.contact_phone, '')}
                            </a>
                          </>
                        )}
                        {s.contact_email && (
                          <>
                            <span className="meta-sep">•</span>
                            <span>✉️ {s.contact_email}</span>
                          </>
                        )}
                      </div>
                    )}

                    {s.notes && (
                      <div
                        style={{
                          marginTop: '6px',
                          fontSize: '0.8rem',
                          color: '#cbd5e1',
                          background: 'rgba(255, 255, 255, 0.04)',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          borderLeft: '2px solid #f59e0b',
                        }}
                      >
                        📝 {s.notes}
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Credited Account & Actions */}
                  <div className="upi-m-card-footer" style={{ flexWrap: 'wrap', gap: '8px' }}>
                    <div className="upi-m-account-wrap">
                      <span className="upi-m-account-label">Credited To:</span>
                      {s.receiving_upi_id ? (
                        <span className="assigned-upi-pill" title={s.receiving_upi_id}>
                          <span className="upi-pill-name">{s.receiving_upi_id}</span>
                        </span>
                      ) : (
                        <span className="unassigned-warning-pill">Untagged</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                      <button
                        type="button"
                        onClick={() => onEditSponsorship(s)}
                        className="upi-m-edit-btn"
                        style={{ minWidth: '40px', padding: '6px 10px' }}
                        title="Edit Sponsorship"
                        aria-label="Edit"
                      >
                        ✏️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Mobile Grand Total Summary Card (Matching UPI Reconciliation Screen) */}
            <div className="upi-grand-total-card upi-mobile-grand-total">
              <div className="grand-total-left">
                <span className="grand-total-icon">🏆</span>
                <div>
                  <h4 className="grand-total-title">Total Sponsorships</h4>
                  <p className="grand-total-sub">
                    {filteredList.length} {filteredList.length === 1 ? 'Sponsor' : 'Sponsors'} accounted
                  </p>
                </div>
              </div>
              <div className="grand-total-right">
                <span className="grand-total-amount">₹{filteredAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
