import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import {
  verifyGateAttendee,
  spotRegisterAtGate,
  fetchGateEntries,
  isAdminGatePortalEnabled,
} from '../lib/gate';
import { cleanMobileNumber } from '../lib/registrations';
import type { EventRegistration, GateEntry, GateVerificationResult } from '../types';

interface GateVerificationPortalProps {
  registrations: EventRegistration[];
  onRefreshRegistrations: () => void;
}

export const GateVerificationPortal: React.FC<GateVerificationPortalProps> = ({
  registrations,
  onRefreshRegistrations,
}) => {
  const isGateEnabled = isAdminGatePortalEnabled();
  const [activeSubTab, setActiveSubTab] = useState<'scanner' | 'manual' | 'spot' | 'log'>('scanner');
  const [gateEntries, setGateEntries] = useState<GateEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Scanner & Verification State
  const [scannerActive, setScannerActive] = useState(false);
  const [scanResult, setScanResult] = useState<GateVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedBy, setVerifiedBy] = useState('Gate 1 Staff');

  // Manual Lookup State
  const [manualPhone, setManualPhone] = useState('');

  // Spot Registration State
  const [spotName, setSpotName] = useState('');
  const [spotMobile, setSpotMobile] = useState('');
  const [spotBranch, setSpotBranch] = useState('Computer Science');
  const [spotBatch, setSpotBatch] = useState<number | ''>(2020);
  const [spotAttendees, setSpotAttendees] = useState(1);
  const [spotPaymentMode, setSpotPaymentMode] = useState<'CASH' | 'UPI_SPOT' | 'COMPLIMENTARY'>('CASH');
  const [spotAmount, setSpotAmount] = useState(800);
  const [spotSubmitting, setSpotSubmitting] = useState(false);
  const [spotSuccessData, setSpotSuccessData] = useState<any | null>(null);

  // Log filter
  const [logSearch, setLogSearch] = useState('');

  const scannerInstanceRef = useRef<Html5QrcodeScanner | null>(null);
  const isVerifyingRef = useRef(false);

  // Load gate entries on mount and whenever refreshed
  const loadGateEntries = async () => {
    setLoadingEntries(true);
    try {
      const data = await fetchGateEntries();
      setGateEntries(data);
    } catch (err) {
      console.warn('Failed to fetch gate entries:', err);
    } finally {
      setLoadingEntries(false);
    }
  };

  useEffect(() => {
    loadGateEntries();
  }, []);

  // Compute live gate statistics (Requirement #9)
  const stats = React.useMemo(() => {
    const totalRegistered = registrations.length;
    const paidRegistrations = registrations.filter(
      (r) =>
        r.attendance_status === 'yes' ||
        r.payment_verifications?.some((v) => v.verified_status === 'VERIFIED')
    );
    const totalPaid = paidRegistrations.length;
    const totalNotPaid = Math.max(0, totalRegistered - totalPaid);
    const totalIdCardsGenerated = registrations.filter((r) => r.id_card_generated || r.photo_url).length;

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
  }, [registrations, gateEntries]);

  // Handle QR scanning logic
  const handleVerifyPhone = async (phone: string, mode: 'qr_scan' | 'manual_phone' = 'qr_scan') => {
    if (isVerifyingRef.current) return;
    isVerifyingRef.current = true;
    setIsVerifying(true);

    // If scanning with camera, immediately stop and close camera to prevent duplicate scans
    if (mode === 'qr_scan') {
      if (scannerInstanceRef.current) {
        try {
          await scannerInstanceRef.current.clear();
        } catch (_) {}
        scannerInstanceRef.current = null;
      }
      setScannerActive(false);
    }

    setScanResult(null);

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
    }
  };

  // Setup HTML5 QR Code Scanner
  useEffect(() => {
    if (activeSubTab !== 'scanner' || !scannerActive) {
      if (scannerInstanceRef.current) {
        try {
          scannerInstanceRef.current.clear();
        } catch (_) {}
        scannerInstanceRef.current = null;
      }
      return;
    }

    const scanner = new Html5QrcodeScanner(
      'gate-reader-view',
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true,
      },
      false
    );

    scannerInstanceRef.current = scanner;

    scanner.render(
      (decodedText) => {
        const clean = cleanMobileNumber(decodedText);
        if (clean.length === 10) {
          handleVerifyPhone(clean, 'qr_scan');
        }
      },
      () => {
        // Non-fatal scanning progress errors; ignore
      }
    );

    return () => {
      try {
        scanner.clear();
      } catch (_) {}
      scannerInstanceRef.current = null;
    };
  }, [activeSubTab, scannerActive]);

  // Handle Manual Phone Verification Form
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPhone.trim()) return;
    handleVerifyPhone(manualPhone, 'manual_phone');
  };

  // Handle Spot Registration Submit
  const handleSpotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spotName.trim() || !spotMobile.trim() || !spotBatch) {
      alert('Please fill out Name, Mobile, Branch, and Batch.');
      return;
    }

    setSpotSubmitting(true);
    setSpotSuccessData(null);

    const res = await spotRegisterAtGate({
      name: spotName.trim(),
      mobile: spotMobile.trim(),
      discipline: spotBranch,
      year_of_passing: Number(spotBatch),
      numberOfAttendees: spotAttendees,
      paymentMode: spotPaymentMode,
      amount: spotAmount,
      verifiedBy,
    });

    setSpotSubmitting(false);

    if (res.success) {
      setSpotSuccessData(res.data);
      // Reset form
      setSpotName('');
      setSpotMobile('');
      setSpotAttendees(1);
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
          <span className="metric-sub">Downloaded/photo added</span>
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
          <span>Active Gate Desk:</span>
          <input
            type="text"
            value={verifiedBy}
            onChange={(e) => setVerifiedBy(e.target.value)}
            className="gate-staff-input"
            title="Gate Name or Volunteer Name"
          />
        </div>
        <button
          type="button"
          onClick={loadGateEntries}
          className="btn-refresh-gate"
          title="Refresh attendance records"
        >
          {loadingEntries ? '↻ Refreshing...' : '↻ Refresh Log'}
        </button>
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
          📷 QR Camera Scanner
        </button>
        <button
          type="button"
          className={`gate-subtab-btn ${activeSubTab === 'manual' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('manual')}
        >
          ⌨️ Phone Lookup
        </button>
        <button
          type="button"
          className={`gate-subtab-btn ${activeSubTab === 'spot' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('spot')}
        >
          ⚡ Spot Walk-in Registration
        </button>
        <button
          type="button"
          className={`gate-subtab-btn ${activeSubTab === 'log' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('log')}
        >
          📋 Gate Entry Log ({gateEntries.length})
        </button>
      </div>

      {/* 3. SUBTAB: QR Camera Scanner */}
      {activeSubTab === 'scanner' && (
        <div className="gate-scanner-section">
          {!scannerActive ? (
            <div className="scanner-start-box">
              <button
                type="button"
                onClick={() => setScannerActive(true)}
                className="btn-primary-action btn-large-camera"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Start Camera Scanner</span>
              </button>
              <p className="scanner-hint">
                Turn your phone or tablet camera into an instant 60fps gate scanner.
              </p>
            </div>
          ) : (
            <div className="scanner-active-box">
              <div id="gate-reader-view" className="gate-qr-viewport" />
              <div className="scanner-controls-row">
                <button
                  type="button"
                  onClick={() => setScannerActive(false)}
                  className="btn-stop-camera"
                >
                  Pause Scanner
                </button>
              </div>
            </div>
          )}

          {/* Verification Status Banner Alert */}
          {scanResult && (
            <div className={`gate-scan-result-card ${scanResult.status.toLowerCase()}`}>
              {scanResult.status === 'ENTERED' && (
                <div className="result-content success">
                  <div className="result-icon">✅</div>
                  <div className="result-text">
                    <h3 className="result-title">ENTRY APPROVED - ALLOW IN</h3>
                    <p className="result-name">{scanResult.attendee_name}</p>
                    <div className="result-badges">
                      <span className="result-pill">{scanResult.registration_number}</span>
                      <span className="result-pill">{scanResult.branch} ({scanResult.year_of_passing})</span>
                      <span className="result-pill count-pill">
                        👥 {scanResult.number_of_attendees || 1} Attendees Allowed
                      </span>
                    </div>
                    <div style={{ marginTop: '16px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setScanResult(null);
                          setScannerActive(true);
                        }}
                        className="btn-primary-action"
                        style={{
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          padding: '10px 22px',
                          fontSize: '15px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          borderRadius: '8px',
                          fontWeight: 600,
                          border: 'none',
                          color: '#fff',
                          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                        }}
                      >
                        <span>📷</span>
                        <span>Scan Next Attendee →</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {scanResult.status === 'ALREADY_ENTERED' && (
                <div className="result-content warning">
                  <div className="result-icon">⚠️</div>
                  <div className="result-text">
                    <h3 className="result-title">ALREADY ENTERED (DUPLICATE PASS)</h3>
                    <p className="result-detail">{scanResult.message}</p>
                    <p className="result-sub">
                      Attendee: <strong>{scanResult.attendee_name}</strong> ({scanResult.registration_number})
                    </p>
                    <div style={{ marginTop: '14px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setScanResult(null);
                          setScannerActive(true);
                        }}
                        className="btn-primary-action"
                        style={{
                          background: 'rgba(255, 255, 255, 0.12)',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          color: '#fff',
                          padding: '8px 18px',
                          fontSize: '14px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          borderRadius: '8px',
                        }}
                      >
                        <span>📷</span>
                        <span>Scan Next Attendee →</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {scanResult.status === 'PAYMENT_PENDING' && (
                <div className="result-content error">
                  <div className="result-icon">❌</div>
                  <div className="result-text">
                    <h3 className="result-title">PAYMENT NOT APPROVED</h3>
                    <p className="result-detail">{scanResult.message}</p>
                    <p className="result-sub">
                      Attendee: <strong>{scanResult.attendee_name}</strong> • Amount Due: ₹{scanResult.amount}
                    </p>
                    <div style={{ marginTop: '14px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setScanResult(null);
                          setScannerActive(true);
                        }}
                        className="btn-primary-action"
                        style={{
                          background: 'rgba(255, 255, 255, 0.12)',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          color: '#fff',
                          padding: '8px 18px',
                          fontSize: '14px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          borderRadius: '8px',
                        }}
                      >
                        <span>📷</span>
                        <span>Scan Next Attendee →</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {scanResult.status === 'NOT_FOUND' && (
                <div className="result-content error">
                  <div className="result-icon">❓</div>
                  <div className="result-text">
                    <h3 className="result-title">NOT REGISTERED</h3>
                    <p className="result-detail">{scanResult.message}</p>
                    <button
                      type="button"
                      className="btn-quick-spot-link"
                      onClick={() => setActiveSubTab('spot')}
                    >
                      Click here to Spot Register this attendee →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. SUBTAB: Manual Phone Lookup */}
      {activeSubTab === 'manual' && (
        <div className="gate-manual-section">
          <div className="gate-card-box">
            <h3>Manual Gate Phone Verification</h3>
            <p className="card-sub-desc">
              If an attendee's phone screen is cracked or the camera cannot read the QR code, type their 10-digit number here:
            </p>

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

            {/* Same result feedback card */}
            {scanResult && (
              <div className={`gate-scan-result-card ${scanResult.status.toLowerCase()}`} style={{ marginTop: '1.25rem' }}>
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

            <form onSubmit={handleSpotSubmit} className="gate-spot-form">
              <div className="form-fields-grid">
                <div className="form-field">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Alumnus Name"
                    value={spotName}
                    onChange={(e) => setSpotName(e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="10-digit mobile"
                    maxLength={10}
                    value={spotMobile}
                    onChange={(e) => setSpotMobile(e.target.value.replace(/\D/g, ''))}
                  />
                </div>

                <div className="form-field">
                  <label>Branch / Discipline *</label>
                  <select
                    value={spotBranch}
                    onChange={(e) => setSpotBranch(e.target.value)}
                  >
                    <option value="Computer Science">Computer Science</option>
                    <option value="Mechanical">Mechanical</option>
                    <option value="Electrical">Electrical</option>
                    <option value="Civil">Civil</option>
                    <option value="Electronics & Communication">Electronics & Communication</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Production & Industrial">Production & Industrial</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>Passing Batch (Year) *</label>
                  <input
                    type="number"
                    required
                    min={1980}
                    max={2026}
                    placeholder="e.g. 2008"
                    value={spotBatch}
                    onChange={(e) => setSpotBatch(e.target.value ? Number(e.target.value) : '')}
                  />
                </div>

                <div className="form-field">
                  <label>Number of People Attending</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={spotAttendees}
                    onChange={(e) => {
                      const count = Number(e.target.value);
                      setSpotAttendees(count);
                      setSpotAmount(count === 1 ? 800 : count === 2 ? 1500 : 1500 + (count - 2) * 800);
                    }}
                  />
                </div>

                <div className="form-field">
                  <label>Payment Collected At Gate</label>
                  <select
                    value={spotPaymentMode}
                    onChange={(e) => setSpotPaymentMode(e.target.value as any)}
                  >
                    <option value="CASH">💵 Cash Collected (₹{spotAmount})</option>
                    <option value="UPI_SPOT">📱 UPI QR Scanned at Desk (₹{spotAmount})</option>
                    <option value="COMPLIMENTARY">⭐ Complimentary / VIP</option>
                  </select>
                </div>
              </div>

              <div className="spot-form-actions">
                <button
                  type="submit"
                  disabled={spotSubmitting}
                  className="btn-primary-action btn-spot-submit"
                >
                  {spotSubmitting ? 'Registering...' : `Complete Spot Entry (₹${spotAmount}) →`}
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

          <div className="gate-table-wrapper">
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
        </div>
      )}
    </div>
  );
};
