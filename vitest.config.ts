import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run unit tests in Node.js environment
    // For Workers integration tests, use wrangler dev + separate e2e test suite
  },
});
