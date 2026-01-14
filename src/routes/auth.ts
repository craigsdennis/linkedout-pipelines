import { Hono } from "hono";
import { html } from "hono/html";
import { AuthLayout } from "../views/layouts";

const auth = new Hono<{ Bindings: Env }>();

/**
 * Login page - shows message and link to dashboard
 * Cloudflare Access handles authentication when user clicks through
 */
auth.get("/login", (c) => {
  return c.html(
    AuthLayout({
      title: "Login",
      children: html`
        <style>
          .auth-layout { 
            font-family: system-ui; 
            max-width: 600px; 
            margin: 100px auto; 
            padding: 20px; 
            text-align: center; 
          }
          h1 { color: #f38020; }
          .cta { 
            display: inline-block; 
            padding: 12px 24px; 
            background: #0066cc; 
            color: white; 
            text-decoration: none; 
            border-radius: 6px; 
            margin: 20px 0;
            font-size: 16px;
          }
          .cta:hover { background: #0052a3; }
        </style>
        <h1>Welcome to LinkedOut</h1>
        <p>Share links, track clicks, and manage your content.</p>
        <a href="/dashboard" class="cta">Continue to Dashboard</a>
        <p style="font-size: 14px; color: #666; margin-top: 40px;">
          You'll be asked to authenticate via Cloudflare Access
        </p>
      `,
    })
  );
});

/**
 * Logout - redirect to Cloudflare Access logout
 * This clears the Cloudflare Access session
 */
auth.get("/logout", async (c) => {
  return c.redirect(`https://${c.env.CLOUDFLARE_ACCESS_APPLICATION}.cloudflareaccess.com/cdn-cgi/access/logout`);
});

export default auth;
