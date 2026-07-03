import { defineConfig, devices } from '@playwright/test'

// This suite drives the app against a real pyobs-core module over a real
// XMPP connection (see e2e/fixtures.ts) — there is no mocked backend. It
// needs XMPP_TEST_JID / XMPP_TEST_PASSWORD and a reachable ejabberd server;
// tests skip themselves with a clear reason when that's not available (e.g.
// in CI), rather than failing.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30000,
  },
})
