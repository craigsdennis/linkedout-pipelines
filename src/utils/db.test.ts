import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getUserFromDB,
  createUserInDB,
  deleteUserFromDB,
  getAllUsersFromDB,
  getLinkFromDB,
  getLinkWithMaintainers,
  createLinkInDB,
  updateLinkInDB,
  deleteLinkFromDB,
  getUserLinks,
  canUserAccessLink,
  addMaintainerToDB,
  removeMaintainerFromDB,
  getLinkMaintainers,
  getUserAccessibleSlugs,
  getThemeFromDB,
  getAllThemesFromDB,
  getPublicThemesFromDB,
  getUserThemes,
  createThemeInDB,
  updateThemeInDB,
  deleteThemeFromDB,
} from "./db";
import type { User, Link, Theme } from "../types";

// Mock D1Database
const createMockDB = () => {
  const mockDB = {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  };
  return mockDB as unknown as D1Database;
};

// Helper to create mock D1 response
const createD1Response = <T = any>(results?: T[]): any => ({
  success: true,
  meta: {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    changed_db: false,
    changes: 0,
  },
  results: results || [],
});

describe("User Operations", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockDB();
  });

  describe("getUserFromDB", () => {
    it("should return user when found", async () => {
      const mockUser = {
        email: "test@example.com",
        is_admin: 1,
        created_at: "2024-01-01T00:00:00.000Z",
      };

      vi.mocked(db.prepare("").bind("").first).mockResolvedValue(mockUser);

      const result = await getUserFromDB(db, "test@example.com");

      expect(result).toEqual({
        email: "test@example.com",
        is_admin: true,
        created_at: "2024-01-01T00:00:00.000Z",
      });
    });

    it("should return null when user not found", async () => {
      vi.mocked(db.prepare("").bind("").first).mockResolvedValue(null);

      const result = await getUserFromDB(db, "nonexistent@example.com");

      expect(result).toBeNull();
    });

    it("should convert is_admin from number to boolean", async () => {
      const mockUser = {
        email: "admin@example.com",
        is_admin: 0,
        created_at: "2024-01-01T00:00:00.000Z",
      };

      vi.mocked(db.prepare("").bind("").first).mockResolvedValue(mockUser);

      const result = await getUserFromDB(db, "admin@example.com");

      expect(result?.is_admin).toBe(false);
    });
  });

  describe("createUserInDB", () => {
    it("should create a regular user", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      const result = await createUserInDB(db, "newuser@example.com", false);

      expect(result.email).toBe("newuser@example.com");
      expect(result.is_admin).toBe(false);
      expect(result.created_at).toBeDefined();
    });

    it("should create an admin user", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      const result = await createUserInDB(db, "admin@example.com", true);

      expect(result.email).toBe("admin@example.com");
      expect(result.is_admin).toBe(true);
      expect(result.created_at).toBeDefined();
    });
  });

  describe("getAllUsersFromDB", () => {
    it("should return all users", async () => {
      const mockUsers = [
        { email: "user1@example.com", is_admin: 0, created_at: "2024-01-01T00:00:00.000Z" },
        { email: "user2@example.com", is_admin: 1, created_at: "2024-01-02T00:00:00.000Z" },
      ];

      vi.mocked(db.prepare("").all).mockResolvedValue(createD1Response(mockUsers));

      const result = await getAllUsersFromDB(db);

      expect(result).toHaveLength(2);
      expect(result[0].email).toBe("user1@example.com");
      expect(result[0].is_admin).toBe(false);
      expect(result[1].is_admin).toBe(true);
    });

    it("should return empty array when no users", async () => {
      vi.mocked(db.prepare("").all).mockResolvedValue(createD1Response([]));

      const result = await getAllUsersFromDB(db);

      expect(result).toEqual([]);
    });
  });

  describe("deleteUserFromDB", () => {
    it("should delete user without errors", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      await expect(deleteUserFromDB(db, "user@example.com")).resolves.toBeUndefined();
    });
  });
});

