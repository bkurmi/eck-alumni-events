import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  verifyGateAttendee,
  spotRegisterAtGate,
  uploadSpotPaymentScreenshot,
  attachSpotPaymentScreenshot,
  updateSpotRegistrationDetails,
  fetchGateEntries,
  fetchGateStats,
  isAdminGatePortalEnabled,
  resolveAttendeePhoto,
  type GatePortalStats,
} from '../lib/gate';
import {
  cleanMobileNumber,
  lookupRegistrationByMobile,
  lookupRegistrationByRegNumber,
  formatRegistrationNumberInput,
} from '../lib/registrations';
import { calculateContribution, calculateSpotContribution } from '../lib/pricing';
import { DEFAULT_UPI_CONFIGS } from '../lib/paymentRotation';
import { ENGINEERING_DISCIPLINES } from '../types';
import type { EventRegistration, GateEntry, GateVerificationResult } from '../types';

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => {
      if (word.endsWith('.')) {
        const clean = word.replace(/\./g, '');
        return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() + '.';
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function formatSmartAttendeeName(rawName: string): { displayName: string; fontSizeClass: string; fullName: string } {
  const fullName = toTitleCase(rawName || 'Alumnus');
  const words = fullName.split(/\s+/).filter(Boolean);

  let displayName = fullName;
  if (displayName.length > 29 && words.length >= 3) {
    const hasTitle = /^(Dr\.|Prof\.|Er\.|Mr\.|Mrs\.|Ms\.)/i.test(words[0]);
    if (hasTitle && words.length >= 4) {
      const title = words[0];
      const firstName = words[1];
      const middleInitials = words.slice(2, -1).map((w) => `${w.charAt(0).toUpperCase()}.`).join(' ');
      const lastName = words[words.length - 1];
      displayName = `${title} ${firstName} ${middleInitials} ${lastName}`;
    } else if (!hasTitle && words.length >= 3) {
      const firstName = words[0];
      const middleInitials = words.slice(1, -1).map((w) => `${w.charAt(0).toUpperCase()}.`).join(' ');
      const lastName = words[words.length - 1];
      displayName = `${firstName} ${middleInitials} ${lastName}`;
    }
  }

  let fontSizeClass = 'name-size-normal';
  if (displayName.length > 24) {
    fontSizeClass = 'name-size-compact';
  } else if (displayName.length > 18) {
    fontSizeClass = 'name-size-medium';
  }

  return { displayName, fontSizeClass, fullName };
}

interface GateVerificationPortalProps {
  registrations: EventRegistration[];
  onRefreshRegistrations: () => Promise<void> | void;
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

  // Manual Lookup State (Reg ID, Phone, & Predictive Name Search)
  const [manualLookupMode, setManualLookupMode] = useState<'phone' | 'reg_number' | 'name'>('reg_number');
  const [manualPhone, setManualPhone] = useState('');
  const [manualRegNumber, setManualRegNumber] = useState('');
  const [nameSearchQuery, setNameSearchQuery] = useState('');
  const [selectedAttendee, setSelectedAttendee] = useState<EventRegistration | null>(null);

  // Verified Attendee Card & Entry Approval State
  const [verifiedAttendee, setVerifiedAttendee] = useState<EventRegistration | null>(null);
  const [verifiedAttendeePhoto, setVerifiedAttendeePhoto] = useState<string | null>(null);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [entryAllowedMsg, setEntryAllowedMsg] = useState<string | null>(null);
  const [lookupNotFoundMsg, setLookupNotFoundMsg] = useState<string | null>(null);
  const [isSearchingLookup, setIsSearchingLookup] = useState(false);

  // Spot Registration State & Detected Existing Attendee
  const [existingMatchedReg, setExistingMatchedReg] = useState<EventRegistration | null>(null);
  const [spotName, setSpotName] = useState('');
  const [spotMobile, setSpotMobile] = useState('');
  const [spotBranch, setSpotBranch] = useState('');
  const [spotBatch, setSpotBatch] = useState<number | ''>('');
  const [spotAdults, setSpotAdults] = useState(1);
  const [spotKidsAbove10, setSpotKidsAbove10] = useState(0);
  const [spotKidsUnder10, setSpotKidsUnder10] = useState(0);
  const spotAttendees = spotAdults + spotKidsAbove10 + spotKidsUnder10;
  const [spotPaymentMode, setSpotPaymentMode] = useState<string>('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [spotSubmitting, setSpotSubmitting] = useState(false);
  const [spotScanResult, setSpotScanResult] = useState<GateVerificationResult | null>(null);
  const [spotPhotoFile, setSpotPhotoFile] = useState<File | null>(null);
  const [spotPhotoPreview, setSpotPhotoPreview] = useState<string | null>(null);
  const [preloadNotice, setPreloadNotice] = useState<string | null>(null);
  const [spotErrors, setSpotErrors] = useState<Record<string, boolean>>({});
  const [spotFormErrorMsg, setSpotFormErrorMsg] = useState<string | null>(null);

  // Computed status & difference-to-pay calculations matching RegistrationForm
  const isExistingPaid = Boolean(
    existingMatchedReg &&
      (existingMatchedReg.attendance_status === 'yes' ||
        existingMatchedReg.payment_verifications?.some((v) => v.verified_status === 'VERIFIED') ||
        Boolean(existingMatchedReg.payment_screenshot_path))
  );

  const existingStatusType: 'CONFIRMED_PAID' | 'PAYMENT_PENDING' | 'MAYBE' | 'NO' | 'NONE' = React.useMemo(() => {
    if (!existingMatchedReg) return 'NONE';
    if (isExistingPaid) return 'CONFIRMED_PAID';
    if (existingMatchedReg.attendance_status === 'payment_pending') return 'PAYMENT_PENDING';
    if (existingMatchedReg.attendance_status === 'maybe') return 'MAYBE';
    if (existingMatchedReg.attendance_status === 'no') return 'NO';
    return 'PAYMENT_PENDING';
  }, [existingMatchedReg, isExistingPaid]);

  const previousPaidAmount = React.useMemo(() => {
    if (!isExistingPaid || !existingMatchedReg) return 0;
    if (typeof existingMatchedReg.amount === 'number' && existingMatchedReg.amount > 0) {
      return existingMatchedReg.amount;
    }
    const prevAdults = existingMatchedReg.adults_count ?? 1;
    const prevKidsAbove = existingMatchedReg.children_above_7_count ?? 0;
    const prevKidsUnder = existingMatchedReg.children_under_7_count ?? 0;
    return calculateContribution(prevAdults, prevKidsAbove, prevKidsUnder).totalAmount;
  }, [isExistingPaid, existingMatchedReg]);

  const minAdults = isExistingPaid ? Math.max(1, existingMatchedReg?.adults_count ?? 1) : 1;
  const minKidsAbove10 = isExistingPaid ? (existingMatchedReg?.children_above_7_count ?? 0) : 0;
  const minKidsUnder10 = isExistingPaid ? (existingMatchedReg?.children_under_7_count ?? 0) : 0;

  const spotPricing = React.useMemo(() => {
    return calculateSpotContribution(spotAdults, spotKidsAbove10, spotKidsUnder10);
  }, [spotAdults, spotKidsAbove10, spotKidsUnder10]);

  const totalContributionAmount = spotPricing.totalAmount;
  const differenceDue = isExistingPaid
    ? Math.max(0, totalContributionAmount - previousPaidAmount)
    : totalContributionAmount;
  const isFullyPaid = isExistingPaid && differenceDue === 0;
  const amountToCollect = isExistingPaid ? differenceDue : totalContributionAmount;

  // Auto-manage payment mode when fully paid vs difference due
  useEffect(() => {
    if (isFullyPaid) {
      setSpotPaymentMode('ALL_DUES_CLEARED');
      setPaymentConfirmed(true);
    } else if (spotPaymentMode === 'ALL_DUES_CLEARED') {
      setSpotPaymentMode('');
      setPaymentConfirmed(false);
    }
  }, [isFullyPaid]);

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

  // Helper to lookup attendee by phone or reg number, and display their horizontal ID card for approval
  const lookupAndDisplayAttendee = async (query: { phone?: string; reg?: string }) => {
    setIsSearchingLookup(true);
    setLookupNotFoundMsg(null);
    setVerifiedAttendee(null);
    setEntryAllowedMsg(null);
    setScanResult(null);

    let found: EventRegistration | null = null;

    if (query.phone) {
      const clean = cleanMobileNumber(query.phone);
      found = registrations.find((r) => cleanMobileNumber(r.alumni?.mobile || '') === clean) || null;
      if (!found && clean.length === 10) {
        try {
          const res = await lookupRegistrationByMobile('deepaura-2k26', clean);
          if (res.found && res.alumni) {
            found = {
              id: res.registration_id || '',
              registration_number: res.registration_number || '',
              event_id: '',
              alumni_id: res.alumni.id || '',
              attendance_status: (res.attendance_status as any) || 'yes',
              number_of_attendees: res.number_of_attendees || 1,
              adults_count: res.adults_count ?? 1,
              children_above_7_count: res.children_above_7_count ?? 0,
              children_under_7_count: res.children_under_7_count ?? 0,
              amount: res.amount || 0,
              payment_screenshot_path: res.payment_screenshot_path || null,
              photo_url: res.photo_url || null,
              alumni: res.alumni,
              payment_verifications: (res as any).payment_verifications || [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          }
        } catch (err) {
          console.warn('lookupRegistrationByMobile notice:', err);
        }
      }
      if (!found) {
        setLookupNotFoundMsg(`No registered attendee found for mobile +91 ${clean}.`);
      }
    } else if (query.reg) {
      const digits = query.reg.replace(/\D/g, '').slice(0, 5);
      const canonical = formatRegistrationNumberInput(digits);

      found =
        registrations.find((r) => {
          const rNum = (r.registration_number || '').toUpperCase();
          const rDigits = rNum.replace(/\D/g, '');
          return rNum === canonical || rDigits === digits || Number(rDigits) === Number(digits);
        }) || null;

      if (!found && canonical) {
        try {
          const res = await lookupRegistrationByRegNumber('deepaura-2k26', canonical);
          if (res.found && res.alumni) {
            found = {
              id: res.registration_id || '',
              registration_number: res.registration_number || canonical,
              event_id: '',
              alumni_id: res.alumni.id || '',
              attendance_status: (res.attendance_status as any) || 'yes',
              number_of_attendees: res.number_of_attendees || 1,
              adults_count: res.adults_count ?? 1,
              children_above_7_count: res.children_above_7_count ?? 0,
              children_under_7_count: res.children_under_7_count ?? 0,
              amount: res.amount || 0,
              payment_screenshot_path: res.payment_screenshot_path || null,
              photo_url: res.photo_url || null,
              alumni: res.alumni,
              payment_verifications: (res as any).payment_verifications || [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          }
        } catch (err) {
          console.warn('lookupRegistrationByRegNumber notice:', err);
        }
      }
      if (!found) {
        setLookupNotFoundMsg(`No registered attendee found for "${canonical || query.reg}".`);
      }
    }

    setIsSearchingLookup(false);

    if (found) {
      setVerifiedAttendee(found);
      setPhotoLoadFailed(false);
      resolveAttendeePhoto(found).then((url) => setVerifiedAttendeePhoto(url));
    }
  };

  // Called when gate staff clicks "Allow Entry" button below the verified ID card
  const handleAllowEntry = async (attendee: EventRegistration) => {
    const phone = attendee.alumni?.mobile;
    if (!phone) {
      alert('No mobile number recorded for this attendee.');
      return;
    }
    setIsVerifying(true);
    try {
      const result = await verifyGateAttendee(
        phone,
        verifiedBy,
        activeSubTab === 'scanner' ? 'qr_scan' : 'manual_phone'
      );
      if (result.success) {
        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setEntryAllowedMsg(`🟢 Entry Allowed • Admitted at ${nowTime} by ${verifiedBy}`);
        await loadGateEntries();
        onRefreshRegistrations();
      } else if (result.status === 'ALREADY_ENTERED') {
        alert(`Already entered: ${result.message}`);
      } else {
        alert(result.message || 'Verification failed.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to allow entry.');
    } finally {
      setIsVerifying(false);
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
          let targetPhone = clean.length === 10 ? clean : '';
          let targetReg = !targetPhone && decodedText.toUpperCase().includes('REG-') ? decodedText : '';

          // Stop camera scanner immediately to freeze frame and show attendee card
          if (scannerInstanceRef.current) {
            const sc = scannerInstanceRef.current;
            scannerInstanceRef.current = null;
            if (sc.isScanning) {
              sc.stop().then(() => sc.clear()).catch(() => { });
            } else {
              try { sc.clear(); } catch (_) { }
            }
          }
          setScannerActive(false);

          if (targetPhone) {
            lookupAndDisplayAttendee({ phone: targetPhone });
          } else if (targetReg) {
            lookupAndDisplayAttendee({ reg: targetReg });
          } else {
            const digits = decodedText.replace(/\D/g, '');
            if (digits.length === 10) {
              lookupAndDisplayAttendee({ phone: digits });
            } else if (digits.length > 0) {
              lookupAndDisplayAttendee({ reg: digits });
            } else {
              setLookupNotFoundMsg(`Scanned QR is unrecognized: ${decodedText}`);
            }
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

  // Search by registration number on button click or form submit (NO live suggestions while typing)
  const handleSearchByRegNumber = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const digits = manualRegNumber.trim().replace(/\D/g, '');
    if (!digits) {
      setLookupNotFoundMsg('Please enter registration number digits (e.g. 3 or 00003).');
      return;
    }
    lookupAndDisplayAttendee({ reg: digits });
  };

  // Search by phone on button click or form submit (NO live suggestions while typing)
  const handleSearchByPhone = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = cleanMobileNumber(manualPhone);
    if (clean.length < 10) {
      setLookupNotFoundMsg('Please enter a valid 10-digit registered mobile number.');
      return;
    }
    lookupAndDisplayAttendee({ phone: clean });
  };

  // When user selects an attendee from the Name predictive dropdown, show ONLY that attendee's ID card
  const handleSelectNameAttendee = (reg: EventRegistration) => {
    setVerifiedAttendee(reg);
    setPhotoLoadFailed(false);
    setEntryAllowedMsg(null);
    setLookupNotFoundMsg(null);
    resolveAttendeePhoto(reg).then((url) => setVerifiedAttendeePhoto(url));
  };

  // Reset lookup form and clear search selection
  const handleResetLookup = () => {
    setVerifiedAttendee(null);
    setVerifiedAttendeePhoto(null);
    setPhotoLoadFailed(false);
    setEntryAllowedMsg(null);
    setLookupNotFoundMsg(null);
    setScanResult(null);
    setManualPhone('');
    setManualRegNumber('');
    setSelectedAttendee(null);
    setNameSearchQuery('');

    if (activeSubTab === 'scanner') {
      setScannerActive(true);
    }
  };

  // Redirect to Spot Walk-in Desk with pre-filled attendee data
  const handleRedirectToSpot = async (data?: {
    name?: string;
    mobile?: string;
    branch?: string | null;
    batch?: number | string | null;
    adults?: number;
    kidsAbove10?: number;
    kidsUnder10?: number;
    amount?: number;
    reg?: EventRegistration;
  }) => {
    if (data) {
      const clean = data.mobile ? cleanMobileNumber(data.mobile) : '';
      let matched: EventRegistration | null = null;

      // 1. Always attempt live database lookup first for most accurate snapshot and counts
      if (clean && clean.length === 10) {
        try {
          const remote = await lookupRegistrationByMobile('deepaura-2k26', clean);
          if (remote.found && remote.alumni) {
            matched = {
              id: remote.registration_id || '',
              registration_number: remote.registration_number || '',
              event_id: '',
              alumni_id: remote.alumni.id || '',
              attendance_status: (remote.attendance_status as any) || 'yes',
              number_of_attendees: remote.number_of_attendees || 1,
              adults_count: remote.adults_count ?? 1,
              children_above_7_count: remote.children_above_7_count ?? 0,
              children_under_7_count: remote.children_under_7_count ?? 0,
              amount: remote.amount || 0,
              payment_screenshot_path: remote.payment_screenshot_path || null,
              created_at: remote.created_at || new Date().toISOString(),
              updated_at: remote.updated_at || new Date().toISOString(),
              alumni: remote.alumni,
            };
          }
        } catch (_) { }
      }

      if (!matched && data.reg) {
        matched = data.reg;
      }
      if (!matched && clean) {
        matched =
          registrations.find(
            (r) => cleanMobileNumber(r.alumni?.mobile || '') === clean
          ) || null;
      }

      if (matched) {
        setExistingMatchedReg(matched);
      }

      if (data.name) setSpotName(data.name);
      if (clean) setSpotMobile(clean);
      setSpotBranch(data.branch || '');
      setSpotBatch(data.batch ? Number(data.batch) : '');
      const adults = data.adults || (matched?.adults_count ?? (matched?.number_of_attendees || 1));
      const kAbove = data.kidsAbove10 ?? (matched?.children_above_7_count ?? 0);
      const kUnder = data.kidsUnder10 ?? (matched?.children_under_7_count ?? 0);
      setSpotAdults(adults);
      setSpotKidsAbove10(kAbove);
      setSpotKidsUnder10(kUnder);
      setSpotPaymentMode('');
      setPaymentConfirmed(false);
      setSpotErrors({});
      setSpotFormErrorMsg(null);
    }
    setScanResult(null);
    setActiveSubTab('spot');
  };

  // Smart Mobile lookup on typing in Spot Walk-in form - Live Server Single Source of Truth
  const handleSpotMobileChange = async (val: string) => {
    const rawDigits = val.replace(/\D/g, '');
    const clean =
      rawDigits.length > 10 && rawDigits.startsWith('91')
        ? rawDigits.slice(2, 12)
        : rawDigits.slice(0, 10);
    setSpotMobile(clean);

    if (clean.length === 10) {
      // 1. Query live database directly to fetch the latest counts and combined screenshots
      let matched: EventRegistration | null = null;
      try {
        const remote = await lookupRegistrationByMobile('deepaura-2k26', clean);
        if (remote.found && remote.alumni) {
          matched = {
            id: remote.registration_id || '',
            registration_number: remote.registration_number || '',
            event_id: '',
            alumni_id: remote.alumni.id || '',
            attendance_status: (remote.attendance_status as any) || 'yes',
            number_of_attendees: remote.number_of_attendees || 1,
            adults_count: remote.adults_count ?? 1,
            children_above_7_count: remote.children_above_7_count ?? 0,
            children_under_7_count: remote.children_under_7_count ?? 0,
            amount: remote.amount || 0,
            payment_screenshot_path: remote.payment_screenshot_path || null,
            created_at: remote.created_at || new Date().toISOString(),
            updated_at: remote.updated_at || new Date().toISOString(),
            alumni: remote.alumni,
          };
        }
      } catch (lookupErr) {
        console.warn('Spot remote lookup notice, falling back to in-memory:', lookupErr);
      }

      // 2. In-memory registrations fallback if remote lookup didn't return a record
      if (!matched) {
        matched =
          registrations.find(
            (r) => cleanMobileNumber(r.alumni?.mobile || '') === clean
          ) || null;
      }

      if (matched && matched.alumni) {
        setExistingMatchedReg(matched);
        setSpotName(matched.alumni.name || '');
        if (matched.alumni.engineering_discipline) {
          setSpotBranch(matched.alumni.engineering_discipline);
        }
        if (matched.alumni.year_of_passing) {
          setSpotBatch(Number(matched.alumni.year_of_passing));
        }
        const adults = matched.adults_count ?? (matched.number_of_attendees || 1);
        const kAbove = matched.children_above_7_count ?? 0;
        const kUnder = matched.children_under_7_count ?? 0;
        setSpotAdults(adults);
        setSpotKidsAbove10(kAbove);
        setSpotKidsUnder10(kUnder);
      } else {
        setExistingMatchedReg(null);
      }
    } else {
      if (existingMatchedReg) {
        setExistingMatchedReg(null);
      }
    }
  };

  // Comprehensive reset for Spot Walk-in Registration form
  const handleResetSpot = (clearResult = true) => {
    setExistingMatchedReg(null);
    setSpotName('');
    setSpotMobile('');
    setSpotBranch('');
    setSpotBatch('');
    setSpotAdults(1);
    setSpotKidsAbove10(0);
    setSpotKidsUnder10(0);
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
    if (!spotPaymentMode && !isFullyPaid) {
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
        uploadedScreenshotPath = await uploadSpotPaymentScreenshot(spotPhotoFile, spotMobile, spotName);
      } catch (uploadErr) {
        console.warn('Screenshot upload issue, proceeding with registration:', uploadErr);
      }
    }

    // Combine existing screenshots with newly uploaded screenshot (comma-separated), preserving initial proof
    let finalCombinedScreenshotPath: string | null = existingMatchedReg?.payment_screenshot_path || null;
    if (uploadedScreenshotPath) {
      if (existingMatchedReg?.payment_screenshot_path) {
        const existingParts = existingMatchedReg.payment_screenshot_path
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (!existingParts.includes(uploadedScreenshotPath)) {
          finalCombinedScreenshotPath = `${existingMatchedReg.payment_screenshot_path},${uploadedScreenshotPath}`;
        }
      } else {
        finalCombinedScreenshotPath = uploadedScreenshotPath;
      }
    }

    const isUpi = Boolean(selectedUpiConfig);
    const effectiveAmount =
      isFullyPaid || spotPaymentMode === 'COMPLIMENTARY'
        ? 0
        : amountToCollect;

    const diffNote = isExistingPaid
      ? isFullyPaid
        ? ' [All Dues Cleared - Paid Online]'
        : ` [Diff ₹${effectiveAmount} Collected, Prev ₹${previousPaidAmount}]`
      : '';

    const effectivePaymentMode = isFullyPaid ? 'ALL_DUES_CLEARED' : spotPaymentMode;
    const verifiedByNote = isUpi
      ? `${verifiedBy} (UPI: ${selectedUpiConfig?.account_name}${uploadedScreenshotPath ? ' [Proof Attached]' : ''}${diffNote})`
      : `${verifiedBy} (${effectivePaymentMode}${diffNote})`;

    // 2. Perform spot registration at gate
    const res = await spotRegisterAtGate({
      name: spotName.trim(),
      mobile: spotMobile.trim(),
      discipline: spotBranch,
      year_of_passing: Number(spotBatch),
      numberOfAttendees: spotAdults + spotKidsAbove10 + spotKidsUnder10,
      paymentMode: effectivePaymentMode,
      amount: totalContributionAmount,
      verifiedBy: verifiedByNote,
      paymentScreenshotPath: finalCombinedScreenshotPath,
    });

    // 3. Reinforce updating exact attendee counts and attached screenshot via Security Definer RPC
    if (res.success && res.data?.registration_id) {
      const regId = res.data.registration_id;
      if (finalCombinedScreenshotPath) {
        await attachSpotPaymentScreenshot(regId, finalCombinedScreenshotPath);
      }

      await updateSpotRegistrationDetails({
        registrationId: regId,
        name: spotName.trim(),
        mobile: spotMobile.trim(),
        discipline: spotBranch,
        yearOfPassing: Number(spotBatch),
        adultsCount: spotAdults,
        childrenAbove7Count: spotKidsAbove10,
        childrenUnder7Count: spotKidsUnder10,
        totalAttendees: spotAdults + spotKidsAbove10 + spotKidsUnder10,
        amount: totalContributionAmount,
        paymentScreenshotPath: finalCombinedScreenshotPath,
        address: existingMatchedReg?.alumni?.address,
        city: existingMatchedReg?.alumni?.city,
        state: existingMatchedReg?.alumni?.state,
        country: existingMatchedReg?.alumni?.country,
      });
    }

    setSpotSubmitting(false);

    if (res.success && res.data) {
      const successMessage = isExistingPaid
        ? isFullyPaid
          ? 'Gate Entry Confirmed (All Dues Cleared ✓)!'
          : `Spot Update & Gate Entry Complete (Diff ₹${effectiveAmount} Collected)!`
        : 'Spot Registration & Gate Entry Complete!';

      setSpotScanResult({
        success: true,
        status: 'ENTERED',
        message: successMessage,
        registration_id: res.data.registration_id,
        registration_number: res.data.registration_number,
        attendee_name: res.data.attendee_name,
        phone_number: res.data.phone_number,
        branch: res.data.branch,
        year_of_passing: res.data.year_of_passing,
        number_of_attendees: spotAdults + spotKidsAbove10 + spotKidsUnder10,
        amount: totalContributionAmount,
        badge_category: 'Alumnus',
        verified_by: verifiedByNote,
      });

      // Update local registration record in memory immediately so any local check sees the new counts
      const cleanSpotMobile = cleanMobileNumber(spotMobile);
      const matchedIdx = registrations.findIndex(
        (r) => cleanMobileNumber(r.alumni?.mobile || '') === cleanSpotMobile
      );
      if (matchedIdx !== -1) {
        registrations[matchedIdx].adults_count = spotAdults;
        registrations[matchedIdx].children_above_7_count = spotKidsAbove10;
        registrations[matchedIdx].children_under_7_count = spotKidsUnder10;
        registrations[matchedIdx].number_of_attendees = spotAdults + spotKidsAbove10 + spotKidsUnder10;
        registrations[matchedIdx].amount = totalContributionAmount;
        registrations[matchedIdx].payment_screenshot_path = finalCombinedScreenshotPath;
      }

      // Reset form
      handleResetSpot(false);
      // Refresh entries & stats
      await loadGateEntries();
      await onRefreshRegistrations();
    } else {
      setSpotScanResult({
        success: false,
        status: 'ERROR',
        message: res.error || 'Failed to complete spot registration.',
        attendee_name: spotName.trim(),
      });
    }
  };

  const getAttendeeInitials = (name?: string): string => {
    if (!name) return 'ECK';
    const clean = name.trim().replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?|er\.?)\s+/i, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'ECK';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Render the horizontal attendee ID card with approval actions down below
  const renderAttendeeIdCardWithActions = (attendee: EventRegistration) => {
    const alumni = attendee.alumni;
    const { displayName: attendeeName, fontSizeClass: nameSizeClass, fullName: originalFullName } =
      formatSmartAttendeeName(alumni?.name || 'Alumnus');
    const regNumber = attendee.registration_number || '';
    const branch = alumni?.engineering_discipline || '';
    const batchYear = alumni?.year_of_passing ? String(alumni.year_of_passing) : '';

    const totalCount = attendee.number_of_attendees || 1;
    const adultsCount = attendee.adults_count ?? 1;
    const kidsCount = (attendee.children_above_7_count || 0) + (attendee.children_under_7_count || 0);

    let attendeesDesc = `${totalCount} Member${totalCount > 1 ? 's' : ''}`;
    if (totalCount === 1) {
      attendeesDesc += ' (Alumnus)';
    } else if (kidsCount > 0) {
      attendeesDesc += ` (${adultsCount} Adults + ${kidsCount} Kids)`;
    } else {
      attendeesDesc += ` (Alumnus + ${totalCount - 1} Guest${totalCount - 1 > 1 ? 's' : ''})`;
    }

    const gateStatus = getAttendeeGateStatus(attendee);
    const isPaid =
      attendee.attendance_status === 'yes' ||
      attendee.payment_verifications?.some((v) => v.verified_status === 'VERIFIED');

    return (
      <div className="gate-id-card-wrapper" ref={statusResultRef}>
        {/* ============================================================
            ATTENDEE ID CARD (Exact Match to ID Pass & User Screenshot)
            ============================================================ */}
        <div className="ticket-v-attendee-card">
          {/* 4 Ornate Gold Corner Filigree Flourishes */}
          <img src="/gold-corner-filigree-exact.png" alt="" className="ticket-v-corner-flourish corner-tl" />
          <img src="/gold-corner-filigree-exact.png" alt="" className="ticket-v-corner-flourish corner-tr" />
          <img src="/gold-corner-filigree-exact.png" alt="" className="ticket-v-corner-flourish corner-bl" />
          <img src="/gold-corner-filigree-exact.png" alt="" className="ticket-v-corner-flourish corner-br" />

          {/* Left Column: Photo & Avatar */}
          <div className="ticket-v-photo-col">
            <div className="ticket-v-photo-box">
              {verifiedAttendeePhoto && !photoLoadFailed ? (
                <img
                  src={verifiedAttendeePhoto}
                  alt={attendeeName}
                  className="ticket-v-photo-img"
                  onError={() => setPhotoLoadFailed(true)}
                />
              ) : (
                <div className="ticket-v-avatar-box">
                  <div className="ticket-v-avatar-circle">
                    <span className="ticket-v-avatar-initials">
                      {getAttendeeInitials(alumni?.name || attendeeName)}
                    </span>
                  </div>
                  <span className="ticket-v-avatar-badge">ALUMNI</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Key Details */}
          <div className="ticket-v-info-col">
            {/* Row 1: Attendee Name */}
            <div className="ticket-v-info-field ticket-v-name-row">
              <span className="ticket-v-label">Attendee Name</span>
              <h3 className={`ticket-v-val-name ${nameSizeClass}`} title={originalFullName}>
                {attendeeName}
              </h3>
            </div>

            {/* Row 2: Batch & Registration No */}
            <div className="ticket-v-info-split-row">
              <div className="ticket-v-batch-box">
                <span className="ticket-v-label">Batch</span>
                <p className="ticket-v-val-text ticket-v-val-batch" title={`${batchYear}${branch ? ` • ${branch}` : ''}`}>
                  <strong>{batchYear}</strong>{branch ? ` • ${branch}` : ''}
                </p>
              </div>
              <div className="ticket-v-reg-box">
                <span className="ticket-v-label">Registration No</span>
                <span className="ticket-v-val-reg">{regNumber}</span>
              </div>
            </div>

            {/* Row 3: Attendees Count */}
            <div className="ticket-v-info-field">
              <span className="ticket-v-label">No. of Attendees</span>
              <p className="ticket-v-val-text ticket-v-highlight">{attendeesDesc}</p>
            </div>

            {/* Row 4: Date & Venue */}
            <div className="ticket-v-meta-row">
              <div className="ticket-v-meta-item">
                <span className="ticket-v-label">Date &amp; Time</span>
                <span className="ticket-v-meta-val">01 Nov 2026, 5:00 PM</span>
              </div>
              <div className="ticket-v-meta-item">
                <span className="ticket-v-label">Venue</span>
                <span className="ticket-v-meta-val">Agora Ground, RTU</span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================
            APPROVAL & ENTRY ACTIONS DOWN BELOW
            ============================================================ */}
        <div className="gate-card-actions-area">
          {entryAllowedMsg ? (
            <>
              <div className="gate-entry-allowed-line">
                <span>{entryAllowedMsg}</span>
              </div>
              <button
                type="button"
                className="btn-gate-next-card"
                onClick={handleResetLookup}
              >
                {activeSubTab === 'scanner' ? '📷 Scan Next Attendee →' : '🔍 Verify Next Attendee →'}
              </button>
            </>
          ) : (
            <>
              {gateStatus.status === 'ALREADY_ENTERED' && (
                <>
                  <div className="gate-entry-alert-line warning">
                    <span>⚠️ Already Admitted at {new Date(gateStatus.entry!.entered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by {gateStatus.entry!.verified_by || 'Staff'}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-gate-next-card"
                    onClick={handleResetLookup}
                  >
                    {activeSubTab === 'scanner' ? '📷 Scan Next Attendee →' : '🔍 Verify Next Attendee →'}
                  </button>
                </>
              )}

              {(!isPaid || gateStatus.status === 'PAYMENT_PENDING' || gateStatus.status === 'MAYBE') && (
                <>
                  <div className="gate-entry-alert-line pending">
                    <span>💳 Payment Pending (₹{attendee.amount || 0}) • Not Marked Paid</span>
                  </div>
                  <button
                    type="button"
                    className="gate-allow-entry-btn"
                    style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
                    onClick={() =>
                      handleRedirectToSpot({
                        name: alumni?.name,
                        mobile: alumni?.mobile,
                        branch: alumni?.engineering_discipline,
                        batch: alumni?.year_of_passing,
                        adults: attendee.adults_count || attendee.number_of_attendees || 1,
                        kidsAbove10: attendee.children_above_7_count || 0,
                        kidsUnder10: attendee.children_under_7_count || 0,
                        amount: attendee.amount,
                        reg: attendee,
                      })
                    }
                  >
                    ⚡ Collect Payment at Spot Desk →
                  </button>
                  <button
                    type="button"
                    className="gate-card-clear-link"
                    onClick={handleResetLookup}
                  >
                    Cancel / Search Another
                  </button>
                </>
              )}

              {isPaid && gateStatus.status !== 'ALREADY_ENTERED' && (
                <>
                  <button
                    type="button"
                    className="gate-allow-entry-btn"
                    disabled={isVerifying}
                    onClick={() => handleAllowEntry(attendee)}
                  >
                    {isVerifying ? 'Admitting...' : '✅ Allow Entry'}
                  </button>
                  <button
                    type="button"
                    className="gate-card-clear-link"
                    onClick={handleResetLookup}
                  >
                    Cancel / Search Another
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
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
          {/* If attendee found via QR scan */}
          {verifiedAttendee ? (
            renderAttendeeIdCardWithActions(verifiedAttendee)
          ) : lookupNotFoundMsg ? (
            <div className="gate-search-not-found">
              <p>🔍 {lookupNotFoundMsg}</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn-gate-next-card"
                  style={{ maxWidth: '240px' }}
                  onClick={() => {
                    setLookupNotFoundMsg(null);
                    setScannerActive(true);
                  }}
                >
                  <span>📷</span>
                  <span>Retry Camera Scanner</span>
                </button>
                <button
                  type="button"
                  className="btn-spot-create-new"
                  onClick={() => setActiveSubTab('spot')}
                >
                  ⚡ Register at Spot Walk-in Desk →
                </button>
              </div>
            </div>
          ) : (
            <>
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

              {/* If scanner is inactive and no scan in-flight, show Camera Start button */}
              {!scannerActive && !isVerifying && (
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
            </>
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
                className={`manual-mode-btn ${manualLookupMode === 'reg_number' ? 'active' : ''}`}
                onClick={() => {
                  setManualLookupMode('reg_number');
                  handleResetLookup();
                }}
              >
                <span>🎫 Reg ID</span>
              </button>
              <button
                type="button"
                className={`manual-mode-btn ${manualLookupMode === 'phone' ? 'active' : ''}`}
                onClick={() => {
                  setManualLookupMode('phone');
                  handleResetLookup();
                }}
              >
                <span>📱 Phone</span>
              </button>
              <button
                type="button"
                className={`manual-mode-btn ${manualLookupMode === 'name' ? 'active' : ''}`}
                onClick={() => {
                  setManualLookupMode('name');
                  handleResetLookup();
                }}
              >
                <span>👤 Name</span>
              </button>
            </div>

            <div className="name-search-container">
              {verifiedAttendee ? (
                renderAttendeeIdCardWithActions(verifiedAttendee)
              ) : (
                <>
                  {manualLookupMode === 'reg_number' && (
                    <div className="gate-search-flow-box">
                      <form onSubmit={handleSearchByRegNumber} className="gate-search-input-group">
                        <div className="manual-reg-input-group">
                          <span className="manual-reg-prefix">REG-</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="e.g. 39"
                            maxLength={5}
                            value={manualRegNumber}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/\D/g, '').slice(0, 5);
                              setManualRegNumber(cleaned);
                              if (lookupNotFoundMsg) setLookupNotFoundMsg(null);
                            }}
                            className="manual-reg-field"
                            autoFocus
                          />
                          {manualRegNumber && (
                            <button
                              type="button"
                              onClick={() => {
                                setManualRegNumber('');
                                setLookupNotFoundMsg(null);
                              }}
                              className="name-search-clear-btn"
                              style={{ position: 'relative', right: '4px' }}
                              title="Clear input"
                            >
                              ✕
                            </button>
                          )}
                          <button
                            type="submit"
                            className="gate-search-btn"
                            disabled={isSearchingLookup || !manualRegNumber.trim()}
                          >
                            {isSearchingLookup ? 'Searching...' : '🔍 Search'}
                          </button>
                        </div>
                      </form>

                      {lookupNotFoundMsg && (
                        <div className="gate-search-not-found">
                          <p>⚠️ {lookupNotFoundMsg}</p>
                          <button
                            type="button"
                            onClick={() =>
                              handleRedirectToSpot({
                                name: undefined,
                                mobile: undefined,
                              })
                            }
                            className="btn-spot-create-new"
                          >
                            ⚡ Register at Spot Walk-in Desk →
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {manualLookupMode === 'phone' && (
                    <div className="gate-search-flow-box">
                      <form onSubmit={handleSearchByPhone} className="gate-search-input-group">
                        <div className="manual-phone-input-group">
                          <span className="manual-phone-prefix">+91</span>
                          <input
                            type="tel"
                            placeholder="10-digit mobile"
                            value={manualPhone}
                            maxLength={10}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, '');
                              const clean =
                                raw.length > 10 && raw.startsWith('91')
                                  ? raw.slice(2, 12)
                                  : raw.slice(0, 10);
                              setManualPhone(clean);
                              if (lookupNotFoundMsg) setLookupNotFoundMsg(null);
                            }}
                            className="manual-phone-field"
                            autoFocus
                          />
                          {manualPhone && (
                            <button
                              type="button"
                              onClick={() => {
                                setManualPhone('');
                                setLookupNotFoundMsg(null);
                              }}
                              className="name-search-clear-btn"
                              style={{ position: 'relative', right: '4px' }}
                              title="Clear input"
                            >
                              ✕
                            </button>
                          )}
                          <button
                            type="submit"
                            className="gate-search-btn"
                            disabled={isSearchingLookup || manualPhone.trim().length < 10}
                          >
                            {isSearchingLookup ? 'Searching...' : '🔍 Search'}
                          </button>
                        </div>
                      </form>

                  {lookupNotFoundMsg && (
                    <div className="gate-search-not-found">
                      <p>⚠️ {lookupNotFoundMsg}</p>
                      <button
                        type="button"
                        onClick={() =>
                          handleRedirectToSpot({
                            mobile: manualPhone.trim(),
                          })
                        }
                        className="btn-spot-create-new"
                      >
                        ⚡ Register at Spot Walk-in Desk →
                      </button>
                    </div>
                  )}
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

              {/* 2. NAME SEARCH PREDICTIVE RESULTS (Only shown when manualLookupMode === 'name') */}
              {manualLookupMode === 'name' && (() => {
                const queryActive = nameSearchQuery.trim();

                if (queryActive.length < 2) {
                  return (
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
                  );
                }

                if (filteredNameRegistrations.length === 0) {
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
                            name: queryActive,
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
                      <span>Found {filteredNameRegistrations.length} matching {filteredNameRegistrations.length === 1 ? 'attendee' : 'attendees'}</span>
                      <span>Tap name to view ID Card &amp; admit</span>
                    </div>

                    <div className="name-search-results-list">
                      {filteredNameRegistrations.map((reg) => {
                        const alumni = reg.alumni;
                        if (!alumni) return null;
                        const gateStatus = getAttendeeGateStatus(reg);
                        const participantCount = reg.number_of_attendees || 1;

                        return (
                          <div
                            key={reg.id}
                            className="name-search-result-card"
                            onClick={() => handleSelectNameAttendee(reg)}
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

                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </div>

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

            {existingMatchedReg && (
              <div className={`spot-detected-status-card status-${existingStatusType.toLowerCase()}`}>
                <div className="status-header-row">
                  <div className="status-badge-wrap">
                    {existingStatusType === 'CONFIRMED_PAID' && (
                      <span className="spot-status-pill pill-paid">
                        ✓ Confirmed &amp; Paid
                      </span>
                    )}
                    {existingStatusType === 'PAYMENT_PENDING' && (
                      <span className="spot-status-pill pill-pending">
                        ⏳ Payment Pending (Unpaid)
                      </span>
                    )}
                    {existingStatusType === 'MAYBE' && (
                      <span className="spot-status-pill pill-maybe">
                        ❓ Marked Maybe (Unpaid)
                      </span>
                    )}
                    {existingStatusType === 'NO' && (
                      <span className="spot-status-pill pill-no">
                        ✕ Marked Not Attending (Unpaid)
                      </span>
                    )}
                    {existingMatchedReg.registration_number && (
                      <span className="spot-reg-number-chip">
                        {existingMatchedReg.registration_number}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-clear-detected"
                    onClick={() => handleResetSpot(true)}
                    title="Clear and register a new attendee"
                  >
                    ✕ Clear
                  </button>
                </div>

                <div className="status-body-content">
                  {existingStatusType === 'CONFIRMED_PAID' ? (
                    <p className="status-main-desc">
                      Alumnus is <strong>Confirmed &amp; Paid</strong> (₹{previousPaidAmount} credited online).
                      {isFullyPaid ? (
                        <span className="status-highlight-text" style={{ color: '#34d399' }}>
                          {' '}Current attendee count ({spotAdults + spotKidsAbove10 + spotKidsUnder10}) is fully covered — no extra payment required!
                        </span>
                      ) : (
                        <span className="status-highlight-text" style={{ color: '#fbbf24' }}>
                          {' '}Attendee count increased! Previous <strong>₹{previousPaidAmount}</strong> is credited. Collect only the difference of <strong>₹{differenceDue}</strong>.
                        </span>
                      )}
                    </p>
                  ) : existingStatusType === 'PAYMENT_PENDING' ? (
                    <p className="status-main-desc">
                      Attendee signed up online with status <strong>Payment Pending</strong> (unpaid).
                      <span className="status-highlight-text" style={{ color: '#fbbf24' }}>
                        {' '}Full contribution of <strong>₹{totalContributionAmount}</strong> must be collected at the gate desk.
                      </span>
                    </p>
                  ) : existingStatusType === 'MAYBE' ? (
                    <p className="status-main-desc">
                      Attendee originally registered online as <strong>“Maybe”</strong> without making payment.
                      <span className="status-highlight-text" style={{ color: '#fbbf24' }}>
                        {' '}Full contribution of <strong>₹{totalContributionAmount}</strong> must be collected at the gate desk.
                      </span>
                    </p>
                  ) : (
                    <p className="status-main-desc">
                      Attendee originally registered online as <strong>“Not Attending”</strong>.
                      <span className="status-highlight-text" style={{ color: '#fbbf24' }}>
                        {' '}Attending in-person today — full contribution of <strong>₹{totalContributionAmount}</strong> must be collected at the gate desk.
                      </span>
                    </p>
                  )}
                </div>
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
                  <div className="input-prefix-wrap">
                    <span className="input-prefix">+91</span>
                    <input
                      id="spot-mobile"
                      type="tel"
                      required
                      placeholder="10-digit number"
                      maxLength={10}
                      value={spotMobile}
                      onChange={(e) => {
                        handleSpotMobileChange(e.target.value);
                        clearSpotError('mobile');
                      }}
                      className="prefixed-input"
                      autoFocus={activeSubTab === 'spot' && !spotMobile}
                    />
                  </div>
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
                      <span>⚡ Spot Entry: ₹1,000 per adult • ₹500 per child (10+) • Free (&lt;10 yrs)</span>
                    </div>
                  </div>

                  <div className="spot-unified-attendees-box">
                    {/* Row 1: Adults */}
                    <div className="spot-attendee-unified-row">
                      <div className="spot-attendee-unified-info">
                        <div className="row-title-wrap">
                          <strong>Adults</strong>
                          {isExistingPaid && (
                            <span className="spot-reg-number-chip" style={{ fontSize: '0.72rem', padding: '0.1rem 0.4rem' }}>
                              Min: {minAdults}
                            </span>
                          )}
                        </div>
                        <span className="row-desc">
                          {spotAdults === 1
                            ? '₹1,000 for 1 adult'
                            : `${spotAdults} × ₹1,000 = ₹${spotAdults * 1000}`}
                        </span>
                      </div>
                      <div className="spot-stepper">
                        <button
                          type="button"
                          onClick={() => {
                            const newAdults = Math.max(minAdults, spotAdults - 1);
                            setSpotAdults(newAdults);
                          }}
                          disabled={spotAdults <= minAdults}
                          aria-label="Decrease adults"
                          title={isExistingPaid && spotAdults <= minAdults ? `Cannot reduce below previously registered count (${minAdults})` : undefined}
                        >
                          −
                        </button>
                        <span>{spotAdults}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newAdults = Math.min(10, spotAdults + 1);
                            setSpotAdults(newAdults);
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
                          {isExistingPaid && minKidsAbove10 > 0 && (
                            <span className="spot-reg-number-chip" style={{ fontSize: '0.72rem', padding: '0.1rem 0.4rem' }}>
                              Min: {minKidsAbove10}
                            </span>
                          )}
                        </div>
                        <span className="row-desc">
                          {spotKidsAbove10 === 0
                            ? '₹500 per child'
                            : `${spotKidsAbove10} × ₹500 = ₹${spotKidsAbove10 * 500}`}
                        </span>
                      </div>
                      <div className="spot-stepper">
                        <button
                          type="button"
                          onClick={() => {
                            const newKids = Math.max(minKidsAbove10, spotKidsAbove10 - 1);
                            setSpotKidsAbove10(newKids);
                          }}
                          disabled={spotKidsAbove10 <= minKidsAbove10}
                          aria-label="Decrease children 10 and above"
                          title={isExistingPaid && spotKidsAbove10 <= minKidsAbove10 ? `Cannot reduce below previously registered count (${minKidsAbove10})` : undefined}
                        >
                          −
                        </button>
                        <span>{spotKidsAbove10}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newKids = Math.min(10, spotKidsAbove10 + 1);
                            setSpotKidsAbove10(newKids);
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
                          {isExistingPaid && minKidsUnder10 > 0 && (
                            <span className="spot-reg-number-chip" style={{ fontSize: '0.72rem', padding: '0.1rem 0.4rem' }}>
                              Min: {minKidsUnder10}
                            </span>
                          )}
                        </div>
                        <span className="badge-free">FREE</span>
                      </div>
                      <div className="spot-stepper">
                        <button
                          type="button"
                          onClick={() => {
                            const newKids = Math.max(minKidsUnder10, spotKidsUnder10 - 1);
                            setSpotKidsUnder10(newKids);
                          }}
                          disabled={spotKidsUnder10 <= minKidsUnder10}
                          aria-label="Decrease children under 10"
                          title={isExistingPaid && spotKidsUnder10 <= minKidsUnder10 ? `Cannot reduce below previously registered count (${minKidsUnder10})` : undefined}
                        >
                          −
                        </button>
                        <span>{spotKidsUnder10}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newKids = Math.min(10, spotKidsUnder10 + 1);
                            setSpotKidsUnder10(newKids);
                          }}
                          disabled={spotKidsUnder10 >= 10}
                          aria-label="Increase children under 10"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Amount Breakdown Card Matching Registration Form (Requirement: Difference Calculation) */}
                  <div className="spot-amount-summary-box">
                    <div className="spot-pricing-items-list">
                      {spotPricing.items.map((item, idx) => (
                        <div key={idx} className="spot-amount-row">
                          <div className="spot-amount-label-wrap">
                            <span className="spot-amount-label">{item.label}</span>
                            <span className="spot-amount-sublabel">{item.rateDescription}</span>
                          </div>
                          <span className={`spot-amount-rate ${item.isFree ? 'spot-free-tag' : ''}`}>
                            {item.isFree ? 'FREE' : `₹${item.amount}`}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="spot-amount-divider" />

                    <div className="spot-amount-total-row">
                      <div className="spot-total-label-wrap">
                        <span className="spot-total-label">
                          {isExistingPaid ? 'Updated Total Contribution:' : 'Total Contribution:'}
                        </span>
                        <span className="spot-total-hint">
                          ({spotAttendees}{' '}
                          {spotAttendees === 1 ? 'attendee' : 'attendees'})
                        </span>
                      </div>
                      <span className="spot-total-number">₹{totalContributionAmount}</span>
                    </div>

                    {/* If Existing Paid Attendee: Deduct previously paid amount and show Difference */}
                    {isExistingPaid && (
                      <>
                        <div className="spot-amount-row spot-deduct-row">
                          <div className="spot-amount-label-wrap">
                            <span className="spot-amount-label text-paid-credit">
                              ✓ Previously Paid Contribution:
                            </span>
                            <span className="spot-amount-sublabel text-paid-credit-sub">
                              Credited from existing registration ({existingMatchedReg?.registration_number})
                            </span>
                          </div>
                          <span className="spot-amount-rate text-paid-credit font-semibold">
                            − ₹{previousPaidAmount}
                          </span>
                        </div>

                        <div className="spot-amount-divider" />

                        <div className="spot-amount-total-row spot-due-highlight-row">
                          <div className="spot-total-label-wrap">
                            <span className="spot-total-label font-bold">
                              {isFullyPaid ? 'Additional Amount Due:' : 'Difference to Pay Now:'}
                            </span>
                            <span className="spot-total-hint">
                              {isFullyPaid
                                ? 'All dues cleared for registered members'
                                : 'Difference to pay for additional member(s)'}
                            </span>
                          </div>
                          <span
                            className={`spot-total-number ${
                              isFullyPaid ? 'text-cleared font-bold' : 'text-due font-extrabold'
                            }`}
                            style={{ color: isFullyPaid ? '#34d399' : '#f59e0b' }}
                          >
                            {isFullyPaid ? '₹0 (Paid ✓)' : `₹${differenceDue}`}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Fully Paid Callout if dues cleared */}
                  {isFullyPaid && (
                    <div className="spot-fully-paid-callout">
                      <div className="callout-icon">🎉</div>
                      <div className="callout-body">
                        <strong>All Dues Cleared!</strong>
                        <p>
                          Previous online payment of <strong>₹{previousPaidAmount}</strong> fully covers all{' '}
                          {spotAdults + spotKidsAbove10 + spotKidsUnder10} attendee(s). No payment collection needed at gate. Click below to confirm entry!
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Difference Alert if extra attendees added */}
                  {isExistingPaid && differenceDue > 0 && (
                    <div className="spot-diff-alert">
                      <div className="alert-flex">
                        <span className="alert-icon">💳</span>
                        <div className="alert-body">
                          <strong>Additional Payment of ₹{differenceDue} Required</strong>
                          <p>
                            You added attendee(s). Previous payment of <strong>₹{previousPaidAmount}</strong> is credited.
                            Please collect only the remaining difference of <strong>₹{differenceDue}</strong> via Cash or UPI below.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
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
                      setPaymentConfirmed(e.target.value === 'ALL_DUES_CLEARED');
                      clearSpotError('paymentMode');
                    }}
                  >
                    <option value="">-- Select Payment Method --</option>
                    {isFullyPaid && (
                      <option value="ALL_DUES_CLEARED">
                        🎉 All Dues Cleared (₹0 - Previous Payment Covers All Attendees)
                      </option>
                    )}
                    <option value="CASH">
                      💵 Cash Collected ({isExistingPaid ? `Difference: ₹${amountToCollect}` : `₹${amountToCollect}`})
                    </option>
                    <optgroup label={`📱 UPI QR - Scan to Pay ${isExistingPaid ? `Difference (₹${amountToCollect})` : `(₹${amountToCollect})`}`}>
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

              {/* ALL DUES CLEARED CARD (When difference is 0) */}
              {spotPaymentMode === 'ALL_DUES_CLEARED' && (
                <div className="spot-fully-paid-card">
                  <div className="fully-paid-icon">🎉</div>
                  <div className="fully-paid-body">
                    <h4>No Payment Required (Dues Cleared)</h4>
                    <p>
                      Attendee's previous payment of <strong>₹{previousPaidAmount}</strong> completely covers all registered attendees.
                      You can admit this attendee immediately.
                    </p>
                  </div>
                </div>
              )}

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
                      <span className="lbl">{isExistingPaid ? 'Difference Due' : 'Amount'}</span>
                      <span className="val">₹{amountToCollect}</span>
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
                        <span>⚡ {isExistingPaid ? `Scan to Pay Difference ₹${amountToCollect}` : `Scan to Pay ₹${amountToCollect}`}</span>
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
                          {spotAdults + spotKidsAbove10 + spotKidsUnder10}{' '}
                          {spotAdults + spotKidsAbove10 + spotKidsUnder10 === 1 ? 'Person' : 'People'}
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
                      <p>Collect {isExistingPaid ? 'remaining difference of ' : ''}₹{amountToCollect} cash in hand from alumnus before admitting entry.</p>
                    </div>
                    <div className="cash-amount-badge">
                      <span className="lbl">{isExistingPaid ? 'Difference Due' : 'Amount'}</span>
                      <span className="val">₹{amountToCollect}</span>
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
                          ? `✅ Confirmed: ₹${amountToCollect} cash collected at gate desk`
                          : `Check this once alumnus hands over ₹${amountToCollect} in cash.`}
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
                  type="submit"
                  disabled={spotSubmitting}
                  className="btn-primary-action btn-spot-submit"
                >
                  {spotSubmitting
                    ? 'Registering...'
                    : isFullyPaid
                    ? '✅ Confirm Gate Entry (Dues Cleared)'
                    : isExistingPaid
                    ? `⚡ Complete Spot Entry (Collect Diff ₹${amountToCollect}) →`
                    : `⚡ Complete Spot Entry (Collect ₹${amountToCollect}) →`}
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
