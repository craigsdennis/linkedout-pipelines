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

// Link stored in D1
export interface Link {
  slug: string;
  title: string | null;
  content: string;
  theme_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Link with maintainers list
export interface LinkWithMaintainers extends Link {
  maintainers: string[];
}

// Link maintainer junction table record
export interface LinkMaintainer {
  link_slug: string;
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

// Auth token stored in KV
export interface AuthToken {
  email: string;
  created_at: string;
  expires_at: string;
}

// Magic link email payload
export interface MagicLinkEmail {
  to: string;
  token: string;
  expires_in_minutes: number;
}
