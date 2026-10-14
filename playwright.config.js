// Local: BASE_URL defaults to the built dist/ served by scripts/serve.mjs. Live: BASE_URL=https://outils.vread.fr/chapter-checks/
import { defineConfig } from '@playwright/test';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4181/chapter-checks/';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: BASE_URL, locale: 'en-US' },
  webServer: process.env.BASE_URL ? undefined : { command: 'PORT=4181 node scripts/serve.mjs', url: 'http://localhost:4181/chapter-checks/', reuseExistingServer: true },
});
