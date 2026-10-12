import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '../components/Header';
import { AdminLogin } from '../components/AdminLogin';
import { ShareWhatsAppModal } from '../components/ShareWhatsAppModal';
import { UpiReconciliationReport } from '../components/UpiReconciliationReport';
import { DEFAULT_UPI_CONFIGS } from '../lib/paymentRotation';
import { supabase } from '../lib/supabase';
import type { EventRegistration, ECKEvent, PaymentVerification } from '../types';

const DEFAULT_EVENT: ECKEvent = {
  id: 'mock-deepaura-2026',
  event_name: 'ECK-RTU Alumni DeepAura 2K26',
  event_slug: 'deepaura-2k26',
  event_date: '2026-11-01',
  event_time: '5:00 PM onwards',
  location: 'ECK Campus, Kota, Rajasthan (College Ground)',
  description:
    'Join fellow ECK and RTU alumni for an evening of nostalgic reunions, networking, cultural celebrations, gala dinner, and Diwali celebrations.',
  registration_fee: 800,
  upi_id: '9799951857@upi',
  banner_image_url: '/deepaura-banner.jpg',
  tagline: '“दीप जले, यादें मुस्कुराएँ।”',
  theme_primary_color: '#6366f1',
  theme_accent_color: '#f59e0b',
  qr_image_url: '/qr-1.png',
  status: 'OPEN',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const AdminPage: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<'registrations' | 'upi_report'>('registrations');
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [verifications, setVerifications] = useState<PaymentVerification[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'yes' | 'maybe' | 'no'>('all');
  const [selectedReg, setSelectedReg] = useState<EventRegistration | null>(null);
  const [modalAssignedUpi, setModalAssignedUpi] = useState<string>('');
  const [savingModalUpi, setSavingModalUpi] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState<ECKEvent>(DEFAULT_EVENT);
  const [singleCopied, setSingleCopied] = useState(false);


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

  // Sync modal assigned UPI when selectedReg changes
  useEffect(() => {
    if (selectedReg) {
      const existing = selectedReg.payment_verifications?.[0]?.upi_id || '';
      setModalAssignedUpi(existing);
    }
  }, [selectedReg]);

  // Fetch registrations and payment verifications
  const fetchRegistrations = async () => {
    setLoadingData(true);
    try {
      const [regRes, verifRes] = await Promise.all([
        supabase
          .from('event_registrations')
          .select(`
            *,
            alumni:alumni_id (*),
            events:event_id (*)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('payment_verifications')
          .select('*')
          .order('created_at', { ascending: false }),
      ]);

      if (regRes.error) {
        console.error('[Admin Portal] Failed to fetch registrations:', regRes.error);
        throw regRes.error;
      }
      const list = (regRes.data as any) || [];
      const verifList = (verifRes.data as any) || [];

      // Attach payment verification entries to each registration
      list.forEach((reg: any) => {
        reg.payment_verifications = verifList.filter((v: any) => v.registration_id === reg.id);
      });

      console.log(`[Admin Portal] Loaded ${list.length} registrations and ${verifList.length} verifications.`);
      setRegistrations(list);
      setVerifications(verifList);
      if (list.length > 0 && list[0]?.events) {
        setActiveEvent(list[0].events);
      }
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

  const handleSaveVerification = async (
    registrationId: string,
    upiId: string,
    amount: number,
    notes?: string
  ): Promise<boolean> => {
    try {
      const verifiedBy = session?.user?.email || 'admin';
      const { error } = await supabase
        .from('payment_verifications')
        .upsert(
          {
            registration_id: registrationId,
            upi_id: upiId.toLowerCase().trim(),
            amount: amount,
            verified_status: 'VERIFIED',
            notes: notes || null,
            verified_by: verifiedBy,
          },
          { onConflict: 'registration_id' }
        );

      if (error) {
        console.error('Error saving payment verification:', error);
        alert('Failed to save payment verification: ' + error.message);
        return false;
      }

      await fetchRegistrations();
      return true;
    } catch (err: any) {
      console.error('Error in handleSaveVerification:', err);
      alert('Error saving verification: ' + (err?.message || 'Unknown error'));
      return false;
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

  const buildSingleAlumnusText = (reg: EventRegistration) => {
    const name = reg.alumni?.name || 'Alumnus';
    const batch = reg.alumni?.year_of_passing ? `Class of ${reg.alumni.year_of_passing}` : '';
    const disc = reg.alumni?.engineering_discipline || '';
    const city = reg.alumni?.city ? `${reg.alumni.city}${reg.alumni?.state ? `, ${reg.alumni.state}` : ''}` : '';
    const count = reg.number_of_attendees || 1;
    const status = reg.attendance_status === 'yes' ? 'Confirmed Attending' : reg.attendance_status;
    const rawDate = activeEvent?.event_date || '2026-11-01';
    let eventDate = rawDate;
    const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      eventDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    }
    const venue = activeEvent?.location || 'ECK Campus, Kota';
    const webUrl = typeof window !== 'undefined' ? window.location.origin : 'https://eck-alumni.org';

    const lines = [
      '🪔✨ *ECK-RTU ALUMNI DEEPAURA 2K26* ✨🪔',
      '🏛️ *Organised By:* ECK-RTU Alumni Kota Chapter',
      '✨ *Tagline:* “दीप जले, यादें मुस्कुराएँ।”',
      `🎉 *Registration Details: ${name}*`,
      '',
      `🎫 *Registration ID:* ${reg.registration_number}`,
      `👤 *Alumni Name:* ${name}`,
      batch ? `🎓 *Batch:* ${batch}${disc ? ` • ${disc}` : ''}` : '',
      city ? `📍 *Location:* ${city}` : '',
      `👥 *Attendees:* ${count} ${count === 1 ? 'Person' : 'People'}${count > 1 ? ` (Self + ${count - 1} accompanying)` : ''}`,
      `✨ *Attendance Status:* ${status.toUpperCase()}`,
      reg.attendance_status === 'yes' ? `💰 *Contribution:* ₹${reg.amount}` : '',
      '',
      '━━━━━━━━━━━━━━━━━━━━━',
      `📅 *Date:* ${eventDate}`,
      `📍 *Venue:* ${venue}`,
      `🔗 *Portal:* ${webUrl}`,
      '🪔 *“दीप जले, यादें मुस्कुराएँ।” See you at DeepAura 2K26!* ✨',
    ];

    return lines.filter(Boolean).join('\n');
  };

  const handleShareSingleAlumnus = (reg: EventRegistration) => {
    const text = buildSingleAlumnusText(reg);
    const encoded = encodeURIComponent(text);
    const isMobile =
      typeof navigator !== 'undefined' &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      window.open(`whatsapp://send?text=${encoded}`, '_self');
      setTimeout(() => {
        window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
      }, 700);
    } else {
      window.open(`https://web.whatsapp.com/send?text=${encoded}`, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopySingleAlumnus = async (reg: EventRegistration) => {
    const text = buildSingleAlumnusText(reg);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setSingleCopied(true);
      setTimeout(() => setSingleCopied(false), 2500);
    } catch (e) {
      console.error(e);
    }
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
    const resolvedUrl = data?.publicUrl || null;
    console.log('[Admin Portal Screenshot URL]', { path, resolvedUrl });
    return resolvedUrl;
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
      <Header title="Organizer Portal" tagline="ECK-RTU Alumni Registrations" />

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
                    onClick={() => setIsShareModalOpen(true)}
                    className="btn btn-whatsapp-header"
                    title="Broadcast Attendee List on WhatsApp"
                  >
                    💬 Share on WhatsApp
                  </button>
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

              {/* View Mode Navigation Tabs */}
              <div className="admin-view-tabs">
                <button
                  type="button"
                  className={`admin-view-tab-btn ${activeTab === 'registrations' ? 'active' : ''}`}
                  onClick={() => setActiveTab('registrations')}
                >
                  📋 Registrations Directory
                  <span className="admin-tab-count">{registrations.length}</span>
                </button>
                <button
                  type="button"
                  className={`admin-view-tab-btn ${activeTab === 'upi_report' ? 'active' : ''}`}
                  onClick={() => setActiveTab('upi_report')}
                >
                  💳 UPI Reconciliation Ledger
                  <span className="admin-tab-count">{verifications.length} Tagged</span>
                </button>
              </div>

              {activeTab === 'upi_report' ? (
                <UpiReconciliationReport
                  registrations={registrations}
                  verifications={verifications}
                  onSaveVerification={handleSaveVerification}
                  onRefresh={fetchRegistrations}
                  loading={loadingData}
                  currentUserEmail={session?.user?.email}
                />
              ) : (
                <>
                  {/* Mobile-First WhatsApp Broadcast Banner */}
                  <div className="admin-mobile-share-banner">
                    <div className="admin-mobile-share-info">
                      <span className="admin-mobile-share-icon">🪔</span>
                      <div>
                        <h3 className="admin-mobile-share-title">Diwali WhatsApp Broadcast</h3>
                        <p className="admin-mobile-share-subtitle">
                          Share registered alumni list with passing year, location &amp; accompanying guests to WhatsApp!
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsShareModalOpen(true)}
                      className="btn btn-whatsapp-primary btn-sm"
                    >
                      💬 Broadcast List
                    </button>
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

                            {reg.payment_verifications?.[0]?.upi_id ? (
                              <span className="assigned-upi-pill" title={`Credited to ${reg.payment_verifications[0].upi_id}`}>
                                <span className="upi-pill-dot" />
                                {reg.payment_verifications[0].upi_id.split('@')[0]}
                              </span>
                            ) : null}

                            {reg.payment_screenshot_path ? (
                              <span className="screenshot-tag tag-has-ss">
                                📷 {reg.payment_screenshot_path.includes(',')
                                    ? `${reg.payment_screenshot_path.split(',').filter(Boolean).length} Receipts Attached`
                                    : 'Screenshot Attached'}
                              </span>
                            ) : (
                              <span className="screenshot-tag tag-no-ss">
                                No Screenshot
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShareSingleAlumnus(reg);
                              }}
                              className="btn-card-whatsapp"
                              title="Share on WhatsApp"
                            >
                              💬 Share
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleShareSingleAlumnus(selectedReg)}
                  className="btn btn-whatsapp-primary btn-sm"
                  title="Share registration via WhatsApp"
                >
                  💬 WhatsApp
                </button>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setSelectedReg(null)}
                >
                  ✕
                </button>
              </div>
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

              {/* Single Share Action Bar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={() => handleShareSingleAlumnus(selectedReg)}
                  className="btn btn-whatsapp-primary btn-sm"
                >
                  💬 Share Details on WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => handleCopySingleAlumnus(selectedReg)}
                  className={`btn btn-secondary btn-sm ${singleCopied ? 'btn-copied' : ''}`}
                >
                  {singleCopied ? '✓ Copied Details!' : '📋 Copy Details'}
                </button>
              </div>

              {/* Quick UPI Verification Box inside Modal */}
              <div className="modal-verify-box">
                <div className="modal-verify-title">
                  <span>💳 Receiving UPI ID:</span>
                  {selectedReg.payment_verifications?.[0]?.upi_id ? (
                    <span className="assigned-upi-pill">
                      {selectedReg.payment_verifications[0].upi_id}
                    </span>
                  ) : (
                    <span className="unassigned-warning-pill">⚠️ Not Tagged Yet</span>
                  )}
                </div>
                <div className="modal-verify-row">
                  <select
                    value={modalAssignedUpi}
                    onChange={(e) => setModalAssignedUpi(e.target.value)}
                    className="form-input"
                    disabled={savingModalUpi}
                    style={{ flex: 1, minWidth: '220px' }}
                  >
                    <option value="">-- Select Receiving UPI ID --</option>
                    {DEFAULT_UPI_CONFIGS.map((c, idx) => (
                      <option key={c.upi_id} value={c.upi_id}>
                        UPI {idx + 1} ({c.upi_id})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={savingModalUpi || !modalAssignedUpi}
                    onClick={async () => {
                      if (!modalAssignedUpi) return;
                      setSavingModalUpi(true);
                      const ok = await handleSaveVerification(
                        selectedReg.id,
                        modalAssignedUpi,
                        selectedReg.amount || 800
                      );
                      setSavingModalUpi(false);
                      if (ok) {
                        setSelectedReg((prev) =>
                          prev
                            ? {
                                ...prev,
                                payment_verifications: [
                                  {
                                    id: 'local',
                                    registration_id: prev.id,
                                    upi_id: modalAssignedUpi,
                                    amount: prev.amount,
                                    verified_status: 'VERIFIED',
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString(),
                                  },
                                ],
                              }
                            : null
                        );
                      }
                    }}
                    className="btn btn-primary btn-sm"
                  >
                    {savingModalUpi ? 'Saving...' : '💾 Save QR Account'}
                  </button>
                </div>
              </div>

              {/* Payment Screenshot Display */}
              <div className="modal-screenshot-section">
                <h4 className="modal-section-title">
                  Payment Receipts ({
                    (selectedReg.payment_screenshot_path || '')
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean).length || 0
                  })
                </h4>
                {selectedReg.payment_screenshot_path ? (
                  <div className="multi-screenshots-container">
                    {(selectedReg.payment_screenshot_path || '')
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((singlePath, idx) => (
                        <div key={idx} className="screenshot-display-box" style={{ marginBottom: '16px' }}>
                          <span className="screenshot-item-label" style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--primary-light)' }}>
                            {idx === 0
                              ? '📄 Receipt 1 (Initial Payment)'
                              : `📄 Receipt ${idx + 1} (Additional Payment / Extra Attendees)`}
                          </span>
                          <img
                            src={getPublicScreenshotUrl(singlePath) || ''}
                            alt={`Payment screenshot ${idx + 1}`}
                            className="modal-screenshot-img"
                            onLoad={() => {
                              console.log(`[Admin Portal Screenshot Loaded OK]:`, singlePath);
                            }}
                            onError={(e) => {
                              console.error(`[Admin Portal Screenshot Load Failed]:`, {
                                path: singlePath,
                                resolvedUrl: getPublicScreenshotUrl(singlePath),
                                event: e,
                              });
                            }}
                          />
                          <a
                            href={getPublicScreenshotUrl(singlePath) || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm mt-3"
                          >
                            🔗 Open Original Screenshot #{idx + 1}
                          </a>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-muted">No screenshot attached (attendance status: {selectedReg.attendance_status}).</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Broadcast Modal */}
      <ShareWhatsAppModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        registrations={registrations}
        filteredRegistrations={filteredRegistrations}
        event={activeEvent}
      />
    </div>
  );
};
