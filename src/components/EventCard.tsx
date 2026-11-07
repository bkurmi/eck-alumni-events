import React, { useState, useEffect } from 'react';
import type { ECKEvent } from '../types';
import { getRegistrationDeadline } from '../lib/eventStatus';
import {
  Calendar,
  Clock,
  MapPin,
  IndianRupee,
  ArrowRight,
  Search,
  Lock,
} from 'lucide-react';

interface EventCardProps {
  event: ECKEvent;
  onRegisterClick?: () => void;
  onManageRegistrationClick?: () => void;
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  onRegisterClick,
  onManageRegistrationClick,
}) => {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isClosed: boolean;
    totalHours: number;
    formattedDeadline: string;
  } | null>(null);

  useEffect(() => {
    const calculate = () => {
      const deadline = getRegistrationDeadline(event);
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();

      const formattedDeadline = deadline.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      });

      if (diff <= 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isClosed: true,
          totalHours: 0,
          formattedDeadline,
        });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      const totalHours = Math.floor(diff / (1000 * 60 * 60));

      setTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        isClosed: false,
        totalHours,
        formattedDeadline,
      });
    };

    calculate();
    const timer = setInterval(calculate, 1000);
    return () => clearInterval(timer);
  }, [event?.registration_closes_at]);

  const formattedDate = new Date(event.event_date).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const bannerImg = event.banner_image_url || '/diwali-banner.jpg';
  const isEventOpen = event.status === 'OPEN';

  return (
    <section className="w-full overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-500/35 bg-slate-900/90 shadow-[0_12px_40px_rgba(0,0,0,0.6),0_0_25px_rgba(245,158,11,0.22)] backdrop-blur-md">
      {/* Festive Banner Container */}
      <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] max-h-[360px] overflow-hidden bg-[#060810]">
        <img
          src={bannerImg}
          alt={event.event_name}
          className="h-full w-full object-cover object-center transition-transform duration-700 hover:scale-105"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent" />
      </div>

      <div className="flex flex-col gap-5 p-4 sm:p-6 md:p-8">
        {/* Status and Badges Row */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            Annual Alumni Meet
          </span>

          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              isEventOpen
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
          >
            {isEventOpen
              ? 'Registrations Open'
              : event.status === 'CLOSED'
              ? 'Registrations Closed'
              : event.status}
          </span>

          {isEventOpen && timeLeft && !timeLeft.isClosed && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                timeLeft.totalHours < 24
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
              title={`Online registration closes on ${timeLeft.formattedDeadline} IST`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>{timeLeft.totalHours < 24 ? 'Ends in' : 'Closes in'}</span>
              <span className="font-mono font-bold tracking-tight">
                {timeLeft.days > 0 && `${timeLeft.days}d `}
                {String(timeLeft.hours).padStart(2, '0')}h {String(timeLeft.minutes).padStart(2, '0')}m {String(timeLeft.seconds).padStart(2, '0')}s
              </span>
            </span>
          )}
        </div>

        {/* Title & Authentic Hindi Tagline */}
        <div className="space-y-1.5">
          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
            {event.event_name}
          </h1>

          {event.tagline && (
            <p className="text-sm sm:text-base font-semibold text-amber-400">
              <span className="text-amber-500">✦</span> {event.tagline}{' '}
              <span className="text-amber-500">✦</span>
            </p>
          )}
        </div>

        {/* Aligned Key Info Grid - 2 columns on tablet/desktop prevents text truncation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          {/* Date */}
          <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 sm:p-3.5 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Event Date
              </span>
              <span className="block text-xs sm:text-sm font-bold text-slate-100">
                {formattedDate}
              </span>
            </div>
          </div>

          {/* Time */}
          {event.event_time && (
            <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 sm:p-3.5 shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Clock className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Timings
                </span>
                <span className="block text-xs sm:text-sm font-bold text-slate-100">
                  {event.event_time}
                </span>
              </div>
            </div>
          )}

          {/* Venue */}
          <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 sm:p-3.5 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Venue
              </span>
              <span className="block text-xs sm:text-sm font-bold text-slate-100 line-clamp-2">
                {event.location}
              </span>
            </div>
          </div>

          {/* Contribution Fee */}
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 sm:p-3.5 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <IndianRupee className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                Contribution
              </span>
              <div className="text-xs sm:text-sm font-extrabold text-amber-200">
                {event.status === 'CLOSED' ? (
                  <span>
                    ₹1,000 <span className="text-[11px] font-normal text-slate-300">Spot Entry / Adult</span>
                  </span>
                ) : (
                  <span>
                    ₹800 <span className="text-[11px] font-normal text-slate-300">Single</span> • ₹1,500 <span className="text-[11px] font-normal text-slate-300">Couple</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Description Box with Gold Accent Left Border */}
        {event.description && (
          <div className="rounded-xl border-l-4 border-amber-500 bg-slate-950/50 p-3.5 sm:p-4 text-xs sm:text-sm text-slate-300 leading-relaxed shadow-sm">
            <p>{event.description}</p>
          </div>
        )}

        {/* Action Buttons & Notice */}
        {isEventOpen ? (
          <div className="space-y-3 pt-1">
            {onRegisterClick && (
              <button
                type="button"
                onClick={onRegisterClick}
                className="group relative flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-6 py-3.5 text-base font-bold text-slate-950 shadow-lg shadow-amber-500/25 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
                id="btn-register-now"
              >
                <span>Join {event.short_name || event.event_name} • Register Now</span>
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </button>
            )}

            {onManageRegistrationClick && (
              <button
                type="button"
                onClick={onManageRegistrationClick}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm font-medium text-slate-200 transition-all hover:bg-slate-800 hover:text-white cursor-pointer active:bg-slate-700"
                id="btn-lookup-registration"
              >
                <Search className="h-4 w-4 text-amber-400" />
                <span>Already Registered? View / Update Details</span>
              </button>
            )}

            <p className="text-center text-xs text-slate-400 font-medium pt-1">
              ✨ Limited capacity • Family &amp; batchmates welcome ✨
            </p>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-4 sm:p-5 space-y-3 shadow-md">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Online Registrations Closed</h3>
                  <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                    Online registration closed post deadline. Spot walk-in entries are open at the gate!
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4 text-xs sm:text-sm space-y-2">
                <p className="text-slate-200">
                  <strong className="text-amber-400">Spot Walk-in Registration Desk:</strong>
                  <br />
                  Missed online registration? No worries! Visit the Spot Registration Desk at the ECK Campus Gate on the event day.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-xs font-semibold text-amber-300">
                    Adults: ₹1,000 / person
                  </span>
                  <span className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300">
                    Kids (10+ yrs): ₹500
                  </span>
                  <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                    Kids (&lt;10 yrs): Free
                  </span>
                </div>
              </div>
            </div>

            {onManageRegistrationClick && (
              <button
                type="button"
                onClick={onManageRegistrationClick}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm font-medium text-slate-200 transition-all hover:bg-slate-800 hover:text-white cursor-pointer active:bg-slate-700"
                id="btn-lookup-registration"
              >
                <Search className="h-4 w-4 text-amber-400" />
                <span>Already Registered? View / Update Details &amp; Pass</span>
              </button>
            )}

            <p className="text-center text-xs text-slate-400 font-medium pt-1">
              ✨ We look forward to welcoming you at ECK-RTU Campus Kota! ✨
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
