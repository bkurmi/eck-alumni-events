import React, { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { Header } from '../components/Header';
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
  const [searchParams] = useSearchParams();
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
    event_date: '2026-11-01',
    event_time: '5:00 PM onwards',
    location: 'Agora Ground, ECK-RTU Campus, Kota',
    description: 'Nostalgic reunion, networking, dinner & Diwali celebrations.',
    registration_fee: 800,
    upi_id: '9799951857@upi',
    banner_image_url: '/deepaura-banner.jpg',
    tagline: '“दीप जले, यादें मुस्कुराएँ।”',
    theme_primary_color: '#f59e0b',
    theme_accent_color: '#d97706',
    qr_image_url: '/qr-1.png',
    status: 'OPEN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // If feature is disabled by .env flag
  if (!isEnabled) {
    return (
      <div className="id-card-page-wrapper">
        <Header />
        <main className="id-card-content-container">
          <div className="form-back-nav" style={{ marginBottom: '1.25rem' }}>
            <Link to="/" className="btn-back-link">
              ← Back to Event Details
            </Link>
          </div>
          <div className="id-disabled-card">
            <div className="id-disabled-icon">⏳</div>
            <h1 className="id-disabled-title">ID Card Generation Opening Soon</h1>
            <p className="id-disabled-desc">
              Event ID Pass generation will be enabled <strong>4 to 5 days prior to the event</strong>.
            </p>
            <div className="id-disabled-badge-box">
              <span>Event Date: <strong>1st November 2026</strong></span>
              <span>Venue: <strong>Agora Ground, ECK-RTU, Kota</strong></span>
            </div>
            <p className="id-disabled-tip">
              Please ensure you have completed your registration and payment verification in advance so your pass is ready for instant download.
            </p>
            <div className="id-disabled-actions">
              <Link to="/" className="btn-primary-action">
                ← Return to Event Registration
              </Link>
            </div>
          </div>
        </main>
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
      const res = await lookupRegistrationByMobile('deepaura-2k26', clean);
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
    const formattedReg = formatRegistrationNumberInput(rawRegOrDigits);
    if (!formattedReg) {
      setErrorMsg('Please enter a valid numeric registration number (up to 5 digits).');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setRegistration(null);
    setDownloadSuccess(false);

    try {
      const res = await lookupRegistrationByRegNumber('deepaura-2k26', formattedReg);
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
    // Automatically pad to 5 digits
    const padded = digitsOnly.padStart(5, '0');
    setRegInput(padded);
    executeRegLookup(padded);
  };

  // Pre-load event registrations once for instant in-memory lookup (matching Gate Verification Portal)
  useEffect(() => {
    let isMounted = true;
    setLoadingAllRegistrations(true);

    fetchAllRegistrationsForLookup(defaultEvent.event_slug)
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
  }, []);

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
        const mobile = cleanMobileNumber(alumni.mobile || '');
        const regNo = (reg.registration_number || '').toLowerCase();
        const city = (alumni.city || '').toLowerCase();
        const org = (alumni.organization || '').toLowerCase();

        return tokens.every(
          (token) =>
            name.includes(token) ||
            branch.includes(token) ||
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

        // 2. Pre-generate Official Entry Pass (with QR Code) for instant high-res download
        if (entryCardRef.current && active) {
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
  }, [registration, photoPreview, selfieSkipped]);

  // Handle Photo / Selfie Upload
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !registration?.registration_id) return;

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
    const batch = alumni?.year_of_passing ? `Batch of ${alumni.year_of_passing}` : '';
    const branchAndBatch = [discipline, batch].filter(Boolean).join(' • ');

    const totalGuests =
      registration.number_of_attendees && registration.number_of_attendees > 1
        ? `${registration.number_of_attendees} Attendee(s)`
        : null;

    const baseUrl =
      typeof window !== 'undefined' && window.location.origin
        ? `${window.location.origin}/id-card`
        : 'https://eck-alumni-events.pages.dev/id-card';

    const lines = [
      '🪔 *ECK-RTU Alumni DeepAura 2K26* 🪔',
      '🎟️ *Official Entry ID Card Pass*',
      '',
      `👤 *Attendee:* ${name}`,
      `🎫 *Registration ID:* ${regNum}`,
      ...(branchAndBatch ? [`🎓 *Branch & Batch:* ${branchAndBatch}`] : []),
      ...(totalGuests ? [`👥 *Total Attendees:* ${totalGuests}`] : []),
      '📅 *Event Date:* 1st November 2026 | 5:00 PM onwards',
      '📍 *Venue:* Agora Ground, ECK-RTU Campus, Kota',
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
    <div className="id-card-page-wrapper">
      <Header />

      <main className="id-card-content-container">
        {/* Back navigation to Event Details */}
        <div className="form-back-nav" style={{ marginBottom: '1.25rem' }}>
          <Link to="/" className="btn-back-link">
            ← Back to Event Details
          </Link>
        </div>

        {/* Page Banner Title */}
        <div className="id-page-banner">
          <span className="badge-pill-accent">Alumni Event Pass Portal</span>
          <h1 className="id-page-title">Generate Your Event ID Card</h1>
          <p className="id-page-subtitle">
            Search by your phone number, Registration ID, or Attendee Name, upload your photograph, and save your official pass with QR code for quick gate entry on 1st November.
          </p>
        </div>

        {/* Step 1: Lookup Box */}
        {!registration ? (
          <div className="id-lookup-card">
            {/* Search Type Selector Tabs */}
            <div className="id-search-tabs" role="tablist" aria-label="Search ID Pass by">
              <button
                type="button"
                role="tab"
                aria-selected={searchMode === 'reg_number'}
                className={`id-search-tab ${searchMode === 'reg_number' ? 'active' : ''}`}
                onClick={() => {
                  setSearchMode('reg_number');
                  setErrorMsg(null);
                }}
              >
                <span className="id-tab-icon">🎫</span>
                <span>Reg ID</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={searchMode === 'mobile'}
                className={`id-search-tab ${searchMode === 'mobile' ? 'active' : ''}`}
                onClick={() => {
                  setSearchMode('mobile');
                  setErrorMsg(null);
                }}
              >
                <span className="id-tab-icon">📱</span>
                <span>Mobile</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={searchMode === 'name'}
                className={`id-search-tab ${searchMode === 'name' ? 'active' : ''}`}
                onClick={() => {
                  setSearchMode('name');
                  setErrorMsg(null);
                }}
              >
                <span className="id-tab-icon">👤</span>
                <span>Name</span>
              </button>
            </div>

            {searchMode === 'reg_number' && (
              <>
                <h2 className="id-lookup-title">Enter Registration Number</h2>
                <p className="id-lookup-desc">
                  Enter your Registration ID (up to 5 digits).
                </p>

                <form onSubmit={handleRegLookupSubmit} className="id-lookup-form">
                  <div className="id-integrated-input-box id-reg-input-group">
                    <span className="id-input-prefix id-reg-prefix" title="Registration prefix REG- is fixed">
                      REG-
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="e.g. 39"
                      maxLength={5}
                      value={regInput}
                      onChange={(e) => {
                        // Strictly allow numbers only, max 5 digits
                        const cleaned = e.target.value.replace(/\D/g, '').slice(0, 5);
                        setRegInput(cleaned);
                      }}
                      className="id-phone-input id-reg-input"
                      required
                      autoFocus
                    />
                    <button type="submit" className="id-integrated-submit-btn" disabled={loading}>
                      {loading ? 'Finding...' : 'Get Pass →'}
                    </button>
                  </div>

                  <p className="id-reg-hint-note">
                    💡 Enter your number (e.g. <strong>39</strong> or <strong>00039</strong>)
                  </p>

                  {errorMsg && (
                    <div className="id-error-alert">
                      <span>{errorMsg}</span>
                      {errorMsg === ID_PASS_LOCKED_MSG && (
                        <Link to="/" className="id-error-register-link">
                          Register / Confirm Attendance Now →
                        </Link>
                      )}
                    </div>
                  )}
                </form>
              </>
            )}

            {searchMode === 'mobile' && (
              <>
                <h2 className="id-lookup-title">Enter Registered Mobile Number</h2>
                <p className="id-lookup-desc">
                  We'll instantly look up your verified registration and prepare your delegate pass.
                </p>

                <form onSubmit={handleLookup} className="id-lookup-form">
                  <div className="id-integrated-input-box">
                    <span className="id-input-prefix">+91</span>
                    <input
                      type="tel"
                      placeholder="10-digit number"
                      maxLength={10}
                      value={mobileInput}
                      onChange={(e) => setMobileInput(e.target.value.replace(/\D/g, ''))}
                      className="id-phone-input"
                      required
                      autoFocus
                    />
                    <button type="submit" className="id-integrated-submit-btn" disabled={loading}>
                      {loading ? 'Finding...' : 'Get Pass →'}
                    </button>
                  </div>

                  {errorMsg && (
                    <div className="id-error-alert">
                      <span>{errorMsg}</span>
                      {errorMsg === ID_PASS_LOCKED_MSG && (
                        <Link to="/" className="id-error-register-link">
                          Register / Confirm Attendance Now →
                        </Link>
                      )}
                    </div>
                  )}
                </form>
              </>
            )}

            {searchMode === 'name' && (
              <>
                <h2 className="id-lookup-title">Search by Attendee Name</h2>
                <p className="id-lookup-desc">
                  Type your name, passing batch, or branch to find and load your delegate pass.
                </p>

                <div className="name-search-container id-name-search-box">
                  {/* Search Input Bar */}
                  <div className="name-search-input-wrapper">
                    <span className="name-search-icon">🔍</span>
                    <input
                      type="text"
                      placeholder="Type name (e.g. Bhawesh, Rahul), batch (2008), or branch..."
                      value={nameSearchQuery}
                      onChange={(e) => {
                        setNameSearchQuery(e.target.value);
                        setErrorMsg(null);
                      }}
                      className="name-search-input"
                      autoFocus
                    />
                    {nameSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setNameSearchQuery('');
                          setErrorMsg(null);
                        }}
                        className="name-search-clear-btn"
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {errorMsg && (
                    <div className="id-error-alert">
                      <span>{errorMsg}</span>
                      {errorMsg === ID_PASS_LOCKED_MSG && (
                        <Link to="/" className="id-error-register-link">
                          Register / Confirm Attendance Now →
                        </Link>
                      )}
                    </div>
                  )}

                  {/* Hints / Chips or Results List - Hidden whenever an error message is active */}
                  {!errorMsg && (
                    <>
                      {nameSearchQuery.trim().length < 2 ? (
                        <div className="name-search-hint-box">
                          <p>
                            ⚡ <strong>Instant Search:</strong> Type at least 2 letters of your name, passing year (e.g. <em>2012</em>), or engineering branch.
                          </p>
                          <div className="name-search-chips">
                            <span className="name-search-chip" onClick={() => setNameSearchQuery('Computer')}>💻 Computer</span>
                            <span className="name-search-chip" onClick={() => setNameSearchQuery('Mechanical')}>⚙️ Mechanical</span>
                            <span className="name-search-chip" onClick={() => setNameSearchQuery('Electrical')}>⚡ Electrical</span>
                            <span className="name-search-chip" onClick={() => setNameSearchQuery('Civil')}>🏗️ Civil</span>
                            <span className="name-search-chip" onClick={() => setNameSearchQuery('2024')}>🎓 2024</span>
                            <span className="name-search-chip" onClick={() => setNameSearchQuery('2008')}>🎓 2008</span>
                          </div>
                        </div>
                      ) : loadingAllRegistrations && allRegistrations.length === 0 ? (
                        <div className="name-search-hint-box" style={{ padding: '1.25rem' }}>
                          <p>🔍 Loading registered alumni directory...</p>
                        </div>
                      ) : filteredNameRegistrations.length === 0 ? (
                        <div className="name-search-hint-box">
                          <p>
                            🔍 No registered alumni found matching <strong>"{nameSearchQuery}"</strong>.
                          </p>
                          <p style={{ fontSize: '0.82rem', margin: '6px 0 0 0' }}>
                            Check spelling or switch to the <strong>Mobile</strong> or <strong>Reg ID</strong> tab above.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="name-search-header-meta">
                            <span>Found {filteredNameRegistrations.length} registered {filteredNameRegistrations.length === 1 ? 'attendee' : 'attendees'}</span>
                            <span>Click to load pass</span>
                          </div>

                          <div className="name-search-results-list">
                            {filteredNameRegistrations.map((reg) => {
                              const alumni = reg.alumni;
                              if (!alumni) return null;

                              return (
                                <div
                                  key={reg.registration_id}
                                  className="name-search-result-card"
                                  onClick={() => handleSelectAttendee(reg)}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <div className="name-result-main-row">
                                    {/* Top row: Name + Reg ID on left, Get Pass indicator on right */}
                                    <div className="name-result-top-row">
                                      <div className="name-result-title-group">
                                        <span className="name-result-name">{alumni.name}</span>
                                        <span className="name-result-reg-pill">
                                          {reg.registration_number}
                                        </span>
                                      </div>

                                      <div className="name-result-status-col">
                                        <span className={`name-result-select-indicator ${reg.attendance_status !== 'yes' ? 'locked' : ''}`}>
                                          {reg.attendance_status === 'yes' ? 'Get Pass →' : 'Locked 🔒'}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Middle row: Branch & Passing Year */}
                                    <div className="name-result-branch-line">
                                      <span className="meta-icon">🎓</span>
                                      <span className="meta-text">
                                        {alumni.engineering_discipline || 'Alumni'}
                                        {alumni.year_of_passing ? ` (${alumni.year_of_passing})` : ''}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            <div className="id-lookup-footer">
              <span>Haven't registered yet? </span>
              <Link to="/" className="id-link-accent">Register here for DeepAura 2K26</Link>
            </div>
          </div>
        ) : (
          /* Step 2 & 3: Photo Upload and Live ID Card */
          <div className="id-card-active-section">
            {/* Top Toolbar / Attendee Verified Notice */}
            <div className="id-verified-bar">
              <div className="id-verified-info">
                <span className="id-verified-check">✓ Verified Registration</span>
                <span className="id-verified-name">{registration.alumni?.name}</span>
                <span className="id-verified-reg">({registration.registration_number})</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRegistration(null);
                  setPhotoPreview(null);
                }}
                className="btn-text-ghost"
              >
                Change / Search Again
              </button>
            </div>

            {/* Photo Upload / Selfie Controls */}
            <div className="id-photo-action-card">
              <div className="id-photo-prompt">
                <h3>📸 Attendee Photograph</h3>
                <p>
                  Add a clear headshot photo or selfie for your ID card badge.
                </p>
              </div>

              <div className="id-photo-buttons-row">
                {/* Hidden Native File Inputs */}
                <input
                  type="file"
                  ref={selfieInputRef}
                  accept="image/*"
                  capture="user"
                  style={{ display: 'none' }}
                  onChange={handlePhotoSelect}
                />

                <button
                  type="button"
                  className="btn-photo-action selfie-btn"
                  onClick={() => selfieInputRef.current?.click()}
                  disabled={uploadingPhoto}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>{photoPreview ? 'Retake Selfie' : 'Take Selfie'}</span>
                </button>
              </div>

              {uploadingPhoto && <p className="id-uploading-indicator">Optimizing and saving photo...</p>}
            </div>

            {/* Pass Mode Toggle Switcher */}
            <div className="id-pass-mode-toggle" role="tablist" aria-label="Pass Display Mode">
              {/* 1. Social Share Pass (First & Active) */}
              <button
                type="button"
                role="tab"
                aria-selected={passViewMode === 'social'}
                onClick={() => setPassViewMode('social')}
                className={`btn-pass-mode-tab tab-social ${passViewMode === 'social' ? 'active' : ''}`}
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
                className={`btn-pass-mode-tab ${
                  !IS_GATE_PASS_RELEASED
                    ? 'tab-disabled'
                    : passViewMode === 'entry'
                    ? 'active'
                    : ''
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
                    <>🔒 Gate Pass <span className="tab-subtext">(Coming Soon)</span></>
                  ) : isPhoneVerified ? (
                    '🎟️ Gate Entry Pass'
                  ) : (
                    '🔒 Gate Pass (Locked)'
                  )}
                </span>
              </button>
            </div>

            {/* Ownership verified subtle indicator (only when Gate Pass released & active) */}
            {IS_GATE_PASS_RELEASED && isPhoneVerified && passViewMode === 'entry' && (
              <div
                className="id-unlock-verified-pill-wrapper"
                style={{ width: '100%', display: 'flex', justifyContent: 'center', margin: '0.25rem 0 0.85rem 0' }}
              >
                <div className="id-unlock-verified-pill">
                  <span>✅ <strong>Ownership Confirmed:</strong> Gate Entry Pass is unlocked and ready!</span>
                </div>
              </div>
            )}

            {/* Mobile pass indicator */}
            <div
              className="ticket-mobile-indicator"
              style={{ alignSelf: 'center', marginLeft: 'auto', marginRight: 'auto', textAlign: 'center' }}
            >
              <span>
                {passViewMode === 'social' || !IS_GATE_PASS_RELEASED
                  ? '🔒 Social Pass: Personal phone QR code shielded for safe sharing with friends & groups'
                  : '🎟️ Official Entry Pass: Show this QR code at the ECK-RTU gate on 1st November'}
              </span>
            </div>

            {/* Live Generated ID Cards */}
            <div className="id-preview-container">
              {/* Visible Pass based on active view mode & verification */}
              <IdCardPass
                registration={registration}
                event={defaultEvent}
                photoUrl={photoPreview}
                cardRef={passViewMode === 'social' || !isPhoneVerified ? socialCardRef : entryCardRef}
                hideQr={passViewMode === 'social' || !isPhoneVerified}
              />

              {/* Offscreen Pass so both versions are always rendered in DOM & pre-cached for 0ms lag */}
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
                  event={defaultEvent}
                  photoUrl={photoPreview}
                  cardRef={passViewMode === 'social' || !isPhoneVerified ? entryCardRef : socialCardRef}
                  hideQr={isPhoneVerified ? passViewMode !== 'social' : true}
                />
              </div>
            </div>

            {/* Action Buttons to Save / Download */}
            <div className="id-download-cta-box">
              {selfiePrompt && (
                <div className="id-selfie-funny-alert" role="alert">
                  <div className="id-funny-alert-icon">🤳</div>
                  <div className="id-funny-alert-body">
                    <h4 className="id-funny-alert-title">Almost there! Just add your selfie 📸✨</h4>
                    <p className="id-funny-alert-text">
                      A pass without a photo is like Diwali without sweets! 🪔 Please take a quick selfie to personalize and download your official pass.
                    </p>
                    <div className="id-funny-alert-actions">
                      <button
                        type="button"
                        onClick={() => selfieInputRef.current?.click()}
                        className="btn-selfie-jump"
                      >
                        <span>📸 Snap Selfie Now</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelfieSkipped(true);
                          setSelfiePrompt(null);
                        }}
                        className="btn-selfie-skip"
                      >
                        <span>Skip Selfie</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Privacy Guarantee Reassurance Banner */}
              <div className="id-privacy-guarantee-badge" role="note">
                <svg className="id-privacy-guarantee-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <span>
                  <strong>Privacy Protected on WhatsApp:</strong> Your personal phone number QR code is automatically replaced with a royal verified seal when sharing!
                </span>
              </div>

              {downloadSuccess && (
                <div className="id-download-success-banner" role="status">
                  <div className="id-download-success-icon">🎉</div>
                  <div className="id-download-success-text">
                    <strong>Pass Downloaded Successfully!</strong>
                    <span>
                      {passViewMode === 'social'
                        ? 'Your privacy-protected social pass is ready to post or share!'
                        : 'Official Gate Pass saved! Keep this handy for instant entry at Agora Ground.'}
                    </span>
                    {passViewMode === 'entry' && (
                      <div className="id-download-safety-tip">
                        ⚠️ <strong>Private Gate Pass:</strong> Keep this downloaded pass image private for check-in at the gate. Always use the <strong>"Share Pass on WhatsApp"</strong> button to share with friends and groups safely without your QR code.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="id-pass-action-buttons">
                {passViewMode === 'entry' && (
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="btn-primary-action download-card-btn"
                    disabled={downloading}
                    id="btn-download-pass"
                    title="Download official gate pass PNG with QR code"
                  >
                    {downloading ? (
                      <span>Generating High-Res Pass...</span>
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span>Download Gate Entry Pass</span>
                      </>
                    )}
                  </button>
                )}

                {passViewMode === 'social' && (
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="btn-whatsapp-pass-download"
                    disabled={sharingWhatsApp || downloading}
                    id="btn-share-pass-whatsapp"
                    title="Share privacy-protected pass image on WhatsApp"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12.031 2C6.511 2 2.023 6.488 2.023 12.008c0 1.848.508 3.585 1.396 5.088L2 22l5.06-1.328c1.449.809 3.109 1.258 4.967 1.258 5.524 0 10.016-4.488 10.016-10.008S17.555 2 12.031 2zm5.787 14.18c-.244.688-1.229 1.264-1.742 1.344-.472.072-1.074.132-3.153-.728-2.656-1.101-4.354-3.791-4.487-3.967-.13-.176-1.072-1.429-1.072-2.726 0-1.296.677-1.936.918-2.199.24-.264.527-.33.703-.33.176 0 .352.002.506.01.164.009.385-.062.602.46.223.535.757 1.848.824 1.98.067.132.112.287.022.463-.09.176-.134.286-.266.44-.132.154-.277.343-.396.462-.132.132-.27.275-.117.538.154.263.684 1.127 1.47 1.826 1.011.898 1.862 1.177 2.126 1.309.264.132.418.11.572-.066.154-.176.66-.77.836-1.034.176-.264.352-.22.593-.132.242.088 1.54.726 1.804.858.264.132.44.198.506.308.066.11.066.638-.178 1.326z" />
                    </svg>
                    <span>{sharingWhatsApp ? 'Preparing Pass Image...' : 'Share Pass on WhatsApp'}</span>
                  </button>
                )}
              </div>

              {!IS_GATE_PASS_RELEASED ? (
                <div className="id-coming-soon-note">
                  <span>🎟️ <em>Official Gate Entry Passes with entry QR codes will unlock for download closer to event day (1st November).</em></span>
                </div>
              ) : !isPhoneVerified && passViewMode === 'social' ? (
                <button
                  type="button"
                  onClick={() => {
                    setVerifyPhoneError(null);
                    setShowPhoneVerifyModal(true);
                  }}
                  className="btn-link-unlock-entry"
                >
                  <span>🎟️ Need your Official Gate Pass with QR? Click to Unlock 🔓</span>
                </button>
              ) : null}

              {imageCopiedHint && (
                <div className="id-image-copied-toast" role="status">
                  <span>📋 <strong>Privacy-protected pass image copied!</strong> In WhatsApp, simply press <strong>Ctrl + V</strong> (or Paste) to send the image!</span>
                </div>
              )}

              {passViewMode === 'entry' && IS_GATE_PASS_RELEASED && (
                <p className="id-download-hint">
                  💡 <strong>Gate Check-in Tip:</strong> Save the <strong>Gate Entry Pass (With QR)</strong> to your phone gallery. Simply show that QR code to the gate verification team at Agora Ground on 1st November for instant VIP entry!
                </p>
              )}
            </div>
          </div>
        )}

        {/* Registered Mobile Verification Modal Popup */}
        {showPhoneVerifyModal && (
          <div className="id-unlock-modal-overlay" onClick={() => setShowPhoneVerifyModal(false)}>
            <div className="id-unlock-modal-content" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="id-unlock-modal-close"
                onClick={() => setShowPhoneVerifyModal(false)}
                aria-label="Close verification modal"
              >
                ✕
              </button>
              <div className="id-unlock-modal-icon">🔒</div>
              <h3 className="id-unlock-modal-title">Unlock Official Gate Pass</h3>
              <p className="id-unlock-modal-desc">
                To protect your privacy and ensure only you can download your admission QR code, please confirm your <strong>10-digit registered mobile number</strong>.
              </p>
              <form onSubmit={handleVerifyPhoneSubmit} className="id-unlock-modal-form">
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
                  className="id-unlock-phone-input"
                  aria-label="10-digit registered mobile number"
                />
                {verifyPhoneError && (
                  <p className="id-unlock-phone-error" role="alert">
                    ⚠️ {verifyPhoneError}
                  </p>
                )}
                <div className="id-unlock-modal-actions">
                  <button type="submit" className="btn-unlock-phone-action">
                    <span>🔓 Verify &amp; Unlock</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPhoneVerifyModal(false)}
                    className="btn-selfie-skip"
                  >
                    <span>Cancel</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
