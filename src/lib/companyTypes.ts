// src/lib/companyTypes.ts

export interface Company {
  id: string;
  sellsy_id: string | null;
  type: string | null;
  name: string;
  reference: string | null;
  legal_form: string | null;
  rate_category: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  fax: string | null;
  website: string | null;
  vat_number: string | null;
  naf_code: string | null;
  share_capital: string | null;
  rcs: string | null;
  employee_count: string | null;
  siret: string | null;
  siren: string | null;
  notes: string | null;
  smart_tags: string[] | null;
  owner: string | null;
  third_party_account: string | null;
  auxiliary_account: string | null;
  subscribed_email: boolean;
  subscribed_sms: boolean;
  subscribed_phone: boolean;
  subscribed_mail: boolean;
  subscribed_custom: boolean;
  archived: boolean;
  company_type: string | null;
  sellsy_created_at: string | null;
  // App-specific fields
  sellsy_client_id: string | null;
  client_data_mode: "sellsy" | "custom";
  onboarding_status: string | null;
  current_step: number | null;
  pricing_tier_id: string | null;
  min_order_kg: number | null;
  payment_terms: string | null;
  preferred_delivery_days: string[] | null;
  delivery_time_window: string | null;
  delivery_instructions: string | null;
  coffee_type: string | null;
  estimated_weekly_volume: number | null;
  grinder_type: string | null;
  admin_notes: string | null;
  last_synced_at: string | null;
  legal_company_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyAddress {
  id: string;
  company_id: string;
  sellsy_address_id: string | null;
  label: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_line3: string | null;
  address_line4: string | null;
  postal_code: string | null;
  city: string | null;
  state_province: string | null;
  country_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  company_id: string | null;
  user_id: string | null;
  sellsy_contact_id: string | null;
  civility: string | null;
  is_primary: boolean;
  is_billing: boolean;
  is_dunning: boolean;
  last_name: string;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  fax: string | null;
  website: string | null;
  job_title: string | null;
  smart_tags: string[] | null;
  notes: string | null;
  subscribed_email: boolean;
  subscribed_sms: boolean;
  subscribed_phone: boolean;
  subscribed_mail: boolean;
  subscribed_custom: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Helper: returns the display name for a company */
export function companyDisplayName(company: Pick<Company, "name" | "legal_company_name">): string {
  return company.name;
}

/** Helper: returns the resolved company name/email for display in a dropdown */
export function contactDisplayLabel(contact: Contact): string {
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  return fullName || contact.email || contact.id.slice(0, 8);
}

/** Helper: resolves the effective field value respecting client_data_mode */
export function resolveCompanyField(
  company: Company,
  field: "name" | "email" | "phone"
): string {
  return company[field] ?? "—";
}
