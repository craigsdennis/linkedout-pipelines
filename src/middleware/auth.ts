import { getUserFromAccessJWT } from "../utils/cloudflare-access";
import { getUser, createUser } from "../utils/auth";

/**
 * Middleware to check authentication via Cloudflare Access
 * Extracts user from JWT, auto-creates user on first login
 */
export const authMiddleware = async (c: any, next: any) => {
  // Get JWT from Cloudflare Access header
  const jwtHeader = c.req.header('Cf-Access-Jwt-Assertion');
  const userInfo = getUserFromAccessJWT(jwtHeader);
  
  if (!userInfo) {
    console.error('No valid Cloudflare Access JWT found');
    console.error('Headers:', Object.fromEntries(c.req.raw.headers.entries()));
    return c.html(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Required - LinkedOut</title>
          <style>
            body { font-family: system-ui; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center; }
            h1 { color: #f38020; }
            p { color: #666; line-height: 1.6; }
            .error { background: #fee; border: 1px solid #fcc; padding: 15px; border-radius: 8px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1>🔒 Authentication Required</h1>
          <div class="error">
            <p><strong>No Cloudflare Access JWT found</strong></p>
            <p>This application requires Cloudflare Access authentication.</p>
          </div>
          <p>If you're seeing this error:</p>
          <ul style="text-align: left;">
            <li>Make sure Cloudflare Access is configured for this application</li>
            <li>Check that your Access policy includes this route</li>
            <li>Try logging out and logging back in</li>
          </ul>
          <p><a href="https://craigsone.cloudflareaccess.com/cdn-cgi/access/logout">Logout from Cloudflare Access</a></p>
        </body>
      </html>`,
      401
    );
  }
  
  // Check if user exists, create if first login
  let user = await getUser(userInfo.email);
  if (!user) {
    console.log('First login for user:', userInfo.email);
    user = await createUser(userInfo.email, false); // Not admin by default
  }
  
  // Set user context for use in routes
  c.set("userEmail", userInfo.email);
  c.set("userName", userInfo.name);
  c.set("isAdmin", user.is_admin);
  
  await next();
};

/**
 * Middleware to check admin authorization
 * Must be used after authMiddleware
 */
export const adminMiddleware = async (c: any, next: any) => {
  await authMiddleware(c, async () => {});
  
  const isAdmin = c.get("isAdmin");
  if (!isAdmin) {
    return c.html(
      `<h1>403 - Access Denied</h1>
       <p>Admin access required.</p>
       <a href="/dashboard">Back to Dashboard</a>`,
      403
    );
  }
  
  await next();
};
