import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { EventCard } from '../components/EventCard';
import { RegistrationForm } from '../components/RegistrationForm';
import { SuccessPage } from '../components/SuccessPage';
import { ManageRegistrationModal } from '../components/ManageRegistrationModal';
import { supabase } from '../lib/supabase';
import { convertLookupToFormData } from '../lib/registrations';
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
  upi_id: 'eckalumni@upi',
  banner_image_url: '/deepaura-banner.jpg',
  tagline: '“दीप जले, यादें मुस्कुराएँ।”',
  theme_primary_color: '#6366f1',
  theme_accent_color: '#f59e0b',
  qr_image_url: '/upi-qr.svg',
  status: 'OPEN',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const EventPage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const activeSlug = slug || 'deepaura-2k26';

  const [event, setEvent] = useState<ECKEvent>(DEFAULT_EVENT);
  const [loading, setLoading] = useState(true);
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
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('event_slug', activeSlug)
          .single();

        if (error || !data) {
          console.log('Using default event configuration for:', activeSlug);
          if (isMounted) {
            setEvent({
              ...DEFAULT_EVENT,
              event_slug: activeSlug,
            });
          }
        } else if (isMounted) {
          setEvent(data as ECKEvent);
        }
      } catch (err) {
        console.warn('Event fetch error handled:', err);
        if (isMounted) setEvent(DEFAULT_EVENT);
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
  };

  const handleResetRegistration = () => {
    setSubmittedData(null);
    setPreloadedRegistration(null);
    setPreloadedFormData(null);
    setCurrentStep('overview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
                    className="btn btn-primary btn-large btn-block"
                  >
                    <span>Register for DeepAura 2K26</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenManageModal}
                    className="btn btn-secondary-festive btn-block"
                    style={{ marginTop: '0.75rem' }}
                  >
                    <span>🔍 Already Registered? View / Update Details</span>
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
