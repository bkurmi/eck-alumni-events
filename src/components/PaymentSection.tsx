import React, { useState, useRef, useEffect } from 'react';
import type { PricingBreakdown } from '../lib/pricing';

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

  const upiDeepLink = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('ECK-RTU Alumni Kota Chapter')}&am=${amountToPay}&cu=INR&tn=${encodeURIComponent('ECK-RTU DeepAura 2K26 Registration')}`
    : null;

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
    <div className="payment-card">
      <div className="card-header-badge">
        <div className="step-tag-pill">Step 3 of 3</div>
        <h2 className="card-title">
          {isPaidUpdate ? 'Reunion Contribution & Dues' : 'Reunion Contribution'}
        </h2>
        <p className="card-subtitle">
          {isFullyPaid
            ? 'Your previous contribution covers your current attendee count in full.'
            : isPaidUpdate
            ? `Scan & pay the remaining difference of ₹${extraDue} for additional attendees.`
            : 'Scan & pay via any UPI app (GPay / PhonePe / Paytm / BHIM) and upload screenshot.'}
        </p>
      </div>

      {/* Amount Breakdown Card */}
      <div className="amount-summary-box">
        {pricing && pricing.items.length > 0 ? (
          <div className="pricing-items-list">
            {pricing.items.map((item, idx) => (
              <div key={idx} className="amount-row">
                <div className="amount-label-wrap">
                  <span className="amount-label">{item.label}</span>
                  <span className="amount-sublabel">{item.rateDescription}</span>
                </div>
                <span className={`amount-rate ${item.isFree ? 'amount-free-tag' : ''}`}>
                  {item.isFree ? 'FREE' : `₹${item.amount}`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="amount-row">
            <span className="amount-label">
              {attendeesCount} {attendeesCount === 1 ? 'Attendee' : 'Attendees'} × ₹{feePerPerson}
            </span>
            <span className="amount-rate">₹{amount}</span>
          </div>
        )}

        <div className="amount-divider" />

        <div className="amount-total-row">
          <div className="total-label-wrap">
            <span className="total-label">
              {isPaidUpdate ? 'Updated Total Contribution:' : 'Total Contribution:'}
            </span>
            <span className="total-attendees-hint">
              ({attendeesCount} {attendeesCount === 1 ? 'attendee' : 'attendees'})
            </span>
          </div>
          <span className="total-number font-accent">₹{amount}</span>
        </div>

        {/* Breakdown for Update Mode: Deduct previously paid amount */}
        {isPaidUpdate && (
          <>
            <div className="amount-row amount-deduct-row">
              <div className="amount-label-wrap">
                <span className="amount-label text-paid-credit">
                  ✓ Previously Paid Contribution:
                </span>
                <span className="amount-sublabel text-paid-credit-sub">
                  Credited from existing registration
                </span>
              </div>
              <span className="amount-rate text-paid-credit font-semibold">
                − ₹{previousPaidAmount}
              </span>
            </div>

            <div className="amount-divider" />

            <div className="amount-total-row amount-due-highlight-row">
              <div className="total-label-wrap">
                <span className="total-label font-bold">
                  {isFullyPaid ? 'Additional Amount Due:' : 'Additional Amount to Pay Now:'}
                </span>
                <span className="total-attendees-hint">
                  {isFullyPaid
                    ? 'All dues cleared for registered members'
                    : 'Difference to pay for additional member(s)'}
                </span>
              </div>
              <span
                className={`total-number ${
                  isFullyPaid ? 'text-cleared font-bold' : 'text-due font-extrabold'
                }`}
                style={{ color: isFullyPaid ? '#34d399' : '#f59e0b' }}
              >
                {isFullyPaid ? '₹0 (Paid ✓)' : `₹${extraDue}`}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Case 1: Fully Paid (Difference is 0) */}
      {isFullyPaid ? (
        <div className="fully-paid-callout">
          <div className="fully-paid-icon">🎉</div>
          <div className="fully-paid-content">
            <h4 className="fully-paid-title">All Dues Cleared!</h4>
            <p className="fully-paid-desc">
              Your previous contribution of <strong>₹{previousPaidAmount}</strong> fully covers your
              current attendee count ({attendeesCount}{' '}
              {attendeesCount === 1 ? 'person' : 'persons'}). No QR scan or additional payment is required!
            </p>
          </div>
        </div>
      ) : (
        /* Case 2: Fresh Registration OR Extra Members Added (Difference > 0) */
        <>
          {isPaidUpdate && extraDue > 0 && (
            <div className="additional-payment-alert">
              <div className="alert-flex">
                <span className="alert-icon">💳</span>
                <div className="alert-body">
                  <strong>Additional Payment of ₹{extraDue} Required</strong>
                  <p>
                    You added attendee(s). Your previous payment of ₹{previousPaidAmount} is
                    credited. Please scan below to pay only the difference of{' '}
                    <strong>₹{extraDue}</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* QR Code Container */}
          <div className="qr-container">
            <div className="qr-card-frame">
              {qrError || !qrImageUrl ? (
                <div className="qr-wrapper qr-error-wrapper">
                  <div className="qr-error-box">
                    <span className="qr-error-icon">⚠️</span>
                    <strong className="qr-error-title">QR failed to load</strong>
                    {!upiId && (
                      <p className="qr-error-subtext">
                        Payment details unavailable — please contact event organizers
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="qr-wrapper">
                    <img
                      src={qrImageUrl}
                      alt="ECK Alumni UPI QR Code"
                      className="qr-image"
                      onError={() => setQrError(true)}
                    />
                  </div>
                  <div className="qr-scan-badge">
                    <span>📷 Scan to Pay {isPaidUpdate ? `₹${extraDue}` : `₹${amount}`}</span>
                  </div>
                </>
              )}
            </div>

            {!qrError && qrImageUrl ? (
              <p className="qr-instruction">
                Open <strong>PhonePe, Google Pay, Paytm, or BHIM</strong> to scan &amp; pay{' '}
                <strong>₹{amountToPay}</strong>
              </p>
            ) : upiId ? (
              <p className="qr-instruction">
                Please pay <strong>₹{amountToPay}</strong> using the UPI ID below
              </p>
            ) : (
              <p className="qr-instruction qr-unavailable-text">
                Payment details unavailable — please contact event organizers
              </p>
            )}

            {upiId && (
              <div className="upi-direct-action">
                <div className="mobile-only-upi">
                  <div className="upi-or-divider">
                    <span>OR PAY ON THIS DEVICE</span>
                  </div>

                  <a
                    href={upiDeepLink || '#'}
                    className="btn-pay-upi"
                    id="btn-pay-upi-app"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                    <span>Pay ₹{amountToPay} via UPI App</span>
                  </a>
                  <span className="upi-app-hint">Tap to open GPay, PhonePe, or Paytm installed on this phone</span>
                </div>

                <div className="upi-id-box">
                  <span className="upi-label">UPI ID:</span>
                  <code className="upi-code">{upiId}</code>
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="copy-btn"
                    title="Copy UPI ID"
                    id="btn-copy-upi"
                  >
                    {copied ? '✓ Copied' : '📋 Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Screenshot Upload Dropzone */}
      <div className="screenshot-upload-section">
        <label className={`field-label ${!isFullyPaid ? 'required' : ''}`}>
          {isFullyPaid
            ? 'Payment Receipts on File'
            : isPaidUpdate && extraDue > 0
            ? `Upload Payment Screenshot for Additional ₹${extraDue}`
            : 'Upload Payment Screenshot'}
        </label>
        <p className="field-hint">
          {isFullyPaid
            ? 'Previous payment is verified on file. No new screenshot is required (you may optionally attach an updated receipt).'
            : isPaidUpdate && extraDue > 0
            ? `Please attach the successful UPI payment screen for the additional ₹${extraDue}. All receipts will be preserved for admin review.`
            : 'Attach the successful payment screen from your UPI app (JPG or PNG, max 5 MB).'}
        </p>

        {hasExistingScreenshot && !screenshotFile && (
          <div className="existing-screenshot-badge">
            <span className="badge-icon">✓</span>
            <span className="badge-text">
              {recordedReceiptsCount === 1
                ? 'Previous payment screenshot recorded on file'
                : `${recordedReceiptsCount} previous payment screenshots recorded on file`}
            </span>
          </div>
        )}

        {!screenshotFile ? (
          <div
            className={`dropzone ${error ? 'dropzone-error' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            id="screenshot-upload-dropzone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              id="payment-screenshot-input"
            />
            <div className="dropzone-content">
              <div className="dropzone-icon">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <span className="dropzone-text">
                {isFullyPaid
                  ? 'Tap if you wish to attach an additional slip (optional)'
                  : isPaidUpdate && extraDue > 0
                  ? `Tap to upload screenshot for ₹${extraDue}`
                  : 'Tap to select or take photo of payment'}
              </span>
              <span className="dropzone-subtext">JPG, PNG, WebP • Max size 5 MB</span>
            </div>
          </div>
        ) : (
          <div className="screenshot-preview-card">
            {previewUrl && (
              <div className="preview-image-wrap">
                <img
                  src={previewUrl}
                  alt="Payment screenshot preview"
                  className="preview-img"
                />
              </div>
            )}
            <div className="preview-meta">
              <div className="preview-info">
                <span className="preview-filename">{screenshotFile.name}</span>
                <span className="preview-filesize">
                  {(screenshotFile.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
              <button
                type="button"
                onClick={handleRemoveScreenshot}
                className="btn-remove-file"
                title="Change screenshot"
              >
                ✕ Change Image
              </button>
            </div>
          </div>
        )}

        {error && <p className="error-message">{error}</p>}
      </div>

      <div className="payment-note-box">
        <div className="note-icon">💡</div>
        <div className="note-text">
          <strong>No transaction reference / UTR required.</strong> Your payment screenshot is securely uploaded and verified directly on the portal.
        </div>
      </div>
    </div>
  );
};
