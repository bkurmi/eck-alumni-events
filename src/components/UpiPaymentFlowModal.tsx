import React from 'react';

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
    <div className="modal-overlay upi-flow-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-content upi-flow-modal-content welcome-back-compact"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header upi-flow-modal-header welcome-header">
          <div className="upi-modal-badge badge-welcome">
            <span>🎉 Welcome Back!</span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="modal-body upi-flow-modal-body">
          <div className="welcome-hero-wrap">
            <div className="welcome-icon-glow">📸</div>
            <h3 className="upi-modal-title">Final Step: Upload Screenshot</h3>
            <p className="upi-modal-subtitle">
              Completed payment in your UPI app? Please upload your payment confirmation screenshot now to generate your official registration pass!
            </p>
          </div>

          <div className="welcome-amount-pill">
            <span>Amount: <strong>₹{amount}</strong></span>
            <span>•</span>
            <span>Alumnus: <strong>{alumniName}</strong></span>
          </div>

          <div className="upi-modal-actions">
            <button
              type="button"
              className="btn btn-festive-primary btn-block upi-proceed-btn"
              onClick={onUploadScreenshot}
              id="btn-welcome-upload-screenshot"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>📷 Select Screenshot from Gallery</span>
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-block text-muted"
              onClick={onClose}
            >
              I haven't paid yet / Do this later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
