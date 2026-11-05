import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ECKEvent, ExistingRegistrationLookup } from '../types';
import { lookupRegistrationByMobile, cleanMobileNumber, formatDisplayMobile } from '../lib/registrations';
import { isAlumniIdCardsEnabled } from '../lib/gate';
import { isEventConcluded } from '../lib/eventStatus';

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] bg-slate-900 border border-amber-500/30 rounded-2xl flex flex-col shadow-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/80">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🔍</span>
            <h3 className="text-base sm:text-lg font-black text-white">Find &amp; Manage Registration</h3>
          </div>
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-slate-100">
          <p className="text-xs sm:text-sm text-slate-400">
            Enter your registered 10-digit mobile number to view your status, confirmed attendees, or update your information.
          </p>

          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1 flex items-center">
                <span className="absolute left-3 text-slate-400 text-sm font-bold pointer-events-none">+91</span>
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
                  className="w-full min-h-[44px] pl-12 pr-3 py-2 rounded-xl bg-slate-800/90 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-base text-slate-100 placeholder:text-slate-500 outline-none transition-colors"
                  autoFocus
                  inputMode="numeric"
                  id="lookup-mobile-input"
                />
              </div>
              <button
                type="submit"
                disabled={loading || mobile.replace(/\D/g, '').length < 10}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-amber-500/20 active:scale-[0.98] transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                id="btn-lookup-search"
              >
                {loading ? (
                  <span className="w-4 h-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
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
            {searchError && <p className="text-xs text-red-400 font-medium">⚠️ {searchError}</p>}
          </form>

          {/* Results section */}
          {loading && (
            <div className="p-6 text-center text-slate-400 flex flex-col items-center gap-2">
              <div className="w-6 h-6 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
              <p className="text-xs">Searching registration database...</p>
            </div>
          )}

          {!loading && searched && foundReg && (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">REG ID</span>
                  <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md">
                    {foundReg.registration_number}
                  </span>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                    foundReg.attendance_status === 'yes'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : foundReg.attendance_status === 'payment_pending'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}
                >
                  {foundReg.attendance_status === 'yes'
                    ? '✅ Attending'
                    : foundReg.attendance_status === 'payment_pending'
                    ? '⏳ Payment Pending'
                    : foundReg.attendance_status}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Alumni Name</span>
                  <span className="text-sm font-bold text-white">{foundReg.alumni?.name || '—'}</span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Batch &amp; Branch</span>
                  <span className="text-slate-200">
                    Class of {foundReg.alumni?.year_of_passing || '—'} • {foundReg.alumni?.engineering_discipline || '—'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Mobile</span>
                  <span className="text-slate-200">{formatDisplayMobile(foundReg.alumni?.mobile)}</span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Location</span>
                  <span className="text-slate-200">📍 {foundReg.alumni?.city}, {foundReg.alumni?.state}</span>
                </div>

                {(foundReg.attendance_status === 'yes' || foundReg.attendance_status === 'payment_pending') && (
                  <>
                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">
                        {foundReg.attendance_status === 'payment_pending' ? 'Registered Guests (Draft)' : 'Confirmed Attendees'}
                      </span>
                      <span className="text-slate-200 font-bold">
                        👥 {foundReg.number_of_attendees}{' '}
                        {foundReg.number_of_attendees === 1 ? 'person' : 'persons'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">
                        {foundReg.attendance_status === 'payment_pending' ? 'Pending Contribution' : 'Total Contribution'}
                      </span>
                      <span className="text-sm font-black text-amber-400">₹{foundReg.amount}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                {isAlumniIdCardsEnabled() && !isEventConcluded(event) && foundReg.attendance_status === 'yes' && (
                  <Link
                    to={`/id-card?mobile=${cleanMobileNumber(foundReg.alumni?.mobile || mobile)}`}
                    onClick={onClose}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                    id="btn-download-idpass-modal"
                  >
                    <span>🎟️ Download / View Event ID Card</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}

                <button
                  type="button"
                  onClick={handleEditClick}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
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
            <div className="p-6 text-center bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
              <div className="text-3xl">🔎</div>
              <h4 className="text-sm font-bold text-white">No Registration Found</h4>
              <p className="text-xs text-slate-400">
                We could not find an existing registration for mobile <strong>+91 {mobile}</strong> for this event.
              </p>
              <button
                type="button"
                onClick={handleCreateNewClick}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
              >
                Register as New Participant →
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-800 bg-slate-800/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
