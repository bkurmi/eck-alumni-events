import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Check,
  AlertTriangle,
  Copy,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  Loader2,
  Phone,
  User,
  CreditCard,
  Building,
  Mail,
  MapPin,
  Sparkles,
} from 'lucide-react';
import type { ECKEvent } from '../types';
import { ENGINEERING_DISCIPLINES, INDIAN_STATES } from '../types';
import { supabase } from '../lib/supabase';
import { calculateContribution } from '../lib/pricing';
import { lookupRegistrationByMobile, cleanMobileNumber } from '../lib/registrations';
import { getEventUpiConfigs, isCashAccount, CANONICAL_CASH_ACCOUNT } from '../lib/paymentRotation';
import {
  getAllBatchOptions,
  getDefaultPassingYearForBatch,
  getBatchFromPassingYear,
  formatBatchName,
} from '../lib/batchUtils';

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
  batch?: string;
  discipline?: string;
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
  const defaultEventUpi = event?.upi_rotation_configs?.[0]?.upi_id || event?.upi_id || CANONICAL_CASH_ACCOUNT;
  const [selectedUpiId, setSelectedUpiId] = useState<string>(defaultEventUpi);
  const [customUpiInput, setCustomUpiInput] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('Paid directly via QR (Manual Admin Entry)');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);

  // Optional Alumni Details
  const [showOptionalDetails, setShowOptionalDetails] = useState<boolean>(false);
  const [batch, setBatch] = useState<string>('');
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

  // List of passing years & batches
  const { allBatches } = useMemo(() => getAllBatchOptions(), []);
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

  // Known receiving UPI options dynamically loaded from event
  const upiOptions = useMemo(() => {
    const eventConfigs = getEventUpiConfigs(event);
    const list = [
      ...eventConfigs.map((c) => ({
        upi_id: c.upi_id.toLowerCase().trim(),
        label: `${c.account_name || 'Organizer'} (${c.upi_id})`,
      })),
      {
        upi_id: CANONICAL_CASH_ACCOUNT,
        label: '💵 Cash in Hand / Spot Cash',
      },
      {
        upi_id: 'other',
        label: '✏️ Other Custom UPI ID',
      },
    ];

    if (
      selectedUpiId &&
      selectedUpiId !== 'other' &&
      selectedUpiId !== CANONICAL_CASH_ACCOUNT &&
      !isCashAccount(selectedUpiId)
    ) {
      const norm = selectedUpiId.toLowerCase().trim();
      if (!list.some((item) => item.upi_id === norm)) {
        list.splice(list.length - 2, 0, {
          upi_id: norm,
          label: `Recorded Account (${norm})`,
        });
      }
    }

    const seen = new Set<string>();
    return list.filter((item) => {
      if (seen.has(item.upi_id)) return false;
      seen.add(item.upi_id);
      return true;
    });
  }, [selectedUpiId, event]);

  // Calculate pricing dynamically per event
  const pricing = useMemo(() => {
    if (attendanceStatus !== 'yes') {
      return calculateContribution(0, 0, 0, event?.pricing_config, event?.registration_fee);
    }
    return calculateContribution(adultsCount, kidsAbove10, kidsUnder10, event?.pricing_config, event?.registration_fee);
  }, [attendanceStatus, adultsCount, kidsAbove10, kidsUnder10, event?.pricing_config, event?.registration_fee]);

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
      setMobileError(null);
      return true;
    }
    if (digits.length !== 10) {
      setMobileError(
        `Mobile number must be exactly 10 digits if provided (currently ${digits.length} ${
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
            setAttendanceStatus(
              lookup.attendance_status === 'payment_pending'
                ? 'yes'
                : (lookup.attendance_status as 'yes' | 'maybe' | 'no')
            );
          }
          setAdultsCount(Math.max(1, prevAdults));
          setKidsAbove10(prevKids10);
          setKidsUnder10(prevKidsUnder10);

          // 3. Populate Amount
          if (typeof lookup.amount === 'number' && lookup.amount > 0) {
            setAmountOverride(String(lookup.amount));
            setIsCustomAmount(true);
          } else {
            const calc = calculateContribution(prevAdults, prevKids10, prevKidsUnder10, event?.pricing_config, event?.registration_fee);
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

          // 5. Populate Batch & Passing Year
          const resolvedAlumniBatch = lookup.alumni?.batch || (lookup.alumni?.year_of_passing ? getBatchFromPassingYear(lookup.alumni.year_of_passing) : '');
          if (resolvedAlumniBatch) {
            setBatch(resolvedAlumniBatch);
          }
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
  }, [mobile, event.event_slug, event?.pricing_config, event?.registration_fee]);

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
    setSelectedUpiId(event?.upi_rotation_configs?.[0]?.upi_id || event?.upi_id || CANONICAL_CASH_ACCOUNT);
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
    const rawCleanMobile = cleanMobileNumber(mobile);
    // If mobile is omitted, generate a unique offline identifier so PostgreSQL NOT NULL UNIQUE doesn't fail or overwrite
    const dbMobile =
      rawCleanMobile.length === 10
        ? rawCleanMobile
        : `NOMOBILE-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const effectiveAmount = Math.max(
      0,
      parseFloat(amountOverride) || pricing.totalAmount
    );

    const effectiveUpi =
      selectedUpiId === 'other'
        ? (customUpiInput.trim().toLowerCase() || 'manual_upi')
        : isCashAccount(selectedUpiId)
          ? CANONICAL_CASH_ACCOUNT
          : selectedUpiId.toLowerCase().trim();

    setSubmitting(true);

    try {
      // 2. Upload screenshot if admin selected one
      let uploadedScreenshotPath: string | null = null;
      if (screenshotFile) {
        const fileExt = screenshotFile.name.split('.').pop() || 'jpg';
        const cleanExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanName = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'alumni';
        const fileName = `${event.event_slug}/manual_${rawCleanMobile || 'nomobile'}_${cleanName}_${Date.now()}.${cleanExt}`;

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
        p_mobile: dbMobile,
        p_address: resolvedAddress,
        p_country: resolvedCountry,
        p_city: resolvedCity,
        p_state: resolvedState,
        p_batch: batch || (resolvedYear ? getBatchFromPassingYear(resolvedYear) : null),
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
          p_mobile: dbMobile,
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
        mobile: rawCleanMobile.length === 10 ? rawCleanMobile : '',
        batch: batch || (resolvedYear ? getBatchFromPassingYear(resolvedYear) : ''),
        discipline: engineeringDiscipline || undefined,
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
      `🪔✨ *${(event.event_name || 'ECK-RTU ALUMNI').toUpperCase()}* ✨🪔`,
      `🏛️ *Organised By:* ${event.short_name || 'ECK-RTU Alumni Kota Chapter'}`,
      event.tagline ? `✨ *Tagline:* “${event.tagline}”` : '',
      '',
      `Namaste *${summary.name} Ji*,`,
      `Your registration for *${event.event_name || 'Alumni Reunion'}* has been recorded & confirmed by the organizing committee! 🎉`,
      '',
      `🎫 *Registration ID:* ${summary.registration_number}`,
      `👤 *Alumnus Name:* ${summary.name}`,
      summary.batch ? `🎓 *Batch:* ${formatBatchName(summary.batch)}${summary.discipline ? ` • ${summary.discipline}` : ''}` : '',
      summary.mobile ? `📞 *Mobile / WhatsApp:* ${summary.mobile}` : '',
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
      '🪔 *We look forward to meeting you at the reunion!* ✨',
    ];

    return lines.filter(Boolean).join('\n');
  };

  const handleShareWhatsApp = (summary: CreatedRegistrationSummary) => {
    const text = buildWhatsAppConfirmationMessage(summary);
    const encoded = encodeURIComponent(text);
    const cleanNum = summary.mobile.replace(/\D/g, '');
    const phoneParam = cleanNum && cleanNum.length === 10 ? `phone=91${cleanNum}&` : '';

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
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-slate-900 border-t sm:border border-amber-500/30 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between px-4 py-3.5 sm:px-6 sm:py-4 border-b border-slate-800 bg-slate-950/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 rounded">
                Admin Tool
              </span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Quick Offline / QR Entry
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              {createdSummary ? 'Registration Confirmed!' : 'Quick Manual Registration'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-none">
              {createdSummary
                ? 'The alumnus has been successfully recorded in the database.'
                : 'For alumni who paid via QR/UPI or cash. Only Name is mandatory!'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/60 transition-colors"
            aria-label="Close Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 tab-scrollbar">
          {/* SUCCESS SCREEN */}
          {createdSummary ? (
            <div className="text-center py-4 max-w-md mx-auto space-y-5">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto text-2xl shadow-lg shadow-emerald-500/10">
                <Check className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-white">
                  {createdSummary.is_update ? 'Registration Updated!' : 'Alumnus Registered!'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Assigned Registration Number:
                </p>
              </div>

              {/* Number Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-amber-950/20 border border-amber-500/40 shadow-xl">
                <div className="text-2xl sm:text-3xl font-mono font-extrabold text-amber-400 tracking-wider">
                  {createdSummary.registration_number}
                </div>
                <div className="text-base sm:text-lg font-bold text-white mt-1">
                  {createdSummary.name}
                </div>
                <div className="text-xs sm:text-sm text-slate-400 mt-1">
                  {createdSummary.mobile ? `📞 ${createdSummary.mobile} • ` : ''}
                  {createdSummary.number_of_attendees} {createdSummary.number_of_attendees === 1 ? 'Attendee' : 'Attendees'}
                  {createdSummary.kids_above_10 > 0 ? ` (${createdSummary.kids_above_10} Child 10+)` : ''}
                  {createdSummary.kids_under_10 > 0 ? ` (${createdSummary.kids_under_10} Child <10)` : ''}
                </div>
                {createdSummary.attendance_status === 'yes' && (
                  <div className="mt-3 inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    💰 Contribution: ₹{createdSummary.amount} (Verified in Ledger)
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(createdSummary)}
                  className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-colors"
                >
                  <span>💬</span>
                  <span>{createdSummary.mobile ? 'Send WhatsApp Confirmation' : 'Share on WhatsApp'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyConfirmation(createdSummary)}
                  className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    copiedSuccess
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  }`}
                >
                  {copiedSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Copied Confirmation Message!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-400" />
                      <span>Copy Confirmation Text</span>
                    </>
                  )}
                </button>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="min-h-[44px] py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Register Another</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors"
                  >
                    Done & Close
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* FORM SCREEN */
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs sm:text-sm flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* SECTION 1: MANDATORY DETAILS */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    1. Alumnus Primary Details
                  </span>
                  <span className="text-[11px] text-amber-500 font-semibold">
                    * Only Name is mandatory
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Name Field */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                      Alumnus Full Name <span className="text-red-400">*</span>
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
                      className={`w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-900 border text-white placeholder-slate-500 outline-none transition-all ${
                        isNameInvalid
                          ? 'border-red-500 focus:border-red-500 ring-1 ring-red-500/30'
                          : 'border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40'
                      }`}
                    />
                    {isNameInvalid && (
                      <span className="text-red-400 text-xs mt-1 block">
                        ⚠️ {nameError}
                      </span>
                    )}
                  </div>

                  {/* Phone / Mobile Field (Optional) */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        Mobile / WhatsApp
                        <span className="text-slate-500 font-normal">
                          (Optional)
                        </span>
                      </label>
                      <span
                        className={`text-[11px] font-medium ${
                          currentDigits.length === 10
                            ? 'text-emerald-400 font-semibold'
                            : currentDigits.length > 0
                            ? 'text-amber-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {currentDigits.length > 0 ? `${currentDigits.length}/10 digits` : 'Optional'}
                      </span>
                    </div>

                    <div className="relative flex items-stretch rounded-xl overflow-hidden border border-slate-700 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500/40">
                      <span className="px-3 bg-amber-500/10 text-amber-400 font-bold text-xs sm:text-sm flex items-center justify-center select-none border-r border-slate-700">
                        +91
                      </span>
                      <input
                        ref={mobileInputRef}
                        type="tel"
                        maxLength={10}
                        placeholder="e.g. 9829012345"
                        value={mobile}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '');
                          const digitsOnly =
                            digits.length > 10 && digits.startsWith('91')
                              ? digits.slice(2, 12)
                              : digits.slice(0, 10);
                          setMobile(digitsOnly);
                          if (mobileTouched || mobileError) {
                            validateMobile(digitsOnly);
                          }
                        }}
                        onBlur={(e) => {
                          setMobileTouched(true);
                          validateMobile(e.target.value);
                        }}
                        className="w-full min-h-[44px] text-base sm:text-sm px-3 py-2.5 bg-slate-900 text-white placeholder-slate-500 outline-none"
                      />
                      {lookupLoading && (
                        <div className="absolute right-3 top-3 text-xs text-amber-400 flex items-center gap-1">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span className="hidden sm:inline">Checking...</span>
                        </div>
                      )}
                    </div>

                    {mobileError && mobileTouched && (
                      <span className="text-red-400 text-xs mt-1 block">
                        ⚠️ {mobileError}
                      </span>
                    )}
                  </div>
                </div>

                {/* Existing Alumnus Banner */}
                {existingRegInfo?.found && (
                  <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 text-xs flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-white">
                        Existing Record Loaded: {existingRegInfo.regNumber} ({existingRegInfo.existingName || 'Alumnus'})
                        {existingRegInfo.existingBatch ? ` • Batch ${existingRegInfo.existingBatch}` : ''}
                        {existingRegInfo.existingCity ? ` • ${existingRegInfo.existingCity}` : ''}
                        {existingRegInfo.existingAttendees ? ` • ${existingRegInfo.existingAttendees} Person(s)` : ''}
                      </div>
                      <div className="text-slate-400 mt-0.5">
                        Profile details & existing contribution (₹{existingRegInfo.existingAmount || 0}) auto-populated. Submitting will update this record.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 2: ATTENDANCE & GUESTS */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    2. Attendance & Accompanying Guests
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Defaults to 1 Adult
                  </span>
                </div>

                {/* Attendance Status Selector */}
                <div className="grid grid-cols-3 gap-2">
                  {(['yes', 'maybe', 'no'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setAttendanceStatus(status)}
                      className={`min-h-[44px] py-2 px-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
                        attendanceStatus === status
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                      }`}
                    >
                      {status === 'yes' && '✓ Attending'}
                      {status === 'maybe' && '❓ Maybe'}
                      {status === 'no' && '✕ Not Going'}
                    </button>
                  ))}
                </div>

                {/* Steppers for counts if Yes */}
                {attendanceStatus === 'yes' && (
                  <div className="space-y-2.5 pt-1">
                    {/* Adults Counter */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-white">Adults</span>
                          {adultsCount === 2 && (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Couple Rate
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {adultsCount === 1
                            ? '₹800 for 1 adult'
                            : adultsCount === 2
                            ? '₹1,500 for couple'
                            : `₹1,500 couple + ₹800/extra adult`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAmount(false);
                            setAdultsCount((prev) => Math.max(1, prev - 1));
                          }}
                          disabled={adultsCount <= 1}
                          className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white flex items-center justify-center transition-colors"
                          aria-label="Decrease adults"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="w-10 text-center">
                          <span className="text-base font-bold text-white block">{adultsCount}</span>
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 block">
                            {adultsCount === 1 ? 'Adult' : 'Adults'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAmount(false);
                            setAdultsCount((prev) => prev + 1);
                          }}
                          disabled={adultsCount >= 10}
                          className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white flex items-center justify-center transition-colors"
                          aria-label="Increase adults"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Children (10+ Years) Counter */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-white">Children (10+ Years)</span>
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          ₹300 per child
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAmount(false);
                            setKidsAbove10((prev) => Math.max(0, prev - 1));
                          }}
                          disabled={kidsAbove10 <= 0}
                          className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white flex items-center justify-center transition-colors"
                          aria-label="Decrease children 10 and above"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="w-10 text-center">
                          <span className="text-base font-bold text-white block">{kidsAbove10}</span>
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 block">
                            {kidsAbove10 === 1 ? 'Child' : 'Kids'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAmount(false);
                            setKidsAbove10((prev) => prev + 1);
                          }}
                          disabled={kidsAbove10 >= 10}
                          className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white flex items-center justify-center transition-colors"
                          aria-label="Increase children 10 and above"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Children (Under 10 Years) Counter */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-white">Children (Under 10 Years)</span>
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            FREE
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Complimentary reunion entry
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAmount(false);
                            setKidsUnder10((prev) => Math.max(0, prev - 1));
                          }}
                          disabled={kidsUnder10 <= 0}
                          className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white flex items-center justify-center transition-colors"
                          aria-label="Decrease children under 10"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="w-10 text-center">
                          <span className="text-base font-bold text-white block">{kidsUnder10}</span>
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 block">
                            {kidsUnder10 === 1 ? 'Child' : 'Kids'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAmount(false);
                            setKidsUnder10((prev) => prev + 1);
                          }}
                          disabled={kidsUnder10 >= 10}
                          className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white flex items-center justify-center transition-colors"
                          aria-label="Increase children under 10"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: PAYMENT & UPI RECONCILIATION */}
              {attendanceStatus === 'yes' && (
                <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" />
                      3. Payment & UPI Ledger Tagging
                    </span>
                    <label className="flex items-center gap-2 text-xs text-emerald-400 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={markAsVerified}
                        onChange={(e) => setMarkAsVerified(e.target.checked)}
                        className="rounded border-slate-700 text-amber-500 focus:ring-amber-500/30"
                      />
                      <span>Tag as Verified</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Amount Received */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-xs font-semibold text-slate-200">
                          Amount Received (₹)
                        </label>
                        {!isCustomAmount ? (
                          <button
                            type="button"
                            onClick={() => setIsCustomAmount(true)}
                            className="text-[11px] text-amber-400 hover:text-amber-300 underline"
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
                            className="text-[11px] text-emerald-400 hover:text-emerald-300 underline"
                          >
                            Reset (₹{pricing.totalAmount})
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-3 text-amber-400 font-bold text-base">
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
                          className={`w-full min-h-[44px] text-base font-bold pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-900 border text-white outline-none transition-all ${
                            isCustomAmount
                              ? 'border-amber-500 ring-1 ring-amber-500/30'
                              : 'border-slate-700 focus:border-amber-500'
                          }`}
                        />
                      </div>
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        Standard rate: ₹{pricing.totalAmount} for {adultsCount} {adultsCount === 1 ? 'adult' : 'adults'}
                        {kidsAbove10 > 0 ? ` + ${kidsAbove10} children (10+)` : ''}
                      </span>
                    </div>

                    {/* Receiving UPI Account */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                        Received On Account / UPI ID
                      </label>
                      <select
                        value={selectedUpiId}
                        onChange={(e) => setSelectedUpiId(e.target.value)}
                        className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-amber-500"
                      >
                        {upiOptions.map((opt) => (
                          <option key={opt.upi_id} value={opt.upi_id} className="bg-slate-900 text-white">
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
                          className="w-full min-h-[44px] mt-2 text-base sm:text-sm px-3 py-2 rounded-xl bg-slate-900 border border-amber-500/50 text-white placeholder-slate-500 outline-none"
                        />
                      )}
                    </div>
                  </div>

                  {/* Notes & Optional Screenshot */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Transaction / Reference Notes
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Paid to QR on WhatsApp / UTR 12345"
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Payment Screenshot (Optional)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setScreenshotFile(file);
                        }}
                        className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-amber-400 hover:file:bg-slate-700"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 4: OPTIONAL ALUMNI DETAILS (ACCORDION) */}
              <div className="rounded-xl bg-slate-950/30 border border-dashed border-slate-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowOptionalDetails(!showOptionalDetails)}
                  className="w-full min-h-[44px] px-3.5 sm:px-4 py-3 flex items-center justify-between text-left hover:bg-slate-900/40 transition-colors"
                >
                  <span className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-200">
                    {showOptionalDetails ? (
                      <ChevronDown className="w-4 h-4 text-amber-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                    <span>Additional Alumni Information</span>
                    <span className="text-[11px] text-slate-500 font-normal hidden sm:inline">
                      (Batch, Branch, City, Workplace - All Optional)
                    </span>
                  </span>
                  <span className="text-xs text-amber-400 font-medium">
                    {showOptionalDetails ? 'Hide' : 'Add Details'}
                  </span>
                </button>

                {showOptionalDetails && (
                  <div className="p-3.5 sm:p-4 border-t border-slate-800/80 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {/* Batch */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Batch
                        </label>
                        <select
                          value={batch}
                          onChange={(e) => {
                            const newB = e.target.value;
                            setBatch(newB);
                            if (newB) {
                              setYearOfPassing(String(getDefaultPassingYearForBatch(newB)));
                            }
                          }}
                          className="w-full min-h-[44px] text-base sm:text-xs px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-amber-500"
                        >
                          <option value="" className="bg-slate-900">-- Select Batch --</option>
                          {allBatches.map((b) => (
                            <option key={b.value} value={b.value} className="bg-slate-900 text-white font-normal">
                              {b.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Year of Passing */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Pass Out Year
                        </label>
                        <select
                          value={yearOfPassing}
                          onChange={(e) => setYearOfPassing(e.target.value)}
                          className="w-full min-h-[44px] text-base sm:text-xs px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-amber-500"
                        >
                          <option value="" className="bg-slate-900">-- Not Specified --</option>
                          {passingYears.map((y) => (
                            <option key={y} value={y} className="bg-slate-900">
                              {y}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Engineering Discipline */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Branch / Discipline
                        </label>
                        <select
                          value={engineeringDiscipline}
                          onChange={(e) => setEngineeringDiscipline(e.target.value)}
                          className="w-full min-h-[44px] text-base sm:text-xs px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-amber-500"
                        >
                          <option value="" className="bg-slate-900">-- Not Specified --</option>
                          {disciplineOptions.map((d) => (
                            <option key={d} value={d} className="bg-slate-900">
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* City */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" /> City
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Kota / Jaipur"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="w-full min-h-[44px] text-base sm:text-xs px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 outline-none focus:border-amber-500"
                        />
                      </div>

                      {/* State */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          State
                        </label>
                        <select
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          className="w-full min-h-[44px] text-base sm:text-xs px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-amber-500"
                        >
                          {INDIAN_STATES.map((s) => (
                            <option key={s} value={s} className="bg-slate-900">
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Email Field with inline validation */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400" /> Email Address
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
                          className={`w-full min-h-[44px] text-base sm:text-xs px-3 py-2 rounded-xl bg-slate-900 border text-white placeholder-slate-500 outline-none ${
                            emailError && emailTouched ? 'border-red-500' : 'border-slate-700 focus:border-amber-500'
                          }`}
                        />
                        {emailError && emailTouched && (
                          <span className="text-red-400 text-xs mt-1 block">
                            ⚠️ {emailError}
                          </span>
                        )}
                      </div>

                      {/* Organization */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                          <Building className="w-3 h-3 text-slate-400" /> Organization
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. NTPC / TCS / Self"
                          value={organization}
                          onChange={(e) => setOrganization(e.target.value)}
                          className="w-full min-h-[44px] text-base sm:text-xs px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Form Action Buttons (Sticky bottom on mobile) */}
              <div className="sticky bottom-0 z-10 pt-3 pb-1 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-sm font-bold shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
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
