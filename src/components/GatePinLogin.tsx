import React, { useState, useRef } from 'react';
import { loginWithGatePin, getDeviceDisplayName, type GateStaffSession } from '../lib/gateAuth';
import { Eye, EyeOff, Lock, AlertTriangle, ArrowRight } from 'lucide-react';

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
  const isAuthenticatingRef = useRef(false);

  const executePinLogin = async (pinToVerify: string) => {
    if (isAuthenticatingRef.current || loading) return;
    if (pinToVerify.trim().length !== 4) return;

    isAuthenticatingRef.current = true;
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await loginWithGatePin(pinToVerify);
      if (res.success && res.session) {
        onLoginSuccess(res.session);
      } else {
        setErrorMsg(res.message || 'Invalid or locked PIN. Please check with Event Admin.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error during PIN authentication.');
    } finally {
      setLoading(false);
      isAuthenticatingRef.current = false;
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin.trim()) {
      setErrorMsg('Please enter your Gate Access PIN.');
      return;
    }
    if (pin.length !== 4) {
      setErrorMsg('PIN must be 4 digits.');
      return;
    }
    executePinLogin(pin);
  };

  const handleKeypadPress = (val: string) => {
    setErrorMsg(null);
    if (loading || isAuthenticatingRef.current) return;

    if (val === 'DEL') {
      setPin((prev) => prev.slice(0, -1));
    } else if (val === 'CLR') {
      setPin('');
    } else if (pin.length < 4) {
      const nextPin = pin + val;
      setPin(nextPin);
      if (nextPin.length === 4) {
        executePinLogin(nextPin);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPin(cleaned);
    if (cleaned.length === 4) {
      executePinLogin(cleaned);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0c16] flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-sm bg-slate-900/90 border border-amber-500/30 rounded-2xl p-6 sm:p-8 text-center space-y-5 shadow-2xl backdrop-blur-md">
        {/* Header */}
        <div className="space-y-2">
          <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-2xl select-none">
            ⚡
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Gate Verification Desk</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Physical Entry Scanner &amp; Attendance Verification Portal
          </p>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-950/80 border border-slate-800 text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Device: {deviceName}</span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs sm:text-sm text-left flex items-start gap-2.5" role="alert">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <strong className="text-white block">Access Denied</strong>
              <p className="leading-relaxed">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* PIN Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5 text-left">
            <label htmlFor="gate-pin-input" className="block text-xs font-semibold text-slate-300">
              Enter 4-Digit Gate PIN
            </label>
            <div className="relative flex items-center">
              <input
                id="gate-pin-input"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={pin}
                onChange={handleInputChange}
                placeholder="••••"
                className="w-full min-h-[50px] px-3.5 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-2xl font-mono text-center tracking-[0.4em] text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                autoFocus
                autoComplete="off"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3.5 p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title={showPin ? 'Hide PIN' : 'Show PIN'}
              >
                {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 flex items-start gap-1 pt-0.5 leading-relaxed">
              <Lock className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-300">Single-Device Lock:</strong> Your PIN will automatically link to this phone. Other phones cannot use your PIN.
              </span>
            </p>
          </div>

          {/* Quick On-Screen Keypad for Fast Mobile Entry */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'].map((k) => (
              <button
                key={k}
                type="button"
                disabled={loading}
                className={`min-h-[48px] rounded-xl font-bold text-lg flex items-center justify-center transition-all active:scale-95 cursor-pointer select-none ${
                  k === 'DEL' || k === 'CLR'
                    ? 'bg-slate-800/60 text-amber-400 hover:bg-slate-800 text-sm'
                    : 'bg-slate-800 hover:bg-slate-700 text-white'
                }`}
                onClick={() => handleKeypadPress(k)}
              >
                {k === 'DEL' ? '⌫' : k === 'CLR' ? 'C' : k}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || pin.length !== 4}
            className="w-full min-h-[48px] py-3 px-6 rounded-xl font-bold text-base bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-40 cursor-pointer"
          >
            <span>{loading ? 'Authenticating & Binding Device...' : 'Unlock Gate Desk'}</span>
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        {/* Footer / Switch link */}
        <div className="pt-2 border-t border-slate-800 text-center">
          {onAdminLoginClick ? (
            <button
              type="button"
              onClick={onAdminLoginClick}
              className="text-xs text-amber-400 hover:underline cursor-pointer"
            >
              🔐 Are you an Event Organizer? <u>Sign In with Admin Email</u>
            </button>
          ) : (
            <a href="/admin" className="text-xs text-amber-400 hover:underline">
              🔐 Event Admin? <u>Go to Full Admin Portal</u>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
