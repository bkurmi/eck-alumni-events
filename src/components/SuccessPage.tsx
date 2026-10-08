import React, { useState } from 'react';
import type { RegistrationFormData, RegistrationResult, ECKEvent } from '../types';

interface SuccessPageProps {
  event: ECKEvent;
  formData: RegistrationFormData;
  result: RegistrationResult;
  onReset: () => void;
}

export const SuccessPage: React.FC<SuccessPageProps> = ({
  event,
  formData,
  result,
  onReset,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyRegNumber = () => {
    navigator.clipboard.writeText(result.registration_number).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShare = () => {
    if ('share' in navigator) {
      navigator
        .share({
          title: `Registered for ${event.event_name}`,
          text: `I have registered for ${event.event_name} (Registration No: ${result.registration_number})! Reconnecting with ECK alumni!`,
          url: window.location.href,
        })
        .catch(() => {});
    } else {
      handleCopyRegNumber();
    }
  };

  return (
    <div className="success-page-card">
      {/* Celebratory Icon */}
      <div className="success-icon-wrap">
        <div className="success-pulse-ring" />
        <div className="success-icon-circle">
          <span className="success-diya-emoji">🪔</span>
        </div>
      </div>

      <div className="success-header">
        <h2 className="success-title">
          {result.is_update ? 'Registration Updated Successfully!' : 'Registration Confirmed!'}
        </h2>
        <p className="success-sub">
          {result.is_update
            ? 'Your alumni details and reunion registration have been updated.'
            : formData.attendance_status === 'yes'
            ? 'Shubh Deepawali! We eagerly look forward to seeing you at the reunion.'
            : 'Thank you for keeping your alumni directory details updated.'}
        </p>
      </div>

      {/* Prominent Golden Registration Number Card */}
      <div className="registration-badge-card">
        <span className="badge-subtitle">
          {result.is_update ? 'CONFIRMED REGISTRATION ID' : 'OFFICIAL REGISTRATION ID'}
        </span>
        <div className="badge-reg-code">{result.registration_number}</div>
        <button
          type="button"
          onClick={handleCopyRegNumber}
          className="btn-copy-reg"
          id="btn-copy-reg-number"
        >
          {copied ? '✓ Copied ID' : '📋 Copy ID'}
        </button>
      </div>

      {/* Perfectly Aligned Receipt Table */}
      <div className="success-details-card">
        <div className="details-header-row">
          <h4 className="details-header">
            {result.is_update ? 'Updated Registration Summary' : 'Registration Receipt'}
          </h4>
          <span className="receipt-date">{new Date().toLocaleDateString('en-IN')}</span>
        </div>

        <div className="detail-rows-container">
          <div className="detail-row">
            <span className="detail-label">Event</span>
            <span className="detail-val">{event.event_name}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">Alumni Name</span>
            <span className="detail-val font-semibold">{formData.name}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">Mobile Number</span>
            <span className="detail-val">{formData.mobile}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">Batch &amp; Branch</span>
            <span className="detail-val">
              Class of {formData.year_of_passing} • {formData.engineering_discipline}
            </span>
          </div>

          <div className="detail-row">
            <span className="detail-label">Location</span>
            <span className="detail-val">
              📍 {formData.city}, {formData.country === 'Other' ? (formData.country_other || formData.state) : formData.state}
              {formData.country === 'Other' && formData.country_other && formData.state_other ? ` (${formData.country_other})` : ''}
            </span>
          </div>

          <div className="detail-row">
            <span className="detail-label">Attendance Status</span>
            <span className="detail-val capitalize">
              {formData.attendance_status === 'yes' ? '✅ Attending' : formData.attendance_status}
            </span>
          </div>

          {formData.attendance_status === 'yes' && (
            <>
              <div className="detail-row">
                <span className="detail-label">Confirmed Attendees</span>
                <span className="detail-val font-semibold">
                  {formData.number_of_attendees} {formData.number_of_attendees === 1 ? 'Person' : 'Persons'}
                  {formData.adults_count !== undefined && (
                    <span className="detail-subval-tag">
                      {' ('}
                      {formData.adults_count === 2
                        ? 'Couple'
                        : `${formData.adults_count} Adult${formData.adults_count > 1 ? 's' : ''}`}
                      {formData.children_above_7_count ? `, ${formData.children_above_7_count} Child (7+)` : ''}
                      {formData.children_under_7_count ? `, ${formData.children_under_7_count} Child (<7)` : ''}
                      {')'}
                    </span>
                  )}
                </span>
              </div>

              <div className="detail-row highlight-row">
                <span className="detail-label">Contribution Total</span>
                <span className="detail-val font-accent font-bold">₹{result.amount}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Informational Callout */}
      <div className="info-callout">
        <div className="callout-icon">✨</div>
        <div className="callout-text">
          <p>
            <strong>Organizer Verification:</strong>
          </p>
          <p>
            Your response and payment screenshot have been recorded in the system. The organizing committee will verify your payment details shortly. Please keep a screenshot of this receipt.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="success-actions-row">
        {'share' in navigator && (
          <button
            type="button"
            onClick={handleShare}
            className="btn btn-festive-primary btn-block"
          >
            <span>Share With Batchmates</span>
          </button>
        )}

        <button
          type="button"
          onClick={onReset}
          className="btn btn-ghost btn-block"
        >
          Register Another Alumni
        </button>
      </div>
    </div>
  );
};
