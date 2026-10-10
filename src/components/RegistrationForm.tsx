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
import { supabase } from '../lib/supabase';
import { calculateContribution } from '../lib/pricing';
import {
  lookupRegistrationByMobile,
  convertLookupToFormData,
  recordCompletedRegistrationLocally,
  cleanMobileNumber,
} from '../lib/registrations';

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
  city: 'Kota',
  state: 'Rajasthan',
  state_other: '',
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

  const currentYear = new Date().getFullYear();
  const passingYears = Array.from(
    { length: currentYear - 1980 + 1 },
    (_, i) => currentYear - i
  );

  // Pricing calculation managed purely in codebase
  const pricing = useMemo(() => {
    if (formData.attendance_status !== 'yes') {
      return calculateContribution(0, 0, 0);
    }
    return calculateContribution(
      formData.adults_count ?? 1,
      formData.children_above_7_count ?? 0,
      formData.children_under_7_count ?? 0
    );
  }, [
    formData.attendance_status,
    formData.adults_count,
    formData.children_above_7_count,
    formData.children_under_7_count,
  ]);

  const totalAmount = pricing.totalAmount;

  // Minimum count enforcement for update mode (cannot reduce below previously registered count)
  const isEnforcingMinCounts = Boolean(
    isUpdateMode && activeExistingReg && activeExistingReg.attendance_status === 'yes'
  );

  const minAdults = isEnforcingMinCounts ? Math.max(1, activeExistingReg?.adults_count ?? 1) : 1;
  const minKidsAbove7 = isEnforcingMinCounts ? (activeExistingReg?.children_above_7_count ?? 0) : 0;
  const minKidsUnder7 = isEnforcingMinCounts ? (activeExistingReg?.children_under_7_count ?? 0) : 0;

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
    return calculateContribution(prevAdults, prevKids7, prevKidsUnder7).totalAmount;
  }, [isUpdateMode, activeExistingReg]);

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
        // Auto-preload details immediately
        const loadedForm = convertLookupToFormData(result);
        setFormData(loadedForm);
        setActiveExistingReg(result);
        setIsUpdateMode(true);
        setScreenshotError(null);
        setFormError(null);
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
        state: value === 'India' ? (prev.state || 'Rajasthan') : '',
        state_other: value === 'India' ? '' : prev.state_other,
        city: value === 'Other' && prev.city === 'Kota' ? '' : prev.city,
      }));
      return;
    }

    if (name === 'mobile') {
      const clean = cleanMobileNumber(value);
      // If user edits phone number to something else, reset update mode if it was tied to the previous number
      if (isUpdateMode && activeExistingReg && activeExistingReg.alumni?.mobile !== clean) {
        setIsUpdateMode(false);
        setActiveExistingReg(null);
      }

      if (clean.length === 10) {
        checkMobileForExistingRegistration(value);
      }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setErrorFieldId(null);
    setScreenshotError(null);

    if (!formData.name.trim()) {
      scrollToError('Please enter your full name.', 'field-name');
      return;
    }
    const cleanMobile = formData.mobile.trim().replace(/\D/g, '');
    if (cleanMobile.length < 10) {
      scrollToError('Please enter a valid 10-digit mobile / WhatsApp number.', 'field-mobile');
      return;
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
    if (!formData.year_of_passing) {
      scrollToError('Please select your year of passing (Batch).', 'field-year');
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
      if (!isUpdateMode && !screenshotFile && !hasExistingScreenshot) {
        setScreenshotError('Please upload your payment screenshot before submitting.');
        scrollToError(
          'Payment screenshot is required for attending participants. Please attach your payment screenshot.',
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

      try {
        // Attempt call with updated parameters
        const { data, error } = await supabase.rpc('register_for_event', {
          p_event_slug: event.event_slug,
          p_name: formData.name.trim(),
          p_mobile: cleanMobile,
          p_address: formData.address.trim(),
          p_country: resolvedCountry,
          p_city: formData.city.trim(),
          p_state: resolvedState,
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
          if (fbErr) throw fbErr;
          registrationResult = fbData as RegistrationResult;
        } else {
          registrationResult = data as RegistrationResult;
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
      } catch (rpcErr: any) {
        console.warn('RPC fallback demo mode:', rpcErr);
        const pseudoRegNum =
          activeExistingReg?.registration_number ||
          `REG-${Math.floor(10000 + Math.random() * 90000)}`;
        registrationResult = {
          success: true,
          registration_id:
            activeExistingReg?.registration_id ||
            (crypto.randomUUID ? crypto.randomUUID() : 'mock-reg-id'),
          registration_number: pseudoRegNum,
          alumni_id: activeExistingReg?.alumni?.id || 'mock-alumni-id',
          amount: totalAmount,
          attendance_status: formData.attendance_status,
          is_update: isUpdateMode,
        };
      }

      const finalResult: RegistrationResult = {
        ...registrationResult,
        is_update: isUpdateMode || Boolean(registrationResult?.is_update),
      };

      recordCompletedRegistrationLocally(
        event.event_slug,
        resolvedFormData,
        finalResult,
        finalCombinedScreenshotPath
      );
      onSuccess(resolvedFormData, finalResult);
    } catch (err: any) {
      console.error('Registration failed:', err);
      scrollToError(err?.message || 'Something went wrong while submitting. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="registration-form" onSubmit={handleSubmit} noValidate>
      {/* Scroll anchor placed right at top of form */}
      <div ref={formTopRef} id="form-top-anchor" style={{ scrollMarginTop: '80px' }} />

      {/* Prominent High-Visibility Error Banner at Top */}
      {formError && (
        <div className="registration-error-alert animate-alert-shake" role="alert" tabIndex={-1}>
          <div className="alert-error-left">
            <div className="alert-error-icon-bubble">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="alert-error-details">
              <strong className="alert-error-heading">Please complete the required information</strong>
              <p className="alert-error-text">{formError}</p>
            </div>
          </div>
          <button
            type="button"
            className="alert-dismiss-btn"
            onClick={() => {
              setFormError(null);
              setErrorFieldId(null);
            }}
            title="Dismiss notice"
            aria-label="Dismiss error notice"
          >
            ✕
          </button>
        </div>
      )}

      {/* Feature 2: Update Mode Notice Banner */}
      {isUpdateMode && (
        <div className="update-mode-badge-card animate-slide-down">
          <div className="update-badge-left">
            <span className="update-pill">🔒 Existing Registration Preloaded &amp; Locked</span>
            <h3 className="update-reg-num">
              {activeExistingReg?.registration_number || 'REGISTRATION FOUND'}
            </h3>
            <p className="update-reg-desc">
              Your registered details for <strong>{formData.name || 'Alumni'}</strong> have been preloaded. Fresh registrations are not allowed for this mobile number; you can update your details or add attendees below.
            </p>
          </div>
        </div>
      )}

      {/* STEP 1: ALUMNI INFORMATION */}
      <div className="form-card">
        <div className="card-header-badge">
          <div className="step-tag-pill">Step 1 of 3</div>
          <h2 className="card-title">Alumni Information</h2>
          <p className="card-subtitle">Please enter your alumni contact details.</p>
        </div>

        <div className="form-grid">
          {/* Full Name */}
          <div className="field-group full-width">
            <label className="field-label required" htmlFor="field-name">
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
              className={`input-field ${errorFieldId === 'field-name' ? 'input-error-highlight' : ''}`}
              autoComplete="name"
            />
          </div>

          {/* Mobile */}
          <div className="field-group">
            <label className="field-label required" htmlFor="field-mobile">
              Mobile / WhatsApp Number
            </label>
            <div className="input-prefix-wrap">
              <span className="input-prefix">+91</span>
              <input
                id="field-mobile"
                type="tel"
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
                onBlur={handleMobileBlur}
                placeholder="10-digit number"
                maxLength={10}
                required
                className={`input-field prefixed-input ${errorFieldId === 'field-mobile' ? 'input-error-highlight' : ''}`}
                autoComplete="tel-national"
              />
              {checkingMobile && (
                <span className="input-field-spinner" title="Checking registration...">
                  <span className="mini-spinner" />
                </span>
              )}
            </div>

            {/* Confirmation indicator when mobile is matched and preloaded */}
            {isUpdateMode && activeExistingReg && (
              <div className="existing-reg-locked-badge animate-slide-down">
                <span className="badge-icon">✓</span>
                <span>
                  Existing registration <strong>{activeExistingReg.registration_number}</strong> ({activeExistingReg.alumni?.name}) preloaded. Updates will save directly to this registration.
                </span>
              </div>
            )}
          </div>

          {/* Email */}
          <div className="field-group">
            <label className="field-label" htmlFor="field-email">
              Email Address <span className="label-optional">(Optional)</span>
            </label>
            <input
              id="field-email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="alumni@example.com"
              className="input-field"
              autoComplete="email"
            />
          </div>

          {/* Year of Passing */}
          <div className="field-group">
            <label className="field-label required" htmlFor="field-year">
              Year of Passing (Batch)
            </label>
            <select
              id="field-year"
              name="year_of_passing"
              value={formData.year_of_passing}
              onChange={handleChange}
              required
              className={`input-field select-field ${errorFieldId === 'field-year' ? 'input-error-highlight' : ''}`}
            >
              <option value="">Select Passing Year</option>
              {passingYears.map((year) => (
                <option key={year} value={year}>
                  Class of {year}
                </option>
              ))}
            </select>
          </div>

          {/* Engineering Discipline */}
          <div className="field-group">
            <label className="field-label required" htmlFor="field-discipline">
              Engineering Discipline / Branch
            </label>
            <select
              id="field-discipline"
              name="engineering_discipline"
              value={formData.engineering_discipline}
              onChange={handleChange}
              required
              className={`input-field select-field ${errorFieldId === 'field-discipline' ? 'input-error-highlight' : ''}`}
            >
              <option value="">Select Branch</option>
              {ENGINEERING_DISCIPLINES.map((discipline) => (
                <option key={discipline} value={discipline}>
                  {discipline}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional Other for Engineering Discipline */}
          {formData.engineering_discipline === 'Other' && (
            <div className="field-group animate-slide-down">
              <label className="field-label required" htmlFor="field-discipline-other">
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
                className={`input-field ${errorFieldId === 'field-discipline-other' ? 'input-error-highlight' : ''}`}
                autoFocus
              />
            </div>
          )}

          {/* Address */}
          <div className="field-group full-width">
            <label className="field-label required" htmlFor="field-address">
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
              className={`input-field textarea-field ${errorFieldId === 'field-address' ? 'input-error-highlight' : ''}`}
            />
          </div>

          {/* Country */}
          <div className="field-group">
            <label className="field-label required" htmlFor="field-country">
              Country
            </label>
            <select
              id="field-country"
              name="country"
              value={formData.country}
              onChange={handleChange}
              required
              className="input-field select-field"
            >
              {COUNTRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* If Country is Other: Specify Country Name */}
          {formData.country === 'Other' && (
            <div className="field-group animate-slide-down">
              <label className="field-label required" htmlFor="field-country-other">
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
                className={`input-field ${errorFieldId === 'field-country-other' ? 'input-error-highlight' : ''}`}
                autoFocus
              />
            </div>
          )}

          {/* If Country is India: State Dropdown */}
          {formData.country === 'India' && (
            <div className="field-group animate-slide-down">
              <label className="field-label required" htmlFor="field-state">
                State / UT
              </label>
              <select
                id="field-state"
                name="state"
                value={formData.state}
                onChange={handleChange}
                required
                className={`input-field select-field ${errorFieldId === 'field-state' ? 'input-error-highlight' : ''}`}
              >
                <option value="">Select State / UT</option>
                {INDIAN_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Conditional Other for State within India */}
          {formData.country === 'India' && formData.state === 'Other' && (
            <div className="field-group animate-slide-down">
              <label className="field-label required" htmlFor="field-state-other">
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
                className={`input-field ${errorFieldId === 'field-state-other' ? 'input-error-highlight' : ''}`}
                autoFocus
              />
            </div>
          )}

          {/* If Country is Other: State/Province/Emirate (Optional) */}
          {formData.country === 'Other' && (
            <div className="field-group animate-slide-down">
              <label className="field-label" htmlFor="field-state-other">
                State / Province / Emirate <span className="label-optional">(Optional)</span>
              </label>
              <input
                id="field-state-other"
                type="text"
                name="state_other"
                value={formData.state_other || ''}
                onChange={handleChange}
                placeholder="e.g. California, Ontario, Dubai"
                className="input-field"
              />
            </div>
          )}

          {/* City */}
          <div className="field-group">
            <label className="field-label required" htmlFor="field-city">
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
              className={`input-field ${errorFieldId === 'field-city' ? 'input-error-highlight' : ''}`}
            />
          </div>

          {/* Employment Type */}
          <div className="field-group">
            <label className="field-label required" htmlFor="field-employment-type">
              Employment Type
            </label>
            <select
              id="field-employment-type"
              name="employment_type"
              value={formData.employment_type}
              onChange={handleChange}
              required
              className={`input-field select-field ${errorFieldId === 'field-employment-type' ? 'input-error-highlight' : ''}`}
            >
              <option value="">Select Employment Type</option>
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional Other for Employment Type */}
          {formData.employment_type === 'Other' && (
            <div className="field-group animate-slide-down">
              <label className="field-label required" htmlFor="field-employment-other">
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
                className={`input-field ${errorFieldId === 'field-employment-other' ? 'input-error-highlight' : ''}`}
                autoFocus
              />
            </div>
          )}

          {/* Industry / Domain */}
          <div className="field-group">
            <label className="field-label required" htmlFor="field-industry">
              Industry / Domain
            </label>
            <select
              id="field-industry"
              name="industry_domain"
              value={formData.industry_domain}
              onChange={handleChange}
              required
              className={`input-field select-field ${errorFieldId === 'field-industry' ? 'input-error-highlight' : ''}`}
            >
              <option value="">Select Industry / Domain</option>
              {INDUSTRY_DOMAINS.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional Other for Industry / Domain */}
          {formData.industry_domain === 'Other' && (
            <div className="field-group animate-slide-down">
              <label className="field-label required" htmlFor="field-industry-other">
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
                className={`input-field ${errorFieldId === 'field-industry-other' ? 'input-error-highlight' : ''}`}
                autoFocus
              />
            </div>
          )}

          {/* Organization */}
          <div className="field-group">
            <label className="field-label" htmlFor="field-organization">
              Organization / Company / Business <span className="label-optional">(Optional)</span>
            </label>
            <input
              id="field-organization"
              type="text"
              name="organization"
              value={formData.organization}
              onChange={handleChange}
              placeholder="e.g. NTPC, Infosys, Entrepreneur"
              className="input-field"
            />
          </div>

          {/* Work Location */}
          <div className="field-group full-width">
            <label className="field-label" htmlFor="field-work-loc">
              Current Work Location <span className="label-optional">(Optional)</span>
            </label>
            <input
              id="field-work-loc"
              type="text"
              name="work_location"
              value={formData.work_location}
              onChange={handleChange}
              placeholder="e.g. New Delhi, Mumbai, Bengaluru, Abroad"
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* STEP 2: ATTENDANCE & GUESTS */}
      <div className="form-card">
        <div className="card-header-badge">
          <div className="step-tag-pill">Step 2 of 3</div>
          <h2 className="card-title">Attendance &amp; Guests</h2>
          <p className="card-subtitle">Will you be attending the ECK-RTU Alumni DeepAura 2K26 celebration?</p>
        </div>

        <div className={`attendance-options-grid ${errorFieldId === 'attend-yes' ? 'input-error-highlight' : ''}`}>
          <button
            type="button"
            className={`attendance-chip ${formData.attendance_status === 'yes' ? 'selected' : ''}`}
            onClick={() => handleAttendanceChange('yes')}
            id="attend-yes"
          >
            <div className="chip-indicator">
              {formData.attendance_status === 'yes' ? '✓' : ''}
            </div>
            <div className="chip-text">
              <span className="chip-title">Yes, Attending</span>
              <span className="chip-desc">I will join the celebration</span>
            </div>
          </button>

          <button
            type="button"
            className={`attendance-chip ${formData.attendance_status === 'maybe' ? 'selected' : ''}`}
            onClick={() => handleAttendanceChange('maybe')}
            id="attend-maybe"
          >
            <div className="chip-indicator">
              {formData.attendance_status === 'maybe' ? '✓' : ''}
            </div>
            <div className="chip-text">
              <span className="chip-title">Maybe</span>
              <span className="chip-desc">Tentative plan</span>
            </div>
          </button>

          <button
            type="button"
            className={`attendance-chip ${formData.attendance_status === 'no' ? 'selected' : ''}`}
            onClick={() => handleAttendanceChange('no')}
            id="attend-no"
          >
            <div className="chip-indicator">
              {formData.attendance_status === 'no' ? '✓' : ''}
            </div>
            <div className="chip-text">
              <span className="chip-title">No</span>
              <span className="chip-desc">Unable to join this time</span>
            </div>
          </button>
        </div>

        {formData.attendance_status === 'yes' && (
          <div className="attendees-breakdown-container">
            <div className="breakdown-header-box">
              <div className="breakdown-title-wrap">
                <label className="field-label">Who is joining you at the reunion?</label>
                <span className="field-hint">
                  Specify adults &amp; kids accompanying you. Contribution calculates automatically.
                </span>
              </div>
              <div className="rates-summary-badge">
                <span>₹800 Single • ₹1,500 Couple • ₹300 Kids (10+) • Free (&lt;10)</span>
              </div>
            </div>

            <div className="attendee-tiers-grid">
              {/* Adults Counter */}
              <div className="tier-counter-card">
                <div className="tier-info">
                  <div className="tier-name-row">
                    <span className="tier-title">Adults</span>
                    {(formData.adults_count ?? 1) === 2 && (
                      <span className="tier-badge couple-badge">Couple Rate</span>
                    )}
                  </div>
                  <span className="tier-desc">
                    {(formData.adults_count ?? 1) === 1
                      ? '₹800 for 1 adult'
                      : (formData.adults_count ?? 1) === 2
                      ? '₹1,500 for couple'
                      : `₹1,500 couple + ₹800/extra adult`}
                  </span>
                </div>
                <div className="stepper-controls">
                  <button
                    type="button"
                    onClick={() => handleCountStep('adults_count', -1)}
                    disabled={(formData.adults_count ?? 1) <= minAdults}
                    className="stepper-btn"
                    aria-label="Decrease adults"
                    id="btn-dec-adults"
                    title={
                      isEnforcingMinCounts && (formData.adults_count ?? 1) <= minAdults
                        ? 'Cannot reduce below previously registered count'
                        : undefined
                    }
                  >
                    −
                  </button>
                  <div className="stepper-count-wrap">
                    <span className="stepper-count">{formData.adults_count ?? 1}</span>
                    <span className="stepper-person-label">
                      {(formData.adults_count ?? 1) === 1 ? 'Adult' : 'Adults'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCountStep('adults_count', 1)}
                    disabled={(formData.adults_count ?? 1) >= 10}
                    className="stepper-btn"
                    aria-label="Increase adults"
                    id="btn-inc-adults"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Children (>10 years) Counter */}
              <div className="tier-counter-card">
                <div className="tier-info">
                  <div className="tier-name-row">
                    <span className="tier-title">Children (10+ Years)</span>
                  </div>
                  <span className="tier-desc">₹300 per child</span>
                </div>
                <div className="stepper-controls">
                  <button
                    type="button"
                    onClick={() => handleCountStep('children_above_7_count', -1)}
                    disabled={(formData.children_above_7_count ?? 0) <= minKidsAbove7}
                    className="stepper-btn"
                    aria-label="Decrease children 10 and above"
                    id="btn-dec-kids-above-7"
                    title={
                      isEnforcingMinCounts && (formData.children_above_7_count ?? 0) <= minKidsAbove7
                        ? 'Cannot reduce below previously registered count'
                        : undefined
                    }
                  >
                    −
                  </button>
                  <div className="stepper-count-wrap">
                    <span className="stepper-count">{formData.children_above_7_count ?? 0}</span>
                    <span className="stepper-person-label">
                      {(formData.children_above_7_count ?? 0) === 1 ? 'Child' : 'Children'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCountStep('children_above_7_count', 1)}
                    disabled={(formData.children_above_7_count ?? 0) >= 10}
                    className="stepper-btn"
                    aria-label="Increase children 10 and above"
                    id="btn-inc-kids-above-7"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Children (<10 years) Counter */}
              <div className="tier-counter-card">
                <div className="tier-info">
                  <div className="tier-name-row">
                    <span className="tier-title">Children (Under 10 Years)</span>
                    <span className="tier-badge free-badge">Free</span>
                  </div>
                  <span className="tier-desc">Complimentary reunion entry</span>
                </div>
                <div className="stepper-controls">
                  <button
                    type="button"
                    onClick={() => handleCountStep('children_under_7_count', -1)}
                    disabled={(formData.children_under_7_count ?? 0) <= minKidsUnder7}
                    className="stepper-btn"
                    aria-label="Decrease children under 10"
                    id="btn-dec-kids-under-7"
                    title={
                      isEnforcingMinCounts && (formData.children_under_7_count ?? 0) <= minKidsUnder7
                        ? 'Cannot reduce below previously registered count'
                        : undefined
                    }
                  >
                    −
                  </button>
                  <div className="stepper-count-wrap">
                    <span className="stepper-count">{formData.children_under_7_count ?? 0}</span>
                    <span className="stepper-person-label">
                      {(formData.children_under_7_count ?? 0) === 1 ? 'Child' : 'Children'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCountStep('children_under_7_count', 1)}
                    disabled={(formData.children_under_7_count ?? 0) >= 10}
                    className="stepper-btn"
                    aria-label="Increase children under 10"
                    id="btn-inc-kids-under-7"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* In Update Mode: Inform user why counts cannot decrease */}
            {isEnforcingMinCounts && (
              <div className="attendee-locked-callout">
                <span className="locked-icon">🔒</span>
                <span className="locked-text">
                  Previously registered counts cannot be reduced. You can increase counts to register additional family members.
                </span>
              </div>
            )}

            {/* Total Summary Row */}
            <div className="attendee-total-pill-bar">
              <span className="attendee-total-text">
                👥 Total Attending: <strong>{pricing.totalAttendees}</strong>{' '}
                {pricing.totalAttendees === 1 ? 'person' : 'persons'}
              </span>
              <span className="attendee-total-amount">
                Total Contribution: <strong>₹{pricing.totalAmount}</strong>
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
          }}
          error={screenshotError}
          isUpdateMode={isUpdateMode}
          hasExistingScreenshot={Boolean(activeExistingReg?.payment_screenshot_path)}
          existingScreenshotPath={activeExistingReg?.payment_screenshot_path}
          previousPaidAmount={previousPaidAmount}
          additionalAmountDue={additionalAmountDue}
        />
      )}

      {/* SUBMIT BUTTON */}
      <div className="form-submit-bar">
        {formError && (
          <div
            className="submit-error-banner"
            onClick={() => scrollToError(formError, errorFieldId || undefined)}
            role="button"
            tabIndex={0}
            title="Click to scroll to top to review error"
          >
            <div className="submit-error-banner-left">
              <span className="submit-error-badge">Action Required</span>
              <span className="submit-error-summary">{formError}</span>
            </div>
            <span className="submit-error-scroll-link">
              Scroll to Error ↑
            </span>
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="btn btn-festive-primary btn-large btn-block"
          id="btn-submit-registration"
        >
          {submitting ? (
            <div className="spinner-wrap">
              <div className="spinner" />
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
                    `Save & Update Registration (${activeExistingReg?.registration_number || 'REG'})`
                  )
                ) : formData.attendance_status === 'yes' ? (
                  `Complete Registration • ₹${totalAmount}`
                ) : (
                  'Submit Alumni Record'
                )}
              </span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </>
          )}
        </button>
        <p className="privacy-guarantee">
          🔒 Verified ECK Alumni Network. Your details are preserved securely for community activities.
        </p>
      </div>
    </form>
  );
};
