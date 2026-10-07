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
    <div className="login-card">
      <div className="login-header">
        <div className="admin-lock-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 className="login-title">Organizer Sign In</h2>
        <p className="login-subtitle">
          Sign in to view registered alumni and export data.
        </p>
      </div>

      {errorMsg && (
        <div className="alert-box alert-error">
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="login-form">
        <div className="field-group">
          <label className="field-label" htmlFor="admin-email">
            Admin Email
          </label>
          <input
            id="admin-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@eck-alumni.org"
            className="input-field"
            autoComplete="email"
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="admin-pass">
            Password
          </label>
          <input
            id="admin-pass"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="input-field"
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary btn-large btn-block"
          id="btn-admin-submit"
        >
          {loading ? 'Authenticating...' : 'Sign In as Organizer'}
        </button>
      </form>

      <div className="login-footer-hint">
        <p className="text-muted">
          Admin account credentials are created in the Supabase Auth dashboard.
        </p>
      </div>
    </div>
  );
};
