import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { EventCard } from '../components/EventCard';
import { RegistrationForm } from '../components/RegistrationForm';
import { SuccessPage } from '../components/SuccessPage';
import { ManageRegistrationModal } from '../components/ManageRegistrationModal';
import { EventMemoryWall } from '../components/EventMemoryWall';
import { supabase } from '../lib/supabase';
import { convertLookupToFormData, getEventRegistrationCount } from '../lib/registrations';
import { resolveActivePaymentConfig } from '../lib/paymentRotation';
import { isAlumniIdCardsEnabled } from '../lib/gate';
import {
  getRegistrationStatusInfo,
  syncEventRegistrationStatus,
  isRegistrationClosed,
  isEventConcluded,
} from '../lib/eventStatus';
import type {
  ECKEvent,
  RegistrationFormData,
  RegistrationResult,
  ExistingRegistrationLookup,
} from '../types';
import {
  ArrowLeft,
  ArrowRight,
  Ticket,
  Users,
  Search,
  Lock,
  MessageSquare,
  Utensils,
  Globe,
  Loader2,
} from 'lucide-react';

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
  upi_id: null,
  banner_image_url: '/deepaura-banner.jpg',
  tagline: '“दीप जले, यादें मुस्कुराएँ।”',
  theme_primary_color: '#f59e0b',
  theme_accent_color: '#d97706',
  qr_image_url: null,
  upi_rotation_configs: null,
  status: 'OPEN',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const EventPage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
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
        let rawEvent: ECKEvent | null = null;
        let resolvedSlug = slug;

        if (slug) {
          const { data, error } = await supabase
            .from('events')
            .select('*')
            .eq('event_slug', slug)
            .single();

          if (!error && data) {
            rawEvent = data as ECKEvent;
          }
        } else {
          // Automatic nearest active/upcoming event discovery on root path '/'
          const { data: openEvents } = await supabase
            .from('events')
            .select('*')
            .eq('status', 'OPEN')
            .order('event_date', { ascending: true })
            .limit(1);

          if (openEvents && openEvents.length > 0) {
            rawEvent = openEvents[0] as ECKEvent;
          } else {
            const todayStr = new Date().toISOString().split('T')[0];
            const { data: upcomingEvents } = await supabase
              .from('events')
              .select('*')
              .gte('event_date', todayStr)
              .order('event_date', { ascending: true })
              .limit(1);

            if (upcomingEvents && upcomingEvents.length > 0) {
              rawEvent = upcomingEvents[0] as ECKEvent;
            } else {
              const { data: recentEvents } = await supabase
                .from('events')
                .select('*')
                .order('event_date', { ascending: false })
                .limit(1);

              if (recentEvents && recentEvents.length > 0) {
                rawEvent = recentEvents[0] as ECKEvent;
              }
            }
          }
        }

        if (!rawEvent) {
          rawEvent = { ...DEFAULT_EVENT, event_slug: resolvedSlug || DEFAULT_EVENT.event_slug };
        }
        resolvedSlug = rawEvent.event_slug;

        const regCount = await getEventRegistrationCount(resolvedSlug);

        // Check database-driven registration deadline and maintain in Supabase events table
        const deadlineInfo = getRegistrationStatusInfo(rawEvent);
        if (deadlineInfo.isClosed) {
          rawEvent.status = 'CLOSED';
        }

        // Maintain in the Supabase events table
        syncEventRegistrationStatus(resolvedSlug, rawEvent.status, rawEvent.registration_closes_at).catch(() => {});

        const rotation = resolveActivePaymentConfig(rawEvent, regCount);

        if (isMounted) {
          setRegistrationCount(regCount);
          setEvent({
            ...rawEvent,
            upi_id: rotation.activeConfig.upi_id,
            qr_image_url: rotation.activeConfig.qr_image_url || null,
          });
        }
      } catch (err) {
        console.warn('Event fetch error handled:', err);
        const rotation = resolveActivePaymentConfig(DEFAULT_EVENT, 0);
        const deadlineInfo = getRegistrationStatusInfo(DEFAULT_EVENT);
        const fallbackStatus = deadlineInfo.isClosed ? 'CLOSED' : DEFAULT_EVENT.status;
        if (isMounted) {
          setEvent({
            ...DEFAULT_EVENT,
            status: fallbackStatus,
            upi_id: rotation.activeConfig.upi_id,
            qr_image_url: rotation.activeConfig.qr_image_url || null,
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
  }, [slug]);

  // Apply dynamic theming based on event config
  useEffect(() => {
    if (event.theme_primary_color && event.theme_primary_color !== '#6366f1') {
      document.documentElement.style.setProperty('--primary', event.theme_primary_color);
    }
    if (event.theme_accent_color) {
      document.documentElement.style.setProperty('--accent', event.theme_accent_color);
    }
  }, [event.theme_primary_color, event.theme_accent_color]);

  const handleStartRegistration = () => {
    if (isRegistrationClosed(event) || event.status === 'CLOSED') {
      return;
    }
    setPreloadedRegistration(null);
    setPreloadedFormData(null);
    setCurrentStep('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Refresh live count right before registration to ensure up-to-date rotation
    getEventRegistrationCount(event.event_slug)
      .then((count) => {
        setRegistrationCount(count);
        const rotation = resolveActivePaymentConfig(event, count);
        setEvent((prev) => ({
          ...prev,
          upi_id: rotation.activeConfig.upi_id,
          qr_image_url: rotation.activeConfig.qr_image_url || null,
        }));
      })
      .catch(() => {});
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
        qr_image_url: rotation.activeConfig.qr_image_url || null,
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
    getEventRegistrationCount(event.event_slug)
      .then((count) => {
        setRegistrationCount(count);
        const rotation = resolveActivePaymentConfig(event, count);
        setEvent((prev) => ({
          ...prev,
          upi_id: rotation.activeConfig.upi_id,
          qr_image_url: rotation.activeConfig.qr_image_url || null,
        }));
      })
      .catch(() => {});
  };

  const handleEditSubmittedRegistration = () => {
    if (!submittedData) return;
    setPreloadedRegistration({
      found: true,
      registration_id: submittedData.result.registration_id,
      registration_number: submittedData.result.registration_number,
      attendance_status: (submittedData.formData.attendance_status || 'maybe') as any,
      number_of_attendees: submittedData.formData.number_of_attendees || 1,
      adults_count: submittedData.formData.adults_count ?? 1,
      children_above_7_count: submittedData.formData.children_above_7_count ?? 0,
      children_under_7_count: submittedData.formData.children_under_7_count ?? 0,
      amount: submittedData.result.amount || 0,
    });
    setPreloadedFormData(submittedData.formData);
    setSubmittedData(null);
    setCurrentStep('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0c16] text-slate-100 flex flex-col overflow-x-hidden">
      <Header
        title="ECK-RTU Alumni Kota Chapter"
        tagline={event.tagline || '“दीप जले, यादें मुस्कुराएँ।”'}
        currentEventSlug={event.event_slug}
        maxWidth="max-w-3xl"
      />

      <main className="flex-1 w-full max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[45vh] gap-3 text-amber-400">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm font-medium text-slate-300">Loading event details...</p>
          </div>
        ) : currentStep === 'success' && submittedData ? (
          <SuccessPage
            event={event}
            formData={submittedData.formData}
            result={submittedData.result}
            onReset={handleResetRegistration}
            onEdit={handleEditSubmittedRegistration}
          />
        ) : currentStep === 'form' ? (
          <div className="w-full space-y-4">
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setCurrentStep('overview')}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-300 hover:text-amber-400 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Event Details</span>
              </button>
            </div>

            {event.status === 'CLOSED' || isRegistrationClosed(event) ? (
              <div className="rounded-2xl border border-rose-500/30 bg-slate-900/90 p-5 sm:p-8 space-y-5 shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    <Lock className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white">Online Registration is Closed</h2>
                    <p className="text-xs sm:text-sm text-slate-300">
                      Online registrations for {event.event_name} are closed as per schedule.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5 space-y-3">
                  <h4 className="text-sm sm:text-base font-bold text-amber-300 flex items-center gap-2">
                    <span>⚡ Spot Walk-in Registration at College Gate</span>
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-300">
                    Missed registering online? You can still attend! Please visit the Spot Walk-in Registration Desk at the ECK Campus Gate on the event day.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-300">
                      Adults: ₹{(event.pricing_config?.spot_adult || 1000).toLocaleString('en-IN')} / person
                    </span>
                    <span className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300">
                      Kids (10+ yrs): ₹{(event.pricing_config?.spot_child_above_10 || 500).toLocaleString('en-IN')}
                    </span>
                    <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-400">
                      Kids (&lt;10 yrs): Free
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStep('overview')}
                    className="flex min-h-[48px] items-center justify-center rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-md transition-all hover:brightness-110 cursor-pointer active:scale-[0.99]"
                  >
                    Back to Event Details
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenManageModal}
                    className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-medium text-slate-200 transition-all hover:bg-slate-700 hover:text-white cursor-pointer active:bg-slate-600"
                  >
                    <Search className="h-4 w-4 text-amber-400" />
                    <span>Lookup Existing Registration / Pass</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                  <span className="text-sm font-semibold text-amber-200">{event.event_name}</span>
                  <span className="text-xs sm:text-sm font-medium text-amber-300">
                    {`₹${(event.pricing_config?.single_adult || event.registration_fee || 800).toLocaleString('en-IN')} Single • ₹${(event.pricing_config?.couple || 1500).toLocaleString('en-IN')} Couple`}
                  </span>
                </div>

                <RegistrationForm
                  event={event}
                  onSuccess={handleRegistrationSuccess}
                  initialData={preloadedFormData}
                  existingRegistration={preloadedRegistration}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full space-y-6 sm:space-y-8">
            <EventCard
              event={event}
              onRegisterClick={handleStartRegistration}
              onManageRegistrationClick={handleOpenManageModal}
            />

            {/* Dedicated Highlight Card: Alumni Gate Pass & ID Card - hidden once event concludes */}
            {showIdCards && !isEventConcluded(event) && (
              <section
                className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-slate-900/90 to-orange-500/10 p-4 sm:p-6 shadow-xl backdrop-blur-md"
                aria-label="Alumni ID Card and Entry Pass"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      ENTRY PASS • Fast-Track Gate Entry
                    </span>

                    <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                      <Ticket className="h-5 w-5 text-amber-400" />
                      <span>Alumni Event Pass &amp; Digital ID</span>
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                      Already registered? Download or view your verified QR pass on your phone for fast college gate entry.
                    </p>
                  </div>

                  <div className="shrink-0 pt-2 sm:pt-0">
                    <Link
                      to="/id-card"
                      className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-5 py-3 text-sm font-bold !text-slate-950 shadow-md shadow-amber-500/25 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
                      id="btn-home-download-pass"
                    >
                      <Ticket className="h-4 w-4 text-slate-950" />
                      <span className="!text-slate-950">Download / View Pass</span>
                      <ArrowRight className="h-4 w-4 text-slate-950" />
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* Alumni Directory & Help Portal Spotlight */}
            <section
              className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-slate-900/90 to-indigo-500/10 p-4 sm:p-6 shadow-xl backdrop-blur-md"
              aria-label="Alumni Directory and Help"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    ALUMNI NETWORK • Directory &amp; Help Desk
                  </span>

                  <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-400" />
                    <span>Alumni Directory &amp; Help Connect</span>
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                    Looking for guidance in your engineering department or settling into a new city? Search alumni by department, location, or update your profile.
                  </p>
                </div>

                <div className="shrink-0 pt-2 sm:pt-0">
                  <Link
                    to="/directory"
                    className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition-all hover:brightness-110 active:scale-[0.99]"
                  >
                    <Search className="h-4 w-4" />
                    <span>Explore Alumni Directory</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </section>

            {/* Event Highlights & Features for Alumni */}
            <div className="space-y-4">
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">What to Expect</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex items-start gap-3.5 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm sm:text-base font-bold text-slate-100">Batch Reunions</h4>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                      Reconnect with your classmates, professors, and juniors across all disciplines.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm sm:text-base font-bold text-slate-100">Nostalgia &amp; Stories</h4>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                      Relive college memories, hostel days, canteen addas, and campus traditions.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Utensils className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm sm:text-base font-bold text-slate-100">Gala Dinner</h4>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                      An authentic Rajasthani festive dinner spread with cultural celebrations.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm sm:text-base font-bold text-slate-100">Alumni Directory</h4>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                      Grow our active professional and mentorship network across India and globally.
                    </p>
                  </div>
                </div>
              </div>

              {event.status === 'OPEN' && !isRegistrationClosed(event) && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleStartRegistration}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 py-3.5 px-6 text-base font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
                  >
                    <span>Register for {event.event_name}</span>
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Live Event Memories & Highlights */}
            <EventMemoryWall event={event} />
          </div>
        )}
      </main>

      {/* Self-service Manage Registration Modal */}
      <ManageRegistrationModal
        isOpen={isManageModalOpen}
        event={event}
        onClose={() => setIsManageModalOpen(false)}
        onSelectForEdit={handleSelectRegistrationForEdit}
        onNewRegistration={handleStartRegistration}
      />

      <footer className="w-full border-t border-slate-800 bg-[#07080f] py-8 px-4 text-center mt-auto">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo-eck.png"
              alt="ECK Kota"
              className="h-10 w-10 rounded-full border border-amber-500/30 bg-slate-900 object-contain p-0.5"
              width="40"
              height="40"
            />
            <img
              src="/logo-rtu.png"
              alt="RTU Kota"
              className="h-10 w-10 rounded-full border border-amber-400/30 bg-slate-900 object-contain p-0.5"
              width="40"
              height="40"
            />
          </div>
          <p className="text-sm font-semibold text-slate-200">ECK-RTU Alumni Kota Chapter</p>
          <p className="text-xs text-amber-400/90 font-medium">{event.tagline || '“दीप जले, यादें मुस्कुराएँ।”'}</p>
          <p className="text-xs text-slate-400">
            {event.event_name} • Kota, Rajasthan
          </p>
          <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/60 w-full max-w-xs">
            © {new Date().getFullYear()} ECK-RTU Alumni Kota Chapter. All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};
