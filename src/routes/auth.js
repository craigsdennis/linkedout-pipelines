import { Hono } from "hono";
const auth = new Hono();
/**
 * Login page - shows message and link to dashboard
 * Cloudflare Access handles authentication when user clicks through
 */
auth.get("/login", (c) => {
    return c.html(`<!DOCTYPE html>
    <html>
      <head>
        <title>Login - LinkedOut</title>
        <link rel="stylesheet" href="/styles.css">
        <style>
          body { font-family: system-ui; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center; }
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
      </head>
      <body>
        <h1>Welcome to LinkedOut</h1>
        <p>Share links, track clicks, and manage your content.</p>
        <a href="/dashboard" class="cta">Continue to Dashboard</a>
        <p style="font-size: 14px; color: #666; margin-top: 40px;">
          You'll be asked to authenticate via Cloudflare Access
        </p>
      </body>
    </html>`);
});
/**
 * Logout - redirect to Cloudflare Access logout
 * This clears the Cloudflare Access session
 */
auth.get("/logout", async (c) => {
    return c.redirect("https://craigsone.cloudflareaccess.com/cdn-cgi/access/logout");
});
export default auth;
