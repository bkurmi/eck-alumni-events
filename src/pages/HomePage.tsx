import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { supabase } from '../lib/supabase';
import { isEventConcluded } from '../lib/eventStatus';
import type { ECKEvent } from '../types';
import {
  Users,
  Calendar,
  GraduationCap,
  MapPin,
  Clock,
  ArrowRight,
  HeartHandshake,
  Building2,
  Compass,
  Award,
  BookOpen,
  Search,
  MessageSquare,
  Globe2,
  Loader2,
  X,
} from 'lucide-react';

interface CommitteeMember {
  name: string;
  batchLetter: string;
  branch: string;
}

const KOTA_CHAPTER_COMMITTEE: CommitteeMember[] = [
  { name: 'Mukesh Singh', batchLetter: 'J', branch: 'Mech' },
  { name: 'Hari Narayan Shukla', batchLetter: 'K', branch: 'ECE' },
  { name: 'Manoj Paliwal', batchLetter: 'L', branch: 'Mech' },
  { name: 'Rajiv Varshney', batchLetter: 'P', branch: 'ECE' },
  { name: 'Chetan Sharma', batchLetter: 'U', branch: 'ECE' },
  { name: 'Sanjay Verma', batchLetter: 'V', branch: 'Inst.' },
  { name: 'Vijeshwar Vishnoi', batchLetter: 'V', branch: 'Electrical' },
  { name: 'Lokesh Gautam', batchLetter: 'W', branch: 'Electrical' },
  { name: 'Bhawesh Kurmi', batchLetter: 'X', branch: 'IT' },
  { name: 'Pankaj Parashar', batchLetter: 'Z', branch: 'Civil' },
  { name: 'Shailendra Singh', batchLetter: 'Z', branch: 'Civil' },
  { name: 'Mitesh Nagar', batchLetter: 'Z', branch: 'Civil' },
];

