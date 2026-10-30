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

  // Filter feedback
  const filteredList = useMemo(() => {
    return feedbackList.filter((item) => {
      // Rating filter
      if (ratingFilter === '5' && item.event_rating !== 5) return false;
      if (ratingFilter === '4' && item.event_rating !== 4) return false;
      if (ratingFilter === 'critical' && (item.event_rating || 5) > 3) return false;

      // Search query
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
      'Registration Number',
      'Attendee Name',
      'Batch',
      'Anonymous',
      'Event Rating (1-5)',
      'Portal Rating (1-5)',
      'Overall Mood',
      'Venue Rating',
      'Reconnect Feelings',
      'Favourite Parts',
      'Event Improvements',
      'Gate Pass Easy?',
      'Portal Made Process Easier?',
      'Portal Improvements',
      'After DeepAura I Feel',
      'Next Reunion Wishes',
      'Stay Connected?',
    ];

    const rows = feedbackList.map((item) => {
      const r = item.responses || {};
      const favParts = Array.isArray(r.favourite_parts)
        ? r.favourite_parts.join(', ')
        : r.favourite_parts || '';

      return [
        item.created_at ? new Date(item.created_at).toLocaleString() : '',
        item.registration_number || '',
        item.is_anonymous ? 'Anonymous' : item.attendee_name || 'N/A',
        item.batch || 'N/A',
        item.is_anonymous ? 'Yes' : 'No',
        item.event_rating,
        item.portal_rating,
        r.overall_experience || '',
        r.venue_arrangement || '',
        r.reconnecting_buddies || '',
        `"${favParts.replace(/"/g, '""')}"`,
        `"${(r.event_improvements || '').replace(/"/g, '""')}"`,
        r.gate_pass_easy || '',
        r.portal_ease || '',
        `"${(r.portal_improvements || '').replace(/"/g, '""')}"`,
        `"${(r.after_deepaura_feeling || '').replace(/"/g, '""')}"`,
        `"${(r.next_reunion_wish || '').replace(/"/g, '""')}"`,
        r.stay_connected || '',
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `${eventName.toLowerCase().replace(/\s+/g, '_')}_feedback_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const favoritePartLabels: Record<string, string> = {
    friends: '🤝 Meeting old friends',
    memories: '📸 Reliving college memories',
    music: '🎵 Music & entertainment',
    faculty: '🎓 Meeting faculty & batchmates',
    food: '🍲 Food & refreshments',
    everything: '✨ Everything was magical!',
  };

  return (
    <div className="feedback-manager-wrapper" style={{ padding: '0.5rem 0' }}>
      {/* Top Action Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
            ❤️ {eventName} Experience &amp; Feedback Hub
          </h2>
          <p style={{ fontSize: '0.8125rem', color: '#94a3b8', margin: '0.25rem 0 0 0' }}>
            Real-time insights from alumni attending {eventName}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleShareCommitteeReport}
            disabled={feedbackList.length === 0}
            className="btn btn-whatsapp-primary btn-sm"
            style={{
              minHeight: '40px',
              padding: '0.5rem 1rem',
              fontSize: '0.8125rem',
              fontWeight: 700,
              opacity: feedbackList.length === 0 ? 0.6 : 1,
              cursor: feedbackList.length === 0 ? 'not-allowed' : 'pointer',
            }}
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
            className="btn-secondary"
            style={{ minHeight: '40px', padding: '0.5rem 0.875rem', fontSize: '0.8125rem' }}
          >
            🔄 Refresh
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={feedbackList.length === 0}
            className="btn-festive-primary"
            style={{
              minHeight: '40px',
              padding: '0.5rem 1rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
            }}
          >
            📥 Export CSV ({feedbackList.length})
          </button>
        </div>
      </div>

      {/* Share Toast Feedback */}
      {shareStatus && (
        <div
          style={{
            padding: '0.5rem 0.875rem',
            borderRadius: '0.5rem',
            background: 'rgba(34, 197, 94, 0.15)',
            border: '1px solid rgba(34, 197, 94, 0.35)',
            color: '#4ade80',
            fontSize: '0.8125rem',
            fontWeight: 600,
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>✨</span>
          <span>{shareStatus}</span>
        </div>
      )}

      {/* KPI Cards Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.875rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '1rem',
            padding: '1rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
            TOTAL RESPONSES
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.25rem' }}>
            {stats.totalCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '0.25rem' }}>
            ⚡ 2-min survey
          </div>
        </div>

        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '1rem',
            padding: '1rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 600 }}>
            EVENT RATING
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fbbf24', marginTop: '0.25rem' }}>
            ⭐ {stats.avgEventRating || 0} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>/ 5</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
            Venue &amp; arrangements
          </div>
        </div>

        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(96, 165, 250, 0.25)',
            borderRadius: '1rem',
            padding: '1rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 600 }}>
            PORTAL RATING
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#60a5fa', marginTop: '0.25rem' }}>
            💻 {stats.avgPortalRating || 0} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>/ 5</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
            Registration &amp; pass flow
          </div>
        </div>

        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
            borderRadius: '1rem',
            padding: '1rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 600 }}>
            PORTAL SIMPLICITY
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#4ade80', marginTop: '0.25rem' }}>
            {stats.totalCount > 0
              ? `${Math.round(
                (((stats.portalEaseBreakdown['much_easier'] || 0) +
                  (stats.portalEaseBreakdown['smooth'] || 0)) /
                  stats.totalCount) *
                100
              )}%`
              : '0%'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
            Found portal easier
          </div>
        </div>
      </div>

      {/* Visual Breakdowns: Highlights */}
      {stats.totalCount > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          {/* Favorite Parts */}
          <div
            style={{
              background: 'rgba(17, 20, 37, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '1rem',
              padding: '1.25rem',
            }}
          >
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.875rem 0' }}>
              🎉 What Alumni Loved Most
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {Object.entries(stats.favoritePartsBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([key, count]) => {
                  const pct = Math.round((count / stats.totalCount) * 100);
                  const label = favoritePartLabels[key] || key;
                  return (
                    <div key={key}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.75rem',
                          color: '#e2e8f0',
                          marginBottom: '0.25rem',
                        }}
                      >
                        <span>{label}</span>
                        <span style={{ fontWeight: 700, color: '#fbbf24' }}>
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div
                        style={{
                          width: '100%',
                          height: '6px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          borderRadius: '9999px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                            borderRadius: '9999px',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Expressive Feelings Preview */}
          <div
            style={{
              background: 'rgba(17, 20, 37, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '1rem',
              padding: '1.25rem',
            }}
          >
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.875rem 0' }}>
              ❤️ "After DeepAura, I feel..."
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', maxHeight: '200px', overflowY: 'auto' }}>
              {stats.recentFeelings.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>
                  Awaiting responses...
                </p>
              ) : (
                stats.recentFeelings.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'rgba(245, 158, 11, 0.08)',
                      borderLeft: '3px solid #fbbf24',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0 0.5rem 0.5rem 0',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: '#f8fafc', fontStyle: 'italic' }}>
                      “{f.text}”
                    </p>
                    <span style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: '0.25rem', display: 'block' }}>
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
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)',
          padding: '0.875rem 1rem',
          borderRadius: '0.875rem',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          marginBottom: '1rem',
        }}
      >
        <div style={{ flex: '1', minWidth: '220px' }}>
          <input
            type="text"
            placeholder="Search alumni name, batch, reg number, or suggestions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              minHeight: '40px',
              padding: '0.5rem 0.875rem',
              fontSize: '16px',
              background: 'rgba(10, 12, 22, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '0.625rem',
              color: '#ffffff',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          {(['all', '5', '4', 'critical'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRatingFilter(mode)}
              style={{
                minHeight: '38px',
                padding: '0.375rem 0.75rem',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                border:
                  ratingFilter === mode
                    ? '1px solid #fbbf24'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                background:
                  ratingFilter === mode ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                color: ratingFilter === mode ? '#fbbf24' : '#cbd5e1',
                cursor: 'pointer',
              }}
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

      {/* Responses Feed / Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          🔄 Loading attendee feedback...
        </div>
      ) : filteredList.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '1rem',
            border: '1px dashed rgba(255, 255, 255, 0.1)',
            color: '#94a3b8',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
          <div style={{ fontWeight: 600, color: '#f8fafc' }}>No feedback submissions found</div>
          <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
            Share the{' '}
            <a href="/feedback" target="_blank" rel="noreferrer" style={{ color: '#fbbf24', textDecoration: 'underline' }}>
              /feedback
            </a>{' '}
            link or QR code with attendees during the closing ceremony!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {filteredList.map((item) => {
            const r = item.responses || {};
            return (
              <div
                key={item.id}
                style={{
                  background: 'rgba(17, 20, 37, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '1rem',
                  padding: '1.125rem 1.25rem',
                }}
              >
                {/* Header row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.9375rem' }}>
                      {item.is_anonymous ? '🕵️ Anonymous Alumnus' : item.attendee_name || 'Alumnus'}
                    </span>
                    {item.batch && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.125rem 0.5rem',
                          background: 'rgba(255, 255, 255, 0.06)',
                          borderRadius: '9999px',
                          color: '#94a3b8',
                        }}
                      >
                        Batch {item.batch}
                      </span>
                    )}
                    {item.registration_number && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.125rem 0.5rem',
                          background: 'rgba(245, 158, 11, 0.12)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          borderRadius: '9999px',
                          color: '#fbbf24',
                          fontWeight: 600,
                        }}
                      >
                        {item.registration_number}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.8125rem', color: '#fbbf24', fontWeight: 700 }}>
                      ⭐ Event: {item.event_rating}/5
                    </span>
                    <span style={{ fontSize: '0.8125rem', color: '#60a5fa', fontWeight: 700 }}>
                      💻 Portal: {item.portal_rating}/5
                    </span>
                    {item.created_at && (
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sentiments & Expressions */}
                {r.after_deepaura_feeling && (
                  <div
                    style={{
                      background: 'rgba(245, 158, 11, 0.07)',
                      borderLeft: '3px solid #fbbf24',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0 0.5rem 0.5rem 0',
                      fontSize: '0.8125rem',
                      color: '#f8fafc',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <strong style={{ color: '#fbbf24' }}>❤️ After DeepAura, I feel: </strong>
                    <em>“{r.after_deepaura_feeling}”</em>
                  </div>
                )}

                {r.event_improvements && (
                  <div
                    style={{
                      background: 'rgba(249, 115, 22, 0.07)',
                      borderLeft: '3px solid #f97316',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0 0.5rem 0.5rem 0',
                      fontSize: '0.8125rem',
                      color: '#f8fafc',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <strong style={{ color: '#f97316' }}>🛠️ Event Improvement: </strong>
                    {r.event_improvements}
                  </div>
                )}

                {r.portal_improvements && (
                  <div
                    style={{
                      background: 'rgba(96, 165, 250, 0.07)',
                      borderLeft: '3px solid #60a5fa',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0 0.5rem 0.5rem 0',
                      fontSize: '0.8125rem',
                      color: '#f8fafc',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <strong style={{ color: '#60a5fa' }}>💻 Portal Suggestion: </strong>
                    {r.portal_improvements}
                  </div>
                )}

                {r.next_reunion_wish && (
                  <div
                    style={{
                      background: 'rgba(34, 197, 94, 0.07)',
                      borderLeft: '3px solid #22c55e',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0 0.5rem 0.5rem 0',
                      fontSize: '0.8125rem',
                      color: '#f8fafc',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <strong style={{ color: '#22c55e' }}>✨ Next Reunion Wish: </strong>
                    {r.next_reunion_wish}
                  </div>
                )}

                {/* Tags / chips summary */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.5rem' }}>
                  {r.portal_ease && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.125rem 0.5rem',
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.25)',
                        borderRadius: '0.375rem',
                        color: '#4ade80',
                      }}
                    >
                      🚀 Portal: {r.portal_ease === 'much_easier' ? 'Much Easier' : r.portal_ease}
                    </span>
                  )}
                  {r.gate_pass_easy && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.125rem 0.5rem',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '0.375rem',
                        color: '#94a3b8',
                      }}
                    >
                      🎫 Pass Download: {r.gate_pass_easy === 'yes' ? 'Easy' : r.gate_pass_easy}
                    </span>
                  )}
                  {r.stay_connected && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.125rem 0.5rem',
                        background: 'rgba(245, 158, 11, 0.1)',
                        borderRadius: '0.375rem',
                        color: '#fbbf24',
                      }}
                    >
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
