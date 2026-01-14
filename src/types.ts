// API payload from client-side tracking script
export interface TrackingPayload {
  url: string;
  out: string | null;
  link_text?: string | null;
  visitor_id?: string;
}

// Click tracking event that goes into the pipeline (v6 - no owner_email)
export interface ClickEvent {
  timestamp: string;
  url: string;
  out: string | null;
  link_text?: string; // the anchor text that was clicked
  slug: string;
  visitor_id?: string;
  user_agent?: string;
  referer?: string;
  event_type: 'click' | 'qr_scan' | 'page_view';
  // Cloudflare request metadata
  country?: string;
  city?: string;
  region?: string; // state/province
  colo?: string; // Cloudflare data center code
  latitude?: string;
  longitude?: string;
  timezone?: string;
  [key: string]: any; // Index signature for Pipeline compatibility
}

// Outie (page) stored in D1
export interface Outie {
  slug: string;
  title: string | null;
  content: string;
  theme_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  custom_css: string | null;
}

// Outie with maintainers list
export interface OutieWithMaintainers extends Outie {
  maintainers: string[];
}

// Outie maintainer junction table record
export interface OutieMaintainer {
  link_slug: string; // Database column is still called link_slug
  user_email: string;
  added_at: string;
  added_by: string | null;
}

// Theme stored in D1
export interface Theme {
  id: string;
  name: string;
  description: string | null;
  css_variables: Record<string, string>; // Parsed JSON object
  additional_css: string | null;
  created_by: string | null;
  is_public: boolean;
  created_at: string;
}

// User stored in KV
export interface User {
  email: string;
  created_at: string;
  is_admin: boolean;
}


