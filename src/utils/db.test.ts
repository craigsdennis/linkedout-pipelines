import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted() to create mocks that will be available before vi.mock() runs
const mocks = vi.hoisted(() => {
  return {
    mockDB: {
      prepare: vi.fn(),
      bind: vi.fn(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    }
  };
});

// Mock cloudflare:workers module BEFORE importing db.ts
vi.mock("cloudflare:workers", () => ({
  env: { DB: mocks.mockDB }
}));

// NOW import the module - it will receive the mocked env
import {
  getUser,
  createUser,
  deleteUser,
  getAllUsers,
  getLink,
  createLink,
} from "./db";

describe("Database Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the prepare mock to return chainable methods
    mocks.mockDB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    });
  });

  describe("User Operations", () => {
    it("should get user by email", async () => {
      const mockUser = {
        email: "test@example.com",
        is_admin: 1,
        created_at: "2024-01-01T00:00:00.000Z",
      };

      const mockFirst = vi.fn().mockResolvedValue(mockUser);
      const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
      mocks.mockDB.prepare.mockReturnValue({ bind: mockBind });

      const result = await getUser("test@example.com");

      expect(mocks.mockDB.prepare).toHaveBeenCalledWith(
        "SELECT email, is_admin, created_at FROM users WHERE email = ?"
      );
      expect(mockBind).toHaveBeenCalledWith("test@example.com");
      expect(result).toEqual({
        email: "test@example.com",
        is_admin: true,
        created_at: "2024-01-01T00:00:00.000Z",
      });
    });

    it("should return null when user not found", async () => {
      const mockFirst = vi.fn().mockResolvedValue(null);
      const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
      mocks.mockDB.prepare.mockReturnValue({ bind: mockBind });

      const result = await getUser("nonexistent@example.com");

      expect(result).toBeNull();
    });

    it("should create a new user", async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true });
      const mockBind = vi.fn().mockReturnValue({ run: mockRun });
      mocks.mockDB.prepare.mockReturnValue({ bind: mockBind });

      const result = await createUser("new@example.com", false);

      expect(mocks.mockDB.prepare).toHaveBeenCalledWith(
        "INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)"
      );
      expect(result.email).toBe("new@example.com");
      expect(result.is_admin).toBe(false);
      expect(result.created_at).toBeDefined();
    });

    it("should delete user", async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true });
      const mockBind = vi.fn().mockReturnValue({ run: mockRun });
      mocks.mockDB.prepare.mockReturnValue({ bind: mockBind });

      await deleteUser("test@example.com");

      expect(mocks.mockDB.prepare).toHaveBeenCalledWith(
        "DELETE FROM users WHERE email = ?"
      );
      expect(mockBind).toHaveBeenCalledWith("test@example.com");
    });

    it("should get all users", async () => {
      const mockUsers = {
        results: [
          { email: "user1@example.com", is_admin: 1, created_at: "2024-01-01" },
          { email: "user2@example.com", is_admin: 0, created_at: "2024-01-02" },
        ],
      };

      const mockAll = vi.fn().mockResolvedValue(mockUsers);
      mocks.mockDB.prepare.mockReturnValue({ all: mockAll });

      const result = await getAllUsers();

      expect(result).toHaveLength(2);
      expect(result[0].is_admin).toBe(true);
      expect(result[1].is_admin).toBe(false);
    });
  });

  describe("Link Operations", () => {
    it("should get link by slug", async () => {
      const mockLink = {
        slug: "test-link",
        title: "Test Link",
        content: "# Test Content",
        theme_id: "default",
        created_by: "test@example.com",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        custom_css: null,
      };

      const mockFirst = vi.fn().mockResolvedValue(mockLink);
      const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
      mocks.mockDB.prepare.mockReturnValue({ bind: mockBind });

      const result = await getLink("test-link");

      expect(result).toEqual(mockLink);
      expect(mocks.mockDB.prepare).toHaveBeenCalled();
    });

    it("should return null when link not found", async () => {
      const mockFirst = vi.fn().mockResolvedValue(null);
      const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
      mocks.mockDB.prepare.mockReturnValue({ bind: mockBind });

      const result = await getLink("nonexistent-slug");

      expect(result).toBeNull();
    });

    it("should create a new link", async () => {
      // Mock the INSERT query for the link
      const mockRunLink = vi.fn().mockResolvedValue({ success: true });
      const mockBindLink = vi.fn().mockReturnValue({ run: mockRunLink });
      
      // Mock the INSERT query for maintainer
      const mockRunMaintainer = vi.fn().mockResolvedValue({ success: true });
      const mockBindMaintainer = vi.fn().mockReturnValue({ run: mockRunMaintainer });

      // Setup prepare to return different mocks based on call order
      mocks.mockDB.prepare
        .mockReturnValueOnce({ bind: mockBindLink })
        .mockReturnValueOnce({ bind: mockBindMaintainer });

      const newLink = {
        slug: "new-link",
        title: "New Link",
        content: "# New Content",
        theme_id: "default",
        created_by: "test@example.com",
        custom_css: null,
      };

      const result = await createLink(newLink, "test@example.com");

      expect(result.slug).toBe("new-link");
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
      expect(mocks.mockDB.prepare).toHaveBeenCalledTimes(2); // link + maintainer
    });
  });
});
