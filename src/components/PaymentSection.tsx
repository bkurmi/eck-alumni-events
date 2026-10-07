import React, { useState, useRef } from 'react';

interface PaymentSectionProps {
  amount: number;
  attendeesCount: number;
  feePerPerson: number;
  qrImageUrl?: string | null;
  upiId?: string | null;
  screenshotFile: File | null;
  onScreenshotChange: (file: File | null) => void;
  error?: string | null;
}

export const PaymentSection: React.FC<PaymentSectionProps> = ({
  amount,
  attendeesCount,
  feePerPerson,
  qrImageUrl,
  upiId = 'eckalumni@upi',
  screenshotFile,
  onScreenshotChange,
  error,
}) => {
  const [copied, setCopied] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayQr = qrImageUrl || '/upi-qr.svg';

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
        <h2 className="card-title">Reunion Contribution</h2>
        <p className="card-subtitle">
          Scan &amp; pay via any UPI app (GPay / PhonePe / Paytm / BHIM) and upload screenshot.
        </p>
      </div>

      {/* Amount Breakdown Card */}
      <div className="amount-summary-box">
        <div className="amount-row">
          <span className="amount-label">
            {attendeesCount} {attendeesCount === 1 ? 'Attendee' : 'Attendees'} × ₹{feePerPerson}
          </span>
          <span className="amount-rate">₹{amount}</span>
        </div>
        <div className="amount-divider" />
        <div className="amount-total-row">
          <span className="total-label">Total Contribution:</span>
          <span className="total-number font-accent">₹{amount}</span>
        </div>
      </div>

      {/* QR Code Container */}
      <div className="qr-container">
        <div className="qr-card-frame">
          <div className="qr-wrapper">
            <img
              src={displayQr}
              alt="ECK Alumni UPI QR Code"
              className="qr-image"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.endsWith('/upi-qr.svg')) {
                  target.src = '/upi-qr.svg';
                }
              }}
            />
          </div>
          <div className="qr-scan-badge">
            <span>📷 Scan to Pay</span>
          </div>
        </div>

        <p className="qr-instruction">
          Open <strong>PhonePe, Google Pay, Paytm, or BHIM</strong> to scan
        </p>

        {upiId && (
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
        )}
      </div>

      {/* Screenshot Upload Dropzone */}
      <div className="screenshot-upload-section">
        <label className="field-label required">
          Upload Payment Screenshot
        </label>
        <p className="field-hint">
          Attach the successful payment screen from your UPI app (JPG or PNG, max 5 MB).
        </p>

        {!screenshotFile ? (
          <div
            className={`dropzone ${error ? 'dropzone-error' : ''}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
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
              <span className="dropzone-text">Tap to select or take photo of payment</span>
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
          <strong>No transaction reference / UTR required.</strong> Your screenshot will be automatically linked to the organizer&apos;s Google Sheet for seamless reconciliation.
        </div>
      </div>
    </div>
  );
};
