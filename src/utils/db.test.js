/**
 * Database Integration Tests
 * Uses Miniflare for real D1 database testing (no mocks!)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Miniflare } from "miniflare";
describe("Database Operations - Integration Tests", () => {
    let mf;
    let db;
    beforeAll(async () => {
        // Create Miniflare instance with D1
        mf = new Miniflare({
            modules: true,
            script: "",
            d1Databases: {
                DB: "test-db"
            },
        });
        db = await mf.getD1Database("DB");
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
    `).bind('default', 'Default Light', 'Clean and minimal light theme', '{"--primary-color":"#0066cc","--background":"#ffffff"}', null, null, 1, new Date().toISOString()).run();
    }, 30000);
    afterAll(async () => {
        await mf?.dispose();
    });
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
            await db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind(email, 0, now).run();
            // Retrieve user
            const user = await db.prepare("SELECT email, is_admin, created_at FROM users WHERE email = ?").bind(email).first();
            expect(user).toBeDefined();
            expect(user?.email).toBe(email);
            expect(user?.is_admin).toBe(0);
        });
        it("should return null for non-existent user", async () => {
            const user = await db.prepare("SELECT email, is_admin, created_at FROM users WHERE email = ?").bind("nonexistent@example.com").first();
            expect(user).toBeNull();
        });
        it("should create admin user", async () => {
            const email = "admin@example.com";
            const now = new Date().toISOString();
            await db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind(email, 1, now).run();
            const user = await db.prepare("SELECT email, is_admin, created_at FROM users WHERE email = ?").bind(email).first();
            expect(user?.is_admin).toBe(1);
        });
        it("should delete user", async () => {
            const email = "delete@example.com";
            const now = new Date().toISOString();
            await db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind(email, 0, now).run();
            let user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
            expect(user).not.toBeNull();
            await db.prepare("DELETE FROM users WHERE email = ?").bind(email).run();
            user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
            expect(user).toBeNull();
        });
        it("should get all users", async () => {
            const now = new Date().toISOString();
            await db.batch([
                db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("user1@example.com", 0, now),
                db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("user2@example.com", 1, now),
                db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("user3@example.com", 0, now),
            ]);
            const result = await db.prepare("SELECT email, is_admin, created_at FROM users ORDER BY created_at DESC").all();
            expect(result.results).toHaveLength(3);
            expect(result.results.some((u) => u.email === "user1@example.com")).toBe(true);
            expect(result.results.some((u) => u.email === "user2@example.com" && u.is_admin === 1)).toBe(true);
        });
    });
    describe("Link Operations", () => {
        beforeEach(async () => {
            // Create a test user for links
            await db.prepare("INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)").bind("creator@example.com", 0, new Date().toISOString()).run();
        });
        it("should create and retrieve a link", async () => {
            const now = new Date().toISOString();
            await db.prepare("INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("test-link", "Test Link", "# Hello World", "default", "creator@example.com", now, now, null).run();
            // Add maintainer
            await db.prepare("INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)").bind("test-link", "creator@example.com", now, "creator@example.com").run();
            const link = await db.prepare("SELECT slug, title, content, theme_id, created_by, created_at, updated_at, custom_css FROM links WHERE slug = ?").bind("test-link").first();
            expect(link).toBeDefined();
            expect(link?.slug).toBe("test-link");
            expect(link?.title).toBe("Test Link");
        });
        it("should return null for non-existent link", async () => {
            const link = await db.prepare("SELECT * FROM links WHERE slug = ?").bind("nonexistent-slug").first();
            expect(link).toBeNull();
        });
        it("should update link", async () => {
            const now = new Date().toISOString();
            await db.prepare("INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("update-test", "Original Title", "Original content", "default", "creator@example.com", now, now, null).run();
            const laterTime = new Date(Date.now() + 1000).toISOString();
            await db.prepare("UPDATE links SET title = ?, content = ?, updated_at = ? WHERE slug = ?").bind("Updated Title", "Updated content", laterTime, "update-test").run();
            const link = await db.prepare("SELECT * FROM links WHERE slug = ?").bind("update-test").first();
            expect(link?.title).toBe("Updated Title");
            expect(link?.content).toBe("Updated content");
        });
        it("should delete link", async () => {
            const now = new Date().toISOString();
            await db.prepare("INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("delete-test", "Delete Me", "Content", "default", "creator@example.com", now, now, null).run();
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
            await db.prepare("INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("test-link", "Test", "Content", "default", "owner@example.com", now, now, null).run();
            await db.prepare("INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)").bind("test-link", "owner@example.com", now, "owner@example.com").run();
        });
        it("should check user access to link", async () => {
            const hasAccess = await db.prepare("SELECT 1 FROM link_maintainers WHERE link_slug = ? AND user_email = ?").bind("test-link", "owner@example.com").first();
            expect(hasAccess).not.toBeNull();
            const noAccess = await db.prepare("SELECT 1 FROM link_maintainers WHERE link_slug = ? AND user_email = ?").bind("test-link", "maintainer@example.com").first();
            expect(noAccess).toBeNull();
        });
        it("should add maintainer", async () => {
            const now = new Date().toISOString();
            await db.prepare("INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)").bind("test-link", "maintainer@example.com", now, "owner@example.com").run();
            const hasAccess = await db.prepare("SELECT 1 FROM link_maintainers WHERE link_slug = ? AND user_email = ?").bind("test-link", "maintainer@example.com").first();
            expect(hasAccess).not.toBeNull();
        });
        it("should remove maintainer", async () => {
            const now = new Date().toISOString();
            await db.prepare("INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)").bind("test-link", "maintainer@example.com", now, "owner@example.com").run();
            let hasAccess = await db.prepare("SELECT 1 FROM link_maintainers WHERE link_slug = ? AND user_email = ?").bind("test-link", "maintainer@example.com").first();
            expect(hasAccess).not.toBeNull();
            await db.prepare("DELETE FROM link_maintainers WHERE link_slug = ? AND user_email = ?").bind("test-link", "maintainer@example.com").run();
            hasAccess = await db.prepare("SELECT 1 FROM link_maintainers WHERE link_slug = ? AND user_email = ?").bind("test-link", "maintainer@example.com").first();
            expect(hasAccess).toBeNull();
        });
        it("should get link maintainers", async () => {
            const now = new Date().toISOString();
            await db.prepare("INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)").bind("test-link", "maintainer@example.com", now, "owner@example.com").run();
            const result = await db.prepare("SELECT link_slug, user_email, added_at, added_by FROM link_maintainers WHERE link_slug = ? ORDER BY added_at ASC").bind("test-link").all();
            expect(result.results).toHaveLength(2);
            expect(result.results.some((m) => m.user_email === "owner@example.com")).toBe(true);
            expect(result.results.some((m) => m.user_email === "maintainer@example.com")).toBe(true);
        });
    });
    describe("Theme Operations", () => {
        it("should get theme by id", async () => {
            const theme = await db.prepare("SELECT id, name, description, css_variables, additional_css, created_by, is_public, created_at FROM themes WHERE id = ?").bind("default").first();
            expect(theme).not.toBeNull();
            expect(theme?.id).toBe("default");
            expect(theme?.name).toBe("Default Light");
            expect(theme?.is_public).toBe(1);
        });
        it("should return null for non-existent theme", async () => {
            const theme = await db.prepare("SELECT * FROM themes WHERE id = ?").bind("nonexistent").first();
            expect(theme).toBeNull();
        });
        it("should get all themes", async () => {
            const result = await db.prepare("SELECT id, name, description, css_variables, additional_css, created_by, is_public, created_at FROM themes ORDER BY name ASC").all();
            expect(result.results.length).toBeGreaterThan(0);
            expect(result.results.some((t) => t.id === "default")).toBe(true);
        });
        it("should get only public themes", async () => {
            const result = await db.prepare("SELECT id, name, description, css_variables, additional_css, created_by, is_public, created_at FROM themes WHERE is_public = 1 ORDER BY name ASC").all();
            expect(result.results.length).toBeGreaterThan(0);
            expect(result.results.every((t) => t.is_public === 1)).toBe(true);
        });
    });
});
