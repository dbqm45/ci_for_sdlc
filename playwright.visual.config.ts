import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Visual regression: screenshots compared with the baselines in e2e/__screenshots__.
 * Fonts and rendering differ between machines, so baselines are created and compared only in the
 * Playwright Docker image pinned in .github/workflows/regression-nightly.yml (README → Testy regresji).
 */
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: ['visual.spec.ts'],
  grepInvert: undefined,
  projects: [{ ...base.projects![0]!, name: 'visual' }],
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 } },
});
