import React, { useState, useEffect } from 'react';
import {
  fetchAllGateStaffPins,
  createGateStaffPin,
  resetGateStaffDevice,
  toggleGateStaffPinActive,
  deleteGateStaffPin,
  type GateStaffPinRecord,
} from '../lib/gateAuth';
import { X, Plus, RefreshCw, Key, Lock, Unlock, Trash2 } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-slate-900 border border-amber-500/30 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto text-left" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="space-y-0.5">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <span>⚡</span>
              <span>Gate Staff PIN Management</span>
            </h2>
            <p className="text-xs text-slate-400">
              Issue dedicated PINs for desk staff. Each PIN is bound to 1 person's phone.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div className={`p-3 rounded-xl border text-xs sm:text-sm flex items-center gap-2 ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
          }`}>
            <span>{feedbackMsg.type === 'success' ? '✅' : '⚠️'}</span>
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Add New PIN Section */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-amber-400" />
            <span>Issue New Staff PIN</span>
          </h3>
          <form onSubmit={handleCreatePin} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-300">Staff / Verifier Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aman Sharma"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-300">Gate Station / Desk *</label>
                <select
                  value={stationName}
                  onChange={(e) => setStationName(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-base text-slate-100 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="Gate 1 (Main Entrance)">Gate 1 (Main Entrance)</option>
                  <option value="Gate 1 (Fast Track)">Gate 1 (Fast Track Lane)</option>
                  <option value="Gate 2 (VIP & Faculty)">Gate 2 (VIP &amp; Faculty)</option>
                  <option value="Gate 3 (Gala & Dining)">Gate 3 (Gala &amp; Dining)</option>
                  <option value="Spot Registration Desk">Spot Registration Desk</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300">4-Digit PIN *</label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomPin}
                    className="text-[11px] text-amber-400 hover:underline cursor-pointer"
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
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-base font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-300">Notes / Shift Details (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Shift 4 PM to 8 PM"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={actionLoading || !pinNumber || !staffName}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm transition-colors disabled:opacity-40 cursor-pointer"
              >
                {actionLoading ? 'Creating PIN...' : 'Issue & Activate PIN'}
              </button>
            </div>
          </form>
        </div>

        {/* List of Active PINs */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Key className="w-4 h-4 text-amber-400" />
              <span>Active Gate Staff ({pins.length})</span>
            </h3>
            <button
              type="button"
              onClick={loadPins}
              disabled={loading}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>

          {loading ? (
            <div className="p-4 text-center text-xs text-slate-400">Loading staff accounts...</div>
          ) : pins.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-center text-xs text-slate-400 space-y-1">
              <p>No Gate PINs issued yet. Use the form above to add a staff member PIN.</p>
              <p className="text-amber-400/80">
                <em>Note: Make sure to execute <code>supabase/v5_gate_staff_pins.sql</code> in your Supabase SQL editor.</em>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pins.map((p) => {
                const isLocked = Boolean(p.device_id);
                return (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 ${
                      p.is_active
                        ? 'bg-slate-950/60 border-slate-800 text-white'
                        : 'bg-slate-950/30 border-slate-800/60 opacity-60'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-sm text-white">{p.staff_name}</div>
                          <div className="text-xs text-slate-400">{p.station_name}</div>
                        </div>
                        <div className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                          PIN: {p.pin}
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 space-y-0.5 pt-1">
                        {isLocked ? (
                          <div className="flex items-center gap-1.5 text-emerald-400">
                            <Lock className="w-3 h-3 shrink-0" />
                            <span>Locked to: <strong className="text-white">{p.device_name || '1 Device'}</strong></span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-amber-400">
                            <Unlock className="w-3 h-3 shrink-0" />
                            <span>Unbound (Will lock on 1st login)</span>
                          </div>
                        )}
                        {p.last_login_at && (
                          <div className="text-slate-500">
                            Active: {new Date(p.last_login_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>

                      {p.notes && <div className="text-xs text-slate-400 pt-1">📝 {p.notes}</div>}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                      {isLocked && (
                        <button
                          type="button"
                          onClick={() => handleResetDevice(p.id, p.staff_name)}
                          disabled={actionLoading}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                          title="Clear device binding if phone changed"
                        >
                          🔓 Reset
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleActive(p.id, p.is_active)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                          p.is_active
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                        }`}
                      >
                        {p.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id, p.staff_name)}
                        className="p-1 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 border border-transparent transition-colors cursor-pointer ml-auto"
                        title="Delete PIN"
                      >
                        <Trash2 className="w-4 h-4" />
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
  );
};
