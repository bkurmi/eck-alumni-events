import React from 'react';
import type { ECKEvent } from '../types';

interface EventCardProps {
  event: ECKEvent;
  onRegisterClick?: () => void;
  onManageRegistrationClick?: () => void;
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  onRegisterClick,
  onManageRegistrationClick,
}) => {
  const formattedDate = new Date(event.event_date).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const bannerImg = event.banner_image_url || '/diwali-banner.jpg';

  return (
    <section className="event-hero-card">
      {/* Festive Banner Container */}
      <div className="event-banner-wrap">
        <img
          src={bannerImg}
          alt="ECK Alumni Pre-Diwali Milan 2026 Celebration"
          className="event-banner-img"
          loading="eager"
        />
      </div>

      <div className="event-hero-body">
        {/* Status and College Insignia Header */}
        <div className="event-badge-row">
          <span className="badge badge-festive">
            <span className="badge-dot pulse-gold">●</span> Annual Alumni Meet
          </span>
          <span className={`badge ${event.status === 'OPEN' ? 'badge-open' : 'badge-closed'}`}>
            {event.status === 'OPEN' ? 'Registrations Open' : event.status}
          </span>
        </div>

        <h1 className="event-title">{event.event_name}</h1>

        {event.tagline && (
          <p className="event-tagline">
            <span className="tagline-flourish">✦</span> {event.tagline}{' '}
            <span className="tagline-flourish">✦</span>
          </p>
        )}

        {/* Aligned 2x2 or 4x1 Key Info Grid */}
        <div className="event-meta-grid">
          {/* Date */}
          <div className="meta-card">
            <div className="meta-icon-badge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div className="meta-text-col">
              <span className="meta-label">Event Date</span>
              <span className="meta-value">{formattedDate}</span>
            </div>
          </div>

          {/* Time */}
          {event.event_time && (
            <div className="meta-card">
              <div className="meta-icon-badge">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div className="meta-text-col">
                <span className="meta-label">Timings</span>
                <span className="meta-value">{event.event_time}</span>
              </div>
            </div>
          )}

          {/* Venue */}
          <div className="meta-card">
            <div className="meta-icon-badge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <div className="meta-text-col">
              <span className="meta-label">Venue</span>
              <span className="meta-value">{event.location}</span>
            </div>
          </div>

          {/* Contribution */}
          <div className="meta-card meta-card-highlight">
            <div className="meta-icon-badge gold-badge">
              <span className="currency-symbol">₹</span>
            </div>
            <div className="meta-text-col">
              <span className="meta-label">Contribution</span>
              <span className="meta-value fee-highlight">
                ₹800 <span className="fee-sub">Single / ₹1,500 Couple</span>
              </span>
            </div>
          </div>
        </div>

        {event.description && (
          <div className="event-desc-box">
            <p>{event.description}</p>
          </div>
        )}

        {event.status === 'OPEN' && (
          <div className="event-action-bar">
            {onRegisterClick && (
              <button
                type="button"
                onClick={onRegisterClick}
                className="btn btn-festive-primary btn-large btn-block"
                id="btn-register-now"
              >
                <span>Join Reunion &amp; Register Now</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            )}

            {onManageRegistrationClick && (
              <button
                type="button"
                onClick={onManageRegistrationClick}
                className="btn btn-lookup-trigger btn-block"
                id="btn-lookup-registration"
              >
                <span>🔍 Already Registered? View / Update Details</span>
              </button>
            )}

            <p className="cta-subtext">✨ Limited capacity • Family &amp; batchmates welcome ✨</p>
          </div>
        )}
      </div>
    </section>
  );
};
