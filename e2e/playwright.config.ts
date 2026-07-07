import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 15000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: 'npx tsx src/server.ts',
    port: 3000,
    cwd: '..',
    reuseExistingServer: true,
    timeout: 15000,
  },
})
