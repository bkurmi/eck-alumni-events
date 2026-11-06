import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { supabase } from '../lib/supabase';
import {
  isFeedbackEnabled,
  submitEventFeedback,
  shareToWhatsApp,
  buildAlumniFeedbackShareMessage,
} from '../lib/feedback';
import { lookupRegistrationByRegNumber, stripSalutation } from '../lib/registrations';
import {
  getFeedbackCampaign,
  getFeedbackQuestions,
} from '../config/feedbackQuestions';
import type { FeedbackQuestion } from '../types';
import {
  Star,
  Check,
  Copy,
  MessageCircle,
  Shield,
  ArrowRight,
  ArrowLeft,
  Lock,
} from 'lucide-react';

const STEP_CONTEXT = {
  1: {
    emoji: '🎉',
    kicker: 'Step 1 of 3',
    time: '~45s',
    title: 'The Event Experience',
    description: 'Venue atmosphere, meeting batchmates, food, and your favorite moments.',
  },
  2: {
    emoji: '💻',
    kicker: 'Step 2 of 3',
    time: '~30s',
    title: 'The Digital Experience',
    description: 'Online registration, UPI QR payments, and digital gate pass on mobile.',
  },
  3: {
    emoji: '❤️',
    kicker: 'Step 3 of 3',
    time: '~40s',
    title: 'Nostalgia & Next Reunion',
    description: 'Reflections after the reunion, emotions, and ideas for our next gathering.',
  },
} as const;

