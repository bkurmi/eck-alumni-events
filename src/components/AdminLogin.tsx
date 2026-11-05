import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface AdminLoginProps {
  onLoginSuccess: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        onLoginSuccess();
      }
    } catch (err: any) {
      console.error('Admin login error:', err);
      setErrorMsg(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-5 sm:p-7 rounded-2xl bg-slate-900/90 border border-amber-500/30 backdrop-blur-md shadow-2xl text-slate-100 my-6">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-inner">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Organizer Sign In</h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Sign in to view registered alumni, gate desk, and financial ledgers.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 mb-5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs sm:text-sm font-medium flex items-center gap-2">
          <span>⚠️</span>
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs sm:text-sm font-bold text-slate-200 mb-1.5" htmlFor="admin-email">
            Admin Email
          </label>
          <input
            id="admin-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@eck-alumni.org"
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-base text-slate-100 placeholder:text-slate-500 outline-none transition-colors"
            autoComplete="email"
          />
        </div>

        <div>
          <label className="block text-xs sm:text-sm font-bold text-slate-200 mb-1.5" htmlFor="admin-pass">
            Password
          </label>
          <input
            id="admin-pass"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-base text-slate-100 placeholder:text-slate-500 outline-none transition-colors"
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-base shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
          id="btn-admin-submit"
        >
          {loading ? 'Authenticating...' : 'Sign In as Organizer'}
        </button>
      </form>

      <div className="mt-5 text-center">
        <p className="text-xs text-slate-500 leading-relaxed">
          Admin account credentials are created in the Supabase Auth dashboard.
        </p>
      </div>
    </div>
  );
};
