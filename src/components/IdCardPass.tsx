import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { ExistingRegistrationLookup, ECKEvent } from '../types';

interface IdCardPassProps {
  registration: ExistingRegistrationLookup;
  event?: ECKEvent | null;
  photoUrl?: string | null;
  cardRef?: React.RefObject<HTMLDivElement | null>;
}

export const IdCardPass: React.FC<IdCardPassProps> = ({
  registration,
  event,
  photoUrl,
  cardRef,
}) => {
  const alumni = registration.alumni;
  const rawMobile = alumni?.mobile || '';
  const cleanMobile = rawMobile.replace(/\D/g, '').slice(-10);

  const eventName = event?.event_name ? event.event_name.toUpperCase() : 'ECK-RTU ALUMNI KOTA CHAPTER';
  const attendeeName = (alumni?.name || 'Alumnus').toUpperCase();
  const regNumber = registration.registration_number || 'REG-00001';
  const branch = alumni?.engineering_discipline || 'Engineering';
  const batchYear = alumni?.year_of_passing ? `Class of ${alumni.year_of_passing}` : 'Alumnus';
  const category = alumni?.professional_category || 'Alumnus';
  const badgeLabel = category.toLowerCase().includes('faculty')
    ? 'FACULTY'
    : category.toLowerCase().includes('guest')
    ? 'GUEST'
    : category.toLowerCase().includes('student')
    ? 'STUDENT'
    : 'ALUMNUS';
  const totalCount = registration.number_of_attendees || 1;
  const adultsCount = registration.adults_count ?? 1;
  const kidsCount = (registration.children_above_7_count || 0) + (registration.children_under_7_count || 0);

  let attendeesDesc = `${totalCount} Member${totalCount > 1 ? 's' : ''}`;
  if (totalCount === 1) {
    attendeesDesc += ' (Alumnus)';
  } else if (kidsCount > 0) {
    attendeesDesc += ` (${adultsCount} Adults + ${kidsCount} Kids)`;
  } else {
    attendeesDesc += ` (Alumnus + ${totalCount - 1} Guest${totalCount - 1 > 1 ? 's' : ''})`;
  }

  const photoSrc = photoUrl || registration.payment_screenshot_path ? (photoUrl || undefined) : undefined;
  
  // Format short name like "V. Khatri" or "B. Kurmi" matching sample
  const nameParts = (alumni?.name || 'Alumnus').trim().split(/\s+/);
  const formattedShortName = nameParts.length > 1 
    ? `${nameParts[0][0]}. ${nameParts[nameParts.length - 1]}`
    : nameParts[0];

  return (
    <div className="ticket-pass-wrapper">
      <div className="ticket-card" ref={cardRef}>
        {/* Background Mandala & Stars Overlay */}
        <div className="ticket-bg-stars" />
        <div className="ticket-bg-mandala-left" />
        <div className="ticket-bg-mandala-right" />

        {/* ============================================================
            MAIN PASS (LEFT SECTION)
            ============================================================ */}
        <div className="ticket-main">
          {/* Left vertical rotated gold ribbon badge */}
          <div className="ticket-vertical-edge-badge">
            <span>BOARDING PASS / ALUMNI ACCESS</span>
          </div>

          {/* Floating Diwali Diyas (Lamps) */}
          <div className="ticket-diya diya-top-left">
            <div className="diya-flame" />
            <div className="diya-bowl" />
          </div>
          <div className="ticket-diya diya-top-right">
            <div className="diya-flame" />
            <div className="diya-bowl" />
          </div>
          <div className="ticket-diya diya-bottom-left">
            <div className="diya-flame" />
            <div className="diya-bowl" />
          </div>
          <div className="ticket-diya diya-bottom-right">
            <div className="diya-flame" />
            <div className="diya-bowl" />
          </div>

          {/* Ticket Header */}
          <div className="ticket-header">
            <h2 className="ticket-college-title">{eventName}</h2>
            <p className="ticket-hindi-tagline">“दीप जले, यादें मुस्कुराएँ।”</p>
            <div className="ticket-header-divider">
              <span className="divider-line" />
              <span className="divider-sparkle">✦</span>
              <span className="divider-diamond">◆</span>
              <span className="divider-sparkle">✦</span>
              <span className="divider-line" />
            </div>
            <h1 className="ticket-event-heading">DEEPAURA 2K26</h1>
            <p className="ticket-event-subheading">ANNUAL ALUMNI MEET</p>
          </div>

          {/* Attendee Details Frame */}
          <div className="ticket-attendee-frame">
            {/* Attendee Photo Box (Left Column of Frame) */}
            <div className="ticket-photo-col">
              <div className="ticket-photo-container">
                {photoSrc ? (
                  <img src={photoSrc} alt={attendeeName} className="ticket-photo-img" />
                ) : (
                  <div className="ticket-photo-placeholder">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>PHOTO</span>
                  </div>
                )}
              </div>
              <span className="ticket-category-tag">{badgeLabel}</span>
            </div>

            {/* Attendee Details (Right Column of Frame) */}
            <div className="ticket-details-col">
              {/* Row 1: Name & Reg No */}
              <div className="ticket-row ticket-row-top">
                <div className="ticket-cell-name">
                  <span className="ticket-label">Attendee Name</span>
                  <h3 className="ticket-val-name">{attendeeName}</h3>
                </div>
                <div className="ticket-cell-reg">
                  <span className="ticket-label">Registration No</span>
                  <span className="ticket-val-reg">{regNumber}</span>
                </div>
              </div>

              {/* Row 2: Batch & Branch */}
              <div className="ticket-row">
                <div className="ticket-cell-full">
                  <span className="ticket-label">Batch</span>
                  <p className="ticket-val-text">
                    <strong>{batchYear}</strong> ({branch})
                  </p>
                </div>
              </div>

              {/* Row 3: Attendees Count */}
              <div className="ticket-row">
                <div className="ticket-cell-full">
                  <span className="ticket-label">No. of Attendees</span>
                  <p className="ticket-val-text ticket-val-highlight">
                    {attendeesDesc}
                  </p>
                </div>
              </div>

              {/* Row 4: Date, Time & Venue */}
              <div className="ticket-row ticket-row-meta">
                <div className="ticket-cell-half">
                  <span className="ticket-label">Date & Time</span>
                  <span className="ticket-val-meta">01 November 2026, 5:00 PM</span>
                </div>
                <div className="ticket-cell-half">
                  <span className="ticket-label">Venue</span>
                  <span className="ticket-val-meta">Agora Ground, ECK-RTU Campus, Kota</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Curved Gold Banner Tab */}
          <div className="ticket-bottom-tab">
            <span>BOARDING PASS / ALUMNI ACCESS</span>
          </div>
        </div>

        {/* ============================================================
            PERFORATION TEAR LINE (WITH TOP & BOTTOM CUTOUT NOTCHES)
            ============================================================ */}
        <div className="ticket-perforation">
          <div className="ticket-notch notch-top" />
          <div className="ticket-dashed-line" />
          <div className="ticket-notch notch-bottom" />
        </div>

        {/* ============================================================
            STUB / BOARDING PASS (RIGHT SECTION)
            ============================================================ */}
        <div className="ticket-stub">
          {/* Vertical rotated text along perforation */}
          <div className="ticket-stub-vertical-label">
            <span>BOARDING PASS</span>
          </div>

          {/* Stub Content */}
          <div className="ticket-stub-content">
            <h3 className="stub-title">ECK-RTU</h3>
            <h2 className="stub-event">DEEPAURA 2K26</h2>

            <span className="stub-scan-hint">SCAN FOR ENTRY</span>

            {/* QR Code Container */}
            <div className="stub-qr-box">
              {cleanMobile ? (
                <QRCodeSVG
                  value={cleanMobile}
                  size={96}
                  level="M"
                  includeMargin={false}
                  bgColor="#ffffff"
                  fgColor="#0a122c"
                />
              ) : (
                <div className="stub-qr-loading">QR</div>
              )}
            </div>

            <span className="stub-scan-hint">SCAN FOR ENTRY</span>

            {/* Admit Pill Button */}
            <div className="stub-admit-pill">
              <span>VERIFIED / ADMIT {totalCount}</span>
            </div>

            {/* Building Watermark Illustration */}
            <div className="stub-building-watermark">
              <svg viewBox="0 0 200 45" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35">
                <path d="M5 45 L5 20 L25 20 L25 10 L50 10 L50 5 L100 5 L100 10 L125 10 L125 20 L145 20 L145 45 Z" />
                <path d="M30 45 L30 25 L45 25 L45 45 M60 45 L60 18 L90 18 L90 45 M105 45 L105 25 L120 25 L120 45" />
                <circle cx="75" cy="12" r="3" />
                <line x1="0" y1="45" x2="200" y2="45" strokeWidth="2" />
              </svg>
            </div>
          </div>

          {/* Rightmost vertical rotated micro text */}
          <div className="ticket-stub-right-meta">
            <span>01 Nov 2026 • {regNumber} • {formattedShortName}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
