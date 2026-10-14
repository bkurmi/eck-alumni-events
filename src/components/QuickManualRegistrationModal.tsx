import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { ECKEvent } from '../types';
import { ENGINEERING_DISCIPLINES, INDIAN_STATES } from '../types';
import { supabase } from '../lib/supabase';
import { calculateContribution } from '../lib/pricing';
import { lookupRegistrationByMobile, cleanMobileNumber } from '../lib/registrations';
import { DEFAULT_UPI_CONFIGS, UPI_ACCOUNT_NAMES } from '../lib/paymentRotation';

interface QuickManualRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: ECKEvent;
  onSuccess: () => Promise<void> | void;
  currentUserEmail?: string;
}

interface CreatedRegistrationSummary {
  registration_id: string;
  registration_number: string;
  name: string;
  mobile: string;
  attendance_status: string;
  number_of_attendees: number;
  adults_count: number;
  kids_above_10: number;
  kids_under_10: number;
  amount: number;
  upi_id?: string;
  is_update?: boolean;
}

/**
 * Smart discipline matcher to reconcile DB discipline strings
 * e.g. "Electronics & Communication Engineering" -> "Electronics & Communication"
 */
function matchDiscipline(rawDisc?: string | null): string {
  if (!rawDisc || !rawDisc.trim()) return '';
  const trimmed = rawDisc.trim();

  // 1. Exact match
  const exact = ENGINEERING_DISCIPLINES.find(
    (d) => d.toLowerCase() === trimmed.toLowerCase()
  );
  if (exact) return exact;

  // 2. Normalized match (remove 'engineering', '&', non-alpha)
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/engineering/g, '')
      .replace(/[^a-z0-9]/g, '');
  const cleanRaw = clean(trimmed);

  const matched = ENGINEERING_DISCIPLINES.find((d) => {
    const cleanD = clean(d);
    return (
      cleanD &&
      (cleanRaw === cleanD ||
        cleanRaw.startsWith(cleanD) ||
        cleanD.startsWith(cleanRaw))
    );
  });

  if (matched) return matched;

  // 3. Fallback: return raw string
  return trimmed;
}

