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
import { getEventUpiConfigs } from '../lib/paymentRotation';
import { getBatchFromPassingYear } from '../lib/batchUtils';
import { ENGINEERING_DISCIPLINES } from '../types';
import type { EventRegistration, GateEntry, GateVerificationResult, ECKEvent } from '../types';

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
  event?: ECKEvent | null;
}

export const GateVerificationPortal: React.FC<GateVerificationPortalProps> = ({
  registrations,
  onRefreshRegistrations,
  staffName,
  stationName,
  onLogout,
  event,
}) => {
  const isGateEnabled = isAdminGatePortalEnabled();
  const activeEventSlug = event?.event_slug || 'deepaura-2k26';
  const eventPrefix = (event?.event_code || 'REG').toUpperCase();
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

  // Event configured UPI endpoints for spot collection
  const eventUpiConfigs = React.useMemo(() => {
    return getEventUpiConfigs(event);
  }, [event]);

  // Currently selected UPI configuration (if paying via QR)
  const selectedUpiConfig = React.useMemo(() => {
    return eventUpiConfigs.find((c) => c.upi_id === spotPaymentMode) || null;
  }, [eventUpiConfigs, spotPaymentMode]);

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
          const res = await lookupRegistrationByMobile(activeEventSlug, clean);
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
      const canonical = formatRegistrationNumberInput(digits, eventPrefix);

      found =
        registrations.find((r) => {
          const rNum = (r.registration_number || '').toUpperCase();
          const rDigits = rNum.replace(/\D/g, '');
          return rNum === canonical || rDigits === digits || Number(rDigits) === Number(digits);
        }) || null;

      if (!found && canonical) {
        try {
          const res = await lookupRegistrationByRegNumber(activeEventSlug, canonical, eventPrefix);
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
          let targetReg =
            !targetPhone &&
            (decodedText.toUpperCase().includes(`${eventPrefix}-`) ||
              decodedText.toUpperCase().includes('REG-') ||
              decodedText.includes('-'))
              ? decodedText
              : '';

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
          const remote = await lookupRegistrationByMobile(activeEventSlug, clean);
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
        const remote = await lookupRegistrationByMobile(activeEventSlug, clean);
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
    if (spotMobile.trim() && cleanMobileNumber(spotMobile).length < 10) {
      errors.mobile = true;
    }
    if (!spotName.trim()) {
      errors.name = true;
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
      if (errors.name && Object.keys(errors).length === 1) {
        setSpotFormErrorMsg('Please enter the alumnus full name.');
      } else if (errors.mobile && Object.keys(errors).length === 1) {
        setSpotFormErrorMsg('Please enter a valid 10-digit mobile number or leave it blank.');
      } else if (errors.cashConfirmed && Object.keys(errors).length === 1) {
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
        name: 'spot-name',
        mobile: 'spot-mobile',
        paymentMode: 'spot-payment-mode',
        cashConfirmed: 'spot-cash-confirm-box',
        upiConfirmed: 'spot-snap-payment-btn',
      };

      const firstErrorKey = ['name', 'mobile', 'paymentMode', 'cashConfirmed', 'upiConfirmed'].find(
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

    // 2. Perform spot registration at gate (use safe defaults for optional fields)
    const fallbackDiscipline = spotBranch || 'Other';
    const fallbackYear = spotBatch ? Number(spotBatch) : currentYear;

    const res = await spotRegisterAtGate({
      name: spotName.trim(),
      mobile: spotMobile.trim(),
      discipline: fallbackDiscipline,
      year_of_passing: fallbackYear,
      numberOfAttendees: spotAdults + spotKidsAbove10 + spotKidsUnder10,
      paymentMode: effectivePaymentMode,
      amount: totalContributionAmount,
      verifiedBy: verifiedByNote,
      paymentScreenshotPath: finalCombinedScreenshotPath,
      eventSlug: activeEventSlug,
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
        mobile: res.data?.phone_number || spotMobile.trim() || '9999900000',
        discipline: fallbackDiscipline,
        yearOfPassing: fallbackYear,
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

    // Dynamic Date & Venue with fallback
    const eventDateFormatted = event?.event_date
      ? new Date(event.event_date).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }) + ', 5:00 PM'
      : '01 Nov 2026, 5:00 PM';
    const eventVenue = event?.location || 'Agora Ground, RTU';

    return (
      <div
        className="w-full max-w-[480px] mx-auto my-2 space-y-3.5 [container-type:inline-size] [container-name:ticketcard]"
        ref={statusResultRef}
      >
        {/* ============================================================
            ATTENDEE ID CARD (Exact Match to ID Pass & User Screenshots)
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
                <span className="ticket-v-meta-val">{eventDateFormatted}</span>
              </div>
              <div className="ticket-v-meta-item">
                <span className="ticket-v-label">Venue</span>
                <span className="ticket-v-meta-val">{eventVenue}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================
            APPROVAL & ENTRY ACTIONS DOWN BELOW
            ============================================================ */}
        <div className="w-full flex flex-col gap-2.5">
          {entryAllowedMsg ? (
            <>
              <div className="w-full py-2.5 px-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-semibold text-center flex items-center justify-center gap-2 leading-snug">
                <span>{entryAllowedMsg}</span>
              </div>
              <button
                type="button"
                className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/20 hover:border-white/35 text-slate-100 hover:text-white font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                onClick={handleResetLookup}
              >
                {activeSubTab === 'scanner' ? '📷 Scan Next Attendee →' : '🔍 Verify Next Attendee →'}
              </button>
            </>
          ) : (
            <>
              {gateStatus.status === 'ALREADY_ENTERED' && (
                <>
                  <div className="w-full py-2.5 px-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs sm:text-sm font-semibold text-center flex items-center justify-center gap-2 leading-snug">
                    <span>
                      ⚠️ Already Admitted at {new Date(gateStatus.entry!.entered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by {gateStatus.entry!.verified_by || 'Staff'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/20 hover:border-white/35 text-slate-100 hover:text-white font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                    onClick={handleResetLookup}
                  >
                    {activeSubTab === 'scanner' ? '📷 Scan Next Attendee →' : '🔍 Verify Next Attendee →'}
                  </button>
                </>
              )}

              {(!isPaid || gateStatus.status === 'PAYMENT_PENDING' || gateStatus.status === 'MAYBE') && (
                <>
                  <div className="w-full py-2.5 px-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs sm:text-sm font-semibold text-center flex items-center justify-center gap-2 leading-snug">
                    <span>💳 Payment Pending (₹{attendee.amount || 0}) • Not Marked Paid</span>
                  </div>
                  <button
                    type="button"
                    className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-md shadow-amber-500/20 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
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
                    className="w-full min-h-[40px] text-xs font-semibold text-slate-400 hover:text-white transition-colors text-center cursor-pointer"
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
                    className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    disabled={isVerifying}
                    onClick={() => handleAllowEntry(attendee)}
                  >
                    {isVerifying ? 'Admitting...' : '✅ Allow Entry'}
                  </button>
                  <button
                    type="button"
                    className="w-full min-h-[40px] text-xs font-semibold text-slate-400 hover:text-white transition-colors text-center cursor-pointer"
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
      <div className="min-h-[50vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 sm:p-8 rounded-2xl bg-slate-900 border border-amber-500/30 text-center space-y-3 shadow-xl">
          <span className="inline-block text-xs font-mono px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-bold">
            VITE_ENABLE_ADMIN_GATE_PORTAL is set to FALSE
          </span>
          <h2 className="text-lg sm:text-xl font-bold text-white">Gate Verification &amp; Scanner Inactive</h2>
          <p className="text-xs sm:text-sm text-slate-400">
            The gate verification scanner, spot registrations, and physical attendance tracking are currently disabled.
          </p>
          <p className="text-xs text-slate-500">
            To activate for the event on 1st November, set <code className="text-amber-400 bg-slate-950 px-1 py-0.5 rounded font-mono">VITE_ENABLE_ADMIN_GATE_PORTAL=true</code> in your <code className="text-amber-400 bg-slate-950 px-1 py-0.5 rounded font-mono">.env</code> file.
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
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6 text-slate-100">
      {/* 1. Real-time Live Gate Metrics Bar (Requirement #9) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between shadow-lg">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">Total Registered</span>
          <span className="text-3xl sm:text-4xl font-black text-indigo-400 tracking-tight my-1">{stats.totalRegistered}</span>
          <span className="text-xs text-slate-400 font-medium">Portal signups</span>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between shadow-lg">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">Paid &amp; Approved</span>
          <span className="text-3xl sm:text-4xl font-black text-emerald-400 tracking-tight my-1">{stats.totalPaid}</span>
          <span className="text-xs text-slate-400 font-medium">{stats.totalNotPaid} unpaid/pending</span>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between shadow-lg">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">ID Cards Generated</span>
          <span className="text-3xl sm:text-4xl font-black text-sky-400 tracking-tight my-1">{stats.totalIdCardsGenerated}</span>
          <span className="text-xs text-slate-400 font-medium">Downloaded passes</span>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-amber-500/40 flex flex-col justify-between shadow-lg">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-300">⚡ Gate Verified</span>
          <span className="text-3xl sm:text-4xl font-black text-amber-400 tracking-tight my-1">{stats.totalVerifiedAtGate}</span>
          <span className="text-xs text-slate-400 font-medium">{stats.turnoutPercent}% paid turnout</span>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 flex flex-col justify-between shadow-lg">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-indigo-300">👥 Heads Inside Venue</span>
          <span className="text-3xl sm:text-4xl font-black text-white tracking-tight my-1">{stats.totalHeadsInside}</span>
          <span className="text-xs text-slate-400 font-medium">Including accompanying</span>
        </div>
      </div>

      {/* Staff Identifier bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-3 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 gap-3">
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-300 font-semibold">Verified By:</span>
          {staffName ? (
            <span className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold">
              {verifiedBy}
            </span>
          ) : (
            <input
              type="text"
              value={verifiedBy}
              onChange={(e) => setVerifiedBy(e.target.value)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white font-mono text-xs outline-none focus:border-amber-500"
              title="Gate Name or Volunteer Name"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadGateEntries}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            title="Refresh attendance records"
          >
            <span>↻</span>
            <span>{loadingEntries ? 'Refreshing...' : 'Refresh Log'}</span>
          </button>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors flex items-center justify-center"
              title="Exit / Switch PIN"
            >
              Exit Desk
            </button>
          )}
        </div>
      </div>

      {/* 2. Sub-Tabs Navigation */}
      <div className="flex rounded-2xl p-1.5 bg-slate-950/80 border border-slate-800 gap-1.5 overflow-x-auto tab-scrollbar">
        <button
          type="button"
          className={`flex-1 min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'scanner' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40 font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-900/60 font-semibold'
          }`}
          onClick={() => {
            setActiveSubTab('scanner');
            setScannerActive(true);
          }}
        >
          <span>📷</span>
          <span className="hidden sm:inline">QR Camera Scanner</span>
          <span className="sm:hidden">QR Scanner</span>
        </button>
        <button
          type="button"
          className={`flex-1 min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'manual' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40 font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-900/60 font-semibold'
          }`}
          onClick={() => setActiveSubTab('manual')}
        >
          <span>🔍</span>
          <span className="hidden sm:inline">Manual Lookup</span>
          <span className="sm:hidden">Lookup</span>
        </button>
        <button
          type="button"
          className={`flex-1 min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'spot' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40 font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-900/60 font-semibold'
          }`}
          onClick={() => {
            handleResetSpot(true);
            setActiveSubTab('spot');
          }}
        >
          <span>⚡</span>
          <span className="hidden sm:inline">Spot Walk-in Registration</span>
          <span className="sm:hidden">Spot Entry</span>
        </button>
        <button
          type="button"
          className={`flex-1 min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'log' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40 font-bold' : 'text-slate-300 hover:text-white hover:bg-slate-900/60 font-semibold'
          }`}
          onClick={() => setActiveSubTab('log')}
        >
          <span>📋</span>
          <span className="hidden sm:inline">Gate Check-in List ({gateEntries.length})</span>
          <span className="sm:hidden">Log ({gateEntries.length})</span>
        </button>
      </div>

      {/* 3. SUBTAB: QR Camera Scanner */}
      {activeSubTab === 'scanner' && (
        <div className="flex flex-col items-center justify-center w-full min-h-[360px] p-2 sm:p-4">
          {/* If attendee found via QR scan */}
          {verifiedAttendee ? (
            <div className="w-full max-w-2xl bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md">
              <h3 className="text-lg sm:text-xl font-bold text-white mb-1">Gate QR Verification</h3>
              <p className="text-xs sm:text-sm text-slate-400 mb-4 sm:mb-6">
                Scanned attendee delegate pass verification:
              </p>
              {renderAttendeeIdCardWithActions(verifiedAttendee)}
            </div>
          ) : lookupNotFoundMsg ? (
            <div className="w-full max-w-lg mx-auto bg-slate-900/90 border border-amber-500/30 rounded-2xl p-5 text-center flex flex-col items-center gap-4 shadow-xl">
              <p className="text-sm sm:text-base text-slate-200 font-medium">🔍 {lookupNotFoundMsg}</p>
              <div className="flex gap-2 flex-wrap w-full justify-center">
                <button
                  type="button"
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all max-w-[240px]"
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
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
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
                <div className="w-full max-w-[460px] mx-auto flex flex-col items-center gap-3 sm:gap-4">
                  {/* Custom Dark-Themed Camera Bar */}
                  <div className="flex items-center justify-between w-full gap-2 flex-wrap">
                    {cameras.length > 1 && (
                      <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 flex-1 min-w-[200px]">
                        <span className="text-base">📷</span>
                        <select
                          value={selectedCameraId}
                          onChange={(e) => setSelectedCameraId(e.target.value)}
                          className="bg-transparent text-slate-200 text-base sm:text-sm font-medium w-full focus:outline-none cursor-pointer"
                          title="Select Camera"
                        >
                          {cameras.map((cam, idx) => (
                            <option key={cam.id} value={cam.id} className="bg-slate-900 text-white">
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
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
                          torchOn
                            ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                        }`}
                        title={torchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                      >
                        <span>{torchOn ? '🔦 Torch ON' : '💡 Torch'}</span>
                      </button>
                    )}
                  </div>

                  {cameraError ? (
                    <div className="w-full bg-red-950/40 border border-red-500/40 rounded-2xl p-4 sm:p-5 flex items-start gap-3 text-red-200">
                      <span className="text-2xl shrink-0">⚠️</span>
                      <div className="flex-1 flex flex-col gap-1.5">
                        <h4 className="font-bold text-white text-sm sm:text-base">Camera Access Notice</h4>
                        <p className="text-xs sm:text-sm text-red-300">{cameraError}</p>
                        <div className="flex gap-2 flex-wrap mt-2">
                          <button
                            type="button"
                            onClick={() => setActiveSubTab('manual')}
                            className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm transition-all"
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
                            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs sm:text-sm transition-all"
                          >
                            🔄 Retry Camera
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative w-full max-w-[440px] rounded-2xl overflow-hidden shadow-2xl shadow-black/80 ring-2 ring-indigo-500/40 bg-black">
                      <div id="gate-reader-view" className="w-full min-h-[300px] bg-black [&_video]:w-full [&_video]:h-full [&_video]:object-cover [&_video]:rounded-2xl" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4">
                        <div className="w-[220px] max-w-[60vw] h-[220px] max-h-[60vw] relative rounded-2xl">
                          <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-xl" />
                          <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-xl" />
                          <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-xl" />
                          <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-xl" />
                          <div className="absolute left-1.5 right-1.5 h-[3px] bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_12px_#f59e0b] animate-[scanLaser_2s_ease-in-out_infinite_alternate]" />
                        </div>
                        <span className="mt-4 text-xs font-semibold text-slate-300 bg-black/60 backdrop-blur-xs px-3 py-1 rounded-full border border-white/10">Align QR Code inside box</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-center w-full mt-1">
                    <button
                      type="button"
                      onClick={() => setScannerActive(false)}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
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
                <div className="w-full max-w-[480px] mx-auto bg-gradient-to-b from-slate-800 to-slate-900 border border-amber-500/25 rounded-2xl p-6 sm:p-10 text-center flex flex-col items-center gap-4 shadow-2xl">
                  <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Gate Camera Check-in</h3>
                  <p className="text-xs sm:text-sm text-slate-400 max-w-sm">
                    Turn your phone or laptop camera into an instant, high-speed QR gate scanner.
                  </p>
                  <button
                    type="button"
                    onClick={() => setScannerActive(true)}
                    className="min-h-[48px] px-6 py-3 rounded-xl font-bold text-sm sm:text-base bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 inline-flex items-center gap-2.5 shadow-xl shadow-amber-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
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
        <div className="w-full flex flex-col items-center">
          <div className="w-full max-w-2xl bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md">
            <h3 className="text-lg sm:text-xl font-bold text-white mb-1">Manual Gate Verification</h3>
            <p className="text-xs sm:text-sm text-slate-400 mb-4 sm:mb-6">
              Search by phone, Reg ID, or name to verify attendee entry:
            </p>

            {/* Segmented Mode Switcher */}
            <div className="flex items-center bg-slate-950/80 border border-slate-800 p-1 rounded-xl mb-5 gap-1">
              <button
                type="button"
                className={`flex-1 min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  manualLookupMode === 'reg_number'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                }`}
                onClick={() => {
                  setManualLookupMode('reg_number');
                  handleResetLookup();
                }}
              >
                <span>🎫 Reg ID</span>
              </button>
              <button
                type="button"
                className={`flex-1 min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  manualLookupMode === 'phone'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                }`}
                onClick={() => {
                  setManualLookupMode('phone');
                  handleResetLookup();
                }}
              >
                <span>📱 Phone</span>
              </button>
              <button
                type="button"
                className={`flex-1 min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  manualLookupMode === 'name'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                }`}
                onClick={() => {
                  setManualLookupMode('name');
                  handleResetLookup();
                }}
              >
                <span>👤 Name</span>
              </button>
            </div>

            <div className="w-full flex flex-col gap-4">
              {verifiedAttendee ? (
                renderAttendeeIdCardWithActions(verifiedAttendee)
              ) : (
                <>
                  {manualLookupMode === 'reg_number' && (
                    <div className="w-full flex flex-col gap-3">
                      <form onSubmit={handleSearchByRegNumber} className="w-full">
                        <div className="flex items-stretch w-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all">
                          <span className="px-3.5 bg-slate-900 text-amber-400 font-bold text-sm sm:text-base flex items-center border-r border-slate-800 select-none">
                            {eventPrefix}-
                          </span>
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
                            className="flex-1 bg-transparent px-3.5 py-3 text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none min-w-0"
                            autoFocus
                          />
                          {manualRegNumber && (
                            <button
                              type="button"
                              onClick={() => {
                                setManualRegNumber('');
                                setLookupNotFoundMsg(null);
                              }}
                              className="px-3 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors cursor-pointer"
                              title="Clear input"
                            >
                              ✕
                            </button>
                          )}
                          <button
                            type="submit"
                            className="min-h-[44px] px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 cursor-pointer"
                            disabled={isSearchingLookup || !manualRegNumber.trim()}
                          >
                            {isSearchingLookup ? 'Searching...' : '🔍 Search'}
                          </button>
                        </div>
                      </form>

                      {lookupNotFoundMsg && (
                        <div className="bg-slate-950/90 border border-amber-500/30 rounded-xl p-4 text-center flex flex-col items-center gap-3">
                          <p className="text-sm sm:text-base text-amber-200">⚠️ {lookupNotFoundMsg}</p>
                          <button
                            type="button"
                            onClick={() =>
                              handleRedirectToSpot({
                                name: undefined,
                                mobile: undefined,
                              })
                            }
                            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                          >
                            ⚡ Register at Spot Walk-in Desk →
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {manualLookupMode === 'phone' && (
                    <div className="w-full flex flex-col gap-3">
                      <form onSubmit={handleSearchByPhone} className="w-full">
                        <div className="flex items-stretch w-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all">
                          <span className="px-3.5 bg-slate-900 text-amber-400 font-bold text-sm sm:text-base flex items-center border-r border-slate-800 select-none">
                            +91
                          </span>
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
                            className="flex-1 bg-transparent px-3.5 py-3 text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none min-w-0"
                            autoFocus
                          />
                          {manualPhone && (
                            <button
                              type="button"
                              onClick={() => {
                                setManualPhone('');
                                setLookupNotFoundMsg(null);
                              }}
                              className="px-3 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors cursor-pointer"
                              title="Clear input"
                            >
                              ✕
                            </button>
                          )}
                          <button
                            type="submit"
                            className="min-h-[44px] px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 cursor-pointer"
                            disabled={isSearchingLookup || manualPhone.trim().length < 10}
                          >
                            {isSearchingLookup ? 'Searching...' : '🔍 Search'}
                          </button>
                        </div>
                      </form>

                      {lookupNotFoundMsg && (
                        <div className="bg-slate-950/90 border border-amber-500/30 rounded-xl p-4 text-center flex flex-col items-center gap-3">
                          <p className="text-sm sm:text-base text-amber-200">⚠️ {lookupNotFoundMsg}</p>
                          <button
                            type="button"
                            onClick={() =>
                              handleRedirectToSpot({
                                mobile: manualPhone.trim(),
                              })
                            }
                            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                          >
                            ⚡ Register at Spot Walk-in Desk →
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {manualLookupMode === 'name' && (
                    <div className="relative flex items-center w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all">
                      <span className="text-slate-400 mr-2 text-base">🔍</span>
                      <input
                        type="text"
                        placeholder="Type name (e.g. Rahul), batch (2012), or branch (CSE)..."
                        value={nameSearchQuery}
                        onChange={(e) => {
                          setNameSearchQuery(e.target.value);
                          if (selectedAttendee) setSelectedAttendee(null);
                        }}
                        className="w-full bg-transparent py-3 text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none"
                        autoFocus
                      />
                      {nameSearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setNameSearchQuery('');
                            setSelectedAttendee(null);
                          }}
                          className="px-3 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors cursor-pointer"
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
                        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 text-xs sm:text-sm text-slate-400 flex flex-col gap-2.5">
                          <p>
                            ⚡ <strong className="text-white">Predictive Attendee Search:</strong> Type at least 2 letters of an
                            attendee's name, passing year (e.g. <em>2015</em>), or branch.
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <span className="min-h-[44px] sm:min-h-0 px-3 py-1.5 sm:py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white text-xs font-medium cursor-pointer transition-colors inline-flex items-center" onClick={() => setNameSearchQuery('Computer')}>💻 Computer</span>
                            <span className="min-h-[44px] sm:min-h-0 px-3 py-1.5 sm:py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white text-xs font-medium cursor-pointer transition-colors inline-flex items-center" onClick={() => setNameSearchQuery('Mechanical')}>⚙️ Mechanical</span>
                            <span className="min-h-[44px] sm:min-h-0 px-3 py-1.5 sm:py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white text-xs font-medium cursor-pointer transition-colors inline-flex items-center" onClick={() => setNameSearchQuery('Electrical')}>⚡ Electrical</span>
                            <span className="min-h-[44px] sm:min-h-0 px-3 py-1.5 sm:py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white text-xs font-medium cursor-pointer transition-colors inline-flex items-center" onClick={() => setNameSearchQuery('Civil')}>🏗️ Civil</span>
                            <span className="min-h-[44px] sm:min-h-0 px-3 py-1.5 sm:py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white text-xs font-medium cursor-pointer transition-colors inline-flex items-center" onClick={() => setNameSearchQuery('2024')}>🎓 2024</span>
                            <span className="min-h-[44px] sm:min-h-0 px-3 py-1.5 sm:py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white text-xs font-medium cursor-pointer transition-colors inline-flex items-center" onClick={() => setNameSearchQuery('2018')}>🎓 2018</span>
                          </div>
                        </div>
                      );
                    }

                    if (filteredNameRegistrations.length === 0) {
                      return (
                        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 text-xs sm:text-sm text-slate-400 flex flex-col gap-2.5">
                          <p>
                            🔍 No registered alumni found matching <strong className="text-white">"{queryActive}"</strong>.
                          </p>
                          <p className="text-xs text-slate-400">
                            Check details, or register this attendee directly at Spot Walk-in Desk:
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              handleRedirectToSpot({
                                name: queryActive,
                              })
                            }
                            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer self-start"
                          >
                            ⚡ Register at Spot Walk-in Desk →
                          </button>
                        </div>
                      );
                    }

                    return (
                      <>
                        <div className="flex items-center justify-between text-xs text-slate-400 px-1 pt-1">
                          <span>Found {filteredNameRegistrations.length} matching {filteredNameRegistrations.length === 1 ? 'attendee' : 'attendees'}</span>
                          <span>Tap name to view ID Card &amp; admit</span>
                        </div>

                        <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto tab-scrollbar pr-0.5">
                          {filteredNameRegistrations.map((reg) => {
                            const alumni = reg.alumni;
                            if (!alumni) return null;
                            const gateStatus = getAttendeeGateStatus(reg);
                            const participantCount = reg.number_of_attendees || 1;

                            return (
                              <div
                                key={reg.id}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-xl p-3 sm:p-4 cursor-pointer transition-all active:scale-[0.99]"
                                onClick={() => handleSelectNameAttendee(reg)}
                                role="button"
                                tabIndex={0}
                              >
                                <div className="flex flex-col gap-2">
                                  {/* Top row: Name + Reg ID on left, Status badge on right */}
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                      <span className="font-bold text-white text-sm sm:text-base truncate">{alumni.name}</span>
                                      <span className="px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded text-amber-300 font-mono text-xs font-semibold">
                                        {reg.registration_number}
                                      </span>
                                    </div>

                                    <div className="shrink-0">
                                      {gateStatus.status === 'READY' && (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">🟢 Ready</span>
                                      )}
                                      {gateStatus.status === 'ALREADY_ENTERED' && (
                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-semibold">⚠️ Entered</span>
                                      )}
                                      {gateStatus.status === 'PAYMENT_PENDING' && (
                                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold">💳 Pending</span>
                                      )}
                                      {gateStatus.status === 'MAYBE' && (
                                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold">💳 Unpaid</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Middle row: Branch & Passing Year */}
                                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                    <span>🎓</span>
                                    <span>
                                      Batch {alumni.batch || getBatchFromPassingYear(alumni.year_of_passing)} • {alumni.engineering_discipline || 'Alumni'}
                                    </span>
                                  </div>

                                  {/* Bottom row: Mobile & Number of Participants */}
                                  <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap pt-0.5">
                                    <span className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-md border border-slate-800">
                                      <span>📞</span>
                                      <span>{alumni.mobile}</span>
                                    </span>
                                    <span className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-md border border-slate-800">
                                      <span>👥</span>
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
        <div className="w-full flex flex-col items-center">
          <div className="w-full max-w-2xl bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md">
            <div className="flex items-start justify-between gap-3 mb-4 sm:mb-6 flex-wrap sm:flex-nowrap">
              <div className="flex-1">
                <h3 className="text-lg sm:text-xl font-bold text-white mb-1">⚡ Gate Spot Registration (Walk-ins)</h3>
                <p className="text-xs sm:text-sm text-slate-400">
                  Quickly register walk-in alumni at the gate, accept Cash/UPI, mark entry, and create their pass.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleResetSpot(true)}
                className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs sm:text-sm font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Clear all fields and start a fresh registration"
              >
                <span>↺</span> Reset Form
              </button>
            </div>

            {preloadNotice && (
              <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 sm:p-4 flex items-start gap-2.5 text-xs sm:text-sm text-amber-200 mb-4">
                <span className="text-base shrink-0">⚡</span>
                <div className="flex-1">{preloadNotice}</div>
                <button
                  type="button"
                  className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 text-slate-400 hover:text-white flex items-center justify-center p-1 transition-colors cursor-pointer"
                  onClick={() => setPreloadNotice(null)}
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}

            {existingMatchedReg && (
              <div
                className={`w-full rounded-xl p-3.5 sm:p-4 mb-4 sm:mb-6 border transition-all ${
                  existingStatusType === 'CONFIRMED_PAID'
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : existingStatusType === 'PAYMENT_PENDING'
                    ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                    : existingStatusType === 'MAYBE'
                    ? 'bg-sky-950/30 border-sky-500/40 text-sky-200'
                    : 'bg-slate-900/60 border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {existingStatusType === 'CONFIRMED_PAID' && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        ✓ Confirmed &amp; Paid
                      </span>
                    )}
                    {existingStatusType === 'PAYMENT_PENDING' && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        ⏳ Payment Pending (Unpaid)
                      </span>
                    )}
                    {existingStatusType === 'MAYBE' && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        ❓ Marked Maybe (Unpaid)
                      </span>
                    )}
                    {existingStatusType === 'NO' && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
                        ✕ Marked Not Attending (Unpaid)
                      </span>
                    )}
                    {existingMatchedReg.registration_number && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs font-semibold">
                        {existingMatchedReg.registration_number}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="min-h-[44px] px-2.5 py-1 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer inline-flex items-center"
                    onClick={() => handleResetSpot(true)}
                    title="Clear and register a new attendee"
                  >
                    ✕ Clear
                  </button>
                </div>

                <div className="text-xs sm:text-sm leading-relaxed text-slate-300">
                  {existingStatusType === 'CONFIRMED_PAID' ? (
                    <p>
                      Alumnus is <strong>Confirmed &amp; Paid</strong> (₹{previousPaidAmount} credited online).
                      {isFullyPaid ? (
                        <span className="text-emerald-400 font-semibold">
                          {' '}Current attendee count ({spotAdults + spotKidsAbove10 + spotKidsUnder10}) is fully covered — no extra payment required!
                        </span>
                      ) : (
                        <span className="text-amber-400 font-semibold">
                          {' '}Attendee count increased! Previous <strong>₹{previousPaidAmount}</strong> is credited. Collect only the difference of <strong>₹{differenceDue}</strong>.
                        </span>
                      )}
                    </p>
                  ) : existingStatusType === 'PAYMENT_PENDING' ? (
                    <p>
                      Attendee signed up online with status <strong>Payment Pending</strong> (unpaid).
                      <span className="text-amber-400 font-semibold">
                        {' '}Full contribution of <strong>₹{totalContributionAmount}</strong> must be collected at the gate desk.
                      </span>
                    </p>
                  ) : existingStatusType === 'MAYBE' ? (
                    <p>
                      Attendee originally registered online as <strong>“Maybe”</strong> without making payment.
                      <span className="text-amber-400 font-semibold">
                        {' '}Full contribution of <strong>₹{totalContributionAmount}</strong> must be collected at the gate desk.
                      </span>
                    </p>
                  ) : (
                    <p>
                      Attendee originally registered online as <strong>“Not Attending”</strong>.
                      <span className="text-amber-400 font-semibold">
                        {' '}Attending in-person today — full contribution of <strong>₹{totalContributionAmount}</strong> must be collected at the gate desk.
                      </span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {spotFormErrorMsg && (
              <div className="w-full bg-red-950/50 border border-red-500/40 rounded-xl p-3 text-red-200 text-xs sm:text-sm flex items-center gap-2 mb-4">
                <span className="text-base shrink-0">⚠️</span>
                <span>{spotFormErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSpotSubmit} noValidate className="w-full flex flex-col gap-4 sm:gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Row 1: Mobile (First for Instant Pre-load) & Full Name */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="spot-mobile" className="text-xs sm:text-sm font-semibold text-slate-300">
                    Mobile Number <span className="text-xs text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <div className={`flex items-stretch w-full bg-slate-950 border rounded-xl overflow-hidden focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all ${
                    spotErrors.mobile ? 'border-red-500/60' : 'border-slate-800'
                  }`}>
                    <span className="px-3.5 bg-slate-900 text-amber-400 font-bold text-sm sm:text-base flex items-center border-r border-slate-800 select-none">
                      +91
                    </span>
                    <input
                      id="spot-mobile"
                      type="tel"
                      placeholder="10-digit number (optional)"
                      maxLength={10}
                      value={spotMobile}
                      onChange={(e) => {
                        handleSpotMobileChange(e.target.value);
                        clearSpotError('mobile');
                      }}
                      className="flex-1 bg-transparent px-3.5 py-2.5 text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none min-w-0"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="spot-name" className="text-xs sm:text-sm font-semibold text-slate-300">
                    Full Name <span className="text-amber-400 font-bold ml-0.5">*</span>
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
                    autoFocus={activeSubTab === 'spot' && !spotName}
                    className={`w-full min-h-[44px] bg-slate-950 border rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 transition-all ${
                      spotErrors.name ? 'border-red-500/60' : 'border-slate-800'
                    }`}
                  />
                </div>

                {/* Row 2: Branch / Discipline & Passing Batch (Year) */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="spot-branch" className="text-xs sm:text-sm font-semibold text-slate-300">
                    Branch / Discipline <span className="text-xs text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <select
                    id="spot-branch"
                    value={spotBranch}
                    onChange={(e) => {
                      setSpotBranch(e.target.value);
                      clearSpotError('branch');
                    }}
                    className="w-full min-h-[44px] bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer [&_option]:bg-slate-900 [&_option]:text-white"
                  >
                    <option value="">Select Branch (Optional)</option>
                    {ENGINEERING_DISCIPLINES.map((discipline) => (
                      <option key={discipline} value={discipline}>
                        {discipline}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="spot-batch" className="text-xs sm:text-sm font-semibold text-slate-300">
                    Year of Passing (Batch) <span className="text-xs text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <select
                    id="spot-batch"
                    value={spotBatch}
                    onChange={(e) => {
                      setSpotBatch(e.target.value ? Number(e.target.value) : '');
                      clearSpotError('batch');
                    }}
                    className="w-full min-h-[44px] bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer [&_option]:bg-slate-900 [&_option]:text-white"
                  >
                    <option value="">Select Passing Year (Optional)</option>
                    {passingYears.map((year) => (
                      <option key={year} value={year}>
                        Class of {year}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Unified Attendee Selection (Adults & Children together under single heading) */}
                <div className="sm:col-span-2 flex flex-col gap-2">
                  <label htmlFor="spot-attendees-grid" className="text-xs sm:text-sm font-semibold text-slate-300">
                    Number of People Attending <span className="text-amber-400 font-bold ml-0.5">*</span>
                  </label>
                  <div className="flex flex-col gap-2 mb-2">
                    <div className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs font-medium">
                      <span>⚡ Spot Entry: ₹1,000 per adult • ₹500 per child (10+) • Free (&lt;10 yrs)</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 sm:p-4">
                    {/* Row 1: Adults */}
                    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-800/60">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <strong className="text-sm sm:text-base text-white">Adults</strong>
                          {isExistingPaid && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[11px] font-semibold">
                              Min: {minAdults}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">
                          {spotAdults === 1
                            ? '₹1,000 for 1 adult'
                            : `${spotAdults} × ₹1,000 = ₹${spotAdults * 1000}`}
                        </span>
                      </div>
                      <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            const newAdults = Math.max(minAdults, spotAdults - 1);
                            setSpotAdults(newAdults);
                          }}
                          disabled={spotAdults <= minAdults}
                          aria-label="Decrease adults"
                          title={isExistingPaid && spotAdults <= minAdults ? `Cannot reduce below previously registered count (${minAdults})` : undefined}
                          className="w-11 h-11 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 text-lg font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          −
                        </button>
                        <span className="px-3 min-w-[32px] text-center font-bold text-white text-sm sm:text-base select-none">{spotAdults}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newAdults = Math.min(10, spotAdults + 1);
                            setSpotAdults(newAdults);
                          }}
                          disabled={spotAdults >= 10}
                          aria-label="Increase adults"
                          className="w-11 h-11 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 text-lg font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Children (10+ Years) */}
                    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-800/60">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <strong className="text-sm sm:text-base text-white">Children (10+ Years)</strong>
                          {isExistingPaid && minKidsAbove10 > 0 && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[11px] font-semibold">
                              Min: {minKidsAbove10}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">
                          {spotKidsAbove10 === 0
                            ? '₹500 per child'
                            : `${spotKidsAbove10} × ₹500 = ₹${spotKidsAbove10 * 500}`}
                        </span>
                      </div>
                      <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            const newKids = Math.max(minKidsAbove10, spotKidsAbove10 - 1);
                            setSpotKidsAbove10(newKids);
                          }}
                          disabled={spotKidsAbove10 <= minKidsAbove10}
                          aria-label="Decrease children 10 and above"
                          title={isExistingPaid && spotKidsAbove10 <= minKidsAbove10 ? `Cannot reduce below previously registered count (${minKidsAbove10})` : undefined}
                          className="w-11 h-11 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 text-lg font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          −
                        </button>
                        <span className="px-3 min-w-[32px] text-center font-bold text-white text-sm sm:text-base select-none">{spotKidsAbove10}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newKids = Math.min(10, spotKidsAbove10 + 1);
                            setSpotKidsAbove10(newKids);
                          }}
                          disabled={spotKidsAbove10 >= 10}
                          aria-label="Increase children 10 and above"
                          className="w-11 h-11 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 text-lg font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Row 3: Children (Under 10 Years) */}
                    <div className="flex items-center justify-between gap-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <strong className="text-sm sm:text-base text-white">Children (Under 10 Years)</strong>
                          {isExistingPaid && minKidsUnder10 > 0 && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[11px] font-semibold">
                              Min: {minKidsUnder10}
                            </span>
                          )}
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/30 inline-block w-fit">FREE</span>
                      </div>
                      <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            const newKids = Math.max(minKidsUnder10, spotKidsUnder10 - 1);
                            setSpotKidsUnder10(newKids);
                          }}
                          disabled={spotKidsUnder10 <= minKidsUnder10}
                          aria-label="Decrease children under 10"
                          title={isExistingPaid && spotKidsUnder10 <= minKidsUnder10 ? `Cannot reduce below previously registered count (${minKidsUnder10})` : undefined}
                          className="w-11 h-11 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 text-lg font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          −
                        </button>
                        <span className="px-3 min-w-[32px] text-center font-bold text-white text-sm sm:text-base select-none">{spotKidsUnder10}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newKids = Math.min(10, spotKidsUnder10 + 1);
                            setSpotKidsUnder10(newKids);
                          }}
                          disabled={spotKidsUnder10 >= 10}
                          aria-label="Increase children under 10"
                          className="w-11 h-11 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 text-lg font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Amount Breakdown Card Matching Registration Form (Requirement: Difference Calculation) */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 sm:p-4 flex flex-col gap-2.5 mt-2">
                    <div className="flex flex-col gap-1.5">
                      {spotPricing.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs sm:text-sm">
                          <div className="flex flex-col">
                            <span className="text-slate-300 font-medium">{item.label}</span>
                            <span className="text-xs text-slate-500">{item.rateDescription}</span>
                          </div>
                          <span className={`font-semibold ${item.isFree ? 'text-emerald-400 font-bold' : 'text-slate-200'}`}>
                            {item.isFree ? 'FREE' : `₹${item.amount}`}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="h-px bg-slate-800 my-1" />

                    <div className="flex items-center justify-between text-sm sm:text-base font-bold text-white">
                      <div className="flex flex-col">
                        <span>
                          {isExistingPaid ? 'Updated Total Contribution:' : 'Total Contribution:'}
                        </span>
                        <span className="text-xs text-slate-400 font-normal">
                          ({spotAttendees}{' '}
                          {spotAttendees === 1 ? 'attendee' : 'attendees'})
                        </span>
                      </div>
                      <span className="text-amber-400 text-base sm:text-lg font-extrabold">₹{totalContributionAmount}</span>
                    </div>

                    {/* If Existing Paid Attendee: Deduct previously paid amount and show Difference */}
                    {isExistingPaid && (
                      <>
                        <div className="flex items-center justify-between text-xs sm:text-sm text-emerald-400">
                          <div className="flex flex-col">
                            <span className="font-semibold">
                              ✓ Previously Paid Contribution:
                            </span>
                            <span className="text-xs text-emerald-500/80">
                              Credited from existing registration ({existingMatchedReg?.registration_number})
                            </span>
                          </div>
                          <span className="font-semibold text-emerald-400">
                            − ₹{previousPaidAmount}
                          </span>
                        </div>

                        <div className="h-px bg-slate-800 my-1" />

                        <div className="flex items-center justify-between text-sm sm:text-base font-bold bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 mt-1">
                          <div className="flex flex-col">
                            <span className="text-white font-bold">
                              {isFullyPaid ? 'Additional Amount Due:' : 'Difference to Pay Now:'}
                            </span>
                            <span className="text-xs text-slate-400 font-normal">
                              {isFullyPaid
                                ? 'All dues cleared for registered members'
                                : 'Difference to pay for additional member(s)'}
                            </span>
                          </div>
                          <span
                            className={`text-base sm:text-lg font-extrabold ${
                              isFullyPaid ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {isFullyPaid ? '₹0 (Paid ✓)' : `₹${differenceDue}`}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Fully Paid Callout if dues cleared */}
                  {isFullyPaid && (
                    <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3 sm:p-4 flex items-start gap-3 text-emerald-200 text-xs sm:text-sm mt-2">
                      <div className="text-2xl shrink-0">🎉</div>
                      <div className="flex-1 flex flex-col gap-1">
                        <strong className="text-sm font-bold text-white">All Dues Cleared!</strong>
                        <p className="text-slate-300">
                          Previous online payment of <strong>₹{previousPaidAmount}</strong> fully covers all{' '}
                          {spotAdults + spotKidsAbove10 + spotKidsUnder10} attendee(s). No payment collection needed at gate. Click below to confirm entry!
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Difference Alert if extra attendees added */}
                  {isExistingPaid && differenceDue > 0 && (
                    <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 sm:p-4 flex items-start gap-3 text-amber-200 text-xs sm:text-sm mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl shrink-0">💳</span>
                        <div className="flex-1 flex flex-col gap-1">
                          <strong className="text-sm font-bold text-white">Additional Payment of ₹{differenceDue} Required</strong>
                          <p className="text-slate-300">
                            You added attendee(s). Previous payment of <strong>₹{previousPaidAmount}</strong> is credited.
                            Please collect only the remaining difference of <strong>₹{differenceDue}</strong> via Cash or UPI below.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label htmlFor="spot-payment-mode" className="text-xs sm:text-sm font-semibold text-slate-300">
                    Payment Collected At Gate <span className="text-amber-400 font-bold ml-0.5">*</span>
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
                    className={`w-full min-h-[44px] bg-slate-950 border rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer [&_option]:bg-slate-900 [&_option]:text-white ${
                      spotErrors.paymentMode ? 'border-red-500/60' : 'border-slate-800'
                    }`}
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
                      {eventUpiConfigs.map((config) => {
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
                <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-4 flex items-start gap-3 text-emerald-200 text-xs sm:text-sm">
                  <div className="text-2xl shrink-0">🎉</div>
                  <div className="flex-1 flex flex-col gap-1">
                    <h4 className="font-bold text-white text-sm sm:text-base">No Payment Required (Dues Cleared)</h4>
                    <p className="text-slate-300">
                      Attendee's previous payment of <strong>₹{previousPaidAmount}</strong> completely covers all registered attendees.
                      You can admit this attendee immediately.
                    </p>
                  </div>
                </div>
              )}

              {/* INSTANT UPI QR CODE PAYMENT DESK CARD */}
              {selectedUpiConfig && (
                <div className="bg-slate-950/90 border border-amber-500/30 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-xl">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">📱</span>
                      <div>
                        <h4 className="font-bold text-white text-sm sm:text-base">Instant Desk UPI QR Payment</h4>
                        <p className="text-xs text-slate-400">Alumnus can scan the QR code below using Google Pay, PhonePe, Paytm, or BHIM.</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-right">
                      <span className="text-[11px] text-amber-300 font-medium">{isExistingPaid ? 'Difference Due' : 'Amount'}</span>
                      <span className="text-base sm:text-lg font-bold text-amber-400">₹{amountToCollect}</span>
                    </div>
                  </div>

                  {/* Quick Recipient Switcher Pills */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 pt-1">
                    <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Switch Receiver:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {eventUpiConfigs.map((config) => (
                        <button
                          key={config.upi_id}
                          type="button"
                          className={`min-h-[44px] sm:min-h-0 px-3 py-1.5 sm:py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            spotPaymentMode === config.upi_id
                              ? 'bg-amber-500 text-slate-950 font-bold'
                              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                          }`}
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-center">
                    {/* High contrast QR Frame */}
                    <div className="flex flex-col items-center gap-2.5 bg-white p-3 sm:p-4 rounded-2xl shadow-xl max-w-[260px] mx-auto w-full">
                      <div className="w-full aspect-square flex items-center justify-center">
                        <img
                          src={selectedUpiConfig.qr_image_url || undefined}
                          alt={`UPI QR Code for ${selectedUpiConfig.account_name}`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="text-[11px] font-bold text-slate-900 bg-amber-400 px-2.5 py-0.5 rounded-full text-center">
                        <span>⚡ {isExistingPaid ? `Scan to Pay Difference ₹${amountToCollect}` : `Scan to Pay ₹${amountToCollect}`}</span>
                      </div>
                    </div>

                    {/* Recipient Details & Confirmation */}
                    <div className="flex flex-col gap-3 text-xs sm:text-sm">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                        <span className="text-slate-400">Receiver Account</span>
                        <strong className="text-amber-400 font-semibold">{selectedUpiConfig.account_name}</strong>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                        <span className="text-slate-400">UPI ID</span>
                        <div className="flex items-center gap-1.5">
                          <code className="px-2 py-1 bg-slate-900 border border-slate-800 rounded font-mono text-xs text-amber-300">{selectedUpiConfig.upi_id}</code>
                          <button
                            type="button"
                            className="min-h-[44px] sm:min-h-0 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded transition-colors cursor-pointer inline-flex items-center"
                            onClick={() => handleCopyUpi(selectedUpiConfig.upi_id)}
                          >
                            {copiedUpi ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                        <span className="text-slate-400">Attendees Covered</span>
                        <span className="text-slate-200 font-semibold">
                          {spotAdults + spotKidsAbove10 + spotKidsUnder10}{' '}
                          {spotAdults + spotKidsAbove10 + spotKidsUnder10 === 1 ? 'Person' : 'People'}
                        </span>
                      </div>

                      {/* Live Camera Photo Snap for UPI Payment Confirmation */}
                      <div className="flex flex-col gap-2 pt-1">
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
                          <div className="flex flex-col gap-2.5 mt-2">
                            <button
                              id="spot-snap-payment-btn"
                              type="button"
                              className={`w-full min-h-[52px] p-3 rounded-xl border-2 border-dashed bg-slate-900/60 hover:bg-slate-900 flex items-center gap-3 text-left transition-all cursor-pointer ${
                                spotErrors.upiConfirmed
                                  ? 'border-red-500/60 bg-red-950/20'
                                  : 'border-slate-700 hover:border-amber-500/60'
                              }`}
                              onClick={() => {
                                spotCameraInputRef.current?.click();
                                clearSpotError('upiConfirmed');
                              }}
                            >
                              <span className="text-2xl">📸</span>
                              <div className="flex flex-col text-xs sm:text-sm">
                                <strong className="text-white">Snap Attendee's Payment Screen</strong>
                                <span className="text-slate-400">Point mobile camera at alumnus's phone to capture payment confirmation</span>
                              </div>
                            </button>

                            {spotErrors.upiConfirmed && (
                              <div className="flex items-center gap-1.5 text-xs text-red-400 mt-1">
                                <span className="text-sm">⚠️</span>
                                <span>Please snap the payment screen or verify manually below.</span>
                              </div>
                            )}

                            <div className="flex items-center justify-center gap-2 text-xs text-slate-400 flex-wrap">
                              <button
                                type="button"
                                className="min-h-[44px] sm:min-h-0 py-1 text-slate-400 hover:text-amber-400 underline transition-colors cursor-pointer inline-flex items-center"
                                onClick={() => {
                                  spotFileInputRef.current?.click();
                                  clearSpotError('upiConfirmed');
                                }}
                              >
                                📁 Choose from files
                              </button>
                              <span className="text-slate-600">•</span>
                              <button
                                type="button"
                                className="min-h-[44px] sm:min-h-0 py-1 text-slate-400 hover:text-amber-400 underline transition-colors cursor-pointer inline-flex items-center"
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
                              <div className="text-center text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2">
                                <span>✓ Payment verified on alumnus screen (no photo attached)</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3 items-center sm:items-start">
                            <div className="relative w-24 h-24 rounded-lg overflow-hidden shrink-0 border border-slate-700">
                              <img
                                src={spotPhotoPreview}
                                alt="Payment Confirmation Screen"
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute bottom-1 left-1 right-1 text-[10px] font-bold text-center bg-emerald-950/90 text-emerald-300 py-0.5 rounded">
                                ✓ Photo Attached
                              </span>
                            </div>
                            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                              <strong className="font-bold text-white text-xs sm:text-sm">Payment Screen Captured</strong>
                              <span className="text-xs text-slate-400">
                                {spotPhotoFile ? `${(spotPhotoFile.size / 1024).toFixed(0)} KB • Ready to save` : ''}
                              </span>
                              <div className="flex gap-2 mt-1 flex-wrap">
                                <button
                                  type="button"
                                  className="min-h-[44px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer inline-flex items-center"
                                  onClick={() => spotCameraInputRef.current?.click()}
                                >
                                  📸 Retake Photo
                                </button>
                                <button
                                  type="button"
                                  className="min-h-[44px] px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-500/30 text-xs font-medium transition-colors cursor-pointer inline-flex items-center"
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
                <div className="bg-slate-950/90 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 flex flex-col gap-3 shadow-xl">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-2xl">💵</span>
                    <div className="flex-1 flex flex-col min-w-[200px]">
                      <h4 className="font-bold text-white text-sm sm:text-base">Cash Collection at Gate Desk</h4>
                      <p className="text-xs text-slate-400">Collect {isExistingPaid ? 'remaining difference of ' : ''}₹{amountToCollect} cash in hand from alumnus before admitting entry.</p>
                    </div>
                    <div className="flex flex-col items-end px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-right">
                      <span className="text-[11px] text-emerald-300 font-medium">{isExistingPaid ? 'Difference Due' : 'Amount'}</span>
                      <span className="text-base sm:text-lg font-bold text-emerald-400">₹{amountToCollect}</span>
                    </div>
                  </div>

                  <div
                    id="spot-cash-confirm-box"
                    className={`flex items-start gap-3 bg-slate-900/80 border rounded-xl p-3.5 sm:p-4 cursor-pointer transition-all ${
                      paymentConfirmed
                        ? 'border-emerald-500/60 bg-emerald-950/20'
                        : spotErrors.cashConfirmed
                        ? 'border-red-500/60'
                        : 'border-slate-800 hover:border-emerald-500/40'
                    }`}
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
                      className="mt-1 w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                    />
                    <label htmlFor="spot-cash-checkbox" className="flex flex-col text-xs sm:text-sm text-slate-300 cursor-pointer">
                      <strong>
                        Cash Received in Hand <span className="text-amber-400 font-bold ml-0.5">*</span>
                      </strong>
                      <span className="text-xs text-slate-400 mt-0.5">
                        {paymentConfirmed
                          ? `✅ Confirmed: ₹${amountToCollect} cash collected at gate desk`
                          : `Check this once alumnus hands over ₹${amountToCollect} in cash.`}
                      </span>
                    </label>
                  </div>

                  {spotErrors.cashConfirmed && (
                    <div className="flex items-center gap-1.5 text-xs text-red-400 mt-1">
                      <span className="text-sm">⚠️</span>
                      <span>Please check the box above to confirm cash collection before completing entry.</span>
                    </div>
                  )}
                </div>
              )}

              <div className="w-full mt-2">
                <button
                  type="submit"
                  disabled={spotSubmitting}
                  className="w-full min-h-[48px] py-3 px-6 rounded-xl font-bold text-sm sm:text-base bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-xl shadow-amber-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
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
                className={`mt-5 w-full rounded-2xl border p-4 sm:p-6 shadow-2xl transition-all ${
                  spotScanResult.status === 'ENTERED'
                    ? 'bg-slate-950/95 border-emerald-500/50'
                    : 'bg-slate-950/95 border-red-500/50'
                }`}
              >
                {spotScanResult.status === 'ENTERED' && (
                  <>
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="text-3xl sm:text-4xl shrink-0">✅</div>
                      <div className="flex-1 flex flex-col gap-1">
                        <h3 className="text-base sm:text-lg font-bold tracking-wide text-emerald-400">VERIFIED SUCCESSFULLY</h3>
                        <p className="text-lg sm:text-xl font-extrabold text-white">{spotScanResult.attendee_name}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-200">
                            {spotScanResult.registration_number}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-200">
                            {spotScanResult.branch && spotScanResult.branch !== 'Other'
                              ? `${spotScanResult.branch}${spotScanResult.year_of_passing ? ` (${spotScanResult.year_of_passing})` : ''}`
                              : spotScanResult.year_of_passing
                              ? `Class of ${spotScanResult.year_of_passing}`
                              : 'Spot Walk-in'}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                            👥 {spotScanResult.number_of_attendees || 1} Attendees Allowed
                          </span>
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                            ⚡ Spot Entry Admitted
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 sm:gap-3 flex-wrap mt-4">
                      <button
                        type="button"
                        onClick={() => {
                          handleResetSpot(true);
                          const nameInput = document.getElementById('spot-name') || document.getElementById('spot-mobile');
                          if (nameInput) nameInput.focus();
                        }}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
                      >
                        <span>⚡</span>
                        <span>Register Next Walk-in Attendee →</span>
                      </button>
                    </div>
                  </>
                )}

                {spotScanResult.status === 'ERROR' && (
                  <>
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="text-3xl sm:text-4xl shrink-0">❌</div>
                      <div className="flex-1 flex flex-col gap-1">
                        <h3 className="text-base sm:text-lg font-bold tracking-wide text-red-400">REGISTRATION FAILED</h3>
                        <p className="text-xs sm:text-sm text-red-300">{spotScanResult.message}</p>
                        {spotScanResult.attendee_name && (
                          <p className="text-xs sm:text-sm text-slate-300">
                            Attendee: <strong>{spotScanResult.attendee_name}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 sm:gap-3 flex-wrap mt-4">
                      <button
                        type="button"
                        onClick={() => setSpotScanResult(null)}
                        className="flex-1 min-w-[160px] min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                      >
                        <span>↩</span>
                        <span>Edit &amp; Try Again</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetSpot(true)}
                        className="flex-1 min-w-[160px] min-h-[44px] px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
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
        <div className="w-full flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3">
            <input
              type="text"
              placeholder="Search entered attendees by name or phone..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              className="min-h-[44px] bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 transition-all flex-1 max-w-md"
            />
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
              Showing {filteredGateEntries.length} of {gateEntries.length} physical entries
            </span>
          </div>

          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 shadow-xl">
            <table className="w-full text-left text-xs sm:text-sm text-slate-300">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="px-4 py-3">Time Entered</th>
                  <th className="px-4 py-3">Attendee Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Branch &amp; Batch</th>
                  <th className="px-4 py-3">Heads</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Gate Staff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredGateEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-xs sm:text-sm">
                      {loadingEntries ? 'Loading gate entries...' : 'No gate entries recorded yet.'}
                    </td>
                  </tr>
                ) : (
                  filteredGateEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-400 text-xs whitespace-nowrap">
                        {new Date(entry.entered_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 font-bold text-white">
                        {entry.attendee_name}
                      </td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{entry.phone_number}</td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {entry.year_of_passing ? `Batch ${getBatchFromPassingYear(entry.year_of_passing)}` : (entry.branch || '—')} {entry.branch && entry.year_of_passing ? `• ${entry.branch}` : ''}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium">
                          👥 {entry.accompanying_count || 1}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            entry.entry_mode === 'qr_scan'
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : entry.entry_mode === 'manual_phone'
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {entry.entry_mode === 'qr_scan' ? '📷 QR Scan' : entry.entry_mode === 'manual_phone' ? '⌨️ Manual' : '⚡ Spot'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                          ✓ {entry.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{entry.verified_by || 'Gate 1'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View for Phones */}
          <div className="flex md:hidden flex-col gap-3">
            {filteredGateEntries.length === 0 ? (
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-6 text-center text-slate-500 text-xs sm:text-sm">
                {loadingEntries ? 'Loading gate entries...' : 'No gate entries recorded yet.'}
              </div>
            ) : (
              filteredGateEntries.map((entry) => (
                <div key={entry.id} className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 flex flex-col gap-2 shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white text-sm truncate">{entry.attendee_name}</span>
                    <span className="text-xs text-slate-400 font-mono shrink-0">
                      {new Date(entry.entered_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-400 flex-wrap">
                    <span>📞 {entry.phone_number}</span>
                    <span>
                      🎓 {entry.year_of_passing ? `Batch ${getBatchFromPassingYear(entry.year_of_passing)}` : (entry.branch || 'General')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium">
                      👥 {entry.accompanying_count || 1} Total
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        entry.entry_mode === 'qr_scan'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : entry.entry_mode === 'manual_phone'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {entry.entry_mode === 'qr_scan'
                        ? '📷 QR'
                        : entry.entry_mode === 'manual_phone'
                          ? '⌨️ Phone'
                          : '⚡ Spot'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                      ✓ {entry.payment_status}
                    </span>
                    {entry.verified_by && (
                      <span className="text-xs text-slate-400" title={entry.verified_by}>
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
