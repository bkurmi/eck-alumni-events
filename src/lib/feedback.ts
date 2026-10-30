import { supabase } from './supabase';
import type { EventFeedback } from '../types';

export const isFeedbackEnabled = (): boolean => {
  const envVal = import.meta.env.VITE_ENABLE_FEEDBACK;
  // Defaults to false until explicitly set to 'true' (released during closing ceremony / post-event)
  return envVal === 'true' || envVal === true;
};

/**
 * Submit attendee feedback to Supabase
 */
export async function submitEventFeedback(payload: {
  eventId: string;
  registrationId?: string | null;
  registrationNumber?: string | null;
  attendeeName?: string | null;
  batch?: string | null;
  isAnonymous?: boolean;
  eventRating: number;
  portalRating: number;
  responses: Record<string, any>;
}): Promise<{ data: EventFeedback | null; error: string | null }> {
  try {
    const record = {
      event_id: payload.eventId,
      registration_id: payload.isAnonymous ? null : (payload.registrationId || null),
      registration_number: payload.isAnonymous ? null : (payload.registrationNumber || null),
      attendee_name: payload.isAnonymous ? null : (payload.attendeeName || null),
      batch: payload.isAnonymous ? null : (payload.batch || null),
      is_anonymous: !!payload.isAnonymous,
      event_rating: payload.eventRating,
      portal_rating: payload.portalRating,
      responses: payload.responses,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    };

    const { data, error } = await supabase
      .from('event_feedback')
      .insert([record])
      .select()
      .single();

    if (error) {
      console.error('Error inserting feedback to Supabase:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err: any) {
    console.error('Unexpected error submitting feedback:', err);
    return { data: null, error: err.message || 'Submission failed' };
  }
}

/**
 * Fetch all feedback for an event (Admin use)
 */
export async function fetchEventFeedbackList(eventId: string): Promise<{
  feedback: EventFeedback[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('event_feedback')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching event feedback:', error);
      return { feedback: [], error: error.message };
    }

    return { feedback: data || [], error: null };
  } catch (err: any) {
    console.error('Unexpected error fetching feedback:', err);
    return { feedback: [], error: err.message || 'Failed to fetch feedback' };
  }
}

/**
 * Compute aggregate statistics for the event feedback
 */
export interface FeedbackStats {
  totalCount: number;
  avgEventRating: number;
  avgPortalRating: number;
  portalEaseBreakdown: Record<string, number>;
  favoritePartsBreakdown: Record<string, number>;
  recentFeelings: {
    name?: string | null;
    batch?: string | null;
    text: string;
  }[];
  recentNotes: {
    name?: string | null;
    batch?: string | null;
    created_at?: string;
    eventImprovements?: string;
    portalSuggestions?: string;
    nextReunionWish?: string;
  }[];
}

export function computeFeedbackStats(feedbackList: EventFeedback[]): FeedbackStats {
  const totalCount = feedbackList.length;
  if (totalCount === 0) {
    return {
      totalCount: 0,
      avgEventRating: 0,
      avgPortalRating: 0,
      portalEaseBreakdown: {},
      favoritePartsBreakdown: {},
      recentFeelings: [],
      recentNotes: [],
    };
  }

  let totalEventRating = 0;
  let totalPortalRating = 0;
  const portalEaseBreakdown: Record<string, number> = {};
  const favoritePartsBreakdown: Record<string, number> = {};
  const recentFeelings: FeedbackStats['recentFeelings'] = [];
  const recentNotes: FeedbackStats['recentNotes'] = [];

  for (const fb of feedbackList) {
    totalEventRating += fb.event_rating || 0;
    totalPortalRating += fb.portal_rating || 0;

    const res = fb.responses || {};

    // Feelings text-based
    if (res.after_deepaura_feeling && typeof res.after_deepaura_feeling === 'string' && res.after_deepaura_feeling.trim()) {
      recentFeelings.push({
        name: fb.is_anonymous ? 'Anonymous Alumnus' : fb.attendee_name,
        batch: fb.batch,
        text: res.after_deepaura_feeling.trim(),
      });
    }

    // Favorite parts (array or string)
    if (Array.isArray(res.favourite_parts)) {
      for (const part of res.favourite_parts) {
        favoritePartsBreakdown[part] = (favoritePartsBreakdown[part] || 0) + 1;
      }
    } else if (typeof res.favourite_parts === 'string') {
      favoritePartsBreakdown[res.favourite_parts] =
        (favoritePartsBreakdown[res.favourite_parts] || 0) + 1;
    }

    // Portal ease breakdown
    const ease = res.portal_ease;
    if (ease) {
      portalEaseBreakdown[ease] = (portalEaseBreakdown[ease] || 0) + 1;
    }

    // Notes
    if (res.event_improvements || res.portal_improvements || res.next_reunion_wish) {
      recentNotes.push({
        name: fb.is_anonymous ? 'Anonymous Alumnus' : fb.attendee_name,
        batch: fb.batch,
        created_at: fb.created_at,
        eventImprovements: res.event_improvements,
        portalSuggestions: res.portal_improvements,
        nextReunionWish: res.next_reunion_wish,
      });
    }
  }

  return {
    totalCount,
    avgEventRating: Number((totalEventRating / totalCount).toFixed(1)),
    avgPortalRating: Number((totalPortalRating / totalCount).toFixed(1)),
    portalEaseBreakdown,
    favoritePartsBreakdown,
    recentFeelings,
    recentNotes,
  };
}

/**
 * Builds an Executive Committee WhatsApp Digest from received alumni feedback
 */
export function buildFeedbackCommitteeDigestMessage(
  feedbackList: EventFeedback[],
  stats: FeedbackStats,
  eventName = 'DeepAura 2K26'
): string {
  const total = stats.totalCount;
  if (total === 0) {
    return [
      `📊 *${eventName.toUpperCase()} — ALUMNI FEEDBACK DIGEST* ❤️`,
      `🏛️ *ECK-RTU Alumni Kota Chapter | Working Committee Brief*`,
      `_“दीप जले, यादें मुस्कुराएँ।”_`,
      ``,
      `No feedback responses have been received yet. Once alumni submit their survey, live ratings, favorite moments and suggestions will appear here!`,
      ``,
      `🔗 *Survey Link:* ${typeof window !== 'undefined' ? `${window.location.origin}/feedback` : 'https://eck-alumni-events.web.app/feedback'}`,
    ].join('\n');
  }

  const lines: string[] = [];

  // Header
  lines.push(`📊 *${eventName.toUpperCase()} — ALUMNI FEEDBACK DIGEST* ❤️`);
  lines.push(`🏛️ *ECK-RTU Alumni Kota Chapter | Working Committee Brief*`);
  lines.push(`_“दीप जले, यादें मुस्कुराएँ।”_`);
  lines.push(``);

  // Key metrics
  const eventStars = '⭐'.repeat(Math.max(1, Math.min(5, Math.round(stats.avgEventRating))));
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`📈 *KEY METRICS OVERVIEW*`);
  lines.push(`• Total Survey Responses: *${total} Alumni*`);
  lines.push(`• Overall Event Rating: *${stats.avgEventRating} / 5.0* ${eventStars}`);
  lines.push(`• Digital Portal & Pass: *${stats.avgPortalRating} / 5.0* 💻`);

  // Gate pass / entry ease
  const smoothCount = feedbackList.filter(
    (f) =>
      f.responses?.gate_pass_easy === 'yes' ||
      f.responses?.portal_ease === 'much_easier' ||
      f.responses?.portal_ease === 'smooth'
  ).length;
  if (smoothCount > 0) {
    const pct = Math.round((smoothCount / total) * 100);
    lines.push(`• Digital Entry Experience: *${pct}% Smooth & Easy* 🎫`);
  }

  // Favorite moments breakdown
  const favLabels: Record<string, string> = {
    friends: '🤝 Meeting Batchmates & Friends',
    memories: '📸 Reliving Campus Memories',
    music: '🎵 Cultural & Music Evening',
    faculty: '🎓 Meeting Faculty & Mentors',
    food: '🍲 Food & Hospitality',
    everything: '✨ Everything was Magical',
  };

  const sortedFavorites = Object.entries(stats.favoritePartsBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  if (sortedFavorites.length > 0) {
    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🌟 *WHAT ALUMNI LOVED MOST*`);
    for (const [key, count] of sortedFavorites) {
      const label = favLabels[key] || key;
      const pct = Math.round((count / total) * 100);
      lines.push(`• ${label} (*${pct}%*)`);
    }
  }

  // Emotional Echoes (up to 3 recent feelings)
  const feelingsWithText = stats.recentFeelings
    .filter((f) => f.text && f.text.trim().length > 3)
    .slice(0, 3);

  if (feelingsWithText.length > 0) {
    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`💬 *ALUMNI VOICES & SENTIMENT*`);
    for (const f of feelingsWithText) {
      const author =
        f.name && f.name !== 'Anonymous Alumnus'
          ? f.batch
            ? `${f.name} ('${f.batch.slice(-2)})`
            : f.name
          : 'Alumnus';
      lines.push(`> _“${f.text.replace(/\n+/g, ' ')}”_ — *${author}*`);
    }
  }

  // Top suggestions for working committee (up to 3)
  const notesWithSuggestions = stats.recentNotes
    .map((n) => n.eventImprovements || n.nextReunionWish)
    .filter((text): text is string => Boolean(text && text.trim().length > 3))
    .slice(0, 3);

  if (notesWithSuggestions.length > 0) {
    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`💡 *SUGGESTIONS FOR WORKING COMMITTEE*`);
    notesWithSuggestions.forEach((note, idx) => {
      lines.push(`${idx + 1}. _“${note.trim().replace(/\n+/g, ' ')}”_`);
    });
  }

  // Footer with link to Admin Hub
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  const adminUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/admin`
      : 'https://eck-alumni-events.web.app/admin';
  lines.push(`🔗 *Live Admin Hub:* ${adminUrl}`);
  lines.push(`_Prepared for ECK-RTU Alumni Working Committee_ ✨`);

  return lines.join('\n');
}

/**
 * Trigger WhatsApp share with cross-device compatibility (mobile app protocol + web fallback)
 */
export function shareToWhatsApp(text: string): void {
  const encoded = encodeURIComponent(text);
  const isMobile =
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile) {
    window.open(`whatsapp://send?text=${encoded}`, '_self');
    setTimeout(() => {
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    }, 600);
  } else {
    window.open(`https://web.whatsapp.com/send?text=${encoded}`, '_blank', 'noopener,noreferrer');
  }
}
