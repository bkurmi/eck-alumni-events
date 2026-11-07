import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  MapPin,
  GraduationCap,
  Phone,
  ShieldAlert,
  Check,
  X,
  Loader2,
  Building,
  MessageCircle,
} from 'lucide-react';
import type { AlumniDirectoryItem } from '../types';
import {
  fetchAllAlumniForAdmin,
  approveAlumniRecord,
  rejectAlumniRecord,
} from '../lib/directory';
import { cleanMobileNumber, stripSalutation } from '../lib/registrations';

interface AlumniApprovalManagerProps {
  onApprovalCountChange?: (count: number) => void;
}

export const AlumniApprovalManager: React.FC<AlumniApprovalManagerProps> = ({
  onApprovalCountChange,
}) => {
  const [alumniList, setAlumniList] = useState<AlumniDirectoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');

  // Action states
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingAlumnus, setRejectingAlumnus] = useState<AlumniDirectoryItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error';
    text: string;
    whatsappAlumnus?: AlumniDirectoryItem;
  } | null>(null);

  const getApprovalWhatsAppUrl = (alumnus: AlumniDirectoryItem) => {
    const cleanMobile = cleanMobileNumber(alumnus.mobile);
    const cleanedName = stripSalutation(alumnus.name || '').trim();
    const firstName = cleanedName.split(' ')[0] || cleanedName || 'Alumnus';

    const message = [
      '🎉 *Congratulations! Your ECK-RTU Alumni Registration is Approved.*',
      '',
      `Hello ${firstName},`,
      '',
      'We are pleased to inform you that your alumni registration has been successfully verified and approved by the ECK-RTU Alumni Network team.',
      '',
      'Your profile is now part of the *Official ECK-RTU Alumni Directory.*',
      '',
      '🎓 *Welcome to the ECK-RTU Alumni Network!*',
      '',
      'We look forward to staying connected, strengthening our alumni bonds, sharing updates, and bringing our ECKians together through future events and initiatives.',
      '',
      'Thank you for being part of this journey.',
      '',
      '❤️ *Once an ECKian, Always an ECKian!*',
      '',
      '*Team ECK-RTU Alumni Network*',
    ].join('\n');

    return `https://wa.me/91${cleanMobile}?text=${encodeURIComponent(message)}`;
  };

  const fetchAlumni = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAllAlumniForAdmin();
      setAlumniList(data);
      const pendingCount = data.filter((a) => a.approval_status === 'PENDING').length;
      onApprovalCountChange?.(pendingCount);
    } catch (err) {
      console.error('Failed to load alumni:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlumni();
  }, []);

  const stats = useMemo(() => {
    const pending = alumniList.filter((a) => a.approval_status === 'PENDING').length;
    const approved = alumniList.filter((a) => a.approval_status === 'APPROVED' || !a.approval_status).length;
    const rejected = alumniList.filter((a) => a.approval_status === 'REJECTED').length;
    return { pending, approved, rejected, total: alumniList.length };
  }, [alumniList]);

  const filteredAlumni = useMemo(() => {
    return alumniList.filter((alumnus) => {
      // Status filter
      if (statusFilter === 'PENDING' && alumnus.approval_status !== 'PENDING') return false;
      if (statusFilter === 'APPROVED' && alumnus.approval_status !== 'APPROVED' && alumnus.approval_status) return false;
      if (statusFilter === 'REJECTED' && alumnus.approval_status !== 'REJECTED') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (alumnus.name || '').toLowerCase().includes(q);
        const matchesMobile = (alumnus.mobile || '').includes(q);
        const matchesBatch = (alumnus.batch || '').toLowerCase().includes(q);
        const matchesBranch = (alumnus.engineering_discipline || '').toLowerCase().includes(q);
        const matchesOrg = (alumnus.organization || '').toLowerCase().includes(q);
        const matchesCity = (alumnus.city || '').toLowerCase().includes(q);
        return matchesName || matchesMobile || matchesBatch || matchesBranch || matchesOrg || matchesCity;
      }

      return true;
    });
  }, [alumniList, statusFilter, searchQuery]);

  const handleApprove = async (alumnus: AlumniDirectoryItem) => {
    setProcessingId(alumnus.id);
    setFeedbackMessage(null);

    const res = await approveAlumniRecord(alumnus.id);
    setProcessingId(null);

    if (res.success) {
      setFeedbackMessage({
        type: 'success',
        text: `✓ ${alumnus.name} has been approved and added to the Alumni Directory!`,
        whatsappAlumnus: alumnus,
      });
      // Optimistic state update
      setAlumniList((prev) =>
        prev.map((a) =>
          a.id === alumnus.id
            ? { ...a, approval_status: 'APPROVED', reviewed_at: new Date().toISOString() }
            : a
        )
      );
      const newPendingCount = Math.max(0, stats.pending - 1);
      onApprovalCountChange?.(newPendingCount);
    } else {
      setFeedbackMessage({
        type: 'error',
        text: res.message || 'Failed to approve alumnus.',
      });
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingAlumnus) return;
    setProcessingId(rejectingAlumnus.id);
    setFeedbackMessage(null);

    const res = await rejectAlumniRecord(rejectingAlumnus.id, rejectionReason);
    setProcessingId(null);

    if (res.success) {
      setFeedbackMessage({
        type: 'success',
        text: `Application for ${rejectingAlumnus.name} was rejected.`,
      });
      setAlumniList((prev) =>
        prev.map((a) =>
          a.id === rejectingAlumnus.id
            ? {
                ...a,
                approval_status: 'REJECTED',
                rejection_reason: rejectionReason,
                reviewed_at: new Date().toISOString(),
              }
            : a
        )
      );
      const newPendingCount = Math.max(0, stats.pending - 1);
      onApprovalCountChange?.(newPendingCount);
      setRejectingAlumnus(null);
      setRejectionReason('');
    } else {
      setFeedbackMessage({
        type: 'error',
        text: res.message || 'Failed to reject application.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Pending Card */}
        <button
          type="button"
          onClick={() => setStatusFilter('PENDING')}
          className={`flex flex-col rounded-2xl p-4 text-left border transition-all min-h-[44px] ${
            statusFilter === 'PENDING'
              ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-lg shadow-amber-500/10'
              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Pending Review</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-amber-400 mt-2 font-mono">
            {stats.pending}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">Requires manual approval</span>
        </button>

        {/* Approved Card */}
        <button
          type="button"
          onClick={() => setStatusFilter('APPROVED')}
          className={`flex flex-col rounded-2xl p-4 text-left border transition-all min-h-[44px] ${
            statusFilter === 'APPROVED'
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-500/10'
              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Approved Alumni</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-emerald-400 mt-2 font-mono">
            {stats.approved}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">Live in Directory</span>
        </button>

        {/* Rejected Card */}
        <button
          type="button"
          onClick={() => setStatusFilter('REJECTED')}
          className={`flex flex-col rounded-2xl p-4 text-left border transition-all min-h-[44px] ${
            statusFilter === 'REJECTED'
              ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-lg shadow-rose-500/10'
              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Rejected</span>
            <XCircle className="h-4 w-4 text-rose-400" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-rose-400 mt-2 font-mono">
            {stats.rejected}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">Unverified applications</span>
        </button>

        {/* Total Card */}
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`flex flex-col rounded-2xl p-4 text-left border transition-all min-h-[44px] ${
            statusFilter === 'ALL'
              ? 'bg-slate-800 border-amber-500/50 text-white shadow-lg'
              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Records</span>
            <Users className="h-4 w-4 text-slate-400" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-white mt-2 font-mono">
            {stats.total}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">All registrations</span>
        </button>
      </div>

      {/* Feedback banner */}
      {feedbackMessage && (
        <div
          className={`rounded-2xl p-4 text-xs sm:text-sm font-medium flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border shadow-lg animate-in fade-in ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{feedbackMessage.text}</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {feedbackMessage.whatsappAlumnus && (
              <a
                href={getApprovalWhatsAppUrl(feedbackMessage.whatsappAlumnus)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-[0.99]"
              >
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span>Notify via WhatsApp</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-900/60 p-3 sm:p-4 rounded-2xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, branch, batch, company..."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-3.5 py-2.5 text-sm sm:text-base text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchAlumni}
            disabled={isLoading}
            className="flex min-h-[44px] items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs sm:text-sm font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* List / Table of Alumni */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-amber-400 mb-2" />
          <p className="text-sm">Loading alumni applications...</p>
        </div>
      ) : filteredAlumni.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400">
          <CheckCircle2 className="h-10 w-10 text-emerald-400/80 mx-auto mb-2" />
          <p className="text-base font-bold text-slate-200">
            {statusFilter === 'PENDING'
              ? 'No Pending Alumni Approvals!'
              : 'No alumni found matching your filter.'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {statusFilter === 'PENDING'
              ? 'All submitted alumni applications have been reviewed.'
              : 'Try adjusting your search query.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlumni.map((alumnus) => {
            const isProcessing = processingId === alumnus.id;
            const isPending = alumnus.approval_status === 'PENDING';
            const isApproved = alumnus.approval_status === 'APPROVED' || !alumnus.approval_status;
            const isRejected = alumnus.approval_status === 'REJECTED';

            return (
              <div
                key={alumnus.id}
                className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-md ${
                  isPending
                    ? 'border-amber-500/40 bg-slate-900/90 hover:border-amber-500/60'
                    : isRejected
                    ? 'border-rose-500/20 bg-slate-950/80 opacity-80'
                    : 'border-slate-800 bg-slate-900/60'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  {/* Left: Avatar + Details */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {/* Photo / Avatar */}
                    <div className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                      {alumnus.photo_url || alumnus.resolved_photo_url ? (
                        <img
                          src={alumnus.photo_url || alumnus.resolved_photo_url || ''}
                          alt={alumnus.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <GraduationCap className="h-6 w-6 text-amber-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base sm:text-lg font-bold text-white truncate">
                          {alumnus.name}
                        </h3>

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isPending
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : isApproved
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {isPending && <Clock className="h-3 w-3" />}
                          {isApproved && <CheckCircle2 className="h-3 w-3" />}
                          {isRejected && <XCircle className="h-3 w-3" />}
                          <span>{isPending ? 'PENDING APPROVAL' : isApproved ? 'APPROVED' : 'REJECTED'}</span>
                        </span>
                      </div>

                      {/* Batch & Branch */}
                      <p className="text-xs sm:text-sm text-slate-300 flex flex-wrap items-center gap-1.5 font-medium">
                        <span className="text-amber-400 font-bold">{alumnus.batch || `${alumnus.year_of_passing} Batch`}</span>
                        <span className="text-slate-600">•</span>
                        <span>{alumnus.engineering_discipline}</span>
                        {alumnus.year_of_passing && (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="text-slate-400">Class of {alumnus.year_of_passing}</span>
                          </>
                        )}
                      </p>

                      {/* Career & Location */}
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-400 pt-0.5">
                        {alumnus.organization && (
                          <span className="flex items-center gap-1 text-slate-300">
                            <Building className="h-3.5 w-3.5 text-slate-500" />
                            <span>{alumnus.designation ? `${alumnus.designation}, ` : ''}{alumnus.organization}</span>
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-slate-500" />
                          <span>{alumnus.city || 'Kota'}, {alumnus.state || 'Rajasthan'}</span>
                        </span>
                        <a
                          href={`tel:+91${cleanMobileNumber(alumnus.mobile)}`}
                          className="flex items-center gap-1 text-amber-400/90 hover:underline font-mono"
                        >
                          <Phone className="h-3.5 w-3.5 text-amber-400" />
                          <span>+91 {cleanMobileNumber(alumnus.mobile)}</span>
                        </a>
                      </div>

                      {/* Rejection note if applicable */}
                      {isRejected && alumnus.rejection_reason && (
                        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg mt-1">
                          <strong>Reason:</strong> {alumnus.rejection_reason}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0 w-full sm:w-auto justify-end border-t border-slate-800/80 sm:border-0 pt-3 sm:pt-0">
                    {isPending ? (
                      <>
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleApprove(alumnus)}
                          className="flex-1 sm:flex-initial flex min-h-[44px] items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50"
                        >
                          {isProcessing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 stroke-[3]" />
                          )}
                          <span>Approve</span>
                        </button>

                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => {
                            setRejectingAlumnus(alumnus);
                            setRejectionReason('');
                          }}
                          className="flex-1 sm:flex-initial flex min-h-[44px] items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs sm:text-sm font-semibold transition-all disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                          <span>Reject</span>
                        </button>
                      </>
                    ) : isApproved ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={getApprovalWhatsAppUrl(alumnus)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-sm active:scale-[0.99]"
                          title={`Send WhatsApp confirmation to +91 ${cleanMobileNumber(alumnus.mobile)}`}
                        >
                          <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>WhatsApp Confirmation</span>
                        </a>
                        <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Verified Member</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingAlumnus(alumnus);
                            setRejectionReason('');
                          }}
                          className="min-h-[44px] px-3 py-2 text-xs text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition-colors"
                        >
                          Revoke
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleApprove(alumnus)}
                        className="flex min-h-[44px] items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-all"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Re-Approve</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectingAlumnus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-400" />
                <span>Reject Alumni Application</span>
              </h3>
              <button
                type="button"
                onClick={() => setRejectingAlumnus(null)}
                className="p-1 text-slate-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Are you sure you want to reject the alumni application for <strong className="text-white">{rejectingAlumnus.name}</strong> ({rejectingAlumnus.batch}, {rejectingAlumnus.engineering_discipline})?
            </p>

            <div>
              <label
                htmlFor="reject-reason"
                className="block text-xs font-semibold text-slate-300 mb-1.5"
              >
                Reason for Rejection <span className="text-slate-400 font-normal">(Optional note)</span>
              </label>
              <textarea
                id="reject-reason"
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Roll number could not be verified by 2018 batch coordinator."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-400 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectingAlumnus(null)}
                className="flex-1 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processingId === rejectingAlumnus.id}
                onClick={handleConfirmReject}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-rose-600/30 transition-all flex items-center justify-center gap-1.5"
              >
                {processingId === rejectingAlumnus.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span>Confirm Rejection</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