export const FeedbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Feature Flag
  const enabled = isFeedbackEnabled();

  // URL Query Params auto-detection (e.g. from pass QR or WhatsApp)
  const initialName = stripSalutation(searchParams.get('name') || '');
  const initialBatch = searchParams.get('batch') || '';
  const initialRegId = searchParams.get('regId') || searchParams.get('id') || '';
  const initialRegNo = searchParams.get('regNo') || searchParams.get('regNumber') || '';

  // Extract raw digits from initialRegNo (e.g. 'REG-00003' -> '3')
  const rawInitialDigits = initialRegNo.replace(/\D/g, '');

  // Form State
  const [regDigits, setRegDigits] = useState(rawInitialDigits ? String(Number(rawInitialDigits)).padStart(5, '0') : '');
  const [registrationId, setRegistrationId] = useState(initialRegId);
  const [attendeeName, setAttendeeName] = useState(initialName);
  const [batch, setBatch] = useState(initialBatch);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupSuccess, setLookupSuccess] = useState(Boolean(initialName));
  const [lookupAttempted, setLookupAttempted] = useState(Boolean(initialName));

  // Active Event
  const [eventId, setEventId] = useState<string>('');
  const [eventSlug, setEventSlug] = useState<string>('deepaura-2k26');
  const [eventName, setEventName] = useState<string>('DeepAura 2K26');
  const [eventCode, setEventCode] = useState<string>('REG');
  const [eventTagline, setEventTagline] = useState<string>('“दीप जले, यादें मुस्कुराएँ।”');
  const [loadingEvent, setLoadingEvent] = useState(true);

  // Dynamic campaign and questions
  const campaign = React.useMemo(() => {
    return getFeedbackCampaign({ event_name: eventName, tagline: eventTagline });
  }, [eventName, eventTagline]);

  const feedbackQuestions = React.useMemo(() => {
    return getFeedbackQuestions({ event_name: eventName });
  }, [eventName]);

  // Can start survey: requires either verified registration or anonymous mode
  const canStartSurvey = isAnonymous || (lookupSuccess && Boolean(attendeeName));

  // Step state: 0 (Welcome / Identity), 1 (Event), 2 (Digital), 3 (Heart), 4 (Submitted / Thank You)
  const [currentStep, setCurrentStep] = useState<0 | 1 | 2 | 3 | 4>(0);

  // Responses dictionary
  const [responses, setResponses] = useState<Record<string, any>>({
    overall_experience: 'amazing',
    venue_arrangement: 5,
    reconnecting_buddies: 'loved_it',
    favourite_parts: ['friends', 'memories'],
    event_improvements: '',
    portal_experience: 5,
    gate_pass_easy: 'yes',
    digital_suggestions: '',
    reunion_feeling: 'nostalgic',
    next_reunion_ideas: '',
    message_to_batch: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState(false);

  // Fetch nearest open / active event metadata
  useEffect(() => {
    const fetchActiveEvent = async () => {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('id, event_slug, event_name, event_code, tagline')
          .order('event_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data && !error) {
          setEventId(data.id);
          setEventSlug(data.event_slug || 'deepaura-2k26');
          setEventName(data.event_name || 'DeepAura 2K26');
          setEventCode(data.event_code || 'REG');
          setEventTagline(data.tagline || '“दीप जले, यादें मुस्कुराएँ।”');
        }
      } catch (err) {
        console.warn('Could not load dynamic event metadata for feedback, using fallback defaults:', err);
      } finally {
        setLoadingEvent(false);
      }
    };

    fetchActiveEvent();
  }, []);

  // Filter questions by section
  const eventQuestions = feedbackQuestions.filter((q) => q.section === 'event');
  const digitalQuestions = feedbackQuestions.filter((q) => q.section === 'digital');
  const heartQuestions = feedbackQuestions.filter((q) => q.section === 'heart');

  // Handle manual lookup when typing reg digits
  const handleManualLookup = async () => {
    const digits = regDigits.trim();
    if (!digits) return;

    setLookingUp(true);
    setLookupAttempted(true);

    try {
      const match = await lookupRegistrationByRegNumber(eventSlug, digits, eventCode || 'REG');
      if (match && match.found && match.alumni) {
        const cleanedName = stripSalutation(match.alumni.name || '');
        setAttendeeName(cleanedName);
        setBatch(String(match.alumni.year_of_passing || ''));
        setRegistrationId(match.registration_id || '');
        setLookupSuccess(true);
      } else {
        setLookupSuccess(false);
      }
    } catch {
      setLookupSuccess(false);
    } finally {
      setLookingUp(false);
    }
  };

  // Option selection helpers
  const handleOptionChange = (questionId: string, value: any) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleChipToggle = (questionId: string, chipValue: string) => {
    setResponses((prev) => {
      const currentList: string[] = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const exists = currentList.includes(chipValue);
      const updated = exists
        ? currentList.filter((v) => v !== chipValue)
        : [...currentList, chipValue];
      return { ...prev, [questionId]: updated };
    });
  };

  // WhatsApp Share Trigger
  const handleShareWhatsApp = () => {
    const message = buildAlumniFeedbackShareMessage({
      attendeeName: isAnonymous ? '' : attendeeName,
      batch,
      isAnonymous,
      eventName,
      tagline: eventTagline,
    });
    shareToWhatsApp(message);
  };

  // Copy share message to clipboard
  const handleCopyShareMessage = () => {
    const message = buildAlumniFeedbackShareMessage({
      attendeeName: isAnonymous ? '' : attendeeName,
      batch,
      isAnonymous,
      eventName,
      tagline: eventTagline,
    });

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(message).then(() => {
        setCopiedMessage(true);
        setTimeout(() => setCopiedMessage(false), 2500);
      });
    }
  };

  // Confetti trigger
  const fireConfetti = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confettiPieces: Array<{
      x: number;
      y: number;
      r: number;
      d: number;
      color: string;
      tilt: number;
      tiltAngleIncremental: number;
      tiltAngle: number;
    }> = [];

    const colors = ['#f59e0b', '#fbbf24', '#fde047', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6'];

    for (let i = 0; i < 90; i++) {
      confettiPieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        r: Math.random() * 6 + 4,
        d: Math.random() * 90 + 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.floor(Math.random() * 10) - 10,
        tiltAngleIncremental: Math.random() * 0.07 + 0.05,
        tiltAngle: 0,
      });
    }

    let animationFrame: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let aliveCount = 0;
      for (let i = 0; i < confettiPieces.length; i++) {
        const p = confettiPieces[i];
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 1.5;
        p.x += Math.sin(p.d);
        p.tilt = Math.sin(p.tiltAngle) * 15;

        if (p.y <= canvas.height) {
          aliveCount++;
        }

        ctx.beginPath();
        ctx.lineWidth = p.r / 2;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
        ctx.stroke();
      }

      if (aliveCount > 0) {
        animationFrame = requestAnimationFrame(render);
      }
    };

    render();
    setTimeout(() => cancelAnimationFrame(animationFrame), 4000);
  };

  const handleSubmit = async () => {
    if (!eventId) {
      setSubmitError('Unable to identify active event. Please try again in a moment.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    // Compute star rollups for quick indexing
    const eventRating =
      Number(responses.venue_arrangement) ||
      (responses.overall_experience === 'amazing' ? 5 : responses.overall_experience === 'good' ? 4 : 3);
    const portalRating = Number(responses.portal_experience) || 5;

    const padLen = (eventCode || 'REG') === 'REG' ? 5 : 4;
    const formattedRegNumber = regDigits.trim() ? `${eventCode || 'REG'}-${regDigits.trim().padStart(padLen, '0')}` : null;

    const { error } = await submitEventFeedback({
      eventId,
      registrationId: isAnonymous ? null : registrationId || null,
      registrationNumber: isAnonymous ? null : formattedRegNumber,
      attendeeName: isAnonymous ? null : attendeeName.trim() || null,
      batch: isAnonymous ? null : batch.trim() || null,
      isAnonymous,
      eventRating,
      portalRating,
      responses,
    });

    setSubmitting(false);

    if (error) {
      setSubmitError('Failed to save your feedback. Please try again.');
      return;
    }

    // Success transition
    setCurrentStep(4);
    setTimeout(() => {
      fireConfetti();
    }, 150);
  };

  // Render question component based on question type
  const renderQuestion = (q: FeedbackQuestion) => {
    const val = responses[q.id];

    return (
      <div key={q.id} className="p-4 sm:p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-3">
        <label className="block text-sm sm:text-base font-bold text-white leading-snug">
          {q.title}
          {q.required && <span className="text-amber-400 ml-1">*</span>}
        </label>
        {q.subtitle && <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{q.subtitle}</p>}

        {/* 1. Emoji Mood Scale */}
        {q.type === 'emoji_scale' && q.options && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            {q.options.map((opt: any) => {
              const isSelected = val === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => handleOptionChange(q.id, opt.value)}
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border transition-all active:scale-95 cursor-pointer min-h-[56px] ${
                    isSelected
                      ? 'bg-amber-500/20 border-amber-500 text-white shadow-md shadow-amber-500/20 ring-1 ring-amber-500'
                      : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                  aria-pressed={isSelected}
                >
                  <span className="text-2xl sm:text-3xl select-none">{opt.emoji}</span>
                  <span className="text-xs sm:text-sm font-semibold">{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 2. Star Rating (1 to 5) */}
        {q.type === 'rating' && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            {[1, 2, 3, 4, 5].map((star) => {
              const currentRating = Number(val) || 0;
              const isFilled = star <= currentRating;
              return (
                <button
                  type="button"
                  key={star}
                  onClick={() => handleOptionChange(q.id, star)}
                  className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-amber-400 hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                  aria-label={`${star} star`}
                >
                  <Star
                    className={`w-7 h-7 sm:w-8 sm:h-8 transition-colors ${
                      isFilled
                        ? 'fill-amber-400 text-amber-400 filter drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]'
                        : 'text-slate-600'
                    }`}
                  />
                </button>
              );
            })}
            <span className="text-xs sm:text-sm font-semibold text-amber-300 ml-2">
              {Number(val) === 5
                ? '⭐ Outstanding!'
                : Number(val) === 4
                  ? '⭐ Great!'
                  : Number(val) === 3
                    ? '⭐ Good'
                    : Number(val) === 2
                      ? 'Fair'
                      : 'Needs Work'}
            </span>
          </div>
        )}

        {/* 3. Tap-to-Select Multi Chips */}
        {q.type === 'chips' && q.options && (
          <div className="flex flex-wrap gap-2 pt-1">
            {q.options.map((opt: any) => {
              const isSelected = Array.isArray(val) && val.includes(opt.value);
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => handleChipToggle(q.id, opt.value)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-full text-xs sm:text-sm font-semibold border transition-all active:scale-95 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/25'
                      : 'bg-slate-950/70 text-slate-300 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                  aria-pressed={isSelected}
                >
                  {opt.emoji && <span className="select-none">{opt.emoji}</span>}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 4. Radio Card Options */}
        {q.type === 'radio' && q.options && (
          <div className="space-y-2 pt-1">
            {q.options.map((opt: any) => {
              const isSelected = val === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => handleOptionChange(q.id, opt.value)}
                  className={`w-full flex items-center justify-between p-3.5 min-h-[48px] rounded-xl border text-left transition-all active:scale-[0.99] cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500 text-white shadow-sm shadow-amber-500/15'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                  aria-pressed={isSelected}
                >
                  <div className="flex items-center gap-2.5">
                    {opt.emoji && <span className="text-lg select-none">{opt.emoji}</span>}
                    <span className="text-xs sm:text-sm font-semibold">{opt.label}</span>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-amber-400 bg-amber-400/20' : 'border-slate-600'
                    }`}
                  >
                    {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* 5. Textarea / Open Expression */}
        {q.type === 'textarea' && (
          <textarea
            className="w-full min-h-[90px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors resize-y"
            rows={3}
            placeholder={q.placeholder || 'Type here...'}
            value={val || ''}
            onChange={(e) => handleOptionChange(q.id, e.target.value)}
          />
        )}
      </div>
    );
  };

  // If feedback portal is not enabled / inactive
  if (!enabled) {
    return (
      <div className="min-h-screen bg-[#0a0c16] text-slate-100 flex flex-col">
        <Header maxWidth="max-w-7xl" />
        <main className="w-full max-w-3xl mx-auto px-3 sm:px-4 py-8 flex-1 flex items-center justify-center">
          <div className="w-full max-w-md bg-slate-900/90 border border-amber-500/30 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-xl backdrop-blur-md">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl">
              ⏳
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Event Experience Portal
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              Feedback Portal Is Currently Inactive
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              The alumni experience survey for <strong>{eventName}</strong> is not accepting submissions at this time.
            </p>
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 leading-relaxed text-left">
              📢 <strong>Schedule Notice:</strong> The feedback portal opens during the event closing ceremony and remains accessible for post-event takeaways. Once the submission period ends, further entries are paused.
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-center">
              <Link
                to="/"
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-colors inline-flex items-center justify-center gap-2"
              >
                <span>🏠</span> Return to Home
              </Link>
              <Link
                to="/id-card"
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors inline-flex items-center justify-center gap-2"
              >
                <span>🎟️</span> My Digital Pass
              </Link>
            </div>
          </div>
        </main>
        <Footer eventName={eventName} tagline={eventTagline} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0c16] text-slate-100 flex flex-col">
      <Header maxWidth="max-w-7xl" />

      {/* Confetti Canvas */}
      <canvas ref={canvasRef} className="fixed inset-0 w-screen h-screen pointer-events-none z-50" />

      <main className="w-full max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 flex-1 space-y-6">
        {/* Campaign Banner Header (Hidden on final step to keep mobile view compact) */}
        {currentStep !== 4 && (
          <header className="w-full text-center space-y-2 py-2">
            <div className="inline-flex items-center gap-2 flex-wrap justify-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> 2-Minute Alumni Survey
              </div>
              {currentStep >= 1 && currentStep <= 3 && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep(0);
                    window.scrollTo({ top: 100, behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 cursor-pointer transition-colors"
                  title="Click to edit identity or switch to anonymous"
                >
                  {isAnonymous ? (
                    <span>🛡️ Anonymous</span>
                  ) : (
                    <span>👤 {attendeeName ? stripSalutation(attendeeName) : 'Participant'} {regDigits ? `(${eventCode || 'REG'}-${regDigits.padStart((eventCode || 'REG') === 'REG' ? 5 : 4, '0')})` : ''}</span>
                  )}
                  <span className="opacity-70 underline ml-0.5">✎</span>
                </button>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{campaign.title}</h1>
            <p className="text-xs sm:text-sm text-amber-200/80 italic">{campaign.tagline}</p>
          </header>
        )}

        {/* ── STEP 4: THANK YOU SCREEN ───────────────────────────── */}
        {currentStep === 4 ? (
          <div className="w-full bg-slate-900/90 border border-amber-500/30 rounded-2xl p-6 sm:p-8 text-center space-y-6 shadow-2xl shadow-amber-500/10 backdrop-blur-md">
            <div className="text-4xl animate-bounce">💖</div>
            <h2 className="text-2xl font-black text-white tracking-tight">{campaign.closingQuote.title}</h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
              {campaign.closingQuote.subMessage}
            </p>

            {/* Streamlined Mobile-First WhatsApp Sharing Box */}
            <div className="p-4 sm:p-5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3.5 text-left">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                  📢 Pass The Mic
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white">Motivate Your Batchmates!</h3>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border-l-4 border-amber-500 text-xs sm:text-sm italic text-amber-200">
                &ldquo;Maine feedback submit kar diya! (Hostel Maggi se bhi tez 😂🍜) Ab tumhari baari hai!&rdquo;
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-green-600 hover:from-emerald-600 hover:to-green-500 text-white font-bold text-sm tracking-wide shadow-md shadow-emerald-900/40 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                  id="btn-feedback-share-whatsapp"
                  title="Share"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Share on WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyShareMessage}
                  className="min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-[0.98]"
                  id="btn-feedback-copy-message"
                  title="Copy shoutout message to clipboard"
                >
                  {copiedMessage ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedMessage ? 'Copied!' : 'Copy Text'}</span>
                </button>
              </div>

              {/* Privacy Reassurance */}
              <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
                <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  <strong className="text-slate-200 font-semibold">100% Confidential:</strong> Only invites batchmates — your feedback answers are never shared.
                </span>
              </div>
            </div>

            <div className="pt-2">
              <Link
                to="/"
                className="w-full min-h-[44px] py-3 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-colors inline-flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
              >
                <span>🏠</span> Return to Event Home
              </Link>
            </div>
          </div>
        ) : currentStep === 0 ? (
          /* ── STEP 0: WELCOME & IDENTITY LANDING ───────────────────── */
          <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md space-y-6">
            {/* 3 Pillars Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center sm:flex-col sm:text-center gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-2xl shrink-0">🎉</span>
                <div>
                  <strong className="font-bold text-sm text-white block">1. Event Experience</strong>
                  <span className="text-xs text-slate-400 block">Venue, food & buddies</span>
                </div>
              </div>
              <div className="flex items-center sm:flex-col sm:text-center gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-2xl shrink-0">💻</span>
                <div>
                  <strong className="font-bold text-sm text-white block">2. Digital Experience</strong>
                  <span className="text-xs text-slate-400 block">Pass, portal & entry</span>
                </div>
              </div>
              <div className="flex items-center sm:flex-col sm:text-center gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-2xl shrink-0">❤️</span>
                <div>
                  <strong className="font-bold text-sm text-white block">3. Future Reunions</strong>
                  <span className="text-xs text-slate-400 block">Memories & wishes</span>
                </div>
              </div>
            </div>

            {/* Registration Details & Anonymous Checkbox */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <span className="flex items-center gap-2 text-sm font-bold text-white">
                  <span>🪪</span>
                  <span>Registration Details</span>
                </span>

                {/* Direct Checkbox for being anonymous */}
                <label
                  className={`inline-flex items-center gap-2 cursor-pointer text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors select-none ${
                    isAnonymous
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => {
                      setIsAnonymous(e.target.checked);
                      if (e.target.checked) {
                        setLookupSuccess(false);
                      }
                    }}
                    className="rounded bg-slate-800 border-slate-600 text-amber-500 focus:ring-0"
                  />
                  <span>
                    {isAnonymous ? '🕵️ Keep Me Anonymous (Active)' : '🕵️ Keep Me Anonymous'}
                  </span>
                </label>
              </div>

              {isAnonymous ? (
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs sm:text-sm text-amber-200 leading-relaxed">
                  <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold text-white block">100% Anonymous Mode Active:</strong> No name, registration number, or contact details will be recorded with your submission. Express yourself completely freely!
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleManualLookup();
                    }}
                    className="flex items-center rounded-xl bg-slate-900 border border-slate-700 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500 overflow-hidden"
                  >
                    <span className="pl-3.5 pr-1 font-mono font-bold text-amber-400 text-base select-none pointer-events-none">
                      {eventCode || 'REG'}-
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={5}
                      placeholder="e.g. 212"
                      className="flex-1 min-h-[44px] py-2.5 px-2 bg-transparent text-base text-white font-mono placeholder:text-slate-500 focus:outline-none"
                      value={regDigits}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 5);
                        setRegDigits(digitsOnly);
                        setLookupAttempted(false);
                        if (lookupSuccess) setLookupSuccess(false);
                      }}
                      autoFocus={!initialName}
                    />
                    <button
                      type="submit"
                      disabled={lookingUp || !regDigits.trim()}
                      className="px-4 min-h-[44px] bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {lookingUp ? 'Finding...' : 'Find →'}
                    </button>
                  </form>

                  {/* Verified Alumnus Welcome Card */}
                  {lookupSuccess && attendeeName && (
                    <div className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-white animate-in fade-in">
                      <div className="text-2xl shrink-0">👋</div>
                      <div className="space-y-1">
                        <div className="text-sm sm:text-base font-bold text-white">
                          Hey <strong>{stripSalutation(attendeeName)}</strong>, welcome! 🎉
                        </div>
                        <div className="text-xs text-slate-300">
                          Great to have you share your {eventName} experience!
                        </div>
                        <div className="flex items-center gap-2 flex-wrap pt-0.5">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-900 border border-slate-700 text-amber-300">
                            {regDigits ? `${eventCode || 'REG'}-${regDigits.padStart((eventCode || 'REG') === 'REG' ? 5 : 4, '0')}` : `${eventCode || 'REG'}-PASS`}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            ✅ Verified Alumnus
                          </span>
                          {batch && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-300">
                              🎓 Batch of {batch}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {lookupAttempted && !lookupSuccess && !lookingUp && (
                    <p className="text-xs text-rose-400 leading-relaxed">
                      ⚠️ No registration found for {eventCode || 'REG'}-{regDigits ? regDigits.padStart((eventCode || 'REG') === 'REG' ? 5 : 4, '0') : ''}. Please re-check or choose &ldquo;Keep Me Anonymous&rdquo;.
                    </p>
                  )}

                  {!lookupAttempted && !lookupSuccess && !lookingUp && (
                    <p className="text-xs text-slate-400 leading-relaxed">
                      💡 Enter your number (e.g. <strong>3</strong> or <strong>212</strong>) &amp; tap <strong>Find →</strong> to personalize!
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Start Survey CTA */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (!canStartSurvey) return;
                  setCurrentStep(1);
                  window.scrollTo({ top: 120, behavior: 'smooth' });
                }}
                disabled={!canStartSurvey}
                className="w-full min-h-[48px] py-3.5 px-6 rounded-xl font-bold text-base bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-40 cursor-pointer"
                title={
                  !canStartSurvey
                    ? 'Please enter your REG number & tap Find → or select Keep Me Anonymous'
                    : 'Start the 2-minute survey'
                }
              >
                <span>Start 2-Minute Survey</span>
                <ArrowRight className="w-5 h-5" />
              </button>
              <p className="text-center text-xs text-slate-400 leading-relaxed">
                {!canStartSurvey ? (
                  <span className="text-amber-400 font-medium">
                    👉 Enter your REG number &amp; tap <strong>Find →</strong>, or select <strong>Keep Me Anonymous</strong> to proceed
                  </span>
                ) : (
                  <span>⏱ 3 quick sections • ~2 minutes • Shape future ECK-RTU reunions</span>
                )}
              </p>
            </div>
          </div>
        ) : (
          /* ── STEPS 1, 2, 3: PURE QUESTIONS ────────────────────── */
          <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md space-y-6">
            {/* Progress Stepper Bar */}
            <div className="w-full">
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                  style={{ width: `${(currentStep / 3) * 100}%` }}
                />
              </div>
            </div>

            {/* Prominently Highlighted Step Section Context Banner */}
            {currentStep >= 1 && currentStep <= 3 && (
              <div className="flex items-start gap-3.5 p-3.5 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xl shrink-0 select-none">
                  <span>{STEP_CONTEXT[currentStep as 1 | 2 | 3].emoji}</span>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>{STEP_CONTEXT[currentStep as 1 | 2 | 3].kicker}</span>
                    <span className="text-slate-500">•</span>
                    <span>⏱ {STEP_CONTEXT[currentStep as 1 | 2 | 3].time}</span>
                  </div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {STEP_CONTEXT[currentStep as 1 | 2 | 3].title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {STEP_CONTEXT[currentStep as 1 | 2 | 3].description}
                  </p>
                </div>
              </div>
            )}

            {/* Step Questions */}
            <div className="space-y-4">
              {currentStep === 1 && eventQuestions.map(renderQuestion)}
              {currentStep === 2 && digitalQuestions.map(renderQuestion)}
              {currentStep === 3 && heartQuestions.map(renderQuestion)}
            </div>

            {submitError && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs sm:text-sm">
                <span>⚠️</span> {submitError}
              </div>
            )}

            {/* Step Footer Navigation Buttons */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setCurrentStep((prev) => ((prev - 1) as any));
                  window.scrollTo({ top: 120, behavior: 'smooth' });
                }}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-sm transition-colors cursor-pointer flex items-center gap-2"
                disabled={submitting}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep((prev) => ((prev + 1) as any));
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                  }}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm transition-colors cursor-pointer flex items-center gap-2 shadow-md shadow-amber-500/20 active:scale-[0.98]"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || loadingEvent}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm transition-colors cursor-pointer flex items-center gap-2 shadow-md shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50"
                >
                  {submitting ? 'Submitting ❤️...' : 'Send Feedback ❤️'}
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer eventName={eventName} tagline={eventTagline} />
    </div>
  );
};
