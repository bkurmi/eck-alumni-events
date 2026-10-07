import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface HeaderProps {
  title?: string;
  tagline?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'ECK Alumni Association',
  tagline = 'Engineering College Kota',
}) => {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <header className="site-header">
      <div className="header-container">
        <Link to="/" className="brand-link" aria-label="Home">
          <div className="brand-logo-festive">
            <span className="brand-diya-icon">🪔</span>
          </div>
          <div className="brand-text">
            <span className="brand-title">{title}</span>
            <span className="brand-subtitle">{tagline}</span>
          </div>
        </Link>

        <nav className="header-nav">
          {isAdmin ? (
            <Link to="/" className="nav-btn ghost-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span>Back to Event</span>
            </Link>
          ) : (
            <Link to="/admin" className="nav-btn admin-link" title="Organizer Admin">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span>Organizer Portal</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};
