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
    return c.redirect("/login");
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
