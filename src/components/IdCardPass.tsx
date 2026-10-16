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
  event: _event,
  photoUrl,
  cardRef,
}) => {
  const alumni = registration.alumni;
  const rawMobile = alumni?.mobile || '';
  const cleanMobile = rawMobile.replace(/\D/g, '').slice(-10);

  const attendeeName = (alumni?.name || 'Alumnus').toUpperCase();
  const regNumber = registration.registration_number || 'REG-00039';
  const branch = alumni?.engineering_discipline || 'Information Technology';
  const batchYear = alumni?.year_of_passing ? `Class of ${alumni.year_of_passing}` : 'Class of 2008';
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
    <div className="ticket-pass-wrapper vertical-pass-wrapper">
      <div className="ticket-card ticket-vertical-card" ref={cardRef}>
        {/* Starry sparklers overlay */}
        <div className="ticket-bg-stars" />

        {/* ============================================================
            1. TOP HEADER SECTION (Un-stretched Banner Artwork)
            ============================================================ */}
        <div className="ticket-v-header-section">
          {/* Natural Aspect-Ratio Banner Artwork with Logos & DeepAura 2K26 */}
          <img
            src="/card-header-banner.jpg?v=2"
            alt="DeepAura 2K26 - ECK RTU Alumni Kota Chapter"
            className="ticket-v-banner-img"
          />
        </div>

        {/* ============================================================
            2. ATTENDEE DETAILS SECTION
            ============================================================ */}
        <div className="ticket-v-attendee-section">
          <div className="ticket-v-attendee-card">
            {/* 4 Ornate Gold Corner Filigree Flourishes */}
            <img src="/gold-corner-filigree.svg" alt="" className="ticket-v-corner-flourish corner-tl" />
            <img src="/gold-corner-filigree.svg" alt="" className="ticket-v-corner-flourish corner-tr" />
            <img src="/gold-corner-filigree.svg" alt="" className="ticket-v-corner-flourish corner-bl" />
            <img src="/gold-corner-filigree.svg" alt="" className="ticket-v-corner-flourish corner-br" />

            {/* Left Column: Photo & Badge */}
            <div className="ticket-v-photo-col">
              <div className="ticket-v-photo-box">
                {photoSrc ? (
                  <img src={photoSrc} alt={attendeeName} className="ticket-v-photo-img" />
                ) : (
                  <div className="ticket-v-photo-placeholder">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>PHOTO</span>
                  </div>
                )}
              </div>
              <span className="ticket-v-badge-pill">{badgeLabel}</span>
            </div>

            {/* Right Column: Key Details */}
            <div className="ticket-v-info-col">
              {/* Row 1: Attendee Name & Reg No */}
              <div className="ticket-v-info-top-row">
                <div className="ticket-v-name-box">
                  <span className="ticket-v-label">Attendee Name</span>
                  <h3 className="ticket-v-val-name">{attendeeName}</h3>
                </div>
                <div className="ticket-v-reg-box">
                  <span className="ticket-v-label">Registration No</span>
                  <span className="ticket-v-val-reg">{regNumber}</span>
                </div>
              </div>

              {/* Row 2: Batch & Branch */}
              <div className="ticket-v-info-field">
                <span className="ticket-v-label">Batch</span>
                <p className="ticket-v-val-text">
                  <strong>{batchYear}</strong> ({branch})
                </p>
              </div>

              {/* Row 3: Attendees Count */}
              <div className="ticket-v-info-field">
                <span className="ticket-v-label">No. of Attendees</span>
                <p className="ticket-v-val-text ticket-v-highlight">{attendeesDesc}</p>
              </div>

              {/* Row 4: Date & Venue */}
              <div className="ticket-v-meta-row">
                <div className="ticket-v-meta-item">
                  <span className="ticket-v-label">Date &amp; Time</span>
                  <span className="ticket-v-meta-val">01 Nov 2026, 5:00 PM</span>
                </div>
                <div className="ticket-v-meta-item">
                  <span className="ticket-v-label">Venue</span>
                  <span className="ticket-v-meta-val">Agora Ground, ECK Campus</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================
            3. PERFORATION TEAR LINE (LEFT & RIGHT NOTCHES)
            ============================================================ */}
        <div className="ticket-v-perforation">
          <div className="ticket-v-notch notch-left" />
          <div className="ticket-v-tear-line">
            <span className="ticket-v-tear-label">BOARDING PASS</span>
          </div>
          <div className="ticket-v-notch notch-right" />
        </div>

        {/* ============================================================
            4. BOTTOM SECTION: BOARDING PASS & GATE SCAN STUB
            ============================================================ */}
        <div className="ticket-v-bottom-section">
          {/* Vertical Golden Ribbons on Left & Right */}
          <div className="ticket-v-side-ribbon ribbon-left">
            <span>BOARDING PASS / ALUMNI ACCESS</span>
          </div>
          <div className="ticket-v-side-ribbon ribbon-right">
            <span>BOARDING PASS / ALUMNI ACCESS</span>
          </div>

          <div className="ticket-v-bottom-content">
            <h4 className="ticket-v-stub-title-sub">ECK-RTU</h4>
            <h3 className="ticket-v-stub-title-main">DEEPAURA 2K26</h3>
            <p className="ticket-v-stub-title-desc">A ROYAL DIWALI REUNION</p>

            <span className="ticket-v-scan-hint">SCAN FOR ENTRY</span>

            {/* QR Code Container */}
            <div className="ticket-v-qr-box">
              {cleanMobile ? (
                <QRCodeSVG
                  value={cleanMobile}
                  size={114}
                  level="M"
                  includeMargin={false}
                  bgColor="#ffffff"
                  fgColor="#0a122c"
                />
              ) : (
                <div className="ticket-v-qr-loading">QR</div>
              )}
            </div>


            {/* Admit Pill Button */}
            <div className="ticket-v-admit-pill">
              <span>VERIFIED / ADMIT {totalCount}</span>
            </div>

            {/* Footer Metadata */}
            <p className="ticket-v-footer-meta">
              01 Nov 2026 • {regNumber} • {formattedShortName}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
