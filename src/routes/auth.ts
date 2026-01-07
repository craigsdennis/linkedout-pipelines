import { Hono } from "hono";
import { BaseLayout } from "../views/layouts";

const auth = new Hono<{ Bindings: CloudflareBindings }>();

/**
 * Login page - redirects to dashboard
 * Cloudflare Access handles authentication automatically
 */
auth.get("/login", (c) => {
  return c.redirect("/dashboard");
});

/**
 * Logout - redirect to Cloudflare Access logout
 * This clears the Cloudflare Access session
 */
auth.get("/logout", async (c) => {
  return c.redirect("https://craigsone.cloudflareaccess.com/cdn-cgi/access/logout");
});

export default auth;
