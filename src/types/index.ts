// Types for ECK Alumni Events

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

export interface EventRegistration {
  id: string;
  registration_number: string;
  event_id: string;
  alumni_id: string;
  attendance_status: 'yes' | 'maybe' | 'no';
  number_of_attendees: number;
  amount: number;
  payment_screenshot_path: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  alumni?: Alumni;
  events?: ECKEvent;
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
  // Attendance
  attendance_status: 'yes' | 'maybe' | 'no' | '';
  number_of_attendees: number;
}

export interface RegistrationResult {
  success: boolean;
  registration_id: string;
  registration_number: string;
  alumni_id: string;
  amount: number;
  attendance_status: string;
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

