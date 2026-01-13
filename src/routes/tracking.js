import { Hono } from "hono";
import { waitUntil } from "cloudflare:workers";
import { getCfProperties } from "../utils/helpers";
import { getLink } from "../utils/db";
const tracking = new Hono();
// API endpoint for tracking clicks
tracking.post("/api/track", async (c) => {
    const payload = await c.req.json();
    // Extract slug from URL
    const url = new URL(payload.url);
    const match = url.pathname.match(/^\/out\/([^/]+)/);
    if (!match) {
        return c.body(null, 204);
    }
    const slug = match[1];
    const link = await getLink(slug);
    if (!link) {
        return c.body(null, 204);
    }
    const clickEvent = {
        timestamp: new Date().toISOString(),
        url: payload.url,
        out: payload.out,
        link_text: payload.link_text || undefined,
        slug: link.slug,
        visitor_id: payload.visitor_id,
        user_agent: c.req.header("user-agent"),
        referer: c.req.header("referer"),
        event_type: "click",
        ...getCfProperties(c.req.raw),
    };
    // Track click asynchronously (don't block response)
    waitUntil(c.env.CLICK_STREAM.send([clickEvent]));
    return c.body(null, 204);
});
export default tracking;
