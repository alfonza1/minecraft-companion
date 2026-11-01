import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const localArtifact = relative => fileURLToPath(new URL(`../../.git/${relative}`, import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000, toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css', maxDiffPixelRatio: 0.002 } },
  outputDir: localArtifact('visual-test-results'),
  snapshotPathTemplate: '{testDir}/snapshots/{projectName}/{testFileName}/{arg}{ext}',
  reporter: [['list'], ['json', { outputFile: localArtifact('design-after/results.json') }], ['html', { outputFolder: localArtifact('visual-report'), open: 'never' }]],
  use: { browserName: 'chromium', headless: true, reducedMotion: 'reduce', timezoneId: 'UTC', locale: 'en-US', colorScheme: 'dark', serviceWorkers: 'block', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 } } },
  ],
});
