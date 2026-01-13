import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
    // Run tests with access to Cloudflare Workers runtime
    // Uses wrangler's getPlatformProxy for local D1 testing
    },
});
