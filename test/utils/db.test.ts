/**
 * Database Integration Tests
 * Uses @cloudflare/vitest-pool-workers for real D1 database testing (no mocks!)
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";

describe("Database Operations - Integration Tests", () => {
  let db: D1Database;

  beforeAll(async () => {
    // Use the D1 database from Cloudflare test environment
    db = env.DB;

    // Create schema manually (simpler than parsing SQL files)
    await db.batch([
      // Users table
      db.prepare(`
        CREATE TABLE users (
          email TEXT PRIMARY KEY,
          is_admin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `),
      // Themes table
      db.prepare(`
        CREATE TABLE themes (
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
      // Links table
      db.prepare(`
        CREATE TABLE links (
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
      // Link maintainers junction table
      db.prepare(`
        CREATE TABLE link_maintainers (
          link_slug TEXT NOT NULL,
          user_email TEXT NOT NULL,
          added_at TEXT NOT NULL,
          added_by TEXT,
          PRIMARY KEY (link_slug, user_email)
        )
      `),
    ]);

    // Insert default theme
    await db.prepare(`
      INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at)
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
    // Clear data before each test (keep schema and themes)
    await db.batch([
      db.prepare("DELETE FROM link_maintainers"),
      db.prepare("DELETE FROM links"),
      db.prepare("DELETE FROM users"),
    ]);
  });

  describe("User Operations", () => {
    it("should create and retrieve a user", async () => {
      const email = "test@example.com";
      const now = new Date().toISOString();
      
      // Insert user
      await db.prepare(
        "INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)"
      ).bind(email, 0, now).run();

      // Retrieve user
      const user = await db.prepare(
        "SELECT email, is_admin, created_at FROM users WHERE email = ?"
      ).bind(email).first();

      expect(user).toBeDefined();
      expect(user?.email).toBe(email);
      expect(user?.is_admin).toBe(0);
    });

    it("should return null for non-existent user", async () => {
      const user = await db.prepare(
        "SELECT email, is_admin, created_at FROM users WHERE email = ?"
      ).bind("nonexistent@example.com").first();

      expect(user).toBeNull();
    });

    it("should create admin user", async () => {
      const email = "admin@example.com";
      const now = new Date().toISOString();
      
      await db.prepare(
        "INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)"
      ).bind(email, 1, now).run();

      const user = await db.prepare(
        "SELECT email, is_admin, created_at FROM users WHERE email = ?"
      ).bind(email).first();

      expect(user?.is_admin).toBe(1);
    });

    it("should delete user", async () => {
      const email = "delete@example.com";
      const now = new Date().toISOString();
      
      await db.prepare(
        "INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)"
      ).bind(email, 0, now).run();

      let user = await db.prepare(
        "SELECT * FROM users WHERE email = ?"
      ).bind(email).first();
      expect(user).not.toBeNull();

      await db.prepare("DELETE FROM users WHERE email = ?").bind(email).run();

      user = await db.prepare(
        "SELECT * FROM users WHERE email = ?"
      ).bind(email).first();
      expect(user).toBeNull();
    });

    it("should get all users", async () => {
      const now = new Date().toISOString();
      
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("user1@example.com", 0, now),
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("user2@example.com", 1, now),
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("user3@example.com", 0, now),
      ]);

      const result = await db.prepare(
        "SELECT email, is_admin, created_at FROM users ORDER BY created_at DESC"
      ).all();

      expect(result.results).toHaveLength(3);
      expect(result.results.some((u: any) => u.email === "user1@example.com")).toBe(true);
      expect(result.results.some((u: any) => u.email === "user2@example.com" && u.is_admin === 1)).toBe(true);
    });
  });

  describe("Link Operations", () => {
    beforeEach(async () => {
      // Create a test user for links
      await db.prepare(
        "INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)"
      ).bind("creator@example.com", 0, new Date().toISOString()).run();
    });

    it("should create and retrieve a link", async () => {
      const now = new Date().toISOString();
      
      await db.prepare(
        "INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind("test-link", "Test Link", "# Hello World", "default", "creator@example.com", now, now, null).run();

      // Add maintainer
      await db.prepare(
        "INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)"
      ).bind("test-link", "creator@example.com", now, "creator@example.com").run();

      const link = await db.prepare(
        "SELECT slug, title, content, theme_id, created_by, created_at, updated_at, custom_css FROM links WHERE slug = ?"
      ).bind("test-link").first();

      expect(link).toBeDefined();
      expect(link?.slug).toBe("test-link");
      expect(link?.title).toBe("Test Link");
    });

    it("should return null for non-existent link", async () => {
      const link = await db.prepare(
        "SELECT * FROM links WHERE slug = ?"
      ).bind("nonexistent-slug").first();

      expect(link).toBeNull();
    });

    it("should update link", async () => {
      const now = new Date().toISOString();
      
      await db.prepare(
        "INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind("update-test", "Original Title", "Original content", "default", "creator@example.com", now, now, null).run();

      const laterTime = new Date(Date.now() + 1000).toISOString();
      await db.prepare(
        "UPDATE links SET title = ?, content = ?, updated_at = ? WHERE slug = ?"
      ).bind("Updated Title", "Updated content", laterTime, "update-test").run();

      const link = await db.prepare(
        "SELECT * FROM links WHERE slug = ?"
      ).bind("update-test").first();

      expect(link?.title).toBe("Updated Title");
      expect(link?.content).toBe("Updated content");
    });

    it("should delete link", async () => {
      const now = new Date().toISOString();
      
      await db.prepare(
        "INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind("delete-test", "Delete Me", "Content", "default", "creator@example.com", now, now, null).run();

      let link = await db.prepare("SELECT * FROM links WHERE slug = ?").bind("delete-test").first();
      expect(link).not.toBeNull();

      await db.prepare("DELETE FROM links WHERE slug = ?").bind("delete-test").run();

      link = await db.prepare("SELECT * FROM links WHERE slug = ?").bind("delete-test").first();
      expect(link).toBeNull();
    });
  });

  describe("Maintainer Operations", () => {
    beforeEach(async () => {
      const now = new Date().toISOString();
      
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("owner@example.com", 0, now),
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("maintainer@example.com", 0, now),
      ]);

      await db.prepare(
        "INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind("test-link", "Test", "Content", "default", "owner@example.com", now, now, null).run();

      await db.prepare(
        "INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)"
      ).bind("test-link", "owner@example.com", now, "owner@example.com").run();
    });

    it("should check user access to link", async () => {
      const hasAccess = await db.prepare(
        "SELECT 1 FROM link_maintainers WHERE link_slug = ? AND user_email = ?"
      ).bind("test-link", "owner@example.com").first();

      expect(hasAccess).not.toBeNull();

      const noAccess = await db.prepare(
        "SELECT 1 FROM link_maintainers WHERE link_slug = ? AND user_email = ?"
      ).bind("test-link", "maintainer@example.com").first();

      expect(noAccess).toBeNull();
    });

    it("should add maintainer", async () => {
      const now = new Date().toISOString();
      
      await db.prepare(
        "INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)"
      ).bind("test-link", "maintainer@example.com", now, "owner@example.com").run();

      const hasAccess = await db.prepare(
        "SELECT 1 FROM link_maintainers WHERE link_slug = ? AND user_email = ?"
      ).bind("test-link", "maintainer@example.com").first();

      expect(hasAccess).not.toBeNull();
    });

    it("should remove maintainer", async () => {
      const now = new Date().toISOString();
      
      await db.prepare(
        "INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)"
      ).bind("test-link", "maintainer@example.com", now, "owner@example.com").run();

      let hasAccess = await db.prepare(
        "SELECT 1 FROM link_maintainers WHERE link_slug = ? AND user_email = ?"
      ).bind("test-link", "maintainer@example.com").first();
      expect(hasAccess).not.toBeNull();

      await db.prepare(
        "DELETE FROM link_maintainers WHERE link_slug = ? AND user_email = ?"
      ).bind("test-link", "maintainer@example.com").run();

      hasAccess = await db.prepare(
        "SELECT 1 FROM link_maintainers WHERE link_slug = ? AND user_email = ?"
      ).bind("test-link", "maintainer@example.com").first();
      expect(hasAccess).toBeNull();
    });

    it("should get link maintainers", async () => {
      const now = new Date().toISOString();
      
      await db.prepare(
        "INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)"
      ).bind("test-link", "maintainer@example.com", now, "owner@example.com").run();

      const result = await db.prepare(
        "SELECT link_slug, user_email, added_at, added_by FROM link_maintainers WHERE link_slug = ? ORDER BY added_at ASC"
      ).bind("test-link").all();

      expect(result.results).toHaveLength(2);
      expect(result.results.some((m: any) => m.user_email === "owner@example.com")).toBe(true);
      expect(result.results.some((m: any) => m.user_email === "maintainer@example.com")).toBe(true);
    });
  });

  describe("Theme Operations", () => {
    it("should get theme by id", async () => {
      const theme = await db.prepare(
        "SELECT id, name, description, css_variables, additional_css, created_by, is_public, created_at FROM themes WHERE id = ?"
      ).bind("default").first();

      expect(theme).not.toBeNull();
      expect(theme?.id).toBe("default");
      expect(theme?.name).toBe("Default Light");
      expect(theme?.is_public).toBe(1);
    });

    it("should return null for non-existent theme", async () => {
      const theme = await db.prepare(
        "SELECT * FROM themes WHERE id = ?"
      ).bind("nonexistent").first();

      expect(theme).toBeNull();
    });

    it("should get all themes", async () => {
      const result = await db.prepare(
        "SELECT id, name, description, css_variables, additional_css, created_by, is_public, created_at FROM themes ORDER BY name ASC"
      ).all();

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.some((t: any) => t.id === "default")).toBe(true);
    });

    it("should get only public themes", async () => {
      const result = await db.prepare(
        "SELECT id, name, description, css_variables, additional_css, created_by, is_public, created_at FROM themes WHERE is_public = 1 ORDER BY name ASC"
      ).all();

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.every((t: any) => t.is_public === 1)).toBe(true);
    });
  });

  describe("Advanced Link Operations", () => {
    beforeEach(async () => {
      const now = new Date().toISOString();
      await db.batch([
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("owner@example.com", 0, now),
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("maintainer@example.com", 0, now),
        db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("viewer@example.com", 0, now),
      ]);
    });

    it("should get link with maintainers", async () => {
      const now = new Date().toISOString();
      
      // Create link
      await db.prepare(
        "INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind("test-link", "Test", "Content", "default", "owner@example.com", now, now, null).run();
      
      // Add multiple maintainers
      await db.batch([
        db.prepare("INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)").bind("test-link", "owner@example.com", now, "owner@example.com"),
        db.prepare("INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)").bind("test-link", "maintainer@example.com", now, "owner@example.com"),
      ]);
      
      // Query link with maintainers
      const link = await db.prepare("SELECT * FROM links WHERE slug = ?").bind("test-link").first();
      const maintainers = await db.prepare(
        "SELECT user_email FROM link_maintainers WHERE link_slug = ? ORDER BY added_at ASC"
      ).bind("test-link").all();
      
      expect(link).toBeDefined();
      expect(maintainers.results).toHaveLength(2);
      expect(maintainers.results.some((m: any) => m.user_email === "owner@example.com")).toBe(true);
      expect(maintainers.results.some((m: any) => m.user_email === "maintainer@example.com")).toBe(true);
    });

    it("should get all links accessible by user", async () => {
      const now = new Date().toISOString();
      
      // Create multiple links
      await db.batch([
        db.prepare("INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("link1", "Link 1", "Content", "default", "owner@example.com", now, now, null),
        db.prepare("INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("link2", "Link 2", "Content", "default", "owner@example.com", now, now, null),
        db.prepare("INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("link3", "Link 3", "Content", "default", "maintainer@example.com", now, now, null),
      ]);
      
      // Add maintainer access
      await db.batch([
        db.prepare("INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)").bind("link1", "owner@example.com", now, "owner@example.com"),
        db.prepare("INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)").bind("link1", "maintainer@example.com", now, "owner@example.com"),
        db.prepare("INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)").bind("link2", "owner@example.com", now, "owner@example.com"),
        db.prepare("INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)").bind("link3", "maintainer@example.com", now, "maintainer@example.com"),
      ]);
      
      // Get links for maintainer@example.com (should have link1 and link3)
      const links = await db.prepare(`
        SELECT DISTINCT l.*
        FROM links l
        INNER JOIN link_maintainers lm ON l.slug = lm.link_slug
        WHERE lm.user_email = ?
        ORDER BY l.updated_at DESC
      `).bind("maintainer@example.com").all();
      
      expect(links.results).toHaveLength(2);
      expect(links.results.some((l: any) => l.slug === "link1")).toBe(true);
      expect(links.results.some((l: any) => l.slug === "link3")).toBe(true);
    });

    it("should check if user can access link", async () => {
      const now = new Date().toISOString();
      
      await db.prepare(
        "INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind("private-link", "Private", "Content", "default", "owner@example.com", now, now, null).run();
      
      await db.prepare(
        "INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)"
      ).bind("private-link", "owner@example.com", now, "owner@example.com").run();
      
      // Owner should have access
      const ownerAccess = await db.prepare(
        "SELECT 1 FROM link_maintainers WHERE link_slug = ? AND user_email = ?"
      ).bind("private-link", "owner@example.com").first();
      expect(ownerAccess).not.toBeNull();
      
      // Viewer should NOT have access
      const viewerAccess = await db.prepare(
        "SELECT 1 FROM link_maintainers WHERE link_slug = ? AND user_email = ?"
      ).bind("private-link", "viewer@example.com").first();
      expect(viewerAccess).toBeNull();
    });

    it("should get user accessible slugs for analytics filtering", async () => {
      const now = new Date().toISOString();
      
      // Create links and maintainers
      await db.batch([
        db.prepare("INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("analytics1", "Test 1", "Content", "default", "owner@example.com", now, now, null),
        db.prepare("INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("analytics2", "Test 2", "Content", "default", "owner@example.com", now, now, null),
      ]);
      
      await db.batch([
        db.prepare("INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)").bind("analytics1", "owner@example.com", now, "owner@example.com"),
        db.prepare("INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)").bind("analytics2", "owner@example.com", now, "owner@example.com"),
      ]);
      
      // Get accessible slugs
      const result = await db.prepare(
        "SELECT link_slug FROM link_maintainers WHERE user_email = ?"
      ).bind("owner@example.com").all();
      
      const slugs = result.results.map((r: any) => r.link_slug);
      
      expect(slugs).toContain("analytics1");
      expect(slugs).toContain("analytics2");
      expect(slugs).toHaveLength(2);
    });

    it("should handle creating link with custom CSS", async () => {
      const now = new Date().toISOString();
      const customCSS = ".custom { color: red; }";
      
      await db.prepare(
        "INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind("custom-link", "Custom", "Content", "default", "owner@example.com", now, now, customCSS).run();
      
      const link = await db.prepare("SELECT * FROM links WHERE slug = ?").bind("custom-link").first();
      
      expect(link?.custom_css).toBe(customCSS);
    });

    it("should handle updating link timestamps", async () => {
      const now = new Date().toISOString();
      
      await db.prepare(
        "INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind("timestamp-link", "Original", "Content", "default", "owner@example.com", now, now, null).run();
      
      // Wait a moment and update
      await new Promise(resolve => setTimeout(resolve, 10));
      const laterTime = new Date().toISOString();
      
      await db.prepare(
        "UPDATE links SET title = ?, updated_at = ? WHERE slug = ?"
      ).bind("Updated", laterTime, "timestamp-link").run();
      
      const link = await db.prepare("SELECT * FROM links WHERE slug = ?").bind("timestamp-link").first();
      
      expect(link?.title).toBe("Updated");
      expect(link?.created_at).toBe(now);
      expect(link?.updated_at).toBe(laterTime);
      expect(link?.updated_at).not.toBe(link?.created_at);
    });
  });

  describe("Theme CRUD Operations", () => {
    beforeEach(async () => {
      const now = new Date().toISOString();
      await db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("theme-creator@example.com", 0, now).run();
    });

    it("should create custom theme", async () => {
      const now = new Date().toISOString();
      const cssVars = JSON.stringify({ "--primary-color": "#ff0000", "--background": "#ffffff" });
      
      await db.prepare(
        "INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind("custom-theme", "Custom Theme", "My custom theme", cssVars, null, "theme-creator@example.com", 0, now).run();
      
      const theme = await db.prepare("SELECT * FROM themes WHERE id = ?").bind("custom-theme").first();
      
      expect(theme).toBeDefined();
      expect(theme?.name).toBe("Custom Theme");
      expect(theme?.created_by).toBe("theme-creator@example.com");
      expect(theme?.is_public).toBe(0);
    });

    it("should update theme", async () => {
      const now = new Date().toISOString();
      const cssVars = JSON.stringify({ "--primary-color": "#00ff00" });
      
      await db.prepare(
        "INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind("update-theme", "Original", "Desc", cssVars, null, "theme-creator@example.com", 0, now).run();
      
      const newCssVars = JSON.stringify({ "--primary-color": "#0000ff" });
      await db.prepare(
        "UPDATE themes SET name = ?, css_variables = ? WHERE id = ?"
      ).bind("Updated Theme", newCssVars, "update-theme").run();
      
      const theme = await db.prepare("SELECT * FROM themes WHERE id = ?").bind("update-theme").first();
      
      expect(theme?.name).toBe("Updated Theme");
      expect(theme?.css_variables).toBe(newCssVars);
    });

    it("should delete theme", async () => {
      const now = new Date().toISOString();
      const cssVars = JSON.stringify({ "--primary-color": "#ff0000" });
      
      await db.prepare(
        "INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind("delete-theme", "Delete Me", "Desc", cssVars, null, "theme-creator@example.com", 0, now).run();
      
      let theme = await db.prepare("SELECT * FROM themes WHERE id = ?").bind("delete-theme").first();
      expect(theme).not.toBeNull();
      
      await db.prepare("DELETE FROM themes WHERE id = ?").bind("delete-theme").run();
      
      theme = await db.prepare("SELECT * FROM themes WHERE id = ?").bind("delete-theme").first();
      expect(theme).toBeNull();
    });

    it("should get themes created by user", async () => {
      const now = new Date().toISOString();
      const cssVars = JSON.stringify({ "--primary-color": "#ff0000" });
      
      await db.batch([
        db.prepare("INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("user-theme-1", "Theme 1", "Desc", cssVars, null, "theme-creator@example.com", 0, now),
        db.prepare("INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("user-theme-2", "Theme 2", "Desc", cssVars, null, "theme-creator@example.com", 1, now),
      ]);
      
      const result = await db.prepare(
        "SELECT * FROM themes WHERE created_by = ? ORDER BY name ASC"
      ).bind("theme-creator@example.com").all();
      
      expect(result.results).toHaveLength(2);
      expect(result.results.every((t: any) => t.created_by === "theme-creator@example.com")).toBe(true);
    });

    it("should filter public vs private themes", async () => {
      const now = new Date().toISOString();
      const cssVars = JSON.stringify({ "--primary-color": "#ff0000" });
      
      await db.batch([
        db.prepare("INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("public-1", "Public 1", "Desc", cssVars, null, "theme-creator@example.com", 1, now),
        db.prepare("INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("private-1", "Private 1", "Desc", cssVars, null, "theme-creator@example.com", 0, now),
      ]);
      
      const publicThemes = await db.prepare("SELECT * FROM themes WHERE is_public = 1").all();
      const privateThemes = await db.prepare("SELECT * FROM themes WHERE is_public = 0 AND created_by = ?").bind("theme-creator@example.com").all();
      
      // Public should include default theme + our new public theme
      expect(publicThemes.results.length).toBeGreaterThanOrEqual(2);
      expect(publicThemes.results.some((t: any) => t.id === "public-1")).toBe(true);
      
      // Private should only include our new private theme
      expect(privateThemes.results.some((t: any) => t.id === "private-1")).toBe(true);
    });
  });
});
