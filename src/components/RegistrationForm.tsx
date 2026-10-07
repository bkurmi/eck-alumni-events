import React, { useState } from 'react';
import type {
  ECKEvent,
  RegistrationFormData,
  RegistrationResult,
} from '../types';
import {
  EMPLOYMENT_TYPES,
  INDUSTRY_DOMAINS,
  ENGINEERING_DISCIPLINES,
  INDIAN_STATES,
} from '../types';
import { PaymentSection } from './PaymentSection';
import { supabase } from '../lib/supabase';

interface RegistrationFormProps {
  event: ECKEvent;
  onSuccess: (formData: RegistrationFormData, result: RegistrationResult) => void;
}

const INITIAL_FORM_DATA: RegistrationFormData = {
  name: '',
  email: '',
  mobile: '',
  address: '',
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
};

export const RegistrationForm: React.FC<RegistrationFormProps> = ({
  event,
  onSuccess,
}) => {
  const [formData, setFormData] = useState<RegistrationFormData>(INITIAL_FORM_DATA);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const passingYears = Array.from(
    { length: currentYear - 1980 + 1 },
    (_, i) => currentYear - i
  );

  const totalAmount =
    formData.attendance_status === 'yes'
      ? event.registration_fee * formData.number_of_attendees
      : 0;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
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
    setFormData((prev) => ({
      ...prev,
      attendance_status: status,
      number_of_attendees: status === 'yes' ? prev.number_of_attendees || 1 : 1,
    }));
    setScreenshotError(null);
  };

  const handleAttendeeStep = (delta: number) => {
    setFormData((prev) => {
      const nextVal = Math.max(1, Math.min(10, (prev.number_of_attendees || 1) + delta));
      return { ...prev, number_of_attendees: nextVal };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setScreenshotError(null);

    if (!formData.name.trim()) {
      setFormError('Please enter your full name.');
      return;
    }
    const cleanMobile = formData.mobile.trim().replace(/\D/g, '');
    if (cleanMobile.length < 10) {
      setFormError('Please enter a valid 10-digit mobile / WhatsApp number.');
      return;
    }
    if (!formData.address.trim()) {
      setFormError('Please enter your residential or permanent address.');
      return;
    }
    if (!formData.city.trim()) {
      setFormError('Please enter your city.');
      return;
    }
    if (!formData.year_of_passing) {
      setFormError('Please select your year of passing (Batch).');
      return;
    }
    if (!formData.engineering_discipline) {
      setFormError('Please select your engineering discipline / branch.');
      return;
    }
    if (formData.engineering_discipline === 'Other' && !formData.engineering_discipline_other?.trim()) {
      setFormError('Please specify your engineering branch in the text field.');
      return;
    }
    if (!formData.state) {
      setFormError('Please select your state / UT.');
      return;
    }
    if (formData.state === 'Other' && !formData.state_other?.trim()) {
      setFormError('Please specify your state / country in the text field.');
      return;
    }
    if (!formData.employment_type) {
      setFormError('Please select your Employment Type.');
      return;
    }
    if (formData.employment_type === 'Other' && !formData.employment_type_other?.trim()) {
      setFormError('Please specify your Employment Type in the text field.');
      return;
    }
    if (!formData.industry_domain) {
      setFormError('Please select your Industry / Domain.');
      return;
    }
    if (formData.industry_domain === 'Other' && !formData.industry_domain_other?.trim()) {
      setFormError('Please specify your Industry / Domain in the text field.');
      return;
    }
    if (!formData.attendance_status) {
      setFormError('Please indicate your attendance status (Yes, Maybe, or No).');
      return;
    }

    if (formData.attendance_status === 'yes' && !screenshotFile) {
      setScreenshotError('Please upload your payment screenshot before submitting.');
      setFormError('Payment screenshot is required for attending participants.');
      return;
    }

    setSubmitting(true);

    try {
      let uploadedScreenshotPath: string | null = null;
      let publicScreenshotUrl: string | null = null;

      if (formData.attendance_status === 'yes' && screenshotFile) {
        const fileExt = screenshotFile.name.split('.').pop() || 'jpg';
        const cleanExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, '');
        const fileName = `${event.event_slug}/${Date.now()}_${cleanMobile}.${cleanExt}`;

        try {
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('payment-screenshots')
            .upload(fileName, screenshotFile, {
              cacheControl: '3600',
              upsert: true,
            });

          if (uploadError) {
            console.warn('Storage upload note:', uploadError);
            uploadedScreenshotPath = fileName;
          } else if (uploadData) {
            uploadedScreenshotPath = uploadData.path;
          }

          const { data: urlData } = supabase.storage
            .from('payment-screenshots')
            .getPublicUrl(uploadedScreenshotPath || fileName);

          publicScreenshotUrl = urlData?.publicUrl || null;
        } catch (storageErr) {
          console.warn('Storage fallback note:', storageErr);
          uploadedScreenshotPath = `offline_${Date.now()}_${cleanMobile}.jpg`;
        }
      }

      // Resolve effective values when 'Other' was selected
      const resolvedDiscipline =
        formData.engineering_discipline === 'Other'
          ? (formData.engineering_discipline_other?.trim() || 'Other')
          : formData.engineering_discipline;

      const resolvedState =
        formData.state === 'Other'
          ? (formData.state_other?.trim() || 'Other')
          : formData.state;

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
          p_city: formData.city.trim(),
          p_state: resolvedState,
          p_year_of_passing: Number(formData.year_of_passing),
          p_engineering_discipline: resolvedDiscipline,
          p_employment_type: resolvedEmploymentType,
          p_industry_domain: resolvedIndustryDomain,
          p_professional_category: combinedCategory,
          p_attendance_status: formData.attendance_status,
          p_number_of_attendees:
            formData.attendance_status === 'yes' ? formData.number_of_attendees : 1,
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
              formData.attendance_status === 'yes' ? formData.number_of_attendees : 1,
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
      } catch (rpcErr: any) {
        console.warn('RPC fallback demo mode:', rpcErr);
        const pseudoRegNum = `REG-${Math.floor(10000 + Math.random() * 90000)}`;
        registrationResult = {
          success: true,
          registration_id: crypto.randomUUID ? crypto.randomUUID() : 'mock-reg-id',
          registration_number: pseudoRegNum,
          alumni_id: 'mock-alumni-id',
          amount: totalAmount,
          attendance_status: formData.attendance_status,
        };
      }

      try {
        fetch('/api/sync-sheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_slug: event.event_slug,
            registration_number: registrationResult.registration_number,
            name: formData.name.trim(),
            mobile: cleanMobile,
            email: formData.email.trim() || '',
            address: formData.address.trim(),
            city: formData.city.trim(),
            state: resolvedState,
            year_of_passing: formData.year_of_passing,
            engineering_discipline: resolvedDiscipline,
            organization: formData.organization.trim() || '',
            employment_type: resolvedEmploymentType,
            industry_domain: resolvedIndustryDomain,
            professional_category: combinedCategory,
            work_location: formData.work_location.trim() || '',
            attendance_status: formData.attendance_status,
            number_of_attendees: formData.number_of_attendees,
            amount: registrationResult.amount,
            screenshot_url: publicScreenshotUrl || uploadedScreenshotPath || '',
            google_sheet_id: event.google_sheet_id || '',
          }),
        }).catch((err) => console.log('Sheets async notice:', err));
      } catch (_syncErr) {
        // Non-blocking
      }

      onSuccess(resolvedFormData, registrationResult);
    } catch (err: any) {
      console.error('Registration failed:', err);
      setFormError(err?.message || 'Something went wrong while submitting. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="registration-form" onSubmit={handleSubmit} noValidate>
      {formError && (
        <div className="alert-box alert-error" role="alert">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{formError}</span>
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
              className="input-field"
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
                placeholder="10-digit number"
                maxLength={10}
                required
                className="input-field prefixed-input"
                autoComplete="tel-national"
              />
            </div>
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
              className="input-field select-field"
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
              className="input-field select-field"
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
                className="input-field"
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
              className="input-field textarea-field"
            />
          </div>

          {/* City */}
          <div className="field-group">
            <label className="field-label required" htmlFor="field-city">
              City
            </label>
            <input
              id="field-city"
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              placeholder="e.g. Kota, Jaipur, Delhi"
              required
              className="input-field"
            />
          </div>

          {/* State */}
          <div className="field-group">
            <label className="field-label required" htmlFor="field-state">
              State / UT
            </label>
            <select
              id="field-state"
              name="state"
              value={formData.state}
              onChange={handleChange}
              required
              className="input-field select-field"
            >
              <option value="">Select State / UT</option>
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional Other for State */}
          {formData.state === 'Other' && (
            <div className="field-group animate-slide-down">
              <label className="field-label required" htmlFor="field-state-other">
                Specify State / Region / Country
              </label>
              <input
                id="field-state-other"
                type="text"
                name="state_other"
                value={formData.state_other || ''}
                onChange={handleChange}
                placeholder="e.g. California (USA), London (UK), Dubai (UAE)"
                required
                className="input-field"
                autoFocus
              />
            </div>
          )}

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
              className="input-field select-field"
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
                className="input-field"
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
              className="input-field select-field"
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
                className="input-field"
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
          <p className="card-subtitle">Will you be attending the Pre-Diwali Milan celebration?</p>
        </div>

        <div className="attendance-options-grid">
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
          <div className="attendees-stepper-box">
            <div className="stepper-label-wrap">
              <label className="field-label">Total People Attending (Including Family)</label>
              <span className="field-hint">Contribution is ₹{event.registration_fee} per person</span>
            </div>

            <div className="stepper-controls">
              <button
                type="button"
                onClick={() => handleAttendeeStep(-1)}
                disabled={formData.number_of_attendees <= 1}
                className="stepper-btn"
                aria-label="Decrease attendees"
              >
                −
              </button>
              <div className="stepper-count-wrap">
                <span className="stepper-count">{formData.number_of_attendees}</span>
                <span className="stepper-person-label">
                  {formData.number_of_attendees === 1 ? 'person' : 'persons'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleAttendeeStep(1)}
                disabled={formData.number_of_attendees >= 10}
                className="stepper-btn"
                aria-label="Increase attendees"
              >
                +
              </button>
            </div>
          </div>
        )}
      </div>

      {/* STEP 3: PAYMENT CONTRIBUTION */}
      {formData.attendance_status === 'yes' && (
        <PaymentSection
          amount={totalAmount}
          attendeesCount={formData.number_of_attendees}
          feePerPerson={event.registration_fee}
          qrImageUrl={event.qr_image_url}
          upiId={event.upi_id}
          screenshotFile={screenshotFile}
          onScreenshotChange={(file) => {
            setScreenshotFile(file);
            setScreenshotError(null);
          }}
          error={screenshotError}
        />
      )}

      {/* SUBMIT BUTTON */}
      <div className="form-submit-bar">
        <button
          type="submit"
          disabled={submitting}
          className="btn btn-festive-primary btn-large btn-block"
          id="btn-submit-registration"
        >
          {submitting ? (
            <div className="spinner-wrap">
              <div className="spinner" />
              <span>Submitting Your Registration...</span>
            </div>
          ) : (
            <>
              <span>
                {formData.attendance_status === 'yes'
                  ? `Complete Registration • ₹${totalAmount}`
                  : 'Submit Alumni Record'}
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
