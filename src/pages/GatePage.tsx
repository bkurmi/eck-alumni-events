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
      const [regRes, verifRes] = await Promise.all([
        supabase
          .from('event_registrations')
          .select(`
            *,
            alumni:alumni_id (*)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('payment_verifications')
          .select('registration_id, verified_status'),
      ]);

      if (!regRes.error && regRes.data) {
        const list = regRes.data as any[];
        const verifList = (verifRes.data as any[]) || [];
        list.forEach((reg) => {
          reg.payment_verifications = verifList.filter((v) => v.registration_id === reg.id);
        });
        setRegistrations(list);
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
        <div className="gate-header-main-bar">
          <div className="gate-header-brand">
            <span className="gate-brand-icon" aria-hidden="true">⚡</span>
            <div className="gate-brand-text">
              <h1 className="gate-brand-title">
                <span className="gate-brand-title-full">ECK Alumni Gate Desk</span>
                <span className="gate-brand-title-short">ECK Gate Desk</span>
              </h1>
              <span className="gate-brand-subtitle">Physical Entry &amp; Attendance</span>
            </div>
          </div>

          <div className="gate-header-actions">
            {adminSession && (
              <a href="/admin" className="gate-nav-btn gate-back-admin-btn" title="Back to Admin Portal">
                <span className="btn-icon">←</span>
                <span className="btn-label-full">Admin Portal</span>
                <span className="btn-label-short">Admin</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="gate-nav-btn gate-logout-btn"
              title="Log out of Gate Desk / Switch PIN"
            >
              <span className="btn-icon">🔄</span>
              <span className="btn-label-full">Switch PIN / Exit</span>
              <span className="btn-label-short">Switch PIN</span>
            </button>
          </div>
        </div>

        <div className="gate-header-user-bar">
          <div className="gate-user-badge">
            <span className="gate-user-dot" aria-hidden="true" />
            <div className="gate-user-text">
              <span className="gate-user-name" title={staffDisplayName}>
                <span className="user-icon">👤</span> {staffDisplayName}
              </span>
              <span className="gate-station-divider">•</span>
              <span className="gate-station-name">{stationDisplayName}</span>
            </div>
          </div>
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
