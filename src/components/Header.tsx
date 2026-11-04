import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface EventSummary {
  id: string;
  event_name: string;
  event_slug: string;
  event_date: string;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
}

interface HeaderProps {
  title?: string;
  tagline?: string;
  currentEventSlug?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'ECK-RTU Alumni Kota Chapter',
  tagline = '“दीप जले, यादें मुस्कुराएँ।”',
  currentEventSlug,
}) => {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    async function fetchEvents() {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('id, event_name, event_slug, event_date, status')
          .order('event_date', { ascending: false });

        if (!error && data && isMounted) {
          setEvents(data as EventSummary[]);
        }
      } catch (err) {
        // Non-blocking header fetch
      }
    }
    fetchEvents();
    return () => {
      isMounted = false;
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleSelectEvent = (slug: string) => {
    setIsDropdownOpen(false);
    navigate(`/events/${slug}`);
  };

  return (
    <header className="site-header">
      <div className="header-container">
        <Link to="/" className="brand-link" aria-label="ECK-RTU Alumni Kota Chapter">
          <div className="brand-logos-cluster" title="ECK & RTU Kota">
            <img
              src="/logo-eck.png"
              alt="Engineering College Kota"
              className="brand-crest-emblem brand-crest-eck"
              width="44"
              height="44"
            />
            <img
              src="/logo-rtu.png"
              alt="Rajasthan Technical University"
              className="brand-crest-emblem brand-crest-rtu"
              width="44"
              height="44"
            />
          </div>
          <div className="brand-text">
            <span className="brand-title">{title}</span>
            <span className="brand-subtitle hindi-tagline">{tagline}</span>
          </div>
        </Link>

        <nav className="header-nav" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {events.length > 0 && (
            <div className="header-events-dropdown-wrap" ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className="nav-btn events-switcher-btn"
                title="Browse Event Editions"
                aria-expanded={isDropdownOpen}
                aria-haspopup="true"
              >
                <svg className="nav-btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="nav-btn-text">Events</span>
                <span style={{ fontSize: '0.65rem', marginLeft: '2px', opacity: 0.8 }}>▼</span>
              </button>

              {isDropdownOpen && (
                <div className="events-dropdown-menu" role="menu">
                  <div className="dropdown-menu-header">
                    <span className="dropdown-menu-title">Alumni Event Editions</span>
                  </div>
                  <div className="dropdown-menu-list">
                    {events.map((ev) => {
                      const isCurrent = currentEventSlug === ev.event_slug;
                      const eventYear = ev.event_date ? new Date(ev.event_date).getFullYear() : '';
                      const isPast = ev.status === 'CLOSED';

                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => handleSelectEvent(ev.event_slug)}
                          className={`dropdown-menu-item ${isCurrent ? 'active' : ''}`}
                          role="menuitem"
                        >
                          <div className="item-content">
                            <span className="item-name">{ev.event_name}</span>
                            <span className="item-meta">
                              {eventYear ? `${eventYear} • ` : ''}
                              <span className={`status-pill ${isPast ? 'pill-past' : 'pill-open'}`}>
                                {isPast ? 'Concluded' : 'Active'}
                              </span>
                            </span>
                          </div>
                          {isCurrent && <span className="item-active-check">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <Link to="/directory" className="nav-btn directory-link" title="Alumni Directory & Help">
            <svg className="nav-btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="nav-btn-text">Directory</span>
          </Link>

          <Link to="/profile" className="nav-btn profile-link" title="My Alumni Profile">
            <svg className="nav-btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="nav-btn-text">My Profile</span>
          </Link>

          <a href="/admin" className="nav-btn admin-link" title="Organizer Admin">
            <svg className="nav-btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span className="nav-btn-text">Admin</span>
          </a>
        </nav>
      </div>
    </header>
  );
};
