import { test } from '@playwright/test';
import { argosScreenshot } from '@argos-ci/playwright';

const PAGES_TO_CAPTURE = [
  { path: '/', snapshot: 'home' },
  { path: '/pricing', snapshot: 'pricing' },
  { path: '/research', snapshot: 'research' },
];

test.describe('Falaya visual regression', () => {
  for (const pageConfig of PAGES_TO_CAPTURE) {
    test(`Visual snapshot: ${pageConfig.snapshot}`, async ({ page, baseURL }) => {
      await page.goto(new URL(pageConfig.path, baseURL).toString(), {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForLoadState('networkidle');

      await page.addStyleTag({
        content: `
          *,
          *::before,
          *::after {
            animation-duration: 0s !important;
            transition-duration: 0s !important;
          }
        `,
      });

      await argosScreenshot(page, pageConfig.snapshot, {
        fullPage: true,
      });
    });
  }
});
