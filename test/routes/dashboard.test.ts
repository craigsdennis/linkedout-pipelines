/**
 * Dashboard Routes Integration Tests
 * Tests that all dashboard routes are accessible at correct URLs
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";

describe("Dashboard Routes - Integration Tests", () => {
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
        CREATE TABLE IF NOT EXISTS outie_maintainers (
          outie_slug TEXT NOT NULL,
          user_email TEXT NOT NULL,
          added_at TEXT NOT NULL,
          added_by TEXT,
          PRIMARY KEY (outie_slug, user_email)
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
      db.prepare("DELETE FROM outie_maintainers"),
      db.prepare("DELETE FROM outies"),
      db.prepare("DELETE FROM users"),
    ]);
  });

  describe("Outie CRUD Routes", () => {
    it("should render create outie form at /dashboard/outies/create", async () => {
      const jwt = createMockJWT({
        email: "test@example.com",
        name: "Test User",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const response = await SELF.fetch("https://example.com/dashboard/outies/create", {
        headers: { "Cf-Access-Jwt-Assertion": jwt }
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("Create Outie");
      expect(text).toContain("form");
    });

    it("should reject old /dashboard/links/create route with 404", async () => {
      const jwt = createMockJWT({
        email: "test@example.com",
        name: "Test User",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const response = await SELF.fetch("https://example.com/dashboard/links/create", {
        headers: { "Cf-Access-Jwt-Assertion": jwt }
      });

      expect(response.status).toBe(404);
    });

    it("should create an outie via POST /dashboard/outies/create", async () => {
      const jwt = createMockJWT({
        email: "creator@example.com",
        name: "Creator User",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      // Create user first (auth middleware does this)
      await db.prepare(
        "INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)"
      ).bind("creator@example.com", 0, new Date().toISOString()).run();

      const formData = new URLSearchParams({
        slug: "test-outie",
        title: "Test Outie",
        content: "# Test Content",
        theme_id: "default"
      });

      const response = await SELF.fetch("https://example.com/dashboard/outies/create", {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData.toString(),
        redirect: "manual"
      });

      // Should redirect to view page
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/dashboard/outies/view/test-outie");

      // Verify outie was created
      const outie = await db.prepare("SELECT * FROM outies WHERE slug = ?").bind("test-outie").first();
      expect(outie).toBeDefined();
      expect(outie?.title).toBe("Test Outie");
    });

    it("should render view outie page at /dashboard/outies/view/:slug", async () => {
      const jwt = createMockJWT({
        email: "viewer@example.com",
        name: "Viewer User",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      // Create user and outie
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("viewer@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO outies (slug, title, content, theme_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("view-test", "View Test", "Content", "default", "viewer@example.com", new Date().toISOString(), new Date().toISOString()),
        db.prepare("INSERT INTO outie_maintainers (outie_slug, user_email, added_at) VALUES (?, ?, ?)").bind("view-test", "viewer@example.com", new Date().toISOString())
      ]);

      const response = await SELF.fetch("https://example.com/dashboard/outies/view/view-test", {
        headers: { "Cf-Access-Jwt-Assertion": jwt }
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      // The view page shows the slug and has manage/edit buttons
      expect(text).toContain("view-test");
      expect(text.includes("Edit") || text.includes("Manage")).toBe(true);
    });

    it("should render edit outie form at /dashboard/outies/edit/:slug", async () => {
      const jwt = createMockJWT({
        email: "editor@example.com",
        name: "Editor User",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      // Create user and outie
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("editor@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO outies (slug, title, content, theme_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("edit-test", "Edit Test", "Content", "default", "editor@example.com", new Date().toISOString(), new Date().toISOString()),
        db.prepare("INSERT INTO outie_maintainers (outie_slug, user_email, added_at) VALUES (?, ?, ?)").bind("edit-test", "editor@example.com", new Date().toISOString())
      ]);

      const response = await SELF.fetch("https://example.com/dashboard/outies/edit/edit-test", {
        headers: { "Cf-Access-Jwt-Assertion": jwt }
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("Edit Test");
      expect(text).toContain("form");
    });

    it("should update an outie via POST /dashboard/outies/edit/:slug", async () => {
      const jwt = createMockJWT({
        email: "updater@example.com",
        name: "Updater User",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      // Create user and outie
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("updater@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO outies (slug, title, content, theme_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("update-test", "Old Title", "Old Content", "default", "updater@example.com", new Date().toISOString(), new Date().toISOString()),
        db.prepare("INSERT INTO outie_maintainers (outie_slug, user_email, added_at) VALUES (?, ?, ?)").bind("update-test", "updater@example.com", new Date().toISOString())
      ]);

      // Use FormData (not URLSearchParams) to match how Hono parses it
      const formData = new FormData();
      formData.append("title", "New Title");
      formData.append("content", "# New Content");
      formData.append("theme_id", "default");

      const response = await SELF.fetch("https://example.com/dashboard/outies/edit/update-test", {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
        },
        body: formData,
        redirect: "manual" // Don't follow redirects
      });

      // Should redirect to view page
      expect(response.status).toBe(302);

      // Verify outie was updated
      const outie = await db.prepare("SELECT * FROM outies WHERE slug = ?").bind("update-test").first();
      expect(outie?.title).toBe("New Title");
      expect(outie?.content).toBe("# New Content");
    });

    it("should delete an outie via POST /dashboard/outies/delete/:slug", async () => {
      const jwt = createMockJWT({
        email: "deleter@example.com",
        name: "Deleter User",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      // Create user and outie
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("deleter@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO outies (slug, title, content, theme_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("delete-test", "Delete Test", "Content", "default", "deleter@example.com", new Date().toISOString(), new Date().toISOString()),
        db.prepare("INSERT INTO outie_maintainers (outie_slug, user_email, added_at) VALUES (?, ?, ?)").bind("delete-test", "deleter@example.com", new Date().toISOString())
      ]);

      const response = await SELF.fetch("https://example.com/dashboard/outies/delete/delete-test", {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": jwt
        },
        redirect: "manual"
      });

      // Should redirect to dashboard
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/dashboard");

      // Verify outie was deleted
      const outie = await db.prepare("SELECT * FROM outies WHERE slug = ?").bind("delete-test").first();
      expect(outie).toBeNull();
    });

  });

  describe("Maintainer Management Routes", () => {
    it("should add maintainer via POST /dashboard/outies/:slug/add-maintainer", async () => {
      const jwt = createMockJWT({
        email: "owner@example.com",
        name: "Owner User",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      // Create users and outie
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("owner@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("newmaintainer@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO outies (slug, title, content, theme_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("maintainer-test", "Test", "Content", "default", "owner@example.com", new Date().toISOString(), new Date().toISOString()),
        db.prepare("INSERT INTO outie_maintainers (outie_slug, user_email, added_at) VALUES (?, ?, ?)").bind("maintainer-test", "owner@example.com", new Date().toISOString())
      ]);

      const formData = new FormData();
      formData.append("email", "newmaintainer@example.com");

      const response = await SELF.fetch("https://example.com/dashboard/outies/maintainer-test/add-maintainer", {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
        },
        body: formData,
        redirect: "manual"
      });

      expect(response.status).toBe(302);

      // Verify maintainer was added
      const maintainer = await db.prepare(
        "SELECT * FROM outie_maintainers WHERE outie_slug = ? AND user_email = ?"
      ).bind("maintainer-test", "newmaintainer@example.com").first();
      expect(maintainer).toBeDefined();
    });

    it("should remove maintainer via POST /dashboard/outies/:slug/remove-maintainer", async () => {
      const jwt = createMockJWT({
        email: "owner@example.com",
        name: "Owner User",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      // Create users and outie with two maintainers
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("owner@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("remove@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO outies (slug, title, content, theme_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("remove-test", "Test", "Content", "default", "owner@example.com", new Date().toISOString(), new Date().toISOString()),
        db.prepare("INSERT INTO outie_maintainers (outie_slug, user_email, added_at) VALUES (?, ?, ?)").bind("remove-test", "owner@example.com", new Date().toISOString()),
        db.prepare("INSERT INTO outie_maintainers (outie_slug, user_email, added_at) VALUES (?, ?, ?)").bind("remove-test", "remove@example.com", new Date().toISOString())
      ]);

      const formData = new FormData();
      formData.append("email", "remove@example.com");

      const response = await SELF.fetch("https://example.com/dashboard/outies/remove-test/remove-maintainer", {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": jwt,
        },
        body: formData,
        redirect: "manual"
      });

      expect(response.status).toBe(302);

      // Verify maintainer was removed
      const maintainer = await db.prepare(
        "SELECT * FROM outie_maintainers WHERE outie_slug = ? AND user_email = ?"
      ).bind("remove-test", "remove@example.com").first();
      expect(maintainer).toBeNull();
    });
  });

  describe("Legacy Route Rejection", () => {
    it("should return 404 for all old /dashboard/links/* routes", async () => {
      const jwt = createMockJWT({
        email: "test@example.com",
        name: "Test User",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const oldRoutes = [
        "/dashboard/links/create",
        "/dashboard/links/view/test-slug",
        "/dashboard/links/edit/test-slug",
      ];

      for (const route of oldRoutes) {
        const response = await SELF.fetch(`https://example.com${route}`, {
          headers: { "Cf-Access-Jwt-Assertion": jwt }
        });
        expect(response.status, `Route ${route} should return 404`).toBe(404);
      }
    });
  });

  describe("Permission Tests", () => {
    it("should deny access to outie if user is not a maintainer", async () => {
      const jwt = createMockJWT({
        email: "unauthorized@example.com",
        name: "Unauthorized User",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      // Create users and outie (unauthorized user is NOT a maintainer)
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("owner@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("unauthorized@example.com", 0, new Date().toISOString()),
        db.prepare("INSERT INTO outies (slug, title, content, theme_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("private-test", "Test", "Content", "default", "owner@example.com", new Date().toISOString(), new Date().toISOString()),
        db.prepare("INSERT INTO outie_maintainers (outie_slug, user_email, added_at) VALUES (?, ?, ?)").bind("private-test", "owner@example.com", new Date().toISOString())
      ]);

      const response = await SELF.fetch("https://example.com/dashboard/outies/view/private-test", {
        headers: { "Cf-Access-Jwt-Assertion": jwt }
      });

      expect(response.status).toBe(403);
    });
  });
});
