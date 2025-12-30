import { getCookie } from "hono/cookie";
import type { ClickEvent } from "../types";

// Helper to extract Cloudflare request metadata
export function getCfProperties(request: Request): Partial<ClickEvent> {
  const cf = (request as any).cf;
  if (!cf) return {};
  
  return {
    country: cf.country || undefined,
    city: cf.city || undefined,
    region: cf.region || cf.regionCode || undefined,
    colo: cf.colo || undefined,
    latitude: cf.latitude || undefined,
    longitude: cf.longitude || undefined,
    timezone: cf.timezone || undefined,
  };
}

// Helper to get visitor ID from cookie
export function getVisitorId(c: any): string | undefined {
  return getCookie(c, "_lo_vid");
}
