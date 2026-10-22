import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  verifyGateAttendee,
  spotRegisterAtGate,
  uploadSpotPaymentScreenshot,
  attachSpotPaymentScreenshot,
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

  // Manual Lookup State (Phone, Reg ID, & Predictive Name Search)
  const [manualLookupMode, setManualLookupMode] = useState<'phone' | 'reg_number' | 'name'>('phone');
  const [manualPhone, setManualPhone] = useState('');
  const [manualRegNumber, setManualRegNumber] = useState('');
  const [nameSearchQuery, setNameSearchQuery] = useState('');
  const [selectedAttendee, setSelectedAttendee] = useState<EventRegistration | null>(null);

  // Spot Registration State
  const [spotName, setSpotName] = useState('');
  const [spotMobile, setSpotMobile] = useState('');
  const [spotBranch, setSpotBranch] = useState('');
  const [spotBatch, setSpotBatch] = useState<number | ''>('');
  const [spotAttendees, setSpotAttendees] = useState(1);
  const [spotAdults, setSpotAdults] = useState(1);
  const [spotKidsAbove10, setSpotKidsAbove10] = useState(0);
  const [spotKidsUnder10, setSpotKidsUnder10] = useState(0);
  const [spotPaymentMode, setSpotPaymentMode] = useState<string>('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [spotAmount, setSpotAmount] = useState(800);
  const [spotSubmitting, setSpotSubmitting] = useState(false);
  const [spotScanResult, setSpotScanResult] = useState<GateVerificationResult | null>(null);
  const [spotPhotoFile, setSpotPhotoFile] = useState<File | null>(null);
  const [spotPhotoPreview, setSpotPhotoPreview] = useState<string | null>(null);
  const [preloadNotice, setPreloadNotice] = useState<string | null>(null);
  const [spotErrors, setSpotErrors] = useState<Record<string, boolean>>({});
  const [spotFormErrorMsg, setSpotFormErrorMsg] = useState<string | null>(null);

  // Input refs for Spot photo capture
  const spotCameraInputRef = useRef<HTMLInputElement | null>(null);
  const spotFileInputRef = useRef<HTMLInputElement | null>(null);

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
    if (isVerifying || scanResult || spotScanResult) {
      scrollToStatus();
    }
  }, [isVerifying, scanResult, spotScanResult]);

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

  // Instant in-memory search for Phone mode
  const filteredPhoneRegistrations = React.useMemo(() => {
    const clean = manualPhone.trim().replace(/\D/g, '');
    if (!clean || clean.length < 3) return [];

    return registrations
      .filter((reg) => {
        const m = cleanMobileNumber(reg.alumni?.mobile || '');
        return m.includes(clean);
      })
      .slice(0, 20);
  }, [registrations, manualPhone]);

  // Instant in-memory search for Registration ID mode
  const filteredRegRegistrations = React.useMemo(() => {
    const digits = manualRegNumber.trim().replace(/\D/g, '');
    if (!digits) return [];
    const padded = digits.padStart(5, '0');
    const canonical = `REG-${padded}`.toUpperCase();

    return registrations
      .filter((reg) => {
        const rNum = (reg.registration_number || '').toUpperCase();
        const rDigits = rNum.replace(/\D/g, '');
        return rNum === canonical || rDigits.includes(digits);
      })
      .slice(0, 20);
  }, [registrations, manualRegNumber]);

  // Handle Verification of an attendee selected via Manual Lookup (Phone, Reg ID, or Name)
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
    setManualRegNumber('');
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
      setSpotBranch(data.branch || '');
      setSpotBatch(data.batch ? Number(data.batch) : '');
      const adults = data.adults || 1;
      const kAbove = data.kidsAbove10 || 0;
      const kUnder = data.kidsUnder10 || 0;
      setSpotAdults(adults);
      setSpotKidsAbove10(kAbove);
      setSpotKidsUnder10(kUnder);
      setSpotAttendees(adults + kAbove + kUnder);
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

  // Comprehensive reset for Spot Walk-in Registration form
  const handleResetSpot = (clearResult = true) => {
    setSpotName('');
    setSpotMobile('');
    setSpotBranch('');
    setSpotBatch('');
    setSpotAdults(1);
    setSpotKidsAbove10(0);
    setSpotKidsUnder10(0);
    setSpotAttendees(1);
    setSpotAmount(800);
    setSpotPaymentMode('');
    setPaymentConfirmed(false);
    setSpotPhotoFile(null);
    if (spotPhotoPreview) {
      try {
        URL.revokeObjectURL(spotPhotoPreview);
      } catch (_) { }
    }
    setSpotPhotoPreview(null);
    setPreloadNotice(null);
    setSpotErrors({});
    setSpotFormErrorMsg(null);
    if (clearResult) {
      setSpotScanResult(null);
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
    } else if (spotPaymentMode === 'CASH' && !paymentConfirmed) {
      errors.cashConfirmed = true;
    } else if (Boolean(selectedUpiConfig) && !spotPhotoFile && !paymentConfirmed) {
      errors.upiConfirmed = true;
    }

    if (Object.keys(errors).length > 0) {
      setSpotErrors(errors);
      if (errors.cashConfirmed && Object.keys(errors).length === 1) {
        setSpotFormErrorMsg('Please verify that cash has been collected in hand before submitting.');
      } else if (errors.upiConfirmed && Object.keys(errors).length === 1) {
        setSpotFormErrorMsg("Please snap the attendee's payment screen or confirm payment before submitting.");
      } else if (errors.paymentMode && Object.keys(errors).length === 1) {
        setSpotFormErrorMsg('Please select a payment method to complete gate entry.');
      } else {
        setSpotFormErrorMsg('Please fill in all mandatory fields highlighted in red.');
      }

      // Smooth auto-scroll to the first invalid field or confirmation card
      const fieldIdMap: Record<string, string> = {
        mobile: 'spot-mobile',
        name: 'spot-name',
        branch: 'spot-branch',
        batch: 'spot-batch',
        paymentMode: 'spot-payment-mode',
        cashConfirmed: 'spot-cash-confirm-box',
        upiConfirmed: 'spot-snap-payment-btn',
      };

      const firstErrorKey = ['mobile', 'name', 'branch', 'batch', 'paymentMode', 'cashConfirmed', 'upiConfirmed'].find(
        (key) => errors[key]
      );

      if (firstErrorKey) {
        const targetId = fieldIdMap[firstErrorKey];
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
            (el as HTMLElement).focus();
          }
        }
      }
      return;
    }

    setSpotErrors({});
    setSpotFormErrorMsg(null);

    setSpotSubmitting(true);
    setSpotScanResult(null);

    // 1. Upload payment screenshot to storage if captured
    let uploadedScreenshotPath: string | null = null;
    if (spotPhotoFile) {
      try {
        uploadedScreenshotPath = await uploadSpotPaymentScreenshot(spotPhotoFile, spotMobile);
      } catch (uploadErr) {
        console.warn('Screenshot upload issue, proceeding with registration:', uploadErr);
      }
    }

    const isUpi = Boolean(selectedUpiConfig);
    const effectiveAmount = spotPaymentMode === 'COMPLIMENTARY' ? 0 : spotAmount;
    const verifiedByNote = isUpi
      ? `${verifiedBy} (UPI: ${selectedUpiConfig?.account_name}${uploadedScreenshotPath ? ' [Proof Attached]' : ''})`
      : verifiedBy;

    // 2. Perform spot registration at gate
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

    // 3. Attach uploaded screenshot path to existing registration record
    if (res.success && res.data?.registration_id && uploadedScreenshotPath) {
      await attachSpotPaymentScreenshot(res.data.registration_id, uploadedScreenshotPath);
    }

    setSpotSubmitting(false);

    if (res.success && res.data) {
      setSpotScanResult({
        success: true,
        status: 'ENTERED',
        message: 'Spot Registration & Gate Entry Complete!',
        registration_id: res.data.registration_id,
        registration_number: res.data.registration_number,
        attendee_name: res.data.attendee_name,
        phone_number: res.data.phone_number,
        branch: res.data.branch,
        year_of_passing: res.data.year_of_passing,
        number_of_attendees: res.data.number_of_attendees,
        amount: res.data.amount,
        badge_category: 'Alumnus',
        verified_by: verifiedByNote,
      });

      // Reset form
      handleResetSpot(false);
      // Refresh entries & stats
      await loadGateEntries();
      onRefreshRegistrations();
    } else {
      setSpotScanResult({
        success: false,
        status: 'ERROR',
        message: res.error || 'Failed to complete spot registration.',
        attendee_name: spotName.trim(),
      });
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
          onClick={() => {
            handleResetSpot(true);
            setActiveSubTab('spot');
          }}
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
              Search by phone, Reg ID, or name to verify attendee entry:
            </p>

            {/* Segmented Mode Switcher */}
            <div className="manual-mode-segmented-bar">
              <button
                type="button"
                className={`manual-mode-btn ${manualLookupMode === 'phone' ? 'active' : ''}`}
                onClick={() => {
                  setManualLookupMode('phone');
                  setSelectedAttendee(null);
                  setScanResult(null);
                }}
              >
                <span>📱 Phone</span>
              </button>
              <button
                type="button"
                className={`manual-mode-btn ${manualLookupMode === 'reg_number' ? 'active' : ''}`}
                onClick={() => {
                  setManualLookupMode('reg_number');
                  setSelectedAttendee(null);
                  setScanResult(null);
                }}
              >
                <span>🎫 Reg ID</span>
              </button>
              <button
                type="button"
                className={`manual-mode-btn ${manualLookupMode === 'name' ? 'active' : ''}`}
                onClick={() => {
                  setManualLookupMode('name');
                  setSelectedAttendee(null);
                  setScanResult(null);
                }}
              >
                <span>👤 Name</span>
              </button>
            </div>

            <div className="name-search-container">
              {/* 1. SEARCH INPUT BASED ON ACTIVE TAB */}
              {manualLookupMode === 'phone' && (
                <div className="name-search-input-wrapper">
                  <span className="name-search-icon">📞</span>
                  <input
                    type="tel"
                    placeholder="Type phone number (e.g. 9829012345)..."
                    value={manualPhone}
                    maxLength={10}
                    onChange={(e) => {
                      setManualPhone(e.target.value.replace(/\D/g, ''));
                      if (selectedAttendee) setSelectedAttendee(null);
                    }}
                    className="name-search-input"
                    autoFocus
                  />
                  {manualPhone && (
                    <button
                      type="button"
                      onClick={() => {
                        setManualPhone('');
                        setSelectedAttendee(null);
                      }}
                      className="name-search-clear-btn"
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {manualLookupMode === 'reg_number' && (
                <div className="name-search-input-wrapper">
                  <div className="manual-reg-input-group" style={{ width: '100%' }}>
                    <span className="manual-reg-prefix">REG-</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="e.g. 39 or 00039"
                      maxLength={5}
                      value={manualRegNumber}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/\D/g, '').slice(0, 5);
                        setManualRegNumber(cleaned);
                        if (selectedAttendee) setSelectedAttendee(null);
                      }}
                      className="manual-reg-field"
                      autoFocus
                    />
                    {manualRegNumber && (
                      <button
                        type="button"
                        onClick={() => {
                          setManualRegNumber('');
                          setSelectedAttendee(null);
                        }}
                        className="name-search-clear-btn"
                        style={{ position: 'relative', right: '12px' }}
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              )}

              {manualLookupMode === 'name' && (
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
              )}

              {/* 2. SEARCH RESULTS LIST (Inline expandable cards with direct action button) */}
              {(() => {
                const activeList =
                  manualLookupMode === 'phone'
                    ? filteredPhoneRegistrations
                    : manualLookupMode === 'reg_number'
                    ? filteredRegRegistrations
                    : filteredNameRegistrations;

                const queryActive =
                  manualLookupMode === 'phone'
                    ? manualPhone.trim()
                    : manualLookupMode === 'reg_number'
                    ? manualRegNumber.trim()
                    : nameSearchQuery.trim();

                const minLen = manualLookupMode === 'phone' ? 3 : manualLookupMode === 'reg_number' ? 1 : 2;

                if (queryActive.length < minLen) {
                  return (
                    <div className="name-search-hint-box">
                      {manualLookupMode === 'phone' && (
                        <p>⚡ <strong>Phone Search:</strong> Type at least 3 digits of attendee's mobile number.</p>
                      )}
                      {manualLookupMode === 'reg_number' && (
                        <p>⚡ <strong>Reg ID Search:</strong> Enter registration number digits (e.g. <em>39</em> or <em>00039</em>).</p>
                      )}
                      {manualLookupMode === 'name' && (
                        <>
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
                        </>
                      )}
                    </div>
                  );
                }

                if (activeList.length === 0) {
                  return (
                    <div className="name-search-hint-box">
                      <p>
                        🔍 No registered alumni found matching <strong>"{queryActive}"</strong>.
                      </p>
                      <p style={{ fontSize: '0.82rem', margin: 0 }}>
                        Check details, or register this attendee directly at Spot Walk-in Desk:
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          handleRedirectToSpot({
                            name: manualLookupMode === 'name' ? queryActive : undefined,
                            mobile: manualLookupMode === 'phone' ? queryActive : undefined,
                          })
                        }
                        className="btn-spot-create-new"
                      >
                        ⚡ Register at Spot Walk-in Desk →
                      </button>
                    </div>
                  );
                }

                return (
                  <>
                    <div className="name-search-header-meta">
                      <span>Found {activeList.length} matching {activeList.length === 1 ? 'attendee' : 'attendees'}</span>
                      <span>Click to verify &amp; admit</span>
                    </div>

                    <div className="name-search-results-list">
                      {activeList.map((reg) => {
                        const alumni = reg.alumni;
                        if (!alumni) return null;
                        const gateStatus = getAttendeeGateStatus(reg);
                        const isSelected = selectedAttendee?.id === reg.id;
                        const participantCount = reg.number_of_attendees || 1;

                        return (
                          <div
                            key={reg.id}
                            className={`name-search-result-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              setSelectedAttendee(isSelected ? null : reg);
                              setScanResult(null);
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="name-result-main-row">
                              {/* Top row: Name + Reg ID on left, Status badge on right */}
                              <div className="name-result-top-row">
                                <div className="name-result-title-group">
                                  <span className="name-result-name">{alumni.name}</span>
                                  <span className="name-result-reg-pill">
                                    {reg.registration_number}
                                  </span>
                                </div>

                                <div className="name-result-status-col">
                                  {gateStatus.status === 'READY' && (
                                    <span className="gate-status-pill ready">🟢 Ready</span>
                                  )}
                                  {gateStatus.status === 'ALREADY_ENTERED' && (
                                    <span className="gate-status-pill entered">⚠️ Entered</span>
                                  )}
                                  {gateStatus.status === 'PAYMENT_PENDING' && (
                                    <span className="gate-status-pill pending">💳 Pending</span>
                                  )}
                                  {gateStatus.status === 'MAYBE' && (
                                    <span className="gate-status-pill pending">💳 Unpaid</span>
                                  )}
                                </div>
                              </div>

                              {/* Middle row: Branch & Passing Year */}
                              <div className="name-result-branch-line">
                                <span className="meta-icon">🎓</span>
                                <span className="meta-text">
                                  {alumni.engineering_discipline || 'Alumni'}
                                  {alumni.year_of_passing ? ` (${alumni.year_of_passing})` : ''}
                                </span>
                              </div>

                              {/* Bottom row: Mobile & Number of Participants */}
                              <div className="name-result-bottom-meta">
                                <span className="name-result-phone-badge">
                                  <span className="meta-icon">📞</span>
                                  <span>{alumni.mobile}</span>
                                </span>
                                <span className="name-result-heads-badge">
                                  <span className="meta-icon">👥</span>
                                  <span>
                                    {participantCount} {participantCount > 1 ? 'Participants' : 'Participant'}
                                  </span>
                                </span>
                              </div>
                            </div>

                            {/* Direct action button right below the card ONLY when clicked/selected */}
                            {isSelected && (
                              <div
                                className="name-result-action-drawer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {gateStatus.status === 'READY' && (
                                  <button
                                    type="button"
                                    disabled={isVerifying}
                                    onClick={() => handleVerifySelectedAttendee(reg)}
                                    className="btn-verify-selected"
                                  >
                                    <span>✅</span>
                                    <span>{isVerifying ? 'Verifying...' : 'Allow Entry'}</span>
                                  </button>
                                )}

                                {(gateStatus.status === 'PAYMENT_PENDING' || gateStatus.status === 'MAYBE') && (
                                  <>
                                    <div className="attendee-selected-alert pending">
                                      💳 {gateStatus.status === 'MAYBE' ? 'Registered as MAYBE (Unpaid)' : `Payment Pending (₹${reg.amount || 0})`}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRedirectToSpot({
                                          name: alumni.name,
                                          mobile: alumni.mobile,
                                          branch: alumni.engineering_discipline,
                                          batch: alumni.year_of_passing,
                                          adults: reg.adults_count || reg.number_of_attendees || 1,
                                          kidsAbove10: reg.children_above_7_count || 0,
                                          kidsUnder10: reg.children_under_7_count || 0,
                                          amount: reg.amount,
                                        })
                                      }
                                      className="btn-redirect-spot"
                                    >
                                      <span>⚡</span>
                                      <span>Spot Entry &amp; Collect Fee</span>
                                    </button>
                                  </>
                                )}

                                {gateStatus.status === 'ALREADY_ENTERED' && (
                                  <>
                                    <div className="attendee-selected-alert entered">
                                      ⚠️ {gateStatus.badgeText}
                                      {gateStatus.entry?.verified_by ? ` (by ${gateStatus.entry.verified_by.split('(')[0].trim() || 'Gate Staff'})` : ''}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setActiveSubTab('log')}
                                      className="btn-scan-next btn-secondary-outline"
                                    >
                                      <span>📋</span>
                                      <span>View in Gate Entry Log →</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Same rich QR Code scan result response experience */}
            {scanResult && (
              <div
                ref={statusResultRef}
                className={`gate-scan-result-card ${scanResult.status.toLowerCase()}`}
                style={{ marginTop: '1.25rem', width: '100%', maxWidth: '100%' }}
              >
                {scanResult.status === 'ENTERED' && (
                  <>
                    <div className="result-content success">
                      <div className="result-icon">✅</div>
                      <div className="result-text">
                        <h3 className="result-title">VERIFIED SUCCESSFULLY</h3>
                        <p className="result-name">
                          {scanResult.attendee_name || selectedAttendee?.alumni?.name}
                        </p>
                        <div className="result-badges">
                          {(scanResult.registration_number || selectedAttendee?.registration_number) && (
                            <span className="result-pill">
                              {scanResult.registration_number || selectedAttendee?.registration_number}
                            </span>
                          )}
                          <span className="result-pill">
                            {scanResult.branch || selectedAttendee?.alumni?.engineering_discipline || 'Alumni'}
                            {scanResult.year_of_passing || selectedAttendee?.alumni?.year_of_passing
                              ? ` (${scanResult.year_of_passing || selectedAttendee?.alumni?.year_of_passing})`
                              : ''}
                          </span>
                          <span className="result-pill count-pill">
                            👥 {scanResult.number_of_attendees || selectedAttendee?.number_of_attendees || 1} Attendees Allowed
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="result-actions">
                      <button
                        type="button"
                        onClick={handleResetLookup}
                        className="btn-scan-next btn-success"
                      >
                        <span>🔍</span>
                        <span>Verify Next Attendee →</span>
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
                          Attendee: <strong>{scanResult.attendee_name || selectedAttendee?.alumni?.name}</strong>{' '}
                          ({scanResult.registration_number || selectedAttendee?.registration_number})
                        </p>
                      </div>
                    </div>
                    <div className="result-actions">
                      <button
                        type="button"
                        onClick={handleResetLookup}
                        className="btn-scan-next btn-warning"
                      >
                        <span>🔍</span>
                        <span>Verify Next Attendee →</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSubTab('log')}
                        className="btn-scan-next btn-secondary-outline"
                      >
                        <span>📋</span>
                        <span>View in Gate Entry Log →</span>
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
                          Attendee: <strong>{scanResult.attendee_name || selectedAttendee?.alumni?.name}</strong> • Amount Due: ₹{scanResult.amount ?? selectedAttendee?.amount ?? 0}
                        </p>
                      </div>
                    </div>
                    <div className="result-actions">
                      <button
                        type="button"
                        onClick={() =>
                          handleRedirectToSpot({
                            name: scanResult.attendee_name || selectedAttendee?.alumni?.name || '',
                            mobile: scanResult.phone_number || manualPhone || selectedAttendee?.alumni?.mobile || '',
                            branch: scanResult.branch || selectedAttendee?.alumni?.engineering_discipline || '',
                            batch: scanResult.year_of_passing || selectedAttendee?.alumni?.year_of_passing || '',
                            adults: scanResult.number_of_attendees || selectedAttendee?.number_of_attendees || 1,
                            amount: scanResult.amount ?? selectedAttendee?.amount ?? 0,
                          })
                        }
                        className="btn-redirect-spot"
                      >
                        <span>⚡</span>
                        <span>Collect Fee &amp; Admit at Spot Desk →</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleResetLookup}
                        className="btn-scan-next btn-error"
                      >
                        <span>🔍</span>
                        <span>Verify Another Attendee</span>
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
                        className="btn-quick-spot-link"
                        onClick={() =>
                          handleRedirectToSpot({
                            name: selectedAttendee?.alumni?.name || (manualLookupMode === 'name' ? nameSearchQuery : undefined),
                            mobile: selectedAttendee?.alumni?.mobile || (manualLookupMode === 'phone' ? manualPhone : undefined),
                          })
                        }
                      >
                        <span>⚡ Spot Register this Attendee →</span>
                      </button>
                      <button
                        type="button"
                        className="btn-scan-next btn-secondary-outline"
                        onClick={handleResetLookup}
                      >
                        <span>🔍</span>
                        <span>Try Another Attendee</span>
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
                        onClick={handleResetLookup}
                      >
                        <span>✕</span>
                        <span>Dismiss &amp; Try Again</span>
                      </button>
                    </div>
                  </>
                )}
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
              <div style={{ flex: '1 1 auto' }}>
                <h3>⚡ Gate Spot Registration (Walk-ins)</h3>
                <p className="card-sub-desc">
                  Quickly register walk-in alumni at the gate, accept Cash/UPI, mark entry, and create their pass.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleResetSpot(true)}
                className="btn-spot-reset-header"
                title="Clear all fields and start a fresh registration"
              >
                <span>↺</span> Reset Form
              </button>
            </div>


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

                {/* Unified Attendee Selection (Adults & Children together under single heading) */}
                <div className={`form-field spot-attendees-full-section`} style={{ gridColumn: '1 / -1', width: '100%' }}>
                  <label htmlFor="spot-attendees-grid">
                    Number of People Attending <span className="req-star">*</span>
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                    <div className="rates-summary-badge">
                      <span>₹800 Single • ₹1,500 Couple • ₹300 Kids (10+) • Free (&lt;10)</span>
                    </div>
                  </div>

                  <div className="spot-unified-attendees-box">
                    {/* Row 1: Adults */}
                    <div className="spot-attendee-unified-row">
                      <div className="spot-attendee-unified-info">
                        <div className="row-title-wrap">
                          <strong>Adults</strong>
                          {spotAdults === 2 && (
                            <span className="spot-couple-badge">Couple</span>
                          )}
                        </div>
                        <span className="row-desc">
                          {spotAdults === 1
                            ? '₹800 for 1 adult'
                            : spotAdults === 2
                              ? '₹1,500 for couple'
                              : '₹1,500 couple + ₹800/extra adult'}
                        </span>
                      </div>
                      <div className="spot-stepper">
                        <button
                          type="button"
                          onClick={() => {
                            const newAdults = Math.max(1, spotAdults - 1);
                            setSpotAdults(newAdults);
                            const calc = calculateContribution(newAdults, spotKidsAbove10, spotKidsUnder10);
                            setSpotAmount(calc.totalAmount);
                            setSpotAttendees(newAdults + spotKidsAbove10 + spotKidsUnder10);
                          }}
                          disabled={spotAdults <= 1}
                          aria-label="Decrease adults"
                        >
                          −
                        </button>
                        <span>{spotAdults}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newAdults = Math.min(10, spotAdults + 1);
                            setSpotAdults(newAdults);
                            const calc = calculateContribution(newAdults, spotKidsAbove10, spotKidsUnder10);
                            setSpotAmount(calc.totalAmount);
                            setSpotAttendees(newAdults + spotKidsAbove10 + spotKidsUnder10);
                          }}
                          disabled={spotAdults >= 10}
                          aria-label="Increase adults"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Children (10+ Years) */}
                    <div className="spot-attendee-unified-row">
                      <div className="spot-attendee-unified-info">
                        <div className="row-title-wrap">
                          <strong>Children (10+ Years)</strong>
                        </div>
                        <span className="row-desc">₹300 per child</span>
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
                            const newKids = Math.min(10, spotKidsAbove10 + 1);
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

                    {/* Row 3: Children (Under 10 Years) */}
                    <div className="spot-attendee-unified-row">
                      <div className="spot-attendee-unified-info">
                        <div className="row-title-wrap">
                          <strong>Children (Under 10 Years)</strong>
                        </div>
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
                            const newKids = Math.min(10, spotKidsUnder10 + 1);
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

                  {/* Total Summary Row */}
                  <div className="attendee-total-pill-bar" style={{ marginTop: '12px' }}>
                    <span className="attendee-total-text">
                      👥 Total Attending: <strong>{spotAdults + spotKidsAbove10 + spotKidsUnder10}</strong>{' '}
                      {spotAdults + spotKidsAbove10 + spotKidsUnder10 === 1 ? 'person' : 'persons'}
                    </span>
                    <span className="attendee-total-amount" style={{ color: '#fbbf24', fontWeight: 700 }}>
                      Total Contribution: ₹{spotAmount}
                    </span>
                  </div>
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

                      {/* Live Camera Photo Snap for UPI Payment Confirmation */}
                      <div className="spot-upi-proof-section">
                        <input
                          ref={spotCameraInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          style={{ display: 'none' }}
                          id="spot-camera-capture-input"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setSpotPhotoFile(file);
                              setSpotPhotoPreview(URL.createObjectURL(file));
                              setPaymentConfirmed(true);
                              clearSpotError('paymentMode');
                            }
                          }}
                        />
                        <input
                          ref={spotFileInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          id="spot-file-upload-input"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setSpotPhotoFile(file);
                              setSpotPhotoPreview(URL.createObjectURL(file));
                              setPaymentConfirmed(true);
                              clearSpotError('paymentMode');
                            }
                          }}
                        />

                        {!spotPhotoPreview ? (
                          <div className="spot-photo-capture-box">
                            <button
                              id="spot-snap-payment-btn"
                              type="button"
                              className={`btn-snap-payment ${spotErrors.upiConfirmed ? 'has-error' : ''}`}
                              onClick={() => {
                                spotCameraInputRef.current?.click();
                                clearSpotError('upiConfirmed');
                              }}
                            >
                              <span className="snap-camera-icon">📸</span>
                              <div className="snap-btn-text">
                                <strong>Snap Attendee's Payment Screen</strong>
                                <span>Point mobile camera at alumnus's phone to capture payment confirmation</span>
                              </div>
                            </button>

                            {spotErrors.upiConfirmed && (
                              <div className="spot-inline-error-alert">
                                <span className="inline-err-icon">⚠️</span>
                                <span>Please snap the payment screen or verify manually below.</span>
                              </div>
                            )}

                            <div className="snap-alt-actions">
                              <button
                                type="button"
                                className="btn-snap-alt-link"
                                onClick={() => {
                                  spotFileInputRef.current?.click();
                                  clearSpotError('upiConfirmed');
                                }}
                              >
                                📁 Choose from files
                              </button>
                              <span className="snap-divider">•</span>
                              <button
                                type="button"
                                className="btn-snap-alt-link"
                                onClick={() => {
                                  const next = !paymentConfirmed;
                                  setPaymentConfirmed(next);
                                  if (next) clearSpotError('upiConfirmed');
                                }}
                              >
                                {paymentConfirmed ? '✓ Confirmed on Screen' : 'Verify manually without photo'}
                              </button>
                            </div>

                            {paymentConfirmed && (
                              <div className="manual-verified-badge">
                                <span>✓ Payment verified on alumnus screen (no photo attached)</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="spot-photo-preview-card">
                            <div className="preview-thumb-col">
                              <img
                                src={spotPhotoPreview}
                                alt="Payment Confirmation Screen"
                                className="spot-proof-img"
                              />
                              <span className="proof-status-chip">✓ Photo Attached</span>
                            </div>
                            <div className="preview-meta-col">
                              <strong className="preview-title">Payment Screen Captured</strong>
                              <span className="preview-filesize">
                                {spotPhotoFile ? `${(spotPhotoFile.size / 1024).toFixed(0)} KB • Ready to save` : ''}
                              </span>
                              <div className="preview-btn-row">
                                <button
                                  type="button"
                                  className="btn-retake-snap"
                                  onClick={() => spotCameraInputRef.current?.click()}
                                >
                                  📸 Retake Photo
                                </button>
                                <button
                                  type="button"
                                  className="btn-delete-snap"
                                  onClick={() => {
                                    if (spotPhotoPreview) URL.revokeObjectURL(spotPhotoPreview);
                                    setSpotPhotoFile(null);
                                    setSpotPhotoPreview(null);
                                    setPaymentConfirmed(false);
                                  }}
                                >
                                  ✕ Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CASH PAYMENT CONFIRMATION CARD */}
              {spotPaymentMode === 'CASH' && (
                <div className="spot-cash-payment-card">
                  <div className="cash-card-header">
                    <span className="cash-card-icon">💵</span>
                    <div className="cash-card-info">
                      <h4>Cash Collection at Gate Desk</h4>
                      <p>Collect ₹{spotAmount} cash in hand from alumnus before admitting entry.</p>
                    </div>
                    <div className="cash-amount-badge">
                      <span className="lbl">Amount</span>
                      <span className="val">₹{spotAmount}</span>
                    </div>
                  </div>

                  <div
                    id="spot-cash-confirm-box"
                    className={`spot-payment-confirm-card ${paymentConfirmed ? 'confirmed' : ''} ${spotErrors.cashConfirmed ? 'has-error' : ''}`}
                    onClick={() => {
                      const next = !paymentConfirmed;
                      setPaymentConfirmed(next);
                      if (next) clearSpotError('cashConfirmed');
                    }}
                  >
                    <input
                      type="checkbox"
                      id="spot-cash-checkbox"
                      checked={paymentConfirmed}
                      onChange={(e) => {
                        setPaymentConfirmed(e.target.checked);
                        if (e.target.checked) clearSpotError('cashConfirmed');
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <label htmlFor="spot-cash-checkbox" className="confirm-label">
                      <strong>
                        Cash Received in Hand <span className="req-star">*</span>
                      </strong>
                      <span>
                        {paymentConfirmed
                          ? `✅ Confirmed: ₹${spotAmount} cash collected at gate desk`
                          : `Check this once alumnus hands over ₹${spotAmount} in cash.`}
                      </span>
                    </label>
                  </div>

                  {spotErrors.cashConfirmed && (
                    <div className="spot-inline-error-alert">
                      <span className="inline-err-icon">⚠️</span>
                      <span>Please check the box above to confirm cash collection before completing entry.</span>
                    </div>
                  )}
                </div>
              )}

              <div className="spot-form-actions">
                <button
                  type="button"
                  onClick={() => handleResetSpot(true)}
                  className="btn-spot-reset-action"
                  disabled={spotSubmitting}
                >
                  <span>↺</span> Reset Form
                </button>
                <button
                  type="submit"
                  disabled={spotSubmitting}
                  className="btn-primary-action btn-spot-submit"
                >
                  {spotSubmitting ? 'Registering...' : 'Complete Spot Entry'}
                </button>
              </div>
            </form>

            {/* Consistent QR Code Scan Result Card Experience at Bottom */}
            {spotScanResult && (
              <div
                ref={statusResultRef}
                className={`gate-scan-result-card ${spotScanResult.status.toLowerCase()}`}
                style={{ marginTop: '1.25rem', width: '100%', maxWidth: '100%' }}
              >
                {spotScanResult.status === 'ENTERED' && (
                  <>
                    <div className="result-content success">
                      <div className="result-icon">✅</div>
                      <div className="result-text">
                        <h3 className="result-title">VERIFIED SUCCESSFULLY</h3>
                        <p className="result-name">{spotScanResult.attendee_name}</p>
                        <div className="result-badges">
                          <span className="result-pill">{spotScanResult.registration_number}</span>
                          <span className="result-pill">
                            {spotScanResult.branch} ({spotScanResult.year_of_passing})
                          </span>
                          <span className="result-pill count-pill">
                            👥 {spotScanResult.number_of_attendees || 1} Attendees Allowed
                          </span>
                          <span className="result-pill spot-verified-pill">
                            ⚡ Spot Entry Admitted
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="result-actions">
                      <button
                        type="button"
                        onClick={() => {
                          handleResetSpot(true);
                          const mobileInput = document.getElementById('spot-mobile');
                          if (mobileInput) mobileInput.focus();
                        }}
                        className="btn-scan-next btn-success"
                      >
                        <span>⚡</span>
                        <span>Register Next Walk-in Attendee →</span>
                      </button>
                    </div>
                  </>
                )}

                {spotScanResult.status === 'ERROR' && (
                  <>
                    <div className="result-content error">
                      <div className="result-icon">❌</div>
                      <div className="result-text">
                        <h3 className="result-title">REGISTRATION FAILED</h3>
                        <p className="result-detail">{spotScanResult.message}</p>
                        {spotScanResult.attendee_name && (
                          <p className="result-sub">
                            Attendee: <strong>{spotScanResult.attendee_name}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="result-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setSpotScanResult(null)}
                        className="btn-scan-next btn-warning"
                        style={{ flex: '1 1 160px', minHeight: '44px' }}
                      >
                        <span>↩</span>
                        <span>Edit &amp; Try Again</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetSpot(true)}
                        className="btn-scan-next btn-error"
                        style={{ flex: '1 1 160px', minHeight: '44px' }}
                      >
                        <span>✕</span>
                        <span>Clear &amp; Reset Form</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
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
