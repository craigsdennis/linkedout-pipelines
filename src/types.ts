// Click tracking event that goes into the pipeline
export interface ClickEvent {
  timestamp: string;
  url: string;
  out: string | null;
  slug: string;
  owner_email: string;
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

// Link stored in KV
export interface Link {
  slug: string;
  content: string; // markdown content
  owner_email: string;
  created_at: string;
  updated_at: string;
  custom_css?: string;
  qr_code?: string;
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
