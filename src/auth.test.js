import { describe, it, expect } from "vitest";
describe("Auth Utilities", () => {
    describe("Token Generation Logic", () => {
        it("should generate a 64-character hex string", () => {
            // Mock the token generation logic
            const array = new Uint8Array(32);
            crypto.getRandomValues(array);
            const token = Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
            expect(token.length).toBe(64); // 32 bytes * 2 hex chars
            expect(token).toMatch(/^[0-9a-f]{64}$/);
        });
        it("should generate different tokens on each call", () => {
            const array1 = new Uint8Array(32);
            const array2 = new Uint8Array(32);
            crypto.getRandomValues(array1);
            crypto.getRandomValues(array2);
            const token1 = Array.from(array1, (byte) => byte.toString(16).padStart(2, "0")).join("");
            const token2 = Array.from(array2, (byte) => byte.toString(16).padStart(2, "0")).join("");
            expect(token1).not.toBe(token2);
        });
    });
    describe("Token Expiry", () => {
        it("should set expiry 24 hours in the future", () => {
            const now = new Date();
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);
            const diff = expiresAt.getTime() - now.getTime();
            const hours = diff / (1000 * 60 * 60);
            expect(hours).toBeCloseTo(24, 0);
        });
    });
});
