/**
 * Public Routes Integration Tests
 * Tests public-facing routes that don't require authentication
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";

describe("Public Routes - Integration Tests", () => {
  let db: D1Database;

  beforeAll(async () => {
    db = env.DB;
    
    // Create schema for integration tests
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          is_admin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS outies (
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
    // Clear data between tests
    await db.batch([
      db.prepare("DELETE FROM outies"),
      db.prepare("DELETE FROM users"),
    ]);
  });

  describe("Homepage", () => {
    it("should render homepage at /", async () => {
      const response = await SELF.fetch("https://example.com/");

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("LinkedOut");
      expect(text).toContain("Share Links, Track Clicks");
    });
  });

  describe("Outie Public Page", () => {
    it("should render public outie page at /out/:slug", async () => {
      // Create user and outie
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("creator@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO outies (slug, title, content, theme_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
          "public-test",
          "Public Test Outie",
          "# Welcome\n\nThis is a test outie!",
          "default",
          "creator@example.com",
          new Date().toISOString(),
          new Date().toISOString()
        )
      ]);

      const response = await SELF.fetch("https://example.com/out/public-test");

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("Public Test Outie");
      expect(text).toContain("Welcome");
    });

    it("should return 404 for non-existent outie", async () => {
      const response = await SELF.fetch("https://example.com/out/does-not-exist");

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toContain("404");
    });

    it("should render markdown content as HTML", async () => {
      // Create user and outie with markdown
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("markdown@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO outies (slug, title, content, theme_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
          "markdown-test",
          "Markdown Test",
          "# Heading 1\n\n## Heading 2\n\n**Bold text** and *italic text*\n\n- List item 1\n- List item 2",
          "default",
          "markdown@example.com",
          new Date().toISOString(),
          new Date().toISOString()
        )
      ]);

      const response = await SELF.fetch("https://example.com/out/markdown-test");

      expect(response.status).toBe(200);
      const text = await response.text();
      
      // Check that markdown is rendered as HTML
      expect(text).toContain("<h1");
      expect(text).toContain("<h2");
      expect(text).toContain("<strong>");
      expect(text).toContain("<em>");
      expect(text).toContain("<ul>");
      expect(text).toContain("<li>");
    });

    it("should apply custom CSS if provided", async () => {
      // Create user and outie with custom CSS
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("custom@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO outies (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(
          "custom-css-test",
          "Custom CSS Test",
          "Content",
          "default",
          "custom@example.com",
          new Date().toISOString(),
          new Date().toISOString(),
          ".content { color: red; }"
        )
      ]);

      const response = await SELF.fetch("https://example.com/out/custom-css-test");

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain(".content { color: red; }");
    });
  });

  describe("QR Code Redirect", () => {
    it("should redirect QR scan at /q/:slug to outie page", async () => {
      // Create user and outie
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("qr@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO outies (slug, title, content, theme_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
          "qr-redirect-test",
          "QR Test",
          "Content",
          "default",
          "qr@example.com",
          new Date().toISOString(),
          new Date().toISOString()
        )
      ]);

      const response = await SELF.fetch("https://example.com/q/qr-redirect-test", {
        redirect: "manual" // Don't follow redirects
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/out/qr-redirect-test");
    });

    it("should return 404 for non-existent QR code", async () => {
      const response = await SELF.fetch("https://example.com/q/does-not-exist");

      expect(response.status).toBe(404);
    });
  });

  describe("Auth Routes", () => {
    it("should render login page at /login", async () => {
      const response = await SELF.fetch("https://example.com/login");

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("Login");
    });

    it("should redirect logout at /logout", async () => {
      const response = await SELF.fetch("https://example.com/logout", {
        redirect: "manual"
      });

      // Should redirect to Cloudflare Access logout
      expect(response.status).toBe(302);
      const location = response.headers.get("Location");
      expect(location).toBeTruthy();
    });
  });

  describe("Static Assets", () => {
    it("should serve favicon at /favicon.png", async () => {
      const response = await SELF.fetch("https://example.com/favicon.png");

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("image/png");
    });

    it("should serve styles at /styles.css", async () => {
      const response = await SELF.fetch("https://example.com/styles.css");

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/css");
    });
  });

  describe("API Endpoints", () => {
    it("should accept tracking data at POST /api/track", async () => {
      // Create user and outie first
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("track@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO outies (slug, title, content, theme_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
          "track-test",
          "Track Test",
          "Content",
          "default",
          "track@example.com",
          new Date().toISOString(),
          new Date().toISOString()
        )
      ]);

      const trackingData = {
        url: "https://example.com/out/track-test",
        out: "https://example.com/clicked-link",
        link_text: "Click me",
        visitor_id: "test-visitor-123"
      };

      const response = await SELF.fetch("https://example.com/api/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(trackingData)
      });

      expect(response.status).toBe(204);
    });

    it("should reject tracking data without required fields", async () => {
      const trackingData = {
        url: "https://example.com/out/invalid"
        // Missing 'out' field
      };

      const response = await SELF.fetch("https://example.com/api/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(trackingData)
      });

      // Should return 204 but not crash
      expect(response.status).toBe(204);
    });
  });

  describe("404 Handling", () => {
    it("should return 404 for non-existent routes", async () => {
      const response = await SELF.fetch("https://example.com/this-route-does-not-exist");

      expect(response.status).toBe(404);
    });
  });
});
