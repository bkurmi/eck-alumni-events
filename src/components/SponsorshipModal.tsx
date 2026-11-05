import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Sponsorship, ECKEvent } from '../types';
import { getEventUpiConfigs } from '../lib/paymentRotation';
import { getPublicSponsorshipScreenshotUrl } from '../lib/sponsorships';
import { X, AlertCircle, Camera, Check, Trash2 } from 'lucide-react';

interface SponsorshipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sponsorship: Partial<Sponsorship>, screenshotFile?: File | null) => Promise<boolean>;
  initialData?: Sponsorship | null;
  currentUserEmail?: string;
  event?: ECKEvent | null;
}

const PRESET_AMOUNTS = [5000, 11000, 21000, 51000, 100000];

export const SponsorshipModal: React.FC<SponsorshipModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  currentUserEmail,
  event,
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

  // Available receiving UPI account options loaded dynamically from active event
  const knownUpiOptions = useMemo(() => {
    const eventConfigs = getEventUpiConfigs(event);
    return eventConfigs.map((c) => ({
      upi: c.upi_id.toLowerCase().trim(),
      label: `${c.account_name || 'UPI'} (${c.upi_id})`,
    }));
  }, [event]);

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
        // New entry defaults from active event
        setSponsorName('');
        setAmount('');
        setReceivingUpiId(event?.upi_rotation_configs?.[0]?.upi_id || event?.upi_id || '');
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[92vh] sm:max-h-[85vh] bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in duration-200">
        {/* Sticky Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-xl shadow-md shadow-amber-500/20">
              💎
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100">
                {initialData ? 'Edit Sponsorship' : 'Add Sponsorship Entry'}
              </h2>
              <p className="text-xs text-slate-400">
                Record sponsor details, amount, screenshot &amp; notes
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-100 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          ref={formBodyRef}
          onSubmit={handleSubmit}
          className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col gap-4 text-left"
        >
          {/* Scroll-to-top anchor */}
          <div ref={formTopRef} className="h-px w-full" />

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs sm:text-sm flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="flex-1 font-medium">{errorMsg}</span>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setErrorFieldId(null);
                }}
                className="text-rose-400 hover:text-rose-200 min-h-[30px] min-w-[30px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          )}

          {/* Amount Field with Quick Presets */}
          <div>
            <label
              htmlFor="field-sponsorship-amount"
              className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5"
            >
              Sponsorship Amount (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-emerald-400 font-mono">
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
                className="w-full min-h-[44px] pl-8 pr-4 py-2.5 bg-slate-950 text-emerald-400 font-bold font-mono text-lg rounded-xl border border-slate-800 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60"
              />
            </div>

            {/* Quick Amount Chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PRESET_AMOUNTS.map((preset) => {
                const isSelected = amount && Number(amount) === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(String(preset))}
                    className={`min-h-[34px] px-2.5 py-1 rounded-full text-xs font-semibold font-mono transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/60'
                        : 'bg-slate-800/80 text-slate-300 border border-slate-700/60 hover:bg-slate-800'
                    }`}
                  >
                    ₹{preset.toLocaleString('en-IN')}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sponsor / Company / Contributor Name */}
          <div>
            <label
              htmlFor="field-sponsor-name"
              className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5"
            >
              Sponsor / Company / Contributor Name <span className="text-rose-400">*</span>
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
              className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 text-slate-100 rounded-xl text-base sm:text-sm border focus:outline-none transition-colors ${
                errorFieldId === 'field-sponsor-name'
                  ? 'border-rose-500 ring-2 ring-rose-500/30'
                  : 'border-slate-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60'
              }`}
            />
          </div>

          {/* Receiving UPI Account */}
          <div>
            <label
              htmlFor="field-receiving-upi"
              className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5"
            >
              Receiving UPI Account <span className="text-rose-400">*</span>
            </label>
            <select
              id="field-receiving-upi"
              value={receivingUpiId}
              onChange={(e) => {
                setReceivingUpiId(e.target.value);
                if (errorFieldId === 'field-receiving-upi') setErrorFieldId(null);
              }}
              className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 rounded-xl text-base sm:text-sm border focus:outline-none cursor-pointer transition-colors ${
                receivingUpiId ? 'text-slate-100' : 'text-slate-400'
              } ${
                errorFieldId === 'field-receiving-upi'
                  ? 'border-rose-500 ring-2 ring-rose-500/30'
                  : 'border-slate-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60'
              }`}
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
                className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5"
              >
                Custom UPI ID <span className="text-rose-400">*</span>
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
                className={`w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 text-slate-100 rounded-xl text-base sm:text-sm border focus:outline-none transition-colors ${
                  errorFieldId === 'field-custom-upi'
                    ? 'border-rose-500 ring-2 ring-rose-500/30'
                    : 'border-slate-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60'
                }`}
              />
            </div>
          )}

          {/* Contact Details Card */}
          <div className="flex flex-col gap-3 p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/80">
            <div>
              <label
                htmlFor="field-contact-person"
                className="block text-xs font-semibold text-slate-300 mb-1"
              >
                Contact Person Name <span className="text-rose-400">*</span>
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
                className={`w-full min-h-[44px] px-3.5 py-2 bg-slate-900 text-slate-100 rounded-xl text-base sm:text-sm border focus:outline-none transition-colors ${
                  errorFieldId === 'field-contact-person'
                    ? 'border-rose-500 ring-2 ring-rose-500/30'
                    : 'border-slate-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60'
                }`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Mobile / WhatsApp */}
              <div>
                <label
                  htmlFor="field-contact-phone"
                  className="block text-xs font-semibold text-slate-300 mb-1"
                >
                  Mobile / WhatsApp <span className="text-rose-400">*</span>
                </label>
                <div
                  className={`flex items-stretch rounded-xl border bg-slate-900 overflow-hidden ${
                    errorFieldId === 'field-contact-phone'
                      ? 'border-rose-500 ring-2 ring-rose-500/30'
                      : 'border-slate-800 focus-within:border-amber-500/60 focus-within:ring-1 focus-within:ring-amber-500/60'
                  }`}
                >
                  <span className="min-w-[44px] px-2.5 flex items-center justify-center text-xs font-mono text-slate-400 border-r border-slate-800 bg-slate-950/60">
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
                    className="flex-1 w-full min-h-[44px] px-3 py-2 bg-transparent text-slate-100 text-base sm:text-sm font-mono focus:outline-none"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label
                  htmlFor="field-contact-email"
                  className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1"
                >
                  <span>Email Address</span>
                  <span className="text-[11px] text-slate-500 font-normal">Optional</span>
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
                  className={`w-full min-h-[44px] px-3.5 py-2 bg-slate-900 text-slate-100 rounded-xl text-base sm:text-sm border focus:outline-none transition-colors ${
                    errorFieldId === 'field-contact-email'
                      ? 'border-rose-500 ring-2 ring-rose-500/30'
                      : 'border-slate-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Payment Screenshot Upload */}
          <div>
            <label className="flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-200 mb-1.5">
              <span>Payment Screenshot / Receipt</span>
              <span className="text-xs text-slate-500 font-normal">Optional</span>
            </label>

            {screenshotPreview ? (
              <div className="flex items-center gap-3 p-2.5 bg-slate-950 rounded-xl border border-emerald-500/30">
                <img
                  src={screenshotPreview}
                  alt="Payment Screenshot Preview"
                  className="w-14 h-14 object-cover rounded-lg border border-slate-800"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-emerald-400 truncate">
                    {screenshotFile ? screenshotFile.name : 'Screenshot Attached'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {screenshotFile
                      ? `${(screenshotFile.size / 1024).toFixed(1)} KB`
                      : 'Saved in cloud storage'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveScreenshot}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold cursor-pointer inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-4 rounded-xl border-2 border-dashed border-slate-800 hover:border-amber-500/50 bg-slate-950/60 text-center cursor-pointer transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Camera className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                <p className="text-xs sm:text-sm font-semibold text-slate-300">
                  Tap to upload payment screenshot
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Camera, Photos or Screenshot (JPG, PNG, WebP)
                </p>
              </div>
            )}
          </div>

          {/* Notes / Remarks */}
          <div>
            <label
              htmlFor="field-sponsorship-notes"
              className="flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-200 mb-1.5"
            >
              <span>Notes &amp; Commitments</span>
              <span className="text-xs text-slate-500 font-normal">Optional</span>
            </label>
            <textarea
              id="field-sponsorship-notes"
              rows={2}
              placeholder="e.g. Logo display on main stage LED banner, check sent via batch rep, food sponsor..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-950 text-slate-100 placeholder-slate-500 border border-slate-800 rounded-xl text-base sm:text-sm focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 transition-colors"
            />
          </div>

          {/* Sticky Actions Footer */}
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold text-sm transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-sm inline-flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
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
