import React, { useState, useMemo } from 'react';
import type { EventRegistration, ECKEvent } from '../types';

interface ShareWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  registrations: EventRegistration[];
  filteredRegistrations: EventRegistration[];
  event?: ECKEvent | null;
}

type FilterOption = 'attending' | 'all' | 'filtered';
type GroupOption = 'grouped' | 'numbered' | 'compact';

export const ShareWhatsAppModal: React.FC<ShareWhatsAppModalProps> = ({
  isOpen,
  onClose,
  registrations,
  filteredRegistrations,
  event,
}) => {
  const [filterOption, setFilterOption] = useState<FilterOption>('attending');
  const [groupOption, setGroupOption] = useState<GroupOption>('grouped');
  const [includeLocation, setIncludeLocation] = useState(true);
  const [includeDiscipline, setIncludeDiscipline] = useState(true);
  const [includeAttendees, setIncludeAttendees] = useState(true);
  const [includeEventLink, setIncludeEventLink] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  // Determine active registrations based on filterOption
  const activeList = useMemo(() => {
    if (filterOption === 'all') return registrations;
    if (filterOption === 'filtered') return filteredRegistrations;
    // Default: 'attending'
    return registrations.filter((r) => r.attendance_status === 'yes');
  }, [filterOption, registrations, filteredRegistrations]);

  // Aggregate stats
  const listStats = useMemo(() => {
    const totalCount = activeList.length;
    const totalAttendees = activeList.reduce(
      (sum, r) => sum + (r.number_of_attendees || 1),
      0
    );
    const batches = activeList
      .map((r) => r.alumni?.year_of_passing)
      .filter((y): y is number => Boolean(y))
      .sort((a, b) => a - b);

    const minBatch = batches.length > 0 ? batches[0] : null;
    const maxBatch = batches.length > 0 ? batches[batches.length - 1] : null;

    return { totalCount, totalAttendees, minBatch, maxBatch };
  }, [activeList]);

  // Format attendee string for an alumnus
  const formatAttendeeDetail = (reg: EventRegistration): string => {
    const total = reg.number_of_attendees || 1;
    if (total <= 1) {
      return '1 (Self)';
    }

    const adults = reg.adults_count ?? total;
    const kids7Plus = reg.children_above_7_count ?? 0;
    const kidsUnder7 = reg.children_under_7_count ?? 0;

    const parts: string[] = [];
    if (adults > 0) parts.push(`${adults} Adults`);
    if (kids7Plus > 0) parts.push(`${kids7Plus} Kids (10+)`);
    if (kidsUnder7 > 0) parts.push(`${kidsUnder7} Kids (<10)`);

    if (parts.length > 1) {
      return `${total} Total (${parts.join(', ')})`;
    }
    return `${total} Total (Self + ${total - 1} accompanying)`;
  };

  // Generate the formatted WhatsApp message
  const generatedMessage = useMemo(() => {
    const eventName = event?.event_name || 'ECK-RTU Alumni DeepAura 2K26';
    const eventDate = event?.event_date || '01 Nov 2026';
    const eventVenue = event?.location || 'ECK Campus, Kota';
    const websiteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://eck-alumni.org';

    const lines: string[] = [];

    // Festive Header
    lines.push(`🪔✨ *${eventName.toUpperCase()}* ✨🪔`);
    lines.push('🏛️ *Organised By:* ECK-RTU Alumni Kota Chapter');
    lines.push('✨ *“दीप जले, यादें मुस्कुराएँ।”*');
    lines.push('🎉 *Registered Alumni & Attendees List* 🎉');
    lines.push('');
    lines.push('Dear ECK-RTU Alumni & Friends,');
    lines.push('The celebration is getting bigger and brighter! 🪔 Here is the latest list of our enthusiastic alumni who have registered for ECK-RTU Alumni DeepAura 2K26:');
    lines.push('');

    // Summary Highlights
    lines.push('━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`✨ *Total Alumni Registered:* ${listStats.totalCount}`);
    lines.push(`👥 *Total Gathering (with family):* ${listStats.totalAttendees} members`);
    if (listStats.minBatch && listStats.maxBatch) {
      if (listStats.minBatch === listStats.maxBatch) {
        lines.push(`🎓 *Batch Represented:* Class of ${listStats.minBatch}`);
      } else {
        lines.push(`🎓 *Batches Represented:* ${listStats.minBatch} to ${listStats.maxBatch}`);
      }
    }
    lines.push('━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');

    if (activeList.length === 0) {
      lines.push('*(No registrations found for this filter)*');
    } else if (groupOption === 'grouped') {
      // Group by Batch / Year of Passing
      const groupedByYear = new Map<number, EventRegistration[]>();
      const noYearList: EventRegistration[] = [];

      activeList.forEach((reg) => {
        const year = reg.alumni?.year_of_passing;
        if (year) {
          const arr = groupedByYear.get(year) || [];
          arr.push(reg);
          groupedByYear.set(year, arr);
        } else {
          noYearList.push(reg);
        }
      });

      // Sort batches ascending
      const sortedYears = Array.from(groupedByYear.keys()).sort((a, b) => a - b);

      sortedYears.forEach((year) => {
        const batchRegs = groupedByYear.get(year) || [];
        lines.push(`🎓 *BATCH OF ${year}* (${batchRegs.length})`);

        batchRegs.forEach((reg) => {
          const name = reg.alumni?.name || 'Alumnus';
          const discipline = includeDiscipline && reg.alumni?.engineering_discipline ? ` • ${reg.alumni.engineering_discipline}` : '';
          const location = includeLocation && reg.alumni?.city ? `📍 ${reg.alumni.city}${reg.alumni?.state ? `, ${reg.alumni.state}` : ''}` : '';
          const attendees = includeAttendees ? `👥 ${formatAttendeeDetail(reg)}` : '';

          lines.push(`  • *${name}*${discipline}`);
          if (location && attendees) {
            lines.push(`    ${location} | ${attendees}`);
          } else if (location) {
            lines.push(`    ${location}`);
          } else if (attendees) {
            lines.push(`    ${attendees}`);
          }
        });
        lines.push('');
      });

      if (noYearList.length > 0) {
        lines.push(`🎓 *OTHER BATCHES* (${noYearList.length})`);
        noYearList.forEach((reg) => {
          const name = reg.alumni?.name || 'Alumnus';
          const discipline = includeDiscipline && reg.alumni?.engineering_discipline ? ` • ${reg.alumni.engineering_discipline}` : '';
          const location = includeLocation && reg.alumni?.city ? `📍 ${reg.alumni.city}${reg.alumni?.state ? `, ${reg.alumni.state}` : ''}` : '';
          const attendees = includeAttendees ? `👥 ${formatAttendeeDetail(reg)}` : '';

          lines.push(`  • *${name}*${discipline}`);
          if (location && attendees) {
            lines.push(`    ${location} | ${attendees}`);
          } else if (location) {
            lines.push(`    ${location}`);
          } else if (attendees) {
            lines.push(`    ${attendees}`);
          }
        });
        lines.push('');
      }
    } else if (groupOption === 'compact') {
      // Compact one-liner list
      activeList.forEach((reg, idx) => {
        const name = reg.alumni?.name || 'Alumnus';
        const year = reg.alumni?.year_of_passing ? `'${String(reg.alumni.year_of_passing).slice(-2)}` : '';
        const disc = includeDiscipline && reg.alumni?.engineering_discipline ? ` (${reg.alumni.engineering_discipline})` : '';
        const loc = includeLocation && reg.alumni?.city ? ` - ${reg.alumni.city}` : '';
        const att = includeAttendees ? ` [👥 ${reg.number_of_attendees || 1}]` : '';

        lines.push(`${idx + 1}. *${name}* ${year ? `(${year})` : ''}${disc}${loc}${att}`);
      });
      lines.push('');
    } else {
      // Numbered sequential list
      activeList.forEach((reg, idx) => {
        const name = reg.alumni?.name || 'Alumnus';
        const batch = reg.alumni?.year_of_passing ? `Batch ${reg.alumni.year_of_passing}` : '';
        const disc = includeDiscipline && reg.alumni?.engineering_discipline ? reg.alumni.engineering_discipline : '';
        const batchDisc = [batch, disc].filter(Boolean).join(' • ');

        lines.push(`${idx + 1}. *${name}* ${batchDisc ? `(${batchDisc})` : ''}`);

        const loc = includeLocation && reg.alumni?.city ? `📍 ${reg.alumni.city}${reg.alumni?.state ? `, ${reg.alumni.state}` : ''}` : '';
        const att = includeAttendees ? `👥 ${formatAttendeeDetail(reg)}` : '';

        if (loc && att) {
          lines.push(`   ${loc} | ${att}`);
        } else if (loc) {
          lines.push(`   ${loc}`);
        } else if (att) {
          lines.push(`   ${att}`);
        }
      });
      lines.push('');
    }

    // Festive Outro & Event Details
    lines.push('━━━━━━━━━━━━━━━━━━━━━');
    lines.push('🪔 *“दीप जले, यादें मुस्कुराएँ।” Let’s illuminate this reunion together!*');
    lines.push(`📅 *Date:* ${eventDate}`);
    lines.push(`📍 *Venue:* ${eventVenue}`);
    if (includeEventLink) {
      lines.push(`🔗 *Register / Update Details:* ${websiteUrl}`);
    }
    lines.push('✨ *See you all at ECK-RTU Alumni DeepAura 2K26! Shubh Deepawali!* ✨🪔');

    return lines.join('\n');
  }, [
    activeList,
    listStats,
    event,
    groupOption,
    includeLocation,
    includeDiscipline,
    includeAttendees,
    includeEventLink,
  ]);

  if (!isOpen) return null;

  const characterCount = generatedMessage.length;
  const isLargeMessage = characterCount > 2500;

  // Determine if device is mobile
  const isMobile =
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(generatedMessage);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = generatedMessage;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setShareStatus('Copied to clipboard! Ready to paste into WhatsApp.');
      setTimeout(() => {
        setCopied(false);
        setShareStatus(null);
      }, 3000);
    } catch (err) {
      console.error('Failed to copy message:', err);
      setShareStatus('Failed to copy. Please select and copy manually.');
    }
  };

  // Open WhatsApp directly
  const handleOpenWhatsApp = () => {
    const encoded = encodeURIComponent(generatedMessage);

    if (isMobile) {
      // On mobile devices, whatsapp:// protocol launches the native app immediately
      // If it fails or isn't handled, fallback to standard https api
      const appUrl = `whatsapp://send?text=${encoded}`;
      const webFallback = `https://api.whatsapp.com/send?text=${encoded}`;

      // Open mobile app directly
      window.open(appUrl, '_self');

      // Fallback timer in case the protocol didn't launch
      setTimeout(() => {
        window.open(webFallback, '_blank');
      }, 700);
    } else {
      // On desktop / laptop, open WhatsApp Web
      const webUrl = `https://web.whatsapp.com/send?text=${encoded}`;
      window.open(webUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Mobile Native OS Share (Web Share API)
  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'ECK-RTU Alumni DeepAura 2K26 - Attendees',
          text: generatedMessage,
        });
        setShareStatus('Shared successfully!');
        setTimeout(() => setShareStatus(null), 2500);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error sharing:', err);
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-content share-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="share-header-title-box">
            <span className="share-diwali-badge">🪔 WhatsApp Broadcast</span>
            <h2 className="modal-title">Share Attendee List</h2>
            <p className="share-header-subtitle">
              Format and forward confirmed alumni &amp; accompanying guests to WhatsApp groups with festive Diwali greetings.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close share modal"
          >
            ✕
          </button>
        </div>

        <div className="modal-body share-modal-body">
          {/* Controls & Filter Bar */}
          <div className="share-controls-card">
            {/* Filter selection */}
            <div className="share-control-group">
              <label className="share-control-label">Select Attendees:</label>
              <div className="share-pill-group">
                <button
                  type="button"
                  className={`share-pill-btn ${filterOption === 'attending' ? 'active' : ''}`}
                  onClick={() => setFilterOption('attending')}
                >
                  Confirmed Attending ({registrations.filter((r) => r.attendance_status === 'yes').length})
                </button>
                <button
                  type="button"
                  className={`share-pill-btn ${filterOption === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterOption('all')}
                >
                  All Registered ({registrations.length})
                </button>
                {filteredRegistrations.length !== registrations.length && (
                  <button
                    type="button"
                    className={`share-pill-btn ${filterOption === 'filtered' ? 'active' : ''}`}
                    onClick={() => setFilterOption('filtered')}
                  >
                    Current Table Filter ({filteredRegistrations.length})
                  </button>
                )}
              </div>
            </div>

            {/* Layout Style */}
            <div className="share-control-group">
              <label className="share-control-label">Message Layout Style:</label>
              <div className="share-pill-group">
                <button
                  type="button"
                  className={`share-pill-btn ${groupOption === 'grouped' ? 'active' : ''}`}
                  onClick={() => setGroupOption('grouped')}
                  title="Group members by passing year"
                >
                  🎓 Group by Batch / Year
                </button>
                <button
                  type="button"
                  className={`share-pill-btn ${groupOption === 'numbered' ? 'active' : ''}`}
                  onClick={() => setGroupOption('numbered')}
                  title="1, 2, 3 ordered list"
                >
                  🔢 Numbered List
                </button>
                <button
                  type="button"
                  className={`share-pill-btn ${groupOption === 'compact' ? 'active' : ''}`}
                  onClick={() => setGroupOption('compact')}
                  title="Compact format for very large groups"
                >
                  ⚡ Compact One-Liners
                </button>
              </div>
            </div>

            {/* Field Toggles */}
            <div className="share-control-group">
              <label className="share-control-label">Include in Message:</label>
              <div className="share-checkboxes-grid">
                <label className="share-checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeLocation}
                    onChange={(e) => setIncludeLocation(e.target.checked)}
                    className="share-checkbox"
                  />
                  <span>📍 City &amp; State</span>
                </label>
                <label className="share-checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeDiscipline}
                    onChange={(e) => setIncludeDiscipline(e.target.checked)}
                    className="share-checkbox"
                  />
                  <span>⚙️ Branch / Discipline</span>
                </label>
                <label className="share-checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeAttendees}
                    onChange={(e) => setIncludeAttendees(e.target.checked)}
                    className="share-checkbox"
                  />
                  <span>👥 Accompanying Count</span>
                </label>
                <label className="share-checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeEventLink}
                    onChange={(e) => setIncludeEventLink(e.target.checked)}
                    className="share-checkbox"
                  />
                  <span>🔗 Registration Link</span>
                </label>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="share-metrics-strip">
            <div className="share-metric-item">
              <span className="share-metric-val">{listStats.totalCount}</span>
              <span className="share-metric-lbl">Alumni</span>
            </div>
            <div className="share-metric-item">
              <span className="share-metric-val">{listStats.totalAttendees}</span>
              <span className="share-metric-lbl">Total People</span>
            </div>
            <div className="share-metric-item">
              <span className="share-metric-val">
                {listStats.minBatch && listStats.maxBatch
                  ? `${listStats.minBatch} - ${listStats.maxBatch}`
                  : '—'}
              </span>
              <span className="share-metric-lbl">Batches</span>
            </div>
            <div className="share-metric-item">
              <span className="share-metric-val">{characterCount}</span>
              <span className="share-metric-lbl">Characters</span>
            </div>
          </div>

          {/* Large message recommendation notice */}
          {isLargeMessage && (
            <div className="share-alert-notice">
              <span className="alert-icon">💡</span>
              <div className="alert-text">
                <strong>Pro-Tip for large lists:</strong> Because this message is {characterCount} characters long, WhatsApp URL links may sometimes truncate on some mobile browsers. Use <strong>"📋 Copy Message"</strong> and paste directly into WhatsApp for 100% complete text!
              </div>
            </div>
          )}

          {/* Status Toast */}
          {shareStatus && (
            <div className="share-toast-notification">
              ✨ {shareStatus}
            </div>
          )}

          {/* Live Message Preview */}
          <div className="share-preview-container">
            <div className="share-preview-header">
              <span className="preview-label">
                📱 Message Preview (WhatsApp Markdown)
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="btn-preview-copy"
                title="Copy text"
              >
                {copied ? '✓ Copied!' : '📋 Copy Text'}
              </button>
            </div>
            <pre className="share-preview-box">{generatedMessage}</pre>
          </div>
        </div>

        {/* Modal Footer / Sticky Actions (Mobile First) */}
        <div className="modal-footer share-modal-footer">
          <div className="share-footer-actions">
            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              className={`btn btn-secondary share-action-btn ${copied ? 'btn-copied' : ''}`}
            >
              {copied ? '✓ Copied to Clipboard!' : '📋 Copy Full Message'}
            </button>

            {/* Direct WhatsApp Share */}
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="btn btn-whatsapp-primary share-action-btn"
            >
              <span className="whatsapp-icon">💬</span>
              {isMobile ? 'Open in WhatsApp App' : 'Share on WhatsApp Web'}
            </button>

            {/* Mobile Native OS Share (if supported) */}
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="btn btn-ghost share-action-btn"
                title="Share via other mobile apps"
              >
                📤 More Share Options
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
