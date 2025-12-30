import { getCookie } from "hono/cookie";
import { verifyToken } from "../utils/auth";

// Middleware to check authentication
export const authMiddleware = async (c: any, next: any) => {
  const token = getCookie(c, "auth_token");
  if (!token) {
    return c.redirect("/login");
  }

  const email = await verifyToken(token);
  if (!email) {
    return c.redirect("/login");
  }

  c.set("userEmail", email);
  await next();
};
