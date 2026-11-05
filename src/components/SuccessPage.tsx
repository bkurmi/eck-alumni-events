import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, ChevronRight, Sparkles } from 'lucide-react';
import { isAlumniIdCardsEnabled } from '../lib/gate';
import { isEventConcluded } from '../lib/eventStatus';
import type { RegistrationFormData, RegistrationResult, ECKEvent } from '../types';

interface SuccessPageProps {
  event: ECKEvent;
  formData: RegistrationFormData;
  result: RegistrationResult;
  onReset: () => void;
  onEdit?: () => void;
}

export const SuccessPage: React.FC<SuccessPageProps> = ({
  event,
  formData,
  result,
  onReset,
  onEdit,
}) => {
  const isAttending = formData.attendance_status === 'yes';

  const buildWhatsAppMessage = () => {
    const count = formData.number_of_attendees || 1;
    const batchText = formData.year_of_passing ? `${formData.year_of_passing} Batch` : 'Alumnus';
    const attendanceText = isAttending
      ? `${count} ${count === 1 ? 'Person' : 'Persons'}`
      : formData.attendance_status === 'maybe' ? 'Maybe' : 'Not Attending';
    let formattedEventDate = '01-11-2026';
    if (event.event_date) {
      const match = event.event_date.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        formattedEventDate = `${match[3]}-${match[2]}-${match[1]}`;
      } else {
        formattedEventDate = event.event_date;
      }
    }
    const venue = event.location || 'ECK Campus, Kota';
    const eventLink = typeof window !== 'undefined' ? window.location.origin : 'https://eck-alumni.org';

    const lines = [
      '🪔✨ *ECK-RTU Alumni DeepAura 2K26* ✨🪔',
      '✨✨ *दीप जले, यादें मुस्कुराएँ।* ✨✨',
      '',
      '🎉 Registration Confirmed!',
      `🎫 ID: ${result.registration_number}`,
      `👤 ${formData.name} | 🎓 ${batchText}`,
      `👥 Attendance: ${attendanceText}`,
      '',
      ...(isAttending && !isEventConcluded(event) ? [`🎟️ Gate Pass: ${eventLink}/id-card?reg=${result.registration_number}`, ''] : []),
      '🙏 Thank you, ECK-RTU Alumni Kota Chapter!',
      'Looking forward to celebrating with seniors, batchmates & juniors!',
      '',
      `📅 ${formattedEventDate} | 📍 ${venue}`,
      '',
      `🔗 ${eventLink}`,
    ];

    return lines.join('\n');
  };

  const handleShareWhatsApp = () => {
    const text = buildWhatsAppMessage();
    const encoded = encodeURIComponent(text);
    const isMobile =
      typeof navigator !== 'undefined' &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      window.open(`whatsapp://send?text=${encoded}`, '_self');
      setTimeout(() => {
        window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
      }, 700);
    } else {
      window.open(`https://web.whatsapp.com/send?text=${encoded}`, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 sm:p-8 shadow-2xl shadow-amber-500/10 flex flex-col items-center text-center gap-5 sm:gap-6 backdrop-blur-md">
      {/* Celebratory Icon */}
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping opacity-75" />
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-amber-500/20 to-emerald-500/20 border-2 border-amber-500/50 flex items-center justify-center text-3xl sm:text-4xl shadow-[0_0_24px_rgba(245,158,11,0.35)]">
          <span className="select-none">🪔</span>
        </div>
      </div>

      <div className="space-y-1.5 max-w-lg">
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          {result.is_update ? 'Registration Updated Successfully!' : 'Registration Confirmed!'}
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
          {result.is_update
            ? 'Your alumni details and reunion registration have been updated.'
            : isAttending
              ? 'Shubh Deepawali! We eagerly look forward to seeing you at the reunion.'
              : formData.attendance_status === 'maybe'
                ? 'Your tentative registration has been saved. We hope to see you at the reunion!'
                : 'Thank you for keeping your alumni directory details updated.'}
        </p>
      </div>

      {/* Prominent Golden Registration Number Card */}
      <div className="w-full bg-gradient-to-br from-amber-500/15 via-amber-500/10 to-amber-500/5 border-2 border-amber-500/40 rounded-xl p-4 sm:p-5 flex flex-col items-center gap-3 shadow-lg shadow-amber-500/10">
        <span className="text-[11px] sm:text-xs font-bold text-amber-300 tracking-widest uppercase">
          {result.is_update ? 'CONFIRMED REGISTRATION ID' : 'OFFICIAL REGISTRATION ID'}
        </span>
        <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-wider [text-shadow:0_0_12px_rgba(245,158,11,0.5)]">
          {result.registration_number}
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 w-full mt-1">
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="inline-flex items-center justify-center gap-2 w-full max-w-xs min-h-[44px] px-5 py-2.5 rounded-full bg-gradient-to-r from-emerald-700 via-emerald-600 to-green-600 hover:from-emerald-600 hover:to-green-500 text-white font-bold text-sm tracking-wide shadow-md shadow-emerald-900/40 transition-all active:scale-[0.98]"
            id="btn-share-whatsapp-badge"
            title="Share confirmation on WhatsApp"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Share on WhatsApp</span>
          </button>
        </div>

        {isAlumniIdCardsEnabled() && !isEventConcluded(event) && isAttending && (
          <div className="w-full flex justify-center mt-1">
            <Link
              to={`/id-card?reg=${encodeURIComponent(result.registration_number)}`}
              className="inline-flex items-center justify-center gap-2 w-full max-w-xs min-h-[46px] px-5 py-2.5 rounded-full bg-gradient-to-r from-yellow-200 via-amber-400 to-amber-500 hover:from-yellow-100 hover:to-amber-400 text-amber-950 font-black text-sm tracking-wide shadow-lg shadow-amber-500/30 transition-all active:scale-[0.98]"
              id="btn-success-view-pass"
            >
              <span>🎟️ Download / View Pass</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {isAlumniIdCardsEnabled() && !isAttending && (
          <div className="mt-2.5 px-3.5 py-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs sm:text-sm text-yellow-200 text-center leading-relaxed max-w-md">
            🔒 <strong className="font-semibold text-yellow-300">Entry Pass:</strong> Available once attendance is confirmed and contribution payment is completed.
          </div>
        )}
      </div>

      {/* Aligned Receipt Table */}
      <div className="w-full bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 sm:p-5 text-left">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-2.5">
          <h4 className="text-sm font-bold text-white">
            {result.is_update ? 'Updated Registration Summary' : 'Registration Receipt'}
          </h4>
          <span className="text-xs text-slate-400">{new Date().toLocaleDateString('en-IN')}</span>
        </div>

        <div className="flex flex-col divide-y divide-dashed divide-slate-800 text-xs sm:text-sm">
          <div className="flex items-center justify-between py-2">
            <span className="text-slate-400">Event</span>
            <span className="text-white font-medium text-right">{event.event_name}</span>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-slate-400">Alumni Name</span>
            <span className="text-white font-semibold text-right">{formData.name}</span>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-slate-400">Mobile Number</span>
            <span className="text-white font-mono text-right">{formData.mobile}</span>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-slate-400">Batch &amp; Branch</span>
            <span className="text-white text-right">
              Class of {formData.year_of_passing} • {formData.engineering_discipline}
            </span>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-slate-400">Location</span>
            <span className="text-white text-right">
              📍 {formData.city}, {formData.country === 'Other' ? (formData.country_other || formData.state) : formData.state}
              {formData.country === 'Other' && formData.country_other && formData.state_other ? ` (${formData.country_other})` : ''}
            </span>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-slate-400">Attendance Status</span>
            <span className="text-right capitalize font-medium">
              {formData.attendance_status === 'yes'
                ? '✅ Attending'
                : formData.attendance_status === 'maybe'
                  ? '⏳ Maybe (Tentative)'
                  : '❌ Not Attending'}
            </span>
          </div>

          {isAttending && (
            <>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400">Confirmed Attendees</span>
                <span className="text-white font-semibold text-right">
                  {formData.number_of_attendees} {formData.number_of_attendees === 1 ? 'Person' : 'Persons'}
                  {formData.adults_count !== undefined && (
                    <span className="text-slate-400 font-normal ml-1">
                      {' ('}
                      {formData.adults_count === 2
                        ? 'Couple'
                        : `${formData.adults_count} Adult${formData.adults_count > 1 ? 's' : ''}`}
                      {formData.children_above_7_count ? `, ${formData.children_above_7_count} Child (10+)` : ''}
                      {formData.children_under_7_count ? `, ${formData.children_under_7_count} Child (<10)` : ''}
                      {')'}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between pt-3 pb-1 border-b-0">
                <span className="text-slate-300 font-semibold">Contribution Total</span>
                <span className="text-amber-400 font-bold text-base sm:text-lg">₹{result.amount}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Informational Callout */}
      <div className="w-full flex items-start gap-3 p-3.5 sm:p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-left text-xs sm:text-sm leading-relaxed text-slate-300">
        <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          {isAttending ? (
            <>
              <p className="font-semibold text-white">Organizer Verification:</p>
              <p className="text-slate-300">
                Your response and payment screenshot have been recorded in the system. The organizing committee will verify your payment details shortly. Please keep a screenshot of this receipt.
              </p>
            </>
          ) : formData.attendance_status === 'maybe' ? (
            <>
              <p className="font-semibold text-white">Tentative Response Recorded:</p>
              <p className="text-slate-300">
                Your response has been recorded with attendance status <strong className="text-white">Maybe</strong>. No contribution was charged. When your travel and reunion plans are finalized, you can update your registration to 'Attending' and make your contribution to generate your official Entry Pass!
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-white">Response Recorded:</p>
              <p className="text-slate-300">
                Thank you for keeping your alumni details updated. We will miss you at the reunion! If your plans change, you can update your registration anytime.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="w-full flex flex-col gap-2.5">
        {onEdit && !isAttending && (
          <button
            type="button"
            onClick={onEdit}
            className="w-full min-h-[44px] py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]"
            id="btn-update-to-attending"
          >
            ✏️ Update to 'Attending' &amp; Make Payment
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          className={`w-full min-h-[44px] py-3 px-4 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${
            !isAttending && onEdit
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
          }`}
          id="btn-register-another-alumni"
        >
          Register Another Alumni
        </button>
      </div>
    </div>
  );
};
