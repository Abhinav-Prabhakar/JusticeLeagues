import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against its own ports and its own SQLite file, so a dev server
 * (or your real local data) never leaks into a test run.
 *
 *   api  http://127.0.0.1:8788  data/e2e.db (reset on start)
 *   web  http://localhost:5174  Vite, proxying /api to the e2e api
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run e2e:api",
      url: "http://127.0.0.1:8788/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run e2e:web",
      url: "http://localhost:5174",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
