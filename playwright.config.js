import { defineConfig, devices } from "@playwright/test";

// Browser smoke tests for the layout- and theming-dependent behaviour that the
// jsdom wiring tests can't reach (jsdom has no layout and no computed
// color-scheme). Specs live in e2e/ with a .spec.js suffix so `node --test`
// (which only matches *.test.js and test/) never tries to run them.
//
// The site has no build step, so the "server" is just python's http.server on
// the same port as the .claude/launch.json "site" config. Playwright starts it
// on CI and reuses a running one locally.
const PORT = 4174;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  // WebKit alongside Chromium: the two size and scroll a text input
  // differently, and Safari is where the prompt once clipped its own text.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
