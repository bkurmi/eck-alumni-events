import React, { useState, useEffect, useMemo } from 'react';
import type { EventFeedback } from '../types';
import {
  fetchEventFeedbackList,
  computeFeedbackStats,
  buildFeedbackCommitteeDigestMessage,
  shareToWhatsApp,
} from '../lib/feedback';

interface EventFeedbackManagerProps {
  eventId: string;
  eventName: string;
}

export const EventFeedbackManager: React.FC<EventFeedbackManagerProps> = ({
  eventId,
  eventName,
}) => {
  const [feedbackList, setFeedbackList] = useState<EventFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | '5' | '4' | 'critical'>('all');
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const loadFeedback = async () => {
    setLoading(true);
    const { feedback } = await fetchEventFeedbackList(eventId);
    setFeedbackList(feedback);
    setLoading(false);
  };

  useEffect(() => {
    if (eventId) {
      loadFeedback();
    }
  }, [eventId]);

  const stats = useMemo(() => computeFeedbackStats(feedbackList), [feedbackList]);

  const handleShareCommitteeReport = () => {
    if (feedbackList.length === 0) return;
    const digest = buildFeedbackCommitteeDigestMessage(feedbackList, stats, eventName);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(digest).catch(() => { });
    }
    setShareStatus('Opening WhatsApp & copied report to clipboard!');
    setTimeout(() => setShareStatus(null), 3500);
    shareToWhatsApp(digest);
  };

  // Filter feedback
  const filteredList = useMemo(() => {
    return feedbackList.filter((item) => {
      if (ratingFilter === '5' && item.event_rating !== 5) return false;
      if (ratingFilter === '4' && item.event_rating !== 4) return false;
      if (ratingFilter === 'critical' && (item.event_rating || 5) > 3) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (item.attendee_name || '').toLowerCase().includes(q);
        const batchMatch = (item.batch || '').toLowerCase().includes(q);
        const regNoMatch = (item.registration_number || '').toLowerCase().includes(q);
        const suggestionsMatch = (item.responses?.next_reunion_wish || '')
          .toLowerCase()
          .includes(q);
        const eventImpMatch = (item.responses?.event_improvements || '')
          .toLowerCase()
          .includes(q);
        const portalMatch = (item.responses?.portal_improvements || '')
          .toLowerCase()
          .includes(q);
        const feelingsMatch = (item.responses?.after_deepaura_feeling || '')
          .toLowerCase()
          .includes(q);

        if (
          !nameMatch &&
          !batchMatch &&
          !regNoMatch &&
          !suggestionsMatch &&
          !eventImpMatch &&
          !portalMatch &&
          !feelingsMatch
        ) {
          return false;
        }
      }

      return true;
    });
  }, [feedbackList, ratingFilter, searchQuery]);

  // Export to CSV
  const handleExportCSV = () => {
    if (feedbackList.length === 0) return;

    const headers = [
      'Submitted At',
      'Name',
      'Batch',
      'Reg No',
      'Event Rating (1-5)',
      'Portal Rating (1-5)',
      'Portal Ease',
      'Pass Download Easy',
      'Favorite Parts',
      'Feelings After Reunion',
      'Event Improvements',
      'Portal Improvements',
      'Next Reunion Wishes',
      'Stay Connected',
    ];

    const csvRows = [
      headers.join(','),
      ...feedbackList.map((f) => {
        const r = f.responses || {};
        return [
          `"${f.created_at ? new Date(f.created_at).toLocaleString() : ''}"`,
          `"${f.is_anonymous ? 'Anonymous' : (f.attendee_name || '').replace(/"/g, '""')}"`,
          `"${(f.batch || '').replace(/"/g, '""')}"`,
          `"${(f.registration_number || '').replace(/"/g, '""')}"`,
          f.event_rating || '',
          f.portal_rating || '',
          `"${r.portal_ease || ''}"`,
          `"${r.gate_pass_easy || ''}"`,
          `"${(r.favorite_parts || []).join('; ')}"`,
          `"${(r.after_deepaura_feeling || '').replace(/"/g, '""')}"`,
          `"${(r.event_improvements || '').replace(/"/g, '""')}"`,
          `"${(r.portal_improvements || '').replace(/"/g, '""')}"`,
          `"${(r.next_reunion_wish || '').replace(/"/g, '""')}"`,
          `"${r.stay_connected || ''}"`,
        ].join(',');
      }),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${eventName.replace(/\s+/g, '_')}_Feedback_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const favoritePartLabels: Record<string, string> = {
    nostalgia: '🏛️ Campus Nostalgia & stories',
    music: '🎶 Music & Cultural evening',
    faculty: '🎓 Meeting faculty & batchmates',
    food: '🍲 Food & refreshments',
    everything: '✨ Everything was magical!',
  };

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-black text-white">
            ❤️ {eventName} Experience &amp; Feedback Hub
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time insights from alumni attending {eventName}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleShareCommitteeReport}
            disabled={feedbackList.length === 0}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#025907] via-[#087f10] to-[#0d9616] hover:from-[#036809] hover:via-[#0a8e13] hover:to-[#0fa81a] border border-[#0d9616]/60 text-white text-xs sm:text-sm font-bold shadow-md shadow-green-950/50 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title={
              feedbackList.length === 0
                ? 'No feedback responses received yet to share'
                : 'Share Executive Committee Feedback Digest on WhatsApp'
            }
          >
            💬 Share Report
          </button>
          <button
            type="button"
            onClick={loadFeedback}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            🔄 Refresh
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={feedbackList.length === 0}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold shadow-md shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            📥 Export CSV ({feedbackList.length})
          </button>
        </div>
      </div>

      {/* Share Toast Feedback */}
      {shareStatus && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 text-xs sm:text-sm font-semibold flex items-center gap-2">
          <span>✨</span>
          <span>{shareStatus}</span>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
            Total Responses
          </span>
          <span className="text-xl sm:text-2xl font-black text-white mt-1">
            {stats.totalCount}
          </span>
          <span className="text-[11px] text-amber-400 mt-1 font-medium">
            ⚡ 2-min survey
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 shadow-md flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-bold text-amber-400 uppercase tracking-wider">
            Event Rating
          </span>
          <span className="text-xl sm:text-2xl font-black text-amber-400 mt-1">
            ⭐ {stats.avgEventRating || 0} <span className="text-xs font-normal text-slate-400">/ 5</span>
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Venue &amp; arrangements
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-blue-500/30 shadow-md flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-bold text-blue-400 uppercase tracking-wider">
            Portal Rating
          </span>
          <span className="text-xl sm:text-2xl font-black text-blue-400 mt-1">
            💻 {stats.avgPortalRating || 0} <span className="text-xs font-normal text-slate-400">/ 5</span>
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Registration &amp; pass flow
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-emerald-500/30 shadow-md flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-bold text-emerald-400 uppercase tracking-wider">
            Portal Simplicity
          </span>
          <span className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">
            {stats.totalCount > 0
              ? `${Math.round(
                (((stats.portalEaseBreakdown['much_easier'] || 0) +
                  (stats.portalEaseBreakdown['smooth'] || 0)) /
                  stats.totalCount) *
                100
              )}%`
              : '0%'}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Found portal easier
          </span>
        </div>
      </div>

      {/* Visual Breakdowns: Highlights */}
      {stats.totalCount > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Favorite Parts */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md">
            <h3 className="text-sm font-bold text-white mb-3">
              🎉 What Alumni Loved Most
            </h3>
            <div className="space-y-2.5">
              {Object.entries(stats.favoritePartsBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([key, count]) => {
                  const pct = Math.round((count / stats.totalCount) * 100);
                  const label = favoritePartLabels[key] || key;
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>{label}</span>
                        <span className="font-bold text-amber-400">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Expressive Feelings Preview */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md">
            <h3 className="text-sm font-bold text-white mb-3">
              ❤️ &ldquo;After DeepAura, I feel...&rdquo;
            </h3>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {stats.recentFeelings.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  Awaiting responses...
                </p>
              ) : (
                stats.recentFeelings.map((f, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-r-xl bg-amber-500/10 border-l-2 border-amber-400 text-xs"
                  >
                    <p className="text-slate-200 italic">
                      &ldquo;{f.text}&rdquo;
                    </p>
                    <span className="block text-[11px] text-amber-400 font-semibold mt-1">
                      — {f.name || 'Alumnus'} {f.batch ? `(${f.batch})` : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search alumni name, batch, reg number, or suggestions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-base text-slate-100 placeholder:text-slate-500 outline-none transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', '5', '4', 'critical'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRatingFilter(mode)}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                ratingFilter === mode
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              {mode === 'all'
                ? `All (${feedbackList.length})`
                : mode === '5'
                  ? '⭐ 5 Stars'
                  : mode === '4'
                    ? '⭐ 4 Stars'
                    : '⚠️ < 4 Stars'}
            </button>
          ))}
        </div>
      </div>

      {/* Responses Feed */}
      {loading ? (
        <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
          <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <span className="text-xs">Loading attendee feedback...</span>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="p-8 text-center bg-slate-900/60 rounded-2xl border border-dashed border-slate-800 text-slate-400">
          <div className="text-2xl mb-2">📭</div>
          <div className="font-bold text-slate-300 text-sm">No feedback submissions found</div>
          <p className="text-xs text-slate-500 mt-1">
            Share the{' '}
            <a href="/feedback" target="_blank" rel="noreferrer" className="text-amber-400 underline">
              /feedback
            </a>{' '}
            link or QR code with attendees during the closing ceremony!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((item) => {
            const r = item.responses || {};
            return (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md space-y-2.5"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">
                      {item.is_anonymous ? '🕵️ Anonymous Alumnus' : item.attendee_name || 'Alumnus'}
                    </span>
                    {item.batch && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                        Batch {item.batch}
                      </span>
                    )}
                    {item.registration_number && (
                      <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md">
                        {item.registration_number}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-bold text-amber-400">
                      ⭐ Event: {item.event_rating}/5
                    </span>
                    <span className="font-bold text-blue-400">
                      💻 Portal: {item.portal_rating}/5
                    </span>
                    {item.created_at && (
                      <span className="text-slate-500">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sentiments & Expressions */}
                {r.after_deepaura_feeling && (
                  <div className="p-2.5 rounded-r-xl bg-amber-500/10 border-l-2 border-amber-400 text-xs text-slate-200">
                    <strong className="text-amber-400">❤️ After DeepAura, I feel: </strong>
                    <em>&ldquo;{r.after_deepaura_feeling}&rdquo;</em>
                  </div>
                )}

                {r.event_improvements && (
                  <div className="p-2.5 rounded-r-xl bg-orange-500/10 border-l-2 border-orange-400 text-xs text-slate-200">
                    <strong className="text-orange-400">🛠️ Event Improvement: </strong>
                    {r.event_improvements}
                  </div>
                )}

                {r.portal_improvements && (
                  <div className="p-2.5 rounded-r-xl bg-blue-500/10 border-l-2 border-blue-400 text-xs text-slate-200">
                    <strong className="text-blue-400">💻 Portal Suggestion: </strong>
                    {r.portal_improvements}
                  </div>
                )}

                {r.next_reunion_wish && (
                  <div className="p-2.5 rounded-r-xl bg-emerald-500/10 border-l-2 border-emerald-400 text-xs text-slate-200">
                    <strong className="text-emerald-400">✨ Next Reunion Wish: </strong>
                    {r.next_reunion_wish}
                  </div>
                )}

                {/* Tags / chips summary */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {r.portal_ease && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-medium">
                      🚀 Portal: {r.portal_ease === 'much_easier' ? 'Much Easier' : r.portal_ease}
                    </span>
                  )}
                  {r.gate_pass_easy && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-medium">
                      🎫 Pass Download: {r.gate_pass_easy === 'yes' ? 'Easy' : r.gate_pass_easy}
                    </span>
                  )}
                  {r.stay_connected && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-400 font-medium">
                      🤝 Stay Connected: {r.stay_connected}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
