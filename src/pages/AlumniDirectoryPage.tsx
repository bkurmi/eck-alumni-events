import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { AlumniProfileEditModal } from '../components/AlumniProfileEditModal';
import { SearchableSelect } from '../components/SearchableSelect';
import { supabase } from '../lib/supabase';
import { fetchAlumniDirectory } from '../lib/directory';
import { cleanMobileNumber } from '../lib/registrations';
import type { AlumniDirectoryItem } from '../types';
import { ENGINEERING_DISCIPLINES } from '../types';
import { getBatchFromPassingYear } from '../lib/batchUtils';
import {
  GraduationCap,
  User,
  Search,
  X,
  MessageCircle,
  Link2,
  Mail,
  MapPin,
  Briefcase,
  Building,
  RotateCcw,
  Loader2,
  ArrowRight,
} from 'lucide-react';

interface AlumniDirectoryPageProps {
  autoOpenProfile?: boolean;
}

export const AlumniDirectoryPage: React.FC<AlumniDirectoryPageProps> = ({ autoOpenProfile = false }) => {
  const [searchParams] = useSearchParams();
  const [alumniList, setAlumniList] = useState<AlumniDirectoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeEvent, setActiveEvent] = useState<{ event_name?: string; tagline?: string; location?: string } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('ALL');
  const [selectedCity, setSelectedCity] = useState<string>('ALL');
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');

  // Search input typeahead suggestions
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(
    autoOpenProfile || searchParams.get('profile') === 'true' || searchParams.get('edit') === 'true'
  );
  const [alumnusToEdit, setAlumnusToEdit] = useState<AlumniDirectoryItem | null>(null);

  useEffect(() => {
    if (autoOpenProfile || searchParams.get('profile') === 'true' || searchParams.get('edit') === 'true') {
      setIsEditModalOpen(true);
    }
  }, [autoOpenProfile, searchParams]);

  // Fetch directory on mount
  useEffect(() => {
    let isMounted = true;
    async function loadDirectory() {
      setIsLoading(true);
      try {
        const data = await fetchAlumniDirectory();
        if (isMounted) {
          setAlumniList(data);
        }
      } catch (err) {
        console.error('Failed to load alumni directory:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    async function loadActiveEvent() {
      try {
        const { data } = await supabase
          .from('events')
          .select('event_name, tagline, location')
          .order('event_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data && isMounted) {
          setActiveEvent(data);
        }
      } catch {
        // Non-blocking
      }
    }
    loadDirectory();
    loadActiveEvent();
    return () => {
      isMounted = false;
    };
  }, []);

  // Close search suggestions on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Extract unique cities present in data, sorted by frequency
  const availableCities = useMemo(() => {
    const cityCounts: Record<string, number> = {};
    alumniList.forEach((a) => {
      const city = a.city?.trim();
      if (city) {
        cityCounts[city] = (cityCounts[city] || 0) + 1;
      }
    });

    return Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([cityName]) => cityName);
  }, [alumniList]);

  // Extract unique batches present in data
  const availableBatches = useMemo(() => {
    const batchesMap = new Map<string, { value: string; label: string; sortKey: number }>();
    alumniList.forEach((a) => {
      const yr = Number(a.year_of_passing) || 0;
      const b = a.batch || (yr ? getBatchFromPassingYear(yr) : '');
      if (b) {
        const sortKey = (b.length === 1 && b >= 'A' && b <= 'Z')
          ? 1985 + (b.charCodeAt(0) - 65)
          : (parseInt(b, 10) || yr || 0);
        if (!batchesMap.has(b)) {
          batchesMap.set(b, {
            value: b,
            label: `Batch ${b}`,
            sortKey,
          });
        }
      }
    });
    return Array.from(batchesMap.values()).sort((a, b) => b.sortKey - a.sortKey);
  }, [alumniList]);

  // Options for Searchable Selects
  const disciplineOptions = useMemo(() => {
    return ENGINEERING_DISCIPLINES.map((d) => ({
      value: d,
      label: d,
    }));
  }, []);

  const cityOptions = useMemo(() => {
    return availableCities.map((c) => ({
      value: c,
      label: `📍 ${c}`,
    }));
  }, [availableCities]);

  const batchOptions = useMemo(() => {
    return availableBatches.map((b) => ({
      value: b.value,
      label: b.label,
    }));
  }, [availableBatches]);

  // Filtered alumni list
  const filteredAlumni = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return alumniList.filter((a) => {
      if (selectedDiscipline !== 'ALL' && a.engineering_discipline !== selectedDiscipline) {
        return false;
      }
      if (selectedCity !== 'ALL' && a.city?.toLowerCase() !== selectedCity.toLowerCase()) {
        return false;
      }
      const aBatch = a.batch || (a.year_of_passing ? getBatchFromPassingYear(a.year_of_passing) : '');
      if (selectedBatch !== 'ALL' && aBatch !== selectedBatch && String(a.year_of_passing) !== selectedBatch) {
        return false;
      }
      if (q) {
        const nameMatch = a.name.toLowerCase().includes(q);
        const orgMatch = a.organization?.toLowerCase().includes(q);
        const cityMatch = a.city?.toLowerCase().includes(q);
        const discMatch = a.engineering_discipline?.toLowerCase().includes(q);
        const workMatch = a.work_location?.toLowerCase().includes(q);
        const batchMatch = aBatch.toLowerCase().includes(q) || String(a.year_of_passing).includes(q);

        if (!nameMatch && !orgMatch && !cityMatch && !discMatch && !workMatch && !batchMatch) {
          return false;
        }
      }

      return true;
    });
  }, [alumniList, searchQuery, selectedDiscipline, selectedCity, selectedBatch]);

  // Suggestions for live typeahead
  const searchSuggestions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (q.length < 2) return [];

    return alumniList
      .filter((a) => a.name.toLowerCase().includes(q) || a.organization?.toLowerCase().includes(q))
      .slice(0, 6);
  }, [alumniList, searchQuery]);

  const handleProfileUpdated = (updatedAlumnus: AlumniDirectoryItem) => {
    setAlumniList((prev) =>
      prev.map((item) => (item.id === updatedAlumnus.id ? updatedAlumnus : item))
    );
  };

  const handleEditClick = (alumnus: AlumniDirectoryItem) => {
    setAlumnusToEdit(alumnus);
    setIsEditModalOpen(true);
  };

  const handleOpenGeneralEdit = () => {
    setAlumnusToEdit(null);
    setIsEditModalOpen(true);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedDiscipline('ALL');
    setSelectedCity('ALL');
    setSelectedBatch('ALL');
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedDiscipline !== 'ALL' ||
    selectedCity !== 'ALL' ||
    selectedBatch !== 'ALL';

  const getWhatsAppHelpLink = (alumnus: AlumniDirectoryItem) => {
    const cleanPhone = cleanMobileNumber(alumnus.mobile);
    if (!cleanPhone || cleanPhone.length < 10) return '';

    const text = `Hi ${alumnus.name}! I am an ECK alumnus reaching out via the ECK Alumni Portal. I saw that you are in ${alumnus.city || 'our alumni network'} and from the ${alumnus.engineering_discipline} branch. Would love to connect for some guidance!`;
    return `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0c16] text-slate-100 flex flex-col overflow-x-hidden selection:bg-amber-500 selection:text-slate-950">
      <Header maxWidth="max-w-3xl" />

      <main className="flex-1 w-full max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6">
        {/* Top Hero Section */}
        <section className="text-center space-y-2.5 py-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-semibold text-amber-300">
            <GraduationCap className="h-4 w-4" />
            <span>ECK Alumni Community &amp; Help Portal</span>
          </div>

          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-tight">
            Connect with Alumni across Departments &amp; Cities
          </h1>

          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
            Looking for advice moving to a new city, career guidance in your branch, or seeking batchmates?
            Browse verified alumni or open your record to keep your details and career up to date.
          </p>
        </section>

        {/* Dedicated Alumni Profile Access Card */}
        <section
          className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-slate-900/90 to-slate-900 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-xl backdrop-blur-md"
          aria-label="Alumni Profile Hub"
        >
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <User className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm sm:text-base font-bold text-white">Are you an ECK Alumnus?</h3>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                Open your personal profile to view or update your complete registration information — current organization, city, contact info, photo, and branch.
              </p>
            </div>
          </div>

          <div className="shrink-0 pt-1 sm:pt-0">
            <button
              type="button"
              className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-md shadow-amber-500/20 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
              onClick={handleOpenGeneralEdit}
            >
              <User className="h-4 w-4" />
              <span>Open My Profile</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* Filter and Search Bar Section */}
        <section className="relative z-20 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4 shadow-xl backdrop-blur-md">
          {/* Search Input with Auto-suggestion */}
          <div className="relative" ref={searchContainerRef}>
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-5 w-5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-11 pr-10 text-base text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="Search by Name, Company, Batch..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="absolute right-3 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:text-white"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Suggestions Dropdown */}
            {isSearchFocused && searchSuggestions.length > 0 && (
              <div
                className="absolute left-0 right-0 z-40 mt-1.5 max-h-60 overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-900/98 p-1.5 shadow-2xl backdrop-blur-2xl"
                role="listbox"
              >
                {searchSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-slate-800 transition-colors cursor-pointer"
                    onClick={() => {
                      setSearchQuery(item.name);
                      setIsSearchFocused(false);
                    }}
                  >
                    <span className="text-sm font-semibold text-slate-200">{item.name}</span>
                    <span className="text-xs text-slate-400">
                      Batch {item.batch || getBatchFromPassingYear(item.year_of_passing)} • {item.engineering_discipline} • {item.city}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dropdown Filters Grid with Text Search - Ordered: Batch -> Branch -> City */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SearchableSelect
              id="batch-filter"
              label="Passing Batch"
              value={selectedBatch}
              onChange={setSelectedBatch}
              options={batchOptions}
              allOptionLabel="All Batches"
              searchPlaceholder="Search batch (e.g. 2024, 2012)..."
              align="left"
            />

            <SearchableSelect
              id="dept-filter"
              label="Department / Branch"
              value={selectedDiscipline}
              onChange={setSelectedDiscipline}
              options={disciplineOptions}
              allOptionLabel="All Departments"
              searchPlaceholder="Search branch (e.g. Computer, Civil)..."
              align="left"
            />

            <SearchableSelect
              id="city-filter"
              label="City / Location"
              value={selectedCity}
              onChange={setSelectedCity}
              options={cityOptions}
              allOptionLabel={`All Cities (${availableCities.length})`}
              searchPlaceholder="Search city (e.g. Kota, Bengaluru)..."
              align="right"
            />
          </div>

          {/* Filter Summary & Reset Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 border-t border-slate-800/80 text-xs sm:text-sm text-slate-400">
            <span>
              Showing <strong className="text-amber-400">{filteredAlumni.length}</strong> alumni
              {selectedBatch !== 'ALL' && ` • Batch ${selectedBatch}`}
              {selectedDiscipline !== 'ALL' && ` • ${selectedDiscipline}`}
              {selectedCity !== 'ALL' && ` • ${selectedCity}`}
            </span>

            {hasActiveFilters && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 cursor-pointer self-start sm:self-auto"
                onClick={handleResetFilters}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>
        </section>

        {/* Alumni Cards Directory Grid */}
        <section className="relative z-10">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-amber-400">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm font-medium text-slate-300">Loading alumni directory...</p>
            </div>
          ) : filteredAlumni.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-3">
              <Search className="h-8 w-8 text-slate-500 mx-auto" />
              <h3 className="text-base font-bold text-white">No alumni found matching your criteria</h3>
              <p className="text-xs text-slate-400">Try clearing filters or search by a different name, city, or discipline.</p>
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-amber-400 hover:bg-slate-700 cursor-pointer"
                onClick={handleResetFilters}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
              {filteredAlumni.map((alumnus) => {
                const whatsAppUrl = getWhatsAppHelpLink(alumnus);
                const hasPhoto = Boolean(alumnus.resolved_photo_url || alumnus.photo_url);

                return (
                  <article
                    key={alumnus.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-4 hover:border-amber-500/30 transition-all shadow-md backdrop-blur-sm gap-3.5"
                  >
                    {/* Card Header & Avatar */}
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 shrink-0 rounded-full border-2 border-amber-500/40 bg-slate-950 overflow-hidden shadow-sm">
                        {hasPhoto ? (
                          <img
                            src={alumnus.resolved_photo_url || alumnus.photo_url || ''}
                            alt={alumnus.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-xs font-bold text-amber-400">
                            {alumnus.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <h2 className="text-sm sm:text-base font-bold text-white truncate" title={alumnus.name}>
                            {alumnus.name}
                          </h2>
                          <span
                            className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-300 shrink-0"
                            title={`Batch ${alumnus.batch || getBatchFromPassingYear(alumnus.year_of_passing)}`}
                          >
                            Batch {alumnus.batch || getBatchFromPassingYear(alumnus.year_of_passing)}
                          </span>
                        </div>

                        <div className="space-y-0.5 mt-0.5">
                          <p className="text-xs font-medium text-amber-400/90 truncate" title={alumnus.engineering_discipline}>
                            {alumnus.engineering_discipline}
                          </p>
                          {(alumnus.organization || alumnus.designation) && (
                            <p
                              className="text-xs text-slate-300 truncate flex items-center gap-1"
                              title={[alumnus.designation, alumnus.organization].filter(Boolean).join(', ')}
                            >
                              <Building className="h-3 w-3 text-slate-500 shrink-0" />
                              <span className="truncate">
                                {alumnus.designation && alumnus.organization
                                  ? `${alumnus.designation}, ${alumnus.organization}`
                                  : alumnus.organization || alumnus.designation}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Meta Tags */}
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {alumnus.year_of_passing ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-amber-300 border border-amber-500/20 font-mono text-[11px]">
                          🎓 Pass out {alumnus.year_of_passing}
                        </span>
                      ) : null}

                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-800/90 px-2 py-0.5 text-slate-300 border border-slate-700/60">
                        <MapPin className="h-3 w-3 text-amber-400" />
                        <span>{alumnus.city || 'Kota'}{alumnus.state ? `, ${alumnus.state}` : ''}</span>
                      </span>

                      {alumnus.work_location && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-800/90 px-2 py-0.5 text-slate-300 border border-slate-700/60">
                          <Briefcase className="h-3 w-3 text-blue-400" />
                          <span>{alumnus.work_location}</span>
                        </span>
                      )}

                      {alumnus.employment_type && (
                        <span className="inline-flex items-center rounded-md bg-slate-800/90 px-2 py-0.5 text-slate-300 border border-slate-700/60">
                          {alumnus.employment_type}
                        </span>
                      )}
                    </div>

                    {/* Action Buttons: Ask for Help, Email, LinkedIn, Edit */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                      {whatsAppUrl ? (
                        <a
                          href={whatsAppUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-3 py-2 text-xs font-semibold text-emerald-300 transition-colors"
                          title={`Send a courteous WhatsApp message to ${alumnus.name}`}
                        >
                          <MessageCircle className="h-4 w-4" />
                          <span>Ask Help</span>
                        </a>
                      ) : (
                        <span className="flex-1 min-h-[44px] inline-flex items-center justify-center text-xs text-slate-500 bg-slate-900 rounded-xl border border-slate-800">
                          No Phone
                        </span>
                      )}

                      {alumnus.linkedin_url && (
                        <a
                          href={alumnus.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                          title={`LinkedIn`}
                          aria-label="LinkedIn"
                        >
                          <Link2 className="h-4 w-4" />
                        </a>
                      )}

                      {alumnus.email && (
                        <a
                          href={`mailto:${alumnus.email}?subject=ECK Alumni Connection`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                          title={`Email`}
                          aria-label="Email"
                        >
                          <Mail className="h-4 w-4" />
                        </a>
                      )}

                      <button
                        type="button"
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-2 text-xs font-semibold text-amber-300 transition-colors cursor-pointer"
                        onClick={() => handleEditClick(alumnus)}
                        title="Open complete profile"
                      >
                        <User className="h-4 w-4" />
                        <span>Profile</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Footer
        eventName={activeEvent?.event_name}
        tagline={activeEvent?.tagline}
        location={activeEvent?.location}
      />

      {/* Edit Profile & Photo Modal */}
      <AlumniProfileEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        initialAlumnus={alumnusToEdit}
        onProfileUpdated={handleProfileUpdated}
        allAlumni={alumniList}
      />
    </div>
  );
};
