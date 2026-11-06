import React, { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { IdCardPass } from '../components/IdCardPass';
import {
  lookupRegistrationByMobile,
  lookupRegistrationByRegNumber,
  fetchAllRegistrationsForLookup,
  cleanMobileNumber,
  formatRegistrationNumberInput,
} from '../lib/registrations';
import {
  isAlumniIdCardsEnabled,
  isGatePassReleased,
  compressAttendeePhoto,
  uploadAndSaveAttendeePhoto,
  markIdCardDownloaded,
} from '../lib/gate';
import { supabase } from '../lib/supabase';
import { isEventConcluded } from '../lib/eventStatus';
import { getBatchFromPassingYear } from '../lib/batchUtils';
import { ArrowLeft, Download, Camera, Check, Shield, Search, X, MessageCircle } from 'lucide-react';
import type { ExistingRegistrationLookup, ECKEvent } from '../types';

const ID_PASS_LOCKED_MSG = 'Oops! ID Pass Locked 🔒 — Register, pay, and unlock your pass!';

// Feature Flag: Reads VITE_IS_GATE_PASS_RELEASED from .env (defaults to false until released)
const IS_GATE_PASS_RELEASED = isGatePassReleased();

function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export const IdCardPage: React.FC = () => {
  const isEnabled = isAlumniIdCardsEnabled();
  const [searchParams, setSearchParams] = useSearchParams();
  const [eventsList, setEventsList] = useState<ECKEvent[]>([]);
  const [searchMode, setSearchMode] = useState<'mobile' | 'reg_number' | 'name'>('reg_number');
  const [mobileInput, setMobileInput] = useState('');
  const [regInput, setRegInput] = useState('');
  const [nameSearchQuery, setNameSearchQuery] = useState('');
  const [allRegistrations, setAllRegistrations] = useState<ExistingRegistrationLookup[]>([]);
  const [loadingAllRegistrations, setLoadingAllRegistrations] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [registration, setRegistration] = useState<ExistingRegistrationLookup | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [imageCopiedHint, setImageCopiedHint] = useState(false);
  const [selfiePrompt, setSelfiePrompt] = useState<string | null>(null);
  const [selfieSkipped, setSelfieSkipped] = useState(false);
  const [passViewMode, setPassViewMode] = useState<'entry' | 'social'>('social');
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [showPhoneVerifyModal, setShowPhoneVerifyModal] = useState(false);
  const [verifyPhoneInput, setVerifyPhoneInput] = useState('');
  const [verifyPhoneError, setVerifyPhoneError] = useState<string | null>(null);

  const entryCardRef = useRef<HTMLDivElement | null>(null);
  const socialCardRef = useRef<HTMLDivElement | null>(null);
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const verifyPhoneInputRef = useRef<HTMLInputElement | null>(null);

  const cachedEntryBlobRef = useRef<Blob | null>(null);
  const cachedEntryDataUrlRef = useRef<string | null>(null);
  const cachedSocialBlobRef = useRef<Blob | null>(null);
  const cachedSocialDataUrlRef = useRef<string | null>(null);

  // Default Event Details
  const defaultEvent: ECKEvent = {
    id: 'deepaura-2026',
    event_name: 'ECK-RTU Alumni DeepAura 2K26',
    event_slug: 'deepaura-2k26',
    event_code: 'REG',
    event_date: '2026-11-01',
    event_time: '5:00 PM onwards',
    location: 'Agora Ground, ECK-RTU Campus, Kota',
    description: 'Nostalgic reunion, networking, dinner & Diwali celebrations.',
    registration_fee: 800,
    upi_id: null,
    banner_image_url: '/deepaura-banner.jpg',
    tagline: '“दीप जले, यादें मुस्कुराएँ।”',
    theme_primary_color: '#f59e0b',
    theme_accent_color: '#d97706',
    qr_image_url: null,
    status: 'OPEN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const [activeEvent, setActiveEvent] = useState<ECKEvent>(defaultEvent);
  const isConcluded = isEventConcluded(activeEvent);

  // Load available events and resolve active event based on query param or status
  useEffect(() => {
    let isMounted = true;
    async function loadEvents() {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .order('event_date', { ascending: false });

        if (!error && data && data.length > 0 && isMounted) {
          const list = data as ECKEvent[];
          setEventsList(list);

          const eventParam = searchParams.get('event');
          const matched = eventParam
            ? list.find((e) => e.event_slug === eventParam)
            : null;

          if (matched) {
            setActiveEvent(matched);
          } else {
            const openEv = list.find((e) => e.status === 'OPEN');
            setActiveEvent(openEv || list[0]);
          }
        }
      } catch (err) {
        console.warn('Failed to load events for ID cards:', err);
      }
    }
    loadEvents();
    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  // If feature is disabled by .env flag
  if (!isEnabled) {
    return (
      <div className="min-h-screen bg-[#0a0c16] text-slate-100 flex flex-col">
        <Header currentEventSlug={activeEvent.event_slug} maxWidth="max-w-3xl" />
        <main className="w-full max-w-3xl mx-auto px-3 sm:px-4 py-6 flex-1 flex flex-col items-center">
          <div className="w-full mb-4">
            <Link to="/" className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Event Details</span>
            </Link>
          </div>
          <div className="w-full max-w-md bg-slate-900/90 border border-amber-500/30 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-xl backdrop-blur-md">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl">
              ⏳
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">ID Card Generation Opening Soon</h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Event ID Pass generation will be enabled <strong className="text-white">4 to 5 days prior to the event</strong>.
            </p>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-amber-200/90 flex flex-col gap-1 text-left">
              <span>Event Date: <strong className="text-white">1st November 2026</strong></span>
              <span>Venue: <strong className="text-white">Agora Ground, ECK-RTU, Kota</strong></span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Please ensure you have completed your registration and payment verification in advance so your pass is ready for instant download.
            </p>
            <div className="pt-2">
              <Link
                to="/"
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-colors inline-flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Event Registration</span>
              </Link>
            </div>
          </div>
        </main>
        <Footer
          eventName={activeEvent.event_name}
          tagline={activeEvent.tagline}
          location={activeEvent.location}
        />
      </div>
    );
  }

  // Resolve existing photo from DB or directly from storage bucket if DB record lacks photo_url
  const resolvePhotoWithStorageFallback = async (reg: ExistingRegistrationLookup): Promise<string | null> => {
    if (reg.photo_url) return reg.photo_url;
    if (!reg.alumni) return null;

    try {
      const cleanName = (reg.alumni.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'alumni';
      const contact = cleanMobileNumber(reg.alumni.mobile || '');
      if (!contact) return null;

      const fileName = `${cleanName}_${contact}.jpg`;
      const { data } = supabase.storage.from('id-photos').getPublicUrl(fileName);
      if (data?.publicUrl) {
        // Quick verification if photo file exists in storage
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const check = await fetch(data.publicUrl, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeoutId);
        if (check.ok) {
          return `${data.publicUrl}?t=${Date.now()}`;
        }
      }
    } catch {
      // Ignore if HEAD check fails or CORS blocks HEAD
    }
    return null;
  };

  // Reusable Phone Number Lookup
  const executeLookup = async (mobileToSearch: string) => {
    const clean = cleanMobileNumber(mobileToSearch);
    if (clean.length < 10) {
      setErrorMsg('Please enter a valid 10-digit registered mobile number.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setRegistration(null);
    setDownloadSuccess(false);

    try {
      const res = await lookupRegistrationByMobile(activeEvent.event_slug, clean);
      if (!res.found || !res.alumni) {
        setErrorMsg(ID_PASS_LOCKED_MSG);
        setLoading(false);
        return;
      }

      // Check attendance & payment status - only confirmed 'yes' (Attending) can download ID pass
      if (res.attendance_status !== 'yes') {
        setErrorMsg(ID_PASS_LOCKED_MSG);
        setLoading(false);
        return;
      }

      const existingPhoto = await resolvePhotoWithStorageFallback(res);
      const enrichedRes = { ...res, photo_url: existingPhoto || res.photo_url };
      cachedEntryBlobRef.current = null;
      cachedEntryDataUrlRef.current = null;
      cachedSocialBlobRef.current = null;
      cachedSocialDataUrlRef.current = null;
      setRegistration(enrichedRes);
      setIsPhoneVerified(true);
      setPassViewMode(IS_GATE_PASS_RELEASED ? 'entry' : 'social');
      if (existingPhoto) {
        setPhotoPreview(existingPhoto);
      } else {
        setPhotoPreview(null);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to search registration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Reusable Registration Number Lookup (formats digits to REG-XXXXX with up to 5 digits, prepending 0s)
  const executeRegLookup = async (rawRegOrDigits: string) => {
    const rawClean = (rawRegOrDigits || '').trim();
    const digitsOnly = rawClean.replace(/\D/g, '');
    const numValue = Number(digitsOnly);
    const eventPrefix = (activeEvent.event_code || 'REG').toUpperCase();

    setLoading(true);
    setErrorMsg(null);
    setRegistration(null);
    setDownloadSuccess(false);

    // 1. Instant check in preloaded allRegistrations (matches Gate Verification Portal)
    if (allRegistrations && allRegistrations.length > 0 && digitsOnly) {
      const matchInMem = allRegistrations.find((r) => {
        const rDigits = (r.registration_number || '').replace(/\D/g, '');
        return (
          r.registration_number?.toUpperCase() === rawClean.toUpperCase() ||
          rDigits === digitsOnly ||
          (numValue > 0 && Number(rDigits) === numValue)
        );
      });

      if (matchInMem && matchInMem.alumni) {
        if (matchInMem.attendance_status !== 'yes') {
          setErrorMsg(ID_PASS_LOCKED_MSG);
          setLoading(false);
          return;
        }

        const existingPhoto = await resolvePhotoWithStorageFallback(matchInMem);
        const enrichedRes = { ...matchInMem, photo_url: existingPhoto || matchInMem.photo_url };
        cachedEntryBlobRef.current = null;
        cachedEntryDataUrlRef.current = null;
        cachedSocialBlobRef.current = null;
        cachedSocialDataUrlRef.current = null;
        setRegistration(enrichedRes);
        setIsPhoneVerified(false);
        setPassViewMode('social');
        setVerifyPhoneInput('');
        setVerifyPhoneError(null);
        if (existingPhoto) {
          setPhotoPreview(existingPhoto);
        } else {
          setPhotoPreview(null);
        }
        setLoading(false);
        return;
      }
    }

    // 2. Network RPC / Table Lookup
    const formattedReg = formatRegistrationNumberInput(rawRegOrDigits, eventPrefix);
    if (!formattedReg) {
      setErrorMsg('Please enter a valid numeric registration number (up to 5 digits).');
      setLoading(false);
      return;
    }

    try {
      const res = await lookupRegistrationByRegNumber(activeEvent.event_slug, formattedReg, eventPrefix);
      if (!res.found || !res.alumni) {
        setErrorMsg(ID_PASS_LOCKED_MSG);
        setLoading(false);
        return;
      }

      // Check attendance & payment status - only confirmed 'yes' (Attending) can download ID pass
      if (res.attendance_status !== 'yes') {
        setErrorMsg(ID_PASS_LOCKED_MSG);
        setLoading(false);
        return;
      }

      const existingPhoto = await resolvePhotoWithStorageFallback(res);
      const enrichedRes = { ...res, photo_url: existingPhoto || res.photo_url };
      cachedEntryBlobRef.current = null;
      cachedEntryDataUrlRef.current = null;
      cachedSocialBlobRef.current = null;
      cachedSocialDataUrlRef.current = null;
      setRegistration(enrichedRes);
      setIsPhoneVerified(false);
      setPassViewMode('social');
      setVerifyPhoneInput('');
      setVerifyPhoneError(null);
      if (existingPhoto) {
        setPhotoPreview(existingPhoto);
      } else {
        setPhotoPreview(null);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to search registration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Mobile Form Submit
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    executeLookup(mobileInput);
  };

  // Handle Registration Number Form Submit
  const handleRegLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digitsOnly = regInput.replace(/\D/g, '').slice(0, 5);
    if (!digitsOnly) {
      setErrorMsg('Please enter your registration number (e.g. 39 or 00039).');
      return;
    }
    const eventPrefix = (activeEvent.event_code || 'REG').toUpperCase();
    const padLen = eventPrefix === 'REG' ? 5 : 4;
    const padded = digitsOnly.padStart(padLen, '0');
    setRegInput(padded);
    executeRegLookup(padded);
  };

  // Pre-load event registrations once for instant in-memory lookup (matching Gate Verification Portal)
  useEffect(() => {
    let isMounted = true;
    setLoadingAllRegistrations(true);

    fetchAllRegistrationsForLookup(activeEvent.event_slug)
      .then((list) => {
        if (isMounted) setAllRegistrations(list);
      })
      .catch((err) => {
        console.warn('Preload registrations failed:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingAllRegistrations(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeEvent.event_slug]);

  // Instant In-Memory Predictive Search Filter (0ms delay on keystrokes)
  const filteredNameRegistrations = React.useMemo(() => {
    const query = nameSearchQuery.trim().toLowerCase();
    if (!query || query.length < 2) return [];

    const tokens = query.split(/\s+/).filter(Boolean);

    return allRegistrations
      .filter((reg) => {
        const alumni = reg.alumni;
        if (!alumni) return false;

        const name = (alumni.name || '').toLowerCase();
        const branch = (alumni.engineering_discipline || '').toLowerCase();
        const year = String(alumni.year_of_passing || '');
        const batchStr = (alumni.batch || (alumni.year_of_passing ? getBatchFromPassingYear(alumni.year_of_passing) : '')).toLowerCase();
        const mobile = cleanMobileNumber(alumni.mobile || '');
        const regNo = (reg.registration_number || '').toLowerCase();
        const city = (alumni.city || '').toLowerCase();
        const org = (alumni.organization || '').toLowerCase();

        return tokens.every(
          (token) =>
            name.includes(token) ||
            branch.includes(token) ||
            batchStr.includes(token) ||
            year.includes(token) ||
            mobile.includes(token) ||
            regNo.includes(token) ||
            city.includes(token) ||
            org.includes(token)
        );
      })
      .slice(0, 25);
  }, [allRegistrations, nameSearchQuery]);

  // Handle Attendee Selection from Name Search Results
  const handleSelectAttendee = async (reg: ExistingRegistrationLookup) => {
    if (reg.attendance_status !== 'yes') {
      setErrorMsg(ID_PASS_LOCKED_MSG);
      return;
    }

    const existingPhoto = await resolvePhotoWithStorageFallback(reg);
    const enrichedReg = { ...reg, photo_url: existingPhoto || reg.photo_url };
    cachedEntryBlobRef.current = null;
    cachedEntryDataUrlRef.current = null;
    cachedSocialBlobRef.current = null;
    cachedSocialDataUrlRef.current = null;
    setRegistration(enrichedReg);
    setIsPhoneVerified(false);
    setPassViewMode('social');
    setVerifyPhoneInput('');
    setVerifyPhoneError(null);
    if (existingPhoto) {
      setPhotoPreview(existingPhoto);
    } else {
      setPhotoPreview(null);
    }
    setErrorMsg(null);
    setSelfiePrompt(null);
    setSelfieSkipped(false);
    setDownloadSuccess(false);
  };

  // Handle Registered Phone Verification to unlock Gate Entry QR
  const handleVerifyPhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const inputClean = cleanMobileNumber(verifyPhoneInput);
    const actualClean = cleanMobileNumber(registration?.alumni?.mobile || '');

    if (inputClean.length !== 10) {
      setVerifyPhoneError('Please enter a valid 10-digit registered mobile number.');
      return;
    }

    if (inputClean === actualClean) {
      cachedEntryBlobRef.current = null;
      cachedEntryDataUrlRef.current = null;
      setIsPhoneVerified(true);
      setVerifyPhoneError(null);
      setShowPhoneVerifyModal(false);
      setPassViewMode('entry');
    } else {
      setVerifyPhoneError('Mobile number does not match registration records. Please enter the number you used while registering.');
    }
  };

  // URL query param auto-lookup effect (?mobile=... or ?reg=... or ?name=...)
  useEffect(() => {
    const paramReg =
      searchParams.get('reg') ||
      searchParams.get('reg_number') ||
      searchParams.get('registration_number');

    if (paramReg) {
      const digits = paramReg.replace(/\D/g, '').slice(0, 5);
      if (digits) {
        const padded = digits.padStart(5, '0');
        setRegInput(padded);
        setSearchMode('reg_number');
        executeRegLookup(padded);
        return;
      }
    }

    const paramMobile = searchParams.get('mobile');
    if (paramMobile) {
      const clean = cleanMobileNumber(paramMobile);
      setMobileInput(clean);
      setSearchMode('mobile');
      if (clean.length >= 10) {
        executeLookup(clean);
        return;
      }
    }

    const paramName = searchParams.get('name') || searchParams.get('attendee');
    if (paramName) {
      setNameSearchQuery(paramName);
      setSearchMode('name');
    }
  }, [searchParams]);

  // Pre-generate Pass Images in background so mobile WhatsApp image share has 0ms delay
  // and never loses user gesture activation (avoiding NotAllowedError on mobile)
  useEffect(() => {
    if (!registration) {
      cachedEntryBlobRef.current = null;
      cachedEntryDataUrlRef.current = null;
      cachedSocialBlobRef.current = null;
      cachedSocialDataUrlRef.current = null;
      return;
    }

    // Invalidate cached entry pass if phone is not verified yet
    if (!isPhoneVerified) {
      cachedEntryBlobRef.current = null;
      cachedEntryDataUrlRef.current = null;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        // 1. Pre-generate Social Pass (QR Protected with Royal Seal) for instant WhatsApp share
        if (socialCardRef.current && active) {
          const socialUrl = await toPng(socialCardRef.current, {
            quality: 0.95,
            pixelRatio: 2.5,
            backgroundColor: '#071238',
            skipFonts: true,
            cacheBust: false,
          });
          if (active) {
            cachedSocialDataUrlRef.current = socialUrl;
            cachedSocialBlobRef.current = dataURLtoBlob(socialUrl);
          }
        }

        // 2. Pre-generate Official Entry Pass (with QR Code) strictly when user is phone-verified!
        if (isPhoneVerified && entryCardRef.current && active) {
          const entryUrl = await toPng(entryCardRef.current, {
            quality: 0.95,
            pixelRatio: 2.5,
            backgroundColor: '#071238',
            skipFonts: true,
            cacheBust: false,
          });
          if (active) {
            cachedEntryDataUrlRef.current = entryUrl;
            cachedEntryBlobRef.current = dataURLtoBlob(entryUrl);
          }
        }
      } catch (err) {
        console.warn('Background pass image preparation warning:', err);
      }
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [registration, photoPreview, selfieSkipped, isPhoneVerified, passViewMode]);

  // Handle Photo / Selfie Upload
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !registration?.registration_id) return;

    cachedEntryBlobRef.current = null;
    cachedEntryDataUrlRef.current = null;
    cachedSocialBlobRef.current = null;
    cachedSocialDataUrlRef.current = null;

    setUploadingPhoto(true);
    setErrorMsg(null);
    setSelfiePrompt(null);

    try {
      // 1. Compress image client-side to < 100KB WebP/JPEG
      const compressedBlob = await compressAttendeePhoto(file);

      // 2. Set local instant preview
      const localUrl = URL.createObjectURL(compressedBlob);
      setPhotoPreview(localUrl);

      // 3. Upload to Supabase Storage and link to registration
      const phoneForUpload = registration.alumni?.mobile || mobileInput;
      const personName = registration.alumni?.name || '';
      const regNumber = registration.registration_number || '';

      const uploadRes = await uploadAndSaveAttendeePhoto(
        registration.registration_id,
        phoneForUpload,
        compressedBlob,
        personName,
        regNumber
      );

      if (uploadRes.success && uploadRes.photoUrl) {
        setPhotoPreview(uploadRes.photoUrl);
        setRegistration((prev) => (prev ? { ...prev, photo_url: uploadRes.photoUrl } : null));
      }

      // Smoothly scroll to the top of the active pass card so attendee sees their updated photo!
      setTimeout(() => {
        const activeCard = passViewMode === 'social' ? socialCardRef.current : entryCardRef.current;
        activeCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    } catch (err: any) {
      console.error('Photo upload error:', err);
      setErrorMsg('Photo compression/upload encountered an issue. Using local preview for pass.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Download ID Card as High-Resolution PNG
  const handleDownload = async () => {
    // Check if selfie has been taken OR explicitly skipped
    const hasPhoto = Boolean(photoPreview || registration?.photo_url);
    if (!hasPhoto && !selfieSkipped) {
      setSelfiePrompt(
        "Almost there! Just add your selfie 📸✨ A pass without a photo is like Diwali without sweets! 🪔 Take a quick selfie to personalize your pass, or choose to skip."
      );
      return;
    }

    // If attempting to download Gate Entry Pass with QR, ensure phone ownership is verified
    if (passViewMode === 'entry' && !isPhoneVerified) {
      setVerifyPhoneError(null);
      setShowPhoneVerifyModal(true);
      return;
    }

    setSelfiePrompt(null);
    executeDownloadPass(passViewMode);
  };

  // Perform actual high-res pass download for specified mode
  const executeDownloadPass = async (modeToDownload: 'entry' | 'social') => {
    setDownloading(true);

    try {
      const isSocial = modeToDownload === 'social';
      const targetElement = isSocial ? socialCardRef.current : entryCardRef.current;
      const cachedUrl = isSocial ? cachedSocialDataUrlRef.current : cachedEntryDataUrlRef.current;

      let dataUrl = cachedUrl;
      if (!dataUrl && targetElement) {
        dataUrl = await toPng(targetElement, {
          quality: 0.95,
          pixelRatio: 2.5, // Crisp retina quality for phone screens
          backgroundColor: '#071238',
          skipFonts: true,
          cacheBust: false,
        });
      }

      if (!dataUrl) throw new Error('Pass element not ready for download');

      const regNum = registration?.registration_number || 'Pass';
      const cleanName = registration?.alumni?.name?.replace(/\s+/g, '_') || 'Pass';
      const filePrefix = isSocial ? 'ECK_Alumni_Social_Pass' : 'ECK_Alumni_Entry_Pass';

      const link = document.createElement('a');
      link.download = `${filePrefix}_${cleanName}_${regNum}.png`;
      link.href = dataUrl;
      link.click();

      // Record ID Card Download in Database strictly for Gate Entry Pass
      if (registration?.registration_id && !isSocial) {
        markIdCardDownloaded(registration.registration_id).catch(() => { });
      }
      setDownloadSuccess(true);
    } catch (err) {
      console.error('Download pass error:', err);
      alert('Unable to automatically download. You can also take a screenshot of your pass!');
    } finally {
      setDownloading(false);
    }
  };

  // Build WhatsApp Share Message with pass link & details
  const buildWhatsAppShareMessage = () => {
    if (!registration) return '';
    const alumni = registration.alumni;
    const name = alumni?.name || 'Alumnus';
    const regNum = registration.registration_number || 'Pass';
    const discipline = alumni?.engineering_discipline ? `${alumni.engineering_discipline}` : '';
    const batchName = alumni?.batch || (alumni?.year_of_passing ? getBatchFromPassingYear(alumni.year_of_passing) : '');
    const batch = batchName ? `Batch ${batchName}` : '';
    const branchAndBatch = [discipline, batch].filter(Boolean).join(' • ');

    const totalGuests =
      registration.number_of_attendees && registration.number_of_attendees > 1
        ? `${registration.number_of_attendees} Attendee(s)`
        : null;

    const baseUrl =
      typeof window !== 'undefined' && window.location.origin
        ? `${window.location.origin}/id-card`
        : 'https://eck-alumni-events.pages.dev/id-card';

    const eventDateFormatted = activeEvent.event_date
      ? new Date(activeEvent.event_date).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : 'Event Day';

    const lines = [
      `🪔 *${activeEvent.event_name || 'ECK-RTU Alumni'}* 🪔`,
      '🎟️ *Official Entry ID Card Pass*',
      '',
      `👤 *Attendee:* ${name}`,
      `🎫 *Registration ID:* ${regNum}`,
      ...(branchAndBatch ? [`🎓 *Branch & Batch:* ${branchAndBatch}`] : []),
      ...(totalGuests ? [`👥 *Total Attendees:* ${totalGuests}`] : []),
      `📅 *Event Date:* ${eventDateFormatted} | ${activeEvent.event_time || '5:00 PM onwards'}`,
      `📍 *Venue:* ${activeEvent.location || 'ECK-RTU Campus, Kota'}`,
      '',
      `👉 *Get your pass:* ${baseUrl}`,
      '',
      '✨ _“दीप जले, यादें मुस्कुराएँ।”_ See you at the grand reunion! 🪔',
    ];

    return lines.join('\n');
  };

  // Share Real ID Card Pass Image on WhatsApp (Always Uses Privacy-Protected Social Pass!)
  const handleShareWhatsApp = async () => {
    if (!registration) return;

    // Check if selfie has been taken OR explicitly skipped
    const hasPhoto = Boolean(photoPreview || registration?.photo_url);
    if (!hasPhoto && !selfieSkipped) {
      setSelfiePrompt(
        "Almost there! Just add your selfie 📸✨ A pass without a photo is like Diwali without sweets! 🪔 Take a quick selfie to personalize your pass, or choose to skip."
      );
      return;
    }

    setSelfiePrompt(null);
    setSharingWhatsApp(true);

    try {

      const captionText = buildWhatsAppShareMessage();
      const encoded = encodeURIComponent(captionText);

      const isMobile =
        typeof navigator !== 'undefined' &&
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      // ALWAYS share the Privacy Protected Social Pass (where personal QR code is hidden & shielded)
      let blob = cachedSocialBlobRef.current;
      if (!blob && socialCardRef.current) {
        const dataUrl = await toPng(socialCardRef.current, {
          quality: 0.95,
          pixelRatio: 2.5,
          backgroundColor: '#071238',
          skipFonts: true,
          cacheBust: false,
        });
        cachedSocialDataUrlRef.current = dataUrl;
        blob = dataURLtoBlob(dataUrl);
        cachedSocialBlobRef.current = blob;
      }

      if (!blob) throw new Error('Social pass image could not be prepared');

      const regNum = registration?.registration_number || 'Pass';
      const cleanName = registration?.alumni?.name?.replace(/\s+/g, '_') || 'Pass';
      const file = new File([blob], `ECK_Alumni_Social_Pass_${cleanName}_${regNum}.png`, { type: 'image/png' });

      // 1. On mobile phones: Share the REAL image file directly to WhatsApp via Web Share API
      if (isMobile) {
        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }) && typeof navigator.share === 'function') {
          try {
            // Note: Omit title when sharing file to ensure WhatsApp handles it as media with caption
            await navigator.share({
              files: [file],
              text: captionText,
            });
            return;
          } catch (shareErr: any) {
            if (shareErr?.name === 'AbortError') {
              // User dismissed the native share sheet
              return;
            }
            console.warn('Mobile native file share error, proceeding with link fallback:', shareErr);
          }
        }
      }

      // 2. On desktop only: copy privacy-protected pass image to clipboard for Ctrl+V in WhatsApp Web
      if (!isMobile && blob && typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          setImageCopiedHint(true);
        } catch (clipErr) {
          console.warn('Clipboard write image failed:', clipErr);
        }
      }

      // Fallback: straight away redirect to WhatsApp directly!
      if (isMobile) {
        window.open(`whatsapp://send?text=${encoded}`, '_self');
        setTimeout(() => {
          window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
        }, 700);
      } else {
        window.open(`https://web.whatsapp.com/send?text=${encoded}`, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('WhatsApp share error:', err);
      alert('Unable to prepare pass image. You can also use the Download Event Pass button to save your pass image!');
    } finally {
      setSharingWhatsApp(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0c16] text-slate-100 flex flex-col">
      <Header currentEventSlug={activeEvent.event_slug} maxWidth="max-w-3xl" />

      <main className="w-full max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 flex-1 space-y-6">
        {/* Back navigation to Event Details */}
        <div>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Event Details</span>
          </Link>
        </div>

        {/* Page Banner Title */}
        <div className="w-full text-center space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            Alumni Event Pass Portal
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Generate Your Event ID Card</h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
            Search by your phone number, Registration ID, or Attendee Name, upload your photograph, and save your official pass with QR code for {activeEvent.event_name}.
          </p>
        </div>

        {/* Step 1: Lookup Box */}
        {!registration ? (
          <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md space-y-5">
            {eventsList.length > 1 && (
              <div className="space-y-1.5 pb-2 border-b border-slate-800">
                <label className="block text-xs font-semibold text-slate-400">
                  Select Event Edition:
                </label>
                <select
                  value={activeEvent.event_slug}
                  onChange={(e) => {
                    const found = eventsList.find((ev) => ev.event_slug === e.target.value);
                    if (found) {
                      setActiveEvent(found);
                      setSearchParams({ event: found.event_slug });
                      setRegistration(null);
                      setErrorMsg(null);
                    }
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/80 border border-amber-500/40 rounded-xl text-base text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                >
                  {eventsList.map((ev) => (
                    <option key={ev.id} value={ev.event_slug} className="bg-slate-900 text-slate-100">
                      {ev.event_name} {ev.status === 'CLOSED' ? '(Concluded Keepsake)' : '(Active)'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isConcluded ? (
              <div className="p-6 rounded-2xl bg-slate-950/70 border border-amber-500/30 text-center space-y-3">
                <div className="text-4xl">🔒</div>
                <h3 className="text-lg sm:text-xl font-bold text-white">
                  Pass Downloads Concluded
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
                  Gate pass downloads for <strong>{activeEvent.event_name}</strong> have closed as the event concluded on {activeEvent.event_date}.
                </p>
                <div className="pt-2">
                  <Link
                    to={`/events/${activeEvent.event_slug}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-colors shadow-lg shadow-amber-500/20"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>View Event Memories &amp; Recap</span>
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {/* Search Type Selector Tabs */}
                <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-xl bg-slate-950/80 border border-slate-800" role="tablist" aria-label="Search ID Pass by">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={searchMode === 'reg_number'}
                    className={`min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                      searchMode === 'reg_number'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                    onClick={() => {
                      setSearchMode('reg_number');
                      setErrorMsg(null);
                    }}
                  >
                    <span>🎫</span>
                    <span>Reg ID</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={searchMode === 'mobile'}
                    className={`min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                      searchMode === 'mobile'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                    onClick={() => {
                      setSearchMode('mobile');
                      setErrorMsg(null);
                    }}
                  >
                    <span>📱</span>
                    <span>Mobile</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={searchMode === 'name'}
                    className={`min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                      searchMode === 'name'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                    onClick={() => {
                      setSearchMode('name');
                      setErrorMsg(null);
                    }}
                  >
                    <span>👤</span>
                    <span>Name</span>
                  </button>
                </div>

                {searchMode === 'reg_number' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <h2 className="text-base sm:text-lg font-bold text-white">Enter Registration Number</h2>
                      <p className="text-xs sm:text-sm text-slate-400">
                        Enter your Registration ID (up to 5 digits).
                      </p>
                    </div>

                    <form onSubmit={handleRegLookupSubmit} className="space-y-3">
                      <div className="flex items-center rounded-xl bg-slate-950/80 border border-slate-700 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500 overflow-hidden">
                        <span className="pl-3.5 pr-1 font-mono font-bold text-amber-400 text-base select-none pointer-events-none" title={`Registration prefix ${(activeEvent.event_code || 'REG').toUpperCase()}-`}>
                          {(activeEvent.event_code || 'REG').toUpperCase()}-
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="e.g. 39"
                          maxLength={5}
                          value={regInput}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/\D/g, '').slice(0, 5);
                            setRegInput(cleaned);
                          }}
                          className="flex-1 min-h-[44px] py-2.5 px-2 bg-transparent text-base text-white font-mono placeholder:text-slate-500 focus:outline-none"
                          required
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="px-4 sm:px-5 min-h-[44px] bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
                          disabled={loading}
                        >
                          {loading ? 'Finding...' : 'Get Pass →'}
                        </button>
                      </div>

                      <p className="text-xs text-slate-400">
                        💡 Enter your number (e.g. <strong>39</strong> or <strong>00039</strong>)
                      </p>

                      {errorMsg && (
                        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs sm:text-sm flex flex-col gap-1.5">
                          <span>{errorMsg}</span>
                          {errorMsg === ID_PASS_LOCKED_MSG && (
                            <Link to="/" className="text-amber-400 hover:underline font-semibold">
                              Register / Confirm Attendance Now →
                            </Link>
                          )}
                        </div>
                      )}
                    </form>
                  </div>
                )}

                {searchMode === 'mobile' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <h2 className="text-base sm:text-lg font-bold text-white">Enter Registered Mobile Number</h2>
                      <p className="text-xs sm:text-sm text-slate-400">
                        We'll instantly look up your verified registration and prepare your delegate pass.
                      </p>
                    </div>

                    <form onSubmit={handleLookup} className="space-y-3">
                      <div className="flex items-center rounded-xl bg-slate-950/80 border border-slate-700 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500 overflow-hidden">
                        <span className="pl-3.5 pr-1 font-mono font-bold text-amber-400 text-base select-none pointer-events-none">+91</span>
                        <input
                          type="tel"
                          placeholder="10-digit number"
                          maxLength={10}
                          value={mobileInput}
                          onChange={(e) => setMobileInput(e.target.value.replace(/\D/g, ''))}
                          className="flex-1 min-h-[44px] py-2.5 px-2 bg-transparent text-base text-white font-mono placeholder:text-slate-500 focus:outline-none"
                          required
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="px-4 sm:px-5 min-h-[44px] bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
                          disabled={loading}
                        >
                          {loading ? 'Finding...' : 'Get Pass →'}
                        </button>
                      </div>

                      {errorMsg && (
                        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs sm:text-sm flex flex-col gap-1.5">
                          <span>{errorMsg}</span>
                          {errorMsg === ID_PASS_LOCKED_MSG && (
                            <Link to="/" className="text-amber-400 hover:underline font-semibold">
                              Register / Confirm Attendance Now →
                            </Link>
                          )}
                        </div>
                      )}
                    </form>
                  </div>
                )}

                {searchMode === 'name' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <h2 className="text-base sm:text-lg font-bold text-white">Search by Attendee Name</h2>
                      <p className="text-xs sm:text-sm text-slate-400">
                        Type your name, passing batch, or branch to find and load your delegate pass.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {/* Search Input Bar */}
                      <div className="relative flex items-center">
                        <Search className="w-5 h-5 text-slate-400 absolute left-3.5 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Type name (e.g. Bhawesh, Rahul), batch (A, 2008), or branch..."
                          value={nameSearchQuery}
                          onChange={(e) => {
                            setNameSearchQuery(e.target.value);
                            setErrorMsg(null);
                          }}
                          className="w-full min-h-[44px] pl-10 pr-10 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-base text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                          autoFocus
                        />
                        {nameSearchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setNameSearchQuery('');
                              setErrorMsg(null);
                            }}
                            className="absolute right-3 p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                            title="Clear search"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {errorMsg && (
                        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs sm:text-sm flex flex-col gap-1.5">
                          <span>{errorMsg}</span>
                          {errorMsg === ID_PASS_LOCKED_MSG && (
                            <Link to="/" className="text-amber-400 hover:underline font-semibold">
                              Register / Confirm Attendance Now →
                            </Link>
                          )}
                        </div>
                      )}

                      {!errorMsg && (
                        <>
                          {nameSearchQuery.trim().length < 2 ? (
                            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs text-slate-400">
                              <p>
                                ⚡ <strong className="text-white">Instant Search:</strong> Type at least 2 letters of your name, passing year (e.g. <em>2012</em>), or engineering branch.
                              </p>
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                <button type="button" className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:border-amber-500/40 hover:text-amber-300 text-xs cursor-pointer transition-colors" onClick={() => setNameSearchQuery('Computer')}>💻 Computer</button>
                                <button type="button" className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:border-amber-500/40 hover:text-amber-300 text-xs cursor-pointer transition-colors" onClick={() => setNameSearchQuery('Mechanical')}>⚙️ Mechanical</button>
                                <button type="button" className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:border-amber-500/40 hover:text-amber-300 text-xs cursor-pointer transition-colors" onClick={() => setNameSearchQuery('Electrical')}>⚡ Electrical</button>
                                <button type="button" className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:border-amber-500/40 hover:text-amber-300 text-xs cursor-pointer transition-colors" onClick={() => setNameSearchQuery('Civil')}>🏗️ Civil</button>
                                <button type="button" className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:border-amber-500/40 hover:text-amber-300 text-xs cursor-pointer transition-colors" onClick={() => setNameSearchQuery('2024')}>🎓 2024</button>
                                <button type="button" className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:border-amber-500/40 hover:text-amber-300 text-xs cursor-pointer transition-colors" onClick={() => setNameSearchQuery('2008')}>🎓 2008</button>
                              </div>
                            </div>
                          ) : loadingAllRegistrations && allRegistrations.length === 0 ? (
                            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                              <p>🔍 Loading registered alumni directory...</p>
                            </div>
                          ) : filteredNameRegistrations.length === 0 ? (
                            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400 space-y-1">
                              <p>
                                🔍 No registered alumni found matching <strong className="text-white">"{nameSearchQuery}"</strong>.
                              </p>
                              <p>
                                Check spelling or switch to the <strong>Mobile</strong> or <strong>Reg ID</strong> tab above.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                                <span>Found {filteredNameRegistrations.length} registered {filteredNameRegistrations.length === 1 ? 'attendee' : 'attendees'}</span>
                                <span>Click to load pass</span>
                              </div>

                              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                {filteredNameRegistrations.map((reg) => {
                                  const alumni = reg.alumni;
                                  if (!alumni) return null;

                                  return (
                                    <div
                                      key={reg.registration_id}
                                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-amber-500/40 hover:bg-slate-900 transition-all cursor-pointer flex items-center justify-between gap-3 text-left"
                                      onClick={() => handleSelectAttendee(reg)}
                                      role="button"
                                      tabIndex={0}
                                    >
                                      <div className="space-y-0.5 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-sm text-white truncate">{alumni.name}</span>
                                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-900 border border-slate-700 text-amber-300 shrink-0">
                                            {reg.registration_number}
                                          </span>
                                        </div>
                                        <div className="text-xs text-slate-400 truncate">
                                          🎓 Batch {alumni.batch || getBatchFromPassingYear(alumni.year_of_passing)} • {alumni.engineering_discipline || 'Alumni'}
                                        </div>
                                      </div>

                                      <div className="shrink-0">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                          reg.attendance_status === 'yes'
                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                            : 'bg-slate-800 text-slate-400'
                                        }`}>
                                          {reg.attendance_status === 'yes' ? 'Get Pass →' : 'Locked 🔒'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {!isConcluded && (
              <div className="pt-2 text-center text-xs text-slate-400 border-t border-slate-800/80">
                <span>Haven't registered yet? </span>
                <Link to={`/events/${activeEvent.event_slug}`} className="text-amber-400 hover:underline font-semibold ml-1">
                  Register here for {activeEvent.event_name}
                </Link>
              </div>
            )}
          </div>
        ) : (
          /* Step 2 & 3: Photo Upload and Live ID Card */
          <div className="space-y-6">
            {/* Top Toolbar / Attendee Verified Notice */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-white">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="font-bold text-emerald-300 flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  <span>Verified Registration</span>
                </span>
                <span className="font-bold text-white">{registration.alumni?.name}</span>
                <span className="font-mono text-amber-300">({registration.registration_number})</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRegistration(null);
                  setPhotoPreview(null);
                }}
                className="text-xs text-slate-400 hover:text-white underline cursor-pointer self-start sm:self-auto"
              >
                Change / Search Again
              </button>
            </div>

            {/* Photo Upload / Selfie Controls */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left shadow-lg">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">📸 Attendee Photograph</h3>
                <p className="text-xs text-slate-400">
                  Add a clear headshot photo or selfie for your ID card badge.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="file"
                  ref={selfieInputRef}
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />

                <button
                  type="button"
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border border-slate-700 transition-colors cursor-pointer active:scale-95"
                  onClick={() => selfieInputRef.current?.click()}
                  disabled={uploadingPhoto}
                >
                  <Camera className="w-4 h-4" />
                  <span>{photoPreview ? 'Retake Selfie' : 'Take Selfie'}</span>
                </button>
              </div>

              {uploadingPhoto && <p className="text-xs text-amber-400 animate-pulse">Optimizing and saving photo...</p>}
            </div>

            {/* Pass Mode Toggle Switcher */}
            <div className="flex p-1 rounded-full bg-slate-950/80 border border-slate-800 max-w-md mx-auto w-full gap-1" role="tablist" aria-label="Pass Display Mode">
              {/* 1. Social Share Pass (First & Active) */}
              <button
                type="button"
                role="tab"
                aria-selected={passViewMode === 'social'}
                onClick={() => setPassViewMode('social')}
                className={`flex-1 min-h-[44px] rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  passViewMode === 'social'
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="View privacy-protected pass without personal QR code for sharing"
              >
                <span>🌟 Social Share Pass</span>
              </button>

              {/* 2. Gate Pass (Second & Coming Soon Disabled) */}
              <button
                type="button"
                role="tab"
                aria-selected={passViewMode === 'entry'}
                disabled={!IS_GATE_PASS_RELEASED}
                onClick={() => {
                  if (!IS_GATE_PASS_RELEASED) return;
                  if (!isPhoneVerified) {
                    setVerifyPhoneError(null);
                    setShowPhoneVerifyModal(true);
                    return;
                  }
                  setPassViewMode('entry');
                }}
                className={`flex-1 min-h-[44px] rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  !IS_GATE_PASS_RELEASED
                    ? 'opacity-40 cursor-not-allowed text-slate-500'
                    : passViewMode === 'entry'
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow-md shadow-amber-500/20 cursor-pointer'
                    : 'text-slate-400 hover:text-white cursor-pointer'
                }`}
                title={
                  !IS_GATE_PASS_RELEASED
                    ? 'Official Gate Entry Pass with scannable QR code will be released closer to event day (1st November)'
                    : isPhoneVerified
                    ? 'View official gate entry pass with scannable QR code'
                    : 'Locked — Click to verify registered phone and unlock'
                }
              >
                <span>
                  {!IS_GATE_PASS_RELEASED ? (
                    <>🔒 Gate Pass <span className="text-[10px] opacity-75">(Coming Soon)</span></>
                  ) : isPhoneVerified ? (
                    '🎟️ Gate Entry Pass'
                  ) : (
                    '🔒 Gate Pass (Locked)'
                  )}
                </span>
              </button>
            </div>

            {/* Ownership verified subtle indicator */}
            {IS_GATE_PASS_RELEASED && isPhoneVerified && passViewMode === 'entry' && (
              <div className="w-full flex justify-center">
                <div className="px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs">
                  <span>✅ <strong>Ownership Confirmed:</strong> Gate Entry Pass is unlocked and ready!</span>
                </div>
              </div>
            )}

            {/* Mobile pass indicator note */}
            <div className="text-center text-xs text-slate-400">
              <span>
                {passViewMode === 'social' || !IS_GATE_PASS_RELEASED
                  ? '🔒 Social Pass: Personal phone QR code shielded for safe sharing with friends & groups'
                  : `🎟️ Official Entry Pass: Show this QR code at the gate on ${activeEvent.event_date ? new Date(activeEvent.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'event day'}`}
              </span>
            </div>

            {/* Live Generated ID Cards */}
            <div className="w-full flex flex-col items-center justify-center py-2">
              <IdCardPass
                registration={registration}
                event={activeEvent}
                photoUrl={photoPreview}
                cardRef={passViewMode === 'social' || !isPhoneVerified ? socialCardRef : entryCardRef}
                hideQr={passViewMode === 'social' || !isPhoneVerified}
              />

              {/* Offscreen Pass for 0ms download speed */}
              {isPhoneVerified && (
                <div
                  style={{
                    position: 'fixed',
                    left: '-9999px',
                    top: '0',
                    opacity: 0,
                    pointerEvents: 'none',
                    zIndex: -1,
                  }}
                  aria-hidden="true"
                >
                  <IdCardPass
                    registration={registration}
                    event={activeEvent}
                    photoUrl={photoPreview}
                    cardRef={passViewMode === 'social' ? entryCardRef : socialCardRef}
                    hideQr={passViewMode === 'social' ? false : true}
                  />
                </div>
              )}
            </div>

            {/* Action Buttons to Save / Download */}
            <div className="w-full space-y-4 pt-2">
              {selfiePrompt && (
                <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-slate-200 flex items-start gap-3 text-xs sm:text-sm">
                  <span className="text-2xl shrink-0">🤳</span>
                  <div className="space-y-2">
                    <h4 className="font-bold text-white">Almost there! Just add your selfie 📸✨</h4>
                    <p className="text-slate-300 leading-relaxed">
                      A pass without a photo is like Diwali without sweets! 🪔 Please take a quick selfie to personalize and download your official pass.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => selfieInputRef.current?.click()}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer transition-colors"
                      >
                        📸 Snap Selfie Now
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelfieSkipped(true);
                          setSelfiePrompt(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer transition-colors"
                      >
                        Skip Selfie
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Privacy Guarantee Reassurance Banner */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
                <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong className="text-slate-200 font-semibold">Privacy Protected on WhatsApp:</strong> Your personal phone number QR code is automatically replaced with a royal verified seal when sharing!
                </span>
              </div>

              {downloadSuccess && (
                <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 flex items-start gap-3 text-xs sm:text-sm">
                  <span className="text-2xl shrink-0">🎉</span>
                  <div className="space-y-1">
                    <strong className="font-bold text-white block">Pass Downloaded Successfully!</strong>
                    <p className="text-slate-300">
                      {passViewMode === 'social'
                        ? 'Your privacy-protected social pass is ready to post or share!'
                        : 'Official Gate Pass saved! Keep this handy for instant entry at Agora Ground.'}
                    </p>
                    {passViewMode === 'entry' && (
                      <p className="text-amber-300 text-xs pt-1">
                        ⚠️ <strong>Private Gate Pass:</strong> Keep this downloaded pass image private for check-in at the gate. Always use the "Share Pass on WhatsApp" button to share with friends and groups safely without your QR code.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="w-full">
                {isConcluded ? (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold text-center text-xs sm:text-sm">
                    🔒 Event Concluded — Gate pass downloads are closed.
                  </div>
                ) : (
                  <>
                    {passViewMode === 'entry' && (
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="w-full min-h-[48px] py-3.5 px-6 rounded-xl font-bold text-base bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                        disabled={downloading}
                        id="btn-download-pass"
                        title="Download official gate pass PNG with QR code"
                      >
                        {downloading ? (
                          <span>Generating High-Res Pass...</span>
                        ) : (
                          <>
                            <Download className="w-5 h-5" />
                            <span>Download Gate Entry Pass</span>
                          </>
                        )}
                      </button>
                    )}

                    {passViewMode === 'social' && (
                      <button
                        type="button"
                        onClick={handleShareWhatsApp}
                        className="w-full min-h-[48px] py-3.5 px-6 rounded-xl font-bold text-base bg-gradient-to-r from-emerald-700 via-emerald-600 to-green-600 hover:from-emerald-600 hover:to-green-500 text-white shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                        disabled={sharingWhatsApp || downloading}
                        id="btn-share-pass-whatsapp"
                        title="Share privacy-protected pass image on WhatsApp"
                      >
                        <MessageCircle className="w-5 h-5" />
                        <span>{sharingWhatsApp ? 'Preparing Pass Image...' : 'Share Pass on WhatsApp'}</span>
                      </button>
                    )}
                  </>
                )}
              </div>

              {!IS_GATE_PASS_RELEASED ? (
                <div className="text-center text-xs text-amber-300/80">
                  <span>🎟️ <em>Official Gate Entry Passes with entry QR codes will unlock for download closer to event day (1st November).</em></span>
                </div>
              ) : !isPhoneVerified && passViewMode === 'social' ? (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyPhoneError(null);
                      setShowPhoneVerifyModal(true);
                    }}
                    className="text-xs sm:text-sm text-amber-400 hover:underline font-semibold cursor-pointer inline-flex items-center gap-1"
                  >
                    <span>🎟️ Need your Official Gate Pass with QR? Click to Unlock 🔓</span>
                  </button>
                </div>
              ) : null}

              {imageCopiedHint && (
                <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs sm:text-sm text-center">
                  <span>📋 <strong>Privacy-protected pass image copied!</strong> In WhatsApp, simply press <strong>Ctrl + V</strong> (or Paste) to send the image!</span>
                </div>
              )}

              {passViewMode === 'entry' && IS_GATE_PASS_RELEASED && (
                <p className="text-center text-xs text-slate-400 leading-relaxed">
                  💡 <strong>Gate Check-in Tip:</strong> Save the <strong>Gate Entry Pass (With QR)</strong> to your phone gallery. Simply show that QR code to the gate verification team at Agora Ground on 1st November for instant VIP entry!
                </p>
              )}
            </div>
          </div>
        )}

        {/* Registered Mobile Verification Modal Popup */}
        {showPhoneVerifyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowPhoneVerifyModal(false)}>
            <div className="w-full max-w-sm bg-slate-900 border border-amber-500/30 rounded-2xl p-6 text-center shadow-2xl relative space-y-4" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => setShowPhoneVerifyModal(false)}
                aria-label="Close verification modal"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl">
                🔒
              </div>
              <h3 className="text-lg font-bold text-white">Unlock Official Gate Pass</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                To protect your privacy and ensure only you can download your admission QR code, please confirm your <strong>10-digit registered mobile number</strong>.
              </p>
              <form onSubmit={handleVerifyPhoneSubmit} className="space-y-3">
                <input
                  ref={verifyPhoneInputRef}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  placeholder="Enter 10-digit Mobile No."
                  value={verifyPhoneInput}
                  autoFocus
                  onChange={(e) => {
                    setVerifyPhoneInput(e.target.value.replace(/\D/g, ''));
                    setVerifyPhoneError(null);
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 text-center font-mono focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  aria-label="10-digit registered mobile number"
                />
                {verifyPhoneError && (
                  <p className="text-xs text-rose-400" role="alert">
                    ⚠️ {verifyPhoneError}
                  </p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-colors shadow-lg shadow-amber-500/20 cursor-pointer"
                  >
                    <span>🔓 Verify &amp; Unlock</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPhoneVerifyModal(false)}
                    className="min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors cursor-pointer"
                  >
                    <span>Cancel</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <Footer
        eventName={activeEvent.event_name}
        tagline={activeEvent.tagline}
        location={activeEvent.location}
      />
    </div>
  );
};
