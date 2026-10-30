// Types for ECK Alumni Events

export interface UpiPaymentConfig {
  upi_id: string;
  qr_image_url: string;
  account_name?: string;
}

export interface ECKEvent {
  id: string;
  event_name: string;
  event_slug: string;
  event_date: string;
  event_time: string | null;
  location: string;
  description: string | null;
  registration_fee: number;
  upi_id: string | null;
  banner_image_url: string | null;
  tagline: string | null;
  theme_primary_color: string;
  theme_accent_color: string;
  qr_image_url: string | null;
  upi_rotation_configs?: UpiPaymentConfig[] | null;
  registration_closes_at?: string | null;
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'COMPLETED';
  created_at: string;
  updated_at: string;
}

export interface Alumni {
  id: string;
  name: string;
  email: string | null;
  mobile: string;
  address: string;
  country?: string;
  city: string;
  state: string;
  year_of_passing: number;
  engineering_discipline: string;
  organization: string | null;
  employment_type?: string;
  industry_domain?: string;
  professional_category: string;
  work_location: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentVerification {
  id: string;
  registration_id: string;
  upi_id: string;
  amount: number;
  payment_date?: string;
  verified_status: 'VERIFIED' | 'MISMATCH' | 'PENDING' | 'REJECTED';
  notes?: string | null;
  verified_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRegistration {
  id: string;
  registration_number: string;
  event_id: string;
  alumni_id: string;
  attendance_status: 'yes' | 'maybe' | 'no' | 'payment_pending';
  number_of_attendees: number;
  adults_count?: number;
  children_above_7_count?: number;
  children_under_7_count?: number;
  amount: number;
  payment_screenshot_path: string | null;
  photo_url?: string | null;
  id_card_generated?: boolean;
  id_card_generated_at?: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  alumni?: Alumni;
  events?: ECKEvent;
  payment_verifications?: PaymentVerification[];
}

export interface GateEntry {
  id: string;
  registration_id: string;
  event_id?: string | null;
  phone_number: string;
  attendee_name: string;
  badge_category?: string | null;
  branch?: string | null;
  year_of_passing?: number | null;
  accompanying_count: number;
  payment_status: string;
  entry_mode: 'qr_scan' | 'manual_phone' | 'spot_registration';
  verified_by?: string | null;
  entered_at: string;
  // Joined or augmented fields
  registration?: EventRegistration;
}

export interface GateVerificationResult {
  success: boolean;
  status: 'ENTERED' | 'ALREADY_ENTERED' | 'PAYMENT_PENDING' | 'NOT_FOUND' | 'INVALID_PHONE' | 'ERROR';
  message: string;
  gate_entry_id?: string;
  registration_id?: string;
  registration_number?: string;
  attendee_name?: string;
  phone_number?: string;
  badge_category?: string;
  branch?: string;
  year_of_passing?: number;
  number_of_attendees?: number;
  adults_count?: number;
  children_above_7_count?: number;
  children_under_7_count?: number;
  photo_url?: string | null;
  amount?: number;
  entered_at?: string;
  verified_by?: string;
  existing_entry?: any;
}


export interface RegistrationFormData {
  // Alumni info
  name: string;
  email: string;
  mobile: string;
  address: string;
  country: string;
  country_other?: string;
  city: string;
  state: string;
  state_other?: string;
  year_of_passing: number | '';
  engineering_discipline: string;
  engineering_discipline_other?: string;
  organization: string;
  // Professional info (Employment Type + Industry / Domain)
  employment_type: string;
  employment_type_other?: string;
  industry_domain: string;
  industry_domain_other?: string;
  work_location: string;
  // Legacy / combined
  professional_category?: string;
  // Attendance & Guest breakdown
  attendance_status: 'yes' | 'maybe' | 'no' | 'payment_pending' | '';
  number_of_attendees: number;
  adults_count?: number;
  children_above_7_count?: number;
  children_under_7_count?: number;
}

export interface RegistrationResult {
  success: boolean;
  registration_id: string;
  registration_number: string;
  alumni_id: string;
  amount: number;
  attendance_status: string;
  is_update?: boolean;
}

export interface ExistingRegistrationLookup {
  found: boolean;
  registration_id?: string;
  registration_number?: string;
  attendance_status?: 'yes' | 'maybe' | 'no' | 'payment_pending';
  number_of_attendees?: number;
  adults_count?: number;
  children_above_7_count?: number;
  children_under_7_count?: number;
  amount?: number;
  payment_screenshot_path?: string | null;
  photo_url?: string | null;
  created_at?: string;
  updated_at?: string;
  alumni?: Alumni;
  error?: string;
}

export const EMPLOYMENT_TYPES = [
  'Full-time (Private)',
  'Full-time (Government / Public Sector)',
  'Self-Employed / Business Owner',
  'Freelancer / Independent Contractor',
  'Student',
  'Retired',
  'Not Currently Employed',
  'Other',
] as const;

export const INDUSTRY_DOMAINS = [
  'Information Technology & Services',
  'Banking, Financial Services & Insurance (BFSI)',
  'Healthcare & Pharmaceuticals',
  'Manufacturing & Engineering',
  'Education & Academia',
  'Retail & E-Commerce',
  'Government & Public Administration',
  'Other',
] as const;

export const PROFESSIONAL_CATEGORIES = [
  'Government',
  'Private Sector',
  'Business / Entrepreneur',
  'Self-Employed / Freelancer',
  'Academic / Education',
  'Consultant',
  'Retired',
  'Not Currently Working',
  'Other',
] as const;

export const ENGINEERING_DISCIPLINES = [
  'Information Technology',
  'Civil',
  'Mechanical',
  'Instrumentation',
  'Electrical',
  'Computer Science',
  'Electronics & Communication',
  'Production & Industrial',
  'Aeronautical',
  'Petroleum',
  'Petrochemical',
  'Other',
] as const;

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Chandigarh', 'Puducherry', 'Jammu & Kashmir',
  'Ladakh', 'Andaman & Nicobar Islands', 'Dadra & Nagar Haveli and Daman & Diu', 'Lakshadweep',
  'Other',
] as const;

export const COUNTRY_OPTIONS = [
  { value: 'India', label: '🇮🇳 India' },
  { value: 'Other', label: '🌐 Other (International)' },
] as const;

export type SponsorshipTier =
  | 'Title Sponsor'
  | 'Associate Sponsor'
  | 'Gold Sponsor'
  | 'Silver Sponsor'
  | 'Bronze Sponsor'
  | 'Dinner & Catering'
  | 'Stage & Cultural'
  | 'Alumni Patron'
  | 'Other';

export type SponsorshipPaymentStatus = 'CONFIRMED' | 'CANCELLED';

export interface Sponsorship {
  id: string;
  event_id?: string | null;
  sponsor_name: string;
  amount: number;
  receiving_upi_id?: string | null;
  contact_person?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  payment_screenshot_path?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Legacy optional fields
  category?: string | null;
  payment_status?: SponsorshipPaymentStatus;
  payment_mode?: string | null;
  transaction_reference?: string | null;
  logo_url?: string | null;
}

export const SPONSORSHIP_TIERS: SponsorshipTier[] = [
  'Title Sponsor',
  'Associate Sponsor',
  'Gold Sponsor',
  'Silver Sponsor',
  'Bronze Sponsor',
  'Dinner & Catering',
  'Stage & Cultural',
  'Alumni Patron',
  'Other',
];

export const SPONSORSHIP_PAYMENT_MODES = [
  'UPI',
  'Bank Transfer (NEFT/RTGS)',
  'Cheque',
  'Cash',
  'Other',
] as const;

// Expense Ledger Types
export type ExpenseStatus = 'planned' | 'partially_paid' | 'paid' | 'settled' | 'cancelled';

export interface ExpensePaymentSplit {
  account: string; // e.g. 'Hari Narayan (SBI)', 'Mitesh (Axis)', 'Cash in Hand', or custom
  amount: number;
}

export interface EventExpense {
  id: string;
  event_id?: string | null;
  item_name: string;
  category: string;
  expected_amount: number;
  actual_amount: number;
  status: ExpenseStatus;
  vendor_name?: string | null;
  vendor_phone?: string | null;
  payment_mode?: string | null;
  payment_date?: string | null;
  paid_from_account?: string | null;
  payment_splits?: ExpensePaymentSplit[] | null;
  payment_screenshot_path?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export const EXPENSE_CATEGORIES = [
  'Catering & Food',
  'Tent & Infrastructure',
  'Sound, DJ & Cultural',
  'Decorations & Lighting',
  'Printing, Badges & ID Cards',
  'Mementos, Gifts & Souvenirs',
  'Photography & Videography',
  'Venue, Electricity & Logistics',
  'Marketing & Communication',
  'Miscellaneous & Contingency',
] as const;

export const EXPENSE_PAYMENT_MODES = [
  'UPI',
  'Cash',
  'Bank Transfer (NEFT/IMPS)',
  'Cheque',
  'Other',
] as const;


