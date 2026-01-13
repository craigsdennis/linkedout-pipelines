import { describe, it, expect } from "vitest";
import schema from "../schema.json";
describe("Pipeline Schema (v6 - no owner_email)", () => {
    it("should have all required fields", () => {
        const fields = schema.fields;
        const fieldNames = fields.map((f) => f.name);
        // Core required fields (v6)
        expect(fieldNames).toContain("timestamp");
        expect(fieldNames).toContain("event_type");
        expect(fieldNames).toContain("slug");
        // v6: owner_email removed
        expect(fieldNames).not.toContain("owner_email");
        // Optional tracking fields
        expect(fieldNames).toContain("url");
        expect(fieldNames).toContain("out");
        expect(fieldNames).toContain("user_agent");
        expect(fieldNames).toContain("referer");
        expect(fieldNames).toContain("visitor_id");
        // Cloudflare properties
        expect(fieldNames).toContain("country");
        expect(fieldNames).toContain("city");
        expect(fieldNames).toContain("region");
        expect(fieldNames).toContain("colo");
        expect(fieldNames).toContain("latitude");
        expect(fieldNames).toContain("longitude");
        expect(fieldNames).toContain("timezone");
    });
    it("should mark core fields as required", () => {
        const requiredFields = schema.fields
            .filter((f) => f.required)
            .map((f) => f.name);
        expect(requiredFields).toContain("timestamp");
        expect(requiredFields).toContain("event_type");
        expect(requiredFields).toContain("slug");
        // v6: owner_email removed
        expect(requiredFields).not.toContain("owner_email");
    });
    it("should mark CF properties as optional", () => {
        const cfFields = ["country", "city", "region", "colo", "latitude", "longitude", "timezone"];
        for (const fieldName of cfFields) {
            const field = schema.fields.find((f) => f.name === fieldName);
            expect(field).toBeDefined();
            expect(field?.required).toBe(false);
        }
    });
    it("should use string type for all fields", () => {
        // All fields in our schema are strings
        for (const field of schema.fields) {
            expect(field.type).toBe("string");
        }
    });
});
