/**
 * playwright.config.js — Конфигурация E2E тестов с системным браузером
 * Включает поддержку скрин-тестирования
 */

const path = require('path');

module.exports = {
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
    // Настройки для визуальных comparisons
    toHaveScreenshot: {
      threshold: 0.2, // Допустимое отличие пикселей (20%)
    },
  },
  use: {
    // ✅ ИСПОЛЬЗУЕМ СИСТЕМНЫЙ CHROME вместо загружаемого
    channel: 'chrome', // или 'chromium', 'msedge'
    headless: false,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    
    // 📸 Настройки скрин-тестирования
    _traceOnFailureIncludes: ['screenshot', 'console'],
  },
  reporter: [
    ['html'], 
    ['list']
  ],
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
  
  // 📁 Директории для скриншотов
  outputDir: path.join(__dirname, 'test-results'),
};
