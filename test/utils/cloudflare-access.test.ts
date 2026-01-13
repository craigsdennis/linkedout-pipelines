/**
 * Cloudflare Access JWT Utility Tests
 * Tests JWT decoding, validation, and error handling
 */

import { describe, it, expect } from "vitest";
import { 
  decodeCloudflareAccessJWT, 
  getUserFromAccessJWT,
  type CloudflareAccessJWT 
} from "../../src/utils/cloudflare-access";

describe("Cloudflare Access JWT Utilities", () => {
  // Helper to create a base64url-encoded JWT
  function createMockJWT(payload: any): string {
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payloadStr = btoa(JSON.stringify(payload));
    const signature = btoa("mock-signature");
    
    // Convert to base64url (replace + with -, / with _, remove =)
    const toBase64Url = (str: string) => str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    
    return `${toBase64Url(header)}.${toBase64Url(payloadStr)}.${toBase64Url(signature)}`;
  }

  describe("decodeCloudflareAccessJWT", () => {
    it("should decode a valid JWT with all fields", () => {
      const payload: CloudflareAccessJWT = {
        email: "test@example.com",
        name: "Test User",
        sub: "user123",
        country: "US",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };
      
      const jwt = createMockJWT(payload);
      const decoded = decodeCloudflareAccessJWT(jwt);
      
      expect(decoded).toBeDefined();
      expect(decoded?.email).toBe("test@example.com");
      expect(decoded?.name).toBe("Test User");
      expect(decoded?.sub).toBe("user123");
      expect(decoded?.country).toBe("US");
    });

    it("should decode JWT with minimal fields (email only)", () => {
      const payload = {
        email: "minimal@example.com",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      const decoded = decodeCloudflareAccessJWT(jwt);
      
      expect(decoded).toBeDefined();
      expect(decoded?.email).toBe("minimal@example.com");
    });

    it("should derive name from email if name is missing", () => {
      const payload = {
        email: "john.doe@example.com",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      const decoded = decodeCloudflareAccessJWT(jwt);
      
      expect(decoded).toBeDefined();
      expect(decoded?.email).toBe("john.doe@example.com");
      // Name is derived from email automatically in decodeCloudflareAccessJWT
      expect(decoded?.name).toBe("john.doe");
    });

    it("should return null for JWT missing email field", () => {
      const payload = {
        name: "Test User",
        sub: "user123",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      const decoded = decodeCloudflareAccessJWT(jwt);
      
      expect(decoded).toBeNull();
    });

    it("should return null for expired JWT", () => {
      const payload = {
        email: "test@example.com",
        name: "Test User",
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
      };
      
      const jwt = createMockJWT(payload);
      const decoded = decodeCloudflareAccessJWT(jwt);
      
      expect(decoded).toBeNull();
    });

    it("should return null for invalid JWT format (not 3 parts)", () => {
      const invalidJwts = [
        "invalid",
        "header.payload", // Only 2 parts
        "header.payload.signature.extra", // 4 parts
        "",
      ];
      
      for (const jwt of invalidJwts) {
        const decoded = decodeCloudflareAccessJWT(jwt);
        expect(decoded).toBeNull();
      }
    });

    it("should return null for malformed base64 in payload", () => {
      const jwt = "valid-header.!!!invalid-base64!!!.valid-signature";
      const decoded = decodeCloudflareAccessJWT(jwt);
      
      expect(decoded).toBeNull();
    });

    it("should handle JWT with groups and teams", () => {
      const payload: CloudflareAccessJWT = {
        email: "admin@example.com",
        name: "Admin User",
        groups: [
          { id: 1, name: "admins", teams: [{ name: "engineering" }] },
          { id: 2, name: "users" },
        ],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      const decoded = decodeCloudflareAccessJWT(jwt);
      
      expect(decoded).toBeDefined();
      expect(decoded?.groups).toHaveLength(2);
      expect(decoded?.groups?.[0].name).toBe("admins");
      expect(decoded?.groups?.[0].teams?.[0].name).toBe("engineering");
    });

    it("should handle JWT without expiration", () => {
      const payload = {
        email: "test@example.com",
        name: "Test User",
        iat: Math.floor(Date.now() / 1000),
        // No exp field
      };
      
      const jwt = createMockJWT(payload);
      const decoded = decodeCloudflareAccessJWT(jwt);
      
      expect(decoded).toBeDefined();
      expect(decoded?.email).toBe("test@example.com");
    });
  });

  describe("getUserFromAccessJWT", () => {
    it("should extract user info from valid JWT", () => {
      const payload = {
        email: "test@example.com",
        name: "Test User",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      const user = getUserFromAccessJWT(jwt);
      
      expect(user).toBeDefined();
      expect(user?.email).toBe("test@example.com");
      expect(user?.name).toBe("Test User");
    });

    it("should return null for undefined JWT header", () => {
      const user = getUserFromAccessJWT(undefined);
      expect(user).toBeNull();
    });

    it("should return null for empty JWT header", () => {
      const user = getUserFromAccessJWT("");
      expect(user).toBeNull();
    });

    it("should derive name from email username when name is missing", () => {
      const payload = {
        email: "john.doe@example.com",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      const user = getUserFromAccessJWT(jwt);
      
      expect(user).toBeDefined();
      expect(user?.email).toBe("john.doe@example.com");
      expect(user?.name).toBe("john.doe"); // Derived from email
    });

    it("should handle complex email addresses", () => {
      const testCases = [
        { email: "user+tag@example.com", expectedName: "user+tag" },
        { email: "first.last@company.co.uk", expectedName: "first.last" },
        { email: "123@numbers.com", expectedName: "123" },
      ];
      
      for (const { email, expectedName } of testCases) {
        const payload = {
          email,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        };
        
        const jwt = createMockJWT(payload);
        const user = getUserFromAccessJWT(jwt);
        
        expect(user).toBeDefined();
        expect(user?.email).toBe(email);
        expect(user?.name).toBe(expectedName);
      }
    });

    it("should return null for invalid JWT", () => {
      const user = getUserFromAccessJWT("invalid-jwt");
      expect(user).toBeNull();
    });

    it("should return null for expired JWT", () => {
      const payload = {
        email: "test@example.com",
        name: "Test User",
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired
      };
      
      const jwt = createMockJWT(payload);
      const user = getUserFromAccessJWT(jwt);
      
      expect(user).toBeNull();
    });

    it("should prefer provided name over derived name", () => {
      const payload = {
        email: "test@example.com",
        name: "Actual Name", // This should be used
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      const user = getUserFromAccessJWT(jwt);
      
      expect(user).toBeDefined();
      expect(user?.name).toBe("Actual Name"); // Not "test"
    });
  });

  describe("Edge Cases", () => {
    it("should handle JWT with special characters in email", () => {
      const payload = {
        email: "user+special_chars.test@example.com",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      const decoded = decodeCloudflareAccessJWT(jwt);
      
      expect(decoded).toBeDefined();
      expect(decoded?.email).toBe("user+special_chars.test@example.com");
    });

    it("should handle JWT with very long expiration", () => {
      const payload = {
        email: "test@example.com",
        name: "Test User",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400 * 365, // 1 year from now
      };
      
      const jwt = createMockJWT(payload);
      const decoded = decodeCloudflareAccessJWT(jwt);
      
      expect(decoded).toBeDefined();
      expect(decoded?.email).toBe("test@example.com");
    });

    it("should handle JWT with additional custom fields", () => {
      const payload = {
        email: "test@example.com",
        name: "Test User",
        custom_field: "custom_value",
        another_field: 123,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      
      const jwt = createMockJWT(payload);
      const decoded = decodeCloudflareAccessJWT(jwt);
      
      expect(decoded).toBeDefined();
      expect(decoded?.email).toBe("test@example.com");
      // Custom fields should be preserved
      expect((decoded as any).custom_field).toBe("custom_value");
      expect((decoded as any).another_field).toBe(123);
    });
  });
});
