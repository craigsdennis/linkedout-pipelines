import { Hono } from "hono";
import type { ClickEvent } from "../types";
import { getCfProperties } from "../utils/helpers";
import { getLinkFromDB } from "../utils/db";

const tracking = new Hono<{ Bindings: CloudflareBindings }>();

// API endpoint for tracking clicks
tracking.post("/api/track", async (c) => {
  const payload = await c.req.json<{
    url: string;
    out: string | null;
    link_text?: string | null;
    visitor_id?: string;
  }>();

  // Extract slug from URL
  const url = new URL(payload.url);
  const match = url.pathname.match(/^\/out\/([^/]+)/);
  if (!match) {
    return c.body(null, 204);
  }

  const slug = match[1];
  const link = await getLinkFromDB(c.env.DB, slug);
  if (!link) {
    return c.body(null, 204);
  }

  const clickEvent: ClickEvent = {
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

  // Write to pipeline
  await c.env.CLICK_STREAM.send([clickEvent]);

  return c.body(null, 204);
});

export default tracking;
