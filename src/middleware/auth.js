import { getUserFromAccessJWT } from "../utils/cloudflare-access";
import { getUser, createUser } from "../utils/auth";
/**
 * Middleware to check authentication via Cloudflare Access
 * Extracts user from JWT, auto-creates user on first login
 */
export const authMiddleware = async (c, next) => {
    // Get JWT from Cloudflare Access header
    const jwtHeader = c.req.header('Cf-Access-Jwt-Assertion');
    console.log('Auth middleware - Request path:', c.req.path);
    console.log('Auth middleware - JWT header present?', !!jwtHeader);
    if (jwtHeader) {
        console.log('Auth middleware - JWT header length:', jwtHeader.length);
        console.log('Auth middleware - JWT header preview:', jwtHeader.substring(0, 50) + '...');
    }
    const userInfo = getUserFromAccessJWT(jwtHeader);
    console.log('Auth middleware - User info extracted?', !!userInfo);
    if (userInfo) {
        console.log('Auth middleware - User email:', userInfo.email);
        console.log('Auth middleware - User name:', userInfo.name);
    }
    if (!userInfo) {
        console.error('No valid Cloudflare Access JWT found');
        console.error('Request path:', c.req.path);
        console.error('JWT header present?', !!jwtHeader);
        if (jwtHeader) {
            console.error('JWT preview:', jwtHeader.substring(0, 100));
        }
        console.error('All headers:', Object.fromEntries(c.req.raw.headers.entries()));
        // Return 401 with helpful error page (do NOT redirect to avoid loops)
        return c.html(`<!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Required - LinkedOut</title>
          <link rel="stylesheet" href="/styles.css">
          <style>
            body { font-family: system-ui; max-width: 700px; margin: 60px auto; padding: 20px; }
            h1 { color: #f38020; text-align: center; }
            .error { background: #fee; border: 1px solid #fcc; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .info { background: #e3f2fd; border: 1px solid #90caf9; padding: 15px; border-radius: 8px; margin: 20px 0; }
            ul { line-height: 1.8; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
            a { color: #0066cc; }
          </style>
        </head>
        <body>
          <h1>🔒 Authentication Required</h1>
          
          <div class="error">
            <p><strong>No Cloudflare Access JWT found</strong></p>
            <p>This dashboard requires authentication via Cloudflare Access.</p>
          </div>

          <div class="info">
            <p><strong>For administrators:</strong></p>
            <p>Cloudflare Access needs to be configured for this Worker:</p>
            <ol style="text-align: left; line-height: 1.8;">
              <li>Go to <strong>Zero Trust Dashboard</strong> → <strong>Access</strong> → <strong>Applications</strong></li>
              <li>Create a new Application for this domain</li>
              <li>Set the application to protect <code>/dashboard/*</code> paths</li>
              <li>Add GitHub (or other) as an identity provider</li>
              <li>Create a policy to allow authenticated users</li>
            </ol>
          </div>

          <p style="text-align: center; margin-top: 30px;">
            <a href="/">← Back to Homepage</a> | 
            <a href="https://craigsone.cloudflareaccess.com/cdn-cgi/access/logout">Logout from Access</a>
          </p>
        </body>
      </html>`, 401);
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
export const adminMiddleware = async (c, next) => {
    await authMiddleware(c, async () => { });
    const isAdmin = c.get("isAdmin");
    if (!isAdmin) {
        return c.html(`<h1>403 - Access Denied</h1>
       <p>Admin access required.</p>
       <a href="/dashboard">Back to Dashboard</a>`, 403);
    }
    await next();
};
