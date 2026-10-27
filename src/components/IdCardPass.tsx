import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { ExistingRegistrationLookup, ECKEvent } from '../types';

interface IdCardPassProps {
  registration: ExistingRegistrationLookup;
  event?: ECKEvent | null;
  photoUrl?: string | null;
  cardRef?: React.RefObject<HTMLDivElement | null>;
  hideQr?: boolean;
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (!word) return '';
      if (/^(dr|dr\.|prof|prof\.|er|er\.|mr|mr\.|mrs|mrs\.|ms|ms\.)$/i.test(word)) {
        const clean = word.replace(/\./g, '');
        return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() + '.';
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function formatSmartAttendeeName(rawName: string): { displayName: string; fontSizeClass: string; fullName: string } {
  const fullName = toTitleCase(rawName || 'Alumnus');
  const words = fullName.split(/\s+/).filter(Boolean);

  let displayName = fullName;

  // When Line 1 is fully dedicated to name, it has plenty of space (~250px).
  // Show full name for almost everyone; only abbreviate middle name(s) if > 29 characters:
  if (displayName.length > 29 && words.length >= 3) {
    const hasTitle = /^(Dr\.|Prof\.|Er\.|Mr\.|Mrs\.|Ms\.)/i.test(words[0]);
    if (hasTitle && words.length >= 4) {
      const title = words[0];
      const firstName = words[1];
      const middleInitials = words.slice(2, -1).map((w) => `${w.charAt(0).toUpperCase()}.`).join(' ');
      const lastName = words[words.length - 1];
      displayName = `${title} ${firstName} ${middleInitials} ${lastName}`;
    } else if (!hasTitle && words.length >= 3) {
      const firstName = words[0];
      const middleInitials = words.slice(1, -1).map((w) => `${w.charAt(0).toUpperCase()}.`).join(' ');
      const lastName = words[words.length - 1];
      displayName = `${firstName} ${middleInitials} ${lastName}`;
    }
  }

  // Dynamic font scaling class for dedicated line 1
  let fontSizeClass = 'name-size-normal';
  if (displayName.length > 24) {
    fontSizeClass = 'name-size-compact';
  } else if (displayName.length > 18) {
    fontSizeClass = 'name-size-medium';
  }

  return { displayName, fontSizeClass, fullName };
}

export const IdCardPass: React.FC<IdCardPassProps> = ({
  registration,
  event: _event,
  photoUrl,
  cardRef,
  hideQr = false,
}) => {
  const alumni = registration.alumni;
  const rawMobile = alumni?.mobile || '';
  const cleanMobile = rawMobile.replace(/\D/g, '').slice(-10);

  const { displayName: attendeeName, fontSizeClass: nameSizeClass, fullName: originalFullName } =
    formatSmartAttendeeName(alumni?.name || 'Alumnus');
  const regNumber = registration.registration_number || '';
  const branch = alumni?.engineering_discipline || '';
  const batchYear = alumni?.year_of_passing ? String(alumni.year_of_passing) : '';
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

  const [photoLoadFailed, setPhotoLoadFailed] = React.useState(false);

  React.useEffect(() => {
    setPhotoLoadFailed(false);
  }, [photoUrl, registration.registration_id, registration.registration_number]);

  const getAttendeeInitials = (name?: string): string => {
    if (!name) return 'ECK';
    const clean = name.trim().replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?|er\.?)\s+/i, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'ECK';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const photoSrc = photoUrl || registration.payment_screenshot_path ? (photoUrl || undefined) : undefined;

  // Format short name like "B. Kurmi" matching reference
  const nameParts = (alumni?.name || 'Alumnus').trim().split(/\s+/);
  const formattedShortName = nameParts.length > 1
    ? `${nameParts[0][0]}. ${nameParts[nameParts.length - 1]}`
    : nameParts[0];

  return (
    <div className="ticket-pass-wrapper vertical-pass-wrapper">
      <div className="ticket-card ticket-vertical-card" ref={cardRef}>
        {/* Subtle starry sparklers overlay */}
        <div className="ticket-bg-stars" />

        {/* ============================================================
            1. TOP HEADER BANNER (Official Target Design)
            ============================================================ */}
        <div className="ticket-v-header-section">
          <img
            src="/card-header-official.jpg"
            alt="ECK-RTU Alumni DeepAura 2K26"
            className="ticket-v-header-official-img"
          />
        </div>

        {/* ============================================================
            2. ATTENDEE DETAILS SECTION (Midnight Navy Card + Gold Filigree)
            ============================================================ */}
        <div className="ticket-v-attendee-section">
          <div className="ticket-v-attendee-card">
            {/* 4 Ornate Gold Corner Filigree Flourishes matching reference */}
            <img src="/gold-corner-filigree-exact.png" alt="" className="ticket-v-corner-flourish corner-tl" />
            <img src="/gold-corner-filigree-exact.png" alt="" className="ticket-v-corner-flourish corner-tr" />
            <img src="/gold-corner-filigree-exact.png" alt="" className="ticket-v-corner-flourish corner-bl" />
            <img src="/gold-corner-filigree-exact.png" alt="" className="ticket-v-corner-flourish corner-br" />

            {/* Left Column: Photo & Badge */}
            <div className="ticket-v-photo-col">
              <div className="ticket-v-photo-box">
                {photoSrc && !photoLoadFailed ? (
                  <img
                    src={photoSrc}
                    alt={attendeeName}
                    className="ticket-v-photo-img"
                    onError={() => setPhotoLoadFailed(true)}
                  />
                ) : (
                  <div className="ticket-v-avatar-box">
                    <div className="ticket-v-avatar-circle">
                      <span className="ticket-v-avatar-initials">
                        {getAttendeeInitials(alumni?.name || attendeeName)}
                      </span>
                    </div>
                    <span className="ticket-v-avatar-badge">{badgeLabel}</span>
                  </div>
                )}
              </div>
              <span className="ticket-v-badge-pill">{badgeLabel}</span>
            </div>

            {/* Right Column: Key Details */}
            <div className="ticket-v-info-col">
              {/* Row 1: Attendee Name (Dedicated Full Line) */}
              <div className="ticket-v-info-field ticket-v-name-row">
                <span className="ticket-v-label">Attendee Name</span>
                <h3 className={`ticket-v-val-name ${nameSizeClass}`} title={originalFullName}>
                  {attendeeName}
                </h3>
              </div>

              {/* Row 2: Batch (Cell 1) & Registration (Cell 2) */}
              <div className="ticket-v-info-split-row">
                <div className="ticket-v-batch-box">
                  <span className="ticket-v-label">Batch</span>
                  <p className="ticket-v-val-text ticket-v-val-batch" title={`${batchYear}${branch ? ` • ${branch}` : ''}`}>
                    <strong>{batchYear}</strong>{branch ? ` • ${branch}` : ''}
                  </p>
                </div>
                <div className="ticket-v-reg-box">
                  <span className="ticket-v-label">Registration No</span>
                  <span className="ticket-v-val-reg">{regNumber}</span>
                </div>
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
                  <span className="ticket-v-meta-val">Agora Ground, RTU</span>
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
            4. BOTTOM SECTION: BOARDING PASS & ENTRY GATE SCAN STUB
            ============================================================ */}
        <div className="ticket-v-bottom-section">
          {/* Vertical Golden Ribbons on Left & Right */}
          <div className="ticket-v-side-ribbon ribbon-left">
            <span>BOARDING PASS / ALUMNI ACCESS</span>
          </div>
          <div className="ticket-v-side-ribbon ribbon-right">
            <span>BOARDING PASS / ALUMNI ACCESS</span>
          </div>

          {/* Glowing diyas at stub top */}
          <img src="/diya-golden-flame.png" alt="" className="ticket-v-stub-diya diya-stub-left" />
          <img src="/diya-golden-flame.png" alt="" className="ticket-v-stub-diya diya-stub-right" />

          <div className="ticket-v-bottom-content">
            <h4 className="ticket-v-stub-title-sub">ECK-RTU</h4>
            <h3 className="ticket-v-stub-title-main">DEEPAURA 2K26</h3>
            <p className="ticket-v-stub-title-desc">A ROYAL DIWALI REUNION</p>

            {hideQr ? (
              <>
                <span className="ticket-v-scan-hint ticket-v-social-hint">OFFICIAL EVENT PASS</span>

                {/* Privacy Protected Social Seal */}
                <div className="ticket-v-qr-box ticket-v-privacy-seal-box" title="Gate QR Code & phone number protected for social sharing">
                  <div className="ticket-v-seal-inner">
                    <div className="ticket-v-seal-emblem">
                      <svg
                        className="ticket-v-seal-diya-svg"
                        viewBox="0 0 24 24"
                        width="30"
                        height="30"
                        fill="none"
                        aria-hidden="true"
                      >
                        <defs>
                          <linearGradient id="sealDiyaFlame" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fef08a" />
                            <stop offset="45%" stopColor="#f59e0b" />
                            <stop offset="100%" stopColor="#dc2626" />
                          </linearGradient>
                          <linearGradient id="sealDiyaBase" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#ffd700" />
                            <stop offset="50%" stopColor="#d97706" />
                            <stop offset="100%" stopColor="#78350f" />
                          </linearGradient>
                        </defs>
                        {/* Glow Diya Flame */}
                        <path
                          d="M12 2C12 2 15.5 5.5 15.5 8C15.5 10 13.8 11.5 12 11.5C10.2 11.5 8.5 10 8.5 8C8.5 5.5 12 2 12 2Z"
                          fill="url(#sealDiyaFlame)"
                        />
                        {/* Diya Clay Base */}
                        <path
                          d="M4 13.5C4 17.5 7.5 20.5 12 20.5C16.5 20.5 20 17.5 20 13.5H4Z"
                          fill="url(#sealDiyaBase)"
                          stroke="#ffd700"
                          strokeWidth="0.8"
                        />
                        <ellipse cx="12" cy="13.5" rx="7.8" ry="2" fill="#d97706" />
                      </svg>
                    </div>
                    <span className="ticket-v-seal-brand">ECK-RTU</span>
                    <span className="ticket-v-seal-verified">★ VERIFIED ★</span>
                    <span className="ticket-v-seal-event">DEEPAURA 2K26</span>
                    <span className="ticket-v-seal-privacy">🔒 QR PROTECTED</span>
                  </div>
                </div>

                <span className="ticket-v-scan-hint ticket-v-social-hint">ALUMNI ROYAL PASS</span>
              </>
            ) : (
              <>
                <span className="ticket-v-scan-hint">SCAN FOR ENTRY</span>

                {/* QR Code Container */}
                <div className="ticket-v-qr-box">
                  {cleanMobile ? (
                    <QRCodeSVG
                      value={cleanMobile}
                      size={118}
                      level="M"
                      includeMargin={false}
                      bgColor="#ffffff"
                      fgColor="#0a122c"
                    />
                  ) : (
                    <div className="ticket-v-qr-loading">QR</div>
                  )}
                </div>

                {/* Scan hint repeated below QR code matching reference */}
                <span className="ticket-v-scan-hint">SCAN FOR ENTRY</span>
              </>
            )}

            {/* Admit Pill Button with Star Sparkle */}
            <div className="ticket-v-admit-pill">
              <span>VERIFIED / ADMIT {totalCount}</span>
              <svg className="ticket-v-star-sparkle" viewBox="0 0 24 24" width="13" height="13" fill="#ffffff">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
              </svg>
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
