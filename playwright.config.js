/**
 * playwright.config.js — Конфигурация E2E тестов с системным браузером
 */

module.exports = {
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    // ✅ ИСПОЛЬЗУЕМ СИСТЕМНЫЙ CHROME вместо загружаемого
    channel: 'chrome', // или 'chromium', 'msedge'
    headless: false,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  reporter: [['html'], ['list']],
  projects: [
    {
      name: 'chrome-system',
      use: { 
        channel: 'chrome', // Использует установленный Chrome
      },
    },
  ],
  fullyParallel: false,
  workers: 1,
};