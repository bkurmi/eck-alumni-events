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
