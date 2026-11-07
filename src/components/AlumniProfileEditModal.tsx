import React, { useState, useEffect, useRef } from 'react';
import type { AlumniDirectoryItem, UpdateAlumniPayload } from '../types';
import {
  ENGINEERING_DISCIPLINES,
  INDIAN_STATES,
  EMPLOYMENT_TYPES,
  INDUSTRY_DOMAINS,
  COMMON_ORGANIZATIONS,
  COUNTRY_OPTIONS,
} from '../types';
import {
  fetchAlumniDirectory,
  lookupAlumniByMobile,
  uploadAlumniPhoto,
  saveAlumniProfile,
  fetchOrganizationSuggestions,
} from '../lib/directory';
import { cleanMobileNumber } from '../lib/registrations';
import {
  getAllBatchOptions,
  getPassingYearOptions,
  getDefaultPassingYearForBatch,
  getBatchFromPassingYear,
} from '../lib/batchUtils';

interface AlumniProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAlumnus?: AlumniDirectoryItem | null;
  onProfileUpdated?: (updatedAlumnus: AlumniDirectoryItem) => void;
  allAlumni?: AlumniDirectoryItem[];
}

export const AlumniProfileEditModal: React.FC<AlumniProfileEditModalProps> = ({
  isOpen,
  onClose,
  initialAlumnus,
  onProfileUpdated,
  allAlumni,
}) => {
  // Step: 'find' (lookup by name/mobile), 'verify' (confirm phone), or 'edit' (full profile view & editor)
  const [activeStep, setActiveStep] = useState<'find' | 'verify' | 'edit'>('find');
  const [searchMethod, setSearchMethod] = useState<'name' | 'mobile'>('name');

  // Candidate alumnus awaiting phone verification
  const [candidateAlumnus, setCandidateAlumnus] = useState<AlumniDirectoryItem | null>(null);
  const [verifyMobileInput, setVerifyMobileInput] = useState('');
  const [verifyMobileError, setVerifyMobileError] = useState('');

  // In-Memory pool for 0ms Algolia-like instant predictive search
  const [alumniPool, setAlumniPool] = useState<AlumniDirectoryItem[]>(allAlumni || []);
  const [loadingPool, setLoadingPool] = useState(false);

  // Search states
  const [nameQuery, setNameQuery] = useState('');
  const [mobileQuery, setMobileQuery] = useState('');
  const [mobileSearchError, setMobileSearchError] = useState('');
  const [isSearchingMobile, setIsSearchingMobile] = useState(false);

  // Selected alumnus record
  const [selectedAlumnus, setSelectedAlumnus] = useState<AlumniDirectoryItem | null>(null);

  // Batch & Passing Year options
  const { allBatches } = React.useMemo(() => getAllBatchOptions(), []);
  const passingYearOptions = React.useMemo(() => getPassingYearOptions(), []);

  // Form states matching full registration schema
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    country: 'India',
    country_other: '',
    state: 'Rajasthan',
    state_other: '',
    city: '',
    address: '',
    batch: '2020',
    year_of_passing: 2020,
    engineering_discipline: 'Computer Science',
    engineering_discipline_other: '',
    employment_type: 'Full-time (Private)',
    employment_type_other: '',
    industry_domain: 'Information Technology & Services',
    industry_domain_other: '',
    organization: '',
    designation: '',
    work_location: '',
    linkedin_url: '',
  });

  // Photo states
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');

  // Submit states
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [saveErrorMsg, setSaveErrorMsg] = useState('');
  const [orgSuggestions, setOrgSuggestions] = useState<string[]>(() => Array.from(COMMON_ORGANIZATIONS));

  // Dynamically load organization suggestions from database on open
  useEffect(() => {
    if (isOpen) {
      let isMounted = true;
      fetchOrganizationSuggestions().then((suggestions) => {
        if (isMounted && suggestions && suggestions.length > 0) {
          setOrgSuggestions(suggestions);
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [isOpen]);

  // File input refs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize pool from props or fetch once on mount
  useEffect(() => {
    if (allAlumni && allAlumni.length > 0) {
      setAlumniPool(allAlumni);
    } else if (isOpen && alumniPool.length === 0) {
      setLoadingPool(true);
      fetchAlumniDirectory()
        .then((data) => {
          if (Array.isArray(data)) setAlumniPool(data);
        })
        .finally(() => setLoadingPool(false));
    }
  }, [isOpen, allAlumni]);

  // Initialize or reset when modal opens or initialAlumnus changes
  useEffect(() => {
    if (!isOpen) {
      setNameQuery('');
      setMobileQuery('');
      setMobileSearchError('');
      setSaveSuccessMsg('');
      setSaveErrorMsg('');
      setCandidateAlumnus(null);
      setVerifyMobileInput('');
      setVerifyMobileError('');
      return;
    }

    if (initialAlumnus) {
      initiateEditForAlumnus(initialAlumnus);
    } else {
      setActiveStep('find');
      setSelectedAlumnus(null);
      setCandidateAlumnus(null);
      setPhotoPreview(null);
    }
  }, [isOpen, initialAlumnus]);

  // Initiate edit flow - checks if phone verification is already completed
  const initiateEditForAlumnus = (alumnus: AlumniDirectoryItem) => {
    const verifiedMobile = localStorage.getItem('eck_verified_mobile');
    const cleanTargetMobile = cleanMobileNumber(alumnus.mobile);

    // If device is already verified and matches this alumnus, jump straight into edit mode!
    if (verifiedMobile && cleanTargetMobile && verifiedMobile === cleanTargetMobile) {
      loadAlumnusIntoForm(alumnus);
      return;
    }

    // Otherwise, prompt phone verification
    setCandidateAlumnus(alumnus);
    setVerifyMobileInput('');
    setVerifyMobileError('');
    setActiveStep('verify');
  };

  const handleVerifyPhoneForEdit = (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyMobileError('');
    const cleanInput = cleanMobileNumber(verifyMobileInput);
    if (!cleanInput || cleanInput.length < 10) {
      setVerifyMobileError('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (!candidateAlumnus) return;

    const targetMobile = cleanMobileNumber(candidateAlumnus.mobile);
    if (cleanInput === targetMobile) {
      localStorage.setItem('eck_verified_mobile', cleanInput);
      loadAlumnusIntoForm(candidateAlumnus);
    } else {
      setVerifyMobileError('The mobile number does not match this alumnus profile. Please enter the registered 10-digit number.');
    }
  };

  // Load alumnus into edit form
  const loadAlumnusIntoForm = (alumnus: AlumniDirectoryItem) => {
    setSelectedAlumnus(alumnus);

    // Check if discipline is standard or Other
    const isStdDiscipline = (ENGINEERING_DISCIPLINES as readonly string[]).includes(alumnus.engineering_discipline);
    const disciplineValue = isStdDiscipline ? alumnus.engineering_discipline : 'Other';
    const disciplineOther = isStdDiscipline ? '' : alumnus.engineering_discipline;

    // Check if state is standard or Other
    const isStdState = (INDIAN_STATES as readonly string[]).includes(alumnus.state);
    const stateValue = isStdState ? alumnus.state : 'Other';
    const stateOther = isStdState ? '' : alumnus.state;

    // Check employment type
    const empType = alumnus.employment_type || 'Full-time (Private)';
    const isStdEmp = (EMPLOYMENT_TYPES as readonly string[]).includes(empType);

    // Check industry domain
    const indDomain = alumnus.industry_domain || 'Information Technology & Services';
    const isStdDomain = (INDUSTRY_DOMAINS as readonly string[]).includes(indDomain);

    const passingYear = alumnus.year_of_passing || 2020;
    const resolvedBatch = alumnus.batch || getBatchFromPassingYear(passingYear);

    setFormData({
      name: alumnus.name || '',
      email: alumnus.email || '',
      mobile: alumnus.mobile || '',
      country: alumnus.country || 'India',
      country_other: alumnus.country && alumnus.country !== 'India' ? alumnus.country : '',
      state: stateValue,
      state_other: stateOther,
      city: alumnus.city || '',
      address: alumnus.address || '',
      batch: resolvedBatch,
      year_of_passing: passingYear,
      engineering_discipline: disciplineValue,
      engineering_discipline_other: disciplineOther,
      employment_type: isStdEmp ? empType : 'Other',
      employment_type_other: isStdEmp ? '' : empType,
      industry_domain: isStdDomain ? indDomain : 'Other',
      industry_domain_other: isStdDomain ? '' : indDomain,
      organization: alumnus.organization || '',
      designation: alumnus.designation || '',
      work_location: alumnus.work_location || '',
      linkedin_url: alumnus.linkedin_url || '',
    });

    setPhotoPreview(alumnus.resolved_photo_url || alumnus.photo_url || null);
    setActiveStep('edit');
    setSaveSuccessMsg('');
    setSaveErrorMsg('');
  };

  // Instant Predictive Search (by Name only)
  const filteredSuggestions = React.useMemo(() => {
    const raw = nameQuery.trim().toLowerCase();
    if (!raw) return [];

    const tokens = raw.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    return alumniPool
      .filter((item) => {
        const name = (item.name || '').toLowerCase();
        return tokens.every((t) => name.includes(t));
      })
      .slice(0, 25);
  }, [alumniPool, nameQuery]);

  // Handle Mobile Search
  const handleMobileSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setMobileSearchError('');

    const clean = cleanMobileNumber(mobileQuery);
    if (!clean || clean.length < 10) {
      setMobileSearchError('Please enter a valid 10-digit mobile number.');
      return;
    }

    // 1. Instant in-memory check (0ms)
    const matchInMem = alumniPool.find((a) => cleanMobileNumber(a.mobile) === clean);
    if (matchInMem) {
      localStorage.setItem('eck_verified_mobile', clean);
      loadAlumnusIntoForm(matchInMem);
      return;
    }

    // 2. Network RPC fallback
    setIsSearchingMobile(true);
    try {
      const match = await lookupAlumniByMobile(clean);
      if (match) {
        localStorage.setItem('eck_verified_mobile', clean);
        loadAlumnusIntoForm(match);
      } else {
        setMobileSearchError(`No alumnus found registered with mobile ${clean}.`);
      }
    } catch (err: any) {
      setMobileSearchError(err?.message || 'Error searching. Please try again.');
    } finally {
      setIsSearchingMobile(false);
    }
  };

  // Handle photo file selection (from camera or gallery)
  const handlePhotoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAlumnus) return;

    setIsUploadingPhoto(true);
    setPhotoError('');

    try {
      // Local preview immediately
      const tempPreview = URL.createObjectURL(file);
      setPhotoPreview(tempPreview);

      // Compress and upload to Supabase storage
      const res = await uploadAlumniPhoto(
        selectedAlumnus.mobile,
        formData.name || selectedAlumnus.name,
        file,
        selectedAlumnus.latest_event_registration_number || undefined
      );

      if (res.success && res.photoUrl) {
        setPhotoPreview(res.photoUrl);
      } else {
        setPhotoError(res.error || 'Failed to upload photo. Using local preview.');
      }
    } catch (err: any) {
      setPhotoError(err.message || 'Error processing photo');
    } finally {
      setIsUploadingPhoto(false);
      if (e.target) e.target.value = '';
    }
  };

  // Handle form submit
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlumnus) return;

    if (!formData.name.trim()) {
      setSaveErrorMsg('Full Name is required.');
      return;
    }

    if (!formData.batch || !formData.batch.trim()) {
      setSaveErrorMsg('Batch is mandatory. Please select your ECK/RTU Batch.');
      return;
    }

    if (!formData.year_of_passing) {
      setSaveErrorMsg('Pass Out Year is mandatory. Please select your Year of Passing.');
      return;
    }

    setIsSaving(true);
    setSaveErrorMsg('');
    setSaveSuccessMsg('');

    try {
      // Resolve custom inputs
      const isIndia = formData.country === 'India';
      const resolvedCountry = isIndia ? 'India' : (formData.country_other.trim() || 'Other');
      const resolvedState = isIndia
        ? (formData.state === 'Other' ? (formData.state_other.trim() || 'Other') : formData.state)
        : (formData.state_other.trim() || resolvedCountry);

      const resolvedDiscipline =
        formData.engineering_discipline === 'Other'
          ? (formData.engineering_discipline_other.trim() || 'Other')
          : formData.engineering_discipline;

      const resolvedEmploymentType =
        formData.employment_type === 'Other'
          ? (formData.employment_type_other.trim() || 'Other')
          : formData.employment_type;

      const resolvedIndustryDomain =
        formData.industry_domain === 'Other'
          ? (formData.industry_domain_other.trim() || 'Other')
          : formData.industry_domain;

      const combinedCategory = `${resolvedEmploymentType} | ${resolvedIndustryDomain}`;

      const payload: UpdateAlumniPayload = {
        alumni_id: selectedAlumnus.id,
        mobile: selectedAlumnus.mobile,
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        batch: formData.batch.trim(),
        year_of_passing: Number(formData.year_of_passing),
        engineering_discipline: resolvedDiscipline,
        employment_type: resolvedEmploymentType,
        industry_domain: resolvedIndustryDomain,
        professional_category: combinedCategory,
        organization: formData.organization.trim() || null,
        designation: formData.designation.trim() || null,
        city: formData.city.trim() || 'Kota',
        state: resolvedState,
        country: resolvedCountry,
        address: formData.address.trim() || '',
        work_location: formData.work_location.trim() || null,
        linkedin_url: formData.linkedin_url.trim() || null,
        photo_url: photoPreview || selectedAlumnus.resolved_photo_url || null,
      };

      const result = await saveAlumniProfile(payload);

      if (result.success) {
        const updatedItem: AlumniDirectoryItem = {
          ...selectedAlumnus,
          name: payload.name,
          email: payload.email || null,
          batch: payload.batch || selectedAlumnus.batch,
          year_of_passing: Number(payload.year_of_passing) || selectedAlumnus.year_of_passing,
          engineering_discipline: payload.engineering_discipline || selectedAlumnus.engineering_discipline,
          employment_type: payload.employment_type || undefined,
          industry_domain: payload.industry_domain || undefined,
          professional_category: combinedCategory,
          organization: payload.organization || null,
          city: payload.city || selectedAlumnus.city || 'Kota',
          state: payload.state || selectedAlumnus.state || 'Rajasthan',
          country: payload.country || selectedAlumnus.country || 'India',
          address: payload.address || selectedAlumnus.address || '',
          work_location: payload.work_location || null,
          linkedin_url: payload.linkedin_url || null,
          resolved_photo_url: payload.photo_url || null,
          photo_url: payload.photo_url || null,
          updated_at: new Date().toISOString(),
        };

        setSelectedAlumnus(updatedItem);
        setSaveSuccessMsg('Alumni Profile updated successfully! All details are saved. 🎉');
        if (onProfileUpdated) {
          onProfileUpdated(updatedItem);
        }

        setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        setSaveErrorMsg(result.error || 'Failed to save changes. Please try again.');
      }
    } catch (err: any) {
      setSaveErrorMsg(err?.message || 'Unexpected error while updating profile.');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to mask phone for privacy in suggestions dropdown
  const maskPhone = (phone?: string | null) => {
    if (!phone) return '';
    const clean = cleanMobileNumber(phone);
    if (clean.length === 10) {
      return `+91 ${clean.slice(0, 2)}*** ***${clean.slice(8)}`;
    }
    return phone;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-2xl bg-slate-900 border-t sm:border border-amber-500/30 rounded-t-2xl sm:rounded-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4 border-b border-slate-800 bg-slate-950/50">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>👤</span>{' '}
              {activeStep === 'find'
                ? 'Open My Alumni Profile'
                : activeStep === 'verify'
                ? 'Verify Registered Mobile'
                : 'My Alumni Profile'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
              {activeStep === 'find'
                ? 'Search your name or mobile number to open your record and update your complete information.'
                : activeStep === 'verify'
                ? `Confirm registered phone number to edit profile for ${candidateAlumnus?.name}`
                : `Editing profile for ${selectedAlumnus?.name} • Registered Mobile: ${selectedAlumnus?.mobile}`}
            </p>
          </div>
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 text-slate-400 hover:text-white transition-colors text-lg"
            onClick={onClose}
            aria-label="Close Modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 tab-scrollbar space-y-5">
          {/* STEP 1: FIND / LOOKUP ALUMNUS */}
          {activeStep === 'find' && (
            <div className="space-y-4">
              {/* Method Switcher Tabs */}
              <div className="flex rounded-xl p-1 bg-slate-950 border border-slate-800 gap-1">
                <button
                  type="button"
                  className={`flex-1 min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    searchMethod === 'name'
                      ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  onClick={() => setSearchMethod('name')}
                >
                  <span>🔤 Search by Name</span>
                </button>
                <button
                  type="button"
                  className={`flex-1 min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    searchMethod === 'mobile'
                      ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  onClick={() => setSearchMethod('mobile')}
                >
                  <span>📱 Search by Mobile</span>
                </button>
              </div>

              {/* Name Auto-suggestion Box */}
              {searchMethod === 'name' && (
                <div className="space-y-3">
                  <label htmlFor="alumni-name-suggest-input" className="block text-xs sm:text-sm font-semibold text-slate-200">
                    Type your name to open your record:
                  </label>
                  <div className="relative w-full">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-sm">
                      🔍
                    </span>
                    <input
                      id="alumni-name-suggest-input"
                      type="text"
                      className="w-full min-h-[44px] text-base sm:text-sm pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 font-medium placeholder:text-slate-500"
                      placeholder="Type your name (e.g. Bhawesh, Rahul)..."
                      value={nameQuery}
                      onChange={(e) => setNameQuery(e.target.value)}
                      autoFocus
                    />
                    {nameQuery && (
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 min-h-[32px] min-w-[32px] flex items-center justify-center text-slate-400 hover:text-white"
                        onClick={() => setNameQuery('')}
                        title="Clear input"
                      >
                        ✕
                      </button>
                    )}
                    {loadingPool && (
                      <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-amber-400">⏳</span>
                    )}
                  </div>

                  {/* Instant 0ms Suggestion Dropdown List */}
                  {nameQuery.trim().length > 0 && (
                    <div className="mt-2">
                      {filteredSuggestions.length > 0 ? (
                        <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 shadow-2xl divide-y divide-slate-800/80 tab-scrollbar" role="listbox">
                          {filteredSuggestions.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="w-full min-h-[52px] p-3 text-left flex items-center gap-3 hover:bg-slate-900 transition-colors cursor-pointer group"
                              onClick={() => initiateEditForAlumnus(item)}
                              role="option"
                              aria-selected="false"
                            >
                              <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800 border border-amber-500/30 flex items-center justify-center shrink-0 font-bold text-amber-400 text-sm">
                                {item.resolved_photo_url ? (
                                  <img
                                    src={item.resolved_photo_url}
                                    alt={item.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span>
                                    {item.name.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap text-sm text-white font-bold">
                                  <span>{item.name}</span>
                                  <span className="text-xs font-mono font-normal text-amber-400">
                                    Batch {item.batch || getBatchFromPassingYear(item.year_of_passing)} • {item.engineering_discipline}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                                  <span>📍 {item.city || 'Kota'}</span>
                                  {item.organization && <span>• 🏢 {item.organization}</span>}
                                  <span className="font-mono text-slate-500">• 📱 {maskPhone(item.mobile)}</span>
                                </div>
                              </div>
                              <div className="shrink-0 text-xs font-semibold text-amber-400 group-hover:translate-x-1 transition-transform hidden sm:block">
                                <span>Open Profile →</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center space-y-1">
                          <p className="text-xs text-slate-300">No alumni matching "<strong>{nameQuery}</strong>".</p>
                          <p className="text-[11px] text-slate-500">Check spelling or search by registered 10-digit mobile number using the tab above.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Mobile Exact Search Box */}
              {searchMethod === 'mobile' && (
                <form className="space-y-3" onSubmit={handleMobileSearch}>
                  <label htmlFor="alumni-mobile-search-input" className="block text-xs sm:text-sm font-semibold text-slate-200">
                    Enter your registered 10-digit mobile number:
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="alumni-mobile-search-input"
                      type="tel"
                      maxLength={14}
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-amber-500"
                      placeholder="e.g. 9829012345"
                      value={mobileQuery}
                      onChange={(e) => {
                        setMobileQuery(e.target.value);
                        setMobileSearchError('');
                      }}
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm whitespace-nowrap flex items-center justify-center transition-colors disabled:opacity-50"
                      disabled={isSearchingMobile || mobileQuery.replace(/[^0-9]/g, '').length < 10}
                    >
                      {isSearchingMobile ? 'Searching...' : 'Open Profile →'}
                    </button>
                  </div>
                  {mobileSearchError && (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs text-rose-400 font-medium">{mobileSearchError}</p>
                      <a
                        href="/register-alumni"
                        className="inline-flex min-h-[44px] items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-xs font-semibold"
                      >
                        <span>Not registered yet? Register as a new Alumnus &rarr;</span>
                      </a>
                    </div>
                  )}
                </form>
              )}
            </div>
          )}

          {/* STEP 1.5: PHONE VERIFICATION GATE */}
          {activeStep === 'verify' && candidateAlumnus && (
            <div className="space-y-4">
              <button
                type="button"
                className="inline-flex items-center min-h-[44px] text-xs font-semibold text-amber-400 hover:text-amber-300 cursor-pointer"
                onClick={() => {
                  setCandidateAlumnus(null);
                  setActiveStep('find');
                }}
              >
                ← Choose another profile
              </button>

              <div className="rounded-2xl border border-amber-500/30 bg-slate-950/70 p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-3.5 pb-3 border-b border-slate-800">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-800 border-2 border-amber-500/40 flex items-center justify-center shrink-0 font-bold text-amber-300 text-sm shadow-md">
                    {candidateAlumnus.resolved_photo_url || candidateAlumnus.photo_url ? (
                      <img
                        src={candidateAlumnus.resolved_photo_url || candidateAlumnus.photo_url || ''}
                        alt={candidateAlumnus.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      candidateAlumnus.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-white truncate">
                      {candidateAlumnus.name}
                    </h3>
                    <p className="text-xs text-amber-400 font-medium truncate">
                      {candidateAlumnus.batch ? `Batch ${candidateAlumnus.batch}` : `Class of ${candidateAlumnus.year_of_passing}`} • {candidateAlumnus.engineering_discipline}
                    </p>
                    {candidateAlumnus.city && (
                      <p className="text-[11px] text-slate-400 truncate">
                        📍 {candidateAlumnus.city}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 sm:p-3.5 space-y-1 text-xs text-amber-200/90 leading-relaxed">
                  <p className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <span>🔒</span> Security Verification Required
                  </p>
                  <p>
                    To protect profile details from unauthorized edits, please confirm the 10-digit registered mobile number for this account.
                  </p>
                  {candidateAlumnus.mobile && (
                    <p className="font-mono text-slate-300 text-[11px] pt-0.5">
                      Registered number ends with: •••••• {cleanMobileNumber(candidateAlumnus.mobile).slice(-4)}
                    </p>
                  )}
                </div>

                <form onSubmit={handleVerifyPhoneForEdit} className="space-y-4 pt-1">
                  <div>
                    <label htmlFor="verify-modal-phone" className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Registered Mobile Number
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3.5 text-sm font-semibold text-slate-400 pointer-events-none">
                        +91
                      </span>
                      <input
                        id="verify-modal-phone"
                        type="tel"
                        maxLength={10}
                        value={verifyMobileInput}
                        onChange={(e) => {
                          setVerifyMobileInput(e.target.value.replace(/\D/g, ''));
                          setVerifyMobileError('');
                        }}
                        placeholder="10-digit mobile number"
                        className="w-full min-h-[44px] rounded-xl bg-slate-900 border border-slate-700 pl-12 pr-4 text-base text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                        autoFocus
                      />
                    </div>
                    {verifyMobileError && (
                      <p className="mt-1.5 text-xs text-rose-400 font-medium leading-relaxed">
                        {verifyMobileError}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={verifyMobileInput.length < 10}
                    className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    <span>Verify &amp; Edit Profile</span>
                    <span>→</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* STEP 2: COMPLETE PROFILE EDITOR */}
          {activeStep === 'edit' && selectedAlumnus && (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              {/* Back to search if not opened from direct card */}
              {!initialAlumnus && (
                <button
                  type="button"
                  className="inline-flex items-center min-h-[44px] text-xs font-semibold text-amber-400 hover:text-amber-300 cursor-pointer"
                  onClick={() => setActiveStep('find')}
                >
                  ← Find another profile
                </button>
              )}

              {/* SECTION: Profile Photo & Headshot */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2.5 text-sm sm:text-base font-bold text-amber-400">
                  <span>📸</span>
                  <h3>Profile Photograph &amp; Headshot</h3>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                  {/* Rectangular Photo with Rounded Corners */}
                  <div className="relative shrink-0 w-32 h-40 sm:w-36 sm:h-44 rounded-2xl overflow-hidden border-2 border-amber-500/40 bg-slate-950 shadow-lg flex items-center justify-center">
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt={formData.name || 'Alumnus Photo'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-500">
                        <span className="text-3xl">👤</span>
                        <span className="text-xs font-bold font-mono mt-1 text-slate-400">
                          {(formData.name || 'Alumnus').slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                    )}
                    {isUploadingPhoto && (
                      <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-amber-400 text-xs gap-1 font-semibold">
                        <span className="animate-spin text-lg">⏳</span>
                        <span>Saving...</span>
                      </div>
                    )}
                  </div>

                  {/* Right side info panel utilizing the entire space */}
                  <div className="flex-1 w-full space-y-3">
                    <div>
                      <h4 className="text-base sm:text-lg font-bold text-white">{formData.name || selectedAlumnus.name}</h4>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300">
                          🎓 Batch {formData.batch || getBatchFromPassingYear(formData.year_of_passing)}
                        </span>
                        {formData.year_of_passing ? (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-emerald-300">
                            📅 Pass Out: {formData.year_of_passing}
                          </span>
                        ) : null}
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                          💻 {formData.engineering_discipline}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                          📍 {formData.city || selectedAlumnus.city || 'Kota'}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                          📱 {selectedAlumnus.mobile}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-400">
                      Add a clear portrait photo or take a fresh live selfie from your mobile camera or laptop so batchmates and professors can recognize you.
                    </p>

                    <div className="flex flex-wrap gap-2 items-center pt-1">
                      {/* Hidden camera input for mobile selfie */}
                      <input
                        type="file"
                        ref={cameraInputRef}
                        accept="image/*"
                        capture="user"
                        style={{ display: 'none' }}
                        onChange={handlePhotoFileSelected}
                      />
                      {/* Hidden standard file picker for laptop/gallery */}
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handlePhotoFileSelected}
                      />

                      <button
                        type="button"
                        className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 cursor-pointer bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={isUploadingPhoto}
                        title="Take a selfie using camera"
                      >
                        <span>📸 Take Live Selfie</span>
                      </button>

                      <button
                        type="button"
                        className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingPhoto}
                        title="Upload from gallery or computer"
                      >
                        <span>📁 Upload File</span>
                      </button>

                      <span className="text-[11px] text-slate-500">JPG, PNG • Auto-compressed</span>
                    </div>
                    {photoError && <p className="text-xs text-rose-400 font-medium">{photoError}</p>}
                  </div>
                </div>
              </div>

              {/* SECTION: Personal & Contact Information */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2.5 text-sm sm:text-base font-bold text-amber-400">
                  <span>📋</span>
                  <h3>Personal &amp; Contact Details</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-name" className="block text-xs font-semibold text-slate-200">
                      Full Name <span className="text-amber-400">*</span>
                    </label>
                    <input
                      id="edit-name"
                      type="text"
                      required
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  {/* Mobile (Registered Identity) */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-mobile" className="block text-xs font-semibold text-slate-200">
                      Registered Mobile Number <span className="text-slate-500 font-normal">(Identity)</span>
                    </label>
                    <input
                      id="edit-mobile"
                      type="text"
                      readOnly
                      disabled
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950/50 border border-slate-800 text-slate-400 font-mono cursor-not-allowed"
                      value={selectedAlumnus.mobile}
                    />
                  </div>

                  {/* Email Address */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-email" className="block text-xs font-semibold text-slate-200">
                      Email Address
                    </label>
                    <input
                      id="edit-email"
                      type="email"
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      placeholder="alumni@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  {/* Country */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-country" className="block text-xs font-semibold text-slate-200">
                      Country
                    </label>
                    <select
                      id="edit-country"
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    >
                      {COUNTRY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value} className="bg-slate-900">
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* State */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-state" className="block text-xs font-semibold text-slate-200">
                      State / Province
                    </label>
                    {formData.country === 'India' ? (
                      <select
                        id="edit-state"
                        className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      >
                        {INDIAN_STATES.map((st) => (
                          <option key={st} value={st} className="bg-slate-900">
                            {st}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="edit-state"
                        type="text"
                        className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                        placeholder="State or Region"
                        value={formData.state_other}
                        onChange={(e) => setFormData({ ...formData, state_other: e.target.value })}
                      />
                    )}
                  </div>

                  {/* City */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-city" className="block text-xs font-semibold text-slate-200">
                      Current City
                    </label>
                    <input
                      id="edit-city"
                      type="text"
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      placeholder="e.g. Kota, Jaipur, Bengaluru, Pune, Delhi NCR..."
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>

                  {/* Residential Address */}
                  <div className="sm:col-span-2 space-y-1.5">
                    <label htmlFor="edit-address" className="block text-xs font-semibold text-slate-200">
                      Residential Address
                    </label>
                    <input
                      id="edit-address"
                      type="text"
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      placeholder="House / Apartment, Street, Colony..."
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: College & Academic Background */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2.5 text-sm sm:text-base font-bold text-amber-400">
                  <span>🎓</span>
                  <h3>College &amp; Academic Background (ECK / RTU Kota)</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Batch (Mandatory) */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-batch" className="block text-xs font-semibold text-slate-200">
                      Batch <span className="text-amber-400">*</span>
                    </label>
                    <select
                      id="edit-batch"
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      value={formData.batch}
                      onChange={(e) => {
                        const newBatch = e.target.value;
                        const defaultYear = getDefaultPassingYearForBatch(newBatch);
                        setFormData({
                          ...formData,
                          batch: newBatch,
                          year_of_passing: defaultYear,
                        });
                      }}
                      required
                    >
                      <option value="" disabled className="bg-slate-900">
                        Select Batch
                      </option>
                      {allBatches.map((b) => (
                        <option key={b.value} value={b.value} className="bg-slate-900 text-white font-normal">
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Year of Passing (Mandatory, pre-loaded & editable) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="edit-passing-year" className="block text-xs font-semibold text-slate-200">
                        Pass Out Year <span className="text-amber-400">*</span>
                      </label>
                      <span className="text-[10px] text-emerald-400 font-mono">Pre-loaded • Editable</span>
                    </div>
                    <select
                      id="edit-passing-year"
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      value={formData.year_of_passing}
                      onChange={(e) => setFormData({ ...formData, year_of_passing: Number(e.target.value) })}
                      required
                    >
                      <option value="" disabled className="bg-slate-900">
                        Select Year
                      </option>
                      {passingYearOptions.map((year) => (
                        <option key={year} value={year} className="bg-slate-900 text-white">
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Engineering Discipline */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-discipline" className="block text-xs font-semibold text-slate-200">
                      Engineering Discipline / Branch <span className="text-amber-400">*</span>
                    </label>
                    <select
                      id="edit-discipline"
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      value={formData.engineering_discipline}
                      onChange={(e) => setFormData({ ...formData, engineering_discipline: e.target.value })}
                    >
                      {ENGINEERING_DISCIPLINES.map((discipline) => (
                        <option key={discipline} value={discipline} className="bg-slate-900">
                          {discipline}
                        </option>
                      ))}
                    </select>
                  </div>

                  {formData.engineering_discipline === 'Other' && (
                    <div className="sm:col-span-2 space-y-1.5">
                      <label htmlFor="edit-discipline-other" className="block text-xs font-semibold text-slate-200">
                        Specify Your Department / Branch
                      </label>
                      <input
                        id="edit-discipline-other"
                        type="text"
                        className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                        placeholder="e.g. Biomedical, Metallurgy..."
                        value={formData.engineering_discipline_other}
                        onChange={(e) => setFormData({ ...formData, engineering_discipline_other: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: Career & Professional Information */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2.5 text-sm sm:text-base font-bold text-amber-400">
                  <span>💼</span>
                  <h3>Career &amp; Professional Background</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Employment Type */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-emp-type" className="block text-xs font-semibold text-slate-200">
                      Employment Type
                    </label>
                    <select
                      id="edit-emp-type"
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      value={formData.employment_type}
                      onChange={(e) => setFormData({ ...formData, employment_type: e.target.value })}
                    >
                      {EMPLOYMENT_TYPES.map((type) => (
                        <option key={type} value={type} className="bg-slate-900">
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Industry Domain */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-ind-domain" className="block text-xs font-semibold text-slate-200">
                      Industry Domain
                    </label>
                    <select
                      id="edit-ind-domain"
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      value={formData.industry_domain}
                      onChange={(e) => setFormData({ ...formData, industry_domain: e.target.value })}
                    >
                      {INDUSTRY_DOMAINS.map((domain) => (
                        <option key={domain} value={domain} className="bg-slate-900">
                          {domain}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Current Organization / Company */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-org" className="block text-xs font-semibold text-slate-200">
                      Current Organization / Company Name
                    </label>
                    <input
                      id="edit-org"
                      type="text"
                      list="edit-org-suggestions"
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      placeholder="e.g. Allen, RVUNL / KTPS, Indian Railways, Infosys..."
                      value={formData.organization}
                      onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                    />
                    <datalist id="edit-org-suggestions">
                      {orgSuggestions.map((org) => (
                        <option key={org} value={org} />
                      ))}
                    </datalist>
                  </div>

                  {/* Current Designation / Role */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-designation" className="block text-xs font-semibold text-slate-200">
                      Current Designation / Role <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      id="edit-designation"
                      type="text"
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      placeholder="e.g. Executive Engineer (XEN), Director, Senior Manager"
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    />
                    <p className="text-[11px] text-slate-400">Keeps your company name clean for search and ID badges.</p>
                  </div>

                  {/* Work Location (City, State) */}
                  <div className="space-y-1.5">
                    <label htmlFor="edit-work-location" className="block text-xs font-semibold text-slate-200">
                      Work Location (City, State)
                    </label>
                    <input
                      id="edit-work-location"
                      type="text"
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      placeholder="e.g. Kota, Jaipur, Delhi NCR, Bengaluru, Abroad..."
                      value={formData.work_location}
                      onChange={(e) => setFormData({ ...formData, work_location: e.target.value })}
                    />
                    <p className="text-[11px] text-slate-400">Enter City &amp; State only (do not enter street address or office branch).</p>
                  </div>
                </div>
              </div>

              {/* SECTION: Professional Networking & Links */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2.5 text-sm sm:text-base font-bold text-amber-400">
                  <span>🔗</span>
                  <h3>Professional Links &amp; Community Connect</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* LinkedIn Profile */}
                  <div className="sm:col-span-2 space-y-1.5">
                    <label htmlFor="edit-linkedin" className="block text-xs font-semibold text-slate-200">
                      LinkedIn Profile URL
                    </label>
                    <input
                      id="edit-linkedin"
                      type="url"
                      className="w-full min-h-[44px] text-base sm:text-sm px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-amber-500 transition-colors"
                      placeholder="https://www.linkedin.com/in/your-profile"
                      value={formData.linkedin_url}
                      onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Feedback messages */}
              {saveSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm font-medium">
                  {saveSuccessMsg}
                </div>
              )}
              {saveErrorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm font-medium">
                  {saveErrorMsg}
                </div>
              )}

              {/* Form Action Buttons */}
              <div className="shrink-0 p-3 sm:p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-end gap-3 mt-4 -mx-4 -mb-4 sm:-mx-6 sm:-mb-6">
                <button
                  type="button"
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50"
                  onClick={onClose}
                  disabled={isSaving}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                  disabled={isSaving || isUploadingPhoto}
                >
                  {isSaving ? 'Saving Changes...' : '💾 Save Profile Updates'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
