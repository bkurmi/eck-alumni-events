import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  verifyGateAttendee,
  spotRegisterAtGate,
  fetchGateEntries,
  fetchGateStats,
  isAdminGatePortalEnabled,
  type GatePortalStats,
} from '../lib/gate';
import { cleanMobileNumber } from '../lib/registrations';
import { calculateContribution } from '../lib/pricing';
import { DEFAULT_UPI_CONFIGS } from '../lib/paymentRotation';
import { ENGINEERING_DISCIPLINES } from '../types';
import type { EventRegistration, GateEntry, GateVerificationResult } from '../types';

interface GateVerificationPortalProps {
  registrations: EventRegistration[];
  onRefreshRegistrations: () => void;
  staffName?: string;
  stationName?: string;
  onLogout?: () => void;
}

export const GateVerificationPortal: React.FC<GateVerificationPortalProps> = ({
  registrations,
  onRefreshRegistrations,
  staffName,
  stationName,
  onLogout,
}) => {
  const isGateEnabled = isAdminGatePortalEnabled();
  const [activeSubTab, setActiveSubTab] = useState<'scanner' | 'manual' | 'spot' | 'log'>('scanner');
  const [gateEntries, setGateEntries] = useState<GateEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [rpcStats, setRpcStats] = useState<GatePortalStats | null>(null);

  // Scanner & Verification State
  const [scannerActive, setScannerActive] = useState(false);
  const [scanResult, setScanResult] = useState<GateVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const initialStaff = staffName
    ? stationName
      ? `${staffName} (${stationName})`
      : staffName
    : 'Gate 1 Staff';
  const [verifiedBy, setVerifiedBy] = useState(initialStaff);

  useEffect(() => {
    if (staffName) {
      setVerifiedBy(stationName ? `${staffName} (${stationName})` : staffName);
    }
  }, [staffName, stationName]);

  // Camera devices & Torch state
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Manual Lookup State (Phone & Predictive Name Search)
  const [manualLookupMode, setManualLookupMode] = useState<'phone' | 'name'>('phone');
  const [manualPhone, setManualPhone] = useState('');
  const [nameSearchQuery, setNameSearchQuery] = useState('');
  const [selectedAttendee, setSelectedAttendee] = useState<EventRegistration | null>(null);

  // Spot Registration State
  const [spotName, setSpotName] = useState('');
  const [spotMobile, setSpotMobile] = useState('');
  const [spotBranch, setSpotBranch] = useState('Computer Science');
  const [spotBatch, setSpotBatch] = useState<number | ''>(2020);
  const [spotAttendees, setSpotAttendees] = useState(1);
  const [spotAdults, setSpotAdults] = useState(1);
  const [spotKidsAbove10, setSpotKidsAbove10] = useState(0);
  const [spotKidsUnder10, setSpotKidsUnder10] = useState(0);
  const [showKidsBreakdown, setShowKidsBreakdown] = useState(false);
  const [spotPaymentMode, setSpotPaymentMode] = useState<string>('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [spotAmount, setSpotAmount] = useState(800);
  const [spotSubmitting, setSpotSubmitting] = useState(false);
  const [spotSuccessData, setSpotSuccessData] = useState<any | null>(null);
  const [preloadNotice, setPreloadNotice] = useState<string | null>(null);
  const [spotErrors, setSpotErrors] = useState<Record<string, boolean>>({});
  const [spotFormErrorMsg, setSpotFormErrorMsg] = useState<string | null>(null);

  // Currently selected UPI configuration (if paying via QR)
  const selectedUpiConfig = React.useMemo(() => {
    return DEFAULT_UPI_CONFIGS.find((c) => c.upi_id === spotPaymentMode) || null;
  }, [spotPaymentMode]);

  const handleCopyUpi = (upiId: string) => {
    try {
      navigator.clipboard.writeText(upiId);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      // fallback
    }
  };

  // Passing years matching RegistrationForm (Class of 2026 down to 1980)
  const currentYear = new Date().getFullYear();
  const passingYears = React.useMemo(() => {
    return Array.from({ length: currentYear - 1980 + 1 }, (_, i) => currentYear - i);
  }, [currentYear]);

  // Attendee dropdown options matching RegistrationForm pricing rules
  const attendeeOptions = React.useMemo(() => {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
      const calc = calculateContribution(num, 0, 0);
      const label =
        num === 1
          ? `1 Person (Single — ₹${calc.totalAmount})`
          : num === 2
            ? `2 Persons (Couple — ₹${calc.totalAmount})`
            : `${num} Persons (₹${calc.totalAmount})`;
      return { count: num, label, amount: calc.totalAmount };
    });
  }, []);

  // Log filter
  const [logSearch, setLogSearch] = useState('');

  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const isVerifyingRef = useRef(false);
  const statusResultRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll screen so the verification status is immediately visible
  const scrollToStatus = () => {
    const performScroll = () => {
      if (statusResultRef.current) {
        try {
          statusResultRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        } catch (_) { }

        // Fallback for mobile and emulation viewports
        try {
          const rect = statusResultRef.current.getBoundingClientRect();
          const headerOffset = 85;
          const targetY = window.pageYOffset + rect.top - headerOffset;
          window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
        } catch (_) { }
      }
    };
    requestAnimationFrame(performScroll);
    setTimeout(performScroll, 50);
    setTimeout(performScroll, 150);
  };

  // Scroll to status card whenever verifying starts or verification result arrives
  useEffect(() => {
    if (isVerifying || scanResult) {
      scrollToStatus();
    }
  }, [isVerifying, scanResult]);

  // Discover available cameras
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          const backCam = devices.find(
            (d) =>
              d.label.toLowerCase().includes('back') ||
              d.label.toLowerCase().includes('rear') ||
              d.label.toLowerCase().includes('environment')
          );
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        }
      })
      .catch((err) => {
        console.warn('Camera enumeration error (will fallback to environment facing):', err);
      });
  }, []);

  // Load gate entries & aggregated live stats on mount and whenever refreshed
  const loadGateEntries = async () => {
    setLoadingEntries(true);
    try {
      const [entriesData, statsData] = await Promise.all([
        fetchGateEntries(),
        fetchGateStats(),
      ]);
      setGateEntries(entriesData);
      if (statsData) {
        setRpcStats(statsData);
      }
    } catch (err) {
      console.warn('Failed to fetch gate entries or live stats:', err);
    } finally {
      setLoadingEntries(false);
    }
  };

  useEffect(() => {
    loadGateEntries();
  }, []);

  // Compute live gate statistics (Requirement #9)
  const stats = React.useMemo(() => {
    // If live aggregated stats were loaded from the database RPC, use them!
    if (rpcStats && (registrations.length === 0 || rpcStats.totalRegistered > 0)) {
      const totalVerifiedAtGate = Math.max(rpcStats.totalVerifiedAtGate, gateEntries.length);
      const totalHeadsInside = Math.max(
        rpcStats.totalHeadsInside,
        gateEntries.reduce((sum, entry) => sum + (entry.accompanying_count || 1), 0)
      );
      const turnoutPercent =
        rpcStats.totalPaid > 0
          ? Math.round((totalVerifiedAtGate / rpcStats.totalPaid) * 100)
          : 0;

      return {
        totalRegistered: rpcStats.totalRegistered,
        totalPaid: rpcStats.totalPaid,
        totalNotPaid: rpcStats.totalNotPaid,
        totalIdCardsGenerated: rpcStats.totalIdCardsGenerated,
        totalVerifiedAtGate,
        totalHeadsInside,
        turnoutPercent,
      };
    }

    // Fallback: Compute from registrations prop (e.g. in Admin Portal when logged in)
    const totalRegistered = registrations.length;
    const paidRegistrations = registrations.filter(
      (r) =>
        r.attendance_status === 'yes' ||
        r.payment_verifications?.some((v) => v.verified_status === 'VERIFIED')
    );
    const totalPaid = paidRegistrations.length;
    const totalNotPaid = Math.max(0, totalRegistered - totalPaid);
    const totalIdCardsGenerated = registrations.filter((r) => r.id_card_generated).length;

    // Gate entries counts
    const totalVerifiedAtGate = gateEntries.length;
    const totalHeadsInside = gateEntries.reduce((sum, entry) => sum + (entry.accompanying_count || 1), 0);
    const turnoutPercent = totalPaid > 0 ? Math.round((totalVerifiedAtGate / totalPaid) * 100) : 0;

    return {
      totalRegistered,
      totalPaid,
      totalNotPaid,
      totalIdCardsGenerated,
      totalVerifiedAtGate,
      totalHeadsInside,
      turnoutPercent,
    };
  }, [registrations, gateEntries, rpcStats]);

  // Handle QR scanning logic
  const handleVerifyPhone = async (phone: string, mode: 'qr_scan' | 'manual_phone' = 'qr_scan') => {
    if (isVerifyingRef.current) return;
    isVerifyingRef.current = true;
    setIsVerifying(true);
    setScanResult(null);
    scrollToStatus();

    // If scanning with camera, immediately stop to prevent duplicate scans
    if (mode === 'qr_scan') {
      if (scannerInstanceRef.current) {
        const scanner = scannerInstanceRef.current;
        scannerInstanceRef.current = null;
        if (scanner.isScanning) {
          scanner.stop().then(() => scanner.clear()).catch(() => { });
        } else {
          try { scanner.clear(); } catch (_) { }
        }
      }
      setScannerActive(false);
    }

    try {
      const result = await verifyGateAttendee(phone, verifiedBy, mode);
      setScanResult(result);
      if (result.success) {
        // Refresh entries and parent stats
        await loadGateEntries();
        onRefreshRegistrations();
      }
    } catch (err: any) {
      setScanResult({
        success: false,
        status: 'ERROR',
        message: err?.message || 'Verification failed. Please retry.',
      });
    } finally {
      setIsVerifying(false);
      setTimeout(() => {
        isVerifyingRef.current = false;
      }, 600);
      scrollToStatus();
    }
  };

  // Toggle Torch on supported devices
  const toggleTorch = async () => {
    if (!scannerInstanceRef.current || !scannerInstanceRef.current.isScanning) return;
    try {
      const nextState = !torchOn;
      await scannerInstanceRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState } as any],
      });
      setTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  // Setup HTML5 QR Code Scanner using clean Html5Qrcode engine
  useEffect(() => {
    if (activeSubTab !== 'scanner' || !scannerActive) {
      if (scannerInstanceRef.current) {
        const scanner = scannerInstanceRef.current;
        scannerInstanceRef.current = null;
        if (scanner.isScanning) {
          scanner.stop().then(() => scanner.clear()).catch(() => { });
        } else {
          try { scanner.clear(); } catch (_) { }
        }
      }
      setTorchOn(false);
      setTorchSupported(false);
      setCameraError(null);
      return;
    }

    let isMounted = true;
    const scanner = new Html5Qrcode('gate-reader-view');
    scannerInstanceRef.current = scanner;
    setCameraError(null);

    const cameraConfig = selectedCameraId ? selectedCameraId : { facingMode: 'environment' };

    scanner
      .start(
        cameraConfig,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          if (!isMounted) return;
          const clean = cleanMobileNumber(decodedText);
          if (clean.length === 10) {
            handleVerifyPhone(clean, 'qr_scan');
          }
        },
        () => {
          // ignore background frame progress
        }
      )
      .then(() => {
        if (!isMounted) return;
        try {
          const capabilities = scanner.getRunningTrackCameraCapabilities();
          if (capabilities && (capabilities as any).torchFeature && (capabilities as any).torchFeature().isSupported()) {
            setTorchSupported(true);
          } else {
            const track = scanner.getRunningTrackSettings();
            if (track) setTorchSupported(true);
          }
        } catch (_) { }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to start camera:', err);
        setCameraError(
          err?.message || 'Unable to access camera. Please allow camera permissions or use Phone Lookup.'
        );
      });

    return () => {
      isMounted = false;
      if (scanner.isScanning) {
        scanner.stop().then(() => scanner.clear()).catch(() => { });
      } else {
        try { scanner.clear(); } catch (_) { }
      }
      scannerInstanceRef.current = null;
    };
  }, [activeSubTab, scannerActive, selectedCameraId]);

  // Instant Predictive Name Search filter across registered alumni
  const filteredNameRegistrations = React.useMemo(() => {
    const query = nameSearchQuery.trim().toLowerCase();
    if (!query || query.length < 2) return [];

    const tokens = query.split(/\s+/).filter(Boolean);

    return registrations
      .filter((reg) => {
        const alumni = reg.alumni;
        if (!alumni) return false;

        const name = (alumni.name || '').toLowerCase();
        const branch = (alumni.engineering_discipline || '').toLowerCase();
        const year = String(alumni.year_of_passing || '');
        const mobile = cleanMobileNumber(alumni.mobile || '');
        const regNo = (reg.registration_number || '').toLowerCase();
        const city = (alumni.city || '').toLowerCase();
        const org = (alumni.organization || '').toLowerCase();

        // Every token must match at least one attendee attribute
        return tokens.every(
          (token) =>
            name.includes(token) ||
            branch.includes(token) ||
            year.includes(token) ||
            mobile.includes(token) ||
            regNo.includes(token) ||
            city.includes(token) ||
            org.includes(token)
        );
      })
      .slice(0, 20); // Top 20 for instant rendering
  }, [registrations, nameSearchQuery]);

  // Check live gate admission & payment status for an attendee
  const getAttendeeGateStatus = (reg: EventRegistration) => {
    const cleanMobile = cleanMobileNumber(reg.alumni?.mobile || '');
    const entry = gateEntries.find(
      (e) => (cleanMobile && cleanMobileNumber(e.phone_number) === cleanMobile) || e.registration_id === reg.id
    );

    if (entry) {
      const entryTime = new Date(entry.entered_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        status: 'ALREADY_ENTERED' as const,
        badgeText: `Entered at ${entryTime}`,
        entry,
      };
    }

    const isPaid =
      reg.attendance_status === 'yes' ||
      reg.payment_verifications?.some((v) => v.verified_status === 'VERIFIED');

    if (!isPaid) {
      if (reg.attendance_status === 'maybe') {
        return {
          status: 'MAYBE' as const,
          badgeText: 'Marked Maybe (Unpaid)',
          entry: null,
        };
      }
      return {
        status: 'PAYMENT_PENDING' as const,
        badgeText: 'Payment Pending',
        entry: null,
      };
    }

    return {
      status: 'READY' as const,
      badgeText: 'Ready for Entry',
      entry: null,
    };
  };

  // Handle Manual Phone Verification Form
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPhone.trim()) return;
    handleVerifyPhone(manualPhone, 'manual_phone');
  };

  // Handle Verification of an attendee selected via Name Search
  const handleVerifySelectedAttendee = (reg: EventRegistration) => {
    if (!reg.alumni?.mobile) {
      alert('No mobile number recorded for this attendee.');
      return;
    }
    handleVerifyPhone(reg.alumni.mobile, 'manual_phone');
  };

  // Reset lookup form and clear search selection
  const handleResetLookup = () => {
    setScanResult(null);
    setManualPhone('');
    setSelectedAttendee(null);
    setNameSearchQuery('');
  };

  // Redirect to Spot Walk-in Desk with pre-filled attendee data
  const handleRedirectToSpot = (data?: {
    name?: string;
    mobile?: string;
    branch?: string | null;
    batch?: number | string | null;
    adults?: number;
    kidsAbove10?: number;
    kidsUnder10?: number;
    amount?: number;
  }) => {
    if (data) {
      if (data.name) setSpotName(data.name);
      if (data.mobile) setSpotMobile(cleanMobileNumber(data.mobile));
      if (data.branch) setSpotBranch(data.branch);
      if (data.batch) setSpotBatch(Number(data.batch));
      const adults = data.adults || 1;
      const kAbove = data.kidsAbove10 || 0;
      const kUnder = data.kidsUnder10 || 0;
      setSpotAdults(adults);
      setSpotKidsAbove10(kAbove);
      setSpotKidsUnder10(kUnder);
      setSpotAttendees(adults + kAbove + kUnder);
      if (kAbove > 0 || kUnder > 0) setShowKidsBreakdown(true);
      if (data.amount && data.amount > 0) {
        setSpotAmount(data.amount);
      } else {
        const calc = calculateContribution(adults, kAbove, kUnder);
        setSpotAmount(calc.totalAmount);
      }
      if (data.name) {
        setPreloadNotice(
          `Pre-loaded attendee: ${data.name}. Confirm payment mode below to admit and issue pass.`
        );
      }
      setSpotPaymentMode('');
      setPaymentConfirmed(false);
      setSpotErrors({});
      setSpotFormErrorMsg(null);
    }
    setScanResult(null);
    setActiveSubTab('spot');
  };

  // Smart Mobile lookup on typing in Spot Walk-in form
  const handleSpotMobileChange = (val: string) => {
    const clean = val.replace(/\D/g, '');
    setSpotMobile(clean);
    if (clean.length === 10) {
      const matched = registrations.find(
        (r) => cleanMobileNumber(r.alumni?.mobile || '') === clean
      );
      if (matched && matched.alumni) {
        setSpotName(matched.alumni.name || '');
        if (matched.alumni.engineering_discipline) {
          setSpotBranch(matched.alumni.engineering_discipline);
        }
        if (matched.alumni.year_of_passing) {
          setSpotBatch(Number(matched.alumni.year_of_passing));
        }
        const adults = matched.adults_count || matched.number_of_attendees || 1;
        const kAbove = matched.children_above_7_count || 0;
        const kUnder = matched.children_under_7_count || 0;
        setSpotAdults(adults);
        setSpotKidsAbove10(kAbove);
        setSpotKidsUnder10(kUnder);
        setSpotAttendees(adults + kAbove + kUnder);
        if (kAbove > 0 || kUnder > 0) setShowKidsBreakdown(true);
        if (matched.amount && matched.amount > 0) {
          setSpotAmount(matched.amount);
        } else {
          const calc = calculateContribution(adults, kAbove, kUnder);
          setSpotAmount(calc.totalAmount);
        }
        const statusLabel =
          matched.attendance_status === 'payment_pending'
            ? 'Payment Pending'
            : matched.attendance_status === 'maybe'
              ? 'Marked Maybe'
              : 'Existing Record';
        setPreloadNotice(
          `✨ Existing record found for ${matched.alumni.name} (${statusLabel}). Details auto-loaded!`
        );
      } else {
        setPreloadNotice(null);
      }
    } else {
      setPreloadNotice(null);
    }
  };

  // Clear error highlight when volunteer updates a field
  const clearSpotError = (field: string) => {
    setSpotErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setSpotFormErrorMsg(null);
  };

  // Handle Spot Registration Submit
  const handleSpotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, boolean> = {};
    if (!spotMobile.trim() || cleanMobileNumber(spotMobile).length < 10) {
      errors.mobile = true;
    }
    if (!spotName.trim()) {
      errors.name = true;
    }
    if (!spotBranch) {
      errors.branch = true;
    }
    if (!spotBatch) {
      errors.batch = true;
    }
    if (!spotPaymentMode) {
      errors.paymentMode = true;
    }

    if (Object.keys(errors).length > 0) {
      setSpotErrors(errors);
      if (errors.paymentMode && Object.keys(errors).length === 1) {
        setSpotFormErrorMsg('Please select a payment method to complete gate entry.');
      } else {
        setSpotFormErrorMsg('Please fill in all mandatory fields highlighted in red.');
      }
      return;
    }

    setSpotErrors({});
    setSpotFormErrorMsg(null);

    const isUpi = Boolean(selectedUpiConfig);
    if (isUpi && !paymentConfirmed) {
      const ok = window.confirm(
        `Please confirm: Has the ₹${spotAmount} payment been received on ${selectedUpiConfig?.account_name}'s UPI (${selectedUpiConfig?.upi_id})?\n\nClick OK if payment is confirmed to complete gate entry.`
      );
      if (!ok) return;
    }

    setSpotSubmitting(true);
    setSpotSuccessData(null);

    const effectiveAmount = spotPaymentMode === 'COMPLIMENTARY' ? 0 : spotAmount;
    const verifiedByNote = isUpi
      ? `${verifiedBy} (UPI Verified: ${selectedUpiConfig?.account_name})`
      : verifiedBy;

    const res = await spotRegisterAtGate({
      name: spotName.trim(),
      mobile: spotMobile.trim(),
      discipline: spotBranch,
      year_of_passing: Number(spotBatch),
      numberOfAttendees: spotAttendees,
      paymentMode: spotPaymentMode,
      amount: effectiveAmount,
      verifiedBy: verifiedByNote,
    });

    setSpotSubmitting(false);

    if (res.success) {
      setSpotSuccessData(res.data);
      // Reset form
      setSpotName('');
      setSpotMobile('');
      setSpotBranch('Computer Science');
      setSpotBatch(2020);
      setSpotAdults(1);
      setSpotKidsAbove10(0);
      setSpotKidsUnder10(0);
      setSpotAttendees(1);
      setSpotAmount(800);
      setShowKidsBreakdown(false);
      setSpotPaymentMode('');
      setPaymentConfirmed(false);
      setSpotErrors({});
      setSpotFormErrorMsg(null);
      // Refresh entries
      await loadGateEntries();
      onRefreshRegistrations();
    } else {
      alert(res.error || 'Failed to complete spot registration.');
    }
  };

  // If Gate Portal is disabled by .env flag
  if (!isGateEnabled) {
    return (
      <div className="gate-disabled-container">
        <div className="gate-disabled-card">
          <span className="gate-disabled-badge">VITE_ENABLE_ADMIN_GATE_PORTAL is set to FALSE</span>
          <h2>Gate Verification & Scanner Inactive</h2>
          <p>
            The gate verification scanner, spot registrations, and physical attendance tracking are currently disabled.
          </p>
          <p className="gate-hint-text">
            To activate for the event on 1st November, set <code>VITE_ENABLE_ADMIN_GATE_PORTAL=true</code> in your <code>.env</code> file.
          </p>
        </div>
      </div>
    );
  }

  const filteredGateEntries = gateEntries.filter((entry) => {
    if (!logSearch.trim()) return true;
    const q = logSearch.toLowerCase();
    return (
      entry.attendee_name.toLowerCase().includes(q) ||
      entry.phone_number.includes(q) ||
      (entry.branch && entry.branch.toLowerCase().includes(q))
    );
  });

  return (
    <div className="gate-portal-container">
      {/* 1. Real-time Live Gate Metrics Bar (Requirement #9) */}
      <div className="gate-metrics-grid">
        <div className="gate-metric-card">
          <span className="metric-label">Total Registered</span>
          <span className="metric-val text-primary">{stats.totalRegistered}</span>
          <span className="metric-sub">Portal signups</span>
        </div>

        <div className="gate-metric-card">
          <span className="metric-label">Paid & Approved</span>
          <span className="metric-val text-emerald">{stats.totalPaid}</span>
          <span className="metric-sub">{stats.totalNotPaid} unpaid/pending</span>
        </div>

        <div className="gate-metric-card">
          <span className="metric-label">ID Cards Generated</span>
          <span className="metric-val text-indigo">{stats.totalIdCardsGenerated}</span>
          <span className="metric-sub">Downloaded passes</span>
        </div>

        <div className="gate-metric-card highlight-metric">
          <span className="metric-label">⚡ Gate Verified</span>
          <span className="metric-val text-amber">{stats.totalVerifiedAtGate}</span>
          <span className="metric-sub">{stats.turnoutPercent}% paid turnout</span>
        </div>

        <div className="gate-metric-card highlight-metric-dark">
          <span className="metric-label">👥 Heads Inside Venue</span>
          <span className="metric-val text-white">{stats.totalHeadsInside}</span>
          <span className="metric-sub">Including accompanying</span>
        </div>
      </div>

      {/* Staff Identifier bar */}
      <div className="gate-operator-bar">
        <div className="gate-operator-info">
          <span className="gate-active-dot" />
          <span className="gate-operator-label">Verified By:</span>
          {staffName ? (
            <span className="gate-staff-locked-badge">
              <strong>{verifiedBy}</strong>
            </span>
          ) : (
            <input
              type="text"
              value={verifiedBy}
              onChange={(e) => setVerifiedBy(e.target.value)}
              className="gate-staff-input"
              title="Gate Name or Volunteer Name"
            />
          )}
        </div>
        <div className="gate-operator-actions">
          <button
            type="button"
            onClick={loadGateEntries}
            className="btn-refresh-gate"
            title="Refresh attendance records"
          >
            {loadingEntries ? '↻ Refreshing...' : '↻ Refresh Log'}
          </button>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="btn-gate-exit-mini"
              title="Exit / Switch PIN"
            >
              Exit Desk
            </button>
          )}
        </div>
      </div>

      {/* 2. Sub-Tabs Navigation */}
      <div className="gate-subtabs">
        <button
          type="button"
          className={`gate-subtab-btn ${activeSubTab === 'scanner' ? 'active' : ''}`}
          onClick={() => {
            setActiveSubTab('scanner');
            setScannerActive(true);
          }}
        >
          <span className="gate-tab-icon">📷</span>
          <span className="gate-tab-full">QR Camera Scanner</span>
          <span className="gate-tab-short">QR Scanner</span>
        </button>
        <button
          type="button"
          className={`gate-subtab-btn ${activeSubTab === 'manual' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('manual')}
        >
          <span className="gate-tab-icon">🔍</span>
          <span className="gate-tab-full">Manual Lookup</span>
          <span className="gate-tab-short">Lookup</span>
        </button>
        <button
          type="button"
          className={`gate-subtab-btn ${activeSubTab === 'spot' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('spot')}
        >
          <span className="gate-tab-icon">⚡</span>
          <span className="gate-tab-full">Spot Walk-in Registration</span>
          <span className="gate-tab-short">Spot Entry</span>
        </button>
        <button
          type="button"
          className={`gate-subtab-btn ${activeSubTab === 'log' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('log')}
        >
          <span className="gate-tab-icon">📋</span>
          <span className="gate-tab-full">Gate Entry Log ({gateEntries.length})</span>
          <span className="gate-tab-short">Log ({gateEntries.length})</span>
        </button>
      </div>

      {/* 3. SUBTAB: QR Camera Scanner */}
      {activeSubTab === 'scanner' && (
        <div className="gate-scanner-section">
          {/* Active Camera Viewport */}
          {scannerActive && (
            <div className="scanner-active-box">
              {/* Custom Dark-Themed Camera Bar */}
              <div className="scanner-top-bar">
                {cameras.length > 1 && (
                  <div className="scanner-camera-picker">
                    <span className="camera-picker-label">📷</span>
                    <select
                      value={selectedCameraId}
                      onChange={(e) => setSelectedCameraId(e.target.value)}
                      className="scanner-camera-select"
                      title="Select Camera"
                    >
                      {cameras.map((cam, idx) => (
                        <option key={cam.id} value={cam.id}>
                          {cam.label || `Camera ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {torchSupported && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`scanner-torch-btn ${torchOn ? 'active' : ''}`}
                    title={torchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                  >
                    <span>{torchOn ? '🔦 Torch ON' : '💡 Torch'}</span>
                  </button>
                )}
              </div>

              {cameraError ? (
                <div className="scanner-error-card">
                  <span className="scanner-error-icon">⚠️</span>
                  <div className="scanner-error-text">
                    <h4>Camera Access Notice</h4>
                    <p>{cameraError}</p>
                    <div className="scanner-error-actions">
                      <button
                        type="button"
                        onClick={() => setActiveSubTab('manual')}
                        className="btn-primary-action"
                        style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                      >
                        ⌨️ Use Phone Lookup Instead
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCameraError(null);
                          setScannerActive(false);
                          setTimeout(() => setScannerActive(true), 150);
                        }}
                        className="btn-secondary"
                        style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                      >
                        🔄 Retry Camera
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="scanner-viewport-wrapper">
                  <div id="gate-reader-view" className="gate-qr-viewport" />
                  <div className="scanner-reticle-overlay">
                    <div className="scanner-reticle-box">
                      <span className="scanner-corner scanner-corner-tl" />
                      <span className="scanner-corner scanner-corner-tr" />
                      <span className="scanner-corner scanner-corner-bl" />
                      <span className="scanner-corner scanner-corner-br" />
                      <div className="scanner-laser-line" />
                    </div>
                    <span className="scanner-overlay-hint">Align QR Code inside box</span>
                  </div>
                </div>
              )}

              <div className="scanner-controls-row">
                <button
                  type="button"
                  onClick={() => setScannerActive(false)}
                  className="btn-stop-camera"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  <span>Pause Scanner</span>
                </button>
              </div>
            </div>
          )}

          {/* In-Flight Verification Spinner Card */}
          {isVerifying && (
            <div ref={statusResultRef} className="gate-scan-result-card verifying">
              <div className="result-content">
                <div className="result-icon gate-scan-spinner-icon">🔄</div>
                <div className="result-text">
                  <h3 className="result-title">VERIFYING ATTENDEE...</h3>
                  <p className="result-name">Checking registration &amp; payment status in real-time</p>
                </div>
              </div>
            </div>
          )}

          {/* Verification Status Banner Alert */}
          {!isVerifying && scanResult && (
            <div ref={statusResultRef} className={`gate-scan-result-card ${scanResult.status.toLowerCase()}`}>
              {scanResult.status === 'ENTERED' && (
                <>
                  <div className="result-content success">
                    <div className="result-icon">✅</div>
                    <div className="result-text">
                      <h3 className="result-title">VERIFIED SUCCESSFULLY</h3>
                      <p className="result-name">{scanResult.attendee_name}</p>
                      <div className="result-badges">
                        <span className="result-pill">{scanResult.registration_number}</span>
                        <span className="result-pill">{scanResult.branch} ({scanResult.year_of_passing})</span>
                        <span className="result-pill count-pill">
                          👥 {scanResult.number_of_attendees || 1} Attendees Allowed
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="result-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setScanResult(null);
                        setScannerActive(true);
                      }}
                      className="btn-scan-next btn-success"
                    >
                      <span>📷</span>
                      <span>Scan Next Attendee →</span>
                    </button>
                  </div>
                </>
              )}

              {scanResult.status === 'ALREADY_ENTERED' && (
                <>
                  <div className="result-content warning">
                    <div className="result-icon">⚠️</div>
                    <div className="result-text">
                      <h3 className="result-title">ALREADY ENTERED (DUPLICATE PASS)</h3>
                      <p className="result-detail">{scanResult.message}</p>
                      <p className="result-sub">
                        Attendee: <strong>{scanResult.attendee_name}</strong> ({scanResult.registration_number})
                      </p>
                    </div>
                  </div>
                  <div className="result-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setScanResult(null);
                        setScannerActive(true);
                      }}
                      className="btn-scan-next btn-warning"
                    >
                      <span>📷</span>
                      <span>Scan Next Attendee →</span>
                    </button>
                  </div>
                </>
              )}

              {scanResult.status === 'PAYMENT_PENDING' && (
                <>
                  <div className="result-content error">
                    <div className="result-icon">❌</div>
                    <div className="result-text">
                      <h3 className="result-title">PAYMENT NOT APPROVED</h3>
                      <p className="result-detail">{scanResult.message}</p>
                      <p className="result-sub">
                        Attendee: <strong>{scanResult.attendee_name}</strong> • Amount Due: ₹{scanResult.amount}
                      </p>
                    </div>
                  </div>
                  <div className="result-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setScanResult(null);
                        setScannerActive(true);
                      }}
                      className="btn-scan-next btn-error"
                    >
                      <span>📷</span>
                      <span>Scan Next Attendee →</span>
                    </button>
                  </div>
                </>
              )}

              {scanResult.status === 'NOT_FOUND' && (
                <>
                  <div className="result-content error">
                    <div className="result-icon">❓</div>
                    <div className="result-text">
                      <h3 className="result-title">NOT REGISTERED</h3>
                      <p className="result-detail">{scanResult.message}</p>
                    </div>
                  </div>
                  <div className="result-actions">
                    <button
                      type="button"
                      className="btn-scan-next btn-secondary-outline"
                      onClick={() => {
                        setScanResult(null);
                        setScannerActive(true);
                      }}
                    >
                      <span>📷</span>
                      <span>Scan Next Attendee →</span>
                    </button>
                    <button
                      type="button"
                      className="btn-quick-spot-link"
                      onClick={() => setActiveSubTab('spot')}
                    >
                      <span>⚡ Spot Register this Attendee →</span>
                    </button>
                  </div>
                </>
              )}

              {scanResult.status === 'ERROR' && (
                <>
                  <div className="result-content error">
                    <div className="result-icon">⚠️</div>
                    <div className="result-text">
                      <h3 className="result-title">VERIFICATION ERROR</h3>
                      <p className="result-detail">{scanResult.message || 'Verification failed. Please retry.'}</p>
                    </div>
                  </div>
                  <div className="result-actions">
                    <button
                      type="button"
                      className="btn-scan-next btn-error"
                      onClick={() => {
                        setScanResult(null);
                        setScannerActive(true);
                      }}
                    >
                      <span>📷</span>
                      <span>Retry / Scan Next →</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* If scanner is inactive and no scan in-flight or result is present, show Camera Start button */}
          {!scannerActive && !isVerifying && !scanResult && (
            <div className="scanner-start-box">
              <div className="scanner-start-icon-ring">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <h3 className="scanner-start-title">Gate Camera Check-in</h3>
              <p className="scanner-hint">
                Turn your phone or laptop camera into an instant, high-speed QR gate scanner.
              </p>
              <button
                type="button"
                onClick={() => setScannerActive(true)}
                className="btn-large-camera"
              >
                <span>📷</span>
                <span>Start Camera Scanner</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. SUBTAB: Manual Lookup (Phone & Predictive Name Search) */}
      {activeSubTab === 'manual' && (
        <div className="gate-manual-section">
          <div className="gate-card-box">
            <h3>Manual Gate Verification</h3>
            <p className="card-sub-desc">
              Look up and verify an attendee by mobile number or name if their QR code is unavailable:
            </p>

            {/* Segmented Mode Switcher */}
            <div className="manual-mode-segmented-bar">
              <button
                type="button"
                className={`manual-mode-btn ${manualLookupMode === 'phone' ? 'active' : ''}`}
                onClick={() => {
                  setManualLookupMode('phone');
                  setScanResult(null);
                }}
              >
                <span>📱 Search by Phone</span>
              </button>
              <button
                type="button"
                className={`manual-mode-btn ${manualLookupMode === 'name' ? 'active' : ''}`}
                onClick={() => {
                  setManualLookupMode('name');
                  setScanResult(null);
                }}
              >
                <span>👤 Search by Name / Batch</span>
              </button>
            </div>

            {/* MODE 1: Phone Search */}
            {manualLookupMode === 'phone' && (
              <form onSubmit={handleManualSubmit} className="gate-manual-form">
                <div className="manual-input-row">
                  <input
                    type="tel"
                    placeholder="10-digit registered phone number"
                    maxLength={10}
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value.replace(/\D/g, ''))}
                    className="manual-phone-field"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={isVerifying || manualPhone.length < 10}
                    className="btn-primary-action btn-verify-manual"
                  >
                    {isVerifying ? 'Checking...' : 'Verify & Allow Entry →'}
                  </button>
                </div>
              </form>
            )}

            {/* MODE 2: Smart Predictive Name Search */}
            {manualLookupMode === 'name' && (
              <div className="name-search-container">
                {/* Search Input Bar */}
                <div className="name-search-input-wrapper">
                  <span className="name-search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Type name (e.g. Rahul), batch (2012), or branch (CSE)..."
                    value={nameSearchQuery}
                    onChange={(e) => {
                      setNameSearchQuery(e.target.value);
                      if (selectedAttendee) setSelectedAttendee(null);
                    }}
                    className="name-search-input"
                    autoFocus
                  />
                  {nameSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setNameSearchQuery('');
                        setSelectedAttendee(null);
                      }}
                      className="name-search-clear-btn"
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* If an attendee is selected, show detailed confirmation card */}
                {selectedAttendee && selectedAttendee.alumni && (() => {
                  const alumni = selectedAttendee.alumni;
                  const gateStatus = getAttendeeGateStatus(selectedAttendee);
                  const initials = (alumni.name || 'A')
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <div className="attendee-selected-card">
                      <div className="attendee-selected-top">
                        <div className="attendee-selected-profile">
                          <div className="attendee-selected-avatar">
                            {selectedAttendee.photo_url ? (
                              <img
                                src={selectedAttendee.photo_url}
                                alt={alumni.name}
                                className="name-result-photo"
                              />
                            ) : (
                              <span>{initials}</span>
                            )}
                          </div>
                          <div className="attendee-selected-details">
                            <h4 className="attendee-selected-name">{alumni.name}</h4>
                            <span className="attendee-selected-reg">
                              {selectedAttendee.registration_number} • Class of {alumni.year_of_passing || '—'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedAttendee(null)}
                          className="btn-back-to-search"
                        >
                          ← Change
                        </button>
                      </div>

                      {/* Detail Grid */}
                      <div className="attendee-selected-grid">
                        <div className="attendee-grid-item">
                          <span className="grid-label">Branch</span>
                          <span className="grid-value">{alumni.engineering_discipline || 'Alumni'}</span>
                        </div>
                        <div className="attendee-grid-item">
                          <span className="grid-label">Phone</span>
                          <span className="grid-value">📞 {alumni.mobile}</span>
                        </div>
                        <div className="attendee-grid-item">
                          <span className="grid-label">Party Size</span>
                          <span className="grid-value text-gold">
                            👥 {selectedAttendee.number_of_attendees || 1} Total
                          </span>
                        </div>
                        <div className="attendee-grid-item">
                          <span className="grid-label">City</span>
                          <span className="grid-value">{alumni.city || '—'}</span>
                        </div>
                      </div>

                      {/* Status Warnings or Badges */}
                      {gateStatus.status === 'ALREADY_ENTERED' && (
                        <>
                          <div className="attendee-selected-alert entered">
                            ⚠️ {gateStatus.badgeText} (by {gateStatus.entry?.verified_by || 'Gate Staff'})
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveSubTab('log')}
                            className="btn-scan-next btn-secondary-outline"
                            style={{ width: '100%' }}
                          >
                            <span>📋</span>
                            <span>View in Gate Entry Log →</span>
                          </button>
                        </>
                      )}

                      {(gateStatus.status === 'PAYMENT_PENDING' || gateStatus.status === 'MAYBE') && (
                        <>
                          <div className="attendee-selected-alert pending">
                            💳 {gateStatus.status === 'MAYBE' ? 'Registered as MAYBE (Unpaid)' : `Payment Pending (₹${selectedAttendee.amount || 0})`}. Please collect fee in Spot Entry.
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleRedirectToSpot({
                                name: alumni.name,
                                mobile: alumni.mobile,
                                branch: alumni.engineering_discipline,
                                batch: alumni.year_of_passing,
                                adults: selectedAttendee.adults_count || selectedAttendee.number_of_attendees || 1,
                                kidsAbove10: selectedAttendee.children_above_7_count || 0,
                                kidsUnder10: selectedAttendee.children_under_7_count || 0,
                                amount: selectedAttendee.amount,
                              })
                            }
                            className="btn-redirect-spot"
                          >
                            <span>⚡</span>
                            <span>Collect Fee &amp; Admit in Spot Entry ({alumni.name}) →</span>
                          </button>
                        </>
                      )}

                      {gateStatus.status === 'READY' && (
                        <button
                          type="button"
                          disabled={isVerifying}
                          onClick={() => handleVerifySelectedAttendee(selectedAttendee)}
                          className="btn-verify-selected"
                        >
                          <span>✅</span>
                          <span>
                            {isVerifying
                              ? 'Checking...'
                              : `Verify & Allow Entry (${alumni.name}) →`}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* If no attendee is selected yet */}
                {!selectedAttendee && (
                  <>
                    {nameSearchQuery.trim().length < 2 ? (
                      <div className="name-search-hint-box">
                        <p>
                          ⚡ <strong>Predictive Attendee Search:</strong> Type at least 2 letters of an
                          attendee's name, passing year (e.g. <em>2015</em>), or branch.
                        </p>
                        <div className="name-search-chips">
                          <span className="name-search-chip" onClick={() => setNameSearchQuery('Computer')}>💻 Computer</span>
                          <span className="name-search-chip" onClick={() => setNameSearchQuery('Mechanical')}>⚙️ Mechanical</span>
                          <span className="name-search-chip" onClick={() => setNameSearchQuery('Electrical')}>⚡ Electrical</span>
                          <span className="name-search-chip" onClick={() => setNameSearchQuery('Civil')}>🏗️ Civil</span>
                          <span className="name-search-chip" onClick={() => setNameSearchQuery('2024')}>🎓 2024</span>
                          <span className="name-search-chip" onClick={() => setNameSearchQuery('2018')}>🎓 2018</span>
                        </div>
                      </div>
                    ) : filteredNameRegistrations.length === 0 ? (
                      <div className="name-search-hint-box">
                        <p>
                          🔍 No registered alumni found matching <strong>"{nameSearchQuery}"</strong>.
                        </p>
                        <p style={{ fontSize: '0.82rem', margin: 0 }}>
                          Check the spelling, or register this attendee directly at Spot Walk-in Desk:
                        </p>
                        <button
                          type="button"
                          onClick={() => handleRedirectToSpot({ name: nameSearchQuery })}
                          className="btn-spot-create-new"
                        >
                          ⚡ Register "{nameSearchQuery}" at Spot Walk-in Desk →
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="name-search-header-meta">
                          <span>Found {filteredNameRegistrations.length} matching alumni</span>
                          <span>Click to select &amp; admit</span>
                        </div>

                        <div className="name-search-results-list">
                          {filteredNameRegistrations.map((reg) => {
                            const alumni = reg.alumni;
                            if (!alumni) return null;
                            const gateStatus = getAttendeeGateStatus(reg);
                            const initials = (alumni.name || 'A')
                              .split(' ')
                              .map((p) => p[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase();

                            return (
                              <div
                                key={reg.id}
                                className="name-search-result-card"
                                onClick={() => setSelectedAttendee(reg)}
                                role="button"
                                tabIndex={0}
                              >
                                <div className="name-result-avatar">
                                  {reg.photo_url ? (
                                    <img
                                      src={reg.photo_url}
                                      alt={alumni.name}
                                      className="name-result-photo"
                                    />
                                  ) : (
                                    <span>{initials}</span>
                                  )}
                                </div>

                                <div className="name-result-info">
                                  <div className="name-result-header">
                                    <span className="name-result-name">{alumni.name}</span>
                                    <span
                                      className="result-pill"
                                      style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                                    >
                                      {reg.registration_number}
                                    </span>
                                  </div>
                                  <div className="name-result-meta">
                                    <span>
                                      🎓 {alumni.engineering_discipline || 'Alumni'} ({alumni.year_of_passing || '—'})
                                    </span>
                                    <span>•</span>
                                    <span>📞 {alumni.mobile}</span>
                                    <span>•</span>
                                    <span>👥 {reg.number_of_attendees || 1} Total</span>
                                  </div>
                                </div>

                                <div className="name-result-status-col">
                                  {gateStatus.status === 'READY' && (
                                    <span className="gate-status-pill ready">🟢 Ready</span>
                                  )}
                                  {gateStatus.status === 'ALREADY_ENTERED' && (
                                    <span className="gate-status-pill entered">⚠️ Entered</span>
                                  )}
                                  {gateStatus.status === 'PAYMENT_PENDING' && (
                                    <span className="gate-status-pill pending">💳 Unpaid</span>
                                  )}
                                  <span className="name-result-select-indicator">Select →</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Same result feedback card */}
            {scanResult && (
              <div
                ref={statusResultRef}
                className={`gate-scan-result-card ${scanResult.status.toLowerCase()}`}
                style={{ marginTop: '1.25rem' }}
              >
                <div className="result-content">
                  <div className="result-icon">
                    {scanResult.status === 'ENTERED' ? '✅' : scanResult.status === 'ALREADY_ENTERED' ? '⚠️' : '❌'}
                  </div>
                  <div className="result-text">
                    <h3 className="result-title">{scanResult.status.replace(/_/g, ' ')}</h3>
                    <p className="result-name">{scanResult.attendee_name || scanResult.message}</p>
                    {scanResult.number_of_attendees && (
                      <p className="result-sub">👥 {scanResult.number_of_attendees} Total Persons</p>
                    )}
                  </div>
                </div>

                {(scanResult.status === 'PAYMENT_PENDING' || scanResult.status === 'NOT_FOUND') && (
                  <button
                    type="button"
                    onClick={() =>
                      handleRedirectToSpot({
                        name: scanResult.attendee_name || (selectedAttendee?.alumni?.name) || '',
                        mobile: scanResult.phone_number || manualPhone || (selectedAttendee?.alumni?.mobile) || '',
                        branch: scanResult.branch || (selectedAttendee?.alumni?.engineering_discipline) || '',
                        batch: scanResult.year_of_passing || (selectedAttendee?.alumni?.year_of_passing) || '',
                        adults: scanResult.number_of_attendees || (selectedAttendee?.number_of_attendees) || 1,
                        amount: scanResult.amount || (selectedAttendee?.amount) || 0,
                      })
                    }
                    className="btn-redirect-spot"
                    style={{ marginTop: '0.85rem' }}
                  >
                    <span>⚡</span>
                    <span>Collect Fee &amp; Admit at Spot Desk →</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleResetLookup}
                  className="btn-reset-lookup"
                >
                  🔍 Verify Another Attendee
                </button>
              </div>
            )}
          </div>
        </div>
      )}


      {/* 5. SUBTAB: Spot Walk-in Registration (Requirement #7) */}
      {activeSubTab === 'spot' && (
        <div className="gate-spot-section">
          <div className="gate-card-box">
            <div className="spot-header-row">
              <div>
                <h3>⚡ Gate Spot Registration (Walk-ins)</h3>
                <p className="card-sub-desc">
                  Quickly register walk-in alumni at the gate, accept Cash/UPI, mark entry, and create their pass.
                </p>
              </div>
            </div>

            {spotSuccessData && (
              <div className="spot-success-banner">
                <span className="success-icon">🎉</span>
                <div>
                  <h4>Spot Registration & Gate Entry Complete!</h4>
                  <p>
                    <strong>{spotSuccessData.attendee_name}</strong> ({spotSuccessData.registration_number}) is registered and marked entered!
                  </p>
                </div>
              </div>
            )}

            {preloadNotice && (
              <div className="spot-prefill-banner">
                <span className="banner-icon">⚡</span>
                <div className="banner-text">{preloadNotice}</div>
                <button
                  type="button"
                  className="btn-dismiss-prefill"
                  onClick={() => setPreloadNotice(null)}
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}

            {spotFormErrorMsg && (
              <div className="spot-validation-alert">
                <span className="alert-icon">⚠️</span>
                <span className="alert-msg">{spotFormErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSpotSubmit} noValidate className="gate-spot-form">
              <div className="form-fields-grid">
                {/* Row 1: Mobile (First for Instant Pre-load) & Full Name */}
                <div className={`form-field ${spotErrors.mobile ? 'has-error' : ''}`}>
                  <label htmlFor="spot-mobile">
                    Mobile Number <span className="req-star">*</span>
                  </label>
                  <input
                    id="spot-mobile"
                    type="tel"
                    required
                    placeholder="10-digit mobile number"
                    maxLength={10}
                    value={spotMobile}
                    onChange={(e) => {
                      handleSpotMobileChange(e.target.value);
                      clearSpotError('mobile');
                    }}
                    autoFocus={activeSubTab === 'spot' && !spotMobile}
                  />
                </div>

                <div className={`form-field ${spotErrors.name ? 'has-error' : ''}`}>
                  <label htmlFor="spot-name">
                    Full Name <span className="req-star">*</span>
                  </label>
                  <input
                    id="spot-name"
                    type="text"
                    required
                    placeholder="Alumnus Name"
                    value={spotName}
                    onChange={(e) => {
                      setSpotName(e.target.value);
                      clearSpotError('name');
                    }}
                  />
                </div>

                {/* Row 2: Branch / Discipline & Passing Batch (Year) */}
                <div className={`form-field ${spotErrors.branch ? 'has-error' : ''}`}>
                  <label htmlFor="spot-branch">
                    Branch / Discipline <span className="req-star">*</span>
                  </label>
                  <select
                    id="spot-branch"
                    required
                    value={spotBranch}
                    onChange={(e) => {
                      setSpotBranch(e.target.value);
                      clearSpotError('branch');
                    }}
                  >
                    <option value="">Select Branch</option>
                    {ENGINEERING_DISCIPLINES.map((discipline) => (
                      <option key={discipline} value={discipline}>
                        {discipline}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`form-field ${spotErrors.batch ? 'has-error' : ''}`}>
                  <label htmlFor="spot-batch">
                    Year of Passing (Batch) <span className="req-star">*</span>
                  </label>
                  <select
                    id="spot-batch"
                    required
                    value={spotBatch}
                    onChange={(e) => {
                      setSpotBatch(e.target.value ? Number(e.target.value) : '');
                      clearSpotError('batch');
                    }}
                  >
                    <option value="">Select Passing Year</option>
                    {passingYears.map((year) => (
                      <option key={year} value={year}>
                        Class of {year}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Row 3: Number of People Attending & Payment Collected */}
                <div className="form-field">
                  <label htmlFor="spot-attendees">
                    Number of People Attending <span className="req-star">*</span>
                  </label>
                  <select
                    id="spot-attendees"
                    value={spotAdults}
                    onChange={(e) => {
                      const count = Number(e.target.value);
                      setSpotAdults(count);
                      const calc = calculateContribution(count, spotKidsAbove10, spotKidsUnder10);
                      setSpotAmount(calc.totalAmount);
                      setSpotAttendees(count + spotKidsAbove10 + spotKidsUnder10);
                    }}
                  >
                    {attendeeOptions.map((opt) => (
                      <option key={opt.count} value={opt.count}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`form-field ${spotErrors.paymentMode ? 'has-error' : ''}`}>
                  <label htmlFor="spot-payment-mode">
                    Payment Collected At Gate <span className="req-star">*</span>
                  </label>
                  <select
                    id="spot-payment-mode"
                    required
                    value={spotPaymentMode}
                    onChange={(e) => {
                      setSpotPaymentMode(e.target.value);
                      setPaymentConfirmed(false);
                      clearSpotError('paymentMode');
                    }}
                  >
                    <option value="">-- Select Payment Method --</option>
                    <option value="CASH">💵 Cash Collected (₹{spotAmount})</option>
                    <optgroup label="📱 UPI QR (Choose Account)">
                      {DEFAULT_UPI_CONFIGS.map((config) => {
                        const bankHandle = config.upi_id.includes('@')
                          ? `@${config.upi_id.split('@')[1]}`
                          : config.upi_id;
                        return (
                          <option key={config.upi_id} value={config.upi_id}>
                            📱 {config.account_name} ({bankHandle})
                          </option>
                        );
                      })}
                    </optgroup>
                    <option value="COMPLIMENTARY">⭐ Complimentary / VIP (₹0)</option>
                  </select>
                </div>
              </div>

              {/* Optional Accompanying Kids Drawer aligned with RegistrationForm rules */}
              <div className="spot-kids-toggle-wrap">
                <button
                  type="button"
                  className="spot-kids-toggle-btn"
                  onClick={() => setShowKidsBreakdown(!showKidsBreakdown)}
                >
                  <span>👨‍👩‍👧 Accompanying Children?</span>
                  <span className="spot-kids-toggle-hint">
                    {showKidsBreakdown
                      ? '− Hide Children Breakdown'
                      : spotKidsAbove10 > 0 || spotKidsUnder10 > 0
                        ? `✓ Added: ${spotKidsAbove10} (10+) • ${spotKidsUnder10} (<10)`
                        : '+ Add Kids (₹300 for 10+ • Free for <10)'}
                  </span>
                </button>

                {showKidsBreakdown && (
                  <div className="spot-kids-breakdown-box">
                    <div className="spot-kid-tier-row">
                      <div className="spot-kid-tier-info">
                        <strong>Children (10+ Years)</strong>
                        <span>₹300 per child</span>
                      </div>
                      <div className="spot-stepper">
                        <button
                          type="button"
                          onClick={() => {
                            const newKids = Math.max(0, spotKidsAbove10 - 1);
                            setSpotKidsAbove10(newKids);
                            const calc = calculateContribution(spotAdults, newKids, spotKidsUnder10);
                            setSpotAmount(calc.totalAmount);
                            setSpotAttendees(spotAdults + newKids + spotKidsUnder10);
                          }}
                          disabled={spotKidsAbove10 <= 0}
                          aria-label="Decrease children 10 and above"
                        >
                          −
                        </button>
                        <span>{spotKidsAbove10}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newKids = spotKidsAbove10 + 1;
                            setSpotKidsAbove10(newKids);
                            const calc = calculateContribution(spotAdults, newKids, spotKidsUnder10);
                            setSpotAmount(calc.totalAmount);
                            setSpotAttendees(spotAdults + newKids + spotKidsUnder10);
                          }}
                          disabled={spotKidsAbove10 >= 10}
                          aria-label="Increase children 10 and above"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="spot-kid-tier-row">
                      <div className="spot-kid-tier-info">
                        <strong>Children (Under 10 Years)</strong>
                        <span className="badge-free">FREE</span>
                      </div>
                      <div className="spot-stepper">
                        <button
                          type="button"
                          onClick={() => {
                            const newKids = Math.max(0, spotKidsUnder10 - 1);
                            setSpotKidsUnder10(newKids);
                            const calc = calculateContribution(spotAdults, spotKidsAbove10, newKids);
                            setSpotAmount(calc.totalAmount);
                            setSpotAttendees(spotAdults + spotKidsAbove10 + newKids);
                          }}
                          disabled={spotKidsUnder10 <= 0}
                          aria-label="Decrease children under 10"
                        >
                          −
                        </button>
                        <span>{spotKidsUnder10}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newKids = spotKidsUnder10 + 1;
                            setSpotKidsUnder10(newKids);
                            const calc = calculateContribution(spotAdults, spotKidsAbove10, newKids);
                            setSpotAmount(calc.totalAmount);
                            setSpotAttendees(spotAdults + spotKidsAbove10 + newKids);
                          }}
                          disabled={spotKidsUnder10 >= 10}
                          aria-label="Increase children under 10"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* INSTANT UPI QR CODE PAYMENT DESK CARD */}
              {selectedUpiConfig && (
                <div className="spot-qr-display-card">
                  <div className="spot-qr-card-header">
                    <div className="spot-qr-header-title">
                      <span className="spot-qr-icon">📱</span>
                      <div>
                        <h4>Instant Desk UPI QR Payment</h4>
                        <p>Alumnus can scan the QR code below using Google Pay, PhonePe, Paytm, or BHIM.</p>
                      </div>
                    </div>
                    <div className="spot-qr-amount-pill">
                      <span className="lbl">Amount</span>
                      <span className="val">₹{spotAmount}</span>
                    </div>
                  </div>

                  {/* Quick Recipient Switcher Pills */}
                  <div className="spot-qr-account-switcher">
                    <span className="switcher-label">Switch Receiver:</span>
                    <div className="switcher-pills">
                      {DEFAULT_UPI_CONFIGS.map((config) => (
                        <button
                          key={config.upi_id}
                          type="button"
                          className={`account-pill ${spotPaymentMode === config.upi_id ? 'active' : ''}`}
                          onClick={() => {
                            setSpotPaymentMode(config.upi_id);
                            setPaymentConfirmed(false);
                          }}
                        >
                          {config.account_name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="spot-qr-body-grid">
                    {/* High contrast QR Frame */}
                    <div className="spot-qr-frame-box">
                      <div className="spot-qr-image-wrapper">
                        <img
                          src={selectedUpiConfig.qr_image_url}
                          alt={`UPI QR Code for ${selectedUpiConfig.account_name}`}
                          className="spot-qr-img"
                        />
                      </div>
                      <div className="spot-qr-badge">
                        <span>⚡ Scan to Pay ₹{spotAmount}</span>
                      </div>
                    </div>

                    {/* Recipient Details & Confirmation */}
                    <div className="spot-qr-details-box">
                      <div className="spot-qr-detail-row">
                        <span className="detail-label">Receiver Account</span>
                        <strong className="detail-value text-gold">{selectedUpiConfig.account_name}</strong>
                      </div>

                      <div className="spot-qr-detail-row">
                        <span className="detail-label">UPI ID</span>
                        <div className="upi-id-copy-row">
                          <code className="upi-code">{selectedUpiConfig.upi_id}</code>
                          <button
                            type="button"
                            className="btn-copy-upi"
                            onClick={() => handleCopyUpi(selectedUpiConfig.upi_id)}
                          >
                            {copiedUpi ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>

                      <div className="spot-qr-detail-row">
                        <span className="detail-label">Attendees Covered</span>
                        <span className="detail-value">
                          {spotAttendees} {spotAttendees === 1 ? 'Person' : 'People'}
                        </span>
                      </div>

                      {/* Confirmation Toggle Box */}
                      <div
                        className={`spot-payment-confirm-card ${paymentConfirmed ? 'confirmed' : ''}`}
                        onClick={() => setPaymentConfirmed(!paymentConfirmed)}
                      >
                        <input
                          type="checkbox"
                          id="spot-confirm-checkbox"
                          checked={paymentConfirmed}
                          onChange={(e) => setPaymentConfirmed(e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <label htmlFor="spot-confirm-checkbox" className="confirm-label">
                          <strong>Payment Received &amp; Verified on Screen</strong>
                          <span>
                            {paymentConfirmed
                              ? `✅ Confirmed: ₹${spotAmount} paid to ${selectedUpiConfig.account_name}`
                              : `Check this once alumnus shows the ₹${spotAmount} successful payment screen.`}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="spot-form-actions">
                <button
                  type="submit"
                  disabled={spotSubmitting}
                  className="btn-primary-action btn-spot-submit"
                >
                  {spotSubmitting
                    ? 'Registering...'
                    : spotPaymentMode === 'COMPLIMENTARY'
                      ? 'Complete Spot Entry (Complimentary / VIP) →'
                      : selectedUpiConfig
                        ? `Complete Spot Entry (₹${spotAmount} via ${selectedUpiConfig.account_name} QR) →`
                        : spotPaymentMode === 'CASH'
                          ? `Complete Spot Entry (₹${spotAmount} Cash) →`
                          : `Complete Spot Entry (₹${spotAmount}) →`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. SUBTAB: Gate Entry Log Table (Requirement #6) */}
      {activeSubTab === 'log' && (
        <div className="gate-log-section">
          <div className="gate-log-toolbar">
            <input
              type="text"
              placeholder="Search entered attendees by name or phone..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              className="gate-log-search"
            />
            <span className="log-count-indicator">
              Showing {filteredGateEntries.length} of {gateEntries.length} physical entries
            </span>
          </div>

          <div className="gate-table-wrapper gate-desktop-table">
            <table className="gate-table">
              <thead>
                <tr>
                  <th>Time Entered</th>
                  <th>Attendee Name</th>
                  <th>Phone</th>
                  <th>Branch & Batch</th>
                  <th>Heads</th>
                  <th>Mode</th>
                  <th>Payment</th>
                  <th>Gate Staff</th>
                </tr>
              </thead>
              <tbody>
                {filteredGateEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-table-cell">
                      {loadingEntries ? 'Loading gate entries...' : 'No gate entries recorded yet.'}
                    </td>
                  </tr>
                ) : (
                  filteredGateEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="time-cell">
                        {new Date(entry.entered_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="name-cell">
                        <strong>{entry.attendee_name}</strong>
                      </td>
                      <td>{entry.phone_number}</td>
                      <td>
                        {entry.branch || '—'} {entry.year_of_passing ? `('${String(entry.year_of_passing).slice(-2)})` : ''}
                      </td>
                      <td className="heads-cell">
                        <span className="heads-badge">👥 {entry.accompanying_count || 1}</span>
                      </td>
                      <td>
                        <span className={`entry-mode-pill ${entry.entry_mode}`}>
                          {entry.entry_mode === 'qr_scan' ? '📷 QR Scan' : entry.entry_mode === 'manual_phone' ? '⌨️ Manual' : '⚡ Spot'}
                        </span>
                      </td>
                      <td>
                        <span className="pay-verified-pill">✓ {entry.payment_status}</span>
                      </td>
                      <td className="staff-cell">{entry.verified_by || 'Gate 1'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View for Phones */}
          <div className="gate-mobile-log-list">
            {filteredGateEntries.length === 0 ? (
              <div className="empty-log-card">
                {loadingEntries ? 'Loading gate entries...' : 'No gate entries recorded yet.'}
              </div>
            ) : (
              filteredGateEntries.map((entry) => (
                <div key={entry.id} className="gate-mobile-entry-card">
                  <div className="card-top-row">
                    <span className="attendee-name">{entry.attendee_name}</span>
                    <span className="entry-time">
                      {new Date(entry.entered_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="card-meta-row">
                    <span className="attendee-phone">📞 {entry.phone_number}</span>
                    <span className="attendee-academic">
                      🎓 {entry.branch || 'General'}{' '}
                      {entry.year_of_passing ? `('${String(entry.year_of_passing).slice(-2)})` : ''}
                    </span>
                  </div>
                  <div className="card-badges-row">
                    <span className="heads-badge">👥 {entry.accompanying_count || 1} Total</span>
                    <span className={`entry-mode-pill ${entry.entry_mode}`}>
                      {entry.entry_mode === 'qr_scan'
                        ? '📷 QR'
                        : entry.entry_mode === 'manual_phone'
                          ? '⌨️ Phone'
                          : '⚡ Spot'}
                    </span>
                    <span className="pay-verified-pill">✓ {entry.payment_status}</span>
                    {entry.verified_by && (
                      <span className="staff-cell" title={entry.verified_by}>
                        👤 {entry.verified_by.split(' ')[0]}
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
  );
};