describe("Link Operations", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockDB();
  });

  describe("getLinkFromDB", () => {
    it("should return link when found", async () => {
      const mockLink = {
        slug: "test-link",
        title: "Test Link",
        content: "https://example.com",
        theme_id: "default",
        created_by: "user@example.com",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      };

      vi.mocked(db.prepare("").bind("").first).mockResolvedValue(mockLink);

      const result = await getLinkFromDB(db, "test-link");

      expect(result).toEqual(mockLink);
    });

    it("should return null when link not found", async () => {
      vi.mocked(db.prepare("").bind("").first).mockResolvedValue(null);

      const result = await getLinkFromDB(db, "nonexistent");

      expect(result).toBeNull();
    });

    it("should handle null title", async () => {
      const mockLink = {
        slug: "test-link",
        title: null,
        content: "https://example.com",
        theme_id: "default",
        created_by: "user@example.com",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      };

      vi.mocked(db.prepare("").bind("").first).mockResolvedValue(mockLink);

      const result = await getLinkFromDB(db, "test-link");

      expect(result?.title).toBeNull();
    });
  });

  describe("createLinkInDB", () => {
    it("should create link and add creator as maintainer", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      const linkData = {
        slug: "new-link",
        title: "New Link",
        content: "https://example.com",
        theme_id: "default",
        created_by: "creator@example.com",
        custom_css: null,
      };

      const result = await createLinkInDB(db, linkData, "creator@example.com");

      expect(result.slug).toBe("new-link");
      expect(result.title).toBe("New Link");
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });
  });

  describe("updateLinkInDB", () => {
    it("should update link title", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      await expect(
        updateLinkInDB(db, "test-link", { title: "Updated Title" })
      ).resolves.toBeUndefined();
    });

    it("should update link content", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      await expect(
        updateLinkInDB(db, "test-link", { content: "https://new-url.com" })
      ).resolves.toBeUndefined();
    });

    it("should update link theme", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      await expect(
        updateLinkInDB(db, "test-link", { theme_id: "dark" })
      ).resolves.toBeUndefined();
    });

    it("should not run query when no updates provided", async () => {
      const runMock = vi.mocked(db.prepare("").bind("").run);
      
      await updateLinkInDB(db, "test-link", {});

      expect(runMock).not.toHaveBeenCalled();
    });
  });

  describe("getUserLinks", () => {
    it("should return all links for a user", async () => {
      const mockLinks = [
        {
          slug: "link1",
          title: "Link 1",
          content: "https://example1.com",
          theme_id: "default",
          created_by: "user@example.com",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
        {
          slug: "link2",
          title: "Link 2",
          content: "https://example2.com",
          theme_id: "dark",
          created_by: "user@example.com",
          created_at: "2024-01-02T00:00:00.000Z",
          updated_at: "2024-01-02T00:00:00.000Z",
        },
      ];

      vi.mocked(db.prepare("").bind("").all).mockResolvedValue(createD1Response(mockLinks));

      const result = await getUserLinks(db, "user@example.com");

      expect(result).toHaveLength(2);
      expect(result[0].slug).toBe("link1");
      expect(result[1].slug).toBe("link2");
    });

    it("should return empty array when user has no links", async () => {
      vi.mocked(db.prepare("").bind("").all).mockResolvedValue(createD1Response([]));

      const result = await getUserLinks(db, "user@example.com");

      expect(result).toEqual([]);
    });
  });

  describe("deleteLinkFromDB", () => {
    it("should delete link without errors", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      await expect(deleteLinkFromDB(db, "test-link")).resolves.toBeUndefined();
    });
  });
});

