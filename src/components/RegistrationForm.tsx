import React, { useState, useMemo, useEffect, useRef } from 'react';
import type {
  ECKEvent,
  RegistrationFormData,
  RegistrationResult,
  ExistingRegistrationLookup,
} from '../types';
import {
  EMPLOYMENT_TYPES,
  INDUSTRY_DOMAINS,
  ENGINEERING_DISCIPLINES,
  INDIAN_STATES,
  COUNTRY_OPTIONS,
} from '../types';
import { PaymentSection } from './PaymentSection';
import { UpiPaymentFlowModal } from './UpiPaymentFlowModal';
import { supabase } from '../lib/supabase';
import { calculateContribution, formatPricingPillSummary } from '../lib/pricing';
import {
  lookupRegistrationByMobile,
  convertLookupToFormData,
  recordCompletedRegistrationLocally,
  cleanMobileNumber,
} from '../lib/registrations';
import { isRegistrationClosed } from '../lib/eventStatus';
import {
  getAllBatchOptions,
  getPassingYearOptions,
  getDefaultPassingYearForBatch,
} from '../lib/batchUtils';
import {
  AlertCircle,
  X,
  Lock,
  Check,
  Clock,
  Minus,
  Plus,
  ArrowRight,
} from 'lucide-react';

interface RegistrationFormProps {
  event: ECKEvent;
  onSuccess: (formData: RegistrationFormData, result: RegistrationResult) => void;
  initialData?: RegistrationFormData | null;
  existingRegistration?: ExistingRegistrationLookup | null;
  onCancelUpdate?: () => void;
}

const INITIAL_FORM_DATA: RegistrationFormData = {
  name: '',
  email: '',
  mobile: '',
  address: '',
  country: 'India',
  country_other: '',
  city: '',
  state: '',
  state_other: '',
  batch: '',
  year_of_passing: '',
  engineering_discipline: '',
  engineering_discipline_other: '',
  organization: '',
  employment_type: '',
  employment_type_other: '',
  industry_domain: '',
  industry_domain_other: '',
  professional_category: '',
  work_location: '',
  attendance_status: 'yes',
  number_of_attendees: 1,
  adults_count: 1,
  children_above_7_count: 0,
  children_under_7_count: 0,
};

