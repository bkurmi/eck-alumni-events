import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '../components/Header';
import { AdminLogin } from '../components/AdminLogin';
import { ShareWhatsAppModal } from '../components/ShareWhatsAppModal';
import { UpiReconciliationReport } from '../components/UpiReconciliationReport';
import { QuickManualRegistrationModal } from '../components/QuickManualRegistrationModal';
import { GateVerificationPortal } from '../components/GateVerificationPortal';
import { GateStaffManagerModal } from '../components/GateStaffManagerModal';
import { SponsorshipsManager } from '../components/SponsorshipsManager';
import { SponsorshipModal } from '../components/SponsorshipModal';
import { EventExpensesManager } from '../components/EventExpensesManager';
import { ExpenseModal } from '../components/ExpenseModal';
import {
  fetchSponsorshipsFromDb,
  saveSponsorshipToDb,
} from '../lib/sponsorships';
import {
  fetchExpensesFromDb,
  saveExpenseToDb,
  deleteExpenseFromDb,
} from '../lib/expenses';
import { supabase } from '../lib/supabase';
import { isRealMobileNumber, formatDisplayMobile } from '../lib/registrations';
import { isAdminGatePortalEnabled } from '../lib/gate';
import type { EventRegistration, ECKEvent, PaymentVerification, Sponsorship, EventExpense } from '../types';

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
  const [activeTab, setActiveTab] = useState<
    'registrations' | 'sponsorships' | 'expenses' | 'upi_report' | 'gate_portal'
  >('registrations');
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [verifications, setVerifications] = useState<PaymentVerification[]>([]);
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [expenses, setExpenses] = useState<EventExpense[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'yes' | 'payment_pending' | 'maybe' | 'no'
  >('all');
  const [selectedReg, setSelectedReg] = useState<EventRegistration | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [isGatePinModalOpen, setIsGatePinModalOpen] = useState(false);
  const [isSponsorshipModalOpen, setIsSponsorshipModalOpen] = useState(false);
  const [selectedSponsorship, setSelectedSponsorship] = useState<Sponsorship | null>(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<EventExpense | null>(null);
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


  // Fetch registrations and payment verifications
  const fetchRegistrations = async () => {
    setLoadingData(true);
    try {
      const [regRes, verifRes, eventRes] = await Promise.all([
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
        supabase
          .from('events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
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
      } else if (eventRes.data) {
        setActiveEvent(eventRes.data as ECKEvent);
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

  const fetchSponsorshipsData = async (eventIdToUse?: string) => {
    try {
      const targetId = eventIdToUse || activeEvent.id;
      const data = await fetchSponsorshipsFromDb(targetId);
      setSponsorships(data);
    } catch (err) {
      console.warn('Error fetching sponsorships data:', err);
    }
  };

  const handleSaveSponsorship = async (
    payload: Partial<Sponsorship>,
    screenshotFile?: File | null
  ): Promise<boolean> => {
    try {
      await saveSponsorshipToDb(
        {
          ...payload,
          event_id: activeEvent.id || null,
        },
        screenshotFile,
        activeEvent.event_slug
      );
      await fetchSponsorshipsData();
      return true;
    } catch (err: any) {
      console.error('Failed to save sponsorship:', err);
      alert('Failed to save sponsorship: ' + (err?.message || 'Unknown error'));
      return false;
    }
  };

  const fetchExpensesData = async (eventIdToUse?: string) => {
    try {
      const targetId = eventIdToUse || activeEvent.id;
      const data = await fetchExpensesFromDb(targetId);
      setExpenses(data);
    } catch (err) {
      console.warn('Error fetching expenses data:', err);
    }
  };

  const handleSaveExpense = async (
    payload: Partial<EventExpense>,
    receiptFile?: File | null
  ): Promise<boolean> => {
    try {
      await saveExpenseToDb(
        {
          ...payload,
          event_id: activeEvent.id || null,
        },
        receiptFile,
        activeEvent.event_slug
      );
      await fetchExpensesData();
      return true;
    } catch (err: any) {
      console.error('Failed to save expense:', err);
      alert('Failed to save expense: ' + (err?.message || 'Unknown error'));
      return false;
    }
  };

  const handleDeleteExpense = async (id: string): Promise<boolean> => {
    try {
      await deleteExpenseFromDb(id);
      await fetchExpensesData();
      return true;
    } catch (err: any) {
      console.error('Failed to delete expense:', err);
      alert('Failed to delete expense: ' + (err?.message || 'Unknown error'));
      return false;
    }
  };

  useEffect(() => {
    if (session) {
      fetchRegistrations();
      fetchSponsorshipsData();
      fetchExpensesData();
    }
  }, [session]);

  // Re-fetch sponsorships or expenses if activeEvent changes or when switching tabs
  useEffect(() => {
    if (session) {
      if (activeTab === 'sponsorships') {
        fetchSponsorshipsData();
      } else if (activeTab === 'expenses') {
        fetchExpensesData();
      }
    }
  }, [session, activeTab]);

  useEffect(() => {
    if (session && activeEvent.id && activeEvent.id !== 'mock-deepaura-2026') {
      fetchSponsorshipsData(activeEvent.id);
      fetchExpensesData(activeEvent.id);
    }
  }, [session, activeEvent.id]);

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
    const status =
      reg.attendance_status === 'yes'
        ? 'Confirmed Attending'
        : reg.attendance_status === 'payment_pending'
          ? 'Payment Pending (Awaiting Proof)'
          : reg.attendance_status;
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
      (() => {
        const verif = verifications.find((v) => v.registration_id === reg.id) || reg.payment_verifications?.[0];
        const n = verif?.notes || (reg as any).notes;
        return n ? `📝 *Notes:* ${n}` : '';
      })(),
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

  const handlePingMissingScreenshot = (e: React.MouseEvent, reg: EventRegistration) => {
    e.stopPropagation();
    const rawMobile = reg.alumni?.mobile || '';
    if (!isRealMobileNumber(rawMobile)) {
      alert('Mobile number was not provided for this registration.');
      return;
    }
    const mobile = rawMobile.replace(/[^0-9]/g, '');
    const target = mobile.length === 10 ? `91${mobile}` : mobile;
    const name = reg.alumni?.name || 'Alumnus';
    const batch = reg.alumni?.year_of_passing ? `Batch of ${reg.alumni.year_of_passing}` : '';
    const amount = reg.amount || 800;
    const text = `Namaste ${name} Ji! We noticed you started your registration for ECK-RTU Alumni DeepAura 2K26${batch ? ` (${batch})` : ''}, but the payment screenshot hasn't been uploaded yet. If you have completed your UPI payment of ₹${amount}, please reply with your screenshot here so we can confirm your official pass. Warm regards, ECK Alumni Team.`;
    window.open(`https://wa.me/${target}?text=${encodeURIComponent(text)}`, '_blank');
  };

  // Filtered registrations
  const filteredRegistrations = useMemo(() => {
    return registrations.filter((reg) => {
      const matchesStatus =
        statusFilter === 'all' ? true : reg.attendance_status === statusFilter;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchesStatus;

      const name = reg.alumni?.name?.toLowerCase() || '';
      const mobile = isRealMobileNumber(reg.alumni?.mobile) ? reg.alumni!.mobile.toLowerCase() : '';
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
    }).sort((a, b) => {
      const regA = a.registration_number || '';
      const regB = b.registration_number || '';
      if (regA && regB) {
        const cmp = regB.localeCompare(regA, undefined, { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return cmp;
      }
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
  }, [registrations, searchQuery, statusFilter]);

  // Summary Metrics
  const stats = useMemo(() => {
    const totalRegs = registrations.length;
    const attendingRegs = registrations.filter((r) => r.attendance_status === 'yes');
    const paymentPendingRegs = registrations.filter((r) => r.attendance_status === 'payment_pending');
    const totalAttendees = attendingRegs.reduce(
      (sum, r) => sum + (r.number_of_attendees || 1),
      0
    );
    const totalAmount = attendingRegs.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const pendingAmount = paymentPendingRegs.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const maybeCount = registrations.filter((r) => r.attendance_status === 'maybe').length;

    const confirmedSponsorshipAmount = sponsorships.reduce(
      (sum, s) => sum + Number(s.amount || 0),
      0
    );

    const grandTotalFunds = totalAmount + confirmedSponsorshipAmount;

    return {
      totalRegs,
      attendingCount: attendingRegs.length,
      totalAttendees,
      totalAmount,
      pendingAmount,
      maybeCount,
      paymentPendingCount: paymentPendingRegs.length,
      confirmedSponsorshipAmount,
      grandTotalFunds,
      sponsorshipsCount: sponsorships.length,
    };
  }, [registrations, sponsorships]);

  const getPublicScreenshotUrl = (path: string | null) => {
    if (!path) return null;
    const cleanPath = path.trim();
    if (!cleanPath || cleanPath === 'manual-admin-entry') return null;
    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) return cleanPath;
    const { data } = supabase.storage.from('payment-screenshots').getPublicUrl(cleanPath);
    const resolvedUrl = data?.publicUrl || null;
    console.log('[Admin Portal Screenshot URL]', { path: cleanPath, resolvedUrl });
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
                  <h1 className="admin-title">
                    {activeTab === 'gate_portal'
                      ? 'Gate Verification & Live Turnout'
                      : activeTab === 'upi_report'
                        ? 'UPI Reconciliation Ledger'
                        : activeTab === 'sponsorships'
                          ? 'Sponsorships Ledger'
                          : activeTab === 'expenses'
                            ? 'Event Budget & Expenses'
                            : 'Registrations Overview'}
                  </h1>
                  <p className="admin-subtitle">
                    {activeTab === 'gate_portal'
                      ? 'QR scanning, attendance & walk-ins.'
                      : activeTab === 'upi_report'
                        ? 'Track & verify payments across receiving UPI accounts.'
                        : activeTab === 'sponsorships'
                          ? 'Track Alumni sponsors'
                          : activeTab === 'expenses'
                            ? 'Track expected budget vs real expenses & net financial balance.'
                            : 'Verify screenshots and alumni submissions.'}
                  </p>
                </div>
                <div className="admin-actions">
                  <button
                    type="button"
                    onClick={() => setIsManualEntryOpen(true)}
                    className="btn btn-primary btn-sm admin-quick-entry-btn"
                    style={{
                      background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)',
                    }}
                    title="Quickly register alumnus who paid via QR/UPI directly"
                  >
                    <span>⚡</span>
                    <span>Quick Entry</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      fetchRegistrations();
                      fetchSponsorshipsData();
                      fetchExpensesData();
                    }}
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
                  <span className="tab-title">
                    <span className="tab-icon">📋</span>
                    <span className="tab-text-full">Registrations Directory</span>
                    <span className="tab-text-short">Directory</span>
                  </span>
                  <span className="admin-tab-count">{registrations.length}</span>
                </button>
                <button
                  type="button"
                  className={`admin-view-tab-btn ${activeTab === 'sponsorships' ? 'active' : ''}`}
                  onClick={() => setActiveTab('sponsorships')}
                >
                  <span className="tab-title">
                    <span className="tab-icon">💎</span>
                    <span className="tab-text-full">Sponsorships</span>
                    <span className="tab-text-short">Sponsors</span>
                  </span>
                  <span className="admin-tab-count">{sponsorships.length}</span>
                </button>
                <button
                  type="button"
                  className={`admin-view-tab-btn ${activeTab === 'expenses' ? 'active' : ''}`}
                  onClick={() => setActiveTab('expenses')}
                >
                  <span className="tab-title">
                    <span className="tab-icon">📊</span>
                    <span className="tab-text-full">Budget &amp; Expenses</span>
                    <span className="tab-text-short">Expenses</span>
                  </span>
                  <span className="admin-tab-count">{expenses.length}</span>
                </button>
                <button
                  type="button"
                  className={`admin-view-tab-btn ${activeTab === 'upi_report' ? 'active' : ''}`}
                  onClick={() => setActiveTab('upi_report')}
                >
                  <span className="tab-title">
                    <span className="tab-icon">💳</span>
                    <span className="tab-text-full">UPI Reconciliation Ledger</span>
                    <span className="tab-text-short">UPI Ledger</span>
                  </span>
                  <span className="admin-tab-count">
                    <span className="tab-count-full">{verifications.length} Tagged</span>
                    <span className="tab-count-short">{verifications.length}</span>
                  </span>
                </button>
                {isAdminGatePortalEnabled() && (
                  <button
                    type="button"
                    className={`admin-view-tab-btn ${activeTab === 'gate_portal' ? 'active' : ''}`}
                    onClick={() => setActiveTab('gate_portal')}
                  >
                    <span className="tab-title">
                      <span className="tab-icon">⚡</span>
                      <span className="tab-text-full">Gate Verification & Scanner</span>
                      <span className="tab-text-short">Gate Desk</span>
                    </span>
                    <span className="admin-tab-count gate-pill-badge">
                      <span className="tab-count-full">Live Desk</span>
                      <span className="tab-count-short">Live</span>
                    </span>
                  </button>
                )}
              </div>

              {activeTab === 'gate_portal' ? (
                <>
                  <div className="admin-gate-top-action-bar">
                    <div className="admin-gate-top-info">
                      <span className="admin-gate-top-icon">⚡</span>
                      <div className="admin-gate-top-text">
                        <div className="admin-gate-top-title-row">
                          <h3 className="admin-gate-top-title">Gate Desk Access</h3>
                          <span className="admin-gate-pill">PIN Protected</span>
                        </div>
                        <p className="admin-gate-top-subtitle">
                          Staff can scan &amp; verify attendee entry at <code>/gate</code> without accessing admin data.
                        </p>
                      </div>
                    </div>
                    <div className="admin-gate-top-btns">
                      <button
                        type="button"
                        onClick={() => setIsGatePinModalOpen(true)}
                        className="btn-gate-bar-action"
                      >
                        🔑 Manage PINs
                      </button>
                      <a
                        href="/gate"
                        target="_blank"
                        rel="noreferrer"
                        className="btn-gate-bar-secondary"
                      >
                        ↗ Open Desk
                      </a>
                    </div>
                  </div>
                  <GateVerificationPortal
                    registrations={registrations}
                    onRefreshRegistrations={fetchRegistrations}
                    staffName={session?.user?.email ? `Admin (${session.user.email.split('@')[0]})` : 'Admin Desk'}
                    stationName="Central Admin"
                  />
                </>
              ) : activeTab === 'sponsorships' ? (
                <SponsorshipsManager
                  sponsorships={sponsorships}
                  registrationAmount={stats.totalAmount}
                  totalAttendeesCount={stats.totalAttendees}
                  onAddSponsorship={() => {
                    setSelectedSponsorship(null);
                    setIsSponsorshipModalOpen(true);
                  }}
                  onEditSponsorship={(s) => {
                    setSelectedSponsorship(s);
                    setIsSponsorshipModalOpen(true);
                  }}
                  onRefresh={() => {
                    fetchRegistrations();
                    fetchSponsorshipsData();
                    fetchExpensesData();
                  }}
                  loading={loadingData}
                />
              ) : activeTab === 'expenses' ? (
                <EventExpensesManager
                  expenses={expenses}
                  registrationAmount={stats.totalAmount}
                  sponsorshipAmount={sponsorships.reduce((sum, s) => sum + Number(s.amount || 0), 0)}
                  registrationCount={stats.attendingCount}
                  totalHeadcount={stats.totalAttendees}
                  sponsorshipCount={sponsorships.length}
                  eventName={activeEvent.event_name}
                  onAddExpense={() => {
                    setSelectedExpense(null);
                    setIsExpenseModalOpen(true);
                  }}
                  onEditExpense={(item) => {
                    setSelectedExpense(item);
                    setIsExpenseModalOpen(true);
                  }}
                  onRefresh={() => {
                    fetchRegistrations();
                    fetchSponsorshipsData();
                    fetchExpensesData();
                  }}
                  loading={loadingData}
                />
              ) : activeTab === 'upi_report' ? (
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
                    <div className="admin-mobile-share-actions">
                      <button
                        type="button"
                        onClick={() => setIsShareModalOpen(true)}
                        className="btn btn-whatsapp-primary btn-sm"
                      >
                        💬 Broadcast List
                      </button>
                    </div>
                  </div>

                  {/* Stats Cards with Combined Grand Total */}
                  <div className="stats-grid">
                    <div className="stat-card">
                      <span className="stat-label">Total Submissions</span>
                      <span className="stat-value">{stats.totalRegs}</span>
                      <span className="stat-hint">
                        {stats.paymentPendingCount > 0 ? `${stats.paymentPendingCount} Pending • ` : ''}
                        {stats.maybeCount} Maybe
                      </span>
                    </div>

                    <div className="stat-card">
                      <span className="stat-label">Attending Headcount</span>
                      <span className="stat-value font-success">{stats.totalAttendees}</span>
                      <span className="stat-hint">
                        {stats.attendingCount} Confirmed Regs{stats.totalAttendees > stats.attendingCount ? ` (+${stats.totalAttendees - stats.attendingCount} guests)` : ''}
                      </span>
                    </div>

                    <div className="stat-card">
                      <span className="stat-label">Estimated Collection</span>
                      <span className="stat-value font-accent">₹{stats.totalAmount.toLocaleString('en-IN')}</span>
                      <span className="stat-hint">
                        {stats.pendingAmount > 0
                          ? `+ ₹${stats.pendingAmount.toLocaleString('en-IN')} pending`
                          : 'Via verified screenshot'}
                      </span>
                    </div>

                    <div className="stat-card">
                      <span className="stat-label">Total Funds Raised</span>
                      <span className="stat-value font-accent">₹{stats.grandTotalFunds.toLocaleString('en-IN')}</span>
                      <span className="stat-hint">
                        ₹{stats.totalAmount.toLocaleString('en-IN')} Regs + ₹{stats.confirmedSponsorshipAmount.toLocaleString('en-IN')} Sponsors
                      </span>
                    </div>
                  </div>

                  {/* Search & Filter Toolbar */}
                  <div className="admin-toolbar">
                    <div className="search-box">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
                        className={`filter-chip filter-chip-pending ${statusFilter === 'payment_pending' ? 'active' : ''}`}
                        onClick={() => setStatusFilter('payment_pending')}
                        title="Draft registrations pending payment screenshot"
                      >
                        ⏳ Payment Pending ({registrations.filter((r) => r.attendance_status === 'payment_pending').length})
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
                                {reg.attendance_status === 'yes'
                                  ? 'Attending'
                                  : reg.attendance_status === 'payment_pending'
                                    ? '⚠️ Payment Pending'
                                    : reg.attendance_status === 'maybe'
                                      ? 'Maybe'
                                      : 'Not Attending'}
                              </span>
                            </div>
                            <span className="reg-amount">
                              {reg.attendance_status === 'yes' || reg.attendance_status === 'payment_pending'
                                ? `₹${reg.amount}`
                                : '—'}
                            </span>
                          </div>

                          <div className="reg-card-body">
                            <h3 className="alumni-name">{reg.alumni?.name || 'Unknown Alumni'}</h3>
                            <p className="alumni-batch">
                              Batch of {reg.alumni?.year_of_passing || '—'} • {reg.alumni?.engineering_discipline || '—'}
                            </p>
                            <p className="alumni-contact">
                              📞 {formatDisplayMobile(reg.alumni?.mobile)} • 📍 {reg.alumni?.city}, {reg.alumni?.state}
                              {reg.alumni?.country && reg.alumni.country !== 'India' ? ` (${reg.alumni.country})` : ''}
                            </p>
                            {reg.alumni?.organization && (
                              <p className="alumni-org">💼 {reg.alumni.organization} ({reg.alumni.professional_category})</p>
                            )}
                          </div>

                          <div className="reg-card-footer">
                            <span className="reg-attendees">
                              👥 {reg.number_of_attendees}
                            </span>

                            {reg.payment_screenshot_path ? (
                              <span className="screenshot-tag tag-has-ss">
                                📷 {reg.payment_screenshot_path.includes(',')
                                  ? `${reg.payment_screenshot_path.split(',').filter(Boolean).length} Screenshots Attached`
                                  : 'Screenshot Attached'}
                              </span>
                            ) : (() => {
                              const regVerif = verifications.find((v) => v.registration_id === reg.id) || reg.payment_verifications?.[0];
                              const isVerifiedOrDesk =
                                regVerif?.verified_status === 'VERIFIED' ||
                                regVerif?.upi_id === 'CASH' ||
                                regVerif?.upi_id === 'COMPLIMENTARY' ||
                                (regVerif?.notes && regVerif.notes.toLowerCase().includes('spot'));

                              if (isVerifiedOrDesk) {
                                return (
                                  <span className="screenshot-tag" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                    ✓ Verified{regVerif?.upi_id === 'CASH' ? ' (Cash)' : ''}
                                  </span>
                                );
                              }

                              if (reg.attendance_status === 'payment_pending' || (reg.attendance_status === 'yes' && !reg.payment_screenshot_path)) {
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => handlePingMissingScreenshot(e, reg)}
                                    className="btn-card-reminder"
                                    title="Send WhatsApp reminder to submit payment screenshot"
                                  >
                                    🔔 Remind
                                  </button>
                                );
                              }

                              return null;
                            })()}

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
                  {isRealMobileNumber(selectedReg.alumni?.mobile) ? (
                    <a href={`tel:${selectedReg.alumni?.mobile}`} className="modal-val link-val">
                      {selectedReg.alumni?.mobile}
                    </a>
                  ) : (
                    <span className="modal-val">Not provided</span>
                  )}
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

                {(() => {
                  const regVerif =
                    verifications.find((v) => v.registration_id === selectedReg.id) ||
                    selectedReg.payment_verifications?.[0];
                  if (!regVerif?.upi_id) return null;
                  return (
                    <div className="modal-detail-item">
                      <span className="modal-label">Credited UPI Account</span>
                      <span className="modal-val font-mono" style={{ color: 'var(--primary-light)' }}>
                        {regVerif.upi_id}
                        {regVerif.verified_by ? ` (by ${regVerif.verified_by})` : ''}
                      </span>
                    </div>
                  );
                })()}

                {(() => {
                  const regVerif =
                    verifications.find((v) => v.registration_id === selectedReg.id) ||
                    selectedReg.payment_verifications?.[0];
                  const addlNotes = regVerif?.notes || (selectedReg as any).notes;
                  if (!addlNotes) return null;
                  return (
                    <div className="modal-detail-item" style={{ gridColumn: '1 / -1' }}>
                      <span className="modal-label">📝 Additional Notes</span>
                      <div
                        className="modal-val font-normal"
                        style={{
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          borderRadius: '8px',
                          padding: '10px 14px',
                          color: 'var(--text-main, #fff)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontSize: '0.88rem',
                          lineHeight: 1.5,
                          marginTop: '4px',
                        }}
                      >
                        {addlNotes}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Single Share Action Bar */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={() => handleCopySingleAlumnus(selectedReg)}
                  className={`btn btn-secondary btn-sm ${singleCopied ? 'btn-copied' : ''}`}
                >
                  {singleCopied ? '✓ Copied Details!' : '📋 Copy Details'}
                </button>
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
                          {singlePath === 'manual-admin-entry' ? (
                            <div style={{ padding: '12px', background: 'rgba(99, 102, 241, 0.1)', border: '1px dashed #6366f1', borderRadius: '8px', color: '#a5b4fc', fontSize: '0.85rem', textAlign: 'center' }}>
                              ⚡ Manual Admin Entry (Direct verification, no screenshot uploaded)
                            </div>
                          ) : (
                            <>
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
                            </>
                          )}
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

      {/* Quick Manual Offline Registration Modal */}
      <QuickManualRegistrationModal
        isOpen={isManualEntryOpen}
        onClose={() => setIsManualEntryOpen(false)}
        event={activeEvent}
        onSuccess={fetchRegistrations}
        currentUserEmail={session?.user?.email}
      />

      {/* Gate Staff PIN Management Modal */}
      <GateStaffManagerModal
        isOpen={isGatePinModalOpen}
        onClose={() => setIsGatePinModalOpen(false)}
      />

      {/* Sponsorship Entry & Edit Modal */}
      <SponsorshipModal
        isOpen={isSponsorshipModalOpen}
        onClose={() => {
          setIsSponsorshipModalOpen(false);
          setSelectedSponsorship(null);
        }}
        onSave={handleSaveSponsorship}
        initialData={selectedSponsorship}
        currentUserEmail={session?.user?.email}
      />

      {/* Expense Entry & Edit Modal */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => {
          setIsExpenseModalOpen(false);
          setSelectedExpense(null);
        }}
        onSave={handleSaveExpense}
        onDelete={handleDeleteExpense}
        initialData={selectedExpense}
        currentUserEmail={session?.user?.email}
        eventId={activeEvent.id}
      />
    </div>
  );
};
