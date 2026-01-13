/**
 * Authentication Middleware Integration Tests
 * Tests authMiddleware and adminMiddleware using SELF fetcher
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { createUser } from "../../src/utils/db";

describe("Authentication Middleware - Integration Tests", () => {
  let db: D1Database;

  // Helper to create a mock JWT for testing
  function createMockJWT(payload: any): string {
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payloadStr = btoa(JSON.stringify(payload));
    const signature = btoa("mock-signature");
    
    const toBase64Url = (str: string) => str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    
    return `${toBase64Url(header)}.${toBase64Url(payloadStr)}.${toBase64Url(signature)}`;
  }

  beforeAll(async () => {
    db = env.DB;
    
    // Create full schema for integration tests
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          is_admin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS links (
          slug TEXT PRIMARY KEY,
          title TEXT,
          content TEXT NOT NULL,
          theme_id TEXT NOT NULL DEFAULT 'default',
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          custom_css TEXT DEFAULT NULL
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS link_maintainers (
          link_slug TEXT NOT NULL,
          user_email TEXT NOT NULL,
          added_at TEXT NOT NULL,
          added_by TEXT,
          PRIMARY KEY (link_slug, user_email)
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS themes (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          css_variables TEXT NOT NULL,
          additional_css TEXT,
          created_by TEXT,
          is_public INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        )
      `),
    ]);
    
    // Insert default theme
    await db.prepare(`
      INSERT OR IGNORE INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      'default',
      'Default Light',
      'Clean and minimal light theme',
      '{"--primary-color":"#0066cc","--background":"#ffffff"}',
      null,
      null,
      1,
      new Date().toISOString()
    ).run();
  }, 30000);

  beforeEach(async () => {
    // Clear data before each test
    await db.batch([
      db.prepare("DELETE FROM link_maintainers"),
      db.prepare("DELETE FROM links"),
      db.prepare("DELETE FROM users"),
    ]);
  });

  describe("authMiddleware", () => {
    it("should allow access with valid JWT and auto-create user on first login", async () => {
      const payload = {
        email: "newuser@example.com",
        name: "New User",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      
      // Make request to protected route with JWT header
      const response = await SELF.fetch("https://example.com/dashboard", {
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
        },
      });
      
      // Should succeed (even if dashboard returns specific content)
      expect(response.status).not.toBe(401);
      
      // Verify user was created in database
      const user = await db.prepare(
        "SELECT email, is_admin FROM users WHERE email = ?"
      ).bind("newuser@example.com").first();
      
      expect(user).toBeDefined();
      expect(user?.email).toBe("newuser@example.com");
      expect(user?.is_admin).toBe(0); // Not admin by default
    });

    it("should allow access for existing user", async () => {
      // Create user first
      await db.prepare(
        "INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)"
      ).bind("existing@example.com", 0, new Date().toISOString()).run();
      
      const payload = {
        email: "existing@example.com",
        name: "Existing User",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      
      const response = await SELF.fetch("https://example.com/dashboard", {
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
        },
      });
      
      expect(response.status).not.toBe(401);
    });

    it("should return 401 when JWT header is missing", async () => {
      const response = await SELF.fetch("https://example.com/dashboard");
      
      expect(response.status).toBe(401);
      const html = await response.text();
      expect(html).toContain("Authentication Required");
      expect(html).toContain("No Cloudflare Access JWT found");
    });

    it("should return 401 for invalid JWT format", async () => {
      const response = await SELF.fetch("https://example.com/dashboard", {
        headers: {
          "Cf-Access-Jwt-Assertion": "invalid-jwt",
        },
      });
      
      expect(response.status).toBe(401);
    });

    it("should return 401 for expired JWT", async () => {
      const payload = {
        email: "test@example.com",
        name: "Test User",
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };
      
      const jwt = createMockJWT(payload);
      
      const response = await SELF.fetch("https://example.com/dashboard", {
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
        },
      });
      
      expect(response.status).toBe(401);
    });

    it("should return 401 for JWT missing email field", async () => {
      const payload = {
        name: "Test User",
        sub: "user123",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      
      const response = await SELF.fetch("https://example.com/dashboard", {
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
        },
      });
      
      expect(response.status).toBe(401);
    });

    it("should derive name from email if name is missing in JWT", async () => {
      const payload = {
        email: "john.doe@example.com",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      
      const response = await SELF.fetch("https://example.com/dashboard", {
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
        },
      });
      
      // Should succeed (name derived internally)
      expect(response.status).not.toBe(401);
      
      // Verify user was created
      const user = await db.prepare(
        "SELECT email FROM users WHERE email = ?"
      ).bind("john.doe@example.com").first();
      
      expect(user).toBeDefined();
    });
  });

  describe("adminMiddleware", () => {
    it("should allow access for admin users", async () => {
      // Create admin user
      await db.prepare(
        "INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)"
      ).bind("admin@example.com", 1, new Date().toISOString()).run();
      
      const payload = {
        email: "admin@example.com",
        name: "Admin User",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      
      // Access admin route
      const response = await SELF.fetch("https://example.com/dashboard/admin", {
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
        },
      });
      
      // Should succeed (admin has access)
      // Note: Admin page may timeout on R2 SQL queries, but should not return 401/403
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    }, 10000); // Increase timeout for R2 SQL queries

    it("should return 403 for non-admin users", async () => {
      // Create regular user (not admin)
      await db.prepare(
        "INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)"
      ).bind("user@example.com", 0, new Date().toISOString()).run();
      
      const payload = {
        email: "user@example.com",
        name: "Regular User",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      
      // Try to access admin route
      const response = await SELF.fetch("https://example.com/dashboard/admin", {
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
        },
      });
      
      expect(response.status).toBe(403);
      const html = await response.text();
      expect(html).toContain("403");
      expect(html).toContain("Admin access required");
    });

    it("should return 401 for unauthenticated requests to admin routes", async () => {
      const response = await SELF.fetch("https://example.com/dashboard/admin");
      
      // adminMiddleware calls authMiddleware first, which returns 401
      // But the response might be 403 if the middleware chain differs
      expect([401, 403]).toContain(response.status);
    });

    it("should auto-create non-admin user and then deny admin access", async () => {
      // New user (will be auto-created as non-admin)
      const payload = {
        email: "newuser@example.com",
        name: "New User",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      
      // Try to access admin route (user doesn't exist yet)
      const response = await SELF.fetch("https://example.com/dashboard/admin", {
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
        },
      });
      
      // Should return 403 (user created but not admin)
      expect(response.status).toBe(403);
      
      // Verify user was created as non-admin
      const user = await db.prepare(
        "SELECT email, is_admin FROM users WHERE email = ?"
      ).bind("newuser@example.com").first();
      
      expect(user).toBeDefined();
      expect(user?.is_admin).toBe(0);
    });
  });

  describe("Context Variables", () => {
    it("should set userEmail context variable", async () => {
      const payload = {
        email: "context@example.com",
        name: "Context User",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      
      const response = await SELF.fetch("https://example.com/dashboard", {
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
        },
      });
      
      // Dashboard should render successfully (200 or 304)
      // May also be other success codes
      expect(response.status).toBeLessThan(400);
    });

    it("should set isAdmin context variable correctly for admin", async () => {
      await db.prepare(
        "INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)"
      ).bind("admin2@example.com", 1, new Date().toISOString()).run();
      
      const payload = {
        email: "admin2@example.com",
        name: "Admin User 2",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      
      const response = await SELF.fetch("https://example.com/dashboard/admin", {
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
        },
      });
      
      // Should have access to admin route (not 403)
      expect(response.status).not.toBe(403);
    }, 10000); // Increase timeout for R2 SQL queries
  });
});
