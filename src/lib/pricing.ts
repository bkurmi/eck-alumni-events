// Pricing logic managed entirely in repository
import type { EventPricingConfig } from '../types';

export interface PricingBreakdownItem {
  label: string;
  count: number;
  rateDescription: string;
  amount: number;
  isFree?: boolean;
}

export interface PricingBreakdown {
  adults: number;
  kidsAbove7: number;
  kidsUnder7: number;
  adultsAmount: number;
  kidsAbove7Amount: number;
  kidsUnder7Amount: number;
  totalAttendees: number;
  totalAmount: number;
  items: PricingBreakdownItem[];
}

export const PRICING_RULES = {
  SINGLE_ADULT: 800,
  COUPLE: 1500,
  EXTRA_ADULT: 800,
  KID_ABOVE_7: 300,
  KID_UNDER_7: 0,
} as const;

export const SPOT_PRICING_RULES = {
  ADULT: 1000,
  KID_ABOVE_10: 500,
  KID_UNDER_10: 0,
} as const;

/**
 * Returns a formatted summary string for UI badges (e.g., "₹800 Single · ₹1,500 Couple · ₹300 Kids (10+) · Free (<10)")
 */
export function formatPricingPillSummary(
  pricingConfig?: EventPricingConfig | null,
  baseFee?: number
): string {
  const single = pricingConfig?.single_adult ?? (typeof baseFee === 'number' && baseFee > 0 ? baseFee : PRICING_RULES.SINGLE_ADULT);
  const couple = pricingConfig?.couple ?? (single > 0 ? single * 2 - 100 : PRICING_RULES.COUPLE);
  const kid = pricingConfig?.child_above_7 ?? (pricingConfig as any)?.child_above_10 ?? Math.round(single * 0.375);
  return `₹${single.toLocaleString('en-IN')} Single · ₹${couple.toLocaleString('en-IN')} Couple · ₹${kid.toLocaleString('en-IN')} Kids (10+) · Free (<10)`;
}

/**
 * Calculates total reunion contribution based on attendee composition and event pricing config.
 * Rate strictly derives from event's pricing_config or event's baseFee (e.g. ₹900) before any fallback.
 */
export function calculateContribution(
  adults: number = 1,
  kidsAbove7: number = 0,
  kidsUnder7: number = 0,
  pricingConfig?: EventPricingConfig | null,
  baseFee?: number
): PricingBreakdown {
  const safeAdults = Math.max(0, Math.floor(adults || 0));
  const safeKidsAbove7 = Math.max(0, Math.floor(kidsAbove7 || 0));
  const safeKidsUnder7 = Math.max(0, Math.floor(kidsUnder7 || 0));

  const singleAdultRate = pricingConfig?.single_adult ?? (typeof baseFee === 'number' && baseFee > 0 ? baseFee : PRICING_RULES.SINGLE_ADULT);
  const coupleRate = pricingConfig?.couple ?? (singleAdultRate > 0 ? singleAdultRate * 2 - 100 : PRICING_RULES.COUPLE);
  const extraAdultRate = pricingConfig?.extra_adult ?? singleAdultRate;
  const kidAbove7Rate = pricingConfig?.child_above_7 ?? (pricingConfig as any)?.child_above_10 ?? Math.round(singleAdultRate * 0.375);

  let adultsAmount = 0;
  const items: PricingBreakdownItem[] = [];

  if (safeAdults === 1) {
    adultsAmount = singleAdultRate;
    items.push({
      label: 'Single Adult',
      count: 1,
      rateDescription: `₹${singleAdultRate.toLocaleString('en-IN')}`,
      amount: singleAdultRate,
    });
  } else if (safeAdults === 2) {
    adultsAmount = coupleRate;
    items.push({
      label: 'Couple (2 Adults)',
      count: 2,
      rateDescription: `₹${coupleRate.toLocaleString('en-IN')}`,
      amount: coupleRate,
    });
  } else if (safeAdults > 2) {
    const extraAdults = safeAdults - 2;
    const extraAmount = extraAdults * extraAdultRate;
    adultsAmount = coupleRate + extraAmount;

    items.push({
      label: 'Couple (First 2 Adults)',
      count: 2,
      rateDescription: `₹${coupleRate.toLocaleString('en-IN')} base`,
      amount: coupleRate,
    });
    items.push({
      label: `Additional Adult${extraAdults > 1 ? 's' : ''}`,
      count: extraAdults,
      rateDescription: `${extraAdults} × ₹${extraAdultRate.toLocaleString('en-IN')}`,
      amount: extraAmount,
    });
  }

  const kidsAbove7Amount = safeKidsAbove7 * kidAbove7Rate;
  if (safeKidsAbove7 > 0) {
    items.push({
      label: `Child${safeKidsAbove7 > 1 ? 'ren' : ''} (10+ yrs)`,
      count: safeKidsAbove7,
      rateDescription: `${safeKidsAbove7} × ₹${kidAbove7Rate.toLocaleString('en-IN')}`,
      amount: kidsAbove7Amount,
    });
  }

  const kidsUnder7Amount = 0;
  if (safeKidsUnder7 > 0) {
    items.push({
      label: `Child${safeKidsUnder7 > 1 ? 'ren' : ''} (<10 yrs)`,
      count: safeKidsUnder7,
      rateDescription: 'Complimentary',
      amount: 0,
      isFree: true,
    });
  }

  const totalAttendees = safeAdults + safeKidsAbove7 + safeKidsUnder7;
  const totalAmount = adultsAmount + kidsAbove7Amount;

  return {
    adults: safeAdults,
    kidsAbove7: safeKidsAbove7,
    kidsUnder7: safeKidsUnder7,
    adultsAmount,
    kidsAbove7Amount,
    kidsUnder7Amount,
    totalAttendees,
    totalAmount,
    items,
  };
}

