import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { EventCard } from '../components/EventCard';
import { RegistrationForm } from '../components/RegistrationForm';
import { SuccessPage } from '../components/SuccessPage';
import { ManageRegistrationModal } from '../components/ManageRegistrationModal';
import { supabase } from '../lib/supabase';
import { convertLookupToFormData, getEventRegistrationCount } from '../lib/registrations';
import { resolveActivePaymentConfig } from '../lib/paymentRotation';
import { isAlumniIdCardsEnabled } from '../lib/gate';
import type {
  ECKEvent,
  RegistrationFormData,
  RegistrationResult,
  ExistingRegistrationLookup,
} from '../types';

const DEFAULT_EVENT: ECKEvent = {
  id: 'mock-deepaura-2026',
  event_name: 'ECK-RTU Alumni DeepAura 2K26',
  event_slug: 'deepaura-2k26',
  event_date: '2026-11-01',
  event_time: '5:00 PM onwards',
  location: 'ECK Campus, Kota, Rajasthan (College Ground)',
  description:
    'Join fellow ECK and RTU alumni for an evening of nostalgic reunions, networking, cultural performances, gala dinner, and Diwali celebrations.',
  registration_fee: 800,
  upi_id: '9799951857@upi',
  banner_image_url: '/deepaura-banner.jpg',
  tagline: '“दीप जले, यादें मुस्कुराएँ।”',
  theme_primary_color: '#6366f1',
  theme_accent_color: '#f59e0b',
  qr_image_url: '/qr-1.png',
  status: 'OPEN',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const EventPage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const activeSlug = slug || 'deepaura-2k26';
  const showIdCards = isAlumniIdCardsEnabled();

  const [event, setEvent] = useState<ECKEvent>(DEFAULT_EVENT);
  const [loading, setLoading] = useState(true);
  const [, setRegistrationCount] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<'overview' | 'form' | 'success'>('overview');
  const [submittedData, setSubmittedData] = useState<{
    formData: RegistrationFormData;
    result: RegistrationResult;
  } | null>(null);

  // Manage registration modal & preloaded data state
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [preloadedRegistration, setPreloadedRegistration] =
    useState<ExistingRegistrationLookup | null>(null);
  const [preloadedFormData, setPreloadedFormData] = useState<RegistrationFormData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadEvent() {
      setLoading(true);
      try {
        const [{ data, error }, regCount] = await Promise.all([
          supabase
            .from('events')
            .select('*')
            .eq('event_slug', activeSlug)
            .single(),
          getEventRegistrationCount(activeSlug),
        ]);

        const rawEvent: ECKEvent =
          error || !data
            ? { ...DEFAULT_EVENT, event_slug: activeSlug }
            : (data as ECKEvent);

        const rotation = resolveActivePaymentConfig(rawEvent, regCount);

        if (isMounted) {
          setRegistrationCount(regCount);
          setEvent({
            ...rawEvent,
            upi_id: rotation.activeConfig.upi_id,
            qr_image_url: rotation.activeConfig.qr_image_url,
          });
        }
      } catch (err) {
        console.warn('Event fetch error handled:', err);
        const rotation = resolveActivePaymentConfig(DEFAULT_EVENT, 0);
        if (isMounted) {
          setEvent({
            ...DEFAULT_EVENT,
            upi_id: rotation.activeConfig.upi_id,
            qr_image_url: rotation.activeConfig.qr_image_url,
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadEvent();

    return () => {
      isMounted = false;
    };
  }, [activeSlug]);

  // Apply dynamic theming based on event config
  useEffect(() => {
    if (event.theme_primary_color) {
      document.documentElement.style.setProperty('--primary', event.theme_primary_color);
    }
    if (event.theme_accent_color) {
      document.documentElement.style.setProperty('--accent', event.theme_accent_color);
    }
  }, [event.theme_primary_color, event.theme_accent_color]);

  const handleStartRegistration = () => {
    setPreloadedRegistration(null);
    setPreloadedFormData(null);
    setCurrentStep('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Refresh live count right before registration to ensure up-to-date rotation
    getEventRegistrationCount(activeSlug)
      .then((count) => {
        setRegistrationCount(count);
        const rotation = resolveActivePaymentConfig(event, count);
        setEvent((prev) => ({
          ...prev,
          upi_id: rotation.activeConfig.upi_id,
          qr_image_url: rotation.activeConfig.qr_image_url,
        }));
      })
      .catch(() => { });
  };

  const handleOpenManageModal = () => {
    setIsManageModalOpen(true);
  };

  const handleSelectRegistrationForEdit = (reg: ExistingRegistrationLookup) => {
    setPreloadedRegistration(reg);
    setPreloadedFormData(convertLookupToFormData(reg));
    setIsManageModalOpen(false);
    setCurrentStep('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRegistrationSuccess = (
    formData: RegistrationFormData,
    result: RegistrationResult
  ) => {
    setSubmittedData({ formData, result });
    setCurrentStep('success');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Rotate sequence forward for the next registration
    setRegistrationCount((prev) => {
      const nextCount = prev + 1;
      const rotation = resolveActivePaymentConfig(event, nextCount);
      setEvent((prevEvent) => ({
        ...prevEvent,
        upi_id: rotation.activeConfig.upi_id,
        qr_image_url: rotation.activeConfig.qr_image_url,
      }));
      return nextCount;
    });
  };

  const handleResetRegistration = () => {
    setSubmittedData(null);
    setPreloadedRegistration(null);
    setPreloadedFormData(null);
    setCurrentStep('overview');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Ensure next registration in the same browser session gets latest rotation
    getEventRegistrationCount(activeSlug)
      .then((count) => {
        setRegistrationCount(count);
        const rotation = resolveActivePaymentConfig(event, count);
        setEvent((prev) => ({
          ...prev,
          upi_id: rotation.activeConfig.upi_id,
          qr_image_url: rotation.activeConfig.qr_image_url,
        }));
      })
      .catch(() => { });
  };

  return (
    <div className="app-layout">
      <Header
        title="ECK-RTU Alumni Kota Chapter"
        tagline={event.tagline || '“दीप जले, यादें मुस्कुराएँ।”'}
      />

      <main className="main-content">
        <div className="content-container">
          {loading ? (
            <div className="page-loader">
              <div className="spinner" />
              <p>Loading event information...</p>
            </div>
          ) : currentStep === 'success' && submittedData ? (
            <SuccessPage
              event={event}
              formData={submittedData.formData}
              result={submittedData.result}
              onReset={handleResetRegistration}
            />
          ) : currentStep === 'form' ? (
            <div className="form-view">
              <div className="form-back-nav">
                <button
                  type="button"
                  onClick={() => setCurrentStep('overview')}
                  className="btn-back-link"
                >
                  ← Back to Event Details
                </button>
              </div>

              <div className="form-event-summary-bar">
                <span className="summary-title">{event.event_name}</span>
                <span className="summary-fee">₹800 Single • ₹1,500 Couple</span>
              </div>

              <RegistrationForm
                event={event}
                onSuccess={handleRegistrationSuccess}
                initialData={preloadedFormData}
                existingRegistration={preloadedRegistration}
              />
            </div>
          ) : (
            <div className="overview-view">
              <EventCard
                event={event}
                onRegisterClick={handleStartRegistration}
                onManageRegistrationClick={handleOpenManageModal}
              />

              {/* Dedicated Highlight Card: Alumni Gate Pass & ID Card */}
              {showIdCards && (
                <section className="idpass-home-feature-card" aria-label="Alumni ID Card and Entry Pass">
                  <div className="idpass-ticket-notch idpass-ticket-notch-left" aria-hidden="true" />
                  <div className="idpass-ticket-notch idpass-ticket-notch-right" aria-hidden="true" />
                  <div className="idpass-feature-glow" />
                  
                  <div className="idpass-feature-inner">
                    <div className="idpass-feature-top">
                      <span className="idpass-live-pill">
                        <span className="badge-dot pulse-gold">●</span> OFFICIAL ENTRY PASS
                      </span>
                      <span className="idpass-corner-stamp">FAST-TRACK GATE ENTRY</span>
                    </div>

                    <div className="idpass-feature-body">
                      <div className="idpass-feature-content">
                        <h3 className="idpass-title">
                          <span className="idpass-emoji-glyph">🎟️</span>
                          <span>Alumni Event Pass &amp; Digital ID Card</span>
                        </h3>
                        <p className="idpass-desc">
                          Already registered? Access your verified digital QR pass with roll number &amp; batch for fast-track college gate entry.
                        </p>
                      </div>
                      <div className="idpass-qr-visual" aria-hidden="true">
                        <svg className="idpass-mini-qr" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <rect x="2" y="2" width="8" height="8" rx="1.5" stroke="#f59e0b" strokeWidth="1.8" fill="rgba(245,158,11,0.15)" />
                          <rect x="14" y="2" width="8" height="8" rx="1.5" stroke="#f59e0b" strokeWidth="1.8" fill="rgba(245,158,11,0.15)" />
                          <rect x="2" y="14" width="8" height="8" rx="1.5" stroke="#f59e0b" strokeWidth="1.8" fill="rgba(245,158,11,0.15)" />
                          <rect x="4.5" y="4.5" width="3" height="3" fill="#fbbf24" />
                          <rect x="16.5" y="4.5" width="3" height="3" fill="#fbbf24" />
                          <rect x="4.5" y="16.5" width="3" height="3" fill="#fbbf24" />
                          <path d="M14 14h3v3h-3zM18 18h4v4h-4zM14 20h3v2h-3zM20 14h2v3h-2z" fill="#f59e0b" />
                        </svg>
                        <span className="idpass-qr-tag">SCAN &amp; GO</span>
                      </div>
                    </div>

                    <div className="idpass-ticket-divider" aria-hidden="true">
                      <span className="idpass-ticket-divider-line" />
                      <span className="idpass-ticket-divider-badge">INSTANT ACCESS</span>
                      <span className="idpass-ticket-divider-line" />
                    </div>

                    <div className="idpass-feature-cta-wrap">
                      <Link to="/id-card" className="btn btn-idpass-feature-primary" id="btn-home-download-pass">
                        <span className="btn-ticket-icon">🎟️</span>
                        <span>Download / View Pass</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </section>
              )}

              {/* Event Highlights & Features for Alumni */}
              <div className="event-perks-section">
                <h3 className="section-title">What to Expect</h3>
                <div className="perks-grid">
                  <div className="perk-card">
                    <div className="perk-emoji">🤝</div>
                    <div className="perk-content">
                      <h4>Batch Reunions</h4>
                      <p>Reconnect with your classmates, professors, and juniors across all disciplines.</p>
                    </div>
                  </div>

                  <div className="perk-card">
                    <div className="perk-emoji">🎙️</div>
                    <div className="perk-content">
                      <h4>Nostalgia &amp; Stories</h4>
                      <p>Relive college memories, hostel days, canteen addas, and campus traditions.</p>
                    </div>
                  </div>

                  <div className="perk-card">
                    <div className="perk-emoji">🍽️</div>
                    <div className="perk-content">
                      <h4>Gala Dinner</h4>
                      <p>An authentic Rajasthani festive dinner spread with cultural celebrations.</p>
                    </div>
                  </div>

                  <div className="perk-card">
                    <div className="perk-emoji">🌐</div>
                    <div className="perk-content">
                      <h4>Alumni Directory</h4>
                      <p>Grow our active professional and mentorship network across India and globally.</p>
                    </div>
                  </div>
                </div>

                <div className="bottom-cta-wrap">
                  <button
                    type="button"
                    onClick={handleStartRegistration}
                    className="btn btn-festive-primary btn-large btn-block"
                  >
                    <span>Register for DeepAura 2K26</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Self-service Manage Registration Modal */}
      <ManageRegistrationModal
        isOpen={isManageModalOpen}
        event={event}
        onClose={() => setIsManageModalOpen(false)}
        onSelectForEdit={handleSelectRegistrationForEdit}
        onNewRegistration={handleStartRegistration}
      />

      <footer className="site-footer">
        <div className="footer-content">
          <div className="footer-logos-row">
            <img src="/logo-eck.png" alt="ECK Kota" className="footer-crest-img" width="44" height="44" />
            <img src="/logo-rtu.png" alt="RTU Kota" className="footer-crest-img" width="44" height="44" />
          </div>
          <p className="footer-org-name">ECK-RTU Alumni Kota Chapter</p>
          <p className="footer-tagline-text">“दीप जले, यादें मुस्कुराएँ।”</p>
          <p className="footer-sub">
            ECK-RTU Alumni DeepAura 2K26 • Kota, Rajasthan
          </p>
          <p className="footer-copyright">
            © {new Date().getFullYear()} ECK-RTU Alumni Kota Chapter. All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};
