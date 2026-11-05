import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { CentralTreasuryManager } from '../components/CentralTreasuryManager';
import { EventMemoryManagerModal } from '../components/EventMemoryManagerModal';
import { ExpenseModal } from '../components/ExpenseModal';
import { EventFeedbackManager } from '../components/EventFeedbackManager';
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
import { isCashAccount, CANONICAL_CASH_ACCOUNT } from '../lib/paymentRotation';
import { getRegistrationStatusInfo, syncEventRegistrationStatus } from '../lib/eventStatus';
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
  upi_id: null,
  banner_image_url: '/deepaura-banner.jpg',
  tagline: '“दीप जले, यादें मुस्कुराएँ।”',
  theme_primary_color: '#6366f1',
  theme_accent_color: '#f59e0b',
  qr_image_url: null,
  upi_rotation_configs: null,
  status: 'OPEN',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const getEffectiveRegAmount = (
  reg: EventRegistration,
  verifList?: PaymentVerification[]
): number => {
  const verif =
    reg.payment_verifications?.[0] ||
    (verifList ? verifList.find((v) => v.registration_id === reg.id) : undefined);
  if (verif && verif.amount !== undefined && verif.amount !== null && !isNaN(Number(verif.amount))) {
    return Number(verif.amount);
  }
  return Number(reg.amount || 0);
};

