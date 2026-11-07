import React, { useState, useEffect } from 'react';
import { GateVerificationPortal } from '../components/GateVerificationPortal';
import { GatePinLogin } from '../components/GatePinLogin';
import { Footer } from '../components/Footer';
import {
  getGateStaffSession,
  clearGateStaffSession,
  type GateStaffSession,
} from '../lib/gateAuth';
import { supabase } from '../lib/supabase';
import type { EventRegistration, ECKEvent } from '../types';
import { Zap, ArrowLeft, RefreshCw, User } from 'lucide-react';

export const GatePage: React.FC = () => {
  const [staffSession, setStaffSession] = useState<GateStaffSession | null>(null);
  const [adminSession, setAdminSession] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [eventsList, setEventsList] = useState<ECKEvent[]>([]);
  const [activeEvent, setActiveEvent] = useState<ECKEvent | null>(null);

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

  // Fetch registrations once authorized, strictly scoped to active event
  const fetchRegistrations = async (selectedEv?: ECKEvent | null) => {
    try {
      const eventRes = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: false });

      let targetEvent = selectedEv !== undefined ? selectedEv : activeEvent;
      if (!eventRes.error && eventRes.data && eventRes.data.length > 0) {
        const evList = eventRes.data as ECKEvent[];
        setEventsList(evList);
        if (!targetEvent) {
          targetEvent = evList.find((e) => e.status === 'OPEN') || evList[0];
          setActiveEvent(targetEvent);
        }
      }

      if (!targetEvent) return;

      const regQuery = supabase
        .from('event_registrations')
        .select(`
          *,
          alumni:alumni_id (*)
        `)
        .order('created_at', { ascending: false });

      if (targetEvent.id) {
        regQuery.eq('event_id', targetEvent.id);
      }

      const [regRes, verifRes] = await Promise.all([
        regQuery,
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
      <div className="min-h-screen bg-[#0a0c16] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-300">Connecting to Gate Desk...</p>
      </div>
    );
  }

  // Not logged in: Show Gate PIN login
  const isAuthenticated = Boolean(staffSession || adminSession);
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0c16] text-slate-100">
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
    <div className="min-h-screen bg-[#0a0c16] text-slate-100 flex flex-col">
      {/* Top Header for Gate Staff */}
      <header className="w-full bg-slate-900/90 border-b border-slate-800 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight">
                  <span className="hidden sm:inline">ECK Alumni Gate Desk</span>
                  <span className="sm:hidden">ECK Gate Desk</span>
                </h1>
                <span className="text-[11px] text-slate-400 block leading-none">Physical Entry &amp; Attendance</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {adminSession && (
                <a
                  href="/admin"
                  className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Back to Admin Portal"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Admin Portal</span>
                  <span className="sm:hidden">Admin</span>
                </a>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Log out of Gate Desk / Switch PIN"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Switch PIN / Exit</span>
                <span className="sm:hidden">Switch</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-slate-800/60 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-white flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-400" />
                  <span>{staffDisplayName}</span>
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-amber-300 font-medium">{stationDisplayName}</span>
              </div>
            </div>

            {eventsList.length > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-slate-400 text-[11px] font-medium hidden sm:inline">Active Event:</span>
                <select
                  value={activeEvent?.id || ''}
                  onChange={(e) => {
                    const ev = eventsList.find((x) => x.id === e.target.value);
                    if (ev) {
                      setActiveEvent(ev);
                      fetchRegistrations(ev);
                    }
                  }}
                  className="px-2.5 py-1 bg-slate-950/80 border border-amber-500/30 rounded-lg text-amber-300 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer min-h-[36px]"
                >
                  {eventsList.map((ev) => (
                    <option key={ev.id} value={ev.id} className="bg-slate-900 text-slate-100">
                      {ev.event_name} {ev.status === 'CLOSED' ? '(Closed)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Gate Verification Portal */}
      <main className="w-full max-w-3xl mx-auto px-3 sm:px-4 py-4 flex-1">
        <GateVerificationPortal
          registrations={registrations}
          onRefreshRegistrations={fetchRegistrations}
          staffName={staffDisplayName}
          stationName={stationDisplayName}
          onLogout={handleLogout}
          event={activeEvent}
        />
      </main>

      <Footer />
    </div>
  );
};
