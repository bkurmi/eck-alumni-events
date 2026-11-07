import React from 'react';
import { Camera, X, Sparkles } from 'lucide-react';

interface UpiPaymentFlowModalProps {
  isOpen: boolean;
  mode?: 'confirm' | 'welcome_back';
  amount: number;
  alumniName?: string;
  alumniMobile?: string;
  coordinatorPhone?: string;
  isSaving?: boolean;
  upiDeepLink?: string | null;
  onProceedToUpi?: () => void;
  onUploadScreenshot: () => void;
  onClose: () => void;
}

export const UpiPaymentFlowModal: React.FC<UpiPaymentFlowModalProps> = ({
  isOpen,
  amount,
  alumniName = 'Alumnus',
  onUploadScreenshot,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-md rounded-2xl sm:rounded-3xl border border-amber-500/40 bg-slate-900 shadow-2xl overflow-hidden p-5 sm:p-6 space-y-5 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>Welcome Back!</span>
          </span>
          <button
            type="button"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Hero Content */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-lg shadow-amber-500/10">
            <Camera className="h-7 w-7" />
          </div>
          <h3 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
            Final Step: Upload Screenshot
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-sm mx-auto">
            Completed payment in your UPI app? Please upload your payment confirmation screenshot now to generate your official registration pass!
          </p>
        </div>

        {/* Amount Pill */}
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2.5 text-xs text-slate-300">
          <span>Amount: <strong className="text-amber-300 font-bold">₹{amount}</strong></span>
          <span>•</span>
          <span>Alumnus: <strong className="text-white font-semibold">{alumniName}</strong></span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer"
            onClick={onUploadScreenshot}
            id="btn-welcome-upload-screenshot"
          >
            <Camera className="h-4 w-4" />
            <span>Select Screenshot from Gallery</span>
          </button>

          <button
            type="button"
            className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-transparent px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            onClick={onClose}
          >
            I haven't paid yet / Do this later
          </button>
        </div>
      </div>
    </div>
  );
};
