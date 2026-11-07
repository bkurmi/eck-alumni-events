import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  GraduationCap,
  User,
  MapPin,
  Briefcase,
  Camera,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Clock,
  ShieldCheck,
  MessageCircle,
} from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import {
  ENGINEERING_DISCIPLINES,
  INDIAN_STATES,
  COUNTRY_OPTIONS,
  EMPLOYMENT_TYPES,
  INDUSTRY_DOMAINS,
  COMMON_ORGANIZATIONS,
  type AlumniRegistrationFormData,
  type AlumniDirectoryItem,
} from '../types';
import {
  cleanMobileNumber,
  stripSalutation,
} from '../lib/registrations';
import {
  getDefaultPassingYearForBatch,
  getAllBatchOptions,
  getPassingYearOptions,
} from '../lib/batchUtils';
import {
  submitAlumniSelfRegistration,
  fetchOrganizationSuggestions,
  lookupAlumniByMobile,
} from '../lib/directory';

const INITIAL_FORM_DATA: AlumniRegistrationFormData = {
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
  designation: '',
  employment_type: '',
  employment_type_other: '',
  industry_domain: '',
  industry_domain_other: '',
  work_location: '',
  linkedin_url: '',
  photo_url: '',
};

export const AlumniRegistrationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const redirectEventSlug = searchParams.get('event');

  const [formData, setFormData] = useState<AlumniRegistrationFormData>(INITIAL_FORM_DATA);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [orgSuggestions, setOrgSuggestions] = useState<string[]>(() => Array.from(COMMON_ORGANIZATIONS));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Instant mobile duplicate detection state
  const [isCheckingMobile, setIsCheckingMobile] = useState(false);
  const [existingAlumnus, setExistingAlumnus] = useState<AlumniDirectoryItem | null>(null);

  const { allBatches } = useMemo(() => getAllBatchOptions(), []);
  const passingYearOptions = useMemo(() => getPassingYearOptions(), []);

  // WhatsApp Share Message Generator
  const getWhatsAppShareUrl = (
    customData?: Partial<AlumniRegistrationFormData> | AlumniDirectoryItem | null
  ) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const registerUrl = `${origin}/register-alumni`;
    const targetName = customData?.name || formData.name || 'Alumnus';
    const targetBatch = customData?.batch || formData.batch;
    const targetYear = customData?.year_of_passing || formData.year_of_passing;
    const otherDisc = customData && 'engineering_discipline_other' in customData ? customData.engineering_discipline_other : undefined;
    const targetDiscipline =
      (customData?.engineering_discipline === 'Other' ? otherDisc : customData?.engineering_discipline) ||
      (formData.engineering_discipline === 'Other'
        ? formData.engineering_discipline_other
        : formData.engineering_discipline);
    const targetMobile = customData?.mobile || formData.mobile;

    const cleanBatch = targetBatch ? targetBatch.replace(/^batch\s+/i, '').trim() : '';
    const batchYearStr = cleanBatch && targetYear
      ? `${cleanBatch} (${targetYear})`
      : (cleanBatch || (targetYear ? String(targetYear) : ''));
    const cleanMobile = cleanMobileNumber(targetMobile);

    const messageLines = [
      '🎓 *ECK-RTU Alumni Network Registration*',
      '',
      'Hello Batchmates & Coordinators! 👋',
      '',
      'I have submitted my alumni registration details on the official *Engineering College Kota / RTU Alumni Portal* for committee verification.',
      '',
      '📋 *My Registration Details:*',
      `• *Name:* ${targetName}`,
      batchYearStr ? `• *Batch:* ${batchYearStr}` : null,
      targetDiscipline ? `• *Branch:* ${targetDiscipline}` : null,
      cleanMobile ? `• *Mobile:* +91 ${cleanMobile}` : null,
      '• *Status:* ⏳ Pending Committee Approval',
      '',
      '🙏 *Request to Admins / Coordinators:*',
      'Kindly verify and approve my registration so my profile can be included in the official Alumni Directory.',
      '',
      '🤝 *A Request to Fellow Alumni:*',
      'If you haven\'t registered yet, please join our official alumni network:',
      '',
      `🔗 ${registerUrl}`,
      '',
      '❤️ *Proud to be an ECKian!*',
    ];

    const message = messageLines.filter((line) => line !== null).join('\n');
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  };

  // Result state
  const [submissionResult, setSubmissionResult] = useState<{
    status: 'PENDING' | 'RE_SUBMITTED' | 'ALREADY_APPROVED' | 'ALREADY_PENDING';
    message: string;
    alumni_id?: string;
  } | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load organization suggestions
  useEffect(() => {
    let isMounted = true;
    fetchOrganizationSuggestions()
      .then((suggestions) => {
        if (isMounted && suggestions && suggestions.length > 0) {
          setOrgSuggestions(suggestions);
        }
      })
      .catch(() => { });
    return () => {
      isMounted = false;
    };
  }, []);

  // Double check if mobile number already exists whenever 10 digits are entered
  useEffect(() => {
    const clean = cleanMobileNumber(formData.mobile);
    if (clean.length === 10) {
      let isMounted = true;
      setIsCheckingMobile(true);
      lookupAlumniByMobile(clean)
        .then((match) => {
          if (isMounted) {
            setExistingAlumnus(match);
            setIsCheckingMobile(false);
          }
        })
        .catch(() => {
          if (isMounted) setIsCheckingMobile(false);
        });
      return () => {
        isMounted = false;
      };
    } else {
      setExistingAlumnus(null);
      setIsCheckingMobile(false);
    }
  }, [formData.mobile]);

  // Synchronized handleChange matching RegistrationForm.tsx verbatim
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (formError) setFormError(null);

    if (name === 'country') {
      setFormData((prev) => ({
        ...prev,
        country: value,
        state: value === 'India' ? prev.state : '',
        state_other: '',
      }));
      return;
    }

    if (name === 'mobile') {
      const rawDigits = value.replace(/\D/g, '');
      const clean =
        rawDigits.length > 10 && rawDigits.startsWith('91')
          ? rawDigits.slice(2, 12)
          : rawDigits.slice(0, 10);

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
      [name]: name === 'year_of_passing' ? (value === '' ? '' : Number(value)) : value,
    }));
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setFormError('Photo size is too large (max 10MB). Please select a smaller photo.');
        return;
      }
      if (photoPreview && photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview);
      }
      setPhotoFile(file);
      const previewUrl = URL.createObjectURL(file);
      setPhotoPreview(previewUrl);
      setFormError(null);
    }
    // Reset file input value to allow selecting or retaking with the same filename
    e.target.value = '';
  };

  const handleRemovePhoto = () => {
    if (photoPreview && photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const scrollToError = (msg: string, fieldId?: string) => {
    setFormError(msg);
    if (fieldId) {
      const el = document.getElementById(fieldId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus?.();
        return;
      }
    }
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    const cleanedName = stripSalutation(formData.name.trim());
    if (!cleanedName || cleanedName.length < 2) {
      scrollToError('Please enter your full name.', 'field-name');
      return;
    }

    const cleanMobile = cleanMobileNumber(formData.mobile);
    if (cleanMobile.length !== 10) {
      scrollToError('Please enter a valid 10-digit mobile number.', 'field-mobile');
      return;
    }

    if (existingAlumnus) {
      if (existingAlumnus.approval_status === 'APPROVED') {
        scrollToError(
          `This mobile number (+91 ${cleanMobile}) is already registered under ${existingAlumnus.name}. You are already recognized as an alumnus and cannot register again.`,
          'field-mobile'
        );
        return;
      }
      if (existingAlumnus.approval_status === 'PENDING') {
        scrollToError(
          `Your registration (+91 ${cleanMobile}) is already under committee review. Duplicate registrations are not permitted.`,
          'field-mobile'
        );
        return;
      }
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

    if (formData.engineering_discipline === 'Other' && !formData.engineering_discipline_other?.trim()) {
      scrollToError('Please specify your engineering branch.', 'field-discipline-other');
      return;
    }

    if (!formData.address.trim()) {
      scrollToError('Please enter your permanent or residential address.', 'field-address');
      return;
    }

    if (formData.country === 'Other' && !formData.country_other?.trim()) {
      scrollToError('Please specify your country name.', 'field-country-other');
      return;
    }

    if (formData.country === 'India' && !formData.state) {
      scrollToError('Please select your state.', 'field-state');
      return;
    }

    if (formData.country === 'India' && formData.state === 'Other' && !formData.state_other?.trim()) {
      scrollToError('Please specify your state or region.', 'field-state-other');
      return;
    }

    if (!formData.city.trim()) {
      scrollToError('Please enter your city.', 'field-city');
      return;
    }

    if (!formData.employment_type) {
      scrollToError('Please select your employment type.', 'field-employment-type');
      return;
    }

    if (formData.employment_type === 'Other' && !formData.employment_type_other?.trim()) {
      scrollToError('Please specify your employment type.', 'field-employment-other');
      return;
    }

    if (!formData.industry_domain) {
      scrollToError('Please select your industry or domain.', 'field-industry');
      return;
    }

    if (formData.industry_domain === 'Other' && !formData.industry_domain_other?.trim()) {
      scrollToError('Please specify your industry or domain.', 'field-industry-other');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitAlumniSelfRegistration(
        {
          ...formData,
          name: cleanedName,
          mobile: cleanMobile,
        },
        photoFile
      );

      if (result.success) {
        setSubmissionResult({
          status: (result.status as any) || 'PENDING',
          message: result.message,
          alumni_id: result.alumni_id,
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        if (result.status === 'ALREADY_APPROVED') {
          setSubmissionResult({
            status: 'ALREADY_APPROVED',
            message: result.message,
            alumni_id: result.alumni_id,
          });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (result.status === 'ALREADY_PENDING') {
          setSubmissionResult({
            status: 'ALREADY_PENDING',
            message: result.message,
            alumni_id: result.alumni_id,
          });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          scrollToError(result.message || 'Registration could not be completed. Please try again.');
        }
      }
    } catch (err: any) {
      scrollToError(err?.message || 'A network error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0c16] text-slate-100">
      <Header />

      <main className="flex-1 w-full max-w-3xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {/* Back navigation */}
        <div className="mb-4 flex items-center justify-between text-xs sm:text-sm text-slate-400">
          <Link
            to={redirectEventSlug ? `/events/${redirectEventSlug}` : '/directory'}
            className="inline-flex min-h-[44px] items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors font-medium py-2"
          >
            &larr; {redirectEventSlug ? 'Back to Event' : 'Back to Alumni Directory'}
          </Link>
          <span className="text-slate-500 text-[11px] sm:text-xs">
            Official Alumni Registration
          </span>
        </div>

        {/* ─── SUCCESS / STATUS SCREEN ─── */}
        {submissionResult ? (
          <div className="rounded-2xl border border-amber-500/30 bg-slate-900/90 p-5 sm:p-8 shadow-2xl backdrop-blur-xl animate-in fade-in duration-300">
            {submissionResult.status === 'ALREADY_APPROVED' ? (
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 text-emerald-400">
                  <ShieldCheck className="h-9 w-9" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                  You are already a Verified Alumnus!
                </h1>
                <p className="text-sm sm:text-base text-slate-300 max-w-md mx-auto leading-relaxed">
                  Your record is already approved in the official ECK-RTU Alumni Network. You can view or update your profile in the directory.
                </p>

                <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    to="/directory"
                    className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 font-semibold text-slate-950 hover:bg-amber-400 transition-colors text-sm"
                  >
                    <span>View Alumni Directory</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  {redirectEventSlug && (
                    <Link
                      to={`/events/${redirectEventSlug}`}
                      className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-slate-800/80 px-6 py-3 font-semibold text-amber-300 hover:bg-slate-800 transition-colors text-sm"
                    >
                      <span>Proceed to Event</span>
                    </Link>
                  )}
                </div>
              </div>
            ) : submissionResult.status === 'ALREADY_PENDING' ? (
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 border-2 border-amber-500/40 text-amber-400">
                  <Clock className="h-9 w-9" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                  Application Under Committee Review
                </h1>
                <p className="text-sm sm:text-base text-slate-300 max-w-md mx-auto leading-relaxed">
                  Your alumni registration has already been received and is currently in the committee's verification queue.
                </p>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-200/90 max-w-md mx-auto text-left space-y-2">
                  <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>What happens next?</span>
                  </div>
                  <p>
                    The organizer committee verifies each applicant's graduation credentials. Once approved, your profile will automatically go live in the alumni directory.
                  </p>
                </div>

                <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
                  <a
                    href={getWhatsAppShareUrl(existingAlumnus)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3 text-sm shadow-lg shadow-emerald-950/40 transition-all active:scale-[0.99]"
                    title="Share on WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4 shrink-0" />
                    <span>Share</span>
                  </a>
                  <Link
                    to="/directory"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-500 px-5 py-3 font-semibold text-slate-950 hover:bg-amber-400 transition-colors text-sm"
                  >
                    Explore Directory
                  </Link>
                  <Link
                    to="/"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-800 border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:bg-slate-700 transition-colors text-sm"
                  >
                    Return Home
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 text-emerald-400 animate-in zoom-in-75 duration-300">
                  <CheckCircle2 className="h-9 w-9" />
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Submitted for Manual Approval</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                  Registration Received Successfully!
                </h1>
                <p className="text-sm sm:text-base text-slate-300 max-w-lg mx-auto leading-relaxed">
                  Thank you, <strong className="text-amber-400">{formData.name}</strong>. Your alumni profile has been submitted to the ECK-RTU Alumni Committee for manual verification.
                </p>

                {/* Info Card */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:p-5 text-left max-w-md mx-auto space-y-3 text-xs sm:text-sm">
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Name:</span>
                    <span className="font-semibold text-slate-100">
                      {formData.name}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Batch / Year:</span>
                    <span className="font-semibold text-slate-200">
                      {formData.batch} ({formData.year_of_passing})
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Discipline:</span>
                    <span className="font-semibold text-slate-200 truncate ml-2 text-right">
                      {formData.engineering_discipline === 'Other'
                        ? formData.engineering_discipline_other
                        : formData.engineering_discipline}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Mobile:</span>
                    <span className="font-semibold text-slate-200 font-mono">
                      +91 {cleanMobileNumber(formData.mobile)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Status:</span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      <Clock className="h-3 w-3" /> PENDING COMMITTEE APPROVAL
                    </span>
                  </div>
                </div>

                <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
                  <a
                    href={getWhatsAppShareUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3 text-sm shadow-lg shadow-emerald-950/40 transition-all active:scale-[0.99]"
                    title="Share on WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4 shrink-0" />
                    <span>Share</span>
                  </a>
                  <Link
                    to="/directory"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-semibold text-slate-950 hover:bg-amber-400 transition-colors text-sm"
                  >
                    <span>Browse Alumni Directory</span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </Link>
                  <Link
                    to="/"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 font-semibold text-slate-200 hover:bg-slate-700 transition-colors text-sm"
                  >
                    Return Home
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ─── ALUMNI REGISTRATION FORM ─── */
          <div className="space-y-6">
            {/* Header intro */}
            <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-slate-900/90 to-slate-950/90 p-5 sm:p-7 shadow-xl backdrop-blur-md">
              <div className="flex items-start gap-3.5">
                <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <GraduationCap className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-1.5">
                    Official Member Registration
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                    Register as an ECK-RTU Alumnus
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Join the verified alumni directory. All registrations undergo manual committee verification before being recognized and published.
                  </p>
                </div>
              </div>

              {/* Committee verification notice */}
              <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200/90">
                <ShieldCheck className="h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  <strong>Strict Alumni Verification:</strong> Only verified alumni of Engineering College Kota / UCE / RTU are approved.
                </span>
              </div>
            </div>

            {/* Error alert banner */}
            {formError && (
              <div
                className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 sm:p-4 text-xs sm:text-sm text-rose-300 flex items-start gap-2.5 animate-in fade-in"
                role="alert"
              >
                <AlertCircle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                <div className="flex-1 leading-snug">
                  <p className="font-semibold">Please check your inputs</p>
                  <p className="text-rose-200 mt-0.5">{formError}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {/* SECTION 1: Personal & Contact */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6 shadow-lg space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <User className="h-5 w-5 text-amber-400" />
                    <span>Personal &amp; Contact Details</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Your contact information will be used for official communications and directory matching.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <div className="sm:col-span-2 space-y-1.5">
                    <label
                      className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                      htmlFor="field-name"
                    >
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
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                      autoComplete="name"
                    />
                  </div>

                  {/* Mobile */}
                  <div className="space-y-1.5">
                    <label
                      className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                      htmlFor="field-mobile"
                    >
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
                        placeholder="10-digit number"
                        maxLength={10}
                        required
                        className="w-full min-h-[44px] pl-12 pr-10 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                        autoComplete="tel-national"
                      />
                      {isCheckingMobile && (
                        <span className="absolute right-3.5 flex items-center justify-center text-amber-400" title="Checking registration...">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </span>
                      )}
                    </div>

                    {/* 1. Already Approved Alumnus: Cannot register again */}
                    {!isCheckingMobile && existingAlumnus && existingAlumnus.approval_status === 'APPROVED' && (
                      <div className="mt-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 sm:p-3.5 space-y-2.5 animate-in fade-in">
                        <div className="flex items-start gap-2.5">
                          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <h4 className="text-xs sm:text-sm font-bold text-white">
                              Already Registered &amp; Verified Alumnus!
                            </h4>
                            <p className="text-xs text-slate-200 leading-relaxed">
                              This mobile number (<strong className="font-mono text-emerald-300">+91 {cleanMobileNumber(existingAlumnus.mobile)}</strong>) already exists in the ECK-RTU Alumni Network under <strong className="text-white">{existingAlumnus.name}</strong> ({existingAlumnus.batch || `${existingAlumnus.year_of_passing} Batch`}, {existingAlumnus.engineering_discipline}).
                            </p>
                            <p className="text-xs text-amber-300 font-semibold">
                              You cannot register again. Please view or update your profile instead.
                            </p>
                          </div>
                        </div>

                        <div className="pt-1 flex flex-wrap gap-2">
                          <Link
                            to="/profile"
                            className="inline-flex min-h-[44px] items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-sm transition-all"
                          >
                            <User className="h-3.5 w-3.5" />
                            <span>View / Update My Profile</span>
                          </Link>
                          <Link
                            to="/directory"
                            className="inline-flex min-h-[44px] items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-all"
                          >
                            <span>Browse Directory</span>
                          </Link>
                          {redirectEventSlug && (
                            <Link
                              to={`/events/${redirectEventSlug}`}
                              className="inline-flex min-h-[44px] items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-500/40 bg-amber-500/20 text-amber-300 text-xs font-semibold transition-all"
                            >
                              <span>Proceed to Event</span>
                            </Link>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 2. Pending Approval: Cannot submit duplicate */}
                    {!isCheckingMobile && existingAlumnus && existingAlumnus.approval_status === 'PENDING' && (
                      <div className="mt-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 sm:p-3.5 space-y-2 animate-in fade-in">
                        <div className="flex items-start gap-2.5">
                          <Clock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <h4 className="text-xs sm:text-sm font-bold text-white">
                              Registration Already Submitted for Review
                            </h4>
                            <p className="text-xs text-slate-200 leading-relaxed">
                              An application for <strong className="font-mono text-amber-300">+91 {cleanMobileNumber(existingAlumnus.mobile)}</strong> was already submitted under <strong className="text-white">{existingAlumnus.name}</strong> and is currently awaiting committee approval.
                            </p>
                            <p className="text-xs text-amber-200/90 font-medium">
                              Duplicate registration is not allowed. The committee will review your application soon.
                            </p>
                          </div>
                        </div>
                        <div className="pt-1">
                          <Link
                            to="/directory"
                            className="inline-flex min-h-[44px] items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all"
                          >
                            <span>Explore Approved Directory</span>
                          </Link>
                        </div>
                      </div>
                    )}

                    {/* 3. Rejected: Can re-submit */}
                    {!isCheckingMobile && existingAlumnus && existingAlumnus.approval_status === 'REJECTED' && (
                      <div className="mt-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 sm:p-3.5 text-xs text-rose-200 space-y-1 animate-in fade-in">
                        <p className="font-bold text-rose-300 flex items-center gap-1.5">
                          <AlertCircle className="h-4 w-4" />
                          <span>Previous Application Rejected</span>
                        </p>
                        <p>
                          Your previous registration was rejected{existingAlumnus.rejection_reason ? `: "${existingAlumnus.rejection_reason}"` : ''}.
                          Please correct your details below and re-submit for committee review.
                        </p>
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
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                      autoComplete="email"
                    />
                  </div>
                </div>
              </section>

              {/* SECTION 2: Academic & College Records */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6 shadow-lg space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-amber-400" />
                    <span>Academic &amp; College Credentials</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ECK-RTU Kota graduation records (Used by coordinators to verify your batch).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Batch (Mandatory - Comes FIRST) */}
                  <div className="space-y-1.5">
                    <label
                      className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                      htmlFor="field-batch"
                    >
                      Batch
                    </label>
                    <select
                      id="field-batch"
                      name="batch"
                      value={formData.batch || ''}
                      onChange={handleChange}
                      required
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
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

                  {/* Pass Out Year (Mandatory, pre-loaded & editable - Comes SECOND) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                        htmlFor="field-year"
                      >
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
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
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
                  </div>

                  {/* Engineering Discipline */}
                  <div className="sm:col-span-2 space-y-1.5">
                    <label
                      className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                      htmlFor="field-discipline"
                    >
                      Engineering Discipline / Branch
                    </label>
                    <select
                      id="field-discipline"
                      name="engineering_discipline"
                      value={formData.engineering_discipline}
                      onChange={handleChange}
                      required
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
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
                      <label
                        className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                        htmlFor="field-discipline-other"
                      >
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
                        className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </section>

              {/* SECTION 3: Location Details */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6 shadow-lg space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-amber-400" />
                    <span>Location Details</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Your current residential location helps alumni chapters connect with you locally.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Permanent / Residential Address */}
                  <div className="sm:col-span-2 space-y-1.5">
                    <label
                      className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                      htmlFor="field-address"
                    >
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
                      className="w-full min-h-[70px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors resize-y"
                    />
                  </div>

                  {/* Country */}
                  <div className="space-y-1.5">
                    <label
                      className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                      htmlFor="field-country"
                    >
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
                      <label
                        className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                        htmlFor="field-country-other"
                      >
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
                        className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                        autoFocus
                      />
                    </div>
                  )}

                  {/* If Country is India: State Dropdown */}
                  {formData.country === 'India' && (
                    <div className="space-y-1.5 animate-in fade-in">
                      <label
                        className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                        htmlFor="field-state"
                      >
                        State / UT
                      </label>
                      <select
                        id="field-state"
                        name="state"
                        value={formData.state}
                        onChange={handleChange}
                        required
                        className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
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
                      <label
                        className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                        htmlFor="field-state-other"
                      >
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
                        className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                        autoFocus
                      />
                    </div>
                  )}

                  {/* If Country is Other: State/Province/Emirate (Optional) */}
                  {formData.country === 'Other' && (
                    <div className="space-y-1.5 animate-in fade-in">
                      <label
                        className="block text-xs sm:text-sm font-semibold text-slate-200"
                        htmlFor="field-state-other"
                      >
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
                    <label
                      className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                      htmlFor="field-city"
                    >
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
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                  </div>
                </div>
              </section>

              {/* SECTION 4: Professional & Career Details */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6 shadow-lg space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-amber-400" />
                    <span>Professional &amp; Career Details</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Helps batchmates find alumni across corporate, governmental, and entrepreneurial domains.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Employment Type */}
                  <div className="space-y-1.5">
                    <label
                      className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                      htmlFor="field-employment-type"
                    >
                      Employment Type
                    </label>
                    <select
                      id="field-employment-type"
                      name="employment_type"
                      value={formData.employment_type}
                      onChange={handleChange}
                      required
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                    >
                      <option value="">Select Employment Type</option>
                      {EMPLOYMENT_TYPES.map((type) => (
                        <option key={type} value={type} className="bg-slate-900 text-slate-100">
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Industry / Domain */}
                  <div className="space-y-1.5">
                    <label
                      className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                      htmlFor="field-industry"
                    >
                      Industry / Domain
                    </label>
                    <select
                      id="field-industry"
                      name="industry_domain"
                      value={formData.industry_domain}
                      onChange={handleChange}
                      required
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                    >
                      <option value="">Select Industry / Domain</option>
                      {INDUSTRY_DOMAINS.map((domain) => (
                        <option key={domain} value={domain} className="bg-slate-900 text-slate-100">
                          {domain}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Conditional Other for Employment Type */}
                  {formData.employment_type === 'Other' && (
                    <div className="sm:col-span-2 space-y-1.5 animate-in fade-in">
                      <label
                        className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                        htmlFor="field-employment-other"
                      >
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
                        className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                        autoFocus
                      />
                    </div>
                  )}

                  {/* Conditional Other for Industry / Domain */}
                  {formData.industry_domain === 'Other' && (
                    <div className="sm:col-span-2 space-y-1.5 animate-in fade-in">
                      <label
                        className="block text-xs sm:text-sm font-semibold text-slate-200 after:content-['*'] after:ml-1 after:text-amber-400"
                        htmlFor="field-industry-other"
                      >
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
                        className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
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
                      list="organization-suggestions"
                      value={formData.organization}
                      onChange={handleChange}
                      placeholder="e.g. Allen, RVUNL / KTPS, Indian Railways, Infosys..."
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                    <datalist id="organization-suggestions">
                      {orgSuggestions.map((org) => (
                        <option key={org} value={org} />
                      ))}
                    </datalist>
                  </div>

                  {/* Current Designation / Role */}
                  <div className="space-y-1.5">
                    <label className="block text-xs sm:text-sm font-semibold text-slate-200" htmlFor="field-designation">
                      Current Designation / Role <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      id="field-designation"
                      type="text"
                      name="designation"
                      value={formData.designation || ''}
                      onChange={handleChange}
                      placeholder="e.g. Executive Engineer (XEN), Director, Senior Manager"
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                    <p className="text-[11px] text-slate-400">Keeps your company name clean for search and ID badges.</p>
                  </div>

                  {/* Current Work Location */}
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
                      placeholder="e.g. Kota, Jaipur, Delhi NCR, Bengaluru, Abroad"
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                    <p className="text-[11px] text-slate-400">Enter City &amp; State only (do not enter street address or office branch).</p>
                  </div>

                  {/* LinkedIn Profile URL */}
                  <div className="space-y-1.5">
                    <label className="block text-xs sm:text-sm font-semibold text-slate-200" htmlFor="field-linkedin">
                      LinkedIn Profile URL <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      id="field-linkedin"
                      type="url"
                      name="linkedin_url"
                      value={formData.linkedin_url || ''}
                      onChange={handleChange}
                      placeholder="https://linkedin.com/in/username"
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                  </div>
                </div>
              </section>

              {/* SECTION 5: Profile Photo / Selfie (Optional) */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6 shadow-lg space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <Camera className="h-5 w-5 text-amber-400" />
                    <span>Profile Photo / Selfie <span className="text-xs font-normal text-slate-400">(Recommended)</span></span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Your photo will be displayed on your verified Alumni Directory card upon committee approval.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                  {/* Photo Preview */}
                  <div className="relative h-24 w-24 sm:h-28 sm:w-28 rounded-2xl border-2 border-dashed border-amber-500/40 bg-slate-950 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                    {photoPreview ? (
                      <>
                        <img
                          src={photoPreview}
                          alt="Preview"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          title="Remove photo"
                          className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-rose-600/90 hover:bg-rose-600 text-white flex items-center justify-center shadow-md transition-all active:scale-90"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <div className="text-center p-2 text-slate-500">
                        <Camera className="h-7 w-7 mx-auto mb-1 text-slate-600" />
                        <span className="text-[10px] block font-medium">No Photo</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 text-center sm:text-left space-y-3 w-full">
                    {/* Hidden Native File & Camera Inputs */}
                    {/* Option 1: Live Selfie Capture (front camera) */}
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="user"
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />
                    {/* Option 2: Gallery / File Upload */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />

                    {/* Dual Action Buttons: 1st Option = Take Selfie, 2nd Option = Upload Photo */}
                    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
                      {/* 1st Option: Take Selfie */}
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25 active:bg-amber-500/30 px-4 py-2.5 text-xs sm:text-sm font-semibold text-amber-300 transition-all cursor-pointer w-full sm:w-auto shadow-sm"
                        title="Open camera to take a live selfie"
                      >
                        <Camera className="h-4 w-4 text-amber-400 shrink-0" />
                        <span>{photoPreview ? 'Retake Selfie' : 'Take Selfie'}</span>
                      </button>

                      {/* 2nd Option: Upload Photo */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 active:bg-slate-750 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-200 transition-all cursor-pointer w-full sm:w-auto shadow-sm"
                        title="Upload existing photo from device or gallery"
                      >
                        <Upload className="h-4 w-4 text-slate-400 shrink-0" />
                        <span>{photoPreview ? 'Upload from Device' : 'Upload Photo'}</span>
                      </button>

                      {/* Remove Button (visible when photo is loaded) */}
                      {photoPreview && (
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-rose-300 transition-all cursor-pointer w-full sm:w-auto"
                        >
                          <X className="h-4 w-4 text-rose-400 shrink-0" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400">
                      Take a live selfie or pick from gallery/files. Supports JPG, PNG or WebP (auto-compressed before upload).
                    </p>
                  </div>
                </div>
              </section>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    isCheckingMobile ||
                    Boolean(
                      existingAlumnus &&
                      (existingAlumnus.approval_status === 'APPROVED' ||
                        existingAlumnus.approval_status === 'PENDING')
                    )
                  }
                  className="w-full flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 py-3.5 px-6 text-base font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-300 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Submitting for Approval...</span>
                    </>
                  ) : existingAlumnus && (existingAlumnus.approval_status === 'APPROVED' || existingAlumnus.approval_status === 'PENDING') ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-slate-950" />
                      <span>Already Registered — Re-registration Disabled</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-5 w-5" />
                      <span>Submit for Approval</span>
                    </>
                  )}
                </button>
                <p className="text-center text-[11px] text-slate-400 mt-2.5 leading-relaxed">
                  By submitting, you confirm that you are an alumnus of ECK-RTU Kota. Applications are manually verified by batch coordinators.
                </p>
              </div>
            </form>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};