describe("Maintainer Operations", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockDB();
  });

  describe("canUserAccessLink", () => {
    it("should return true when user is a maintainer", async () => {
      vi.mocked(db.prepare("").bind("").first).mockResolvedValue({ "1": 1 });

      const result = await canUserAccessLink(db, "test-link", "user@example.com");

      expect(result).toBe(true);
    });

    it("should return false when user is not a maintainer", async () => {
      vi.mocked(db.prepare("").bind("").first).mockResolvedValue(null);

      const result = await canUserAccessLink(db, "test-link", "user@example.com");

      expect(result).toBe(false);
    });
  });

  describe("addMaintainerToDB", () => {
    it("should add maintainer without errors", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      await expect(
        addMaintainerToDB(db, "test-link", "newmaintainer@example.com", "admin@example.com")
      ).resolves.toBeUndefined();
    });
  });

  describe("removeMaintainerFromDB", () => {
    it("should remove maintainer without errors", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      await expect(
        removeMaintainerFromDB(db, "test-link", "maintainer@example.com")
      ).resolves.toBeUndefined();
    });
  });

  describe("getLinkMaintainers", () => {
    it("should return all maintainers for a link", async () => {
      const mockMaintainers = [
        {
          link_slug: "test-link",
          user_email: "user1@example.com",
          added_at: "2024-01-01T00:00:00.000Z",
          added_by: "admin@example.com",
        },
        {
          link_slug: "test-link",
          user_email: "user2@example.com",
          added_at: "2024-01-02T00:00:00.000Z",
          added_by: "admin@example.com",
        },
      ];

      vi.mocked(db.prepare("").bind("").all).mockResolvedValue(createD1Response(mockMaintainers));

      const result = await getLinkMaintainers(db, "test-link");

      expect(result).toHaveLength(2);
      expect(result[0].user_email).toBe("user1@example.com");
      expect(result[1].user_email).toBe("user2@example.com");
    });

    it("should return empty array when link has no maintainers", async () => {
      vi.mocked(db.prepare("").bind("").all).mockResolvedValue(createD1Response([]));

      const result = await getLinkMaintainers(db, "test-link");

      expect(result).toEqual([]);
    });
  });

  describe("getUserAccessibleSlugs", () => {
    it("should return all slugs user can access", async () => {
      const mockSlugs = [
        { link_slug: "link1" },
        { link_slug: "link2" },
        { link_slug: "link3" },
      ];

      vi.mocked(db.prepare("").bind("").all).mockResolvedValue(createD1Response(mockSlugs));

      const result = await getUserAccessibleSlugs(db, "user@example.com");

      expect(result).toEqual(["link1", "link2", "link3"]);
    });

    it("should return empty array when user has no accessible links", async () => {
      vi.mocked(db.prepare("").bind("").all).mockResolvedValue(createD1Response([]));

      const result = await getUserAccessibleSlugs(db, "user@example.com");

      expect(result).toEqual([]);
    });
  });
});

