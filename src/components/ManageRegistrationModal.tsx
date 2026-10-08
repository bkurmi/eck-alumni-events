import React, { useState } from 'react';
import type { ECKEvent, ExistingRegistrationLookup } from '../types';
import { lookupRegistrationByMobile, cleanMobileNumber } from '../lib/registrations';

interface ManageRegistrationModalProps {
  isOpen: boolean;
  event: ECKEvent;
  onClose: () => void;
  onSelectForEdit: (registration: ExistingRegistrationLookup) => void;
  onNewRegistration: () => void;
}

export const ManageRegistrationModal: React.FC<ManageRegistrationModalProps> = ({
  isOpen,
  event,
  onClose,
  onSelectForEdit,
  onNewRegistration,
}) => {
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [foundReg, setFoundReg] = useState<ExistingRegistrationLookup | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSearchError(null);
    setFoundReg(null);

    const clean = cleanMobileNumber(mobile);
    if (clean.length < 10) {
      setSearchError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const result = await lookupRegistrationByMobile(event.event_slug, clean);
      if (result.found) {
        setFoundReg(result);
      } else {
        setFoundReg(null);
      }
    } catch (err: any) {
      console.warn('Search error:', err);
      setSearchError('Unable to query registration. Please check your network and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = () => {
    if (foundReg) {
      onSelectForEdit(foundReg);
      onClose();
    }
  };

  const handleCreateNewClick = () => {
    onClose();
    onNewRegistration();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon">🔍</span>
            <h3 className="modal-title">Find &amp; Manage Registration</h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          <p className="modal-intro">
            Enter your registered 10-digit mobile number to view your status, confirmed attendees, or update your information.
          </p>

          <form onSubmit={handleSearch} className="lookup-search-form">
            <div className="lookup-search-row">
              <div className="input-prefix-wrap lookup-prefix-wrap">
                <span className="input-prefix">+91</span>
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setMobile(cleaned);
                    if (searched) setSearched(false);
                  }}
                  placeholder="10-digit mobile number"
                  maxLength={10}
                  className="input-field prefixed-input lookup-input"
                  autoFocus
                  inputMode="numeric"
                  id="lookup-mobile-input"
                />
              </div>
              <button
                type="submit"
                disabled={loading || mobile.replace(/\D/g, '').length < 10}
                className="btn btn-festive-primary btn-search-go"
                id="btn-lookup-search"
              >
                {loading ? (
                  <span className="mini-spinner" />
                ) : (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span>Search</span>
                  </>
                )}
              </button>
            </div>
            {searchError && <p className="error-message">{searchError}</p>}
          </form>

          {/* Results section */}
          {loading && (
            <div className="lookup-loading-box">
              <div className="spinner" />
              <p>Searching registration database...</p>
            </div>
          )}

          {!loading && searched && foundReg && (
            <div className="found-registration-card animate-slide-down">
              <div className="found-reg-header">
                <div className="found-reg-id-badge">
                  <span className="badge-tag">REGISTRATION ID</span>
                  <span className="badge-code">{foundReg.registration_number}</span>
                </div>
                <span
                  className={`attendance-badge ${
                    foundReg.attendance_status === 'yes'
                      ? 'badge-attending'
                      : 'badge-not-attending'
                  }`}
                >
                  {foundReg.attendance_status === 'yes' ? '✅ Attending' : foundReg.attendance_status}
                </span>
              </div>

              <div className="found-reg-grid">
                <div className="found-reg-item">
                  <span className="found-label">Alumni Name</span>
                  <span className="found-value font-semibold">
                    {foundReg.alumni?.name || '—'}
                  </span>
                </div>

                <div className="found-reg-item">
                  <span className="found-label">Batch &amp; Branch</span>
                  <span className="found-value">
                    Class of {foundReg.alumni?.year_of_passing || '—'} •{' '}
                    {foundReg.alumni?.engineering_discipline || '—'}
                  </span>
                </div>

                <div className="found-reg-item">
                  <span className="found-label">Mobile</span>
                  <span className="found-value">{foundReg.alumni?.mobile}</span>
                </div>

                <div className="found-reg-item">
                  <span className="found-label">Location</span>
                  <span className="found-value">
                    📍 {foundReg.alumni?.city}, {foundReg.alumni?.state}
                  </span>
                </div>

                {foundReg.attendance_status === 'yes' && (
                  <>
                    <div className="found-reg-item">
                      <span className="found-label">Confirmed Attendees</span>
                      <span className="found-value font-semibold">
                        👥 {foundReg.number_of_attendees}{' '}
                        {foundReg.number_of_attendees === 1 ? 'person' : 'persons'}
                        {Boolean(
                          foundReg.adults_count ||
                            foundReg.children_above_7_count ||
                            foundReg.children_under_7_count
                        ) && (
                          <span
                            style={{
                              display: 'block',
                              fontSize: '0.8rem',
                              color: 'var(--text-secondary)',
                              fontWeight: 'normal',
                              marginTop: '2px',
                            }}
                          >
                            ({foundReg.adults_count ?? 1} Adult
                            {(foundReg.adults_count ?? 1) > 1 ? 's' : ''}
                            {foundReg.children_above_7_count
                              ? `, ${foundReg.children_above_7_count} Child (7+)`
                              : ''}
                            {foundReg.children_under_7_count
                              ? `, ${foundReg.children_under_7_count} Child (<7)`
                              : ''}
                            )
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="found-reg-item">
                      <span className="found-label">Total Contribution</span>
                      <span className="found-value font-accent font-bold">
                        ₹{foundReg.amount}
                      </span>
                    </div>
                  </>
                )}

                <div className="found-reg-item">
                  <span className="found-label">Payment Proof</span>
                  <span className="found-value">
                    {foundReg.payment_screenshot_path ? '✓ Screenshot Uploaded' : 'Pending Verification'}
                  </span>
                </div>

                {foundReg.updated_at && (
                  <div className="found-reg-item">
                    <span className="found-label">Last Modified</span>
                    <span className="found-value">
                      {new Date(foundReg.updated_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="found-reg-actions">
                <button
                  type="button"
                  onClick={handleEditClick}
                  className="btn btn-festive-primary btn-block"
                  id="btn-edit-found-registration"
                >
                  <span>✏️ Update Registration Details</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {!loading && searched && !foundReg && (
            <div className="not-found-card animate-slide-down">
              <div className="not-found-icon">🔎</div>
              <h4>No Registration Found</h4>
              <p>
                We could not find an existing registration for mobile <strong>+91 {mobile}</strong> for this event.
              </p>
              <button
                type="button"
                onClick={handleCreateNewClick}
                className="btn btn-primary btn-sm"
              >
                Register as New Participant →
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
