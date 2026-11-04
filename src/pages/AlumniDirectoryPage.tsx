import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { AlumniProfileEditModal } from '../components/AlumniProfileEditModal';
import { SearchableSelect } from '../components/SearchableSelect';
import { fetchAlumniDirectory } from '../lib/directory';
import { cleanMobileNumber } from '../lib/registrations';
import type { AlumniDirectoryItem } from '../types';
import { ENGINEERING_DISCIPLINES } from '../types';
import '../directory.css';

interface AlumniDirectoryPageProps {
  autoOpenProfile?: boolean;
}

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
  const [isEditModalOpen, setIsEditModalOpen] = useState(autoOpenProfile || searchParams.get('profile') === 'true' || searchParams.get('edit') === 'true');
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

  // Extract unique batch years present in data
  const availableBatches = useMemo(() => {
    const years = new Set<number>();
    alumniList.forEach((a) => {
      if (a.year_of_passing && a.year_of_passing > 1950) {
        years.add(a.year_of_passing);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
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
    return availableBatches.map((yr) => ({
      value: String(yr),
      label: `Batch of ${yr}`,
    }));
  }, [availableBatches]);

  // Filtered alumni list
  const filteredAlumni = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return alumniList.filter((a) => {
      // 1. Department Filter
      if (selectedDiscipline !== 'ALL' && a.engineering_discipline !== selectedDiscipline) {
        return false;
      }

      // 2. City Filter
      if (selectedCity !== 'ALL' && a.city?.toLowerCase() !== selectedCity.toLowerCase()) {
        return false;
      }

      // 3. Batch Filter
      if (selectedBatch !== 'ALL' && String(a.year_of_passing) !== selectedBatch) {
        return false;
      }

      // 4. Keyword Search (Name, Organization, City, Discipline, Work location)
      if (q) {
        const nameMatch = a.name.toLowerCase().includes(q);
        const orgMatch = a.organization?.toLowerCase().includes(q);
        const cityMatch = a.city?.toLowerCase().includes(q);
        const discMatch = a.engineering_discipline?.toLowerCase().includes(q);
        const workMatch = a.work_location?.toLowerCase().includes(q);
        const batchMatch = String(a.year_of_passing).includes(q);

        if (!nameMatch && !orgMatch && !cityMatch && !discMatch && !workMatch && !batchMatch) {
          return false;
        }
      }

      return true;
    });
  }, [alumniList, searchQuery, selectedDiscipline, selectedCity, selectedBatch]);

  // Suggestions for live typeahead (names matching current query)
  const searchSuggestions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (q.length < 2) return [];

    return alumniList
      .filter((a) => a.name.toLowerCase().includes(q) || a.organization?.toLowerCase().includes(q))
      .slice(0, 6);
  }, [alumniList, searchQuery]);

  // Handle when profile is updated from modal
  const handleProfileUpdated = (updatedAlumnus: AlumniDirectoryItem) => {
    setAlumniList((prev) =>
      prev.map((item) => (item.id === updatedAlumnus.id ? updatedAlumnus : item))
    );
  };

  // Open edit modal directly for an alumnus
  const handleEditClick = (alumnus: AlumniDirectoryItem) => {
    setAlumnusToEdit(alumnus);
    setIsEditModalOpen(true);
  };

  // Open modal in fresh search mode
  const handleOpenGeneralEdit = () => {
    setAlumnusToEdit(null);
    setIsEditModalOpen(true);
  };

  // Clear all filters
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

  // Compose WhatsApp message link for help
  const getWhatsAppHelpLink = (alumnus: AlumniDirectoryItem) => {
    const cleanPhone = cleanMobileNumber(alumnus.mobile);
    if (!cleanPhone || cleanPhone.length < 10) return '';

    const text = `Hi ${alumnus.name}! I am an ECK alumnus reaching out via the ECK Alumni Portal. I saw that you are in ${alumnus.city || 'our alumni network'} and from the ${alumnus.engineering_discipline} branch. Would love to connect for some guidance!`;
    return `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  return (
    <div className="directory-page-container">
      <Header />

      <main className="directory-main-content">
        {/* Top Hero Section */}
        <section className="directory-hero-section">
          <div className="directory-hero-badge">
            <span className="badge-icon">🎓</span>
            <span>ECK Alumni Community &amp; Help Portal</span>
          </div>
          <h1 className="directory-hero-title">
            Connect with Alumni across Departments &amp; Cities
          </h1>
          <p className="directory-hero-subtitle">
            Looking for advice moving to a new city, career guidance in your branch, or seeking batchmates?
            Browse verified alumni or open your record to keep your details and career up to date.
          </p>
        </section>

        {/* Dedicated Alumni Profile Access Card */}
        <section className="alumni-profile-access-card" aria-label="Alumni Profile Hub">
          <div className="profile-access-left">
            <div className="profile-access-badge-icon">👤</div>
            <div className="profile-access-text">
              <h3 className="profile-access-title">Are you an ECK Alumnus?</h3>
              <p className="profile-access-desc">
                Open your personal profile to view or update your complete registration information — current organization, city, contact info, photo, and branch.
              </p>
            </div>
          </div>
          <div className="profile-access-right">
            <button
              type="button"
              className="btn-open-my-profile"
              onClick={handleOpenGeneralEdit}
            >
              <span className="btn-icon">👤</span>
              <span>Open My Profile →</span>
            </button>
          </div>
        </section>

        {/* Filter and Search Bar Section */}
        <section className="directory-filter-section">
          <div className="filter-controls-card">
            {/* Search Input with Auto-suggestion */}
            <div className="search-control-wrap" ref={searchContainerRef}>
              <div className="search-input-field-wrap">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="directory-search-input"
                  placeholder="Search by Name, Company, Batch..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown */}
              {isSearchFocused && searchSuggestions.length > 0 && (
                <div className="typeahead-suggestions-list" role="listbox">
                  {searchSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="typeahead-item"
                      onClick={() => {
                        setSearchQuery(item.name);
                        setIsSearchFocused(false);
                      }}
                    >
                      <span className="item-name">{item.name}</span>
                      <span className="item-meta">
                        {item.year_of_passing ? `'${String(item.year_of_passing).slice(-2)}` : ''} • {item.engineering_discipline} • {item.city}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dropdown Filters Grid with Text Search */}
            <div className="filter-dropdowns-row">
              {/* Department Filter with in-dropdown search */}
              <SearchableSelect
                id="dept-filter"
                label="Department / Branch"
                value={selectedDiscipline}
                onChange={setSelectedDiscipline}
                options={disciplineOptions}
                allOptionLabel="All Departments"
                searchPlaceholder="Search branch (e.g. Computer, Civil)..."
              />

              {/* City Filter with in-dropdown search */}
              <SearchableSelect
                id="city-filter"
                label="City / Location"
                value={selectedCity}
                onChange={setSelectedCity}
                options={cityOptions}
                allOptionLabel={`All Cities (${availableCities.length})`}
                searchPlaceholder="Search city (e.g. Kota, Bengaluru)..."
              />

              {/* Batch Filter with in-dropdown search */}
              <SearchableSelect
                id="batch-filter"
                label="Passing Batch"
                value={selectedBatch}
                onChange={setSelectedBatch}
                options={batchOptions}
                allOptionLabel="All Batches"
                searchPlaceholder="Search batch (e.g. 2024, 2012)..."
              />
            </div>

            {/* Filter Summary & Reset Bar */}
            <div className="filter-status-bar">
              <span className="results-count-text">
                Showing <strong>{filteredAlumni.length}</strong> alumni
                {selectedDiscipline !== 'ALL' && ` in ${selectedDiscipline}`}
                {selectedCity !== 'ALL' && ` in ${selectedCity}`}
              </span>

              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn-reset-filters"
                  onClick={handleResetFilters}
                >
                  Reset All Filters ✕
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Alumni Cards Directory Grid */}
        <section className="directory-grid-section">
          {isLoading ? (
            <div className="directory-loading-state">
              <span className="spinner-lg">⏳</span>
              <p>Loading alumni directory &amp; community records...</p>
            </div>
          ) : filteredAlumni.length === 0 ? (
            <div className="directory-empty-state">
              <div className="empty-icon">🔍</div>
              <h3>No alumni found matching your criteria</h3>
              <p>Try clearing filters or search by a different name, city, or discipline.</p>
              <button
                type="button"
                className="btn-reset-empty"
                onClick={handleResetFilters}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="alumni-cards-grid">
              {filteredAlumni.map((alumnus) => {
                const whatsAppUrl = getWhatsAppHelpLink(alumnus);
                const hasPhoto = Boolean(alumnus.resolved_photo_url || alumnus.photo_url);

                return (
                  <article key={alumnus.id} className="alumnus-card">
                    {/* Card Header & Avatar */}
                    <div className="alumnus-card-header">
                      {/* Circular Avatar */}
                      <div className="alumnus-avatar-wrap circle">
                        {hasPhoto ? (
                          <img
                            src={alumnus.resolved_photo_url || alumnus.photo_url || ''}
                            alt={alumnus.name}
                            className="alumnus-avatar-img circle-img"
                            loading="lazy"
                          />
                        ) : (
                          <div className="alumnus-avatar-fallback circle-fallback">
                            <span>{alumnus.name.slice(0, 2).toUpperCase()}</span>
                          </div>
                        )}
                      </div>

                      {/* Header Info: Name + Batch in Top Row, Branch & Org below */}
                      <div className="alumnus-header-info">
                        <div className="alumnus-header-top-row">
                          <h2 className="alumnus-name" title={alumnus.name}>
                            {alumnus.name}
                          </h2>
                          {alumnus.year_of_passing && (
                            <span className="alumnus-batch-pill">
                              Batch of {alumnus.year_of_passing}
                            </span>
                          )}
                        </div>

                        <div className="alumnus-header-sub-row">
                          <span className="alumnus-branch-tag" title={alumnus.engineering_discipline}>
                            🎓 {alumnus.engineering_discipline}
                          </span>
                          {alumnus.organization && (
                            <span className="alumnus-org-tag" title={alumnus.organization}>
                              • 🏢 {alumnus.organization}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Meta Tags */}
                    <div className="alumnus-meta-tags">
                      {/* City Badge */}
                      <span className="alumnus-tag tag-city" title="Current City / State">
                        📍 {alumnus.city || 'Kota'}{alumnus.state ? `, ${alumnus.state}` : ''}
                      </span>

                      {/* Work Location / Neighborhood if provided */}
                      {alumnus.work_location && (
                        <span className="alumnus-tag tag-location" title="Office Location">
                          📌 {alumnus.work_location}
                        </span>
                      )}

                      {/* Employment Type if available */}
                      {alumnus.employment_type && (
                        <span className="alumnus-tag tag-emp" title="Employment Type">
                          💼 {alumnus.employment_type}
                        </span>
                      )}
                    </div>

                    {/* Action Buttons: Ask for Help, Email, LinkedIn, Edit */}
                    <div className="alumnus-card-actions">
                      {/* WhatsApp Help Connect */}
                      {whatsAppUrl ? (
                        <a
                          href={whatsAppUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-action btn-ask-help"
                          title={`Send a courteous WhatsApp message to ${alumnus.name}`}
                        >
                          <span className="action-icon">💬</span>
                          <span>Ask for Help</span>
                        </a>
                      ) : (
                        <span className="action-disabled">No phone provided</span>
                      )}

                      {/* LinkedIn Link (Compact Icon Button) */}
                      {alumnus.linkedin_url && (
                        <a
                          href={alumnus.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-action btn-action-icon btn-linkedin"
                          title={`View ${alumnus.name}'s LinkedIn Profile`}
                          aria-label="LinkedIn"
                        >
                          <span className="action-icon">🔗</span>
                        </a>
                      )}

                      {/* Email Link (Compact Icon Button) */}
                      {alumnus.email && (
                        <a
                          href={`mailto:${alumnus.email}?subject=ECK Alumni Connection`}
                          className="btn-action btn-action-icon btn-email"
                          title={`Email ${alumnus.name}`}
                          aria-label="Email"
                        >
                          <span className="action-icon">✉️</span>
                        </a>
                      )}

                      {/* Open / View & Edit Profile Shortcut */}
                      <button
                        type="button"
                        className="btn-action btn-edit-self"
                        onClick={() => handleEditClick(alumnus)}
                        title="Open complete alumni profile to view or update all details"
                      >
                        <span className="action-icon">👤</span>
                        <span>Open Profile</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

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