/**
 * Calculates Spot Entry contribution at event gate with optional event pricing config
 */
export function calculateSpotContribution(
  adults: number = 1,
  kidsAbove10: number = 0,
  kidsUnder10: number = 0,
  pricingConfig?: EventPricingConfig | null,
  baseFee?: number
): PricingBreakdown {
  const safeAdults = Math.max(0, Math.floor(adults || 0));
  const safeKidsAbove10 = Math.max(0, Math.floor(kidsAbove10 || 0));
  const safeKidsUnder10 = Math.max(0, Math.floor(kidsUnder10 || 0));

  const spotAdultRate = pricingConfig?.spot_adult ?? (typeof baseFee === 'number' && baseFee > 0 ? Math.round(baseFee * 1.25) : SPOT_PRICING_RULES.ADULT);
  const spotKidAbove10Rate = pricingConfig?.spot_child_above_10 ?? Math.round(spotAdultRate * 0.5);

  const adultsAmount = safeAdults * spotAdultRate;
  const kidsAbove10Amount = safeKidsAbove10 * spotKidAbove10Rate;
  const kidsUnder10Amount = 0;

  const items: PricingBreakdownItem[] = [];

  if (safeAdults > 0) {
    items.push({
      label: safeAdults === 1 ? 'Spot Entry (1 Adult)' : `Spot Entry (${safeAdults} Adults)`,
      count: safeAdults,
      rateDescription: safeAdults === 1 ? `₹${spotAdultRate.toLocaleString('en-IN')} per adult` : `${safeAdults} × ₹${spotAdultRate.toLocaleString('en-IN')}`,
      amount: adultsAmount,
    });
  }

  if (safeKidsAbove10 > 0) {
    items.push({
      label: `Child${safeKidsAbove10 > 1 ? 'ren' : ''} (10+ yrs)`,
      count: safeKidsAbove10,
      rateDescription: `${safeKidsAbove10} × ₹${spotKidAbove10Rate.toLocaleString('en-IN')}`,
      amount: kidsAbove10Amount,
    });
  }

  if (safeKidsUnder10 > 0) {
    items.push({
      label: `Child${safeKidsUnder10 > 1 ? 'ren' : ''} (<10 yrs)`,
      count: safeKidsUnder10,
      rateDescription: 'Complimentary (Free)',
      amount: 0,
      isFree: true,
    });
  }

  const totalAttendees = safeAdults + safeKidsAbove10 + safeKidsUnder10;
  const totalAmount = adultsAmount + kidsAbove10Amount;

  return {
    adults: safeAdults,
    kidsAbove7: safeKidsAbove10,
    kidsUnder7: safeKidsUnder10,
    adultsAmount,
    kidsAbove7Amount: kidsAbove10Amount,
    kidsUnder7Amount: kidsUnder10Amount,
    totalAttendees,
    totalAmount,
    items,
  };
}