describe("Theme Operations", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockDB();
  });

  describe("getThemeFromDB", () => {
    it("should return theme when found", async () => {
      const mockTheme = {
        id: "default",
        name: "Default Theme",
        description: "A default theme",
        css_variables: JSON.stringify({
          "primary-color": "#007bff",
          "background": "#ffffff",
        }),
        additional_css: null,
        created_by: null,
        is_public: 1,
        created_at: "2024-01-01T00:00:00.000Z",
      };

      vi.mocked(db.prepare("").bind("").first).mockResolvedValue(mockTheme);

      const result = await getThemeFromDB(db, "default");

      expect(result).toEqual({
        id: "default",
        name: "Default Theme",
        description: "A default theme",
        css_variables: {
          "primary-color": "#007bff",
          "background": "#ffffff",
        },
        additional_css: null,
        created_by: null,
        is_public: true,
        created_at: "2024-01-01T00:00:00.000Z",
      });
    });

    it("should return null when theme not found", async () => {
      vi.mocked(db.prepare("").bind("").first).mockResolvedValue(null);

      const result = await getThemeFromDB(db, "nonexistent");

      expect(result).toBeNull();
    });

    it("should parse css_variables JSON", async () => {
      const mockTheme = {
        id: "dark",
        name: "Dark Theme",
        description: null,
        css_variables: JSON.stringify({
          "primary-color": "#bb86fc",
          "background": "#121212",
        }),
        additional_css: null,
        created_by: null,
        is_public: 1,
        created_at: "2024-01-01T00:00:00.000Z",
      };

      vi.mocked(db.prepare("").bind("").first).mockResolvedValue(mockTheme);

      const result = await getThemeFromDB(db, "dark");

      expect(result?.css_variables).toEqual({
        "primary-color": "#bb86fc",
        "background": "#121212",
      });
    });
  });

  describe("getPublicThemesFromDB", () => {
    it("should return only public themes", async () => {
      const mockThemes = [
        {
          id: "default",
          name: "Default",
          description: null,
          css_variables: JSON.stringify({ "primary-color": "#007bff" }),
          additional_css: null,
          created_by: null,
          is_public: 1,
          created_at: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "dark",
          name: "Dark",
          description: null,
          css_variables: JSON.stringify({ "primary-color": "#bb86fc" }),
          additional_css: null,
          created_by: null,
          is_public: 1,
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ];

      vi.mocked(db.prepare("").all).mockResolvedValue(createD1Response(mockThemes));

      const result = await getPublicThemesFromDB(db);

      expect(result).toHaveLength(2);
      expect(result.every((theme) => theme.is_public)).toBe(true);
    });

    it("should return empty array when no public themes", async () => {
      vi.mocked(db.prepare("").all).mockResolvedValue(createD1Response([]));

      const result = await getPublicThemesFromDB(db);

      expect(result).toEqual([]);
    });
  });

  describe("getUserThemes", () => {
    it("should return user's private themes and all public themes", async () => {
      const mockThemes = [
        {
          id: "default",
          name: "Default",
          description: null,
          css_variables: JSON.stringify({ "primary-color": "#007bff" }),
          additional_css: null,
          created_by: null,
          is_public: 1,
          created_at: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "my-theme",
          name: "My Custom Theme",
          description: null,
          css_variables: JSON.stringify({ "primary-color": "#ff0000" }),
          additional_css: null,
          created_by: "user@example.com",
          is_public: 0,
          created_at: "2024-01-02T00:00:00.000Z",
        },
      ];

      vi.mocked(db.prepare("").bind("").all).mockResolvedValue(createD1Response(mockThemes));

      const result = await getUserThemes(db, "user@example.com");

      expect(result).toHaveLength(2);
      expect(result[0].is_public).toBe(true);
      expect(result[1].is_public).toBe(false);
      expect(result[1].created_by).toBe("user@example.com");
    });
  });

  describe("createThemeInDB", () => {
    it("should create theme with correct structure", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      const themeData = {
        id: "new-theme",
        name: "New Theme",
        description: "A new theme",
        css_variables: {
          "primary-color": "#00ff00",
          "background": "#000000",
        },
        additional_css: null,
        created_by: "user@example.com",
        is_public: false,
      };

      const result = await createThemeInDB(db, themeData);

      expect(result.id).toBe("new-theme");
      expect(result.name).toBe("New Theme");
      expect(result.created_at).toBeDefined();
    });
  });

  describe("updateThemeInDB", () => {
    it("should update theme name", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      await expect(
        updateThemeInDB(db, "test-theme", { name: "Updated Theme Name" })
      ).resolves.toBeUndefined();
    });

    it("should update theme css_variables", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      await expect(
        updateThemeInDB(db, "test-theme", {
          css_variables: { "primary-color": "#ff00ff" },
        })
      ).resolves.toBeUndefined();
    });

    it("should not run query when no updates provided", async () => {
      const runMock = vi.mocked(db.prepare("").bind("").run);
      
      await updateThemeInDB(db, "test-theme", {});

      expect(runMock).not.toHaveBeenCalled();
    });
  });

  describe("deleteThemeFromDB", () => {
    it("should delete theme without errors", async () => {
      vi.mocked(db.prepare("").bind("").run).mockResolvedValue(createD1Response());

      await expect(deleteThemeFromDB(db, "test-theme")).resolves.toBeUndefined();
    });
  });

  describe("getAllThemesFromDB", () => {
    it("should return all themes", async () => {
      const mockThemes = [
        {
          id: "default",
          name: "Default",
          description: null,
          css_variables: JSON.stringify({ "primary-color": "#007bff" }),
          additional_css: null,
          created_by: null,
          is_public: 1,
          created_at: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "custom",
          name: "Custom",
          description: null,
          css_variables: JSON.stringify({ "primary-color": "#ff0000" }),
          additional_css: null,
          created_by: "user@example.com",
          is_public: 0,
          created_at: "2024-01-02T00:00:00.000Z",
        },
      ];

      vi.mocked(db.prepare("").all).mockResolvedValue(createD1Response(mockThemes));

      const result = await getAllThemesFromDB(db);

      expect(result).toHaveLength(2);
    });
  });
});