export const HomePage: React.FC = () => {
  const location = useLocation();

  const [events, setEvents] = useState<ECKEvent[]>([]);
  const [alumniCount, setAlumniCount] = useState<number | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [eventFilter, setEventFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [isCommitteeModalOpen, setIsCommitteeModalOpen] = useState(false);

  // Close committee modal on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsCommitteeModalOpen(false);
      }
    }
    if (isCommitteeModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCommitteeModalOpen]);

  // Fetch events and alumni directory count from Supabase
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setIsLoadingEvents(true);
        // 1. Fetch all events ordered by event_date descending
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('*')
          .order('event_date', { ascending: false });

        if (!eventsError && eventsData && isMounted) {
          setEvents(eventsData as ECKEvent[]);
        }

        // 2. Fetch total verified alumni count for social proof
        const { count, error: countError } = await supabase
          .from('alumni')
          .select('*', { count: 'exact', head: true });

        if (!countError && count !== null && isMounted) {
          setAlumniCount(count);
        }
      } catch (err) {
        console.error('Error loading homepage data:', err);
      } finally {
        if (isMounted) {
          setIsLoadingEvents(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle hash scrolling (e.g. /#events or /#about-eck)
  useEffect(() => {
    if (location.hash) {
      const targetId = location.hash.replace('#', '');
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [location.hash, isLoadingEvents]);

  // Separate events into upcoming and past dynamically
  const { upcomingEvents, pastEvents } = useMemo(() => {
    const upcoming: ECKEvent[] = [];
    const past: ECKEvent[] = [];

    events.forEach((ev) => {
      if (isEventConcluded(ev) || ev.status === 'COMPLETED') {
        past.push(ev);
      } else {
        upcoming.push(ev);
      }
    });

    return { upcomingEvents: upcoming, pastEvents: past };
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (eventFilter === 'upcoming') return upcomingEvents;
    if (eventFilter === 'past') return pastEvents;
    return events;
  }, [eventFilter, events, upcomingEvents, pastEvents]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#080c18] text-slate-100 flex flex-col overflow-x-hidden selection:bg-amber-500 selection:text-slate-950">
      {/* Top Header - Unified max-w-3xl width */}
      <Header maxWidth="max-w-3xl" />

      {/* Main Container - 100% Consistent max-w-3xl width matching EventPage & Directory */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-10 sm:space-y-14">
        {/* =========================================================
            1. HERO SECTION – WELCOMING, COLLEGIATE & NOSTALGIC
           ========================================================= */}
        <section className="relative w-full rounded-3xl border border-slate-800/80 bg-gradient-to-b from-[#0e162c] via-[#0a0f20] to-[#080c18] p-5 sm:p-8 text-center overflow-hidden shadow-2xl">
          {/* Subtle architectural ambient lights */}
          <div
            className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-blue-600/10 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative mx-auto flex flex-col items-center">
            {/* Dual Seals + Kota Chapter Badge */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 mb-5">
              <div className="flex items-center -space-x-2">
                <img
                  src="/logo-eck.png"
                  alt="ECK Crest"
                  className="h-11 w-11 sm:h-13 sm:w-13 rounded-full border-2 border-amber-400/90 bg-slate-900 object-contain p-0.5 shadow-lg shadow-amber-500/15"
                  width="52"
                  height="52"
                />
                <img
                  src="/logo-rtu.png"
                  alt="RTU Crest"
                  className="h-11 w-11 sm:h-13 sm:w-13 rounded-full border-2 border-blue-400/90 bg-slate-900 object-contain p-0.5 shadow-lg shadow-blue-500/15"
                  width="52"
                  height="52"
                />
              </div>

              <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                ECK-RTU Alumni • Kota Chapter
              </div>
            </div>

            {/* Main Portal Title */}
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
              ECK-RTU{' '}
              <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                Alumni Association
              </span>
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm md:text-base font-semibold text-slate-300">
              Engineering College Kota <span className="text-slate-400 font-normal">(Now Rajasthan Technical University, Kota)</span>
            </p>

            {/* Official Universal Tagline */}
            <div className="mt-3.5 inline-block rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-blue-500/10 to-amber-500/15 px-3.5 sm:px-5 py-2 shadow-md">
              <p className="text-sm sm:text-xl font-extrabold tracking-wide text-amber-300 font-serif">
                “One College. Many Generations. One Alumni Family.”
              </p>
            </div>

            {/* Clear Context Paragraph */}
            <p className="mt-4 text-xs sm:text-sm md:text-base text-slate-300 leading-relaxed max-w-2xl">
              The official digital home for all graduates of <strong>Engineering College Kota (now Rajasthan Technical University — ECK-RTU)</strong>.
              Initiated, managed, and voluntarily maintained by the <strong>Kota Chapter</strong>, this platform
              preserves four decades of heritage, connects alumni across all batches (from pioneer 1981 batches to RTU graduates), and unites our global community.
            </p>

            {/* Hero Quick Navigation CTAs */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 w-full max-w-md">
              <Link
                to="/directory"
                className="flex-1 min-w-[170px] min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-950 transition-all hover:bg-amber-400 active:scale-98 shadow-md shadow-amber-500/20 cursor-pointer"
              >
                <Users className="h-4 w-4 shrink-0" />
                <span>Alumni Directory</span>
              </Link>

              <button
                type="button"
                onClick={() => scrollToSection('events-section')}
                className="flex-1 min-w-[170px] min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/90 px-4 py-2.5 text-xs sm:text-sm font-bold text-white transition-all hover:border-amber-500/60 hover:bg-slate-700 active:scale-98 cursor-pointer"
              >
                <Calendar className="h-4 w-4 shrink-0 text-amber-400" />
                <span>Explore Events</span>
              </button>
            </div>

            {/* Sub-link for profile update */}
            <div className="mt-3.5 flex items-center gap-2 text-[11px] sm:text-xs text-slate-400">
              <Link
                to="/profile"
                className="inline-flex min-h-[44px] items-center gap-1.5 text-amber-400 hover:text-amber-300 font-medium underline underline-offset-4"
              >
                <span>Are you an ECK-RTU graduate? Update your alumni profile</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Credibility & Institution Stats Bar */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full border-t border-slate-800/80 pt-6">
              <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5 sm:p-3 text-center">
                <div className="text-lg sm:text-xl font-black text-amber-400">1981</div>
                <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Foundation Year</div>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5 sm:p-3 text-center">
                <div className="text-lg sm:text-xl font-black text-blue-400">40+</div>
                <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Graduating Batches</div>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5 sm:p-3 text-center">
                <div className="text-lg sm:text-xl font-black text-emerald-400">
                  {alumniCount !== null ? `${alumniCount}+` : '500+'}
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Verified Alumni</div>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5 sm:p-3 text-center">
                <div className="text-lg sm:text-xl font-black text-purple-400">100%</div>
                <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Alumni Managed</div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            2. THE 3 CORE PILLARS (OUR LEGACY • OUR PEOPLE • OUR MEMORIES)
           ========================================================= */}
        <section className="w-full">
          <div className="text-center mb-6">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-400">
              Our Foundations
            </span>
            <h2 className="text-xl sm:text-3xl font-black text-white mt-0.5">
              The Three Pillars of Our Community
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              An enduring sanctuary for the ECK-RTU fraternity.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Pillar 1: Our Legacy */}
            <div className="rounded-2xl border border-slate-800 bg-[#0c1224] p-4 sm:p-5 flex flex-col justify-between hover:border-amber-500/40 transition-all shadow-md">
              <div>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
                    <Building2 className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white">1. Our Legacy</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Four decades of engineering excellence on the Chambal banks, evolving from 1981 into RTU.
                </p>
              </div>
              <button
                type="button"
                onClick={() => scrollToSection('about-eck')}
                className="mt-4 flex min-h-[44px] items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                <span>Read History</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Pillar 2: Our People */}
            <div className="rounded-2xl border border-slate-800 bg-[#0c1224] p-4 sm:p-5 flex flex-col justify-between hover:border-blue-500/40 transition-all shadow-md">
              <div>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-400 shrink-0">
                    <Users className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white">2. Our People</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Connecting graduates across all batches, branches, and professions worldwide.
                </p>
              </div>
              <Link
                to="/directory"
                className="mt-4 flex min-h-[44px] items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300"
              >
                <span>Directory</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Pillar 3: Our Memories & Events */}
            <div className="rounded-2xl border border-slate-800 bg-[#0c1224] p-4 sm:p-5 flex flex-col justify-between hover:border-emerald-500/40 transition-all shadow-md">
              <div>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
                    <Calendar className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white">3. Memories & Events</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Bringing alumni together through annual reunions, chapter meets, and memory archives.
                </p>
              </div>
              <button
                type="button"
                onClick={() => scrollToSection('events-section')}
                className="mt-4 flex min-h-[44px] items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                <span>View Events</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* =========================================================
            3. HOMEPAGE NAVIGATION DIRECTORY (THE USER'S NAVIGATION TABLE)
           ========================================================= */}
        <section className="w-full rounded-3xl border border-slate-800 bg-[#0a0f1e] p-5 sm:p-7">
          <div className="text-center mb-6">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-400">
              Quick Navigation
            </span>
            <h2 className="text-xl sm:text-3xl font-black text-white mt-0.5">
              Explore the Alumni Platform
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Direct pathways to every key feature of the community.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Gateway 1: About ECK */}
            <div
              onClick={() => scrollToSection('about-eck')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  scrollToSection('about-eck');
                }
              }}
              className="group rounded-2xl border border-slate-800 bg-[#0e1428] p-4 sm:p-5 transition-all hover:border-amber-500/50 hover:bg-[#121a35] hover:-translate-y-0.5 shadow-md cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                      <Building2 className="h-4.5 w-4.5" />
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-amber-400 transition-colors">
                      About ECK-RTU
                    </h3>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                    Legacy
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Foundation history, four decades of milestones, and the academic journey from Engineering College Kota to RTU.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-amber-400">
                <span>Explore History</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </div>

            {/* Gateway 2: Alumni Directory */}
            <Link
              to="/directory"
              className="group rounded-2xl border border-slate-800 bg-[#0e1428] p-4 sm:p-5 transition-all hover:border-blue-500/50 hover:bg-[#121a35] hover:-translate-y-0.5 shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                      <GraduationCap className="h-4.5 w-4.5" />
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                      Alumni Directory
                    </h3>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                    Network
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Discover and connect with verified alumni across batches (1985–present), branches, and global cities.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-blue-400">
                <span>Open Directory</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>

            {/* Gateway 3: Upcoming Events */}
            <div
              onClick={() => {
                setEventFilter('upcoming');
                scrollToSection('events-section');
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setEventFilter('upcoming');
                  scrollToSection('events-section');
                }
              }}
              className="group rounded-2xl border border-slate-800 bg-[#0e1428] p-4 sm:p-5 transition-all hover:border-emerald-500/50 hover:bg-[#121a35] hover:-translate-y-0.5 shadow-md cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <Calendar className="h-4.5 w-4.5" />
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-emerald-400 transition-colors">
                      Upcoming Events
                    </h3>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                    Reunions
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Explore upcoming get-togethers, chapter meets, celebrations, and register your participation.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-emerald-400">
                <span>View Upcoming</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </div>

            {/* Gateway 4: Past Events */}
            <div
              onClick={() => {
                setEventFilter('past');
                scrollToSection('events-section');
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setEventFilter('past');
                  scrollToSection('events-section');
                }
              }}
              className="group rounded-2xl border border-slate-800 bg-[#0e1428] p-4 sm:p-5 transition-all hover:border-purple-500/50 hover:bg-[#121a35] hover:-translate-y-0.5 shadow-md cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-9 w-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                      <Clock className="h-4.5 w-4.5" />
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-purple-400 transition-colors">
                      Past Events
                    </h3>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                    Recaps
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Relive memories, read event recaps, review attendances, and celebrate our gatherings.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-purple-400">
                <span>Explore Archives</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </div>

            {/* Gateway 5: Alumni Profile */}
            <Link
              to="/profile"
              className="group rounded-2xl border border-slate-800 bg-[#0e1428] p-4 sm:p-5 transition-all hover:border-amber-500/50 hover:bg-[#121a35] hover:-translate-y-0.5 shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                      <Users className="h-4.5 w-4.5" />
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-amber-400 transition-colors">
                      Alumni Profile
                    </h3>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                    Profile
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Update your current city, designation, and contact details so batchmates can easily find you.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-amber-400">
                <span>Update Profile</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>

            {/* Gateway 6: About Kota Chapter */}
            <div
              onClick={() => scrollToSection('about-chapter')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  scrollToSection('about-chapter');
                }
              }}
              className="group rounded-2xl border border-slate-800 bg-[#0e1428] p-4 sm:p-5 transition-all hover:border-teal-500/50 hover:bg-[#121a35] hover:-translate-y-0.5 shadow-md cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-9 w-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
                      <HeartHandshake className="h-4.5 w-4.5" />
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-teal-400 transition-colors">
                      Kota Chapter
                    </h3>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                    Team
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Learn about the dedicated volunteer team based in Kota who actively organize meets and sustain this platform.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-teal-400">
                <span>Meet Chapter Team</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            4. SECTION 1: ABOUT THE COLLEGE (ECK / RTU LEGACY)
           ========================================================= */}
        <section id="about-eck" className="w-full scroll-mt-20">
          <div className="rounded-3xl border border-slate-800 bg-[#0d1326] p-5 sm:p-7 shadow-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 mb-3">
              <BookOpen className="h-3.5 w-3.5" />
              1. About the College
            </span>
            <h2 className="text-xl sm:text-3xl font-black text-white leading-tight">
              Engineering College Kota & RTU (ECK-RTU)
            </h2>
            <p className="text-xs sm:text-sm font-medium text-amber-400/90 mt-1">
              From Engineering College Kota (1981) to Rajasthan Technical University • Four Decades on the Banks of Chambal
            </p>

            <div className="mt-4 space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
              <p>
                Established in <strong>1981</strong> as <strong>Engineering College Kota (ECK)</strong>, the campus was founded with the mission to
                deliver world-class engineering education in Rajasthan. Situated near the historic Chambal River in
                Kota, it quickly became a cradle of innovation, technical rigor, and spirited student camaraderie.
              </p>
              <p>
                In <strong>2006</strong>, the institution evolved into the apex university campus of <strong>Rajasthan Technical University (RTU)</strong>.
                Over four decades, it has nurtured generations of engineers who have spearheaded technological breakthroughs, founded leading
                enterprises, served in top civil administration, and held senior leadership positions across the globe.
              </p>
              <p className="text-amber-300/90 font-medium">
                Whether you graduated when it was known as ECK or as RTU, we all share the exact same campus, the same memories, and one united
                alumni family under the <strong>ECK-RTU Alumni Kota Chapter</strong>.
              </p>
            </div>

            {/* Milestones Horizontal Grid */}
            <div className="mt-6 pt-5 border-t border-slate-800/80">
              <h3 className="text-xs sm:text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-400" />
                Institutional Milestones
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
                  <span className="font-bold text-amber-400">1981</span>
                  <p className="text-[11px] text-slate-300 mt-0.5">Foundation of ECK Kota</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
                  <span className="font-bold text-amber-400">1985</span>
                  <p className="text-[11px] text-slate-300 mt-0.5">First pioneer batch graduates</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
                  <span className="font-bold text-amber-400">2006</span>
                  <p className="text-[11px] text-slate-300 mt-0.5">Transition into RTU campus</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
                  <span className="font-bold text-amber-400">Today</span>
                  <p className="text-[11px] text-slate-300 mt-0.5">40+ unified batches worldwide</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            5. SECTION 2 & 3: PURPOSE OF WEBSITE & ABOUT THE COMMUNITY
           ========================================================= */}
        <section className="w-full">
          <div className="text-center mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300 mb-2">
              <Compass className="h-3.5 w-3.5" />
              2. Community & Purpose
            </span>
            <h2 className="text-xl sm:text-3xl font-black text-white mt-0.5">
              Purpose of This Website
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl mx-auto leading-relaxed">
              Initiated, managed, and maintained voluntarily by the alumni members of the <strong>ECK-RTU Alumni Kota Chapter</strong>.
            </p>
          </div>

          {/* 5 Purpose Cards with icon and title on same line */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Point 1 */}
            <div className="rounded-2xl border border-slate-800 bg-[#0d1428] p-4 sm:p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-8 w-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                    <Search className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Alumni Directory</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Discover and connect with fellow alumni across different batches, engineering branches, and professional backgrounds.
                </p>
              </div>
              <Link
                to="/directory"
                className="mt-3.5 flex min-h-[44px] items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300"
              >
                <span>Search Directory →</span>
              </Link>
            </div>

            {/* Point 2 */}
            <div className="rounded-2xl border border-slate-800 bg-[#0d1428] p-4 sm:p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Upcoming Events</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Explore upcoming reunions, chapter get-togethers, celebrations, and community activities with seamless participation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEventFilter('upcoming');
                  scrollToSection('events-section');
                }}
                className="mt-3.5 flex min-h-[44px] items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                <span>Explore Upcoming →</span>
              </button>
            </div>

            {/* Point 3 */}
            <div className="rounded-2xl border border-slate-800 bg-[#0d1428] p-4 sm:p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-8 w-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                    <Clock className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Past Events</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Relive cherished moments through event highlights, photographs, videos, recap statistics, and personal experiences.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEventFilter('past');
                  scrollToSection('events-section');
                }}
                className="mt-3.5 flex min-h-[44px] items-center gap-1 text-xs font-semibold text-purple-400 hover:text-purple-300 cursor-pointer"
              >
                <span>Relive Past Events →</span>
              </button>
            </div>

            {/* Point 4 */}
            <div className="rounded-2xl border border-slate-800 bg-[#0d1428] p-4 sm:p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-8 w-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Community Engagement</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Stay informed about alumni initiatives, announcements, welfare measures, and chapter developments in Kota.
                </p>
              </div>
              <button
                type="button"
                onClick={() => scrollToSection('about-chapter')}
                className="mt-3.5 flex min-h-[44px] items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                <span>Learn About Chapter →</span>
              </button>
            </div>

            {/* Point 5 */}
            <div className="rounded-2xl border border-slate-800 bg-[#0d1428] p-4 sm:p-5 flex flex-col justify-between sm:col-span-2">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-8 w-8 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
                    <Globe2 className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Stay Connected for Life</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Strengthen relationships and maintain meaningful connections far beyond college life—mentoring students,
                  collaborating professionally, or catching up during festive visits to Kota.
                </p>
              </div>
              <Link
                to="/profile"
                className="mt-3.5 flex min-h-[44px] items-center gap-1 text-xs font-semibold text-teal-400 hover:text-teal-300"
              >
                <span>Update Your Profile & Connect with Batchmates →</span>
              </Link>
            </div>
          </div>
        </section>

        {/* =========================================================
            6. DYNAMIC EVENTS HUB (UPCOMING & PAST)
           ========================================================= */}
        <section id="events-section" className="w-full scroll-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
            <div>
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-400">
                Gatherings & Celebrations
              </span>
              <h2 className="text-xl sm:text-3xl font-black text-white mt-0.5">
                Alumni Events & Reunions
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Explore upcoming reunions, festival get-togethers, and past event archives.
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setEventFilter('all')}
                className={`min-h-[44px] px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${eventFilter === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
                  }`}
              >
                All ({events.length})
              </button>
              <button
                type="button"
                onClick={() => setEventFilter('upcoming')}
                className={`min-h-[44px] px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${eventFilter === 'upcoming'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
                  }`}
              >
                Upcoming ({upcomingEvents.length})
              </button>
              <button
                type="button"
                onClick={() => setEventFilter('past')}
                className={`min-h-[44px] px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${eventFilter === 'past'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
                  }`}
              >
                Past ({pastEvents.length})
              </button>
            </div>
          </div>

          {/* Events List */}
          {isLoadingEvents ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin text-amber-400" />
              <p className="text-xs sm:text-sm">Loading events...</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-[#0e1428] p-6 sm:p-8 text-center max-w-sm mx-auto">
              <Calendar className="h-10 w-10 text-slate-600 mx-auto mb-2" />
              <h3 className="text-base font-bold text-white">No Events Found</h3>
              <p className="text-xs text-slate-400 mt-1">
                {eventFilter === 'upcoming'
                  ? 'There are currently no active upcoming events open for registration.'
                  : 'No events found under this filter.'}
              </p>
              <button
                type="button"
                onClick={() => setEventFilter('all')}
                className="mt-3 min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold"
              >
                View All Events
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredEvents.map((ev) => {
                const isConcluded = isEventConcluded(ev) || ev.status === 'COMPLETED';
                const formattedDate = ev.event_date
                  ? new Date(ev.event_date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                  : 'Date TBA';

                return (
                  <div
                    key={ev.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#0d1428] overflow-hidden transition-all hover:border-amber-500/50 hover:shadow-xl hover:shadow-black/60"
                  >
                    {/* Event Banner */}
                    <div className="relative h-40 w-full bg-slate-900 overflow-hidden">
                      {ev.banner_image_url ? (
                        <img
                          src={ev.banner_image_url}
                          alt={ev.event_name}
                          className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-slate-900 to-[#121936]">
                          <Calendar className="h-8 w-8 text-amber-500/40 mb-1" />
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            {ev.short_name || 'ECK Alumni Gathering'}
                          </span>
                        </div>
                      )}

                      {/* Status Tag */}
                      <div className="absolute top-2.5 right-2.5">
                        {isConcluded ? (
                          <span className="rounded-full bg-slate-900/90 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-bold text-slate-300 border border-slate-700">
                            Concluded
                          </span>
                        ) : ev.status === 'OPEN' ? (
                          <span className="rounded-full bg-emerald-500/90 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-bold text-slate-950 border border-emerald-400 shadow-sm">
                            ● Open
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-500/90 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-bold text-slate-950 border border-amber-400">
                            {ev.status}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Event Content */}
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="text-base font-bold text-white leading-snug line-clamp-2">
                          {ev.event_name}
                        </h3>

                        {ev.tagline && (
                          <p className="text-xs text-amber-400 font-medium italic mt-1 line-clamp-1">
                            {ev.tagline}
                          </p>
                        )}

                        <div className="mt-3 space-y-1.5 text-xs text-slate-300">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span>{formattedDate}</span>
                          </div>
                          {ev.event_time && (
                            <div className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                              <span className="truncate">{ev.event_time}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span className="truncate">{ev.location}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="mt-4 pt-3 border-t border-slate-800/80">
                        <Link
                          to={`/events/${ev.event_slug}`}
                          className={`w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${isConcluded
                            ? 'border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                            : 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-sm'
                            }`}
                        >
                          <span>{isConcluded ? 'View Recap & Memories' : 'View Event & Register'}</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* =========================================================
            7. SECTION 6: ABOUT KOTA CHAPTER & STEWARDSHIP
           ========================================================= */}
        <section id="about-chapter" className="w-full scroll-mt-20">
          <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-[#0c1328] via-[#0f1730] to-[#0a0f20] p-5 sm:p-7 shadow-2xl relative overflow-hidden">
            <div
              className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl"
              aria-hidden="true"
            />

            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300 mb-2.5">
                <HeartHandshake className="h-3.5 w-3.5" />
                About Kota Chapter
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                Initiated & Maintained by the ECK-RTU Alumni Kota Chapter
              </h2>
              <p className="text-xs sm:text-sm text-amber-400/90 font-medium mt-0.5">
                Local Heart • Global Alumni Family
              </p>

              <div className="mt-3.5 space-y-2.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
                <p>
                  While ECK and RTU graduates are making waves across the world, our home base in Kota remains the heartbeat of the fraternity.
                  The <strong>ECK-RTU Alumni Kota Chapter</strong> is an active team of local alumni volunteers dedicated to:
                </p>
                <ul className="space-y-1.5 pl-4 list-disc marker:text-amber-400">
                  <li>Organizing annual chapter reunions, festival meets, and batch get-togethers in Kota.</li>
                  <li>Maintaining this open, non-profit digital home without commercial intermediaries or ticket markup.</li>
                  <li>Providing a warm welcoming anchor for visiting alumni traveling to Kota for family, nostalgia, or business.</li>
                  <li>Fostering mentorship and support between senior alumni and students at the RTU campus.</li>
                </ul>
              </div>

              {/* View Working Committee Button */}
              <div className="mt-6 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCommitteeModalOpen(true)}
                  className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs sm:text-sm font-bold text-slate-950 hover:bg-amber-400 active:scale-98 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                >
                  <Users className="h-4 w-4" />
                  <span>View Working Committee</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Kota Chapter Working Committee Modal */}
      {isCommitteeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsCommitteeModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#0e1428] border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-2xl relative text-slate-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="committee-modal-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
                  <Users className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 id="committee-modal-title" className="text-base sm:text-lg font-bold text-white leading-tight">
                    Working Committee
                  </h3>
                  <p className="text-[11px] sm:text-xs text-amber-400/90 font-medium">
                    ECK-RTU Alumni Kota Chapter • {KOTA_CHAPTER_COMMITTEE.length} Members
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCommitteeModalOpen(false)}
                className="min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors flex items-center justify-center cursor-pointer"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Committee Members List */}
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {KOTA_CHAPTER_COMMITTEE.map((member) => (
                <div
                  key={`${member.name}-${member.batchLetter}`}
                  className="flex items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-800/90 bg-slate-900/80 hover:border-amber-500/30 transition-colors"
                >
                  {/* Left: Avatar + Name + Crisp Batch Pill */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-500/20 to-blue-500/20 border border-amber-500/30 flex items-center justify-center text-xs font-bold text-amber-300 shrink-0 shadow-sm">
                      {member.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white truncate leading-snug">
                        {member.name}
                      </div>
                      {/* Uniform Batch Pill */}
                      <div className="mt-1 flex items-center">
                        <span className="inline-flex items-center rounded-md bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-bold text-amber-300 shadow-sm">
                          Batch {member.batchLetter}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Abbreviated Branch Badge */}
                  <div className="shrink-0 text-right">
                    <span
                      className="inline-block text-[11px] sm:text-xs font-semibold text-slate-300 rounded-lg bg-slate-800/90 border border-slate-700/70 px-2.5 py-1"
                    >
                      {member.branch}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Close footer button */}
            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsCommitteeModalOpen(false)}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Generic Footer with identical max-w-3xl constraint */}
      <Footer />
    </div>
  );
};
