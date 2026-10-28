import type { ECKEvent, UpiPaymentConfig } from '../types';

/**
 * Display names for receiving UPI accounts (used in Reconciliation Report).
 * 👉 Update these placeholder names ("Account 1", "Account 2", etc.) with your desired custom names.
 */
export const UPI_ACCOUNT_NAMES: Record<string, string> = {
  '9414177517@sbi': 'Hari Narayan',
  'jyotibala.nagar@axisbank': 'Mitesh',
  '9414936876@ibl': 'Rajeev',
  '9001017275@ybl': 'Mukesh',
  '9799951857@upi': 'Chetan',
  'gautam.lucky-1@okicici': 'Lokesh',
};

export function getUpiAccountName(upiId?: string | null): string {
  if (!upiId) return '';
  const normalized = upiId.toLowerCase().trim();
  return UPI_ACCOUNT_NAMES[normalized] || '';
}

/**
 * 4 Pre-configured UPI and QR Code endpoints.
 * These act as fallback or default sequence unless overridden dynamically in Supabase `events.upi_rotation_configs`.
 */
export const DEFAULT_UPI_CONFIGS: UpiPaymentConfig[] = [
  {
    upi_id: '9414177517@sbi',
    qr_image_url: '/qr-1.png',
    account_name: UPI_ACCOUNT_NAMES['9414177517@sbi'] || 'Account 1',
  },
  {
    upi_id: 'jyotibala.nagar@axisbank',
    qr_image_url: '/qr-2.png',
    account_name: UPI_ACCOUNT_NAMES['jyotibala.nagar@axisbank'] || 'Account 2',
  },
  {
    upi_id: '9414936876@ibl',
    qr_image_url: '/qr-3.png',
    account_name: UPI_ACCOUNT_NAMES['9414936876@ibl'] || 'Account 3',
  },
  {
    upi_id: '9001017275@ybl',
    qr_image_url: '/qr-4.png',
    account_name: UPI_ACCOUNT_NAMES['9001017275@ybl'] || 'Account 4',
  },
];

/**
 * Reads rotation interval from .env (VITE_UPI_ROTATION_THRESHOLD).
 * Defaults to 100 if missing or invalid.
 */
export function getUpiRotationThreshold(): number {
  const envVal = import.meta.env.VITE_UPI_ROTATION_THRESHOLD;
  if (envVal !== undefined && envVal !== null && String(envVal).trim() !== '') {
    const parsed = parseInt(String(envVal).trim(), 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 100;
}

export interface ActivePaymentRotationResult {
  activeConfig: UpiPaymentConfig;
  currentIndex: number;
  accountNumber: number;
  totalAccounts: number;
  threshold: number;
  registrationCount: number;
}

/**
 * Selects active UPI & QR code configuration in sequence based on current registration count.
 * Formula: currentIndex = Math.floor(registrationCount / threshold) % totalAccounts
 */
export function resolveActivePaymentConfig(
  event?: Partial<ECKEvent> | null,
  registrationCount: number = 0,
  overrideThreshold?: number
): ActivePaymentRotationResult {
  const threshold =
    typeof overrideThreshold === 'number' && overrideThreshold > 0
      ? overrideThreshold
      : getUpiRotationThreshold();

  // 1. Check if event has a custom rotation array saved in Supabase
  let configs: UpiPaymentConfig[] = DEFAULT_UPI_CONFIGS;

  if (Array.isArray(event?.upi_rotation_configs) && event.upi_rotation_configs.length > 0) {
    configs = event.upi_rotation_configs;
  }

  const safeCount = Math.max(0, Number(registrationCount) || 0);
  const totalAccounts = Math.max(1, configs.length);
  const currentIndex = Math.floor(safeCount / threshold) % totalAccounts;
  const activeConfig = configs[currentIndex] || configs[0] || DEFAULT_UPI_CONFIGS[0];

  return {
    activeConfig,
    currentIndex,
    accountNumber: currentIndex + 1,
    totalAccounts,
    threshold,
    registrationCount: safeCount,
  };
}
