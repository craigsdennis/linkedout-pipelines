import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";

const VISITOR_ID_COOKIE = "_lo_vid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // 400 days (Hono maximum)

/**
 * Generate a UUID v4 visitor ID
 */
function generateVisitorId(): string {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Visitor ID middleware
 * Ensures all requests have a visitor_id cookie set
 * Stores the visitor ID in the Hono context for easy access
 */
export async function visitorMiddleware(c: Context, next: Next) {
	// Check for existing visitor ID cookie
	let visitorId = getCookie(c, VISITOR_ID_COOKIE);

	// Generate new visitor ID if missing
	if (!visitorId) {
		visitorId = generateVisitorId();

		// Set cookie with security flags
		setCookie(c, VISITOR_ID_COOKIE, visitorId, {
			maxAge: COOKIE_MAX_AGE,
			path: "/",
			httpOnly: true, // Prevent JavaScript access (XSS protection)
			secure: true, // HTTPS only
			sameSite: "Lax", // Allow cross-site from GET requests
		});
	}

	// Store visitor ID in context for easy access
	c.set("visitorId", visitorId);

	await next();
}
