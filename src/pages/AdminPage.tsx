import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '../components/Header';
import { AdminLogin } from '../components/AdminLogin';
import { supabase } from '../lib/supabase';
import type { EventRegistration } from '../types';

export const AdminPage: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'yes' | 'maybe' | 'no'>('all');
  const [selectedReg, setSelectedReg] = useState<EventRegistration | null>(null);

  // Check auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch registrations
  const fetchRegistrations = async () => {
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('event_registrations')
        .select(`
          *,
          alumni:alumni_id (*),
          events:event_id (*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRegistrations((data as any) || []);
    } catch (err) {
      console.warn('Registrations fetch note:', err);
      // Fallback demo data if Supabase is fresh or unconfigured
      const sampleList: EventRegistration[] = [
        {
          id: '1',
          registration_number: 'REG-00001',
          event_id: 'e1',
          alumni_id: 'a1',
          attendance_status: 'yes',
          number_of_attendees: 2,
          amount: 1600,
          payment_screenshot_path: 'pre-diwali-milan-2026/sample_1.jpg',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          alumni: {
            id: 'a1',
            name: 'Amit Sharma',
            email: 'amit.sharma@example.com',
            mobile: '9876543210',
            address: '42, Vigyan Nagar',
            city: 'Kota',
            state: 'Rajasthan',
            year_of_passing: 2008,
            engineering_discipline: 'Mechanical',
            organization: 'NTPC Limited',
            employment_type: 'Full-time (Government / Public Sector)',
            industry_domain: 'Manufacturing & Engineering',
            professional_category: 'Full-time (Government / Public Sector) • Manufacturing & Engineering',
            work_location: 'New Delhi',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
        {
          id: '2',
          registration_number: 'REG-00002',
          event_id: 'e1',
          alumni_id: 'a2',
          attendance_status: 'maybe',
          number_of_attendees: 1,
          amount: 0,
          payment_screenshot_path: null,
          created_at: new Date(Date.now() - 3600000).toISOString(),
          updated_at: new Date(Date.now() - 3600000).toISOString(),
          alumni: {
            id: 'a2',
            name: 'Priya Meena',
            email: 'priya.m@techcorp.in',
            mobile: '9829012345',
            address: 'Sector 5, Mansarovar',
            city: 'Jaipur',
            state: 'Rajasthan',
            year_of_passing: 2015,
            engineering_discipline: 'Computer Science',
            organization: 'Oracle',
            employment_type: 'Full-time (Private)',
            industry_domain: 'Information Technology & Services',
            professional_category: 'Full-time (Private) • Information Technology & Services',
            work_location: 'Bengaluru',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
      ];
      setRegistrations(sampleList);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchRegistrations();
    }
  }, [session]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  // Filtered registrations
  const filteredRegistrations = useMemo(() => {
    return registrations.filter((reg) => {
      const matchesStatus =
        statusFilter === 'all' || reg.attendance_status === statusFilter;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchesStatus;

      const name = reg.alumni?.name?.toLowerCase() || '';
      const mobile = reg.alumni?.mobile?.toLowerCase() || '';
      const regNum = reg.registration_number?.toLowerCase() || '';
      const discipline = reg.alumni?.engineering_discipline?.toLowerCase() || '';
      const city = reg.alumni?.city?.toLowerCase() || '';
      const state = reg.alumni?.state?.toLowerCase() || '';
      const country = reg.alumni?.country?.toLowerCase() || '';
      const empType = reg.alumni?.employment_type?.toLowerCase() || '';
      const industry = reg.alumni?.industry_domain?.toLowerCase() || '';
      const org = reg.alumni?.organization?.toLowerCase() || '';

      const matchesSearch =
        name.includes(q) ||
        mobile.includes(q) ||
        regNum.includes(q) ||
        discipline.includes(q) ||
        city.includes(q) ||
        state.includes(q) ||
        country.includes(q) ||
        empType.includes(q) ||
        industry.includes(q) ||
        org.includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [registrations, searchQuery, statusFilter]);

  // Summary Metrics
  const stats = useMemo(() => {
    const totalRegs = registrations.length;
    const attendingRegs = registrations.filter((r) => r.attendance_status === 'yes');
    const totalAttendees = attendingRegs.reduce(
      (sum, r) => sum + (r.number_of_attendees || 1),
      0
    );
    const totalAmount = attendingRegs.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const maybeCount = registrations.filter((r) => r.attendance_status === 'maybe').length;

    return { totalRegs, totalAttendees, totalAmount, maybeCount };
  }, [registrations]);

  const getPublicScreenshotUrl = (path: string | null) => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const { data } = supabase.storage.from('payment-screenshots').getPublicUrl(path);
    return data?.publicUrl || null;
  };

  if (loadingAuth) {
    return (
      <div className="app-layout">
        <Header title="Organizer Portal" />
        <main className="main-content flex-center">
          <div className="spinner" />
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Header title="Organizer Portal" tagline="ECK Alumni Registrations" />

      <main className="main-content">
        <div className="content-container">
          {!session ? (
            <AdminLogin onLoginSuccess={() => fetchRegistrations()} />
          ) : (
            <div className="admin-dashboard">
              {/* Top Bar with Sign Out */}
              <div className="admin-header-row">
                <div>
                  <h1 className="admin-title">Registrations Overview</h1>
                  <p className="admin-subtitle">
                    Verify screenshots and alumni submissions.
                  </p>
                </div>
                <div className="admin-actions">
                  <button
                    type="button"
                    onClick={fetchRegistrations}
                    disabled={loadingData}
                    className="btn btn-secondary btn-sm"
                    title="Refresh Data"
                  >
                    🔄 Refresh
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="btn btn-ghost btn-sm text-error"
                    title="Sign Out"
                  >
                    Sign Out
                  </button>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-label">Total Submissions</span>
                  <span className="stat-value">{stats.totalRegs}</span>
                  <span className="stat-hint">{stats.maybeCount} Maybe</span>
                </div>

                <div className="stat-card">
                  <span className="stat-label">Total Attending</span>
                  <span className="stat-value font-success">{stats.totalAttendees}</span>
                  <span className="stat-hint">Confirmed Guests</span>
                </div>

                <div className="stat-card">
                  <span className="stat-label">Estimated Collection</span>
                  <span className="stat-value font-accent">₹{stats.totalAmount.toLocaleString('en-IN')}</span>
                  <span className="stat-hint">Via UPI screenshot</span>
                </div>
              </div>

              {/* Search & Filter Toolbar */}
              <div className="admin-toolbar">
                <div className="search-box">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search by name, mobile, branch, city..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="search-clear-btn"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="filter-chips">
                  <button
                    type="button"
                    className={`filter-chip ${statusFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('all')}
                  >
                    All ({registrations.length})
                  </button>
                  <button
                    type="button"
                    className={`filter-chip ${statusFilter === 'yes' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('yes')}
                  >
                    Attending ({registrations.filter((r) => r.attendance_status === 'yes').length})
                  </button>
                  <button
                    type="button"
                    className={`filter-chip ${statusFilter === 'maybe' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('maybe')}
                  >
                    Maybe ({registrations.filter((r) => r.attendance_status === 'maybe').length})
                  </button>
                  <button
                    type="button"
                    className={`filter-chip ${statusFilter === 'no' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('no')}
                  >
                    No ({registrations.filter((r) => r.attendance_status === 'no').length})
                  </button>
                </div>
              </div>

              {/* Registrations List */}
              <div className="registrations-list">
                {filteredRegistrations.length === 0 ? (
                  <div className="empty-state-card">
                    <p className="empty-title">No registrations found</p>
                    <p className="empty-desc">Try clearing your search query or filters.</p>
                  </div>
                ) : (
                  filteredRegistrations.map((reg) => (
                    <div
                      key={reg.id}
                      className="reg-card"
                      onClick={() => setSelectedReg(reg)}
                    >
                      <div className="reg-card-header">
                        <div className="reg-code-wrap">
                          <span className="reg-code">{reg.registration_number}</span>
                          <span className={`status-pill pill-${reg.attendance_status}`}>
                            {reg.attendance_status === 'yes' ? 'Attending' : reg.attendance_status}
                          </span>
                        </div>
                        <span className="reg-amount">
                          {reg.attendance_status === 'yes' ? `₹${reg.amount}` : '—'}
                        </span>
                      </div>

                      <div className="reg-card-body">
                        <h3 className="alumni-name">{reg.alumni?.name || 'Unknown Alumni'}</h3>
                        <p className="alumni-batch">
                          Batch of {reg.alumni?.year_of_passing || '—'} • {reg.alumni?.engineering_discipline || '—'}
                        </p>
                        <p className="alumni-contact">
                          📞 {reg.alumni?.mobile} • 📍 {reg.alumni?.city}, {reg.alumni?.state}
                          {reg.alumni?.country && reg.alumni.country !== 'India' ? ` (${reg.alumni.country})` : ''}
                        </p>
                        {reg.alumni?.organization && (
                          <p className="alumni-org">💼 {reg.alumni.organization} ({reg.alumni.professional_category})</p>
                        )}
                      </div>

                      <div className="reg-card-footer">
                        <span className="reg-attendees">
                          👥 {reg.number_of_attendees} {reg.number_of_attendees === 1 ? 'Person' : 'People'}
                        </span>
                        {reg.payment_screenshot_path ? (
                          <span className="screenshot-tag tag-has-ss">
                            📷 Screenshot Attached
                          </span>
                        ) : (
                          <span className="screenshot-tag tag-no-ss">
                            No Screenshot
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* REGISTRATION DETAIL MODAL */}
      {selectedReg && (
        <div className="modal-overlay" onClick={() => setSelectedReg(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-tag">{selectedReg.registration_number}</span>
                <h2 className="modal-title">{selectedReg.alumni?.name}</h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedReg(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-details-grid">
                <div className="modal-detail-item">
                  <span className="modal-label">Mobile</span>
                  <a href={`tel:${selectedReg.alumni?.mobile}`} className="modal-val link-val">
                    {selectedReg.alumni?.mobile}
                  </a>
                </div>

                <div className="modal-detail-item">
                  <span className="modal-label">Email</span>
                  <span className="modal-val">{selectedReg.alumni?.email || 'Not provided'}</span>
                </div>

                <div className="modal-detail-item">
                  <span className="modal-label">Year of Passing</span>
                  <span className="modal-val">Class of {selectedReg.alumni?.year_of_passing}</span>
                </div>

                <div className="modal-detail-item">
                  <span className="modal-label">Discipline</span>
                  <span className="modal-val">{selectedReg.alumni?.engineering_discipline}</span>
                </div>

                <div className="modal-detail-item">
                  <span className="modal-label">Address</span>
                  <span className="modal-val">{selectedReg.alumni?.address}</span>
                </div>

                <div className="modal-detail-item">
                  <span className="modal-label">Location</span>
                  <span className="modal-val">
                    {selectedReg.alumni?.city}, {selectedReg.alumni?.state}
                    {selectedReg.alumni?.country && selectedReg.alumni.country !== 'India'
                      ? ` • 🌐 ${selectedReg.alumni.country}`
                      : ' • 🇮🇳 India'}
                  </span>
                </div>

                <div className="modal-detail-item">
                  <span className="modal-label">Employment Type</span>
                  <span className="modal-val">
                    {selectedReg.alumni?.employment_type || selectedReg.alumni?.professional_category || '—'}
                  </span>
                </div>

                <div className="modal-detail-item">
                  <span className="modal-label">Industry / Domain</span>
                  <span className="modal-val">
                    {selectedReg.alumni?.industry_domain || '—'}
                  </span>
                </div>

                <div className="modal-detail-item">
                  <span className="modal-label">Organization</span>
                  <span className="modal-val">{selectedReg.alumni?.organization || '—'}</span>
                </div>

                <div className="modal-detail-item">
                  <span className="modal-label">Work Location</span>
                  <span className="modal-val">{selectedReg.alumni?.work_location || '—'}</span>
                </div>

                <div className="modal-detail-item">
                  <span className="modal-label">Attendance &amp; Guests</span>
                  <span className="modal-val font-bold">
                    {selectedReg.attendance_status.toUpperCase()} ({selectedReg.number_of_attendees} persons)
                  </span>
                </div>

                <div className="modal-detail-item">
                  <span className="modal-label">Contribution Amount</span>
                  <span className="modal-val font-accent font-bold">
                    ₹{selectedReg.amount}
                  </span>
                </div>
              </div>

              {/* Payment Screenshot Display */}
              <div className="modal-screenshot-section">
                <h4 className="modal-section-title">Payment Screenshot</h4>
                {selectedReg.payment_screenshot_path ? (
                  <div className="screenshot-display-box">
                    <img
                      src={getPublicScreenshotUrl(selectedReg.payment_screenshot_path) || ''}
                      alt="Payment screenshot"
                      className="modal-screenshot-img"
                    />
                    <a
                      href={getPublicScreenshotUrl(selectedReg.payment_screenshot_path) || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm mt-3"
                    >
                      🔗 Open Original Screenshot
                    </a>
                  </div>
                ) : (
                  <p className="text-muted">No screenshot attached (attendance status: {selectedReg.attendance_status}).</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
