import React, { useState, useEffect, useRef } from 'react';
import type { Sponsorship } from '../types';
import { DEFAULT_UPI_CONFIGS, UPI_ACCOUNT_NAMES } from '../lib/paymentRotation';
import { getPublicSponsorshipScreenshotUrl } from '../lib/sponsorships';

interface SponsorshipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sponsorship: Partial<Sponsorship>, screenshotFile?: File | null) => Promise<boolean>;
  initialData?: Sponsorship | null;
  currentUserEmail?: string;
}

const PRESET_AMOUNTS = [5000, 11000, 21000, 51000, 100000];

export const SponsorshipModal: React.FC<SponsorshipModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  currentUserEmail,
}) => {
  const [sponsorName, setSponsorName] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [receivingUpiId, setReceivingUpiId] = useState<string>('');
  const [customUpi, setCustomUpi] = useState<string>('');
  const [contactPerson, setContactPerson] = useState<string>('');
  const [contactPhone, setContactPhone] = useState<string>('');
  const [contactEmail, setContactEmail] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [existingScreenshotPath, setExistingScreenshotPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorFieldId, setErrorFieldId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formTopRef = useRef<HTMLDivElement | null>(null);
  const formBodyRef = useRef<HTMLFormElement | null>(null);

  // Available receiving UPI account options
  const knownUpiOptions = [
    { upi: 'gautam.lucky-1@okicici', label: `Lokesh (gautam.lucky-1@okicici)` },
    { upi: '9799951857@upi', label: `Chetan (9799951857@upi)` },
    ...DEFAULT_UPI_CONFIGS.map((c) => ({
      upi: c.upi_id.toLowerCase().trim(),
      label: `${c.account_name || UPI_ACCOUNT_NAMES[c.upi_id.toLowerCase().trim()] || 'UPI'} (${c.upi_id})`,
    })),
  ];

  // Initialize or reset form when modal opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setSponsorName(initialData.sponsor_name || '');
        setAmount(initialData.amount ? String(initialData.amount) : '');

        const existingUpi = (initialData.receiving_upi_id || '').toLowerCase().trim();
        if (!existingUpi) {
          setReceivingUpiId('');
          setCustomUpi('');
        } else if (knownUpiOptions.some((o) => o.upi === existingUpi)) {
          setReceivingUpiId(existingUpi);
          setCustomUpi('');
        } else {
          setReceivingUpiId('custom');
          setCustomUpi(existingUpi);
        }

        setContactPerson(initialData.contact_person || '');
        const cleanPhone = (initialData.contact_phone || '').replace(/\D/g, '');
        setContactPhone(cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone);
        setContactEmail(initialData.contact_email || '');
        setNotes(initialData.notes || '');
        setExistingScreenshotPath(initialData.payment_screenshot_path || null);
        setScreenshotFile(null);
        setScreenshotPreview(getPublicSponsorshipScreenshotUrl(initialData.payment_screenshot_path));
      } else {
        // New entry defaults (Lokesh is the primary recipient for Sponsorships)
        setSponsorName('');
        setAmount('');
        setReceivingUpiId('gautam.lucky-1@okicici');
        setCustomUpi('');
        setContactPerson('');
        setContactPhone('');
        setContactEmail('');
        setNotes('');
        setExistingScreenshotPath(null);
        setScreenshotFile(null);
        setScreenshotPreview(null);
      }
      setErrorMsg(null);
      setErrorFieldId(null);
      setSaving(false);
    }
  }, [isOpen, initialData]);

  // Handle image file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        scrollToError('Screenshot file size exceeds 10MB. Please choose a smaller image.');
        return;
      }
      setScreenshotFile(file);
      setScreenshotPreview(URL.createObjectURL(file));
      setErrorMsg(null);
      setErrorFieldId(null);
    }
  };

  const handleRemoveScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setExistingScreenshotPath(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Helper to display error, scroll to top of modal, and focus erroneous field
  const scrollToError = (errorMessage: string, fieldId?: string) => {
    setErrorMsg(errorMessage);
    if (fieldId) {
      setErrorFieldId(fieldId);
    }
    // Scroll modal form to top
    if (formBodyRef.current) {
      formBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (formTopRef.current) {
      formTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (fieldId) {
      setTimeout(() => {
        const el = document.getElementById(fieldId);
        if (el) {
          try {
            el.focus({ preventScroll: true });
          } catch {
            // fallback
          }
        }
      }, 60);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setErrorFieldId(null);

    // 1. Mandatory: Sponsor / Company / Contributor Name
    const trimmedName = sponsorName.trim();
    if (!trimmedName) {
      scrollToError('Please enter Sponsor / Company / Contributor Name.', 'field-sponsor-name');
      return;
    }

    // 2. Mandatory: Receiving UPI Account
    const finalUpiId = (receivingUpiId === 'custom' ? customUpi.trim() : receivingUpiId.trim()).toLowerCase();
    if (!finalUpiId) {
      scrollToError(
        'Please select or enter the Receiving UPI Account.',
        receivingUpiId === 'custom' ? 'field-custom-upi' : 'field-receiving-upi'
      );
      return;
    }

    // 3. Mandatory: Contact Person Name
    const trimmedContact = contactPerson.trim();
    if (!trimmedContact) {
      scrollToError('Please enter Contact Person Name.', 'field-contact-person');
      return;
    }

    // 4. Mandatory: Mobile / WhatsApp (10 digits)
    const trimmedPhone = contactPhone.trim().replace(/\D/g, '');
    if (!trimmedPhone) {
      scrollToError('Please enter Mobile / WhatsApp number.', 'field-contact-phone');
      return;
    }
    if (trimmedPhone.length !== 10) {
      scrollToError(
        `Mobile number must be exactly 10 digits (currently ${trimmedPhone.length} ${trimmedPhone.length === 1 ? 'digit' : 'digits'}).`,
        'field-contact-phone'
      );
      return;
    }

    // 5. Email (Optional, but if entered must be valid format)
    const trimmedEmail = contactEmail.trim();
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        scrollToError('Please enter a valid email address (e.g. partner@company.com), or leave it empty.', 'field-contact-email');
        return;
      }
    }

    const numAmount = Math.max(0, Number(amount) || 0);

    setSaving(true);
    try {
      const payload: Partial<Sponsorship> = {
        ...(initialData?.id ? { id: initialData.id } : {}),
        sponsor_name: trimmedName,
        amount: numAmount,
        receiving_upi_id: finalUpiId,
        contact_person: trimmedContact,
        contact_phone: trimmedPhone,
        contact_email: trimmedEmail || null,
        notes: notes.trim() || null,
        payment_screenshot_path: screenshotFile ? null : existingScreenshotPath,
        created_by: currentUserEmail || 'admin',
      };

      const success = await onSave(payload, screenshotFile);
      if (success) {
        onClose();
      }
    } catch (err: any) {
      console.error('Error saving sponsorship:', err);
      scrollToError(err?.message || 'Failed to save sponsorship details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="modal-content"
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          backgroundColor: '#1e293b',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Sticky Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #1e293b, #0f172a)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
              }}
            >
              💎
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc' }}>
                {initialData ? 'Edit Sponsorship' : 'Add Sponsorship Entry'}
              </h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                Record sponsor details, amount, screenshot &amp; notes
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '22px',
              cursor: 'pointer',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          ref={formBodyRef}
          onSubmit={handleSubmit}
          style={{
            padding: '20px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Scroll-to-top anchor */}
          <div ref={formTopRef} style={{ height: '1px', width: '100%' }} />

          {errorMsg && (
            <div
              className="submit-error-banner"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                borderRadius: '10px',
                padding: '12px 14px',
                color: '#fca5a5',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                animation: 'alertShake 0.35s ease',
              }}
            >
              <span style={{ fontSize: '18px' }}>⚠️</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{errorMsg}</span>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setErrorFieldId(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fca5a5',
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '2px',
                  lineHeight: 1,
                }}
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          )}

          {/* Amount Field with Quick Presets */}
          <div>
            <label
              htmlFor="field-sponsorship-amount"
              style={{
                display: 'block',
                fontSize: '0.9rem',
                fontWeight: '600',
                color: '#e2e8f0',
                marginBottom: '6px',
              }}
            >
              Sponsorship Amount (₹)
            </label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '1.2rem',
                  fontWeight: '700',
                  color: '#10b981',
                }}
              >
                ₹
              </span>
              <input
                id="field-sponsorship-amount"
                type="number"
                min="0"
                step="100"
                placeholder="e.g. 25000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px 12px 34px',
                  backgroundColor: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  color: '#10b981',
                  fontSize: '1.15rem',
                  fontWeight: '700',
                  outline: 'none',
                }}
              />
            </div>

            {/* Quick Amount Chips */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                marginTop: '8px',
              }}
            >
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  style={{
                    minHeight: '34px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    border: amount && Number(amount) === preset ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: amount && Number(amount) === preset ? 'rgba(16, 185, 129, 0.15)' : '#0f172a',
                    color: amount && Number(amount) === preset ? '#10b981' : '#cbd5e1',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  ₹{preset.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
          </div>

          {/* Sponsor / Company / Contributor Name (MANDATORY *) */}
          <div>
            <label
              htmlFor="field-sponsor-name"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.9rem',
                fontWeight: '600',
                color: '#e2e8f0',
                marginBottom: '6px',
              }}
            >
              <span>
                Sponsor / Company / Contributor Name <span style={{ color: '#ef4444' }}>*</span>
              </span>
            </label>
            <input
              id="field-sponsor-name"
              type="text"
              placeholder="e.g. Acme Tech Solutions / Er. Rajesh Gupta (Batch 1998)"
              value={sponsorName}
              onChange={(e) => {
                setSponsorName(e.target.value);
                if (errorFieldId === 'field-sponsor-name') setErrorFieldId(null);
              }}
              className={errorFieldId === 'field-sponsor-name' ? 'input-error-highlight' : ''}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 14px',
                backgroundColor: '#0f172a',
                border: errorFieldId === 'field-sponsor-name' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: errorFieldId === 'field-sponsor-name' ? '0 0 0 3px rgba(239, 68, 68, 0.32)' : 'none',
                borderRadius: '10px',
                color: '#f8fafc',
                fontSize: '16px',
                outline: 'none',
              }}
            />
          </div>

          {/* Receiving UPI Account (MANDATORY *) */}
          <div>
            <label
              htmlFor="field-receiving-upi"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.88rem',
                fontWeight: '600',
                color: '#e2e8f0',
                marginBottom: '6px',
              }}
            >
              <span>
                Receiving UPI Account <span style={{ color: '#ef4444' }}>*</span>
              </span>
            </label>
            <select
              id="field-receiving-upi"
              value={receivingUpiId}
              onChange={(e) => {
                setReceivingUpiId(e.target.value);
                if (errorFieldId === 'field-receiving-upi') setErrorFieldId(null);
              }}
              className={errorFieldId === 'field-receiving-upi' ? 'input-error-highlight' : ''}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 14px',
                backgroundColor: '#0f172a',
                border: errorFieldId === 'field-receiving-upi' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: errorFieldId === 'field-receiving-upi' ? '0 0 0 3px rgba(239, 68, 68, 0.32)' : 'none',
                borderRadius: '10px',
                color: receivingUpiId ? '#f8fafc' : '#94a3b8',
                fontSize: '16px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">-- Select Receiving UPI Account --</option>
              {knownUpiOptions.map((opt) => (
                <option key={opt.upi} value={opt.upi}>
                  {opt.label}
                </option>
              ))}
              <option value="custom">Other / Custom UPI</option>
            </select>
          </div>

          {receivingUpiId === 'custom' && (
            <div>
              <label
                htmlFor="field-custom-upi"
                style={{
                  display: 'block',
                  fontSize: '0.88rem',
                  fontWeight: '600',
                  color: '#e2e8f0',
                  marginBottom: '6px',
                }}
              >
                <span>
                  Custom UPI ID <span style={{ color: '#ef4444' }}>*</span>
                </span>
              </label>
              <input
                id="field-custom-upi"
                type="text"
                placeholder="e.g. alumnus@okaxis"
                value={customUpi}
                onChange={(e) => {
                  setCustomUpi(e.target.value);
                  if (errorFieldId === 'field-custom-upi') setErrorFieldId(null);
                }}
                className={errorFieldId === 'field-custom-upi' ? 'input-error-highlight' : ''}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  backgroundColor: '#0f172a',
                  border: errorFieldId === 'field-custom-upi' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: errorFieldId === 'field-custom-upi' ? '0 0 0 3px rgba(239, 68, 68, 0.32)' : 'none',
                  borderRadius: '10px',
                  color: '#f8fafc',
                  fontSize: '16px',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Contact Details (Always Visible) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '14px',
              backgroundColor: 'rgba(15, 23, 42, 0.5)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            {/* Contact Person Name (MANDATORY *) */}
            <div>
              <label
                htmlFor="field-contact-person"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  color: '#cbd5e1',
                  marginBottom: '4px',
                }}
              >
                <span>
                  Contact Person Name <span style={{ color: '#ef4444' }}>*</span>
                </span>
              </label>
              <input
                id="field-contact-person"
                type="text"
                placeholder="e.g. Vikramaditya Singh"
                value={contactPerson}
                onChange={(e) => {
                  setContactPerson(e.target.value);
                  if (errorFieldId === 'field-contact-person') setErrorFieldId(null);
                }}
                className={errorFieldId === 'field-contact-person' ? 'input-error-highlight' : ''}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  backgroundColor: '#0f172a',
                  border: errorFieldId === 'field-contact-person' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: errorFieldId === 'field-contact-person' ? '0 0 0 3px rgba(239, 68, 68, 0.32)' : 'none',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '16px',
                  outline: 'none',
                }}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
              }}
            >
              {/* Mobile / WhatsApp (MANDATORY *) */}
              <div>
                <label
                  htmlFor="field-contact-phone"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    color: '#cbd5e1',
                    marginBottom: '4px',
                  }}
                >
                  <span>
                    Mobile / WhatsApp <span style={{ color: '#ef4444' }}>*</span>
                  </span>
                </label>
                <div
                  className="input-prefix-wrap"
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    borderRadius: '8px',
                    border: errorFieldId === 'field-contact-phone' ? '1px solid #ef4444' : undefined,
                    boxShadow: errorFieldId === 'field-contact-phone' ? '0 0 0 3px rgba(239, 68, 68, 0.32)' : undefined,
                  }}
                >
                  <span className="input-prefix" style={{ minWidth: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    +91
                  </span>
                  <input
                    id="field-contact-phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="10-digit number"
                    maxLength={10}
                    value={contactPhone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setContactPhone(digits);
                      if (errorFieldId === 'field-contact-phone') setErrorFieldId(null);
                    }}
                    className={`prefixed-input ${errorFieldId === 'field-contact-phone' ? 'input-error-highlight' : ''}`}
                    style={{
                      flex: 1,
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      backgroundColor: '#0f172a',
                      border: errorFieldId === 'field-contact-phone' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '0 8px 8px 0',
                      color: '#f8fafc',
                      fontSize: '16px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Email Address (Optional) */}
              <div>
                <label
                  htmlFor="field-contact-email"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    color: '#cbd5e1',
                    marginBottom: '4px',
                  }}
                >
                  <span>Email Address</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Optional</span>
                </label>
                <input
                  id="field-contact-email"
                  type="email"
                  placeholder="e.g. partner@company.com"
                  value={contactEmail}
                  onChange={(e) => {
                    setContactEmail(e.target.value);
                    if (errorFieldId === 'field-contact-email') setErrorFieldId(null);
                  }}
                  className={errorFieldId === 'field-contact-email' ? 'input-error-highlight' : ''}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    backgroundColor: '#0f172a',
                    border: errorFieldId === 'field-contact-email' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.15)',
                    boxShadow: errorFieldId === 'field-contact-email' ? '0 0 0 3px rgba(239, 68, 68, 0.32)' : 'none',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '16px',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Payment Screenshot Upload with Mobile Camera / Gallery Picker */}
          <div>
            <label
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.88rem',
                fontWeight: '600',
                color: '#e2e8f0',
                marginBottom: '6px',
              }}
            >
              <span>Payment Screenshot / Receipt</span>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Optional</span>
            </label>

            {screenshotPreview ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px',
                  backgroundColor: '#0f172a',
                  borderRadius: '12px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                <img
                  src={screenshotPreview}
                  alt="Payment Screenshot Preview"
                  style={{
                    width: '64px',
                    height: '64px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      color: '#10b981',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {screenshotFile ? screenshotFile.name : 'Screenshot Attached'}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                    {screenshotFile
                      ? `${(screenshotFile.size / 1024).toFixed(1)} KB`
                      : 'Saved in cloud storage'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveScreenshot}
                  style={{
                    minHeight: '36px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#f87171',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '2px dashed rgba(255, 255, 255, 0.2)',
                  backgroundColor: '#0f172a',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s ease',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <div style={{ fontSize: '24px', marginBottom: '4px' }}>📸</div>
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600', color: '#cbd5e1' }}>
                  Tap to upload payment screenshot
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                  Camera, Photos or Screenshot (JPG, PNG, WebP)
                </p>
              </div>
            )}
          </div>

          {/* Notes / Remarks */}
          <div>
            <label
              htmlFor="field-sponsorship-notes"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.88rem',
                fontWeight: '600',
                color: '#e2e8f0',
                marginBottom: '6px',
              }}
            >
              <span>Notes &amp; Commitments</span>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Optional</span>
            </label>
            <textarea
              id="field-sponsorship-notes"
              rows={2}
              placeholder="e.g. Logo display on main stage LED banner, check sent via batch rep, food sponsor..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 14px',
                backgroundColor: '#0f172a',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '10px',
                color: '#f8fafc',
                fontSize: '16px',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Sticky Actions Footer */}
          <div
            style={{
              paddingTop: '12px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                minHeight: '44px',
                minWidth: '88px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                backgroundColor: 'transparent',
                color: '#cbd5e1',
                fontSize: '0.95rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                minHeight: '44px',
                padding: '10px 24px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                fontSize: '0.95rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
              }}
            >
              {saving ? (
                <>
                  <span className="spinner" style={{ width: '16px', height: '16px' }} />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>{initialData ? 'Update' : 'Save'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