export const RegistrationForm: React.FC<RegistrationFormProps> = ({
  event,
  onSuccess,
  initialData,
  existingRegistration,
}) => {
  const [formData, setFormData] = useState<RegistrationFormData>(() => initialData || INITIAL_FORM_DATA);
  const [activeExistingReg, setActiveExistingReg] = useState<ExistingRegistrationLookup | null>(
    () => existingRegistration || null
  );
  const [isUpdateMode, setIsUpdateMode] = useState<boolean>(
    () => Boolean(existingRegistration?.found || initialData)
  );

  // Auto-detection state for mobile lookup
  const [checkingMobile, setCheckingMobile] = useState(false);

  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errorFieldId, setErrorFieldId] = useState<string | null>(null);
  const formTopRef = useRef<HTMLDivElement | null>(null);

  // UPI Flow & Return Prompt State
  const [showWelcomeBackModal, setShowWelcomeBackModal] = useState(false);
  const [isPreSavingUpi, setIsPreSavingUpi] = useState(false);

  // Clear any residual drafts on mount to prevent stale form data
  useEffect(() => {
    try {
      localStorage.removeItem(`eck_reg_draft_${event.event_slug}`);
    } catch {
      // Ignore
    }
  }, [event.event_slug]);

  // Page visibility & focus listener: Detect when user returns from UPI app
  useEffect(() => {
    const handleReturnToTab = () => {
      if (document.visibilityState === 'visible') {
        const initiated = sessionStorage.getItem('eck_upi_initiated');
        if (initiated === 'true' && !screenshotFile && !activeExistingReg?.payment_screenshot_path) {
          setShowWelcomeBackModal(true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleReturnToTab);
    window.addEventListener('focus', handleReturnToTab);
    return () => {
      document.removeEventListener('visibilitychange', handleReturnToTab);
      window.removeEventListener('focus', handleReturnToTab);
    };
  }, [screenshotFile, activeExistingReg?.payment_screenshot_path]);

  const scrollToError = (errorMessage: string, fieldId?: string) => {
    setFormError(errorMessage);
    if (fieldId) {
      setErrorFieldId(fieldId);
    }

    // Smoothly scroll window to top immediately
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Ensure the top anchor / error element is in full view across devices
    setTimeout(() => {
      if (formTopRef.current) {
        formTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      if (fieldId) {
        const el = document.getElementById(fieldId);
        if (el) {
          try {
            el.focus({ preventScroll: true });
          } catch {
            // Older browser fallback
          }
        }
      }
    }, 60);
  };

  // Safety net to smoothly scroll to top whenever formError is updated
  useEffect(() => {
    if (formError) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [formError]);

  // Sync when initialData or existingRegistration changes from parent
  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
    if (existingRegistration) {
      setActiveExistingReg(existingRegistration);
      setIsUpdateMode(true);
    }
  }, [initialData, existingRegistration]);

  const { allBatches } = useMemo(() => getAllBatchOptions(), []);
  const passingYearOptions = useMemo(() => getPassingYearOptions(), []);

  // Pricing calculation managed purely in codebase
  const pricing = useMemo(() => {
    if (formData.attendance_status !== 'yes') {
      return calculateContribution(0, 0, 0, event.pricing_config, event.registration_fee);
    }
    return calculateContribution(
      formData.adults_count ?? 1,
      formData.children_above_7_count ?? 0,
      formData.children_under_7_count ?? 0,
      event.pricing_config,
      event.registration_fee
    );
  }, [
    formData.attendance_status,
    formData.adults_count,
    formData.children_above_7_count,
    formData.children_under_7_count,
    event.pricing_config,
    event.registration_fee,
  ]);

  const totalAmount = pricing.totalAmount;

  // Minimum count enforcement for update mode (cannot reduce below previously registered count)
  const isEnforcingMinCounts = Boolean(
    isUpdateMode && activeExistingReg && activeExistingReg.attendance_status === 'yes'
  );

  const minAdults = isEnforcingMinCounts ? Math.max(1, activeExistingReg?.adults_count ?? 1) : 1;
  const minKidsAbove7 = isEnforcingMinCounts ? (activeExistingReg?.children_above_7_count ?? 0) : 0;
  const minKidsUnder7 = isEnforcingMinCounts ? (activeExistingReg?.children_under_7_count ?? 0) : 0;

  // Dynamic tier rates for UI display
  const singleAdultRate = event.pricing_config?.single_adult ?? event.registration_fee ?? 800;
  const coupleAdultRate = event.pricing_config?.couple ?? (singleAdultRate > 0 ? singleAdultRate * 2 - 100 : 1500);
  const extraAdultRate = event.pricing_config?.extra_adult ?? singleAdultRate;

  // Previously paid contribution calculation
  const previousPaidAmount = useMemo(() => {
    if (!isUpdateMode || !activeExistingReg || activeExistingReg.attendance_status !== 'yes') {
      return 0;
    }
    if (typeof activeExistingReg.amount === 'number' && activeExistingReg.amount > 0) {
      return activeExistingReg.amount;
    }
    const prevAdults = activeExistingReg.adults_count ?? 1;
    const prevKids7 = activeExistingReg.children_above_7_count ?? 0;
    const prevKidsUnder7 = activeExistingReg.children_under_7_count ?? 0;
    return calculateContribution(
      prevAdults,
      prevKids7,
      prevKidsUnder7,
      event.pricing_config,
      event.registration_fee
    ).totalAmount;
  }, [isUpdateMode, activeExistingReg, event.pricing_config, event.registration_fee]);

  const additionalAmountDue = Math.max(0, totalAmount - previousPaidAmount);

  // Check registration when 10-digit mobile is typed & auto-preload
  const checkMobileForExistingRegistration = async (rawMobile: string) => {
    const clean = cleanMobileNumber(rawMobile);
    if (clean.length !== 10) {
      return;
    }
    // If already in update mode with this exact mobile, no need to re-check
    if (isUpdateMode && activeExistingReg?.alumni?.mobile === clean) {
      return;
    }

    setCheckingMobile(true);
    try {
      const result = await lookupRegistrationByMobile(event.event_slug, clean);
      if (result.found) {
        // Preload alumni details so user doesn't have to re-type
        const loadedForm = convertLookupToFormData(result);
        setFormData(loadedForm);
        setScreenshotError(null);
        setFormError(null);

        // Only switch to locked update mode if registration was actually completed with payment proof
        if (result.payment_screenshot_path) {
          setActiveExistingReg(result);
          setIsUpdateMode(true);
        } else {
          // Incomplete / pending payment: keep form clean in fresh registration mode
          setActiveExistingReg(result);
          setIsUpdateMode(false);
        }
      }
    } catch (err) {
      console.warn('Mobile lookup error:', err);
    } finally {
      setCheckingMobile(false);
    }
  };

  const handleMobileBlur = () => {
    if (formData.mobile) {
      checkMobileForExistingRegistration(formData.mobile);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    if (formError) setFormError(null);
    if (errorFieldId) setErrorFieldId(null);
    const { name, value } = e.target;

    if (name === 'country') {
      setFormData((prev) => ({
        ...prev,
        country: value,
        country_other: value === 'India' ? '' : prev.country_other,
        state: value === 'India' ? prev.state : '',
        state_other: value === 'India' ? '' : prev.state_other,
        city: prev.city,
      }));
      return;
    }

    if (name === 'mobile') {
      const rawDigits = value.replace(/\D/g, '');
      const clean =
        rawDigits.length > 10 && rawDigits.startsWith('91')
          ? rawDigits.slice(2, 12)
          : rawDigits.slice(0, 10);

      // If user edits phone number to something else, reset update mode if it was tied to the previous number
      if (isUpdateMode && activeExistingReg && activeExistingReg.alumni?.mobile !== clean) {
        setIsUpdateMode(false);
        setActiveExistingReg(null);
      }

      if (clean.length === 10) {
        checkMobileForExistingRegistration(clean);
      }

      setFormData((prev) => ({
        ...prev,
        mobile: clean,
      }));
      return;
    }

    if (name === 'batch') {
      const defaultYear = getDefaultPassingYearForBatch(value);
      setFormData((prev) => ({
        ...prev,
        batch: value,
        year_of_passing: defaultYear,
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]:
        name === 'year_of_passing' || name === 'number_of_attendees'
          ? value === ''
            ? ''
            : Number(value)
          : value,
    }));
  };

  const handleAttendanceChange = (status: 'yes' | 'maybe' | 'no') => {
    if (formError) setFormError(null);
    if (errorFieldId) setErrorFieldId(null);
    setFormData((prev) => {
      const adults = status === 'yes' ? (prev.adults_count || 1) : 1;
      const kidsAbove7 = status === 'yes' ? (prev.children_above_7_count || 0) : 0;
      const kidsUnder7 = status === 'yes' ? (prev.children_under_7_count || 0) : 0;
      return {
        ...prev,
        attendance_status: status,
        adults_count: adults,
        children_above_7_count: kidsAbove7,
        children_under_7_count: kidsUnder7,
        number_of_attendees: status === 'yes' ? adults + kidsAbove7 + kidsUnder7 : 1,
      };
    });
    setScreenshotError(null);
  };

  const handleCountStep = (
    field: 'adults_count' | 'children_above_7_count' | 'children_under_7_count',
    delta: number
  ) => {
    setFormData((prev) => {
      let minVal = 0;
      if (field === 'adults_count') minVal = minAdults;
      else if (field === 'children_above_7_count') minVal = minKidsAbove7;
      else if (field === 'children_under_7_count') minVal = minKidsUnder7;

      const current = prev[field] ?? (field === 'adults_count' ? 1 : 0);
      const nextVal = Math.max(minVal, Math.min(10, current + delta));

      const updated = {
        ...prev,
        [field]: nextVal,
      };

      const adults = field === 'adults_count' ? nextVal : (updated.adults_count ?? 1);
      const kidsAbove7 =
        field === 'children_above_7_count' ? nextVal : (updated.children_above_7_count ?? 0);
      const kidsUnder7 =
        field === 'children_under_7_count' ? nextVal : (updated.children_under_7_count ?? 0);

      updated.number_of_attendees = adults + kidsAbove7 + kidsUnder7;
      return updated;
    });
  };

  const handleInitiateUpiPayment = async (deepLink: string) => {
    if (formError) setFormError(null);
    if (errorFieldId) setErrorFieldId(null);

    if (isRegistrationClosed(event) || event.status === 'CLOSED') {
      scrollToError(
        'Online registration is now closed. Please visit the Spot Walk-in Registration Desk at the gate on event day.',
        'field-name'
      );
      return;
    }

    // Validate minimum required fields before launching UPI
    if (!formData.name.trim()) {
      scrollToError('Please enter your full name first so we can link your payment to you.', 'field-name');
      return;
    }
    const cleanMobile = cleanMobileNumber(formData.mobile);
    if (cleanMobile.length < 10) {
      scrollToError('Please enter a valid 10-digit mobile number before making payment.', 'field-mobile');
      return;
    }
    if (!formData.batch || !formData.batch.trim()) {
      scrollToError('Please select your ECK/RTU Batch (Mandatory).', 'field-batch');
      return;
    }
    if (!formData.year_of_passing) {
      scrollToError('Please select your Pass Out Year (Mandatory).', 'field-year');
      return;
    }
    if (!formData.engineering_discipline) {
      scrollToError('Please select your Engineering Discipline / Branch.', 'field-discipline');
      return;
    }

    setIsPreSavingUpi(true);
    try {
      const isIndia = formData.country === 'India';
      const resolvedCountry = isIndia ? 'India' : (formData.country_other?.trim() || 'Other');
      const resolvedDiscipline =
        formData.engineering_discipline === 'Other'
          ? (formData.engineering_discipline_other?.trim() || 'Other')
          : formData.engineering_discipline;
      const resolvedState = isIndia
        ? (formData.state === 'Other' ? (formData.state_other?.trim() || 'Other') : formData.state)
        : (formData.state_other?.trim() || resolvedCountry);
      const resolvedEmploymentType =
        formData.employment_type === 'Other'
          ? (formData.employment_type_other?.trim() || 'Other')
          : formData.employment_type;
      const resolvedIndustryDomain =
        formData.industry_domain === 'Other'
          ? (formData.industry_domain_other?.trim() || 'Other')
          : formData.industry_domain;
      const combinedCategory = `${resolvedEmploymentType} • ${resolvedIndustryDomain}`;

      // Pre-save to Supabase RPC with status 'payment_pending' (unless already confirmed with screenshot)
      const preSaveStatus = activeExistingReg?.payment_screenshot_path ? formData.attendance_status : 'payment_pending';

      let rpcResult = await supabase.rpc('register_for_event', {
        p_event_slug: event.event_slug,
        p_name: formData.name.trim(),
        p_mobile: cleanMobile,
        p_address: formData.address.trim() || 'Not Specified',
        p_country: resolvedCountry,
        p_city: formData.city.trim() || 'Not Specified',
        p_state: resolvedState || 'Not Specified',
        p_batch: formData.batch?.trim() || null,
        p_year_of_passing: Number(formData.year_of_passing) || 2000,
        p_engineering_discipline: resolvedDiscipline || 'General',
        p_employment_type: resolvedEmploymentType || null,
        p_industry_domain: resolvedIndustryDomain || null,
        p_professional_category: combinedCategory,
        p_attendance_status: preSaveStatus,
        p_number_of_attendees:
          formData.attendance_status === 'yes' ? pricing.totalAttendees : 1,
        p_adults_count:
          formData.attendance_status === 'yes' ? (formData.adults_count ?? 1) : 1,
        p_children_above_7_count:
          formData.attendance_status === 'yes' ? (formData.children_above_7_count ?? 0) : 0,
        p_children_under_7_count:
          formData.attendance_status === 'yes' ? (formData.children_under_7_count ?? 0) : 0,
        p_email: formData.email.trim() || null,
        p_organization: formData.organization.trim() || null,
        p_work_location: formData.work_location.trim() || null,
        p_payment_screenshot_path: activeExistingReg?.payment_screenshot_path || null,
      });

      // Graceful fallback to 'yes' if database constraint hasn't been upgraded to allow 'payment_pending' yet
      if (rpcResult.error && (rpcResult.error.message?.includes('violates check constraint') || rpcResult.error.code === '23514')) {
        console.warn('[UPI Pre-Save Notice]: Database constraint requires migration v3; falling back to yes for pre-save.');
        rpcResult = await supabase.rpc('register_for_event', {
          p_event_slug: event.event_slug,
          p_name: formData.name.trim(),
          p_mobile: cleanMobile,
          p_address: formData.address.trim() || 'Not Specified',
          p_country: resolvedCountry,
          p_city: formData.city.trim() || 'Not Specified',
          p_state: resolvedState || 'Not Specified',
          p_batch: formData.batch?.trim() || null,
          p_year_of_passing: Number(formData.year_of_passing) || 2000,
          p_engineering_discipline: resolvedDiscipline || 'General',
          p_employment_type: resolvedEmploymentType || null,
          p_industry_domain: resolvedIndustryDomain || null,
          p_professional_category: combinedCategory,
          p_attendance_status: formData.attendance_status,
          p_number_of_attendees:
            formData.attendance_status === 'yes' ? pricing.totalAttendees : 1,
          p_adults_count:
            formData.attendance_status === 'yes' ? (formData.adults_count ?? 1) : 1,
          p_children_above_7_count:
            formData.attendance_status === 'yes' ? (formData.children_above_7_count ?? 0) : 0,
          p_children_under_7_count:
            formData.attendance_status === 'yes' ? (formData.children_under_7_count ?? 0) : 0,
          p_email: formData.email.trim() || null,
          p_organization: formData.organization.trim() || null,
          p_work_location: formData.work_location.trim() || null,
          p_payment_screenshot_path: activeExistingReg?.payment_screenshot_path || null,
        });
      }

      const { data, error } = rpcResult;

      if (!error && data?.registration_number) {
        console.log('[UPI Pre-Save Success]: Registration secured in database:', data.registration_number);
        // Only update activeExistingReg if already in verified update mode; keep fresh registrations clean
        if (isUpdateMode && activeExistingReg?.payment_screenshot_path) {
          const resolvedAttendance = (formData.attendance_status || 'yes') as 'yes' | 'maybe' | 'no' | 'payment_pending';
          setActiveExistingReg((prev) => ({
            ...prev,
            found: true,
            registration_id: data.registration_id,
            registration_number: data.registration_number,
            amount: totalAmount,
            attendance_status: resolvedAttendance,
            number_of_attendees: pricing.totalAttendees,
          }));
        }
      }
    } catch (err) {
      console.warn('[UPI Pre-Save Exception]:', err);
    } finally {
      setIsPreSavingUpi(false);
      sessionStorage.setItem('eck_upi_initiated', 'true');
      window.location.href = deepLink;
    }
  };

  const handleUploadScreenshotFromPrompt = () => {
    setShowWelcomeBackModal(false);
    sessionStorage.removeItem('eck_upi_initiated');
    const fileInput = document.getElementById('payment-screenshot-input') as HTMLInputElement | null;
    if (fileInput) {
      fileInput.click();
    }
    const dropzone = document.getElementById('screenshot-upload-dropzone');
    if (dropzone) {
      dropzone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setErrorFieldId(null);
    setScreenshotError(null);

    if (isRegistrationClosed(event) || event.status === 'CLOSED') {
      scrollToError(
        'Online registration has closed as of 31st October at 6:00 PM. Please register on-the-spot at the college gate desk.',
        'field-name'
      );
      return;
    }

    if (!formData.name.trim()) {
      scrollToError('Please enter your full name.', 'field-name');
      return;
    }
    const cleanMobile = formData.mobile.trim().replace(/\D/g, '');
    if (cleanMobile.length < 10) {
      scrollToError('Please enter a valid 10-digit mobile / WhatsApp number.', 'field-mobile');
      return;
    }
    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        scrollToError('Please enter a valid email address (e.g. name@example.com) or leave it blank.', 'field-email');
        return;
      }
    }
    if (!formData.address.trim()) {
      scrollToError('Please enter your residential or permanent address.', 'field-address');
      return;
    }
    if (formData.country === 'India') {
      if (!formData.state) {
        scrollToError('Please select your state / UT.', 'field-state');
        return;
      }
      if (formData.state === 'Other' && !formData.state_other?.trim()) {
        scrollToError('Please specify your state / UT in the text field.', 'field-state-other');
        return;
      }
    } else {
      if (!formData.country_other?.trim()) {
        scrollToError('Please specify your country name.', 'field-country-other');
        return;
      }
    }
    if (!formData.city.trim()) {
      scrollToError(
        formData.country === 'India'
          ? 'Please enter your city.'
          : 'Please enter your city / town / region.',
        'field-city'
      );
      return;
    }
    if (!formData.batch || !formData.batch.trim()) {
      scrollToError('Please select your ECK/RTU Batch (Mandatory).', 'field-batch');
      return;
    }
    if (!formData.year_of_passing) {
      scrollToError('Please select your Pass Out Year (Mandatory).', 'field-year');
      return;
    }
    if (!formData.engineering_discipline) {
      scrollToError('Please select your engineering discipline / branch.', 'field-discipline');
      return;
    }
    if (formData.engineering_discipline === 'Other' && !formData.engineering_discipline_other?.trim()) {
      scrollToError('Please specify your engineering branch in the text field.', 'field-discipline-other');
      return;
    }
    if (!formData.employment_type) {
      scrollToError('Please select your Employment Type.', 'field-employment-type');
      return;
    }
    if (formData.employment_type === 'Other' && !formData.employment_type_other?.trim()) {
      scrollToError('Please specify your Employment Type in the text field.', 'field-employment-other');
      return;
    }
    if (!formData.industry_domain) {
      scrollToError('Please select your Industry / Domain.', 'field-industry');
      return;
    }
    if (formData.industry_domain === 'Other' && !formData.industry_domain_other?.trim()) {
      scrollToError('Please specify your Industry / Domain in the text field.', 'field-industry-other');
      return;
    }
    if (!formData.attendance_status) {
      scrollToError('Please indicate your attendance status (Yes, Maybe, or No).', 'attend-yes');
      return;
    }

    const hasExistingScreenshot = Boolean(activeExistingReg?.payment_screenshot_path);
    if (formData.attendance_status === 'yes') {
      if (!screenshotFile && !hasExistingScreenshot) {
        setScreenshotError('Please upload your payment screenshot before submitting.');
        scrollToError(
          'Payment screenshot is required for attending participants. Please attach your payment screenshot.',
          'screenshot-upload-dropzone'
        );
        return;
      }
      if (isUpdateMode && additionalAmountDue > 0 && !screenshotFile) {
        setScreenshotError(
          `Please upload the payment screenshot for the additional ₹${additionalAmountDue}.`
        );
        scrollToError(
          `Payment screenshot is required for the additional amount (₹${additionalAmountDue}).`,
          'screenshot-upload-dropzone'
        );
        return;
      }
    }

    setSubmitting(true);

    try {
      const cleanName = formData.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'alumni';
      let uploadedScreenshotPath: string | null = null;
      let finalCombinedScreenshotPath: string | null = activeExistingReg?.payment_screenshot_path || null;

      // If updating an existing registration with known registration_number, upload screenshot upfront
      if (formData.attendance_status === 'yes' && screenshotFile && isUpdateMode && activeExistingReg?.registration_number) {
        const regNumber = activeExistingReg.registration_number;
        const timestamp = Date.now();
        const fileExt = screenshotFile.name.split('.').pop() || 'jpg';
        const cleanExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, '');
        const fileName = `${event.event_slug}/${regNumber}_${cleanName}_${timestamp}.${cleanExt}`;

        console.log('[Storage Upload] Uploading screenshot for existing registration:', {
          regNumber,
          fileName,
          fileSize: screenshotFile.size,
          mimeType: screenshotFile.type,
          bucket: 'payment-screenshots',
        });

        try {
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('payment-screenshots')
            .upload(fileName, screenshotFile, {
              cacheControl: '3600',
              upsert: true,
            });

          if (uploadError) {
            console.error('[Storage Upload Error]:', uploadError);
            alert(`Screenshot upload warning: ${uploadError.message}. Please check connection or contact admin.`);
          } else if (uploadData) {
            console.log('[Storage Upload Success]:', uploadData);
            uploadedScreenshotPath = uploadData.path;
          }
        } catch (storageErr) {
          console.error('[Storage Upload Exception]:', storageErr);
        }

        if (uploadedScreenshotPath) {
          if (activeExistingReg?.payment_screenshot_path) {
            finalCombinedScreenshotPath = `${activeExistingReg.payment_screenshot_path},${uploadedScreenshotPath}`;
          } else {
            finalCombinedScreenshotPath = uploadedScreenshotPath;
          }
        }
      } else if (hasExistingScreenshot && !screenshotFile) {
        uploadedScreenshotPath = activeExistingReg?.payment_screenshot_path || null;
        finalCombinedScreenshotPath = activeExistingReg?.payment_screenshot_path || null;
      }

      // Resolve effective values when 'Other' was selected
      const isIndia = formData.country === 'India';
      const resolvedCountry = isIndia
        ? 'India'
        : (formData.country_other?.trim() || 'Other');

      const resolvedDiscipline =
        formData.engineering_discipline === 'Other'
          ? (formData.engineering_discipline_other?.trim() || 'Other')
          : formData.engineering_discipline;

      const resolvedState = isIndia
        ? (formData.state === 'Other' ? (formData.state_other?.trim() || 'Other') : formData.state)
        : (formData.state_other?.trim() || resolvedCountry);

      const resolvedEmploymentType =
        formData.employment_type === 'Other'
          ? (formData.employment_type_other?.trim() || 'Other')
          : formData.employment_type;

      const resolvedIndustryDomain =
        formData.industry_domain === 'Other'
          ? (formData.industry_domain_other?.trim() || 'Other')
          : formData.industry_domain;

      const combinedCategory = `${resolvedEmploymentType} • ${resolvedIndustryDomain}`;

      const resolvedFormData: RegistrationFormData = {
        ...formData,
        country: resolvedCountry,
        state: resolvedState,
        engineering_discipline: resolvedDiscipline,
        employment_type: resolvedEmploymentType,
        industry_domain: resolvedIndustryDomain,
        professional_category: combinedCategory,
      };

      let registrationResult: RegistrationResult;

      // Attempt call with updated parameters
      const { data, error } = await supabase.rpc('register_for_event', {
        p_event_slug: event.event_slug,
        p_name: formData.name.trim(),
        p_mobile: cleanMobile,
        p_address: formData.address.trim(),
        p_country: resolvedCountry,
        p_city: formData.city.trim(),
        p_state: resolvedState,
        p_batch: formData.batch?.trim() || null,
        p_year_of_passing: Number(formData.year_of_passing),
        p_engineering_discipline: resolvedDiscipline,
        p_employment_type: resolvedEmploymentType,
        p_industry_domain: resolvedIndustryDomain,
        p_professional_category: combinedCategory,
        p_attendance_status: formData.attendance_status,
        p_number_of_attendees:
          formData.attendance_status === 'yes' ? pricing.totalAttendees : 1,
        p_adults_count:
          formData.attendance_status === 'yes' ? (formData.adults_count ?? 1) : 1,
        p_children_above_7_count:
          formData.attendance_status === 'yes' ? (formData.children_above_7_count ?? 0) : 0,
        p_children_under_7_count:
          formData.attendance_status === 'yes' ? (formData.children_under_7_count ?? 0) : 0,
        p_email: formData.email.trim() || null,
        p_organization: formData.organization.trim() || null,
        p_work_location: formData.work_location.trim() || null,
        p_payment_screenshot_path: uploadedScreenshotPath,
      });

      if (error) {
        // Fallback to legacy RPC schema if database hasn't applied the migration yet
        const { data: fbData, error: fbErr } = await supabase.rpc('register_for_event', {
          p_event_slug: event.event_slug,
          p_name: formData.name.trim(),
          p_mobile: cleanMobile,
          p_address: formData.address.trim(),
          p_city: formData.city.trim(),
          p_state: resolvedState,
          p_batch: formData.batch?.trim() || null,
          p_year_of_passing: Number(formData.year_of_passing),
          p_engineering_discipline: resolvedDiscipline,
          p_professional_category: combinedCategory,
          p_attendance_status: formData.attendance_status,
          p_number_of_attendees:
            formData.attendance_status === 'yes' ? pricing.totalAttendees : 1,
          p_email: formData.email.trim() || null,
          p_organization: formData.organization.trim() || null,
          p_work_location: formData.work_location.trim() || null,
          p_payment_screenshot_path: uploadedScreenshotPath,
        });
        if (fbErr) {
          console.error('[Registration RPC Error]:', error, fbErr);
          throw new Error(
            fbErr.message ||
            error.message ||
            'We could not complete your registration due to a temporary server or network issue. Please try again later.'
          );
        }
        registrationResult = fbData as RegistrationResult;
      } else {
        registrationResult = data as RegistrationResult;
      }

      if (!registrationResult || !registrationResult.registration_number) {
        throw new Error(
          'We could not complete your registration due to a temporary server or network issue. Please try again later.'
        );
      }

      // For NEW registrations with a screenshot: upload using the newly generated registration number!
      if (
        registrationResult &&
        formData.attendance_status === 'yes' &&
        screenshotFile &&
        !isUpdateMode &&
        registrationResult.registration_number
      ) {
        const regNumber = registrationResult.registration_number;
        const timestamp = Date.now();
        const fileExt = screenshotFile.name.split('.').pop() || 'jpg';
        const cleanExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, '');
        const fileName = `${event.event_slug}/${regNumber}_${cleanName}_${timestamp}.${cleanExt}`;

        console.log('[Storage Upload] Uploading screenshot for new registration:', {
          regNumber,
          fileName,
          fileSize: screenshotFile.size,
          mimeType: screenshotFile.type,
          bucket: 'payment-screenshots',
        });

        try {
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('payment-screenshots')
            .upload(fileName, screenshotFile, {
              cacheControl: '3600',
              upsert: true,
            });

          if (uploadError) {
            console.error('[Storage Upload Error]:', uploadError);
            alert(
              `Warning: Screenshot upload failed (${uploadError.message}). Your registration number is ${regNumber}. Please send your receipt to the organizer.`
            );
          } else if (uploadData) {
            console.log('[Storage Upload Success]:', uploadData);
            uploadedScreenshotPath = uploadData.path;
            finalCombinedScreenshotPath = uploadData.path;

            // Save the screenshot path to the registration record via the SECURITY DEFINER RPC
            // to ensure Row Level Security (RLS) does not block saving the path for new registrations
            try {
              const { error: rpcUpdateErr } = await supabase.rpc('register_for_event', {
                p_event_slug: event.event_slug,
                p_name: formData.name.trim(),
                p_mobile: cleanMobile,
                p_address: formData.address.trim(),
                p_country: resolvedCountry,
                p_city: formData.city.trim(),
                p_state: resolvedState,
                p_batch: formData.batch?.trim() || null,
                p_year_of_passing: Number(formData.year_of_passing),
                p_engineering_discipline: resolvedDiscipline,
                p_employment_type: resolvedEmploymentType,
                p_industry_domain: resolvedIndustryDomain,
                p_professional_category: combinedCategory,
                p_attendance_status: formData.attendance_status,
                p_number_of_attendees: pricing.totalAttendees,
                p_adults_count: formData.adults_count ?? 1,
                p_children_above_7_count: formData.children_above_7_count ?? 0,
                p_children_under_7_count: formData.children_under_7_count ?? 0,
                p_email: formData.email.trim() || null,
                p_organization: formData.organization.trim() || null,
                p_work_location: formData.work_location.trim() || null,
                p_payment_screenshot_path: uploadedScreenshotPath,
              });
              if (rpcUpdateErr) {
                // Fallback to legacy RPC schema if database hasn't applied the migration yet
                await supabase.rpc('register_for_event', {
                  p_event_slug: event.event_slug,
                  p_name: formData.name.trim(),
                  p_mobile: cleanMobile,
                  p_address: formData.address.trim(),
                  p_city: formData.city.trim(),
                  p_state: resolvedState,
                  p_batch: formData.batch?.trim() || null,
                  p_year_of_passing: Number(formData.year_of_passing),
                  p_engineering_discipline: resolvedDiscipline,
                  p_professional_category: combinedCategory,
                  p_attendance_status: formData.attendance_status,
                  p_number_of_attendees: pricing.totalAttendees,
                  p_email: formData.email.trim() || null,
                  p_organization: formData.organization.trim() || null,
                  p_work_location: formData.work_location.trim() || null,
                  p_payment_screenshot_path: uploadedScreenshotPath,
                });
              }
              console.log('[Registration Record Updated with Screenshot Path]:', uploadData.path);
            } catch (updateErr) {
              console.warn('[Registration Screenshot Sync Note]:', updateErr);
            }
          }
        } catch (storageErr) {
          console.error('[Storage Upload Exception]:', storageErr);
        }
      }

      // Keep DB amount and combined screenshots synced
      if (registrationResult) {
        registrationResult.amount = totalAmount;
        if (registrationResult.registration_id && formData.attendance_status === 'yes') {
          try {
            const syncPayload: Record<string, any> = {
              amount: totalAmount,
              number_of_attendees: pricing.totalAttendees,
              adults_count:
                formData.attendance_status === 'yes' ? (formData.adults_count ?? 1) : 1,
              children_above_7_count:
                formData.attendance_status === 'yes' ? (formData.children_above_7_count ?? 0) : 0,
              children_under_7_count:
                formData.attendance_status === 'yes' ? (formData.children_under_7_count ?? 0) : 0,
            };
            if (finalCombinedScreenshotPath) {
              syncPayload.payment_screenshot_path = finalCombinedScreenshotPath;
            }
            await supabase
              .from('event_registrations')
              .update(syncPayload)
              .eq('id', registrationResult.registration_id);
          } catch (syncErr) {
            console.warn('Sync registration amount note:', syncErr);
          }
        }
      }

      const finalResult: RegistrationResult = {
        ...registrationResult,
        is_update: isUpdateMode || Boolean(registrationResult?.is_update),
      };

      try {
        localStorage.removeItem(`eck_reg_draft_${event.event_slug}`);
        sessionStorage.removeItem('eck_upi_initiated');
      } catch {
        // Ignore
      }

      recordCompletedRegistrationLocally(
        event.event_slug,
        resolvedFormData,
        finalResult,
        finalCombinedScreenshotPath
      );
      onSuccess(resolvedFormData, finalResult);
    } catch (err: any) {
      console.error('Registration failed:', err);
      const friendlyMessage =
        err?.message && !err.message.toLowerCase().includes('failed to fetch')
          ? err.message
          : 'We could not complete your registration due to a temporary server or network issue. Please try again later.';
      scrollToError(friendlyMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="w-full max-w-3xl mx-auto space-y-6" onSubmit={handleSubmit} noValidate>
      {/* Scroll anchor placed right at top of form */}
      <div ref={formTopRef} id="form-top-anchor" style={{ scrollMarginTop: '80px' }} />

      {/* Prominent High-Visibility Error Banner at Top */}
      {formError && (
        <div
          className="flex items-start justify-between gap-3 p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 shadow-xl shadow-rose-950/40 animate-in fade-in"
          role="alert"
          tabIndex={-1}
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0 mt-0.5">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1 text-xs sm:text-sm">
              {errorFieldId ? (
                <>
                  <strong className="font-bold text-rose-100 block text-sm sm:text-base">
                    Please complete the required information
                  </strong>
                  <p className="text-rose-200/90 leading-relaxed">{formError}</p>
                </>
              ) : (
                <strong className="font-bold text-rose-100 block text-sm sm:text-base">{formError}</strong>
              )}
            </div>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 transition-colors shrink-0 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => {
              setFormError(null);
              setErrorFieldId(null);
            }}
            title="Dismiss notice"
            aria-label="Dismiss error notice"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Feature 2: Update Mode Notice Banner (Only for completed registrations) */}
      {isUpdateMode && activeExistingReg?.payment_screenshot_path && (
        <div className="flex flex-col sm:flex-row items-start gap-3.5 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/40 shadow-lg shadow-amber-500/10">
          <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
              Existing Registration Preloaded &amp; Locked
            </span>
            <h3 className="text-xl font-black text-white font-mono tracking-wide">
              {activeExistingReg?.registration_number || 'REGISTRATION FOUND'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Your registered details for <strong className="text-white">{formData.name || 'Alumni'}</strong> have been preloaded. Fresh registrations are not allowed for this mobile number; you can update your details or add attendees below.
            </p>
          </div>
        </div>
      )}

      {/* STEP 1: ALUMNI INFORMATION */}
      <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md space-y-5">
        <div className="space-y-1 border-b border-slate-800/80 pb-3">
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            Step 1 of 3
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Alumni Information</h2>
          <p className="text-xs sm:text-sm text-slate-400">Please enter your alumni contact details.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Full Name */}
          <div className="sm:col-span-2 space-y-1.5">
            <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-name">
              Full Name
            </label>
            <input
              id="field-name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Er. Bhawesh Kurmi"
              required
              className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                errorFieldId === 'field-name' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
              }`}
              autoComplete="name"
            />
          </div>

          {/* Mobile */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-mobile">
              Mobile / WhatsApp Number
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-slate-400 font-medium text-base select-none pointer-events-none">+91</span>
              <input
                id="field-mobile"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
                onBlur={handleMobileBlur}
                placeholder="10-digit number"
                maxLength={10}
                required
                className={`w-full min-h-[44px] pl-12 pr-10 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                  errorFieldId === 'field-mobile' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
                }`}
                autoComplete="tel-national"
              />
              {checkingMobile && (
                <span className="absolute right-3.5 flex items-center justify-center text-amber-400" title="Checking registration...">
                  <span className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                </span>
              )}
            </div>

            {/* Confirmation indicator when mobile is matched and preloaded */}
            {isUpdateMode && activeExistingReg?.payment_screenshot_path && (
              <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs leading-relaxed animate-in fade-in">
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Existing registration <strong>{activeExistingReg.registration_number}</strong> ({activeExistingReg.alumni?.name}) preloaded. Updates will save directly to this registration.
                </span>
              </div>
            )}

            {!isUpdateMode && activeExistingReg && activeExistingReg.attendance_status === 'payment_pending' && !activeExistingReg.payment_screenshot_path && (
              <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs leading-relaxed animate-in fade-in">
                <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Found your saved draft registration (<strong>{activeExistingReg.registration_number}</strong>). Your details have been restored! Please upload your payment screenshot below to confirm your attendance pass.
                </span>
              </div>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-semibold text-slate-200" htmlFor="field-email">
              Email Address <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              id="field-email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="alumni@example.com"
              className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                errorFieldId === 'field-email' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
              }`}
              autoComplete="email"
            />
          </div>

          {/* Batch (Mandatory) */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-batch">
              Batch
            </label>
            <select
              id="field-batch"
              name="batch"
              value={formData.batch || ''}
              onChange={handleChange}
              required
              className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                errorFieldId === 'field-batch' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
              }`}
            >
              <option value="" disabled className="bg-slate-900 text-slate-400">
                Select your Batch
              </option>
              {allBatches.map((b) => (
                <option key={b.value} value={b.value} className="bg-slate-900 text-slate-100 font-normal">
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          {/* Pass Out Year (Mandatory, pre-loaded & editable) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-year">
                Pass Out Year
              </label>
              <span className="text-[10px] text-emerald-400 font-mono">Pre-loaded • Editable</span>
            </div>
            <select
              id="field-year"
              name="year_of_passing"
              value={formData.year_of_passing}
              onChange={handleChange}
              required
              className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                errorFieldId === 'field-year' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
              }`}
            >
              <option value="" disabled className="bg-slate-900 text-slate-400">
                Select Year
              </option>
              {passingYearOptions.map((year) => (
                <option key={year} value={year} className="bg-slate-900 text-slate-100">
                  {year}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 leading-tight">
              Pre-loaded based on your Batch. Change this if your graduation was delayed.
            </p>
          </div>

          {/* Engineering Discipline */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-discipline">
              Engineering Discipline / Branch
            </label>
            <select
              id="field-discipline"
              name="engineering_discipline"
              value={formData.engineering_discipline}
              onChange={handleChange}
              required
              className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                errorFieldId === 'field-discipline' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
              }`}
            >
              <option value="">Select Branch</option>
              {ENGINEERING_DISCIPLINES.map((discipline) => (
                <option key={discipline} value={discipline} className="bg-slate-900 text-slate-100">
                  {discipline}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional Other for Engineering Discipline */}
          {formData.engineering_discipline === 'Other' && (
            <div className="sm:col-span-2 space-y-1.5 animate-in fade-in">
              <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-discipline-other">
                Specify Engineering Branch
              </label>
              <input
                id="field-discipline-other"
                type="text"
                name="engineering_discipline_other"
                value={formData.engineering_discipline_other || ''}
                onChange={handleChange}
                placeholder="e.g. M.Tech Thermal, MCA, Applied Sciences"
                required
                className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                  errorFieldId === 'field-discipline-other' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
                }`}
                autoFocus
              />
            </div>
          )}

          {/* Address */}
          <div className="sm:col-span-2 space-y-1.5">
            <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-address">
              Permanent / Residential Address
            </label>
            <textarea
              id="field-address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              rows={2}
              placeholder="House/Plot No., Street, Colony/Locality"
              required
              className={`w-full min-h-[70px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors resize-y ${
                errorFieldId === 'field-address' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
              }`}
            />
          </div>

          {/* Country */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-country">
              Country
            </label>
            <select
              id="field-country"
              name="country"
              value={formData.country}
              onChange={handleChange}
              required
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
            >
              {COUNTRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-100">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* If Country is Other: Specify Country Name */}
          {formData.country === 'Other' && (
            <div className="space-y-1.5 animate-in fade-in">
              <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-country-other">
                Country Name
              </label>
              <input
                id="field-country-other"
                type="text"
                name="country_other"
                value={formData.country_other || ''}
                onChange={handleChange}
                placeholder="e.g. United States, United Kingdom, UAE, Singapore"
                required
                className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                  errorFieldId === 'field-country-other' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
                }`}
                autoFocus
              />
            </div>
          )}

          {/* If Country is India: State Dropdown */}
          {formData.country === 'India' && (
            <div className="space-y-1.5 animate-in fade-in">
              <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-state">
                State / UT
              </label>
              <select
                id="field-state"
                name="state"
                value={formData.state}
                onChange={handleChange}
                required
                className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                  errorFieldId === 'field-state' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
                }`}
              >
                <option value="">Select State / UT</option>
                {INDIAN_STATES.map((st) => (
                  <option key={st} value={st} className="bg-slate-900 text-slate-100">
                    {st}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Conditional Other for State within India */}
          {formData.country === 'India' && formData.state === 'Other' && (
            <div className="space-y-1.5 animate-in fade-in">
              <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-state-other">
                Specify State / Region
              </label>
              <input
                id="field-state-other"
                type="text"
                name="state_other"
                value={formData.state_other || ''}
                onChange={handleChange}
                placeholder="e.g. New State / UT"
                required
                className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                  errorFieldId === 'field-state-other' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
                }`}
                autoFocus
              />
            </div>
          )}

          {/* If Country is Other: State/Province/Emirate (Optional) */}
          {formData.country === 'Other' && (
            <div className="space-y-1.5 animate-in fade-in">
              <label className="block text-xs sm:text-sm font-semibold text-slate-200" htmlFor="field-state-other">
                State / Province / Emirate <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                id="field-state-other"
                type="text"
                name="state_other"
                value={formData.state_other || ''}
                onChange={handleChange}
                placeholder="e.g. California, Ontario, Dubai"
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
              />
            </div>
          )}

          {/* City */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-city">
              {formData.country === 'India' ? 'City' : 'City / Town / Region'}
            </label>
            <input
              id="field-city"
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              placeholder={formData.country === 'India' ? 'e.g. Kota, Jaipur, Delhi' : 'e.g. Dubai, London, San Jose'}
              required
              className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                errorFieldId === 'field-city' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
              }`}
            />
          </div>

          {/* Employment Type */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-employment-type">
              Employment Type
            </label>
            <select
              id="field-employment-type"
              name="employment_type"
              value={formData.employment_type}
              onChange={handleChange}
              required
              className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                errorFieldId === 'field-employment-type' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
              }`}
            >
              <option value="">Select Employment Type</option>
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type} className="bg-slate-900 text-slate-100">
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional Other for Employment Type */}
          {formData.employment_type === 'Other' && (
            <div className="sm:col-span-2 space-y-1.5 animate-in fade-in">
              <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-employment-other">
                Specify Employment Type
              </label>
              <input
                id="field-employment-other"
                type="text"
                name="employment_type_other"
                value={formData.employment_type_other || ''}
                onChange={handleChange}
                placeholder="e.g. Armed Forces, Social Worker, Homemaker"
                required
                className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                  errorFieldId === 'field-employment-other' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
                }`}
                autoFocus
              />
            </div>
          )}

          {/* Industry / Domain */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-industry">
              Industry / Domain
            </label>
            <select
              id="field-industry"
              name="industry_domain"
              value={formData.industry_domain}
              onChange={handleChange}
              required
              className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                errorFieldId === 'field-industry' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
              }`}
            >
              <option value="">Select Industry / Domain</option>
              {INDUSTRY_DOMAINS.map((domain) => (
                <option key={domain} value={domain} className="bg-slate-900 text-slate-100">
                  {domain}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional Other for Industry / Domain */}
          {formData.industry_domain === 'Other' && (
            <div className="sm:col-span-2 space-y-1.5 animate-in fade-in">
              <label className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400" htmlFor="field-industry-other">
                Specify Industry / Domain
              </label>
              <input
                id="field-industry-other"
                type="text"
                name="industry_domain_other"
                value={formData.industry_domain_other || ''}
                onChange={handleChange}
                placeholder="e.g. Aerospace, Energy & Power, Media"
                required
                className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors ${
                  errorFieldId === 'field-industry-other' ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
                }`}
                autoFocus
              />
            </div>
          )}

          {/* Organization */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-semibold text-slate-200" htmlFor="field-organization">
              Organization / Company / Business <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              id="field-organization"
              type="text"
              name="organization"
              value={formData.organization}
              onChange={handleChange}
              placeholder="e.g. NTPC, Infosys, Entrepreneur"
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
            />
          </div>

          {/* Work Location */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-semibold text-slate-200" htmlFor="field-work-loc">
              Current Work Location <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              id="field-work-loc"
              type="text"
              name="work_location"
              value={formData.work_location}
              onChange={handleChange}
              placeholder="e.g. New Delhi, Mumbai, Bengaluru, Abroad"
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* STEP 2: ATTENDANCE & GUESTS */}
      <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md space-y-5">
        <div className="space-y-1 border-b border-slate-800/80 pb-3">
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            Step 2 of 3
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Attendance &amp; Guests</h2>
          <p className="text-xs sm:text-sm text-slate-400">Will you be attending {event.event_name}?</p>
        </div>

        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${errorFieldId === 'attend-yes' ? 'p-1 rounded-xl ring-2 ring-rose-500' : ''}`}>
          <button
            type="button"
            className={`min-h-[56px] p-3 rounded-xl border flex items-center gap-3 text-left transition-all active:scale-[0.99] cursor-pointer ${
              formData.attendance_status === 'yes'
                ? 'bg-amber-500/15 border-amber-500 text-white shadow-md shadow-amber-500/10'
                : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-950/80'
            }`}
            onClick={() => handleAttendanceChange('yes')}
            id="attend-yes"
          >
            <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 text-xs font-black ${
              formData.attendance_status === 'yes'
                ? 'bg-amber-500 border-amber-500 text-slate-950'
                : 'border-slate-600'
            }`}>
              {formData.attendance_status === 'yes' ? '✓' : ''}
            </div>
            <div>
              <span className="font-bold block text-sm sm:text-base text-white">Yes, Attending</span>
              <span className="text-xs text-slate-400 block">I will join celebration</span>
            </div>
          </button>

          <button
            type="button"
            className={`min-h-[56px] p-3 rounded-xl border flex items-center gap-3 text-left transition-all active:scale-[0.99] cursor-pointer ${
              formData.attendance_status === 'maybe'
                ? 'bg-amber-500/15 border-amber-500 text-white shadow-md shadow-amber-500/10'
                : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-950/80'
            }`}
            onClick={() => handleAttendanceChange('maybe')}
            id="attend-maybe"
          >
            <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 text-xs font-black ${
              formData.attendance_status === 'maybe'
                ? 'bg-amber-500 border-amber-500 text-slate-950'
                : 'border-slate-600'
            }`}>
              {formData.attendance_status === 'maybe' ? '✓' : ''}
            </div>
            <div>
              <span className="font-bold block text-sm sm:text-base text-white">Maybe</span>
              <span className="text-xs text-slate-400 block">Tentative plan</span>
            </div>
          </button>

          <button
            type="button"
            className={`min-h-[56px] p-3 rounded-xl border flex items-center gap-3 text-left transition-all active:scale-[0.99] cursor-pointer ${
              formData.attendance_status === 'no'
                ? 'bg-amber-500/15 border-amber-500 text-white shadow-md shadow-amber-500/10'
                : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-950/80'
            }`}
            onClick={() => handleAttendanceChange('no')}
            id="attend-no"
          >
            <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 text-xs font-black ${
              formData.attendance_status === 'no'
                ? 'bg-amber-500 border-amber-500 text-slate-950'
                : 'border-slate-600'
            }`}>
              {formData.attendance_status === 'no' ? '✓' : ''}
            </div>
            <div>
              <span className="font-bold block text-sm sm:text-base text-white">No</span>
              <span className="text-xs text-slate-400 block">Unable to join this time</span>
            </div>
          </button>
        </div>

        {formData.attendance_status === 'yes' && (
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 sm:p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="space-y-0.5">
                <label className="text-xs sm:text-sm font-semibold text-white block">Who is joining you at the reunion?</label>
                <span className="text-xs text-slate-400 block">
                  Specify adults &amp; kids accompanying you. Contribution calculates automatically.
                </span>
              </div>
              <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 self-start sm:self-auto shrink-0">
                <span>{formatPricingPillSummary(event.pricing_config, event.registration_fee)}</span>
              </div>
            </div>

            <div className="space-y-3">
              {/* Adults Counter */}
              <div className="flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-bold text-white">Adults</span>
                    {(formData.adults_count ?? 1) === 2 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Couple Rate
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 block">
                    {(formData.adults_count ?? 1) === 1
                      ? `₹${singleAdultRate.toLocaleString('en-IN')} for 1 adult`
                      : (formData.adults_count ?? 1) === 2
                        ? `₹${coupleAdultRate.toLocaleString('en-IN')} for couple`
                        : `₹${coupleAdultRate.toLocaleString('en-IN')} couple + ₹${extraAdultRate.toLocaleString('en-IN')}/extra adult`}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCountStep('adults_count', -1)}
                    disabled={(formData.adults_count ?? 1) <= minAdults}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-white font-bold text-lg flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                    aria-label="Decrease adults"
                    id="btn-dec-adults"
                    title={
                      isEnforcingMinCounts && (formData.adults_count ?? 1) <= minAdults
                        ? 'Cannot reduce below previously registered count'
                        : undefined
                    }
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="flex flex-col items-center justify-center min-w-[44px]">
                    <span className="text-base sm:text-lg font-black text-white">{formData.adults_count ?? 1}</span>
                    <span className="text-[10px] text-slate-400 font-medium uppercase">
                      {(formData.adults_count ?? 1) === 1 ? 'Adult' : 'Adults'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCountStep('adults_count', 1)}
                    disabled={(formData.adults_count ?? 1) >= 10}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-white font-bold text-lg flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                    aria-label="Increase adults"
                    id="btn-inc-adults"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Children (>10 years) Counter */}
              <div className="flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-bold text-white">Children (10+ Years)</span>
                  </div>
                  <span className="text-xs text-slate-400 block">₹300 per child</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCountStep('children_above_7_count', -1)}
                    disabled={(formData.children_above_7_count ?? 0) <= minKidsAbove7}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-white font-bold text-lg flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                    aria-label="Decrease children 10 and above"
                    id="btn-dec-kids-above-7"
                    title={
                      isEnforcingMinCounts && (formData.children_above_7_count ?? 0) <= minKidsAbove7
                        ? 'Cannot reduce below previously registered count'
                        : undefined
                    }
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="flex flex-col items-center justify-center min-w-[44px]">
                    <span className="text-base sm:text-lg font-black text-white">{formData.children_above_7_count ?? 0}</span>
                    <span className="text-[10px] text-slate-400 font-medium uppercase">
                      {(formData.children_above_7_count ?? 0) === 1 ? 'Child' : 'Children'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCountStep('children_above_7_count', 1)}
                    disabled={(formData.children_above_7_count ?? 0) >= 10}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-white font-bold text-lg flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                    aria-label="Increase children 10 and above"
                    id="btn-inc-kids-above-7"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Children (<10 years) Counter */}
              <div className="flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-bold text-white">Children (Under 10 Years)</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Free
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 block">Complimentary reunion entry</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCountStep('children_under_7_count', -1)}
                    disabled={(formData.children_under_7_count ?? 0) <= minKidsUnder7}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-white font-bold text-lg flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                    aria-label="Decrease children under 10"
                    id="btn-dec-kids-under-7"
                    title={
                      isEnforcingMinCounts && (formData.children_under_7_count ?? 0) <= minKidsUnder7
                        ? 'Cannot reduce below previously registered count'
                        : undefined
                    }
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="flex flex-col items-center justify-center min-w-[44px]">
                    <span className="text-base sm:text-lg font-black text-white">{formData.children_under_7_count ?? 0}</span>
                    <span className="text-[10px] text-slate-400 font-medium uppercase">
                      {(formData.children_under_7_count ?? 0) === 1 ? 'Child' : 'Children'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCountStep('children_under_7_count', 1)}
                    disabled={(formData.children_under_7_count ?? 0) >= 10}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-white font-bold text-lg flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                    aria-label="Increase children under 10"
                    id="btn-inc-kids-under-7"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* In Update Mode: Inform user why counts cannot decrease */}
            {isEnforcingMinCounts && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs sm:text-sm text-amber-200">
                <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  Previously registered counts cannot be reduced. You can increase counts to register additional family members.
                </span>
              </div>
            )}

            {/* Total Summary Row */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3.5 sm:p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs sm:text-sm">
              <span className="text-slate-300 font-medium">
                👥 Total Attending: <strong className="text-white font-bold">{pricing.totalAttendees}</strong>{' '}
                {pricing.totalAttendees === 1 ? 'person' : 'persons'}
              </span>
              <span className="text-amber-400 font-semibold text-sm sm:text-base">
                Total Contribution: <strong className="text-white font-bold">₹{pricing.totalAmount}</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* STEP 3: PAYMENT CONTRIBUTION */}
      {formData.attendance_status === 'yes' && (
        <PaymentSection
          amount={totalAmount}
          attendeesCount={pricing.totalAttendees}
          feePerPerson={event.registration_fee}
          pricing={pricing}
          qrImageUrl={event.qr_image_url}
          upiId={event.upi_id}
          screenshotFile={screenshotFile}
          onScreenshotChange={(file) => {
            setScreenshotFile(file);
            setScreenshotError(null);
            if (file) {
              setFormError((prev) => (prev && prev.toLowerCase().includes('screenshot') ? null : prev));
              setErrorFieldId((prev) => (prev === 'screenshot-upload-dropzone' ? null : prev));
            }
          }}
          error={screenshotError}
          isUpdateMode={isUpdateMode}
          hasExistingScreenshot={Boolean(activeExistingReg?.payment_screenshot_path)}
          existingScreenshotPath={activeExistingReg?.payment_screenshot_path}
          previousPaidAmount={previousPaidAmount}
          additionalAmountDue={additionalAmountDue}
          onPayViaUpiApp={handleInitiateUpiPayment}
          isPreSavingUpi={isPreSavingUpi}
        />
      )}

      {/* Return from UPI App Detection: Welcome Back Modal */}
      <UpiPaymentFlowModal
        isOpen={showWelcomeBackModal}
        mode="welcome_back"
        amount={isUpdateMode && additionalAmountDue > 0 ? additionalAmountDue : totalAmount}
        alumniName={formData.name || 'Alumnus'}
        alumniMobile={formData.mobile}
        onUploadScreenshot={handleUploadScreenshotFromPrompt}
        onClose={() => {
          setShowWelcomeBackModal(false);
          sessionStorage.removeItem('eck_upi_initiated');
        }}
      />

      {/* SUBMIT BUTTON */}
      <div className="w-full space-y-3 pt-2">
        {formError && (
          <div
            className="flex items-center justify-between gap-2 p-3 sm:p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs sm:text-sm cursor-pointer hover:bg-rose-500/25 transition-colors"
            onClick={() => scrollToError(formError, errorFieldId || undefined)}
            role="button"
            tabIndex={0}
            title="Click to scroll to top to review error"
          >
            <div className="flex items-center gap-2 truncate">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500 text-white shrink-0">
                Action Required
              </span>
              <span className="font-medium truncate">{formError}</span>
            </div>
            <span className="text-rose-300 font-semibold underline shrink-0">
              Scroll to Error ↑
            </span>
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[48px] py-3.5 px-6 rounded-xl font-bold text-base bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          id="btn-submit-registration"
        >
          {submitting ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>
                {isUpdateMode ? 'Saving Updated Registration...' : 'Submitting Your Registration...'}
              </span>
            </div>
          ) : (
            <>
              <span>
                {isUpdateMode ? (
                  additionalAmountDue > 0 ? (
                    `Save & Update Registration • Pay Additional ₹${additionalAmountDue}`
                  ) : (
                    'Save & Update Registration'
                  )
                ) : formData.attendance_status === 'yes' ? (
                  `Complete Registration • ₹${totalAmount}`
                ) : (
                  'Submit Alumni Record'
                )}
              </span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
        <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
          <span>🔒</span>
          <span>Verified ECK Alumni Network. Your details are preserved securely for community activities.</span>
        </p>
      </div>
    </form>
  );
};
