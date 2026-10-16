import React, { useState, useEffect } from 'react';
import {
  fetchAllGateStaffPins,
  createGateStaffPin,
  resetGateStaffDevice,
  toggleGateStaffPinActive,
  deleteGateStaffPin,
  type GateStaffPinRecord,
} from '../lib/gateAuth';

interface GateStaffManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GateStaffManagerModal: React.FC<GateStaffManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [pins, setPins] = useState<GateStaffPinRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New PIN Form state
  const [staffName, setStaffName] = useState('');
  const [pinNumber, setPinNumber] = useState('');
  const [stationName, setStationName] = useState('Gate 1 (Main Entrance)');
  const [notes, setNotes] = useState('');

  const loadPins = async () => {
    setLoading(true);
    const data = await fetchAllGateStaffPins();
    setPins(data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadPins();
      setFeedbackMsg(null);
    }
  }, [isOpen]);

  const handleGenerateRandomPin = () => {
    const random = Math.floor(1000 + Math.random() * 9000).toString();
    setPinNumber(random);
  };

  const handleCreatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinNumber.trim() || !staffName.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Please fill in Staff Name and PIN.' });
      return;
    }
    if (pinNumber.trim().length !== 4) {
      setFeedbackMsg({ type: 'error', text: 'PIN must be exactly 4 digits.' });
      return;
    }

    setActionLoading(true);
    setFeedbackMsg(null);

    const res = await createGateStaffPin({
      pin: pinNumber.trim(),
      staff_name: staffName.trim(),
      station_name: stationName.trim(),
      notes: notes.trim(),
    });

    if (res.success) {
      setFeedbackMsg({ type: 'success', text: res.message });
      setStaffName('');
      setPinNumber('');
      setNotes('');
      await loadPins();
    } else {
      setFeedbackMsg({ type: 'error', text: res.message });
    }
    setActionLoading(false);
  };

  const handleResetDevice = async (pinId: string, name: string) => {
    if (!window.confirm(`Reset device lock for ${name}? They will be able to log in on a new phone.`)) {
      return;
    }

    setActionLoading(true);
    const res = await resetGateStaffDevice(pinId);
    if (res.success) {
      setFeedbackMsg({ type: 'success', text: res.message });
      await loadPins();
    } else {
      setFeedbackMsg({ type: 'error', text: res.message });
    }
    setActionLoading(false);
  };

  const handleToggleActive = async (pinId: string, currentStatus: boolean) => {
    const ok = await toggleGateStaffPinActive(pinId, !currentStatus);
    if (ok) {
      await loadPins();
    }
  };

  const handleDelete = async (pinId: string, name: string) => {
    if (!window.confirm(`Delete PIN for ${name}? This action cannot be undone.`)) {
      return;
    }

    const ok = await deleteGateStaffPin(pinId);
    if (ok) {
      setFeedbackMsg({ type: 'success', text: `Deleted PIN for ${name}.` });
      await loadPins();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="gate-modal-backdrop" onClick={onClose}>
      <div className="gate-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="gate-modal-header">
          <div>
            <h2 className="gate-modal-title">⚡ Gate Staff PIN Management</h2>
            <p className="gate-modal-subtitle">
              Issue dedicated PINs for desk staff. Each PIN is bound to 1 person's phone.
            </p>
          </div>
          <button type="button" onClick={onClose} className="gate-modal-close-btn">
            ✕
          </button>
        </div>

        <div className="gate-modal-body">
          {/* Feedback Alert */}
          {feedbackMsg && (
            <div className={`gate-alert-box ${feedbackMsg.type === 'success' ? 'gate-alert-success' : 'gate-alert-error'}`}>
              <span>{feedbackMsg.type === 'success' ? '✅' : '⚠️'}</span>
              <span>{feedbackMsg.text}</span>
            </div>
          )}

          {/* Add New PIN Section */}
          <div className="gate-add-pin-card">
            <h3 className="gate-section-title">➕ Issue New Staff PIN</h3>
            <form onSubmit={handleCreatePin} className="gate-add-pin-form">
              <div className="gate-form-row">
                <div className="gate-form-group">
                  <label className="gate-label">Staff / Verifier Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Aman Sharma"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    className="gate-input"
                  />
                </div>

                <div className="gate-form-group">
                  <label className="gate-label">Gate Station / Desk *</label>
                  <select
                    value={stationName}
                    onChange={(e) => setStationName(e.target.value)}
                    className="gate-input"
                  >
                    <option value="Gate 1 (Main Entrance)">Gate 1 (Main Entrance)</option>
                    <option value="Gate 1 (Fast Track)">Gate 1 (Fast Track Lane)</option>
                    <option value="Gate 2 (VIP & Faculty)">Gate 2 (VIP &amp; Faculty)</option>
                    <option value="Gate 3 (Gala & Dining)">Gate 3 (Gala &amp; Dining)</option>
                    <option value="Spot Registration Desk">Spot Registration Desk</option>
                  </select>
                </div>
              </div>

              <div className="gate-form-row">
                <div className="gate-form-group">
                  <div className="gate-label-with-action">
                    <label className="gate-label">4-Digit PIN *</label>
                    <button
                      type="button"
                      onClick={handleGenerateRandomPin}
                      className="gate-text-action-btn"
                    >
                      🎲 Generate Random
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    placeholder="e.g. 7004"
                    value={pinNumber}
                    onChange={(e) => setPinNumber(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="gate-input font-mono"
                  />
                </div>

                <div className="gate-form-group">
                  <label className="gate-label">Notes / Shift Details (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Shift 4 PM to 8 PM"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="gate-input"
                  />
                </div>
              </div>

              <div className="gate-form-actions">
                <button
                  type="submit"
                  disabled={actionLoading || !pinNumber || !staffName}
                  className="btn btn-primary btn-sm"
                >
                  {actionLoading ? 'Creating PIN...' : 'Issue & Activate PIN'}
                </button>
              </div>
            </form>
          </div>

          {/* List of Active PINs */}
          <div className="gate-pins-list-section">
            <div className="gate-section-header">
              <h3 className="gate-section-title">
                Active Gate Staff ({pins.length})
              </h3>
              <button
                type="button"
                onClick={loadPins}
                disabled={loading}
                className="btn btn-outline btn-sm"
              >
                🔄 Refresh
              </button>
            </div>

            {loading ? (
              <div className="gate-loading-state">Loading staff accounts...</div>
            ) : pins.length === 0 ? (
              <div className="gate-empty-state">
                <p>No Gate PINs issued yet. Use the form above to add a staff member PIN.</p>
                <p className="gate-hint-note">
                  <em>Note: Make sure to execute <code>supabase/v5_gate_staff_pins.sql</code> in your Supabase SQL editor.</em>
                </p>
              </div>
            ) : (
              <div className="gate-pins-grid">
                {pins.map((p) => {
                  const isLocked = Boolean(p.device_id);
                  return (
                    <div
                      key={p.id}
                      className={`gate-pin-card ${!p.is_active ? 'gate-pin-card-disabled' : ''}`}
                    >
                      <div className="gate-pin-card-header">
                        <div>
                          <div className="gate-pin-staff-name">{p.staff_name}</div>
                          <div className="gate-pin-station">{p.station_name}</div>
                        </div>
                        <div className="gate-pin-code-badge font-mono">
                          PIN: {p.pin}
                        </div>
                      </div>

                      <div className="gate-pin-device-status">
                        {isLocked ? (
                          <div className="gate-device-locked-badge">
                            <span className="gate-lock-icon">🔒</span>
                            <span>Locked to: <strong>{p.device_name || '1 Device'}</strong></span>
                          </div>
                        ) : (
                          <div className="gate-device-open-badge">
                            <span className="gate-unlock-icon">🔓</span>
                            <span>Unbound (Will lock on 1st login)</span>
                          </div>
                        )}
                        {p.last_login_at && (
                          <div className="gate-pin-last-login">
                            Active: {new Date(p.last_login_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>

                      {p.notes && <div className="gate-pin-notes">📝 {p.notes}</div>}

                      <div className="gate-pin-card-actions">
                        {isLocked && (
                          <button
                            type="button"
                            onClick={() => handleResetDevice(p.id, p.staff_name)}
                            disabled={actionLoading}
                            className="btn btn-outline btn-xs"
                            title="Clear device binding if phone changed"
                          >
                            🔓 Reset Device
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleActive(p.id, p.is_active)}
                          className={`btn btn-xs ${p.is_active ? 'btn-warning-outline' : 'btn-success-outline'}`}
                        >
                          {p.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id, p.staff_name)}
                          className="btn btn-danger-outline btn-xs"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
