import React, { useState, useRef, useEffect } from 'react';
import type { PricingBreakdown } from '../lib/pricing';
import {
  Copy,
  Check,
  Upload,
  AlertTriangle,
  Lightbulb,
  X,
  CreditCard,
  Sparkles,
} from 'lucide-react';

interface PaymentSectionProps {
  amount: number;
  attendeesCount: number;
  feePerPerson?: number;
  pricing?: PricingBreakdown;
  qrImageUrl?: string | null;
  upiId?: string | null;
  screenshotFile: File | null;
  onScreenshotChange: (file: File | null) => void;
  error?: string | null;
  isUpdateMode?: boolean;
  hasExistingScreenshot?: boolean;
  existingScreenshotPath?: string | null;
  previousPaidAmount?: number;
  additionalAmountDue?: number;
  onPayViaUpiApp?: (deepLink: string) => void;
  isPreSavingUpi?: boolean;
}

export const PaymentSection: React.FC<PaymentSectionProps> = ({
  amount,
  attendeesCount,
  feePerPerson = 800,
  pricing,
  qrImageUrl,
  upiId,
  screenshotFile,
  onScreenshotChange,
  error,
  isUpdateMode = false,
  hasExistingScreenshot = false,
  existingScreenshotPath,
  previousPaidAmount = 0,
  additionalAmountDue,
}) => {
  const [copied, setCopied] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQrError(false);
  }, [qrImageUrl]);

  const isPaidUpdate = Boolean(isUpdateMode && previousPaidAmount > 0);
  const extraDue =
    typeof additionalAmountDue === 'number'
      ? additionalAmountDue
      : Math.max(0, amount - (previousPaidAmount || 0));
  const isFullyPaid = isPaidUpdate && extraDue === 0;
  const amountToPay = isPaidUpdate ? extraDue : amount;

  const recordedReceiptsCount =
    (existingScreenshotPath || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean).length || (hasExistingScreenshot ? 1 : 0);

  const handleCopyUpi = () => {
    if (upiId) {
      navigator.clipboard.writeText(upiId).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5 MB. Please upload a smaller screenshot.');
      return;
    }

    onScreenshotChange(file);

    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveScreenshot = () => {
    onScreenshotChange(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-2xl sm:rounded-3xl border border-amber-500/30 bg-slate-900/90 shadow-2xl p-4 sm:p-6 md:p-8 space-y-6 backdrop-blur-md">
      {/* Step Header */}
      <div className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
          Step 3 of 3
        </span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
          {isPaidUpdate ? 'Reunion Contribution & Dues' : 'Reunion Contribution'}
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          {isFullyPaid
            ? 'Your previous contribution covers your current attendee count in full.'
            : isPaidUpdate
            ? `Scan & pay the remaining difference of ₹${extraDue} for additional attendees.`
            : 'Scan QR or copy UPI ID via any app (PhonePe / GPay / Paytm) & upload screenshot.'}
        </p>
      </div>

      {/* Amount Breakdown Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 sm:p-5 space-y-3">
        {pricing && pricing.items.length > 0 ? (
          <div className="space-y-2">
            {pricing.items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs sm:text-sm">
                <div>
                  <span className="text-slate-200 font-medium block">{item.label}</span>
                  <span className="text-[11px] text-slate-400 block">{item.rateDescription}</span>
                </div>
                <span className={`font-semibold ${item.isFree ? 'text-emerald-400' : 'text-slate-100'}`}>
                  {item.isFree ? 'FREE' : `₹${item.amount}`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-slate-200">
              {attendeesCount} {attendeesCount === 1 ? 'Attendee' : 'Attendees'} × ₹{feePerPerson}
            </span>
            <span className="font-semibold text-slate-100">₹{amount}</span>
          </div>
        )}

        <div className="border-t border-slate-800" />

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-bold text-white block">
              {isPaidUpdate ? 'Updated Total Contribution:' : 'Total Contribution:'}
            </span>
            <span className="text-xs text-slate-400 block">
              ({attendeesCount} {attendeesCount === 1 ? 'attendee' : 'attendees'})
            </span>
          </div>
          <span className="text-lg sm:text-xl font-extrabold text-amber-400 font-mono">
            ₹{amount}
          </span>
        </div>

        {/* Breakdown for Update Mode */}
        {isPaidUpdate && (
          <>
            <div className="flex items-center justify-between text-xs sm:text-sm text-emerald-400 pt-1">
              <div>
                <span className="font-semibold block">✓ Previously Paid Contribution:</span>
                <span className="text-[11px] text-emerald-500 block">Credited from existing registration</span>
              </div>
              <span className="font-bold">− ₹{previousPaidAmount}</span>
            </div>

            <div className="border-t border-slate-800" />

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="text-sm font-bold text-amber-300 block">
                  {isFullyPaid ? 'Additional Amount Due:' : 'Additional Amount to Pay Now:'}
                </span>
                <span className="text-xs text-slate-400 block">
                  {isFullyPaid ? 'All dues cleared for registered members' : 'Difference to pay for additional member(s)'}
                </span>
              </div>
              <span className={`text-lg sm:text-xl font-mono font-extrabold ${isFullyPaid ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isFullyPaid ? '₹0 (Paid ✓)' : `₹${extraDue}`}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Case 1: Fully Paid */}
      {isFullyPaid ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:p-5 flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm sm:text-base font-bold text-white">All Dues Cleared!</h4>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Your previous contribution of <strong className="text-emerald-300">₹{previousPaidAmount}</strong> fully covers your
              current attendee count ({attendeesCount} {attendeesCount === 1 ? 'person' : 'persons'}). No QR scan or additional payment is required!
            </p>
          </div>
        </div>
      ) : (
        /* Case 2: Fresh Registration or Difference > 0 */
        <div className="space-y-5">
          {isPaidUpdate && extraDue > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3 text-xs sm:text-sm">
              <CreditCard className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-300 block">Additional Payment of ₹{extraDue} Required</strong>
                <p className="text-slate-300 mt-0.5">
                  You added attendee(s). Your previous payment of ₹{previousPaidAmount} is credited. Please scan below to pay only the difference of <strong className="text-white">₹{extraDue}</strong>.
                </p>
              </div>
            </div>
          )}

          {/* QR Code Container */}
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="p-4 rounded-3xl bg-white shadow-2xl border-4 border-amber-500/30">
              {qrError || !qrImageUrl ? (
                <div className="w-48 h-48 sm:w-56 sm:h-56 flex flex-col items-center justify-center p-4 text-center bg-slate-100 rounded-2xl text-slate-600 gap-2">
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                  <strong className="text-xs font-bold">QR failed to load</strong>
                  {!upiId && (
                    <p className="text-[11px] text-slate-500">
                      Payment details unavailable — please contact event organizers
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <img
                    src={qrImageUrl}
                    alt="ECK Alumni UPI QR Code"
                    className="w-48 h-48 sm:w-56 sm:h-56 object-contain rounded-xl"
                    onError={() => setQrError(true)}
                  />
                  <span className="mt-2 text-center text-xs font-bold text-slate-900">
                    Scan to Pay {isPaidUpdate ? `₹${extraDue}` : `₹${amount}`}
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-300 text-center font-medium">
              Contribution Amount: <strong className="text-amber-400 font-bold">₹{amountToPay}</strong>
            </p>

            {/* UPI ID Direct Copy Box */}
            {upiId && (
              <div className="w-full max-w-md space-y-3 pt-2">
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-700 bg-slate-950">
                  <span className="text-xs font-semibold text-slate-400 shrink-0 pl-1">UPI ID:</span>
                  <code className="font-mono text-xs sm:text-sm font-bold text-amber-300 truncate select-all">
                    {upiId}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-300 transition-colors cursor-pointer shrink-0"
                    title="Copy UPI ID"
                    id="btn-copy-upi"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* Step-by-Step Payment Instructions */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5 space-y-2.5 text-xs text-slate-300">
                  <div className="flex items-start gap-2">
                    <span className="rounded bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 text-[10px] shrink-0 mt-0.5">
                      Option 1
                    </span>
                    <div>
                      <strong className="text-white">Pay using another phone:</strong> Open your UPI app (PhonePe / GPay / Paytm), scan the QR code above, and upload screenshot below.
                    </div>
                  </div>

                  <div className="border-t border-slate-800" />

                  <div className="flex items-start gap-2">
                    <span className="rounded bg-blue-500/20 text-blue-300 font-bold px-1.5 py-0.5 text-[10px] shrink-0 mt-0.5">
                      Option 2
                    </span>
                    <div>
                      <strong className="text-white">Pay using this phone:</strong> Tap <em>Copy</em> on the UPI ID above, complete payment in your UPI app, and upload screenshot below.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Screenshot Upload Dropzone */}
      <div className="space-y-2 pt-2">
        <label className="block text-xs sm:text-sm font-bold text-white">
          {isFullyPaid
            ? 'Payment Receipts on File'
            : isPaidUpdate && extraDue > 0
            ? `Upload Payment Screenshot for Additional ₹${extraDue}`
            : 'Upload Payment Screenshot *'}
        </label>
        <p className="text-xs text-slate-400">
          {isFullyPaid
            ? 'Previous payment is verified on file. No new screenshot is required (you may optionally attach an updated receipt).'
            : isPaidUpdate && extraDue > 0
            ? `Please attach the successful UPI payment screen for the additional ₹${extraDue}. All receipts will be preserved for admin review.`
            : 'Attach the successful payment screen from your UPI app (JPG or PNG, max 5 MB).'}
        </p>

        {hasExistingScreenshot && !screenshotFile && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300 font-medium">
            <Check className="h-4 w-4" />
            <span>
              {recordedReceiptsCount === 1
                ? 'Previous payment screenshot recorded on file'
                : `${recordedReceiptsCount} previous payment screenshots recorded on file`}
            </span>
          </div>
        )}

        {!screenshotFile ? (
          <div
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
              error
                ? 'border-rose-500/60 bg-rose-500/5'
                : 'border-slate-700 hover:border-amber-500/60 bg-slate-950/40 hover:bg-slate-950/60'
            }`}
            onClick={() => fileInputRef.current?.click()}
            id="screenshot-upload-dropzone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              id="payment-screenshot-input"
            />
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                <Upload className="h-6 w-6" />
              </div>
              <span className="text-sm font-bold text-slate-200">
                {isFullyPaid
                  ? 'Tap if you wish to attach an additional slip (optional)'
                  : isPaidUpdate && extraDue > 0
                  ? `Tap to upload screenshot for ₹${extraDue}`
                  : 'Tap to select or take photo of payment'}
              </span>
              <span className="text-xs text-slate-400">JPG, PNG, WebP • Max size 5 MB</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl border border-slate-700 bg-slate-950">
            <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Payment screenshot preview"
                  className="h-14 w-14 rounded-xl object-cover border border-amber-500/30 shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-white truncate">{screenshotFile.name}</span>
                <span className="block text-[11px] text-slate-400">
                  {(screenshotFile.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRemoveScreenshot}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/40 transition-colors cursor-pointer w-full sm:w-auto justify-center"
              title="Change screenshot"
            >
              <X className="h-4 w-4" />
              <span>Change Image</span>
            </button>
          </div>
        )}

        {error && <p className="text-xs text-rose-400 font-medium pt-1">{error}</p>}
      </div>

      {/* Tip Callout */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-start gap-2.5 text-xs text-slate-300">
        <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-amber-300">Tip:</strong> Your payment screenshot is securely uploaded and linked to your registration. You will receive your official pass as soon as you submit!
        </div>
      </div>
    </div>
  );
};