export const AdminPage: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'registrations' | 'sponsorships' | 'expenses' | 'treasury' | 'upi_report' | 'gate_portal' | 'feedback'
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
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<EventExpense | null>(null);
  const [activeEvent, setActiveEvent] = useState<ECKEvent>(DEFAULT_EVENT);
  const [allEvents, setAllEvents] = useState<ECKEvent[]>([DEFAULT_EVENT]);
  const [singleCopied, setSingleCopied] = useState(false);

  // Tab navigation scroll controls
  const tabNavRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const isPointerDownRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftStartRef = useRef(0);
  const hasMovedRef = useRef(false);

  const checkTabScrollState = useCallback(() => {
    const el = tabNavRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  }, []);

  useEffect(() => {
    const el = tabNavRef.current;
    if (!el) return;

    checkTabScrollState();

    // Wheel listener translates vertical mouse wheel into horizontal tab scroll
    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
        checkTabScrollState();
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('resize', checkTabScrollState);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', checkTabScrollState);
    };
  }, [checkTabScrollState, allEvents, registrations.length, verifications.length, sponsorships.length, expenses.length]);

  // When activeTab changes, auto scroll the active button into view
  useEffect(() => {
    const el = tabNavRef.current;
    if (!el) return;
    const activeBtn = el.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement | null;
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
    const timer = setTimeout(checkTabScrollState, 350);
    return () => clearTimeout(timer);
  }, [activeTab, checkTabScrollState]);

  const scrollTabs = (direction: 'left' | 'right') => {
    const el = tabNavRef.current;
    if (!el) return;
    const offset = direction === 'left' ? -240 : 240;
    el.scrollBy({ left: offset, behavior: 'smooth' });
    setTimeout(checkTabScrollState, 300);
  };

  const handleTabPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = tabNavRef.current;
    if (!el) return;
    isPointerDownRef.current = true;
    startXRef.current = e.clientX;
    scrollLeftStartRef.current = el.scrollLeft;
    hasMovedRef.current = false;
  };

  const handleTabPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current || !tabNavRef.current) return;
    const dx = e.clientX - startXRef.current;
    if (Math.abs(dx) > 4) {
      hasMovedRef.current = true;
      tabNavRef.current.scrollLeft = scrollLeftStartRef.current - dx;
      checkTabScrollState();
    }
  };

  const handleTabPointerUpOrLeave = () => {
    isPointerDownRef.current = false;
    setTimeout(checkTabScrollState, 100);
  };

  const selectTab = (tab: typeof activeTab) => {
    if (hasMovedRef.current) return;
    setActiveTab(tab);
  };

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

  // Fetch registrations, payment verifications & events
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
          .order('created_at', { ascending: false }),
      ]);

      if (regRes.error) {
        console.error('[Admin Portal] Failed to fetch registrations:', regRes.error);
        throw regRes.error;
      }
      const list = (regRes.data as any) || [];
      const verifList = (verifRes.data as any) || [];
      const eventsData = ((eventRes.data as any[]) || []).map((e: any) => {
        const ev = { ...e } as ECKEvent;
        const deadlineInfo = getRegistrationStatusInfo(ev);
        if (deadlineInfo.isClosed) ev.status = 'CLOSED';
        return ev;
      });
      if (eventsData.length > 0) {
        setAllEvents(eventsData);
      }

      // Normalize any cash variants in verifications in-memory
      verifList.forEach((v: any) => {
        if (isCashAccount(v.upi_id)) {
          v.upi_id = CANONICAL_CASH_ACCOUNT;
        }
      });

      // Opportunistically migrate any legacy 'cash' verifications to canonical 'Cash in Hand' in database
      const legacyCashVerifs = verifList.filter(
        (v: any) => v.id && v.upi_id && isCashAccount(v.upi_id) && v.upi_id !== CANONICAL_CASH_ACCOUNT
      );
      if (legacyCashVerifs.length > 0) {
        supabase
          .from('payment_verifications')
          .update({ upi_id: CANONICAL_CASH_ACCOUNT })
          .in('id', legacyCashVerifs.map((v: any) => v.id))
          .then(({ error }: any) => {
            if (error) console.warn('Could not auto-migrate legacy cash verifications:', error);
          });
      }

      // Attach payment verification entries to each registration
      list.forEach((reg: any) => {
        reg.payment_verifications = verifList.filter((v: any) => v.registration_id === reg.id);
      });

      console.log(`[Admin Portal] Loaded ${list.length} registrations and ${verifList.length} verifications.`);
      setRegistrations(list);
      setVerifications(verifList);
      if (list.length > 0 && list[0]?.events) {
        const ev = { ...list[0].events };
        const deadlineInfo = getRegistrationStatusInfo(ev);
        if (deadlineInfo.isClosed) ev.status = 'CLOSED';
        setActiveEvent(ev);
        syncEventRegistrationStatus(ev.event_slug, ev.status, ev.registration_closes_at).catch(() => { });
      } else if (eventsData.length > 0) {
        const ev = { ...eventsData[0] };
        const deadlineInfo = getRegistrationStatusInfo(ev);
        if (deadlineInfo.isClosed) ev.status = 'CLOSED';
        setActiveEvent(ev);
        syncEventRegistrationStatus(ev.event_slug, ev.status, ev.registration_closes_at).catch(() => { });
      }
    } catch (err) {
      console.warn('Registrations fetch note:', err);
      // Fallback demo data if Supabase is fresh or network is interrupted
      const sampleList: EventRegistration[] = [
        {
          id: '1',
          registration_number: 'REG-00001',
          event_id: 'e1',
          alumni_id: 'a1',
          attendance_status: 'yes',
          number_of_attendees: 2,
          amount: 800,
          payment_screenshot_path: 'https://images.unsplash.com/photo-1556742049-0a67c57750c9?auto=format&fit=crop&q=80&w=600',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          alumni: {
            id: 'a1',
            name: 'Rajesh Sharma',
            email: 'rajesh.sharma@example.com',
            mobile: '9829054321',
            address: '12, Talwandi',
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
      const cleanUpi = upiId.trim();
      const isCash = isCashAccount(cleanUpi);
      const canonicalUpi = isCash ? CANONICAL_CASH_ACCOUNT : cleanUpi.toLowerCase();

      const { error } = await supabase
        .from('payment_verifications')
        .upsert(
          {
            registration_id: registrationId,
            upi_id: canonicalUpi,
            amount: amount,
            verified_status: 'VERIFIED',
            notes: notes || (isCash ? 'Physical Cash in Hand' : null),
            verified_by: verifiedBy,
          },
          { onConflict: 'registration_id' }
        );

      if (error) {
        console.error('Error saving payment verification:', error);
        alert('Failed to save payment verification: ' + error.message);
        return false;
      }

      try {
        await supabase
          .from('event_registrations')
          .update({ amount: amount })
          .eq('id', registrationId);
      } catch (_) { }

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
    receiptFiles?: File[] | File | null
  ): Promise<boolean> => {
    try {
      await saveExpenseToDb(
        {
          ...payload,
          event_id: activeEvent.id || null,
        },
        receiptFiles,
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

  useEffect(() => {
    if (session) {
      if (activeTab === 'sponsorships' || activeTab === 'upi_report') {
        fetchSponsorshipsData();
      } else if (activeTab === 'expenses' || activeTab === 'treasury') {
        fetchExpensesData();
        fetchSponsorshipsData();
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

    const eventName = activeEvent?.event_name || 'ECK-RTU Alumni Event';
    const eventTagline = activeEvent?.tagline || '“दीप जले, यादें मुस्कुराएँ।”';

    const lines = [
      `✨ *${eventName.toUpperCase()}* ✨`,
      '🏛️ *Organised By:* ECK-RTU Alumni Kota Chapter',
      eventTagline ? `✨ *Tagline:* ${eventTagline}` : '',
      `🎉 *Registration Details: ${name}*`,
      '',
      `🎫 *Registration ID:* ${reg.registration_number}`,
      `👤 *Alumni Name:* ${name}`,
      batch ? `🎓 *Batch:* ${batch}${disc ? ` • ${disc}` : ''}` : '',
      city ? `📍 *Location:* ${city}` : '',
      `👥 *Attendees:* ${count} ${count === 1 ? 'Person' : 'People'}${count > 1 ? ` (Self + ${count - 1} accompanying)` : ''}`,
      `✨ *Attendance Status:* ${status.toUpperCase()}`,
      reg.attendance_status === 'yes' ? `💰 *Contribution:* ₹${getEffectiveRegAmount(reg, verifications)}` : '',
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
      eventTagline ? `*${eventTagline} See you at ${eventName}!* ✨` : `*See you at ${eventName}!* ✨`,
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
    const text = `Namaste ${name} Ji! We noticed you started your registration for ${activeEvent.event_name}${batch ? ` (${batch})` : ''}, but the payment screenshot hasn't been uploaded yet. If you have completed your UPI payment of ₹${amount}, please reply with your screenshot here so we can confirm your official pass. Warm regards, ECK Alumni Team.`;
    window.open(`https://wa.me/${target}?text=${encodeURIComponent(text)}`, '_blank');
  };

  // Registrations scoped to the active event, with safe fallback to all if none match strictly
  const scopedRegistrations = useMemo(() => {
    if (!activeEvent?.id || activeEvent.id === 'mock-deepaura-2026') return registrations;
    const filtered = registrations.filter((reg) => {
      const regEventId = reg.event_id || (reg as any).events?.id;
      const regEventSlug = (reg as any).events?.event_slug;
      return (
        regEventId === activeEvent.id ||
        (regEventSlug && regEventSlug === activeEvent.event_slug)
      );
    });
    return filtered.length > 0 ? filtered : registrations;
  }, [registrations, activeEvent.id, activeEvent.event_slug]);

  // Filtered registrations based on search & attendance status
  const filteredRegistrations = useMemo(() => {
    return scopedRegistrations.filter((reg) => {
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
  }, [scopedRegistrations, searchQuery, statusFilter]);

  // Summary Metrics
  const stats = useMemo(() => {
    const totalRegs = scopedRegistrations.length;
    const attendingRegs = scopedRegistrations.filter((r) => r.attendance_status === 'yes');
    const paymentPendingRegs = scopedRegistrations.filter((r) => r.attendance_status === 'payment_pending');
    const totalAttendees = attendingRegs.reduce(
      (sum, r) => sum + (r.number_of_attendees || 1),
      0
    );
    const totalAmount = attendingRegs.reduce((sum, r) => sum + getEffectiveRegAmount(r, verifications), 0);
    const pendingAmount = paymentPendingRegs.reduce((sum, r) => sum + getEffectiveRegAmount(r, verifications), 0);
    const maybeCount = scopedRegistrations.filter((r) => r.attendance_status === 'maybe').length;

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
  }, [scopedRegistrations, verifications, sponsorships]);

  const getPublicScreenshotUrl = (path: string | null) => {
    if (!path) return null;
    const cleanPath = path.trim();
    if (!cleanPath || cleanPath === 'manual-admin-entry') return null;
    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) return cleanPath;
    const { data } = supabase.storage.from('payment-screenshots').getPublicUrl(cleanPath);
    return data?.publicUrl || null;
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Header title="Organizer Portal" maxWidth="max-w-3xl" />
        <main className="flex-1 max-w-3xl w-full mx-auto px-3 sm:px-4 py-16 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Header title="Organizer Portal" tagline="ECK-RTU Alumni Registrations" maxWidth="max-w-3xl" />

      <main className="flex-1 max-w-3xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {!session ? (
          <AdminLogin onLoginSuccess={() => fetchRegistrations()} />
        ) : (
          <div className="space-y-5">
            {/* Top Bar with Sign Out */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {activeTab === 'gate_portal'
                    ? 'Gate Verification & Turnout'
                    : activeTab === 'feedback'
                      ? 'Alumni Feedback & Sentiments'
                      : activeTab === 'upi_report'
                        ? 'UPI Reconciliation Ledger'
                        : activeTab === 'sponsorships'
                          ? 'Sponsorships Ledger'
                          : activeTab === 'expenses'
                            ? 'Event Budget & Expenses'
                            : activeTab === 'treasury'
                              ? 'Central Treasury & Legacy Fund'
                              : 'Registrations Overview'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  {activeTab === 'gate_portal'
                    ? 'QR scanning, live attendance check-ins & walk-in spot entries.'
                    : activeTab === 'feedback'
                      ? 'Insights, ratings and ideas submitted by alumni.'
                      : activeTab === 'upi_report'
                        ? 'Track and verify UPI transaction screenshots.'
                        : activeTab === 'sponsorships'
                          ? 'Track Alumni sponsors and contributions.'
                          : activeTab === 'expenses'
                            ? 'Track expected budget vs real expenses.'
                            : activeTab === 'treasury'
                              ? 'Central liquidity, coordinator balances & legacy endowment.'
                              : 'Verify screenshots and alumni submissions.'}
                </p>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    fetchRegistrations();
                    fetchSponsorshipsData();
                    fetchExpensesData();
                  }}
                  disabled={loadingData}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                  title="Refresh Data"
                >
                  <span>🔄</span>
                  <span>{loadingData ? 'Syncing...' : 'Refresh'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                  title="Sign Out of Admin Portal"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>

            {/* Active Event Context & Action Bar */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-amber-400 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
                    🎪 Active Event
                  </span>
                  {allEvents.length > 1 ? (
                    <select
                      value={activeEvent.id}
                      onChange={(e) => {
                        const found = allEvents.find((ev) => ev.id === e.target.value);
                        if (found) setActiveEvent(found);
                      }}
                      className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-sm font-bold text-slate-100 outline-none focus:border-amber-500"
                      aria-label="Switch Active Event"
                    >
                      {allEvents.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.event_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm font-bold text-slate-100">{activeEvent.event_name}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full font-bold ${getRegistrationStatusInfo(activeEvent).isClosed ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                    {getRegistrationStatusInfo(activeEvent).isClosed ? '🔴 Online Reg: CLOSED' : '🟢 Online Reg: ACTIVE'}
                  </span>
                  <span className="text-slate-400">
                    Deadline: {getRegistrationStatusInfo(activeEvent).formattedDeadline}
                  </span>
                </div>
              </div>

              {/* Event-Tied Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsManualEntryOpen(true)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-indigo-500/20 flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.98]"
                  title={`Quick register alumnus for ${activeEvent.event_name}`}
                >
                  <span>⚡</span>
                  <span>Quick Entry</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsMemoryModalOpen(true)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  title={`Upload and curate photos & video for ${activeEvent.event_name}`}
                >
                  <span>📸</span>
                  <span>Event Media ({activeEvent.memory_media?.photos?.length || 0})</span>
                </button>
              </div>
            </div>

            {/* View Mode Navigation Tabs */}
            <div className="relative group border-b border-slate-800 pb-1">
              {/* Left Scroll Indicator Arrow */}
              {canScrollLeft && (
                <div className="absolute left-0 top-0 bottom-2 z-10 flex items-center pr-2 pl-0.5 bg-gradient-to-r from-slate-950 via-slate-950/90 to-transparent">
                  <button
                    type="button"
                    onClick={() => scrollTabs('left')}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-900/95 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-amber-500/40 shadow-lg shadow-black/80 transition-all cursor-pointer active:scale-95"
                    aria-label="Scroll tabs left"
                    title="Scroll left"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Right Scroll Indicator Arrow */}
              {canScrollRight && (
                <div className="absolute right-0 top-0 bottom-2 z-10 flex items-center pl-2 pr-0.5 bg-gradient-to-l from-slate-950 via-slate-950/90 to-transparent">
                  <button
                    type="button"
                    onClick={() => scrollTabs('right')}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-900/95 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-amber-500/40 shadow-lg shadow-black/80 transition-all cursor-pointer active:scale-95"
                    aria-label="Scroll tabs right"
                    title="Scroll right"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Scrollable Container with grab, wheel & touch support */}
              <div
                ref={tabNavRef}
                onScroll={checkTabScrollState}
                onPointerDown={handleTabPointerDown}
                onPointerMove={handleTabPointerMove}
                onPointerUp={handleTabPointerUpOrLeave}
                onPointerLeave={handleTabPointerUpOrLeave}
                className="flex overflow-x-auto tab-scrollbar gap-1.5 sm:gap-2 pb-2 px-0.5 select-none touch-pan-x cursor-grab active:cursor-grabbing"
              >
                <button
                  type="button"
                  data-tab="registrations"
                  data-active={activeTab === 'registrations'}
                  className={`min-h-[44px] shrink-0 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-colors cursor-pointer ${
                    activeTab === 'registrations'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                  onClick={() => selectTab('registrations')}
                >
                  <span>📋</span>
                  <span className="hidden sm:inline">Registrations Directory</span>
                  <span className="sm:hidden">Directory</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold ${activeTab === 'registrations' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                    {scopedRegistrations.length}
                  </span>
                </button>

                <button
                  type="button"
                  data-tab="sponsorships"
                  data-active={activeTab === 'sponsorships'}
                  className={`min-h-[44px] shrink-0 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-colors cursor-pointer ${
                    activeTab === 'sponsorships'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                  onClick={() => selectTab('sponsorships')}
                >
                  <span>💎</span>
                  <span className="hidden sm:inline">Sponsorships</span>
                  <span className="sm:hidden">Sponsors</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold ${activeTab === 'sponsorships' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                    {sponsorships.length}
                  </span>
                </button>

                <button
                  type="button"
                  data-tab="upi_report"
                  data-active={activeTab === 'upi_report'}
                  className={`min-h-[44px] shrink-0 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-colors cursor-pointer ${
                    activeTab === 'upi_report'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                  onClick={() => selectTab('upi_report')}
                >
                  <span>💳</span>
                  <span className="hidden sm:inline">UPI Reconciliation Ledger</span>
                  <span className="sm:hidden">UPI Ledger</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold ${activeTab === 'upi_report' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                    {verifications.length}
                  </span>
                </button>

                <button
                  type="button"
                  data-tab="expenses"
                  data-active={activeTab === 'expenses'}
                  className={`min-h-[44px] shrink-0 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-colors cursor-pointer ${
                    activeTab === 'expenses'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                  onClick={() => selectTab('expenses')}
                >
                  <span>📊</span>
                  <span className="hidden sm:inline">Budget &amp; Expenses</span>
                  <span className="sm:hidden">Expenses</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold ${activeTab === 'expenses' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                    {expenses.length}
                  </span>
                </button>

                <button
                  type="button"
                  data-tab="treasury"
                  data-active={activeTab === 'treasury'}
                  className={`min-h-[44px] shrink-0 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-colors cursor-pointer ${
                    activeTab === 'treasury'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                  onClick={() => selectTab('treasury')}
                >
                  <span>🏛️</span>
                  <span className="hidden sm:inline">Treasury &amp; Legacy Fund</span>
                  <span className="sm:hidden">Treasury</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold ${activeTab === 'treasury' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                    Ledger
                  </span>
                </button>

                {isAdminGatePortalEnabled() && (
                  <button
                    type="button"
                    data-tab="gate_portal"
                    data-active={activeTab === 'gate_portal'}
                    className={`min-h-[44px] shrink-0 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-colors cursor-pointer ${
                      activeTab === 'gate_portal'
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                    onClick={() => selectTab('gate_portal')}
                  >
                    <span>⚡</span>
                    <span className="hidden sm:inline">Gate Verification & Scanner</span>
                    <span className="sm:hidden">Gate Desk</span>
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Live
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  data-tab="feedback"
                  data-active={activeTab === 'feedback'}
                  className={`min-h-[44px] shrink-0 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-colors cursor-pointer ${
                    activeTab === 'feedback'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                  onClick={() => selectTab('feedback')}
                >
                  <span>❤️</span>
                  <span className="hidden sm:inline">Alumni Survey</span>
                  <span className="sm:hidden">Survey</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold ${activeTab === 'feedback' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                    Survey
                  </span>
                </button>
              </div>
            </div>

            {/* TAB CONTENTS */}
            {activeTab === 'gate_portal' ? (
              <div className="space-y-4">
                <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-indigo-950/40 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⚡</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm sm:text-base font-black text-white">Gate Desk Access</h3>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400">
                          PIN Protected
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Staff can scan &amp; verify attendee entry at <code className="text-amber-400">/gate</code> without accessing admin data.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setIsGatePinModalOpen(true)}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                    >
                      🔑 Manage PINs
                    </button>
                    <a
                      href="/gate"
                      target="_blank"
                      rel="noreferrer"
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs sm:text-sm font-semibold flex items-center transition-colors cursor-pointer"
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
              </div>
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
                eventId={activeEvent.id}
                event={activeEvent}
                expenseAccountsConfig={activeEvent?.expense_accounts_config}
                registrations={registrations}
                verifications={verifications}
                sponsorships={sponsorships}
                onAddExpense={() => {
                  setSelectedExpense(null);
                  setIsExpenseModalOpen(true);
                }}
                onEditExpense={(item) => {
                  setSelectedExpense(item);
                  setIsExpenseModalOpen(true);
                }}
                onSaveExpense={handleSaveExpense}
                onDeleteExpense={handleDeleteExpense}
                onRefresh={() => {
                  fetchRegistrations();
                  fetchSponsorshipsData();
                  fetchExpensesData();
                }}
                loading={loadingData}
              />
            ) : activeTab === 'treasury' ? (
              <CentralTreasuryManager
                expenses={expenses}
                registrations={registrations}
                verifications={verifications}
                sponsorships={sponsorships}
                activeEvent={activeEvent}
                allEvents={allEvents}
                onRefresh={() => {
                  fetchRegistrations();
                  fetchSponsorshipsData();
                  fetchExpensesData();
                }}
                loading={loadingData}
              />
            ) : activeTab === 'feedback' ? (
              <EventFeedbackManager
                eventId={activeEvent.id}
                eventName={activeEvent.event_name}
              />
            ) : activeTab === 'upi_report' ? (
              <UpiReconciliationReport
                registrations={registrations}
                verifications={verifications}
                sponsorships={sponsorships}
                event={activeEvent}
                onSaveVerification={handleSaveVerification}
                onEditSponsorship={(sp) => {
                  setSelectedSponsorship(sp);
                  setIsSponsorshipModalOpen(true);
                }}
                onRefresh={() => {
                  fetchRegistrations();
                  fetchSponsorshipsData();
                }}
                loading={loadingData}
                currentUserEmail={session?.user?.email}
              />
            ) : (
              <div className="space-y-5">
                {/* Mobile WhatsApp Broadcast Banner */}
                <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🪔</span>
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-white">Diwali WhatsApp Broadcast</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Share registered alumni list with passing year, location &amp; accompanying guests to WhatsApp!
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsShareModalOpen(true)}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-emerald-600/25 flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.98]"
                    >
                      💬 Broadcast List
                    </button>
                  </div>
                </div>

                {/* Stats Cards with Combined Grand Total */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex flex-col justify-between">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Total Submissions
                    </span>
                    <span className="text-xl sm:text-2xl font-black text-white mt-1">
                      {stats.totalRegs}
                    </span>
                    <span className="text-[11px] sm:text-xs text-slate-500 mt-1">
                      {stats.paymentPendingCount > 0 ? `${stats.paymentPendingCount} Pending • ` : ''}
                      {stats.maybeCount} Maybe
                    </span>
                  </div>

                  <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex flex-col justify-between">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Attending Headcount
                    </span>
                    <span className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">
                      {stats.totalAttendees}
                    </span>
                    <span className="text-[11px] sm:text-xs text-slate-500 mt-1">
                      {stats.attendingCount} Confirmed Regs{stats.totalAttendees > stats.attendingCount ? ` (+${stats.totalAttendees - stats.attendingCount} guests)` : ''}
                    </span>
                  </div>

                  <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex flex-col justify-between">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Estimated Collection
                    </span>
                    <span className="text-xl sm:text-2xl font-black text-amber-400 mt-1">
                      ₹{stats.totalAmount.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[11px] sm:text-xs text-slate-500 mt-1">
                      {stats.pendingAmount > 0
                        ? `+ ₹${stats.pendingAmount.toLocaleString('en-IN')} pending`
                        : 'Via verified screenshot'}
                    </span>
                  </div>

                  <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex flex-col justify-between">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Total Funds Raised
                    </span>
                    <span className="text-xl sm:text-2xl font-black text-amber-400 mt-1">
                      ₹{stats.grandTotalFunds.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[11px] sm:text-xs text-slate-500 mt-1">
                      ₹{stats.totalAmount.toLocaleString('en-IN')} Regs + ₹{stats.confirmedSponsorshipAmount.toLocaleString('en-IN')} Sponsors
                    </span>
                  </div>
                </div>

                {/* Search & Filter Toolbar */}
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                  <div className="relative flex-1 flex items-center">
                    <svg className="absolute left-3 w-4 h-4 text-slate-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search by name, mobile, branch, city..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full min-h-[44px] pl-9 pr-9 py-2 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-base text-slate-100 placeholder:text-slate-500 outline-none transition-colors"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
                        aria-label="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <button
                      type="button"
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                        statusFilter === 'all'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                          : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                      }`}
                      onClick={() => setStatusFilter('all')}
                    >
                      All ({scopedRegistrations.length})
                    </button>
                    <button
                      type="button"
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                        statusFilter === 'yes'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                          : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                      }`}
                      onClick={() => setStatusFilter('yes')}
                    >
                      Attending ({scopedRegistrations.filter((r) => r.attendance_status === 'yes').length})
                    </button>
                    <button
                      type="button"
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                        statusFilter === 'payment_pending'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                          : 'bg-slate-900 text-amber-400 border border-amber-500/30 hover:bg-slate-800'
                      }`}
                      onClick={() => setStatusFilter('payment_pending')}
                      title="Draft registrations pending payment screenshot"
                    >
                      ⏳ Pending ({scopedRegistrations.filter((r) => r.attendance_status === 'payment_pending').length})
                    </button>
                    <button
                      type="button"
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                        statusFilter === 'maybe'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                          : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                      }`}
                      onClick={() => setStatusFilter('maybe')}
                    >
                      Maybe ({scopedRegistrations.filter((r) => r.attendance_status === 'maybe').length})
                    </button>
                    <button
                      type="button"
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                        statusFilter === 'no'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                          : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                      }`}
                      onClick={() => setStatusFilter('no')}
                    >
                      No ({scopedRegistrations.filter((r) => r.attendance_status === 'no').length})
                    </button>
                  </div>
                </div>

                {/* Registrations List */}
                <div className="space-y-3">
                  {filteredRegistrations.length === 0 ? (
                    <div className="p-8 text-center bg-slate-900/60 rounded-2xl border border-slate-800 text-slate-400">
                      <p className="text-base font-bold text-slate-300">No registrations found</p>
                      <p className="text-xs text-slate-500 mt-1">Try clearing your search query or filters.</p>
                    </div>
                  ) : (
                    filteredRegistrations.map((reg) => (
                      <div
                        key={reg.id}
                        className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 transition-all shadow-md cursor-pointer hover:shadow-amber-500/5"
                        onClick={() => setSelectedReg(reg)}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md">
                              {reg.registration_number}
                            </span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                              reg.attendance_status === 'yes'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : reg.attendance_status === 'payment_pending'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : reg.attendance_status === 'maybe'
                                    ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}>
                              {reg.attendance_status === 'yes'
                                ? 'Attending'
                                : reg.attendance_status === 'payment_pending'
                                  ? '⚠️ Payment Pending'
                                  : reg.attendance_status === 'maybe'
                                    ? 'Maybe'
                                    : 'Not Attending'}
                            </span>
                          </div>
                          <span className="text-sm sm:text-base font-black text-amber-400">
                            {reg.attendance_status === 'yes' || reg.attendance_status === 'payment_pending'
                              ? `₹${getEffectiveRegAmount(reg, verifications)}`
                              : '—'}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base sm:text-lg font-black text-white hover:text-amber-400 transition-colors">
                            {reg.alumni?.name || 'Unknown Alumni'}
                          </h3>
                          <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                            Batch of {reg.alumni?.year_of_passing || '—'} • {reg.alumni?.engineering_discipline || '—'}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            📞 {formatDisplayMobile(reg.alumni?.mobile)} • 📍 {reg.alumni?.city}, {reg.alumni?.state}
                            {reg.alumni?.country && reg.alumni.country !== 'India' ? ` (${reg.alumni.country})` : ''}
                          </p>
                          {reg.alumni?.organization && (
                            <p className="text-xs text-slate-400 mt-1">
                              💼 {reg.alumni.organization} ({reg.alumni.professional_category})
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-slate-800 flex-wrap">
                          <span className="text-xs font-bold text-slate-300">
                            👥 {reg.number_of_attendees}
                          </span>

                          <div className="flex items-center gap-2 flex-wrap">
                            {reg.payment_screenshot_path ? (
                              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-md">
                                📷 {reg.payment_screenshot_path.includes(',')
                                  ? `${reg.payment_screenshot_path.split(',').filter(Boolean).length} Screenshots`
                                  : 'Screenshot'}
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
                                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-1 rounded-md">
                                    ✓ Verified{regVerif?.upi_id === 'CASH' ? ' (Cash)' : ''}
                                  </span>
                                );
                              }

                              if (reg.attendance_status === 'payment_pending' || (reg.attendance_status === 'yes' && !reg.payment_screenshot_path)) {
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => handlePingMissingScreenshot(e, reg)}
                                    className="min-h-[44px] px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 text-xs font-bold transition-colors cursor-pointer"
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
                              className="min-h-[44px] px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                              title="Share on WhatsApp"
                            >
                              💬 Share
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* REGISTRATION DETAIL MODAL */}
      {selectedReg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm"
          onClick={() => setSelectedReg(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-amber-500/30 rounded-2xl flex flex-col shadow-2xl overflow-hidden text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/80">
              <div>
                <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md">
                  {selectedReg.registration_number}
                </span>
                <h2 className="text-base sm:text-lg font-black text-white mt-1">
                  {selectedReg.alumni?.name}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleShareSingleAlumnus(selectedReg)}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Share registration via WhatsApp"
                >
                  💬 WhatsApp
                </button>
                <button
                  type="button"
                  className="min-h-[44px] min-w-[44px] p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                  onClick={() => setSelectedReg(null)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 sm:px-6 overflow-y-auto space-y-4 text-slate-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Mobile</span>
                  {isRealMobileNumber(selectedReg.alumni?.mobile) ? (
                    <a href={`tel:${selectedReg.alumni?.mobile}`} className="text-sm font-semibold text-amber-400 hover:underline">
                      {selectedReg.alumni?.mobile}
                    </a>
                  ) : (
                    <span className="text-sm text-slate-400">Not provided</span>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Email</span>
                  <span className="text-sm text-slate-200">{selectedReg.alumni?.email || 'Not provided'}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Year of Passing</span>
                  <span className="text-sm text-slate-200">Class of {selectedReg.alumni?.year_of_passing}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Discipline</span>
                  <span className="text-sm text-slate-200">{selectedReg.alumni?.engineering_discipline}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-0.5 sm:col-span-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Address</span>
                  <span className="text-sm text-slate-200">{selectedReg.alumni?.address || 'Not provided'}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Location</span>
                  <span className="text-sm text-slate-200">
                    {selectedReg.alumni?.city}, {selectedReg.alumni?.state}
                    {selectedReg.alumni?.country && selectedReg.alumni.country !== 'India'
                      ? ` • 🌐 ${selectedReg.alumni.country}`
                      : ' • 🇮🇳 India'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Employment Type</span>
                  <span className="text-sm text-slate-200">
                    {selectedReg.alumni?.employment_type || selectedReg.alumni?.professional_category || '—'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Industry / Domain</span>
                  <span className="text-sm text-slate-200">
                    {selectedReg.alumni?.industry_domain || '—'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Organization</span>
                  <span className="text-sm text-slate-200">{selectedReg.alumni?.organization || '—'}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Attendance &amp; Guests</span>
                  <span className="text-sm font-bold text-slate-100">
                    {selectedReg.attendance_status.toUpperCase()} ({selectedReg.number_of_attendees} persons)
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Contribution Amount</span>
                  <span className="text-sm font-black text-amber-400">
                    ₹{getEffectiveRegAmount(selectedReg, verifications)}
                  </span>
                </div>

                {(() => {
                  const regVerif =
                    verifications.find((v) => v.registration_id === selectedReg.id) ||
                    selectedReg.payment_verifications?.[0];
                  if (!regVerif?.upi_id) return null;
                  return (
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-0.5 sm:col-span-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Credited UPI Account</span>
                      <span className="text-sm font-mono text-indigo-300">
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
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-1 sm:col-span-2">
                      <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">📝 Additional Notes</span>
                      <div className="text-xs sm:text-sm text-slate-200 whitespace-pre-wrap break-words">
                        {addlNotes}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Single Share Action Bar */}
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => handleCopySingleAlumnus(selectedReg)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                >
                  {singleCopied ? '✓ Copied Details!' : '📋 Copy Details'}
                </button>
              </div>

              {/* Payment Screenshot Display */}
              <div className="pt-3 border-t border-slate-800">
                <h4 className="text-xs sm:text-sm font-bold text-slate-200 mb-3">
                  Payment Receipts ({
                    (selectedReg.payment_screenshot_path || '')
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean).length || 0
                  })
                </h4>
                {selectedReg.payment_screenshot_path ? (
                  <div className="space-y-4">
                    {(selectedReg.payment_screenshot_path || '')
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((singlePath, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                          <span className="block text-xs font-bold text-amber-400 mb-2">
                            {idx === 0
                              ? '📄 Receipt 1 (Initial Payment)'
                              : `📄 Receipt ${idx + 1} (Additional Payment / Extra Attendees)`}
                          </span>
                          {singlePath === 'manual-admin-entry' ? (
                            <div className="p-3 rounded-xl bg-indigo-500/10 border border-dashed border-indigo-500/30 text-indigo-300 text-xs text-center">
                              ⚡ Manual Admin Entry (Direct verification, no screenshot uploaded)
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <img
                                src={getPublicScreenshotUrl(singlePath) || ''}
                                alt={`Payment screenshot ${idx + 1}`}
                                className="w-full max-h-72 object-contain rounded-lg border border-slate-800 bg-black/40"
                              />
                              <a
                                href={getPublicScreenshotUrl(singlePath) || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                              >
                                🔗 Open Original Screenshot #{idx + 1}
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No screenshot attached (attendance status: {selectedReg.attendance_status}).</p>
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
        event={activeEvent}
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
        expenseAccountsConfig={activeEvent?.expense_accounts_config}
        expenses={expenses}
        registrations={registrations}
        verifications={verifications}
        sponsorships={sponsorships}
      />

      {/* Event Memory & Media Modal */}
      <EventMemoryManagerModal
        isOpen={isMemoryModalOpen}
        onClose={() => setIsMemoryModalOpen(false)}
        event={activeEvent}
        onSaveSuccess={(updatedMedia) => {
          setActiveEvent((prev) => ({
            ...prev,
            memory_media: updatedMedia,
          }));
          setAllEvents((prev) =>
            prev.map((e) => (e.id === activeEvent.id ? { ...e, memory_media: updatedMedia } : e))
          );
        }}
      />
    </div>
  );
};
