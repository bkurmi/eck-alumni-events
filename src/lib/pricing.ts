// Pricing logic managed entirely in repository

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
 * Calculates total reunion contribution based on attendee composition:
 * - 1 Adult: ₹800
 * - Couple (2 Adults): ₹1,500
 * - >2 Adults: ₹1,500 (couple) + ₹800 for each additional adult
 * - Kids under 10: Free (₹0)
 * - Kids above 10: ₹300 per child
 */
export function calculateContribution(
  adults: number = 1,
  kidsAbove7: number = 0,
  kidsUnder7: number = 0
): PricingBreakdown {
  const safeAdults = Math.max(0, Math.floor(adults || 0));
  const safeKidsAbove7 = Math.max(0, Math.floor(kidsAbove7 || 0));
  const safeKidsUnder7 = Math.max(0, Math.floor(kidsUnder7 || 0));

  let adultsAmount = 0;
  const items: PricingBreakdownItem[] = [];

  if (safeAdults === 1) {
    adultsAmount = PRICING_RULES.SINGLE_ADULT;
    items.push({
      label: 'Single Adult',
      count: 1,
      rateDescription: '₹800',
      amount: PRICING_RULES.SINGLE_ADULT,
    });
  } else if (safeAdults === 2) {
    adultsAmount = PRICING_RULES.COUPLE;
    items.push({
      label: 'Couple (2 Adults)',
      count: 2,
      rateDescription: 'Special couple contribution',
      amount: PRICING_RULES.COUPLE,
    });
  } else if (safeAdults > 2) {
    const extraAdults = safeAdults - 2;
    const extraAmount = extraAdults * PRICING_RULES.EXTRA_ADULT;
    adultsAmount = PRICING_RULES.COUPLE + extraAmount;

    items.push({
      label: 'Couple (First 2 Adults)',
      count: 2,
      rateDescription: '₹1,500 base',
      amount: PRICING_RULES.COUPLE,
    });
    items.push({
      label: `Additional Adult${extraAdults > 1 ? 's' : ''}`,
      count: extraAdults,
      rateDescription: `${extraAdults} × ₹${PRICING_RULES.EXTRA_ADULT}`,
      amount: extraAmount,
    });
  }

  const kidsAbove7Amount = safeKidsAbove7 * PRICING_RULES.KID_ABOVE_7;
  if (safeKidsAbove7 > 0) {
    items.push({
      label: `Child${safeKidsAbove7 > 1 ? 'ren' : ''} (10+ yrs)`,
      count: safeKidsAbove7,
      rateDescription: `${safeKidsAbove7} × ₹${PRICING_RULES.KID_ABOVE_7}`,
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
 * Calculates Spot Entry contribution at event gate:
 * - ₹1,000 per adult (flat, no couple discounts)
 * - ₹500 per child above 10 years
 * - Free (₹0) for children under 10 years
 * Note: Applied ONLY for Spot Entry Walk-ins at the gate desk.
 */
export function calculateSpotContribution(
  adults: number = 1,
  kidsAbove10: number = 0,
  kidsUnder10: number = 0
): PricingBreakdown {
  const safeAdults = Math.max(0, Math.floor(adults || 0));
  const safeKidsAbove10 = Math.max(0, Math.floor(kidsAbove10 || 0));
  const safeKidsUnder10 = Math.max(0, Math.floor(kidsUnder10 || 0));

  const adultsAmount = safeAdults * SPOT_PRICING_RULES.ADULT;
  const kidsAbove10Amount = safeKidsAbove10 * SPOT_PRICING_RULES.KID_ABOVE_10;
  const kidsUnder10Amount = 0;

  const items: PricingBreakdownItem[] = [];

  if (safeAdults > 0) {
    items.push({
      label: safeAdults === 1 ? 'Spot Entry (1 Adult)' : `Spot Entry (${safeAdults} Adults)`,
      count: safeAdults,
      rateDescription: safeAdults === 1 ? '₹1,000 per adult' : `${safeAdults} × ₹1,000`,
      amount: adultsAmount,
    });
  }

  if (safeKidsAbove10 > 0) {
    items.push({
      label: `Child${safeKidsAbove10 > 1 ? 'ren' : ''} (10+ yrs)`,
      count: safeKidsAbove10,
      rateDescription: `${safeKidsAbove10} × ₹500`,
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

