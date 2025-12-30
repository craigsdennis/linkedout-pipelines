import { describe, it, expect } from "vitest";
import type { ClickEvent, Link, User } from "./types";

describe("TypeScript Types", () => {
  describe("ClickEvent", () => {
    it("should accept valid click event", () => {
      const event: ClickEvent = {
        timestamp: new Date().toISOString(),
        event_type: "click",
        slug: "test-page",
        owner_email: "test@example.com",
        url: "https://example.com/out/test-page",
        out: "https://google.com",
        user_agent: "Mozilla/5.0",
        referer: "https://example.com",
        country: "US",
        city: "San Francisco",
        region: "CA",
        colo: "SFO",
        latitude: "37.7749",
        longitude: "-122.4194",
        timezone: "America/Los_Angeles",
      };

      expect(event.event_type).toBe("click");
      expect(event.country).toBe("US");
      expect(event.colo).toBe("SFO");
    });

    it("should accept page_view event", () => {
      const event: ClickEvent = {
        timestamp: new Date().toISOString(),
        event_type: "page_view",
        slug: "test-page",
        owner_email: "test@example.com",
        url: "https://example.com/out/test-page",
        out: null,
      };

      expect(event.event_type).toBe("page_view");
      expect(event.out).toBeNull();
    });

    it("should accept qr_scan event", () => {
      const event: ClickEvent = {
        timestamp: new Date().toISOString(),
        event_type: "qr_scan",
        slug: "test-page",
        owner_email: "test@example.com",
        url: "https://example.com/q/test-page",
        out: null,
      };

      expect(event.event_type).toBe("qr_scan");
    });
  });

  describe("Link", () => {
    it("should accept valid link", () => {
      const link: Link = {
        slug: "my-page",
        content: "# Hello World\n\n[Link](https://example.com)",
        owner_email: "test@example.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(link.slug).toBe("my-page");
      expect(link.content).toContain("Hello World");
    });

    it("should accept link with optional custom_css", () => {
      const link: Link = {
        slug: "styled-page",
        content: "# Styled Page",
        owner_email: "test@example.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        custom_css: "body { background: blue; }",
      };

      expect(link.custom_css).toBe("body { background: blue; }");
    });
  });

  describe("User", () => {
    it("should accept regular user", () => {
      const user: User = {
        email: "user@example.com",
        created_at: new Date().toISOString(),
        is_admin: false,
      };

      expect(user.is_admin).toBe(false);
    });

    it("should accept admin user", () => {
      const user: User = {
        email: "admin@example.com",
        created_at: new Date().toISOString(),
        is_admin: true,
      };

      expect(user.is_admin).toBe(true);
    });
  });
});
