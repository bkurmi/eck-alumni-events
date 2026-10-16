import React, { useState, useEffect } from 'react';
import { GateVerificationPortal } from '../components/GateVerificationPortal';
import { GatePinLogin } from '../components/GatePinLogin';
import {
  getGateStaffSession,
  clearGateStaffSession,
  type GateStaffSession,
} from '../lib/gateAuth';
import { supabase } from '../lib/supabase';
import type { EventRegistration } from '../types';

export const GatePage: React.FC = () => {
  const [staffSession, setStaffSession] = useState<GateStaffSession | null>(null);
  const [adminSession, setAdminSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Registrations state for stats and counter
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);

  // Check initial authentication (PIN session or Supabase Admin session)
  useEffect(() => {
    const existingPinSession = getGateStaffSession();
    if (existingPinSession) {
      setStaffSession(existingPinSession);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAdminSession(session);
      setLoadingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAdminSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch registrations once authorized
  const fetchRegistrations = async () => {
    try {
      const { data, error } = await supabase
        .from('event_registrations')
        .select(`
          *,
          alumni:alumni_id (*)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setRegistrations(data as any);
      }
    } catch (err) {
      console.warn('Failed to fetch event registrations for gate counter:', err);
    }
  };

  useEffect(() => {
    if (staffSession || adminSession) {
      fetchRegistrations();
    }
  }, [staffSession, adminSession]);

  const handlePinLoginSuccess = (session: GateStaffSession) => {
    setStaffSession(session);
  };

  const handleLogout = () => {
    clearGateStaffSession();
    setStaffSession(null);
  };

  if (loadingAuth) {
    return (
      <div className="gate-loading-screen">
        <div className="gate-spinner"></div>
        <p>Connecting to Gate Desk...</p>
      </div>
    );
  }

  // Not logged in: Show Gate PIN login
  const isAuthenticated = Boolean(staffSession || adminSession);
  if (!isAuthenticated) {
    return (
      <div className="gate-page-wrapper">
        <GatePinLogin
          onLoginSuccess={handlePinLoginSuccess}
          onAdminLoginClick={() => {
            window.location.href = '/admin';
          }}
        />
      </div>
    );
  }

  const staffDisplayName = staffSession
    ? staffSession.staffName
    : adminSession?.user?.email
    ? `Admin (${adminSession.user.email.split('@')[0]})`
    : 'Gate Desk Staff';

  const stationDisplayName = staffSession ? staffSession.stationName : 'Admin Desk';

  return (
    <div className="gate-page-wrapper">
      {/* Top Header for Gate Staff */}
      <header className="gate-standalone-header">
        <div className="gate-header-brand">
          <span className="gate-brand-icon">⚡</span>
          <div>
            <h1 className="gate-brand-title">ECK Alumni Gate Desk</h1>
            <span className="gate-brand-subtitle">Physical Entry &amp; Attendance</span>
          </div>
        </div>

        <div className="gate-header-user-status">
          <div className="gate-user-badge">
            <span className="gate-user-dot" />
            <div className="gate-user-text">
              <span className="gate-user-name">👤 {staffDisplayName}</span>
              <span className="gate-station-name">{stationDisplayName}</span>
            </div>
          </div>

          {adminSession && (
            <a href="/admin" className="btn btn-outline btn-xs gate-back-admin-btn">
              ← Admin Portal
            </a>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="btn btn-secondary btn-xs gate-logout-btn"
            title="Log out of Gate Desk"
          >
            Switch PIN / Exit
          </button>
        </div>
      </header>

      {/* Main Gate Verification Portal */}
      <main className="gate-page-content">
        <GateVerificationPortal
          registrations={registrations}
          onRefreshRegistrations={fetchRegistrations}
          staffName={staffDisplayName}
          stationName={stationDisplayName}
          onLogout={handleLogout}
        />
      </main>
    </div>
  );
};
