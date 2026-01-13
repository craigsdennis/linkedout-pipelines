import { describe, it, expect } from "vitest";
import type { ClickEvent, Link, User } from "../src/types";

describe("TypeScript Types", () => {
  describe("ClickEvent", () => {
    it("should accept valid click event (v6 - no owner_email)", () => {
      const event: ClickEvent = {
        timestamp: new Date().toISOString(),
        event_type: "click",
        slug: "test-page",
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
        url: "https://example.com/q/test-page",
        out: null,
      };

      expect(event.event_type).toBe("qr_scan");
    });
  });

  describe("Link", () => {
    it("should accept valid link with theme", () => {
      const link: Link = {
        slug: "my-page",
        title: null,
        content: "# Hello World\n\n[Link](https://example.com)",
        theme_id: "default",
        created_by: "test@example.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        custom_css: null,
      };

      expect(link.slug).toBe("my-page");
      expect(link.content).toContain("Hello World");
      expect(link.theme_id).toBe("default");
    });

    it("should accept link with title", () => {
      const link: Link = {
        slug: "styled-page",
        title: "My Styled Page",
        content: "# Styled Page",
        theme_id: "dark",
        created_by: "test@example.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        custom_css: null,
      };

      expect(link.title).toBe("My Styled Page");
      expect(link.theme_id).toBe("dark");
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
