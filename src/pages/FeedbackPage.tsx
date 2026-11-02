import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { supabase } from '../lib/supabase';
import {
  isFeedbackEnabled,
  submitEventFeedback,
  shareToWhatsApp,
  buildAlumniFeedbackShareMessage,
} from '../lib/feedback';
import { lookupRegistrationByRegNumber, stripSalutation } from '../lib/registrations';
import {
  FEEDBACK_CAMPAIGN,
  DEFAULT_FEEDBACK_QUESTIONS,
} from '../config/feedbackQuestions';
import type { FeedbackQuestion } from '../types';
import '../feedback.css';

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
    description: 'Reflections after DeepAura, emotions, and ideas for our next gathering.',
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
  const [loadingEvent, setLoadingEvent] = useState(true);

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
    portal_navigation: 5,
    portal_ease: 'much_easier',
    portal_improvements: '',
    after_deepaura_feeling: '',
    next_reunion_wish: '',
    stay_connected: 'yes_absolutely',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const handleShareWhatsApp = () => {
    const text = buildAlumniFeedbackShareMessage({
      attendeeName: stripSalutation(attendeeName),
      batch,
      isAnonymous,
    });
    shareToWhatsApp(text);
  };

  const handleCopyShareMessage = async () => {
    const text = buildAlumniFeedbackShareMessage({
      attendeeName: stripSalutation(attendeeName),
      batch,
      isAnonymous,
    });
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2500);
    } catch (err) {
      console.error('Failed to copy share message:', err);
    }
  };

  // Fetch active event
  useEffect(() => {
    async function loadActiveEvent() {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('id, event_name, event_slug, status')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (data && !error) {
          setEventId(data.id);
          if (data.event_slug) setEventSlug(data.event_slug);
          if (data.event_name) setEventName(data.event_name);
        }
      } catch (e) {
        console.error('Failed to load active event for feedback:', e);
      } finally {
        setLoadingEvent(false);
      }
    }

    loadActiveEvent();
  }, []);

  // Manual lookup handler (runs on Find button click or Enter key)
  const handleManualLookup = async (digitsToLookup?: string) => {
    const rawDigits = digitsToLookup !== undefined ? digitsToLookup : regDigits;
    const trimmed = rawDigits.trim().replace(/\D/g, '');
    if (!trimmed || isAnonymous) return;

    setLookingUp(true);
    setLookupAttempted(true);
    try {
      const result = await lookupRegistrationByRegNumber(eventSlug, trimmed);
      if (result.found && result.alumni) {
        const formatted = trimmed.padStart(5, '0');
        setAttendeeName(stripSalutation(result.alumni.name || ''));
        setBatch(String(result.alumni.year_of_passing || ''));
        if (result.registration_id) setRegistrationId(result.registration_id);
        // Automatically append zeros right inside the input field so it becomes the actual 5-digit number!
        setRegDigits(formatted);
        setLookupSuccess(true);
      } else {
        setLookupSuccess(false);
      }
    } catch (err) {
      console.warn('Registration lookup error:', err);
      setLookupSuccess(false);
    } finally {
      setLookingUp(false);
    }
  };

  // Run initial lookup if passed via URL (e.g. from pass QR)
  useEffect(() => {
    if (rawInitialDigits && !isAnonymous && eventSlug) {
      handleManualLookup(rawInitialDigits);
    }
  }, [eventSlug]);

  // Filter questions by section
  const eventQuestions = DEFAULT_FEEDBACK_QUESTIONS.filter((q) => q.section === 'event');
  const digitalQuestions = DEFAULT_FEEDBACK_QUESTIONS.filter((q) => q.section === 'digital');
  const heartQuestions = DEFAULT_FEEDBACK_QUESTIONS.filter((q) => q.section === 'heart');

  const handleOptionChange = (questionId: string, value: any) => {
    setResponses((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleChipToggle = (questionId: string, value: string) => {
    setResponses((prev) => {
      const currentList: string[] = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      if (currentList.includes(value)) {
        return { ...prev, [questionId]: currentList.filter((v) => v !== value) };
      } else {
        return { ...prev, [questionId]: [...currentList, value] };
      }
    });
  };

  // Trigger celebration confetti
  const fireConfetti = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#f59e0b', '#fbbf24', '#f97316', '#22c55e', '#60a5fa', '#e11d48', '#a855f7'];
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      rotation: number;
      vRot: number;
      life: number;
    }> = [];

    for (let i = 0; i < 90; i++) {
      particles.push({
        x: canvas.width * 0.5 + (Math.random() - 0.5) * 80,
        y: canvas.height * 0.4 + (Math.random() - 0.5) * 50,
        vx: (Math.random() - 0.5) * 16,
        vy: -Math.random() * 14 - 4,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.25,
        life: 1,
      });
    }

    let animationFrame: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let aliveCount = 0;

      for (const p of particles) {
        if (p.life <= 0) continue;
        aliveCount++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.4;
        p.vx *= 0.98;
        p.rotation += p.vRot;
        p.life -= 0.012;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
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

    const formattedRegNumber = regDigits.trim() ? `REG-${regDigits.trim().padStart(5, '0')}` : null;

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
      <div key={q.id} className="feedback-question-card">
        <label className="feedback-question-title">
          {q.title}
          {q.required && <span className="text-amber-400 ml-1">*</span>}
        </label>
        {q.subtitle && <p className="feedback-question-sub">{q.subtitle}</p>}

        {/* 1. Emoji Mood Scale */}
        {q.type === 'emoji_scale' && q.options && (
          <div className="feedback-emoji-grid">
            {q.options.map((opt: any) => {
              const isSelected = val === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => handleOptionChange(q.id, opt.value)}
                  className={`feedback-emoji-btn ${isSelected ? 'active' : ''}`}
                  aria-pressed={isSelected}
                >
                  <span className="feedback-emoji-icon">{opt.emoji}</span>
                  <span className="feedback-emoji-label">{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 2. Star Rating (1 to 5) */}
        {q.type === 'rating' && (
          <div className="feedback-star-row">
            {[1, 2, 3, 4, 5].map((star) => {
              const currentRating = Number(val) || 0;
              const isFilled = star <= currentRating;
              return (
                <button
                  type="button"
                  key={star}
                  onClick={() => handleOptionChange(q.id, star)}
                  className="feedback-star-btn"
                  aria-label={`${star} star`}
                >
                  <svg
                    className={`feedback-star-svg ${isFilled ? 'filled' : 'empty'}`}
                    viewBox="0 0 24 24"
                    fill={isFilled ? '#fbbf24' : 'none'}
                    stroke={isFilled ? '#f59e0b' : '#64748b'}
                    strokeWidth="1.75"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
              );
            })}
            <span className="feedback-rating-hint">
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
          <div className="feedback-chips-wrapper">
            {q.options.map((opt: any) => {
              const isSelected = Array.isArray(val) && val.includes(opt.value);
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => handleChipToggle(q.id, opt.value)}
                  className={`feedback-chip-pill ${isSelected ? 'selected' : ''}`}
                  aria-pressed={isSelected}
                >
                  {opt.emoji && <span className="chip-emoji">{opt.emoji}</span>}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 4. Radio Card Options */}
        {q.type === 'radio' && q.options && (
          <div className="feedback-radio-list">
            {q.options.map((opt: any) => {
              const isSelected = val === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => handleOptionChange(q.id, opt.value)}
                  className={`feedback-radio-card ${isSelected ? 'selected' : ''}`}
                  aria-pressed={isSelected}
                >
                  <div className="radio-card-leading">
                    {opt.emoji && <span className="radio-emoji">{opt.emoji}</span>}
                    <span className="radio-label">{opt.label}</span>
                  </div>
                  <div className={`radio-dot ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <div className="radio-dot-inner" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* 5. Textarea / Open Expression */}
        {q.type === 'textarea' && (
          <textarea
            className="feedback-textarea"
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
      <div className="feedback-page-wrapper">
        <Header />
        <main className="feedback-closed-main">
          <div className="feedback-closed-card">
            <div className="feedback-closed-icon-ring">
              ⏳
            </div>
            <div className="feedback-closed-pill">
              <span className="badge-dot" /> Event Experience Portal
            </div>
            <h1 className="feedback-closed-title">
              Feedback Portal Is Currently Inactive
            </h1>
            <p className="feedback-closed-desc">
              The alumni experience survey for <strong>{eventName}</strong> is not accepting submissions at this time.
            </p>
            <div className="feedback-closed-notice-box">
              📢 <strong>Schedule Notice:</strong> The feedback portal opens during the event closing ceremony and remains accessible for post-event takeaways. Once the submission period ends, further entries are paused.
            </div>
            <div className="feedback-closed-actions">
              <Link to="/" className="btn-festive-primary feedback-closed-btn">
                <span>🏠</span> Return to Home
              </Link>
              <Link to="/id-card" className="btn-secondary feedback-closed-btn">
                <span>🎟️</span> My Digital Pass
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="feedback-page-wrapper">
      <Header />

      {/* Confetti Canvas */}
      <canvas ref={canvasRef} className="feedback-confetti-canvas" />

      <main className="feedback-main-container">
        {/* Campaign Banner Header */}
        <header className="feedback-hero-banner">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <div className="feedback-badge-pill">
              <span className="badge-dot" /> 2-Minute Alumni Survey
            </div>
            {currentStep >= 1 && currentStep <= 3 && (
              <button
                type="button"
                onClick={() => {
                  setCurrentStep(0);
                  window.scrollTo({ top: 100, behavior: 'smooth' });
                }}
                className="feedback-badge-pill"
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  borderColor: 'rgba(245, 158, 11, 0.35)',
                  color: '#fbbf24',
                  cursor: 'pointer',
                }}
                title="Click to edit identity or switch to anonymous"
              >
                {isAnonymous ? (
                  <span>🛡️ Anonymous</span>
                ) : (
                  <span>👤 {attendeeName ? stripSalutation(attendeeName) : 'Participant'} {regDigits ? `(REG-${regDigits.padStart(5, '0')})` : ''}</span>
                )}
                <span style={{ opacity: 0.7, textDecoration: 'underline', marginLeft: '3px' }}>✎</span>
              </button>
            )}
          </div>
          <h1 className="feedback-hero-title">{FEEDBACK_CAMPAIGN.title}</h1>
          <p className="feedback-hero-tagline">{FEEDBACK_CAMPAIGN.tagline}</p>
        </header>

        {/* ── STEP 4: THANK YOU SCREEN ───────────────────────────── */}
        {currentStep === 4 ? (
          <div className="feedback-thankyou-card">
            <div className="thankyou-emoji-sparkle">💖</div>
            <h2 className="thankyou-title">{FEEDBACK_CAMPAIGN.closingQuote.title}</h2>
            <p className="thankyou-message">{FEEDBACK_CAMPAIGN.closingQuote.message}</p>
            <div className="thankyou-quote-box">
              <span className="quote-icon">“</span>
              <p className="quote-text">{FEEDBACK_CAMPAIGN.closingQuote.subMessage}</p>
            </div>

            {/* Highlighted WhatsApp Motivation & Batch Invite Card */}
            <div className="feedback-share-highlight-card">
              <div className="share-highlight-kicker-badge">
                <span>🔥 Pass The Mic</span>
              </div>
              <h3 className="share-highlight-heading">
                Motivate Batchmates to Share Their Review!
              </h3>
              <p className="share-highlight-lead">
                The more batchmates share their takeaways, the better and grander our future reunions will be. Send a quick shoutout to your batch WhatsApp groups!
              </p>

              {/* Privacy Notice: strictly clarifies no actual feedback is shared */}
              <div className="share-privacy-callout">
                <span className="share-privacy-icon">🔒</span>
                <div className="share-privacy-text">
                  <strong>100% Confidential:</strong> We <u>never</u> share your personal answers, ratings, or comments. This WhatsApp button only shares an encouraging shoutout to motivate other alumni to participate!
                </div>
              </div>

              {/* Humorous Message Preview */}
              <div className="share-preview-snippet">
                <div className="share-preview-header">
                  <span className="share-preview-tag">💬 WhatsApp Message Preview</span>
                </div>
                <div className="share-preview-body">
                  &ldquo;📢 Doston, maine apna DeepAura feedback submit kar diya! 😂 Sach batau toh ye hostel Maggi se bhi tez tha aur engineering viva se 100x aasan! 🍜 Ab tumhari baari hai...&rdquo;
                </div>
              </div>

              {/* Action Buttons */}
              <div className="share-buttons-group">
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="btn-share-whatsapp-festive"
                  id="btn-feedback-share-whatsapp"
                  title="Share fun shoutout on WhatsApp"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12.031 2C6.511 2 2.023 6.488 2.023 12.008c0 1.848.508 3.585 1.396 5.088L2 22l5.06-1.328c1.449.809 3.109 1.258 4.967 1.258 5.524 0 10.016-4.488 10.016-10.008S17.555 2 12.031 2zm5.787 14.18c-.244.688-1.229 1.264-1.742 1.344-.472.072-1.074.132-3.153-.728-2.656-1.101-4.354-3.791-4.487-3.967-.13-.176-1.072-1.429-1.072-2.726 0-1.296.677-1.936.918-2.199.24-.264.527-.33.703-.33.176 0 .352.002.506.01.164.009.385-.062.602.46.223.535.757 1.848.824 1.98.067.132.112.287.022.463-.09.176-.134.286-.266.44-.132.154-.277.343-.396.462-.132.132-.27.275-.117.538.154.263.684 1.127 1.47 1.826 1.011.898 1.862 1.177 2.126 1.309.264.132.418.11.572-.066.154-.176.66-.77.836-1.034.176-.264.352-.22.593-.132.242.088 1.54.726 1.804.858.264.132.44.198.506.308.066.11.066.638-.178 1.326z" />
                  </svg>
                  <span>Share on WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyShareMessage}
                  className="btn-share-copy-festive"
                  id="btn-feedback-copy-message"
                  title="Copy shoutout message to clipboard"
                >
                  <span>{copiedMessage ? '✅ Copied!' : '📋 Copy Text'}</span>
                </button>
              </div>
            </div>

            <div className="thankyou-actions">
              <Link to="/" className="btn-festive-primary thankyou-btn thankyou-btn-single">
                <span>🏠</span> Return to Event Home
              </Link>
            </div>
          </div>
        ) : currentStep === 0 ? (
          /* ── STEP 0: WELCOME & IDENTITY LANDING ───────────────────── */
          <div className="feedback-card-shell feedback-welcome-shell">
            {/* 3 Pillars Overview */}
            <div className="welcome-pillars-grid">
              <div className="welcome-pillar-card">
                <span className="pillar-icon">🎉</span>
                <div className="pillar-text">
                  <strong>1. Event Experience</strong>
                  <span>Venue, food & buddies</span>
                </div>
              </div>
              <div className="welcome-pillar-card">
                <span className="pillar-icon">💻</span>
                <div className="pillar-text">
                  <strong>2. Digital Experience</strong>
                  <span>Pass, portal & entry</span>
                </div>
              </div>
              <div className="welcome-pillar-card">
                <span className="pillar-icon">❤️</span>
                <div className="pillar-text">
                  <strong>3. Future Reunions</strong>
                  <span>Memories & wishes</span>
                </div>
              </div>
            </div>

            {/* Registration Details & Anonymous Checkbox */}
            <div className="feedback-identity-box" style={{ marginBottom: '1.5rem' }}>
              <div className="identity-header-row">
                <span className="identity-label">
                  <span>🪪</span>
                  <span>Registration Details</span>
                </span>

                {/* Direct Checkbox for being anonymous */}
                <label className={`identity-anon-badge-toggle ${isAnonymous ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => {
                      setIsAnonymous(e.target.checked);
                      if (e.target.checked) {
                        setLookupSuccess(false);
                      }
                    }}
                  />
                  <span className="toggle-text">
                    {isAnonymous ? '🕵️ Keep Me Anonymous (Active)' : '🕵️ Keep Me Anonymous'}
                  </span>
                </label>
              </div>

              {isAnonymous ? (
                <div className="identity-anon-confirmed-box">
                  <span style={{ fontSize: '1.25rem' }}>🛡️</span>
                  <div>
                    <strong>100% Anonymous Mode Active:</strong> No name, registration number, or contact details will be recorded with your submission. Express yourself completely freely!
                  </div>
                </div>
              ) : (
                <div className="identity-reg-wrapper">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleManualLookup();
                    }}
                    className="identity-reg-input-row"
                  >
                    <div className="feedback-reg-input-group" title="Registration prefix REG- is fixed">
                      <span className="feedback-reg-prefix">REG-</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={5}
                        placeholder="e.g. 212"
                        className="feedback-reg-digits-input"
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
                        className="feedback-reg-submit-btn"
                      >
                        {lookingUp ? 'Finding...' : 'Find →'}
                      </button>
                    </div>
                  </form>

                  {/* Verified Alumnus Welcome Card */}
                  {lookupSuccess && attendeeName && (
                    <div className="feedback-welcome-card">
                      <div className="feedback-welcome-avatar">👋</div>
                      <div className="feedback-welcome-body">
                        <div className="feedback-welcome-title">
                          Hey <strong>{stripSalutation(attendeeName)}</strong>, welcome! 🎉
                        </div>
                        <div className="feedback-welcome-subtitle">
                          Great to have you share your DeepAura experience!
                        </div>
                        <div className="feedback-welcome-meta">
                          <span className="welcome-reg-pill">
                            {regDigits ? `REG-${regDigits.padStart(5, '0')}` : 'REG-PASS'}
                          </span>
                          <span className="welcome-verified-badge">
                            ✅ Verified Alumnus
                          </span>
                          {batch && (
                            <span className="welcome-batch-pill">
                              🎓 Batch of {batch}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {lookupAttempted && !lookupSuccess && !lookingUp && (
                    <p className="identity-reg-hint" style={{ color: '#f87171' }}>
                      ⚠️ No registration found for REG-{regDigits ? regDigits.padStart(5, '0') : ''}. Please re-check or choose &ldquo;Keep Me Anonymous&rdquo;.
                    </p>
                  )}

                  {!lookupAttempted && !lookupSuccess && !lookingUp && (
                    <p className="identity-reg-hint">
                      💡 Enter your number (e.g. <strong>3</strong> or <strong>212</strong>) &amp; tap <strong>Find →</strong> to personalize!
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Start Survey CTA */}
            <div className="welcome-start-action">
              <button
                type="button"
                onClick={() => {
                  if (!canStartSurvey) return;
                  setCurrentStep(1);
                  window.scrollTo({ top: 120, behavior: 'smooth' });
                }}
                disabled={!canStartSurvey}
                className="btn-festive-primary welcome-start-btn"
                title={
                  !canStartSurvey
                    ? 'Please enter your REG number & tap Find → or select Keep Me Anonymous'
                    : 'Start the 2-minute survey'
                }
              >
                <span>Start 2-Minute Survey →</span>
              </button>
              <p className="welcome-time-note">
                {!canStartSurvey ? (
                  <span style={{ color: '#fbbf24' }}>
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
          <div className="feedback-card-shell">
            {/* Progress Stepper Bar */}
            <div className="feedback-stepper-header">
              <div className="stepper-track">
                <div
                  className="stepper-progress-bar"
                  style={{ width: `${(currentStep / 3) * 100}%` }}
                />
              </div>
            </div>

            {/* Prominently Highlighted Step Section Context Banner */}
            {currentStep >= 1 && currentStep <= 3 && (
              <div className="feedback-step-title-banner">
                <div className="step-title-icon-badge">
                  <span>{STEP_CONTEXT[currentStep as 1 | 2 | 3].emoji}</span>
                </div>
                <div className="step-title-content">
                  <div className="step-title-kicker">
                    <span>{STEP_CONTEXT[currentStep as 1 | 2 | 3].kicker}</span>
                    <span className="step-time-dot">•</span>
                    <span>⏱ {STEP_CONTEXT[currentStep as 1 | 2 | 3].time}</span>
                  </div>
                  <h2 className="step-title-heading">
                    {STEP_CONTEXT[currentStep as 1 | 2 | 3].title}
                  </h2>
                  <p className="step-title-description">
                    {STEP_CONTEXT[currentStep as 1 | 2 | 3].description}
                  </p>
                </div>
              </div>
            )}

            {/* Step Questions */}
            <div className="feedback-questions-list">
              {currentStep === 1 && eventQuestions.map(renderQuestion)}
              {currentStep === 2 && digitalQuestions.map(renderQuestion)}
              {currentStep === 3 && heartQuestions.map(renderQuestion)}
            </div>

            {submitError && (
              <div className="feedback-error-banner">
                <span>⚠️</span> {submitError}
              </div>
            )}

            {/* Step Footer Navigation Buttons */}
            <div className="feedback-nav-footer">
              <button
                type="button"
                onClick={() => {
                  setCurrentStep((prev) => ((prev - 1) as any));
                  window.scrollTo({ top: 120, behavior: 'smooth' });
                }}
                className="btn-secondary feedback-back-btn"
                disabled={submitting}
              >
                ← Back
              </button>

              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep((prev) => ((prev + 1) as any));
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                  }}
                  className="btn-festive-primary feedback-next-btn"
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || loadingEvent}
                  className="btn-festive-primary feedback-submit-btn"
                >
                  {submitting ? 'Submitting ❤️...' : 'Send Feedback ❤️'}
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
