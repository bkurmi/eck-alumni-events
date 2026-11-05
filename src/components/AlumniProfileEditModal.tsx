import React, { useState, useEffect, useRef } from 'react';
import type { AlumniDirectoryItem, UpdateAlumniPayload } from '../types';
import {
  ENGINEERING_DISCIPLINES,
  INDIAN_STATES,
  EMPLOYMENT_TYPES,
  INDUSTRY_DOMAINS,
  COUNTRY_OPTIONS,
} from '../types';
import {
  fetchAlumniDirectory,
  lookupAlumniByMobile,
  uploadAlumniPhoto,
  saveAlumniProfile,
} from '../lib/directory';
import { cleanMobileNumber } from '../lib/registrations';

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
  // Step: 'find' (lookup by name/mobile) or 'edit' (full profile view & editor)
  const [activeStep, setActiveStep] = useState<'find' | 'edit'>('find');
  const [searchMethod, setSearchMethod] = useState<'name' | 'mobile'>('name');

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
    year_of_passing: 2020,
    engineering_discipline: 'Computer Science',
    engineering_discipline_other: '',
    employment_type: 'Full-time (Private)',
    employment_type_other: '',
    industry_domain: 'Information Technology & Services',
    industry_domain_other: '',
    organization: '',
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
      return;
    }

    if (initialAlumnus) {
      loadAlumnusIntoForm(initialAlumnus);
    } else {
      setActiveStep('find');
      setSelectedAlumnus(null);
      setPhotoPreview(null);
    }
  }, [isOpen, initialAlumnus]);

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
      year_of_passing: alumnus.year_of_passing || 2020,
      engineering_discipline: disciplineValue,
      engineering_discipline_other: disciplineOther,
      employment_type: isStdEmp ? empType : 'Other',
      employment_type_other: isStdEmp ? '' : empType,
      industry_domain: isStdDomain ? indDomain : 'Other',
      industry_domain_other: isStdDomain ? '' : indDomain,
      organization: alumnus.organization || '',
      work_location: alumnus.work_location || '',
      linkedin_url: alumnus.linkedin_url || '',
    });

    setPhotoPreview(alumnus.resolved_photo_url || alumnus.photo_url || null);
    setActiveStep('edit');
    setSaveSuccessMsg('');
    setSaveErrorMsg('');
  };

  // Instant Algolia-like Predictive Search (0ms delay across all fields)
  const filteredSuggestions = React.useMemo(() => {
    const raw = nameQuery.trim().toLowerCase();
    if (!raw) return [];

    const tokens = raw.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    return alumniPool
      .filter((item) => {
        const name = (item.name || '').toLowerCase();
        const branch = (item.engineering_discipline || '').toLowerCase();
        const year = String(item.year_of_passing || '');
        const city = (item.city || '').toLowerCase();
        const org = (item.organization || '').toLowerCase();
        const mobile = (item.mobile || '').replace(/\D/g, '');

        // Match all tokens in any order (name, branch, year, city, org, or mobile)
        return tokens.every(
          (t) =>
            name.includes(t) ||
            branch.includes(t) ||
            year.includes(t) ||
            city.includes(t) ||
            org.includes(t) ||
            mobile.includes(t)
        );
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
      loadAlumnusIntoForm(matchInMem);
      return;
    }

    // 2. Network RPC fallback
    setIsSearchingMobile(true);
    try {
      const match = await lookupAlumniByMobile(clean);
      if (match) {
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

      const combinedCategory = `${resolvedEmploymentType} • ${resolvedIndustryDomain}`;

      const payload: UpdateAlumniPayload = {
        alumni_id: selectedAlumnus.id,
        mobile: selectedAlumnus.mobile,
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        year_of_passing: Number(formData.year_of_passing),
        engineering_discipline: resolvedDiscipline,
        employment_type: resolvedEmploymentType,
        industry_domain: resolvedIndustryDomain,
        professional_category: combinedCategory,
        organization: formData.organization.trim() || null,
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
    <div className="alumni-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto" onClick={onClose} role="dialog" aria-modal="true">
      <div className="alumni-modal-container relative w-full max-w-2xl bg-[#111425] border border-amber-500/40 rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl my-auto" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="alumni-modal-header">
          <div>
            <h2 className="alumni-modal-title">
              {activeStep === 'find' ? '👤 Open My Alumni Profile' : '👤 My Alumni Profile'}
            </h2>
            <p className="alumni-modal-subtitle">
              {activeStep === 'find'
                ? 'Search your name or mobile number to open your record and update your complete information.'
                : `Editing profile for ${selectedAlumnus?.name} • Registered Mobile: ${selectedAlumnus?.mobile}`}
            </p>
          </div>
          <button
            type="button"
            className="alumni-modal-close-btn"
            onClick={onClose}
            aria-label="Close Modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="alumni-modal-body">
          {/* STEP 1: FIND / LOOKUP ALUMNUS */}
          {activeStep === 'find' && (
            <div className="alumni-search-view">
              {/* Method Switcher Tabs */}
              <div className="alumni-search-tabs">
                <button
                  type="button"
                  className={`alumni-tab-btn ${searchMethod === 'name' ? 'active' : ''}`}
                  onClick={() => setSearchMethod('name')}
                >
                  <span>🔤 Search by Name</span>
                  <span className="tab-pill-badge">Live Auto-suggest</span>
                </button>
                <button
                  type="button"
                  className={`alumni-tab-btn ${searchMethod === 'mobile' ? 'active' : ''}`}
                  onClick={() => setSearchMethod('mobile')}
                >
                  <span>📱 Search by Mobile</span>
                  <span className="tab-pill-badge">Exact 10 Digits</span>
                </button>
              </div>

              {/* Name Auto-suggestion Box */}
              {searchMethod === 'name' && (
                <div className="alumni-search-box">
                  <label htmlFor="alumni-name-suggest-input" className="form-label">
                    Type your name to open your record:
                  </label>
                  <div className="search-input-wrap">
                    <span className="search-icon" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.6, pointerEvents: 'none' }}>
                      🔍
                    </span>
                    <input
                      id="alumni-name-suggest-input"
                      type="text"
                      className="alumni-form-input"
                      style={{ paddingLeft: '2.5rem', paddingRight: nameQuery ? '2.5rem' : '1rem' }}
                      placeholder="Type name (e.g. Bhawesh, Rahul), batch (2018), or branch..."
                      value={nameQuery}
                      onChange={(e) => setNameQuery(e.target.value)}
                      autoFocus
                    />
                    {nameQuery && (
                      <button
                        type="button"
                        className="clear-search-btn"
                        onClick={() => setNameQuery('')}
                        style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)' }}
                        title="Clear input"
                      >
                        ✕
                      </button>
                    )}
                    {loadingPool && <span className="input-spinner" style={{ position: 'absolute', right: '2.5rem', top: '50%', transform: 'translateY(-50%)' }}>⏳</span>}
                  </div>

                  {/* Empty state discovery hints when not typed yet */}
                  {!nameQuery.trim() && (
                    <div className="name-search-discovery-hints">
                      <p className="discovery-hint-text">
                        ⚡ <strong>Instant Search:</strong> Start typing any name, branch, batch year, or city.
                      </p>
                      <div className="discovery-chips-row">
                        <span className="discovery-chip" onClick={() => setNameQuery('Computer')}>💻 Computer</span>
                        <span className="discovery-chip" onClick={() => setNameQuery('Electrical')}>⚡ Electrical</span>
                        <span className="discovery-chip" onClick={() => setNameQuery('Mechanical')}>⚙️ Mechanical</span>
                        <span className="discovery-chip" onClick={() => setNameQuery('Civil')}>🏗️ Civil</span>
                        <span className="discovery-chip" onClick={() => setNameQuery('Kota')}>📍 Kota</span>
                        <span className="discovery-chip" onClick={() => setNameQuery('Jaipur')}>📍 Jaipur</span>
                        <span className="discovery-chip" onClick={() => setNameQuery('Bengaluru')}>📍 Bengaluru</span>
                        <span className="discovery-chip" onClick={() => setNameQuery('2024')}>🎓 2024</span>
                        <span className="discovery-chip" onClick={() => setNameQuery('2018')}>🎓 2018</span>
                      </div>
                    </div>
                  )}

                  {/* Instant 0ms Suggestion Dropdown List */}
                  {nameQuery.trim().length > 0 && (
                    <div className="suggestions-container">
                      {filteredSuggestions.length > 0 ? (
                        <div className="suggestions-list" role="listbox">
                          {filteredSuggestions.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="suggestion-item"
                              onClick={() => loadAlumnusIntoForm(item)}
                              role="option"
                              aria-selected="false"
                            >
                              <div className="suggestion-avatar">
                                {item.resolved_photo_url ? (
                                  <img
                                    src={item.resolved_photo_url}
                                    alt={item.name}
                                    className="avatar-img"
                                  />
                                ) : (
                                  <span className="avatar-initials">
                                    {item.name.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="suggestion-details">
                                <div className="suggestion-name-row">
                                  <strong>{item.name}</strong>
                                  <span className="suggestion-batch">
                                    {item.year_of_passing ? `'${String(item.year_of_passing).slice(-2)}` : ''} • {item.engineering_discipline}
                                  </span>
                                </div>
                                <div className="suggestion-meta-row">
                                  <span>📍 {item.city || 'Kota'}</span>
                                  {item.organization && <span>• 🏢 {item.organization}</span>}
                                  <span className="masked-phone">• 📱 {maskPhone(item.mobile)}</span>
                                </div>
                              </div>
                              <div className="suggestion-action-arrow">
                                <span>Open Profile →</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="suggestions-empty">
                          <p>No alumni matching "<strong>{nameQuery}</strong>".</p>
                          <p className="empty-tip">Check spelling or search by registered 10-digit mobile number using the tab above.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Mobile Exact Search Box */}
              {searchMethod === 'mobile' && (
                <form className="alumni-search-box" onSubmit={handleMobileSearch}>
                  <label htmlFor="alumni-mobile-search-input" className="form-label">
                    Enter your registered 10-digit mobile number:
                  </label>
                  <div className="search-input-wrap">
                    <input
                      id="alumni-mobile-search-input"
                      type="tel"
                      maxLength={14}
                      className="alumni-form-input"
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
                      className="btn-search-mobile"
                      disabled={isSearchingMobile || mobileQuery.replace(/[^0-9]/g, '').length < 10}
                    >
                      {isSearchingMobile ? 'Searching...' : 'Open Profile →'}
                    </button>
                  </div>
                  {mobileSearchError && <p className="form-error-text">{mobileSearchError}</p>}
                </form>
              )}
            </div>
          )}

          {/* STEP 2: COMPLETE PROFILE EDITOR */}
          {activeStep === 'edit' && selectedAlumnus && (
            <form onSubmit={handleSaveProfile} className="alumni-edit-form">
              {/* Back to search if not opened from direct card */}
              {!initialAlumnus && (
                <button
                  type="button"
                  className="btn-back-to-search"
                  onClick={() => setActiveStep('find')}
                >
                  ← Find another profile
                </button>
              )}

              {/* SECTION: Profile Photo & Headshot */}
              <div className="profile-section-card profile-photo-hero-card">
                <div className="section-title-row">
                  <span className="section-icon">📸</span>
                  <h3>Profile Photograph &amp; Headshot</h3>
                </div>

                <div className="profile-photo-editor-row">
                  {/* Rectangular Photo with Rounded Corners */}
                  <div className="photo-preview-wrap rectangular">
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt={formData.name || 'Alumnus Photo'}
                        className="profile-photo-img rectangular-img"
                      />
                    ) : (
                      <div className="profile-photo-placeholder rectangular-placeholder">
                        <span className="placeholder-icon">👤</span>
                        <span className="placeholder-initials">
                          {(formData.name || 'Alumnus').slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                    )}
                    {isUploadingPhoto && (
                      <div className="photo-uploading-overlay">
                        <span className="spinner-sm">⏳</span>
                        <span>Saving...</span>
                      </div>
                    )}
                  </div>

                  {/* Right side info panel utilizing the entire space */}
                  <div className="photo-actions-wrap profile-photo-details-panel">
                    <div className="photo-identity-header">
                      <h4 className="photo-identity-name">{formData.name || selectedAlumnus.name}</h4>
                      <div className="photo-identity-badges">
                        <span className="photo-meta-badge badge-batch">
                          🎓 Batch of {formData.year_of_passing}
                        </span>
                        <span className="photo-meta-badge badge-discipline">
                          💻 {formData.engineering_discipline}
                        </span>
                        <span className="photo-meta-badge badge-city">
                          📍 {formData.city || selectedAlumnus.city || 'Kota'}
                        </span>
                        <span className="photo-meta-badge badge-phone">
                          📱 {selectedAlumnus.mobile}
                        </span>
                      </div>
                    </div>

                    <p className="photo-hint">
                      Add a clear portrait photo or take a fresh live selfie from your mobile camera or laptop so batchmates and professors can recognize you.
                    </p>

                    <div className="photo-buttons-row">
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
                        className="btn-photo-action btn-camera"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={isUploadingPhoto}
                        title="Take a selfie using camera"
                      >
                        <span>📸 Take Live Selfie</span>
                      </button>

                      <button
                        type="button"
                        className="btn-photo-action btn-gallery"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingPhoto}
                        title="Upload from gallery or computer"
                      >
                        <span>📁 Upload File</span>
                      </button>

                      <span className="photo-format-note">JPG, PNG • Auto-compressed</span>
                    </div>
                    {photoError && <p className="form-error-text">{photoError}</p>}
                  </div>
                </div>
              </div>

              {/* SECTION: Personal & Contact Information */}
              <div className="profile-section-card">
                <div className="section-title-row">
                  <span className="section-icon">📋</span>
                  <h3>Personal &amp; Contact Details</h3>
                </div>

                <div className="alumni-form-grid">
                  {/* Full Name */}
                  <div className="form-group">
                    <label htmlFor="edit-name" className="form-label">
                      Full Name <span className="required-star">*</span>
                    </label>
                    <input
                      id="edit-name"
                      type="text"
                      required
                      className="alumni-form-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  {/* Mobile (Registered Identity) */}
                  <div className="form-group">
                    <label htmlFor="edit-mobile" className="form-label">
                      Registered Mobile Number <span className="read-only-tag">(Identity)</span>
                    </label>
                    <input
                      id="edit-mobile"
                      type="text"
                      readOnly
                      disabled
                      className="alumni-form-input input-disabled"
                      value={selectedAlumnus.mobile}
                    />
                  </div>

                  {/* Email Address */}
                  <div className="form-group">
                    <label htmlFor="edit-email" className="form-label">
                      Email Address
                    </label>
                    <input
                      id="edit-email"
                      type="email"
                      className="alumni-form-input"
                      placeholder="alumni@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  {/* Country */}
                  <div className="form-group">
                    <label htmlFor="edit-country" className="form-label">
                      Country
                    </label>
                    <select
                      id="edit-country"
                      className="alumni-form-select"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    >
                      {COUNTRY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* State */}
                  <div className="form-group">
                    <label htmlFor="edit-state" className="form-label">
                      State / Province
                    </label>
                    {formData.country === 'India' ? (
                      <select
                        id="edit-state"
                        className="alumni-form-select"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      >
                        {INDIAN_STATES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="edit-state"
                        type="text"
                        className="alumni-form-input"
                        placeholder="State or Region"
                        value={formData.state_other}
                        onChange={(e) => setFormData({ ...formData, state_other: e.target.value })}
                      />
                    )}
                  </div>

                  {/* City */}
                  <div className="form-group">
                    <label htmlFor="edit-city" className="form-label">
                      Current City
                    </label>
                    <input
                      id="edit-city"
                      type="text"
                      className="alumni-form-input"
                      placeholder="e.g. Kota, Jaipur, Bengaluru, Pune, Delhi NCR..."
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>

                  {/* Residential Address */}
                  <div className="form-group full-width">
                    <label htmlFor="edit-address" className="form-label">
                      Residential Address
                    </label>
                    <input
                      id="edit-address"
                      type="text"
                      className="alumni-form-input"
                      placeholder="House / Apartment, Street, Colony..."
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: College & Academic Background */}
              <div className="profile-section-card">
                <div className="section-title-row">
                  <span className="section-icon">🎓</span>
                  <h3>College &amp; Academic Background (ECK / RTU Kota)</h3>
                </div>

                <div className="alumni-form-grid">
                  {/* Year of Passing */}
                  <div className="form-group">
                    <label htmlFor="edit-passing-year" className="form-label">
                      Year of Passing (Batch) <span className="required-star">*</span>
                    </label>
                    <select
                      id="edit-passing-year"
                      className="alumni-form-select"
                      value={formData.year_of_passing}
                      onChange={(e) => setFormData({ ...formData, year_of_passing: Number(e.target.value) })}
                    >
                      {Array.from({ length: 50 }, (_, i) => new Date().getFullYear() + 1 - i).map((year) => (
                        <option key={year} value={year}>
                          Batch of {year}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Engineering Discipline */}
                  <div className="form-group">
                    <label htmlFor="edit-discipline" className="form-label">
                      Engineering Discipline / Branch <span className="required-star">*</span>
                    </label>
                    <select
                      id="edit-discipline"
                      className="alumni-form-select"
                      value={formData.engineering_discipline}
                      onChange={(e) => setFormData({ ...formData, engineering_discipline: e.target.value })}
                    >
                      {ENGINEERING_DISCIPLINES.map((discipline) => (
                        <option key={discipline} value={discipline}>
                          {discipline}
                        </option>
                      ))}
                    </select>
                  </div>

                  {formData.engineering_discipline === 'Other' && (
                    <div className="form-group full-width">
                      <label htmlFor="edit-discipline-other" className="form-label">
                        Specify Your Department / Branch
                      </label>
                      <input
                        id="edit-discipline-other"
                        type="text"
                        className="alumni-form-input"
                        placeholder="e.g. Biomedical, Metallurgy..."
                        value={formData.engineering_discipline_other}
                        onChange={(e) => setFormData({ ...formData, engineering_discipline_other: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: Career & Professional Information */}
              <div className="profile-section-card">
                <div className="section-title-row">
                  <span className="section-icon">💼</span>
                  <h3>Career &amp; Professional Background</h3>
                </div>

                <div className="alumni-form-grid">
                  {/* Employment Type */}
                  <div className="form-group">
                    <label htmlFor="edit-emp-type" className="form-label">
                      Employment Type
                    </label>
                    <select
                      id="edit-emp-type"
                      className="alumni-form-select"
                      value={formData.employment_type}
                      onChange={(e) => setFormData({ ...formData, employment_type: e.target.value })}
                    >
                      {EMPLOYMENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Industry Domain */}
                  <div className="form-group">
                    <label htmlFor="edit-ind-domain" className="form-label">
                      Industry Domain
                    </label>
                    <select
                      id="edit-ind-domain"
                      className="alumni-form-select"
                      value={formData.industry_domain}
                      onChange={(e) => setFormData({ ...formData, industry_domain: e.target.value })}
                    >
                      {INDUSTRY_DOMAINS.map((domain) => (
                        <option key={domain} value={domain}>
                          {domain}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Current Organization / Company */}
                  <div className="form-group">
                    <label htmlFor="edit-org" className="form-label">
                      Current Organization / Company Name
                    </label>
                    <input
                      id="edit-org"
                      type="text"
                      className="alumni-form-input"
                      placeholder="e.g. Infosys, NTPC, Indian Railways, Own Venture..."
                      value={formData.organization}
                      onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                    />
                  </div>

                  {/* Work Location / Neighborhood */}
                  <div className="form-group">
                    <label htmlFor="edit-work-location" className="form-label">
                      Work Location / Office Neighborhood
                    </label>
                    <input
                      id="edit-work-location"
                      type="text"
                      className="alumni-form-input"
                      placeholder="e.g. Whitefield, Gurgaon DLF, Hinjewadi, Vigyan Nagar..."
                      value={formData.work_location}
                      onChange={(e) => setFormData({ ...formData, work_location: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: Professional Networking & Links */}
              <div className="profile-section-card">
                <div className="section-title-row">
                  <span className="section-icon">🔗</span>
                  <h3>Professional Links &amp; Community Connect</h3>
                </div>

                <div className="alumni-form-grid">
                  {/* LinkedIn Profile */}
                  <div className="form-group full-width">
                    <label htmlFor="edit-linkedin" className="form-label">
                      LinkedIn Profile URL
                    </label>
                    <input
                      id="edit-linkedin"
                      type="url"
                      className="alumni-form-input"
                      placeholder="https://www.linkedin.com/in/your-profile"
                      value={formData.linkedin_url}
                      onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Feedback messages */}
              {saveSuccessMsg && <div className="alumni-alert-success">{saveSuccessMsg}</div>}
              {saveErrorMsg && <div className="alumni-alert-error">{saveErrorMsg}</div>}

              {/* Form Action Buttons */}
              <div className="alumni-form-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={onClose}
                  disabled={isSaving}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="btn-save-profile"
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
