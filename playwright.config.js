import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:  './tests',
  timeout:  600_000,   // 10 min per test – large member lists take time
  retries:  0,
  workers:  1,         // always serial – bot is stateful
  reporter: [['list'], ['html', { outputFolder: 'tests/report', open: 'never' }]],

  use: {
    channel:              'chrome',   // use installed Google Chrome
    headless:             false,      // keep visible so you can watch it work
    ignoreHTTPSErrors:    true,
    actionTimeout:        15_000,
    navigationTimeout:    60_000,
    screenshot:           'only-on-failure',
    video:                'retain-on-failure',
  },
});