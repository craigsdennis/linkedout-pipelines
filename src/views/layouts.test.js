import { describe, it, expect } from "vitest";
import { BaseLayout, DashboardLayout, AuthLayout } from "./layouts";
import { html } from "hono/html";
describe("Layout Components", () => {
    describe("BaseLayout", () => {
        it("should render basic HTML structure", () => {
            const result = BaseLayout({
                title: "Test Page",
                children: html `<div>Test Content</div>`,
            });
            const htmlString = result.toString();
            expect(htmlString).toContain("<!DOCTYPE html>");
            expect(htmlString).toContain("<title>Test Page - LinkedOut</title>");
            expect(htmlString).toContain('<link rel="stylesheet" href="/styles.css">');
            expect(htmlString).toContain('<body class="base-layout">');
            expect(htmlString).toContain("<div>Test Content</div>");
        });
        it("should include custom styles when provided", () => {
            const result = BaseLayout({
                title: "Test",
                children: html `<div>Content</div>`,
                styles: ".custom { color: red; }",
            });
            const htmlString = result.toString();
            expect(htmlString).toContain("<style>.custom { color: red; }</style>");
        });
        it("should properly escape user content", () => {
            const userInput = "<script>alert('xss')</script>";
            const result = BaseLayout({
                title: "Test",
                children: html `<div>${userInput}</div>`,
            });
            const htmlString = result.toString();
            // Should escape script tags
            expect(htmlString).not.toContain("<script>alert('xss')</script>");
            expect(htmlString).toContain("&lt;script&gt;");
        });
    });
    describe("DashboardLayout", () => {
        it("should render with navigation", () => {
            const result = DashboardLayout({
                title: "Dashboard",
                email: "test@example.com",
                children: html `<div>Dashboard Content</div>`,
            });
            const htmlString = result.toString();
            expect(htmlString).toContain("<!DOCTYPE html>");
            expect(htmlString).toContain('<link rel="stylesheet" href="/styles.css">');
            expect(htmlString).toContain('<body class="dashboard-layout">');
            expect(htmlString).toContain("Welcome, test");
            expect(htmlString).toContain('<a href="/dashboard">Dashboard</a>');
            expect(htmlString).toContain('<a href="/dashboard/analytics">Analytics</a>');
            expect(htmlString).toContain('<a href="/logout">Logout</a>');
        });
        it("should show admin link when user is admin", () => {
            const result = DashboardLayout({
                title: "Dashboard",
                email: "admin@example.com",
                isAdmin: true,
                children: html `<div>Content</div>`,
            });
            const htmlString = result.toString();
            expect(htmlString).toContain('<a href="/dashboard/admin">Admin</a>');
        });
        it("should not show admin link when user is not admin", () => {
            const result = DashboardLayout({
                title: "Dashboard",
                email: "user@example.com",
                isAdmin: false,
                children: html `<div>Content</div>`,
            });
            const htmlString = result.toString();
            expect(htmlString).not.toContain('<a href="/dashboard/admin">Admin</a>');
        });
        it("should include scripts when provided", () => {
            const result = DashboardLayout({
                title: "Dashboard",
                email: "test@example.com",
                scripts: ["/qr.js", "/custom.js"],
                children: html `<div>Content</div>`,
            });
            const htmlString = result.toString();
            expect(htmlString).toContain('<script src="/qr.js"></script>');
            expect(htmlString).toContain('<script src="/custom.js"></script>');
        });
        it("should properly escape user name", () => {
            const maliciousName = "Test<script>alert('xss')</script>";
            const result = DashboardLayout({
                title: "Dashboard",
                email: "test@example.com",
                userName: maliciousName,
                children: html `<div>Content</div>`,
            });
            const htmlString = result.toString();
            expect(htmlString).not.toContain("<script>alert('xss')</script>");
            expect(htmlString).toContain("&lt;script&gt;");
        });
        it("should handle custom styles", () => {
            const result = DashboardLayout({
                title: "Dashboard",
                email: "test@example.com",
                styles: ".custom-class { background: blue; }",
                children: html `<div>Content</div>`,
            });
            const htmlString = result.toString();
            expect(htmlString).toContain("<style>.custom-class { background: blue; }</style>");
        });
    });
    describe("AuthLayout", () => {
        it("should render centered auth layout", () => {
            const result = AuthLayout({
                title: "Login",
                children: html `<form>Login Form</form>`,
            });
            const htmlString = result.toString();
            expect(htmlString).toContain("<!DOCTYPE html>");
            expect(htmlString).toContain("<title>Login - LinkedOut</title>");
            expect(htmlString).toContain('<link rel="stylesheet" href="/styles.css">');
            expect(htmlString).toContain('<body class="auth-layout">');
            expect(htmlString).toContain("<form>Login Form</form>");
        });
        it("should properly escape form content", () => {
            const userInput = '"><script>alert("xss")</script>';
            const result = AuthLayout({
                title: "Login",
                children: html `<div>${userInput}</div>`,
            });
            const htmlString = result.toString();
            expect(htmlString).not.toContain('<script>alert("xss")</script>');
            expect(htmlString).toContain("&lt;script&gt;");
        });
    });
    describe("HTML Template Rendering", () => {
        it("should handle arrays of html templates without join", () => {
            const items = ["Item 1", "Item 2", "Item 3"];
            const result = BaseLayout({
                title: "List",
                children: html `
          <ul>
            ${items.map(item => html `<li>${item}</li>`)}
          </ul>
        `,
            });
            const htmlString = result.toString();
            expect(htmlString).toContain("<li>Item 1</li>");
            expect(htmlString).toContain("<li>Item 2</li>");
            expect(htmlString).toContain("<li>Item 3</li>");
            // Should not show raw HTML
            expect(htmlString).not.toContain("&lt;li&gt;");
        });
        it("should handle conditional rendering with html templates", () => {
            const showContent = true;
            const result = BaseLayout({
                title: "Test",
                children: html `
          ${showContent ? html `<div>Visible</div>` : html ``}
        `,
            });
            const htmlString = result.toString();
            expect(htmlString).toContain("<div>Visible</div>");
        });
        it("should not escape when content is false", () => {
            const showContent = false;
            const result = BaseLayout({
                title: "Test",
                children: html `
          ${showContent ? html `<div>Visible</div>` : html ``}
        `,
            });
            const htmlString = result.toString();
            expect(htmlString).not.toContain("<div>Visible</div>");
        });
    });
    describe("XSS Protection", () => {
        it("should escape dangerous characters in title", () => {
            const result = BaseLayout({
                title: 'Test</title><script>alert("xss")</script>',
                children: html `<div>Content</div>`,
            });
            const htmlString = result.toString();
            expect(htmlString).not.toContain('</title><script>alert("xss")</script> - LinkedOut</title>');
            expect(htmlString).toContain("&lt;script&gt;");
        });
        it("should escape SQL injection attempts in content", () => {
            const maliciousContent = "'; DROP TABLE users; --";
            const result = BaseLayout({
                title: "Test",
                children: html `<div>${maliciousContent}</div>`,
            });
            const htmlString = result.toString();
            // Single quote can be escaped as &#39; or &#x27;
            expect(htmlString).toMatch(/&#(39|x27);; DROP TABLE users; --/);
        });
        it("should handle nested template literals safely", () => {
            const userEmail = "test@example.com";
            const maliciousSlug = '<img src=x onerror="alert(1)">';
            const result = DashboardLayout({
                title: "Test",
                email: userEmail,
                children: html `
          <div>
            <span>${maliciousSlug}</span>
          </div>
        `,
            });
            const htmlString = result.toString();
            expect(htmlString).not.toContain('onerror="alert(1)"');
            expect(htmlString).toContain("&lt;img");
        });
    });
    describe("Edge Cases", () => {
        it("should handle empty children", () => {
            const result = BaseLayout({
                title: "Empty",
                children: html ``,
            });
            const htmlString = result.toString();
            expect(htmlString).toContain("<body class=\"base-layout\">");
            expect(htmlString).toContain("</body>");
        });
        it("should handle undefined styles", () => {
            const result = BaseLayout({
                title: "Test",
                children: html `<div>Content</div>`,
                styles: undefined,
            });
            const htmlString = result.toString();
            expect(htmlString).toContain('<link rel="stylesheet" href="/styles.css">');
            expect(htmlString).not.toContain("<style>undefined</style>");
        });
        it("should handle empty scripts array", () => {
            const result = DashboardLayout({
                title: "Test",
                email: "test@example.com",
                scripts: [],
                children: html `<div>Content</div>`,
            });
            const htmlString = result.toString();
            expect(htmlString).toContain("</body>");
            // Should render body closing tag properly
        });
        it("should handle special characters in email", () => {
            const result = DashboardLayout({
                title: "Test",
                email: "user+test@example.com",
                userName: "Test User",
                children: html `<div>Content</div>`,
            });
            const htmlString = result.toString();
            expect(htmlString).toContain("Test User");
        });
    });
});
