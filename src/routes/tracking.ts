import { Hono } from "hono";
import type { ClickEvent, Link } from "../types";
import { getCfProperties } from "../utils/helpers";

const tracking = new Hono<{ Bindings: CloudflareBindings }>();

// API endpoint for tracking clicks
tracking.post("/api/track", async (c) => {
  const payload = await c.req.json<{
    url: string;
    out: string | null;
    visitor_id?: string;
  }>();

  // Extract slug from URL
  const url = new URL(payload.url);
  const match = url.pathname.match(/^\/out\/([^/]+)/);
  if (!match) {
    return c.body(null, 204);
  }

  const slug = match[1];
  const linkStr = await c.env.LINKS.get(`link:${slug}`);
  if (!linkStr) {
    return c.body(null, 204);
  }

  const link: Link = JSON.parse(linkStr);

  const clickEvent: ClickEvent = {
    timestamp: new Date().toISOString(),
    url: payload.url,
    out: payload.out,
    slug: link.slug,
    owner_email: link.owner_email,
    visitor_id: payload.visitor_id,
    user_agent: c.req.header("user-agent"),
    referer: c.req.header("referer"),
    event_type: "click",
    ...getCfProperties(c.req.raw),
  };

  // Write to pipeline
  await c.env.CLICK_STREAM.send([clickEvent]);

  return c.body(null, 204);
});

export default tracking;
