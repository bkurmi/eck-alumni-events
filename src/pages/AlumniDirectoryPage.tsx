import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { AlumniProfileEditModal } from '../components/AlumniProfileEditModal';
import { SearchableSelect } from '../components/SearchableSelect';
import { fetchAlumniDirectory, lookupAlumniByMobile } from '../lib/directory';
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
  ShieldCheck,
  UserPlus,
} from 'lucide-react';

interface AlumniDirectoryPageProps {
  autoOpenProfile?: boolean;
}

const getAttendeeInitials = (name?: string): string => {
  if (!name) return 'AL';
  const clean = name.trim().replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?|er\.?)\s+/i, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || 'AL';
};

const formatBatchLabel = (b: string): string => {
  const trimmed = b.trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase().startsWith('batch') ? trimmed : `Batch ${trimmed}`;
};

interface AlumniCardProps {
  alumnus: AlumniDirectoryItem;
  whatsAppUrl: string;
  onEdit: (alumnus: AlumniDirectoryItem) => void;
  onAskHelp: (alumnus: AlumniDirectoryItem, whatsAppUrl: string) => void;
}

const AlumniCard: React.FC<AlumniCardProps> = ({ alumnus, whatsAppUrl, onEdit, onAskHelp }) => {
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const photoUrl = alumnus.resolved_photo_url || alumnus.photo_url;
  const hasPhoto = Boolean(photoUrl) && !photoLoadFailed;
  const rawBatch = alumnus.batch || (alumnus.year_of_passing ? getBatchFromPassingYear(alumnus.year_of_passing) : '');
  const batchLabel = rawBatch ? formatBatchLabel(rawBatch) : '';

  useEffect(() => {
    setPhotoLoadFailed(false);
  }, [photoUrl]);

  return (
    <article className="h-[160px] sm:h-[168px] rounded-2xl border border-slate-800 bg-slate-900/80 p-3 sm:p-3.5 hover:border-amber-500/30 transition-all shadow-md backdrop-blur-sm group flex flex-col justify-between overflow-hidden">
      <div className="flex items-stretch gap-3 sm:gap-3.5 h-full min-w-0">
        {/* Left Column: True 3:4 portrait photo (reduced width for sleek ID look) + compact Ask Help button */}
        <div className="w-20 sm:w-[84px] shrink-0 flex flex-col justify-between h-full gap-1.5">
          <div className="w-full flex-1 min-h-0 rounded-xl overflow-hidden border border-amber-500/30 bg-slate-950 flex items-center justify-center shadow-md relative">
            {hasPhoto ? (
              <img
                src={photoUrl || ''}
                alt={alumnus.name}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                onError={() => setPhotoLoadFailed(true)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-1.5 text-center w-full h-full bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 select-none">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-800 border border-amber-500/40 flex items-center justify-center text-xs font-bold text-amber-300 shadow-inner">
                  {getAttendeeInitials(alumnus.name)}
                </div>
                <span className="text-[8px] sm:text-[9px] font-mono mt-0.5 text-amber-400/80 font-bold tracking-wider">ALUMNI</span>
              </div>
            )}
          </div>

          {/* Compact Ask Help Button flush at bottom */}
          {whatsAppUrl ? (
            <button
              type="button"
              onClick={() => onAskHelp(alumnus, whatsAppUrl)}
              className="w-full h-[26px] sm:h-[28px] inline-flex items-center justify-center gap-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-1 text-[10px] sm:text-[11px] font-semibold text-emerald-300 transition-colors shadow-sm shrink-0 cursor-pointer active:scale-98"
              title={`Send WhatsApp message to ${alumnus.name}`}
            >
              <MessageCircle className="h-3 w-3 shrink-0" />
              <span>Ask Help</span>
            </button>
          ) : (
            <span className="w-full h-[26px] sm:h-[28px] inline-flex items-center justify-center text-[10px] text-slate-500 bg-slate-950/60 rounded-md border border-slate-800/80 px-1 text-center shrink-0">
              No Phone
            </span>
          )}
        </div>

        {/* Right Column: Key Details with expanded room so names do not truncate */}
        <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
          <div className="space-y-0.5 min-w-0">
            {/* Header: Name, LinkedIn / Email, and Compact Batch Badge */}
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <h2
                className="text-sm sm:text-base font-bold text-white leading-tight truncate cursor-pointer hover:text-amber-300 transition-colors"
                title={`${alumnus.name} (Click to view profile)`}
                onClick={() => onEdit(alumnus)}
              >
                {alumnus.name}
              </h2>

              <div className="flex items-center gap-1 shrink-0">
                {alumnus.linkedin_url && (
                  <a
                    href={alumnus.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-5 w-5 sm:h-5.5 sm:w-5.5 items-center justify-center rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                    title="LinkedIn"
                    aria-label="LinkedIn"
                  >
                    <Link2 className="h-3 w-3" />
                  </a>
                )}

                {alumnus.email && (
                  <a
                    href={`mailto:${alumnus.email}?subject=ECK Alumni Connection`}
                    className="flex h-5 w-5 sm:h-5.5 sm:w-5.5 items-center justify-center rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                    title="Email"
                    aria-label="Email"
                  >
                    <Mail className="h-3 w-3" />
                  </a>
                )}

                {batchLabel && (
                  <span
                    className="inline-flex items-center justify-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-amber-300 shrink-0 shadow-sm"
                    title={batchLabel}
                  >
                    {batchLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Discipline / Branch */}
            <p className="text-xs font-semibold text-amber-400/90 truncate leading-snug" title={alumnus.engineering_discipline || 'Alumni'}>
              {alumnus.engineering_discipline || 'Engineering'}
            </p>

            {/* Organization / Designation (Fixed slot keeps all rows aligned across cards) */}
            <div className="h-4 sm:h-4.5 flex items-center min-w-0">
              {alumnus.organization || alumnus.designation ? (
                <p
                  className="text-xs text-slate-300 truncate flex items-center gap-1.5 min-w-0"
                  title={[alumnus.designation, alumnus.organization].filter(Boolean).join(', ')}
                >
                  <Building className="h-3 w-3 text-slate-500 shrink-0" />
                  <span className="truncate">
                    {alumnus.designation && alumnus.organization
                      ? `${alumnus.designation}, ${alumnus.organization}`
                      : alumnus.organization || alumnus.designation}
                  </span>
                </p>
              ) : (
                <span className="text-[11px] text-slate-600/50 flex items-center gap-1 truncate select-none">
                  <Building className="h-3 w-3 text-slate-700/50 shrink-0" />
                  <span>ECK Alumnus</span>
                </span>
              )}
            </div>
          </div>

          {/* Quick Meta Tags */}
          <div className="flex flex-wrap items-center gap-1 text-[10px] sm:text-[11px] pt-1 overflow-hidden max-h-[48px]">
            {alumnus.year_of_passing ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-amber-300 border border-amber-500/20 font-mono shrink-0">
                🎓 Pass out {alumnus.year_of_passing}
              </span>
            ) : null}

            {(alumnus.city || alumnus.state) && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-800/90 px-1.5 py-0.5 text-slate-300 border border-slate-700/60 max-w-full truncate">
                <MapPin className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                <span className="truncate">{alumnus.city || 'Kota'}{alumnus.state ? `, ${alumnus.state}` : ''}</span>
              </span>
            )}

            {alumnus.work_location && alumnus.work_location !== alumnus.city && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-800/90 px-1.5 py-0.5 text-slate-300 border border-slate-700/60 max-w-full truncate">
                <Briefcase className="h-2.5 w-2.5 text-blue-400 shrink-0" />
                <span className="truncate">{alumnus.work_location}</span>
              </span>
            )}

            {alumnus.employment_type && (
              <span className="inline-flex items-center rounded-md bg-slate-800/90 px-1.5 py-0.5 text-slate-300 border border-slate-700/60 max-w-full truncate">
                <span className="truncate">{alumnus.employment_type}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

export const AlumniDirectoryPage: React.FC<AlumniDirectoryPageProps> = ({ autoOpenProfile = false }) => {
  const [searchParams] = useSearchParams();
  const [alumniList, setAlumniList] = useState<AlumniDirectoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  // Phone verification state for Ask Help
  const [isHelpVerifyModalOpen, setIsHelpVerifyModalOpen] = useState(false);
  const [pendingHelpAlumnus, setPendingHelpAlumnus] = useState<AlumniDirectoryItem | null>(null);
  const [pendingHelpUrl, setPendingHelpUrl] = useState<string>('');
  const [verifyPhoneInput, setVerifyPhoneInput] = useState<string>('');
  const [verifyPhoneError, setVerifyPhoneError] = useState<string>('');
  const [isVerifyingPhone, setIsVerifyingPhone] = useState<boolean>(false);

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
    loadDirectory();
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

  const handleAskHelp = (alumnus: AlumniDirectoryItem, whatsAppUrl: string) => {
    const verifiedMobile = localStorage.getItem('eck_verified_mobile');
    if (verifiedMobile && verifiedMobile.length === 10) {
      window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setPendingHelpAlumnus(alumnus);
    setPendingHelpUrl(whatsAppUrl);
    setVerifyPhoneInput('');
    setVerifyPhoneError('');
    setIsHelpVerifyModalOpen(true);
  };

  const handleConfirmPhoneForHelp = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyPhoneError('');
    const clean = cleanMobileNumber(verifyPhoneInput);
    if (!clean || clean.length < 10) {
      setVerifyPhoneError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsVerifyingPhone(true);
    try {
      // 1. In-memory check against loaded alumni (0ms)
      const inMemMatch = alumniList.find((a) => cleanMobileNumber(a.mobile) === clean);
      if (inMemMatch) {
        localStorage.setItem('eck_verified_mobile', clean);
        setIsHelpVerifyModalOpen(false);
        if (pendingHelpUrl) {
          window.open(pendingHelpUrl, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      // 2. Database lookup fallback
      const dbMatch = await lookupAlumniByMobile(clean);
      if (dbMatch) {
        localStorage.setItem('eck_verified_mobile', clean);
        setIsHelpVerifyModalOpen(false);
        if (pendingHelpUrl) {
          window.open(pendingHelpUrl, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      setVerifyPhoneError('Mobile number not found in registered alumni records. Please enter your registered 10-digit number.');
    } catch (err: any) {
      setVerifyPhoneError(err?.message || 'Verification failed. Please try again.');
    } finally {
      setIsVerifyingPhone(false);
    }
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

          <div className="shrink-0 flex flex-col sm:flex-row gap-2.5 pt-1 sm:pt-0">
            <button
              type="button"
              className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-md shadow-amber-500/20 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
              onClick={handleOpenGeneralEdit}
            >
              <User className="h-4 w-4" />
              <span>Open My Profile</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <Link
              to="/register-alumni"
              className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-300 hover:bg-amber-500/20 transition-all"
            >
              <UserPlus className="h-4 w-4 text-amber-400" />
              <span>Register as Alumni</span>
            </Link>
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
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-amber-400 hover:bg-slate-700 cursor-pointer"
                  onClick={handleResetFilters}
                >
                  Reset Filters
                </button>
                <Link
                  to="/register-alumni"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/25"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Not registered? Register as Alumni &rarr;</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
              {filteredAlumni.map((alumnus) => {
                const whatsAppUrl = getWhatsAppHelpLink(alumnus);
                return (
                  <AlumniCard
                    key={alumnus.id}
                    alumnus={alumnus}
                    whatsAppUrl={whatsAppUrl}
                    onEdit={handleEditClick}
                    onAskHelp={handleAskHelp}
                  />
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Footer />

      {/* Ask Help Phone Verification Modal */}
      {isHelpVerifyModalOpen && pendingHelpAlumnus && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsHelpVerifyModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#0e1428] border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-2xl relative text-slate-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-verify-modal-title"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="help-verify-modal-title" className="text-base font-bold text-white leading-tight">
                    Alumni Verification Required
                  </h3>
                  <p className="text-[11px] text-amber-400/90 font-medium">
                    Spam-Free Community Protection
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHelpVerifyModalOpen(false)}
                className="min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors flex items-center justify-center cursor-pointer"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs sm:text-sm text-slate-300">
              <p className="leading-relaxed">
                To connect with <strong className="text-white">{pendingHelpAlumnus.name}</strong> on WhatsApp, please confirm your registered 10-digit mobile number.
              </p>

              <form onSubmit={handleConfirmPhoneForHelp} className="space-y-3.5 pt-1">
                <div>
                  <label htmlFor="verify-phone-input" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Your Registered Mobile Number
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-sm font-semibold text-slate-400 pointer-events-none">
                      +91
                    </span>
                    <input
                      id="verify-phone-input"
                      type="tel"
                      maxLength={10}
                      value={verifyPhoneInput}
                      onChange={(e) => {
                        setVerifyPhoneInput(e.target.value.replace(/\D/g, ''));
                        setVerifyPhoneError('');
                      }}
                      placeholder="10-digit mobile number"
                      className="w-full min-h-[44px] rounded-xl bg-slate-900 border border-slate-700 pl-12 pr-3 text-base text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                      autoFocus
                    />
                  </div>
                  {verifyPhoneError && (
                    <p className="mt-1.5 text-xs text-rose-400 font-medium leading-relaxed">
                      {verifyPhoneError}
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 text-[11px] text-slate-400 leading-relaxed">
                  🛡️ <strong>Verified once per device:</strong> Once verified, you won't be prompted again on this phone or browser.
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsHelpVerifyModalOpen(false)}
                    className="flex-1 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifyingPhone || verifyPhoneInput.length < 10}
                    className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isVerifyingPhone ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle className="h-4 w-4" />
                        <span>Connect</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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
