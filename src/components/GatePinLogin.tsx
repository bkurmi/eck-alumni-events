import React, { useState } from 'react';
import { loginWithGatePin, getDeviceDisplayName, type GateStaffSession } from '../lib/gateAuth';

interface GatePinLoginProps {
  onLoginSuccess: (session: GateStaffSession) => void;
  onAdminLoginClick?: () => void;
}

export const GatePinLogin: React.FC<GatePinLoginProps> = ({
  onLoginSuccess,
  onAdminLoginClick,
}) => {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const deviceName = getDeviceDisplayName();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) {
      setErrorMsg('Please enter your Gate Access PIN.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await loginWithGatePin(pin);
      if (res.success && res.session) {
        onLoginSuccess(res.session);
      } else {
        setErrorMsg(res.message || 'Invalid or locked PIN. Please check with Event Admin.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error during PIN authentication.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeypadPress = (val: string) => {
    setErrorMsg(null);
    if (val === 'DEL') {
      setPin((prev) => prev.slice(0, -1));
    } else if (val === 'CLR') {
      setPin('');
    } else if (pin.length < 8) {
      setPin((prev) => prev + val);
    }
  };

  return (
    <div className="gate-login-container">
      <div className="gate-login-card">
        {/* Header */}
        <div className="gate-login-header">
          <div className="gate-login-badge-icon">⚡</div>
          <h2 className="gate-login-title">Gate Verification Desk</h2>
          <p className="gate-login-subtitle">
            Physical Entry Scanner &amp; Attendance Verification Portal
          </p>
          <div className="gate-device-badge">
            <span className="gate-device-dot"></span>
            <span>Device: {deviceName}</span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="gate-alert-box gate-alert-error" role="alert">
            <span className="gate-alert-icon">⚠️</span>
            <div className="gate-alert-content">
              <strong>Access Denied</strong>
              <p>{errorMsg}</p>
            </div>
          </div>
        )}

        {/* PIN Form */}
        <form onSubmit={handleSubmit} className="gate-login-form">
          <div className="gate-pin-field-wrapper">
            <label htmlFor="gate-pin-input" className="gate-pin-label">
              Enter Assigned Gate PIN
            </label>
            <div className="gate-pin-input-group">
              <input
                id="gate-pin-input"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={pin}
                onChange={(e) => {
                  setErrorMsg(null);
                  setPin(e.target.value.replace(/\D/g, ''));
                }}
                placeholder="••••"
                className="gate-pin-input"
                autoFocus
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="gate-pin-toggle-btn"
                title={showPin ? 'Hide PIN' : 'Show PIN'}
              >
                {showPin ? '🙈' : '👁️'}
              </button>
            </div>
            <p className="gate-pin-helper">
              🔒 <strong>Single-Device Lock:</strong> Your PIN will automatically link to this phone. Other phones cannot use your PIN.
            </p>
          </div>

          {/* Quick On-Screen Keypad for Fast Mobile Entry */}
          <div className="gate-keypad-grid">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'].map((k) => (
              <button
                key={k}
                type="button"
                className={`gate-keypad-btn ${k === 'DEL' || k === 'CLR' ? 'gate-keypad-action' : ''}`}
                onClick={() => handleKeypadPress(k)}
              >
                {k === 'DEL' ? '⌫' : k === 'CLR' ? 'C' : k}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || pin.length < 3}
            className="btn btn-primary btn-large btn-block gate-submit-btn"
          >
            {loading ? 'Authenticating & Binding Device...' : 'Unlock Gate Desk →'}
          </button>
        </form>

        {/* Footer / Switch link */}
        <div className="gate-login-footer">
          {onAdminLoginClick ? (
            <button
              type="button"
              onClick={onAdminLoginClick}
              className="gate-admin-switch-btn"
            >
              🔐 Are you an Event Organizer? <u>Sign In with Admin Email</u>
            </button>
          ) : (
            <a href="/admin" className="gate-admin-switch-btn">
              🔐 Event Admin? <u>Go to Full Admin Portal</u>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
