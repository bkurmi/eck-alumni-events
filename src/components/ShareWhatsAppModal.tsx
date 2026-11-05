import React, { useState, useMemo } from 'react';
import type { EventRegistration, ECKEvent } from '../types';
import { X, Copy, Check, MessageCircle, Share2 } from 'lucide-react';

interface ShareWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  registrations: EventRegistration[];
  filteredRegistrations: EventRegistration[];
  event?: ECKEvent | null;
}

type FilterOption = 'attending' | 'all' | 'filtered';
type GroupOption = 'grouped' | 'numbered' | 'compact';
type SortOption = 'first_registered' | 'latest_registered';

export const ShareWhatsAppModal: React.FC<ShareWhatsAppModalProps> = ({
  isOpen,
  onClose,
  registrations,
  filteredRegistrations,
  event,
}) => {
  const eventName = event?.event_name || 'ECK-RTU Alumni Event';
  const [filterOption, setFilterOption] = useState<FilterOption>('attending');
  const [groupOption, setGroupOption] = useState<GroupOption>('grouped');
  const [sortOrder, setSortOrder] = useState<SortOption>('latest_registered');
  const [includeLocation, setIncludeLocation] = useState(true);
  const [includeDiscipline, setIncludeDiscipline] = useState(true);
  const [includeAttendees, setIncludeAttendees] = useState(true);
  const [includeRegNumber, setIncludeRegNumber] = useState(false);
  const [includeEventLink, setIncludeEventLink] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  // Helper to compare registrations in chronological order (earliest/first registration comes first)
  const compareFirstRegistered = (a: EventRegistration, b: EventRegistration): number => {
    const matchA = (a.registration_number || '').match(/\d+/);
    const matchB = (b.registration_number || '').match(/\d+/);
    if (matchA && matchB) {
      const numA = parseInt(matchA[0], 10);
      const numB = parseInt(matchB[0], 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numA - numB;
      }
    }

    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (timeA && timeB && timeA !== timeB) {
      return timeA - timeB;
    }

    return (a.registration_number || a.id || '').localeCompare(
      b.registration_number || b.id || '',
      undefined,
      { numeric: true }
    );
  };

  // Determine active registrations based on filterOption and sortOrder
  const activeList = useMemo(() => {
    let list: EventRegistration[] = [];
    if (filterOption === 'all') {
      list = [...registrations];
    } else if (filterOption === 'filtered') {
      list = [...filteredRegistrations];
    } else {
      list = registrations.filter((r) => r.attendance_status === 'yes');
    }

    return list.sort((a, b) => {
      if (sortOrder === 'first_registered') {
        return compareFirstRegistered(a, b);
      } else {
        return compareFirstRegistered(b, a);
      }
    });
  }, [filterOption, registrations, filteredRegistrations, sortOrder]);

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

  // Generate WhatsApp formatted text
  const generatedMessage = useMemo(() => {
    const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://eck-alumni.org';
    const lines: string[] = [];

    lines.push('🪔✨ *ECK-RTU Alumni DeepAura 2K26* ✨🪔');
    lines.push('✨✨ *दीप जले, यादें मुस्कुराएँ।* ✨✨');
    lines.push('');
    lines.push(`📢 *Confirmed Attendee List (${listStats.totalCount} Alumni • ${listStats.totalAttendees} Total Attendees)*`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');

    if (groupOption === 'grouped') {
      const batchMap = new Map<string, EventRegistration[]>();
      activeList.forEach((r) => {
        const batchKey = r.alumni?.year_of_passing ? `Class of ${r.alumni.year_of_passing}` : 'Distinguished Alumni / Faculty';
        const arr = batchMap.get(batchKey) || [];
        arr.push(r);
        batchMap.set(batchKey, arr);
      });

      const sortedBatches = Array.from(batchMap.keys()).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 9999;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 9999;
        return numA - numB;
      });

      sortedBatches.forEach((batch) => {
        const members = batchMap.get(batch) || [];
        lines.push('');
        lines.push(`🎓 *${batch}* (${members.length})`);

        members.forEach((r, idx) => {
          const a = r.alumni;
          const name = a?.name ? `*${a.name}*` : '*Alumnus*';
          const parts: string[] = [name];

          if (includeDiscipline && a?.engineering_discipline) {
            parts.push(`_${a.engineering_discipline}_`);
          }
          if (includeLocation && a?.city) {
            parts.push(`📍 ${a.city}${a.state ? `, ${a.state}` : ''}`);
          }
          if (includeAttendees && r.number_of_attendees && r.number_of_attendees > 1) {
            parts.push(`👥 (${r.number_of_attendees} persons)`);
          }
          if (includeRegNumber && r.registration_number) {
            parts.push(`🎫 ${r.registration_number}`);
          }

          lines.push(`  ${idx + 1}. ${parts.join(' | ')}`);
        });
      });
    } else if (groupOption === 'numbered') {
      lines.push('');
      activeList.forEach((r, idx) => {
        const a = r.alumni;
        const name = a?.name ? `*${a.name}*` : '*Alumnus*';
        const batch = a?.year_of_passing ? `'${String(a.year_of_passing).slice(-2)}` : '';
        const parts: string[] = [name];

        if (batch) parts.push(`🎓 ${batch}`);
        if (includeDiscipline && a?.engineering_discipline) parts.push(`_${a.engineering_discipline}_`);
        if (includeLocation && a?.city) parts.push(`📍 ${a.city}`);
        if (includeAttendees && r.number_of_attendees && r.number_of_attendees > 1) {
          parts.push(`👥 (${r.number_of_attendees})`);
        }
        if (includeRegNumber && r.registration_number) {
          parts.push(`🎫 ${r.registration_number}`);
        }

        lines.push(`${idx + 1}. ${parts.join(' | ')}`);
      });
    } else {
      lines.push('');
      activeList.forEach((r) => {
        const a = r.alumni;
        const name = a?.name || 'Alumnus';
        const batch = a?.year_of_passing ? `(${a.year_of_passing})` : '';
        const loc = includeLocation && a?.city ? ` • ${a.city}` : '';
        const count = includeAttendees && r.number_of_attendees && r.number_of_attendees > 1 ? ` (+${r.number_of_attendees - 1})` : '';
        lines.push(`• ${name} ${batch}${loc}${count}`);
      });
    }

    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('🎉 Looking forward to seeing everyone at Kota campus!');

    if (includeEventLink) {
      lines.push('');
      lines.push(`🔗 Register / View Passes: ${siteUrl}`);
    }

    return lines.join('\n');
  }, [
    activeList,
    listStats,
    groupOption,
    includeLocation,
    includeDiscipline,
    includeAttendees,
    includeRegNumber,
    includeEventLink,
  ]);

  const characterCount = generatedMessage.length;
  const isLargeMessage = characterCount > 2500;
  const isMobile =
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(generatedMessage);
      } else {
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
      setShareStatus('Message copied to clipboard! Paste directly into WhatsApp.');
      setTimeout(() => setCopied(false), 2500);
      setTimeout(() => setShareStatus(null), 3500);
    } catch (err) {
      console.error('Failed to copy message:', err);
      setShareStatus('Failed to copy. Please select and copy manually.');
    }
  };

  const handleOpenWhatsApp = () => {
    const encoded = encodeURIComponent(generatedMessage);

    if (isMobile) {
      const appUrl = `whatsapp://send?text=${encoded}`;
      const webFallback = `https://api.whatsapp.com/send?text=${encoded}`;
      window.open(appUrl, '_self');
      setTimeout(() => {
        window.open(webFallback, '_blank');
      }, 700);
    } else {
      const webUrl = `https://web.whatsapp.com/send?text=${encoded}`;
      window.open(webUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${eventName} - Attendees`,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="w-full max-w-2xl bg-slate-900 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
              🪔 WhatsApp Broadcast
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Share Attendee List</h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-lg">
              Format and forward confirmed alumni &amp; accompanying guests to WhatsApp groups with festive Diwali greetings.
            </p>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            onClick={onClose}
            aria-label="Close share modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Controls & Filter Bar */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3.5">
            {/* Filter selection */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">Select Attendees:</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    filterOption === 'attending'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
                  }`}
                  onClick={() => setFilterOption('attending')}
                >
                  Confirmed Attending ({registrations.filter((r) => r.attendance_status === 'yes').length})
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    filterOption === 'all'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
                  }`}
                  onClick={() => setFilterOption('all')}
                >
                  All Registered ({registrations.length})
                </button>
                {filteredRegistrations.length !== registrations.length && (
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      filterOption === 'filtered'
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
                    }`}
                    onClick={() => setFilterOption('filtered')}
                  >
                    Current Table Filter ({filteredRegistrations.length})
                  </button>
                )}
              </div>
            </div>

            {/* Layout Style */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">Message Layout Style:</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    groupOption === 'grouped'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
                  }`}
                  onClick={() => setGroupOption('grouped')}
                  title="Group members by passing year"
                >
                  🎓 Group by Batch / Year
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    groupOption === 'numbered'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
                  }`}
                  onClick={() => setGroupOption('numbered')}
                  title="1, 2, 3 ordered list"
                >
                  🔢 Numbered List
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    groupOption === 'compact'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
                  }`}
                  onClick={() => setGroupOption('compact')}
                  title="Compact format for very large groups"
                >
                  ⚡ Compact One-Liners
                </button>
              </div>
            </div>

            {/* Order of Registrations */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">Order of Registrations:</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    sortOrder === 'first_registered'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
                  }`}
                  onClick={() => setSortOrder('first_registered')}
                  title="First registered person comes first (#1, #2...)"
                >
                  ⏳ First Registered First
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    sortOrder === 'latest_registered'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
                  }`}
                  onClick={() => setSortOrder('latest_registered')}
                  title="Most recently registered person comes first"
                >
                  🆕 Latest Registered First
                </button>
              </div>
            </div>

            {/* Field Toggles */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">Include in Message:</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeLocation}
                    onChange={(e) => setIncludeLocation(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span>📍 City &amp; State</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeDiscipline}
                    onChange={(e) => setIncludeDiscipline(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span>⚙️ Branch / Discipline</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeAttendees}
                    onChange={(e) => setIncludeAttendees(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span>👥 Accompanying Count</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeRegNumber}
                    onChange={(e) => setIncludeRegNumber(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span>🎫 Registration ID</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeEventLink}
                    onChange={(e) => setIncludeEventLink(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span>🔗 Registration Link</span>
                </label>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-base font-bold text-white block">{listStats.totalCount}</span>
              <span className="text-[11px] text-slate-400 block uppercase">Alumni</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-base font-bold text-emerald-400 block">{listStats.totalAttendees}</span>
              <span className="text-[11px] text-slate-400 block uppercase">Total People</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-base font-bold text-amber-300 block">
                {listStats.minBatch && listStats.maxBatch ? `${listStats.minBatch} - ${listStats.maxBatch}` : '—'}
              </span>
              <span className="text-[11px] text-slate-400 block uppercase">Batches</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-base font-bold text-slate-300 block">{characterCount}</span>
              <span className="text-[11px] text-slate-400 block uppercase">Characters</span>
            </div>
          </div>

          {/* Large message recommendation notice */}
          {isLargeMessage && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs leading-relaxed">
              💡 <strong>Pro-Tip for large lists:</strong> Because this message is {characterCount} characters long, WhatsApp URL links may sometimes truncate on some mobile browsers. Use <strong>"📋 Copy Full Message"</strong> and paste directly into WhatsApp for 100% complete text!
            </div>
          )}

          {/* Status Toast */}
          {shareStatus && (
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-semibold text-center">
              ✨ {shareStatus}
            </div>
          )}

          {/* Live Message Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                📱 Message Preview (WhatsApp Markdown)
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs text-amber-400 hover:underline font-semibold cursor-pointer flex items-center gap-1"
                title="Copy text"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Text'}</span>
              </button>
            </div>
            <pre className="w-full p-3 bg-slate-950/90 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 overflow-x-auto max-h-48 whitespace-pre-wrap select-all">
              {generatedMessage}
            </pre>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-95"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Full Message'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-green-600 hover:from-emerald-600 hover:to-green-500 text-white font-bold text-sm shadow-md shadow-emerald-950/40 flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-95"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{isMobile ? 'Open in WhatsApp App' : 'Share on WhatsApp Web'}</span>
            </button>

            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
                title="Share via other mobile apps"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
