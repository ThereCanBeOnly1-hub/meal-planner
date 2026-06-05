/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so it can't affect the production build.
export default defineConfig({
  test: {
    environment: "node", // helper tests run in node; component tests opt into jsdom per-file
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