export const QuickManualRegistrationModal: React.FC<QuickManualRegistrationModalProps> = ({
  isOpen,
  onClose,
  event,
  onSuccess,
  currentUserEmail,
}) => {
  // Core Mandatory Fields
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');

  // Field-specific validation errors
  const [nameError, setNameError] = useState<string | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Field touch tracking
  const [mobileTouched, setMobileTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  // Auto-detection lookup status
  const [lookupLoading, setLookupLoading] = useState(false);
  const [existingRegInfo, setExistingRegInfo] = useState<{
    found: boolean;
    regNumber?: string;
    existingName?: string;
    existingBatch?: number;
    existingDiscipline?: string;
    existingCity?: string;
    existingAttendees?: number;
    existingAmount?: number;
  } | null>(null);

  // Attendance & Guests
  const [attendanceStatus, setAttendanceStatus] = useState<'yes' | 'maybe' | 'no'>('yes');
  const [adultsCount, setAdultsCount] = useState<number>(1);
  const [kidsAbove10, setKidsAbove10] = useState<number>(0);
  const [kidsUnder10, setKidsUnder10] = useState<number>(0);

  // Contribution & Payment
  const [amountOverride, setAmountOverride] = useState<string>('');
  const [isCustomAmount, setIsCustomAmount] = useState<boolean>(false);
  const [markAsVerified, setMarkAsVerified] = useState<boolean>(true);
  const [selectedUpiId, setSelectedUpiId] = useState<string>('9799951857@upi');
  const [customUpiInput, setCustomUpiInput] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('Paid directly via QR (Manual Admin Entry)');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);

  // Optional Alumni Details
  const [showOptionalDetails, setShowOptionalDetails] = useState<boolean>(false);
  const [yearOfPassing, setYearOfPassing] = useState<string>('');
  const [engineeringDiscipline, setEngineeringDiscipline] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [state, setState] = useState<string>('Rajasthan');
  const [email, setEmail] = useState<string>('');
  const [organization, setOrganization] = useState<string>('');
  const [workLocation, setWorkLocation] = useState<string>('');

  // Processing state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdSummary, setCreatedSummary] = useState<CreatedRegistrationSummary | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  // List of passing years
  const currentYear = new Date().getFullYear();
  const passingYears = useMemo(() => {
    return Array.from({ length: currentYear - 1980 + 1 }, (_, i) => currentYear - i);
  }, [currentYear]);

  // Discipline options including any existing custom discipline
  const disciplineOptions = useMemo(() => {
    const standard = ENGINEERING_DISCIPLINES.filter((d) => d !== 'Other') as string[];
    const options = [...standard];
    if (
      engineeringDiscipline &&
      engineeringDiscipline !== 'Other' &&
      !options.includes(engineeringDiscipline)
    ) {
      options.push(engineeringDiscipline);
    }
    options.push('Other');
    return options;
  }, [engineeringDiscipline]);

  // Known receiving UPI options (including current selected UPI if custom)
  const upiOptions = useMemo(() => {
    const list = [
      ...DEFAULT_UPI_CONFIGS.map((c) => ({
        upi_id: c.upi_id.toLowerCase().trim(),
        label: `${c.account_name || UPI_ACCOUNT_NAMES[c.upi_id.toLowerCase().trim()] || 'Organizer'} (${c.upi_id})`,
      })),
      {
        upi_id: '9799951857@upi',
        label: `${UPI_ACCOUNT_NAMES['9799951857@upi'] || 'Chetan'} (9799951857@upi)`,
      },
      {
        upi_id: 'cash_handover',
        label: '💵 Cash Handover / Direct',
      },
      {
        upi_id: 'other',
        label: '✏️ Other Custom UPI ID',
      },
    ];

    if (
      selectedUpiId &&
      selectedUpiId !== 'other' &&
      selectedUpiId !== 'cash_handover'
    ) {
      const norm = selectedUpiId.toLowerCase().trim();
      if (!list.some((item) => item.upi_id === norm)) {
        list.splice(list.length - 2, 0, {
          upi_id: norm,
          label: `${UPI_ACCOUNT_NAMES[norm] || 'Recorded Account'} (${norm})`,
        });
      }
    }

    const seen = new Set<string>();
    return list.filter((item) => {
      if (seen.has(item.upi_id)) return false;
      seen.add(item.upi_id);
      return true;
    });
  }, [selectedUpiId]);

  // Calculate pricing (mapped to pricing rule: kidsAbove7 in schema = 10+ years in display)
  const pricing = useMemo(() => {
    if (attendanceStatus !== 'yes') {
      return calculateContribution(0, 0, 0);
    }
    return calculateContribution(adultsCount, kidsAbove10, kidsUnder10);
  }, [attendanceStatus, adultsCount, kidsAbove10, kidsUnder10]);

  // Sync default amount when attendees change (unless manually overridden)
  useEffect(() => {
    if (!isCustomAmount) {
      setAmountOverride(String(pricing.totalAmount));
    }
  }, [pricing.totalAmount, isCustomAmount]);

  // Field validation helpers
  const validateName = (val: string): boolean => {
    if (!val.trim()) {
      setNameError('Please enter alumnus full name.');
      return false;
    }
    setNameError(null);
    return true;
  };

  const validateMobile = (val: string): boolean => {
    const digits = (val || '').replace(/\D/g, '');
    if (!digits) {
      setMobileError('Mobile / WhatsApp number is mandatory.');
      return false;
    }
    if (digits.length !== 10) {
      setMobileError(
        `Mobile number must be exactly 10 digits (currently ${digits.length} ${
          digits.length === 1 ? 'digit' : 'digits'
        }).`
      );
      return false;
    }
    setMobileError(null);
    return true;
  };

  const validateEmail = (val: string): boolean => {
    const trimmed = (val || '').trim();
    if (!trimmed) {
      setEmailError(null);
      return true;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setEmailError('Please enter a valid email address (e.g. name@example.com) or leave blank.');
      return false;
    }
    setEmailError(null);
    return true;
  };

  // Reset or focus on open
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setNameError(null);
      setMobileError(null);
      setEmailError(null);
      setMobileTouched(false);
      setEmailTouched(false);
      if (!createdSummary) {
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 100);
      }
    }
  }, [isOpen, createdSummary]);

  // Debounced mobile lookup to check existing registration and FULLY map all fields
  useEffect(() => {
    const clean = cleanMobileNumber(mobile);
    if (clean.length !== 10) {
      setExistingRegInfo(null);
      return;
    }

    let isMounted = true;
    setLookupLoading(true);

    const timer = setTimeout(async () => {
      try {
        const lookup = await lookupRegistrationByMobile(event.event_slug, clean);
        if (!isMounted) return;

        if (lookup.found && lookup.registration_number) {
          const prevAdults = lookup.adults_count ?? (lookup.number_of_attendees || 1);
          const prevKids10 = lookup.children_above_7_count ?? 0;
          const prevKidsUnder10 = lookup.children_under_7_count ?? 0;

          setExistingRegInfo({
            found: true,
            regNumber: lookup.registration_number,
            existingName: lookup.alumni?.name,
            existingBatch: lookup.alumni?.year_of_passing,
            existingDiscipline: lookup.alumni?.engineering_discipline,
            existingCity: lookup.alumni?.city,
            existingAttendees: lookup.number_of_attendees,
            existingAmount: lookup.amount,
          });

          // 1. Populate Name and CLEAR any name error
          if (lookup.alumni?.name) {
            setName(lookup.alumni.name);
            setNameError(null);
          }

          // 2. Populate Attendance Status & Guest counts
          if (lookup.attendance_status) {
            setAttendanceStatus(lookup.attendance_status as 'yes' | 'maybe' | 'no');
          }
          setAdultsCount(Math.max(1, prevAdults));
          setKidsAbove10(prevKids10);
          setKidsUnder10(prevKidsUnder10);

          // 3. Populate Amount
          if (typeof lookup.amount === 'number' && lookup.amount > 0) {
            setAmountOverride(String(lookup.amount));
            setIsCustomAmount(true);
          } else {
            const calc = calculateContribution(prevAdults, prevKids10, prevKidsUnder10);
            setAmountOverride(String(calc.totalAmount));
          }

          // 4. Fetch existing UPI payment verification from payment_verifications ledger
          if (lookup.registration_id) {
            try {
              const { data: verifData } = await supabase
                .from('payment_verifications')
                .select('upi_id, notes, amount')
                .eq('registration_id', lookup.registration_id)
                .maybeSingle();

              if (verifData?.upi_id) {
                setSelectedUpiId(verifData.upi_id.toLowerCase().trim());
                setMarkAsVerified(true);
              }
              if (verifData?.notes) {
                setPaymentNotes(verifData.notes);
              }
            } catch (vErr) {
              console.warn('Verif ledger lookup notice:', vErr);
            }
          }

          // 5. Populate Batch / Passing Year
          if (lookup.alumni?.year_of_passing && lookup.alumni.year_of_passing > 1900) {
            setYearOfPassing(String(lookup.alumni.year_of_passing));
          }

          // 6. Populate Discipline with smart matching
          if (lookup.alumni?.engineering_discipline) {
            const matched = matchDiscipline(lookup.alumni.engineering_discipline);
            setEngineeringDiscipline(matched);
          }

          // 7. Populate City & State
          if (lookup.alumni?.city && lookup.alumni.city !== 'Not Specified') {
            setCity(lookup.alumni.city);
          }
          if (lookup.alumni?.state && lookup.alumni.state !== 'Not Specified') {
            setState(lookup.alumni.state);
          }

          // 8. Populate Email, Org, Work Location
          if (lookup.alumni?.email) {
            setEmail(lookup.alumni.email);
            setEmailError(null);
          }
          if (lookup.alumni?.organization) {
            setOrganization(lookup.alumni.organization);
          }
          if (lookup.alumni?.work_location) {
            setWorkLocation(lookup.alumni.work_location);
          }

          // Automatically expand optional details accordion so admin sees existing profile
          if (
            lookup.alumni?.year_of_passing ||
            lookup.alumni?.engineering_discipline ||
            lookup.alumni?.city ||
            lookup.alumni?.email ||
            lookup.alumni?.organization
          ) {
            setShowOptionalDetails(true);
          }
        } else {
          setExistingRegInfo(null);
        }
      } catch (err) {
        console.warn('Lookup notice:', err);
      } finally {
        if (isMounted) setLookupLoading(false);
      }
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [mobile, event.event_slug]);

  if (!isOpen) return null;

  const resetForm = () => {
    setName('');
    setMobile('');
    setNameError(null);
    setMobileError(null);
    setEmailError(null);
    setMobileTouched(false);
    setEmailTouched(false);
    setExistingRegInfo(null);
    setAttendanceStatus('yes');
    setAdultsCount(1);
    setKidsAbove10(0);
    setKidsUnder10(0);
    setAmountOverride('800');
    setIsCustomAmount(false);
    setMarkAsVerified(true);
    setSelectedUpiId('9799951857@upi');
    setCustomUpiInput('');
    setPaymentNotes('Paid directly via QR (Manual Admin Entry)');
    setScreenshotFile(null);
    setYearOfPassing('');
    setEngineeringDiscipline('');
    setCity('');
    setState('Rajasthan');
    setEmail('');
    setOrganization('');
    setWorkLocation('');
    setShowOptionalDetails(false);
    setErrorMsg(null);
    setCreatedSummary(null);
    setCopiedSuccess(false);
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 80);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Mandatory Validations on respective fields
    const isNameValid = validateName(name);
    const isMobileValid = validateMobile(mobile);
    const isEmailValid = validateEmail(email);

    setMobileTouched(true);
    setEmailTouched(true);

    if (!isNameValid) {
      nameInputRef.current?.focus();
      return;
    }

    if (!isMobileValid) {
      mobileInputRef.current?.focus();
      return;
    }

    if (!isEmailValid) {
      setShowOptionalDetails(true);
      setTimeout(() => {
        emailInputRef.current?.focus();
      }, 50);
      return;
    }

    const trimmedName = name.trim();
    const cleanMobile = cleanMobileNumber(mobile);

    const effectiveAmount = Math.max(
      0,
      parseFloat(amountOverride) || pricing.totalAmount
    );

    const effectiveUpi =
      selectedUpiId === 'other'
        ? (customUpiInput.trim().toLowerCase() || 'manual_upi')
        : selectedUpiId.toLowerCase().trim();

    setSubmitting(true);

    try {
      // 2. Upload screenshot if admin selected one
      let uploadedScreenshotPath: string | null = null;
      if (screenshotFile) {
        const fileExt = screenshotFile.name.split('.').pop() || 'jpg';
        const cleanExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanName = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'alumni';
        const fileName = `${event.event_slug}/manual_${cleanMobile}_${cleanName}_${Date.now()}.${cleanExt}`;

        try {
          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('payment-screenshots')
            .upload(fileName, screenshotFile, {
              cacheControl: '3600',
              upsert: true,
            });

          if (uploadErr) {
            console.warn('[Manual Entry Screenshot Upload Warning]:', uploadErr);
          } else if (uploadData) {
            uploadedScreenshotPath = uploadData.path;
          }
        } catch (storageEx) {
          console.warn('[Manual Entry Storage Exception]:', storageEx);
        }
      }

      // If no screenshot uploaded, tag with admin indicator so report distinguishes it
      const finalScreenshotPath = uploadedScreenshotPath || 'manual-admin-entry';

      // 3. Defaults for DB constraints on `alumni` and `event_registrations`
      const resolvedAddress = 'Not Specified (Admin Offline Entry)';
      const resolvedCity = city.trim() || 'Not Specified';
      const resolvedState = state.trim() || 'Rajasthan';
      const resolvedCountry = 'India';
      const resolvedYear = yearOfPassing ? Number(yearOfPassing) : 0;
      const resolvedDiscipline = engineeringDiscipline.trim() || 'Not Specified';
      const totalAttendees =
        attendanceStatus === 'yes'
          ? Math.max(1, adultsCount + kidsAbove10 + kidsUnder10)
          : 1;

      // 4. Call `register_for_event` RPC (Database column is `p_children_above_7_count`, which holds 10+ years kids)
      const rpcPayload: any = {
        p_event_slug: event.event_slug,
        p_name: trimmedName,
        p_mobile: cleanMobile,
        p_address: resolvedAddress,
        p_country: resolvedCountry,
        p_city: resolvedCity,
        p_state: resolvedState,
        p_year_of_passing: resolvedYear,
        p_engineering_discipline: resolvedDiscipline,
        p_attendance_status: attendanceStatus,
        p_number_of_attendees: totalAttendees,
        p_adults_count: attendanceStatus === 'yes' ? adultsCount : 1,
        p_children_above_7_count: attendanceStatus === 'yes' ? kidsAbove10 : 0,
        p_children_under_7_count: attendanceStatus === 'yes' ? kidsUnder10 : 0,
        p_email: email.trim() || null,
        p_organization: organization.trim() || null,
        p_work_location: workLocation.trim() || null,
        p_payment_screenshot_path: finalScreenshotPath,
      };

      const { data, error } = await supabase.rpc('register_for_event', rpcPayload);

      let regResult: any = data;
      if (error) {
        // Fallback schema if DB RPC has earlier signature
        console.warn('RPC register_for_event primary call error, trying fallback:', error);
        const { data: fbData, error: fbErr } = await supabase.rpc('register_for_event', {
          p_event_slug: event.event_slug,
          p_name: trimmedName,
          p_mobile: cleanMobile,
          p_address: resolvedAddress,
          p_city: resolvedCity,
          p_state: resolvedState,
          p_year_of_passing: resolvedYear,
          p_engineering_discipline: resolvedDiscipline,
          p_attendance_status: attendanceStatus,
          p_number_of_attendees: totalAttendees,
          p_email: email.trim() || null,
          p_organization: organization.trim() || null,
          p_work_location: workLocation.trim() || null,
          p_payment_screenshot_path: finalScreenshotPath,
        });

        if (fbErr) {
          throw new Error(fbErr.message || error.message || 'Failed to register via database.');
        }
        regResult = fbData;
      }

      if (!regResult || !regResult.registration_number) {
        throw new Error('Registration completed but no registration number was returned.');
      }

      const assignedRegId = regResult.registration_id;
      const assignedRegNum = regResult.registration_number;

      // 5. If Custom Amount was entered and differs from standard RPC amount, try updating event_registrations
      if (isCustomAmount && effectiveAmount !== regResult.amount && assignedRegId) {
        try {
          await supabase
            .from('event_registrations')
            .update({ amount: effectiveAmount })
            .eq('id', assignedRegId);
        } catch (updateAmtErr) {
          console.warn('Could not update custom amount on event_registrations directly:', updateAmtErr);
        }
      }

      // 6. Record Payment Verification immediately in the UPI Ledger
      if (markAsVerified && assignedRegId) {
        try {
          const verifiedBy = currentUserEmail || 'admin';
          const { error: verifError } = await supabase
            .from('payment_verifications')
            .upsert(
              {
                registration_id: assignedRegId,
                upi_id: effectiveUpi,
                amount: effectiveAmount,
                verified_status: 'VERIFIED',
                notes: paymentNotes.trim() || 'Direct QR payment - verified by admin',
                verified_by: verifiedBy,
              },
              { onConflict: 'registration_id' }
            );

          if (verifError) {
            console.warn('Payment verification upsert warning:', verifError);
          }
        } catch (vErr) {
          console.warn('Payment verification exception:', vErr);
        }
      }

      // 7. Refresh parent registrations
      await onSuccess();

      // 8. Set Success State
      setCreatedSummary({
        registration_id: assignedRegId,
        registration_number: assignedRegNum,
        name: trimmedName,
        mobile: cleanMobile,
        attendance_status: attendanceStatus,
        number_of_attendees: totalAttendees,
        adults_count: adultsCount,
        kids_above_10: kidsAbove10,
        kids_under_10: kidsUnder10,
        amount: effectiveAmount,
        upi_id: effectiveUpi,
        is_update: regResult.is_update,
      });
    } catch (err: any) {
      console.error('[Quick Manual Registration Error]:', err);
      setErrorMsg(err?.message || 'Failed to create registration. Please check the network or inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  // Build Personalized WhatsApp Confirmation Message
  const buildWhatsAppConfirmationMessage = (summary: CreatedRegistrationSummary) => {
    const rawDate = event.event_date || '2026-11-01';
    let formattedDate = rawDate;
    const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      formattedDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    }
    const venue = event.location || 'ECK Campus, Kota';
    const webUrl = typeof window !== 'undefined' ? window.location.origin : 'https://eck-alumni.org';

    // Breakdown text
    const attendeeParts: string[] = [];
    if (summary.adults_count) {
      attendeeParts.push(`${summary.adults_count} Adult${summary.adults_count > 1 ? 's' : ''}`);
    }
    if (summary.kids_above_10) {
      attendeeParts.push(`${summary.kids_above_10} Child (10+)`);
    }
    if (summary.kids_under_10) {
      attendeeParts.push(`${summary.kids_under_10} Child (<10)`);
    }
    const breakdownText = attendeeParts.length > 0 ? ` (${attendeeParts.join(', ')})` : '';

    const lines = [
      '🪔✨ *ECK-RTU ALUMNI DEEPAURA 2K26* ✨🪔',
      '🏛️ *Organised By:* ECK-RTU Alumni Kota Chapter',
      '✨ *Tagline:* “दीप जले, यादें मुस्कुराएँ।”',
      '',
      `Namaste *${summary.name} Ji*,`,
      'Your registration for *ECK-RTU Alumni DeepAura 2K26* has been recorded & confirmed by the organizing committee! 🎉',
      '',
      `🎫 *Registration ID:* ${summary.registration_number}`,
      `👤 *Alumnus Name:* ${summary.name}`,
      `📞 *Mobile / WhatsApp:* ${summary.mobile}`,
      `👥 *Attendees:* ${summary.number_of_attendees} ${summary.number_of_attendees === 1 ? 'Person' : 'People'}${breakdownText}`,
      `✨ *Attendance Status:* ${summary.attendance_status.toUpperCase()}`,
      summary.attendance_status === 'yes'
        ? `💰 *Contribution Recorded:* ₹${summary.amount} (Payment Verified ✅)`
        : '',
      '',
      '━━━━━━━━━━━━━━━━━━━━━',
      `📅 *Date:* ${formattedDate} (${event.event_time || '5:00 PM onwards'})`,
      `📍 *Venue:* ${venue}`,
      `🔗 *Event Portal:* ${webUrl}`,
      '',
      '🪔 *“दीप जले, यादें मुस्कुराएँ।” We look forward to meeting you at the reunion!* ✨',
    ];

    return lines.filter(Boolean).join('\n');
  };

  const handleShareWhatsApp = (summary: CreatedRegistrationSummary) => {
    const text = buildWhatsAppConfirmationMessage(summary);
    const encoded = encodeURIComponent(text);
    const cleanNum = summary.mobile.replace(/\D/g, '');
    const phoneParam = cleanNum ? `phone=91${cleanNum}&` : '';

    const isMobileDevice =
      typeof navigator !== 'undefined' &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobileDevice) {
      window.open(`whatsapp://send?${phoneParam}text=${encoded}`, '_self');
      setTimeout(() => {
        window.open(`https://api.whatsapp.com/send?${phoneParam}text=${encoded}`, '_blank');
      }, 700);
    } else {
      window.open(`https://web.whatsapp.com/send?${phoneParam}text=${encoded}`, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyConfirmation = async (summary: CreatedRegistrationSummary) => {
    const text = buildWhatsAppConfirmationMessage(summary);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  const currentDigits = mobile.replace(/\D/g, '');
  const isNameInvalid = Boolean(nameError && !name.trim());

  return (
    <div className="modal-overlay" onClick={handleClose} role="dialog" aria-modal="true">
      <div
        className="modal-content quick-manual-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '100%', maxHeight: '92vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="modal-tag" style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                ADMIN TOOL
              </span>
              <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                ⚡ Quick Offline / QR Entry
              </span>
            </div>
            <h2 className="modal-title" style={{ fontSize: '1.25rem', margin: 0 }}>
              {createdSummary ? 'Registration Confirmed!' : 'Quick Manual Registration'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {createdSummary
                ? 'The alumnus has been successfully registered and recorded in the database.'
                : 'For alumni who paid via QR/UPI directly. Only Name & Phone are required!'}
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={handleClose}
            aria-label="Close Modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '20px' }}>
          {/* SUCCESS SCREEN */}
          {createdSummary ? (
            <div className="quick-manual-success-box" style={{ textAlign: 'center', padding: '10px 0' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '2px solid #10b981',
                  color: '#10b981',
                  fontSize: '2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                ✓
              </div>

              <h3 style={{ color: '#fff', fontSize: '1.35rem', marginBottom: '6px' }}>
                {createdSummary.is_update ? 'Registration Updated Successfully!' : 'Alumnus Successfully Registered!'}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
                Assigned Registration Number:
              </p>

              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(245, 158, 11, 0.15))',
                  border: '1px solid var(--border-gold)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '24px',
                  display: 'inline-block',
                  minWidth: '260px',
                }}
              >
                <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--accent-gold)', letterSpacing: '1px', fontFamily: 'monospace' }}>
                  {createdSummary.registration_number}
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', marginTop: '4px' }}>
                  {createdSummary.name}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  📞 {createdSummary.mobile} • {createdSummary.number_of_attendees} {createdSummary.number_of_attendees === 1 ? 'Attendee' : 'Attendees'}
                  {createdSummary.kids_above_10 > 0 ? ` (${createdSummary.kids_above_10} Child 10+)` : ''}
                  {createdSummary.kids_under_10 > 0 ? ` (${createdSummary.kids_under_10} Child <10)` : ''}
                </div>
                {createdSummary.attendance_status === 'yes' && (
                  <div style={{ marginTop: '8px', fontSize: '0.9rem', fontWeight: 700, color: '#10b981' }}>
                    💰 Contribution: ₹{createdSummary.amount} (Verified in Ledger)
                  </div>
                )}
              </div>

              {/* Action Buttons for WhatsApp */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '380px', margin: '0 auto' }}>
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(createdSummary)}
                  className="btn btn-whatsapp-primary"
                  style={{ width: '100%', padding: '12px 18px', fontSize: '0.95rem' }}
                >
                  💬 Send Confirmation on WhatsApp
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyConfirmation(createdSummary)}
                  className={`btn btn-secondary ${copiedSuccess ? 'btn-copied' : ''}`}
                  style={{ width: '100%', padding: '10px 18px' }}
                >
                  {copiedSuccess ? '✓ Copied Confirmation Message!' : '📋 Copy Message Text'}
                </button>

                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    + Register Another
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="btn btn-ghost"
                    style={{ flex: 1 }}
                  >
                    Done &amp; Close
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* FORM SCREEN */
            <form onSubmit={handleSubmit} noValidate>
              {errorMsg && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#fca5a5',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '0.88rem',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span>⚠️</span>
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* SECTION 1: MANDATORY DETAILS */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    1. Mandatory Alumnus Details
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600 }}>
                    * Only Name &amp; Phone are mandatory
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                  {/* Name Field */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>
                      Alumnus Full Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      ref={nameInputRef}
                      type="text"
                      required
                      placeholder="e.g. Ramesh Sharma"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (e.target.value.trim()) {
                          setNameError(null);
                        }
                      }}
                      onBlur={(e) => {
                        if (!e.target.value.trim()) {
                          setNameError('Please enter alumnus full name.');
                        } else {
                          setNameError(null);
                        }
                      }}
                      className="search-input"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: isNameInvalid ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '6px',
                        color: '#fff',
                      }}
                    />
                    {isNameInvalid && (
                      <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '4px', display: 'block' }}>
                        ⚠️ {nameError}
                      </span>
                    )}
                  </div>

                  {/* Phone / Mobile Field */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                        Mobile / WhatsApp Number <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <span
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          color:
                            currentDigits.length === 10
                              ? '#10b981'
                              : currentDigits.length > 0
                              ? '#f59e0b'
                              : 'var(--text-muted)',
                        }}
                      >
                        {currentDigits.length}/10 digits
                      </span>
                    </div>

                    <div style={{ position: 'relative' }}>
                      <input
                        ref={mobileInputRef}
                        type="tel"
                        required
                        maxLength={10}
                        placeholder="10-digit mobile (e.g. 9829012345)"
                        value={mobile}
                        onChange={(e) => {
                          const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setMobile(digitsOnly);
                          if (mobileTouched || mobileError) {
                            validateMobile(digitsOnly);
                          }
                        }}
                        onBlur={(e) => {
                          setMobileTouched(true);
                          validateMobile(e.target.value);
                        }}
                        className="search-input"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          border:
                            mobileError && mobileTouched
                              ? '1px solid #ef4444'
                              : currentDigits.length === 10
                              ? '1px solid #10b981'
                              : '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: '6px',
                          color: '#fff',
                        }}
                      />
                      {lookupLoading && (
                        <span style={{ position: 'absolute', right: '10px', top: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          ⏳ Checking...
                        </span>
                      )}
                    </div>

                    {mobileError && mobileTouched && (
                      <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '4px', display: 'block' }}>
                        ⚠️ {mobileError}
                      </span>
                    )}
                  </div>
                </div>

                {/* Existing Alumnus Banner */}
                {existingRegInfo?.found && (
                  <div
                    style={{
                      marginTop: '12px',
                      background: 'rgba(99, 102, 241, 0.12)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '0.82rem',
                      color: '#c7d2fe',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                    }}
                  >
                    <span style={{ fontSize: '1rem' }}>ℹ️</span>
                    <div>
                      <strong>Existing Record Loaded:</strong> {existingRegInfo.regNumber} ({existingRegInfo.existingName || 'Alumnus'})
                      {existingRegInfo.existingBatch ? ` • Batch ${existingRegInfo.existingBatch}` : ''}
                      {existingRegInfo.existingCity ? ` • ${existingRegInfo.existingCity}` : ''}
                      {existingRegInfo.existingAttendees ? ` • ${existingRegInfo.existingAttendees} Person(s)` : ''}.
                      <div style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.65)', marginTop: '2px' }}>
                        All details &amp; existing contribution (₹{existingRegInfo.existingAmount || 0}) have been auto-populated below. Submitting will update this record.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 2: ATTENDANCE & GUESTS */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    2. Attendance &amp; Accompanying Guests
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Auto-loaded from profile / Defaults to 1 Adult
                  </span>
                </div>

                {/* Attendance Status Selector */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  {(['yes', 'maybe', 'no'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setAttendanceStatus(status)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: attendanceStatus === status
                          ? '1px solid var(--accent-gold)'
                          : '1px solid rgba(255, 255, 255, 0.1)',
                        background: attendanceStatus === status
                          ? 'rgba(245, 158, 11, 0.18)'
                          : 'rgba(0, 0, 0, 0.2)',
                        color: attendanceStatus === status ? '#fff' : 'var(--text-muted)',
                        fontWeight: attendanceStatus === status ? 700 : 500,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {status === 'yes' && '✓ Attending (Yes)'}
                      {status === 'maybe' && '❓ Maybe'}
                      {status === 'no' && '✕ Not Attending'}
                    </button>
                  ))}
                </div>

                {/* Steppers for counts if Yes */}
                {attendanceStatus === 'yes' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                    {/* Adults Count */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Adults (12+ Years)
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAmount(false);
                            setAdultsCount((prev) => Math.max(1, prev - 1));
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 12px' }}
                        >
                          -
                        </button>
                        <span style={{ fontWeight: 700, minWidth: '32px', textAlign: 'center', fontSize: '1rem', color: '#fff' }}>
                          {adultsCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAmount(false);
                            setAdultsCount((prev) => prev + 1);
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 12px' }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Children (10+ Years) */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Children (10+ Years) (+₹300)
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAmount(false);
                            setKidsAbove10((prev) => Math.max(0, prev - 1));
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 12px' }}
                        >
                          -
                        </button>
                        <span style={{ fontWeight: 700, minWidth: '32px', textAlign: 'center', fontSize: '1rem', color: '#fff' }}>
                          {kidsAbove10}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAmount(false);
                            setKidsAbove10((prev) => prev + 1);
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 12px' }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Children (Under 10 Years) */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Children (Under 10 Years) (Free)
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAmount(false);
                            setKidsUnder10((prev) => Math.max(0, prev - 1));
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 12px' }}
                        >
                          -
                        </button>
                        <span style={{ fontWeight: 700, minWidth: '32px', textAlign: 'center', fontSize: '1rem', color: '#fff' }}>
                          {kidsUnder10}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAmount(false);
                            setKidsUnder10((prev) => prev + 1);
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 12px' }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: PAYMENT & UPI RECONCILIATION */}
              {attendanceStatus === 'yes' && (
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    padding: '16px',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      3. Payment &amp; UPI Ledger Tagging
                    </span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#10b981', cursor: 'pointer', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={markAsVerified}
                        onChange={(e) => setMarkAsVerified(e.target.checked)}
                      />
                      <span>Tag as Verified</span>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                    {/* Amount Received */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                          Amount Received (₹)
                        </label>
                        {!isCustomAmount ? (
                          <button
                            type="button"
                            onClick={() => setIsCustomAmount(true)}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-gold)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            Custom Amount?
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomAmount(false);
                              setAmountOverride(String(pricing.totalAmount));
                            }}
                            style={{ background: 'none', border: 'none', color: '#10b981', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            Reset to Formula (₹{pricing.totalAmount})
                          </button>
                        )}
                      </div>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--accent-gold)', fontWeight: 700 }}>
                          ₹
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          value={amountOverride}
                          onChange={(e) => {
                            setIsCustomAmount(true);
                            setAmountOverride(e.target.value);
                          }}
                          className="search-input"
                          style={{
                            width: '100%',
                            padding: '10px 12px 10px 28px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: isCustomAmount ? '1px solid var(--accent-gold)' : '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '6px',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '1rem',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        Standard rate: ₹{pricing.totalAmount} for {adultsCount} {adultsCount === 1 ? 'adult' : 'adults'}
                        {kidsAbove10 > 0 ? ` + ${kidsAbove10} children (10+)` : ''}
                      </span>
                    </div>

                    {/* Receiving UPI Account */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                        Received On Account / UPI ID
                      </label>
                      <select
                        value={selectedUpiId}
                        onChange={(e) => setSelectedUpiId(e.target.value)}
                        className="search-input"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: '6px',
                          color: '#fff',
                        }}
                      >
                        {upiOptions.map((opt) => (
                          <option key={opt.upi_id} value={opt.upi_id} style={{ background: '#1e1e24', color: '#fff' }}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      {selectedUpiId === 'other' && (
                        <input
                          type="text"
                          placeholder="Type UPI ID or Name..."
                          value={customUpiInput}
                          onChange={(e) => setCustomUpiInput(e.target.value)}
                          className="search-input"
                          style={{
                            width: '100%',
                            marginTop: '6px',
                            padding: '8px 10px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid var(--accent-gold)',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '0.85rem',
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Payment Notes & Optional Screenshot */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Transaction / Reference Notes (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Paid to QR on WhatsApp / UTR 12345"
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        className="search-input"
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '6px',
                          color: '#fff',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Payment Screenshot (Optional)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setScreenshotFile(file);
                        }}
                        style={{
                          width: '100%',
                          fontSize: '0.8rem',
                          color: 'var(--text-muted)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 4: OPTIONAL ALUMNI DETAILS (ACCORDION) */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px dashed rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  marginBottom: '20px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowOptionalDetails(!showOptionalDetails)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: showOptionalDetails ? 'var(--primary-light)' : '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: 0,
                    cursor: 'pointer',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{showOptionalDetails ? '▾' : '▸'}</span>
                    <span>Additional Alumni Information</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      (Batch, Branch, City, Email, Workplace - All Optional)
                    </span>
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--accent-gold)' }}>
                    {showOptionalDetails ? 'Hide' : 'Add Details'}
                  </span>
                </button>

                {showOptionalDetails && (
                  <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                      {/* Year of Passing */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Batch / Passing Year
                        </label>
                        <select
                          value={yearOfPassing}
                          onChange={(e) => setYearOfPassing(e.target.value)}
                          className="search-input"
                          style={{ width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#fff' }}
                        >
                          <option value="" style={{ background: '#1e1e24' }}>-- Not Specified --</option>
                          {passingYears.map((y) => (
                            <option key={y} value={y} style={{ background: '#1e1e24' }}>
                              Batch of {y}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Engineering Discipline */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Branch / Discipline
                        </label>
                        <select
                          value={engineeringDiscipline}
                          onChange={(e) => setEngineeringDiscipline(e.target.value)}
                          className="search-input"
                          style={{ width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#fff' }}
                        >
                          <option value="" style={{ background: '#1e1e24' }}>-- Not Specified --</option>
                          {disciplineOptions.map((d) => (
                            <option key={d} value={d} style={{ background: '#1e1e24' }}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* City */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          City
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Kota / Jaipur"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="search-input"
                          style={{ width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#fff' }}
                        />
                      </div>

                      {/* State */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          State
                        </label>
                        <select
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          className="search-input"
                          style={{ width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#fff' }}
                        >
                          {INDIAN_STATES.map((s) => (
                            <option key={s} value={s} style={{ background: '#1e1e24' }}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                      {/* Email Field with inline validation */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Email Address (Optional)
                        </label>
                        <input
                          ref={emailInputRef}
                          type="email"
                          placeholder="e.g. name@example.com"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (emailTouched || emailError) {
                              validateEmail(e.target.value);
                            }
                          }}
                          onBlur={(e) => {
                            setEmailTouched(true);
                            validateEmail(e.target.value);
                          }}
                          className="search-input"
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: 'rgba(0,0,0,0.3)',
                            border: emailError && emailTouched ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '6px',
                            color: '#fff',
                          }}
                        />
                        {emailError && emailTouched && (
                          <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '4px', display: 'block' }}>
                            ⚠️ {emailError}
                          </span>
                        )}
                      </div>

                      {/* Organization */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Organization / Company
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. NTPC / TCS / Self"
                          value={organization}
                          onChange={(e) => setOrganization(e.target.value)}
                          className="search-input"
                          style={{ width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#fff' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Form Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="btn btn-secondary"
                  style={{ minWidth: '100px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary"
                  style={{
                    minWidth: '180px',
                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontWeight: 700,
                  }}
                >
                  {submitting ? (
                    <>
                      <span className="spinner-sm" />
                      <span>Saving Registration...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡ Register Alumnus</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
