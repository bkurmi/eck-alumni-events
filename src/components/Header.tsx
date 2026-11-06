import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Calendar,
  Users,
  User,
  ShieldCheck,
  Menu,
  X,
  ChevronDown,
  Check,
} from 'lucide-react';

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
  maxWidth?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'ECK-RTU Alumni Kota Chapter',
  tagline = '“दीप जले, यादें मुस्कुराएँ।”',
  currentEventSlug,
  maxWidth = 'max-w-3xl',
}) => {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

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

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const handleSelectEvent = (slug: string) => {
    setIsDropdownOpen(false);
    setIsMobileMenuOpen(false);
    navigate(`/events/${slug}`);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-amber-500/25 bg-[#0a0c16]/95 backdrop-blur-md shadow-lg shadow-black/40">
      <div className={`mx-auto flex h-16 w-full ${maxWidth} items-center justify-between px-3 sm:px-4 gap-2 sm:gap-4`}>
        {/* Brand logo & titles */}
        <Link
          to="/"
          className="group flex shrink-0 min-w-0 items-center gap-2.5 sm:gap-3 focus:outline-none"
          aria-label="ECK-RTU Alumni Kota Chapter"
        >
          {/* Dual Crests */}
          <div className="flex shrink-0 -space-x-2 transition-transform group-hover:scale-105">
            <img
              src="/logo-eck.png"
              alt="ECK Crest"
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full border-2 border-amber-500/40 bg-slate-900 object-contain p-0.5 shadow-md shadow-amber-500/10"
              width="40"
              height="40"
            />
            <img
              src="/logo-rtu.png"
              alt="RTU Crest"
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full border-2 border-amber-400/40 bg-slate-900 object-contain p-0.5 shadow-md shadow-amber-500/10"
              width="40"
              height="40"
            />
          </div>

          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-sm sm:text-base font-bold tracking-tight text-slate-100 group-hover:text-amber-400 transition-colors whitespace-nowrap">
              {title}
            </span>
            <span className="truncate text-[11px] sm:text-xs font-medium text-amber-400/90 whitespace-nowrap">
              {tagline}
            </span>
          </div>
        </Link>

        {/* Desktop Navigation (>= 768px) */}
        <nav className="hidden md:flex items-center gap-1.5 lg:gap-3 shrink-0">
          {events.length > 0 && (
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className={`flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-all ${
                  isDropdownOpen
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                }`}
                aria-expanded={isDropdownOpen}
                aria-haspopup="true"
              >
                <Calendar className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="whitespace-nowrap">Events</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                    isDropdownOpen ? 'rotate-180 text-amber-400' : 'text-slate-400'
                  }`}
                />
              </button>

              {isDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-72 rounded-2xl border border-amber-500/30 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150 z-50"
                  role="menu"
                >
                  <div className="px-3 py-2 border-b border-slate-800">
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                      Alumni Event Editions
                    </span>
                  </div>
                  <div className="mt-1 max-h-64 space-y-1 overflow-y-auto">
                    {events.map((ev) => {
                      const isCurrent = currentEventSlug === ev.event_slug;
                      const eventYear = ev.event_date ? new Date(ev.event_date).getFullYear() : '';
                      const isPast = ev.status === 'CLOSED';

                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => handleSelectEvent(ev.event_slug)}
                          className={`flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-all ${
                            isCurrent
                              ? 'bg-amber-500/20 text-amber-300 font-semibold'
                              : 'text-slate-200 hover:bg-slate-800'
                          }`}
                          role="menuitem"
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="truncate font-medium">{ev.event_name}</span>
                            <span className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                              {eventYear && <span>{eventYear}</span>}
                              {eventYear && <span>•</span>}
                              <span
                                className={`inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-medium ${
                                  isPast
                                    ? 'bg-slate-800 text-slate-400'
                                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                }`}
                              >
                                {isPast ? 'Concluded' : 'Active'}
                              </span>
                            </span>
                          </div>
                          {isCurrent && <Check className="h-4 w-4 text-amber-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <Link
            to="/directory"
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-2 text-sm font-medium whitespace-nowrap text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors shrink-0"
          >
            <Users className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="whitespace-nowrap">Directory</span>
          </Link>

          <a
            href="/admin"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2.5 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 transition-all shadow-sm shrink-0 active:scale-95"
            title="Organizer Admin Portal"
            aria-label="Organizer Admin Portal"
          >
            <ShieldCheck className="h-5 w-5 text-amber-400 shrink-0" />
          </a>
        </nav>

        {/* Mobile Single Action: Hamburger menu button (>= 44x44px) */}
        <div className="flex items-center md:hidden">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2.5 text-slate-200 hover:text-white bg-slate-900 border border-slate-800 active:bg-slate-800 focus:outline-none"
            aria-label={isMobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5 text-amber-400" />
            ) : (
              <Menu className="h-5 w-5 text-slate-200" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation (< 768px) */}
      {isMobileMenuOpen && (
        <div className="border-t border-amber-500/20 bg-slate-950/98 px-3.5 py-4 shadow-2xl backdrop-blur-2xl md:hidden animate-in fade-in slide-in-from-top-3 duration-200 max-h-[85vh] overflow-y-auto">
          {events.length > 0 && (
            <div className="mb-4 pb-3 border-b border-slate-800/80">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 block px-2 mb-2">
                Event Editions
              </span>
              <div className="space-y-1">
                {events.map((ev) => {
                  const isCurrent = currentEventSlug === ev.event_slug;
                  const eventYear = ev.event_date ? new Date(ev.event_date).getFullYear() : '';
                  const isPast = ev.status === 'CLOSED';

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => handleSelectEvent(ev.event_slug)}
                      className={`flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                        isCurrent
                          ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30'
                          : 'text-slate-300 active:bg-slate-900'
                      }`}
                    >
                      <span className="truncate">{ev.event_name}</span>
                      <span className="text-xs text-slate-400 shrink-0 ml-2">
                        {eventYear} • {isPast ? 'Concluded' : 'Active'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <nav className="flex flex-col gap-2">
            <Link
              to="/directory"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-base font-medium text-slate-200 active:bg-slate-800 active:text-amber-400 transition-colors"
            >
              <Users className="h-5 w-5 text-amber-400 shrink-0" />
              <span>Alumni Directory</span>
            </Link>

            <Link
              to="/profile"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-base font-medium text-slate-200 active:bg-slate-800 active:text-amber-400 transition-colors"
            >
              <User className="h-5 w-5 text-amber-400 shrink-0" />
              <span>My Alumni Profile</span>
            </Link>

            <a
              href="/admin"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-base font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 active:bg-amber-500/20 transition-all mt-1"
            >
              <ShieldCheck className="h-5 w-5 text-amber-400 shrink-0" />
              <span>Organizer Admin Portal</span>
            </a>
          </nav>
        </div>
      )}
    </header>
  );
};
