import React, { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toPng, toBlob } from 'html-to-image';
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
  compressAttendeePhoto,
  uploadAndSaveAttendeePhoto,
  markIdCardDownloaded,
} from '../lib/gate';
import { supabase } from '../lib/supabase';
import type { ExistingRegistrationLookup, ECKEvent } from '../types';

const ID_PASS_LOCKED_MSG = 'Oops! ID Pass Locked 🔒 — Register, pay, and unlock your pass!';

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

  const cardRef = useRef<HTMLDivElement | null>(null);
  const selfieInputRef = useRef<HTMLInputElement | null>(null);

  // Default Event Details
  const defaultEvent: ECKEvent = {
    id: 'deepaura-2026',
    event_name: 'ECK-RTU Alumni DeepAura 2K26',
    event_slug: 'deepaura-2k26',
    event_date: '2026-11-01',
    event_time: '5:00 PM onwards',
    location: 'College Ground, ECK Campus, Kota',
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

  // Demo Registration fallback helper
  const getDemoRegistration = (identifier: string, regNum = 'REG-00039'): ExistingRegistrationLookup => ({
    found: true,
    registration_id: 'demo-reg-00039',
    registration_number: regNum,
    attendance_status: 'yes',
    number_of_attendees: 2,
    adults_count: 1,
    children_above_7_count: 1,
    children_under_7_count: 0,
    amount: 800,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    alumni: {
      id: 'demo-alumni-1',
      name: 'Bhawesh Kurmi',
      mobile: identifier.includes('REG') ? '9799951857' : identifier,
      email: 'bkurmi@example.com',
      engineering_discipline: 'Information Technology',
      year_of_passing: 2008,
      professional_category: 'Alumnus',
      city: 'Kota',
      state: 'Rajasthan',
      country: 'India',
      address: 'Kota',
      organization: null,
      work_location: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });

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
        if (clean === '9799951857' || clean === '9876543210' || clean === '9999999999' || clean === '1234567890' || clean === '7770053991') {
          const demoRes = getDemoRegistration(clean, 'REG-00039');
          setRegistration(demoRes);
          setLoading(false);
          return;
        }

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
        // Fallback demo registrations if testing in dev/demo mode
        if (formattedReg === 'REG-00039' || formattedReg === 'REG-00001' || formattedReg === 'REG-00002') {
          const demoRes = getDemoRegistration(formattedReg, formattedReg);
          setRegistration(demoRes);
          setLoading(false);
          return;
        }

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

      // Smoothly scroll to the top of the pass card so attendee sees their updated photo!
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    if (!cardRef.current) return;

    // Check if selfie has been taken OR explicitly skipped
    const hasPhoto = Boolean(photoPreview || registration?.photo_url);
    if (!hasPhoto && !selfieSkipped) {
      setSelfiePrompt(
        "Almost there! Just add your selfie 📸✨ A pass without a photo is like Diwali without sweets! 🪔 Take a quick selfie to personalize your pass, or choose to skip."
      );
      return;
    }

    setSelfiePrompt(null);
    setDownloading(true);

    try {
      const dataUrl = await toPng(cardRef.current, {
        quality: 0.95,
        pixelRatio: 2.5, // Crisp retina quality for phone screens
        backgroundColor: '#071238',
        skipFonts: true,
        cacheBust: false,
      });

      const regNum = registration?.registration_number || 'Pass';
      const link = document.createElement('a');
      link.download = `ECK_Alumni_Pass_${registration?.alumni?.name?.replace(/\s+/g, '_') || 'Pass'}_${regNum}.png`;
      link.href = dataUrl;
      link.click();

      // Record ID Card Download in Database
      if (registration?.registration_id) {
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

    const lines = [
      '🪔 *ECK-RTU Alumni DeepAura 2K26* 🪔',
      '🎟️ *Official Entry ID Card Pass*',
      '',
      `👤 *Attendee:* ${name}`,
      `🎫 *Registration ID:* ${regNum}`,
      ...(branchAndBatch ? [`🎓 *Branch & Batch:* ${branchAndBatch}`] : []),
      ...(totalGuests ? [`👥 *Total Attendees:* ${totalGuests}`] : []),
      '📅 *Event Date:* 1st November 2026 | 5:00 PM onwards',
      '📍 *Venue:* College Ground, ECK Campus, Kota',
      '',
      '✨ _“दीप जले, यादें मुस्कुराएँ।”_ See you at the grand reunion! 🪔',
    ];

    return lines.join('\n');
  };

  // Share Real ID Card Pass Image on WhatsApp
  const handleShareWhatsApp = async () => {
    if (!registration || !cardRef.current) return;

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
      // Record ID Card Download / Share in Database
      if (registration?.registration_id) {
        markIdCardDownloaded(registration.registration_id).catch(() => {});
      }

      // Generate the crisp high-res ID Card Pass image blob
      let blob: Blob | null = null;
      try {
        blob = await toBlob(cardRef.current, {
          quality: 0.95,
          pixelRatio: 2.5,
          backgroundColor: '#071238',
          skipFonts: true,
          cacheBust: false,
        });
      } catch (blobErr) {
        console.warn('toBlob error:', blobErr);
      }

      if (!blob) {
        try {
          const dataUrl = await toPng(cardRef.current, {
            quality: 0.95,
            pixelRatio: 2.5,
            backgroundColor: '#071238',
            skipFonts: true,
            cacheBust: false,
          });
          const res = await fetch(dataUrl);
          blob = await res.blob();
        } catch (pngErr) {
          console.warn('toPng error:', pngErr);
        }
      }

      const captionText = buildWhatsAppShareMessage();
      const encoded = encodeURIComponent(captionText);

      const isMobile =
        typeof navigator !== 'undefined' &&
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      // 1. On mobile phones: Share the REAL image file directly to WhatsApp!
      if (isMobile && blob) {
        const regNum = registration?.registration_number || 'Pass';
        const cleanName = registration?.alumni?.name?.replace(/\s+/g, '_') || 'Pass';
        const file = new File([blob], `ECK_Alumni_Pass_${cleanName}_${regNum}.png`, { type: 'image/png' });

        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }) && typeof navigator.share === 'function') {
          try {
            await navigator.share({
              files: [file],
              title: 'ECK Alumni DeepAura 2K26 - Official Event Pass',
              text: captionText,
            });
            return;
          } catch (shareErr: any) {
            if (shareErr?.name === 'AbortError') return;
            console.warn('Mobile native share error, falling back:', shareErr);
          }
        }
      }

      // 2. On desktop only: copy pass image to clipboard for Ctrl+V in WhatsApp Web
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

            {/* Mobile pass indicator */}
            <div className="ticket-mobile-indicator">
              <span>🎟️ Official DeepAura 2K26 Mobile Pass (Tap below to download)</span>
            </div>

            {/* Live Generated ID Card */}
            <div className="id-preview-container">
              <IdCardPass
                registration={registration}
                event={defaultEvent}
                photoUrl={photoPreview}
                cardRef={cardRef}
              />
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

              {downloadSuccess && (
                <div className="id-download-success-banner" role="status">
                  <div className="id-download-success-icon">🎉</div>
                  <div className="id-download-success-text">
                    <strong>Pass Downloaded Successfully!</strong>
                    <span>Share your official event pass with batchmates on WhatsApp!</span>
                  </div>
                </div>
              )}

              <div className="id-pass-action-buttons">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="btn-primary-action download-card-btn"
                  disabled={downloading}
                  id="btn-download-pass"
                  title="Download high-resolution pass PNG"
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
                      <span>Download Event Pass</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="btn-whatsapp-pass-download"
                  disabled={sharingWhatsApp || downloading}
                  id="btn-share-pass-whatsapp"
                  title="Share real pass image on WhatsApp"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12.031 2C6.511 2 2.023 6.488 2.023 12.008c0 1.848.508 3.585 1.396 5.088L2 22l5.06-1.328c1.449.809 3.109 1.258 4.967 1.258 5.524 0 10.016-4.488 10.016-10.008S17.555 2 12.031 2zm5.787 14.18c-.244.688-1.229 1.264-1.742 1.344-.472.072-1.074.132-3.153-.728-2.656-1.101-4.354-3.791-4.487-3.967-.13-.176-1.072-1.429-1.072-2.726 0-1.296.677-1.936.918-2.199.24-.264.527-.33.703-.33.176 0 .352.002.506.01.164.009.385-.062.602.46.223.535.757 1.848.824 1.98.067.132.112.287.022.463-.09.176-.134.286-.266.44-.132.154-.277.343-.396.462-.132.132-.27.275-.117.538.154.263.684 1.127 1.47 1.826 1.011.898 1.862 1.177 2.126 1.309.264.132.418.11.572-.066.154-.176.66-.77.836-1.034.176-.264.352-.22.593-.132.242.088 1.54.726 1.804.858.264.132.44.198.506.308.066.11.066.638-.178 1.326z"/>
                  </svg>
                  <span>{sharingWhatsApp ? 'Preparing Pass Image...' : 'Share Pass on WhatsApp'}</span>
                </button>
              </div>

              {imageCopiedHint && (
                <div className="id-image-copied-toast" role="status">
                  <span>📋 <strong>Real pass image copied!</strong> In WhatsApp, simply press <strong>Ctrl + V</strong> (or Paste) to send the image!</span>
                </div>
              )}

              <p className="id-download-hint">
                💡 <strong>Tip:</strong> You can also take a screenshot of the pass. Simply show this QR code at the entry gate on 1st November for instant entry without standing in line!
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
