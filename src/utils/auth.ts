import { env } from "cloudflare:workers";
import type { AuthToken, User } from "../types";

export async function generateToken(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createAuthToken(email: string): Promise<string> {
  const token = await generateToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

  const authToken: AuthToken = {
    email,
    created_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  // Store token -> email mapping
  await env.AUTH_TOKENS.put(token, JSON.stringify(authToken), {
    expirationTtl: 60 * 60 * 24, // 24 hours
  });

  return token;
}

export async function verifyToken(token: string): Promise<string | null> {
  const authTokenStr = await env.AUTH_TOKENS.get(token);
  if (!authTokenStr) return null;

  const authToken: AuthToken = JSON.parse(authTokenStr);
  
  // Check if expired
  if (new Date(authToken.expires_at) < new Date()) {
    await env.AUTH_TOKENS.delete(token);
    return null;
  }

  return authToken.email;
}

export async function getUser(email: string): Promise<User | null> {
  const userStr = await env.USERS.get(`user:${email}`);
  if (!userStr) return null;
  return JSON.parse(userStr);
}

export async function createUser(
  email: string,
  isAdmin: boolean
): Promise<User> {
  const user: User = {
    email,
    created_at: new Date().toISOString(),
    is_admin: isAdmin,
  };

  await env.USERS.put(`user:${email}`, JSON.stringify(user));
  return user;
}

export async function isUserAuthorized(email: string): Promise<boolean> {
  const user = await getUser(email);
  return user !== null;
}
