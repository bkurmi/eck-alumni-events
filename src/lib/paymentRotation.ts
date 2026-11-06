import type { ECKEvent, UpiPaymentConfig } from '../types';

/**
 * Returns all active UPI and QR code configurations defined for the given event in Supabase.
 * If event has upi_rotation_configs (multiple endpoints), returns that array.
 * If event has a single upi_id, returns a single config.
 * Otherwise returns an empty array (no hardcoded fallback).
 */
export function getEventUpiConfigs(event?: Partial<ECKEvent> | null): UpiPaymentConfig[] {
  if (Array.isArray(event?.upi_rotation_configs) && event.upi_rotation_configs.length > 0) {
    return event.upi_rotation_configs;
  }
  if (event?.upi_id) {
    return [
      {
        upi_id: event.upi_id,
        qr_image_url: event.qr_image_url || undefined,
        account_name: event.event_name ? `${event.event_name} Account` : 'Event Payment Desk',
      },
    ];
  }
  return [];
}

export const CANONICAL_CASH_ACCOUNT = 'Cash in Hand';

/**
 * Checks if a given payment identifier represents physical cash collections or spot cash.
 */
export function isCashAccount(upiId?: string | null): boolean {
  if (!upiId) return false;
  const lower = upiId.toLowerCase().trim();
  return (
    lower === 'cash' ||
    lower === 'cash in hand' ||
    lower === 'cash_in_hand' ||
    lower === 'cash_handover' ||
    lower === 'cash handover' ||
    lower === 'spot cash' ||
    lower === 'spot_cash' ||
    lower === 'spot' ||
    lower === 'cash in hand / spot cash' ||
    lower === 'cash handover / direct' ||
    lower.includes('cash in hand') ||
    lower === 'cash_direct'
  );
}

/**
 * Resolves a human-friendly display name for an event's receiving UPI ID.
 * Looks inside the event's upi_rotation_configs or formats the handle before @.
 */
export function getUpiAccountName(
  upiId?: string | null,
  event?: Partial<ECKEvent> | null
): string {
  if (!upiId) return '';
  if (isCashAccount(upiId)) return CANONICAL_CASH_ACCOUNT;
  const normalized = upiId.toLowerCase().trim();

  // 1. Check if event has a custom account_name for this UPI ID in upi_rotation_configs
  if (Array.isArray(event?.upi_rotation_configs)) {
    const match = event.upi_rotation_configs.find(
      (c) => (c.upi_id || '').toLowerCase().trim() === normalized
    );
    if (match && match.account_name) {
      return match.account_name;
    }
  }

  // 2. Check if event has expense_accounts_config with an account for this UPI ID
  if (Array.isArray((event as any)?.expense_accounts_config)) {
    const match = (event as any).expense_accounts_config.find(
      (c: any) => (c.upiId || '').toLowerCase().trim() === normalized
    );
    if (match && (match.accountName || match.label)) {
      return match.accountName || match.label;
    }
  }

  // 3. Fallback: extract identifier before @
  const handle = normalized.split('@')[0];
  if (handle) {
    return handle.charAt(0).toUpperCase() + handle.slice(1);
  }
  return normalized;
}

// Deprecated empty map kept only for type-safe backward compatibility
export const UPI_ACCOUNT_NAMES: Record<string, string> = {};

// Deprecated empty list kept only for type-safe backward compatibility
export const DEFAULT_UPI_CONFIGS: UpiPaymentConfig[] = [];

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

  const configs = getEventUpiConfigs(event);
  const safeCount = Math.max(0, Number(registrationCount) || 0);

  if (configs.length === 0) {
    return {
      activeConfig: {
        upi_id: '',
        qr_image_url: undefined,
        account_name: 'Payment Desk (Unconfigured)',
      },
      currentIndex: 0,
      accountNumber: 1,
      totalAccounts: 1,
      threshold,
      registrationCount: safeCount,
    };
  }

  const totalAccounts = Math.max(1, configs.length);
  const currentIndex = Math.floor(safeCount / threshold) % totalAccounts;
  const activeConfig = configs[currentIndex] || configs[0];

  return {
    activeConfig,
    currentIndex,
    accountNumber: currentIndex + 1,
    totalAccounts,
    threshold,
    registrationCount: safeCount,
  };
}
