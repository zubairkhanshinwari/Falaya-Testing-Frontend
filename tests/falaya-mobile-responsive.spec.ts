import path from 'node:path';
import { devices, expect, test } from '@playwright/test';
import { argosScreenshot } from '@argos-ci/playwright';
import {
  discoverNavUrls,
  loadCachedDiscoveredUrls,
  normalizeUrl,
  writeJsonFile,
} from '../utils/linkDiscovery';
import {
  MobileCheck,
  writeMobileResponsiveReport,
} from '../utils/reportWriter';

const REPORTS_DIR = path.resolve('reports');
const DISCOVERED_URLS_CACHE = path.join(REPORTS_DIR, 'discovered-urls.json');
const MOBILE_REPORT_HTML = path.join(REPORTS_DIR, 'mobile-responsive-report.html');
const MOBILE_REPORT_JSON = path.join(REPORTS_DIR, 'mobile-responsive-report.json');
const MOBILE_SCREENSHOT_DIR = path.join(REPORTS_DIR, 'screenshots', 'mobile');

function toSlug(urlValue: string): string {
  const parsed = new URL(urlValue);
  const pathnameSlug = parsed.pathname.replace(/\/+$/, '').replace(/^\/+/, '').replace(/[^a-zA-Z0-9]+/g, '-');
  const searchSlug = parsed.search.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const slug = [pathnameSlug || 'home', searchSlug].filter(Boolean).join('-');
  return slug.toLowerCase();
}

async function hasObvious404(page: import('@playwright/test').Page): Promise<boolean> {
  const title = (await page.title()).toLowerCase();
  if (title.includes('404') || title.includes('not found') || title.includes('page not found')) {
    return true;
  }

  const heading = page.locator('h1, h2, [role="heading"]').first();
  try {
    const text = ((await heading.textContent()) ?? '').toLowerCase();
    return text.includes('404') || text.includes('not found') || text.includes('page not found');
  } catch {
    return false;
  }
}

async function hasMeaningfulTitleOrHeading(page: import('@playwright/test').Page): Promise<boolean> {
  const title = (await page.title()).trim();
  if (title.length > 3) {
    return true;
  }

  const heading = page.locator('h1, [role="heading"]').first();
  try {
    if (await heading.isVisible({ timeout: 1000 })) {
      const text = (await heading.textContent())?.trim() ?? '';
      return text.length > 1;
    }
  } catch {
    // Ignore and treat as false.
  }

  return false;
}

async function collectLayoutMetrics(page: import('@playwright/test').Page): Promise<{
  viewportWidth: number;
  scrollWidth: number;
  hasHorizontalScroll: boolean;
  offscreenElementsCount: number;
}> {
  return await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const hasHorizontalScroll = scrollWidth > viewportWidth + 2;

    const keyElements = [
      document.querySelector('header'),
      document.querySelector('main'),
      document.querySelector('footer'),
    ].filter(Boolean) as Element[];

    const visibleElements = Array.from(document.querySelectorAll('body *')).filter((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 50 || rect.height <= 10) {
        return false;
      }
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
      }
      return rect.bottom >= 0 && rect.top <= window.innerHeight;
    });

    const toCheck = [...keyElements, ...visibleElements.slice(0, 10)];
    let offscreenCount = 0;

    for (const el of toCheck) {
      const rect = el.getBoundingClientRect();
      if (rect.left < -2 || rect.right > viewportWidth + 2) {
        offscreenCount += 1;
      }
    }

    return {
      viewportWidth,
      scrollWidth,
      hasHorizontalScroll,
      offscreenElementsCount: offscreenCount,
    };
  });
}

async function validateMobileMenu(page: import('@playwright/test').Page): Promise<{ menuOpened: boolean; notes: string }> {
  const selectors = [
    'button[aria-label*="menu" i]',
    'button[aria-controls*="menu" i]',
    'button[class*="menu" i]',
    '[data-testid*="menu" i]',
    'button:has-text("Menu")',
    '[role="button"][aria-label*="menu" i]',
  ];

  for (const selector of selectors) {
    const candidate = page.locator(selector).first();
    try {
      if (!(await candidate.isVisible({ timeout: 1000 }))) {
        continue;
      }

      await candidate.click({ timeout: 3000 });
      const visibleMenuItems = page.locator('nav a:visible, [role="menu"] a:visible, header a:visible');
      const count = await visibleMenuItems.count();

      if (count > 0) {
        const firstItem = visibleMenuItems.first();
        await expect(firstItem).toBeVisible();
        return { menuOpened: true, notes: `Menu opened; visible items: ${count}` };
      }

      return { menuOpened: false, notes: 'Hamburger detected but no menu items became visible' };
    } catch {
      // Continue to next selector.
    }
  }

  return { menuOpened: false, notes: 'No hamburger menu detected on this page' };
}

function mergeAndNormalizeUrls(baseUrl: string, seedUrls: string[]): string[] {
  const set = new Set<string>();

  for (const candidate of seedUrls) {
    const normalized = normalizeUrl(candidate, baseUrl);
    if (normalized) {
      set.add(normalized);
    }
  }

  return Array.from(set).sort();
}

test.use({ ...devices['iPhone 13 Pro Max'] });

test.describe.serial('Falaya mobile responsive', () => {
  test('Falaya mobile responsive', async ({ page, baseURL }, testInfo) => {
    expect(baseURL, 'baseURL must be configured in Playwright config').toBeTruthy();
    const rootUrl = baseURL as string;

    let cache = loadCachedDiscoveredUrls(DISCOVERED_URLS_CACHE);
    if (!cache) {
      const discovered = await discoverNavUrls(page, rootUrl);
      const normalized = mergeAndNormalizeUrls(rootUrl, discovered.navUrls);
      cache = { ...discovered, navUrls: normalized };
      writeJsonFile(DISCOVERED_URLS_CACHE, cache);
    }

    const urlsToCheck = mergeAndNormalizeUrls(rootUrl, cache.navUrls);
    const mobileChecks: MobileCheck[] = [];

    for (const url of urlsToCheck) {
      let status: number | null = null;
      let finalUrl = url;
      let reason = 'All checks passed';
      let result: 'PASS' | 'FAIL' = 'PASS';

      let viewportWidth = 0;
      let scrollWidth = 0;
      let hasHorizontalScroll = false;
      let offscreenElementsCount = 0;
      let menuOpened = false;
      let notes = '';

      const slug = toSlug(url);
      const screenshotAbsolutePath = path.join(MOBILE_SCREENSHOT_DIR, `${slug}.png`);

      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        status = response?.status() ?? null;
        finalUrl = page.url();
        const finalSlug = toSlug(finalUrl);

        const failures: string[] = [];

        if (status === null || status < 200 || status > 399) {
          failures.push(`HTTP status ${status ?? 'N/A'} is outside 200-399`);
        }

        if (await hasObvious404(page)) {
          failures.push('Page appears to be an error/404 page');
        }

        if (!(await hasMeaningfulTitleOrHeading(page))) {
          failures.push('Missing meaningful title and visible heading');
        }

        const layout = await collectLayoutMetrics(page);
        viewportWidth = layout.viewportWidth;
        scrollWidth = layout.scrollWidth;
        hasHorizontalScroll = layout.hasHorizontalScroll;
        offscreenElementsCount = layout.offscreenElementsCount;

        if (hasHorizontalScroll) {
          failures.push('Horizontal scroll detected');
        }

        if (offscreenElementsCount > 0) {
          failures.push(`Detected ${offscreenElementsCount} off-screen key elements`);
        }

        const menuResult = await validateMobileMenu(page);
        menuOpened = menuResult.menuOpened;
        notes = menuResult.notes;
        if (notes.includes('Hamburger detected') && !menuOpened) {
          failures.push('Hamburger menu not usable after interaction');
        }

        await argosScreenshot(page, `mobile-responsive-page-${finalSlug}-post-checks`, {
          fullPage: true,
        });

        result = failures.length === 0 ? 'PASS' : 'FAIL';
        reason = failures.length === 0 ? 'All checks passed' : failures.join('; ');
      } catch (error) {
        result = 'FAIL';
        reason = `Navigation failed: ${(error as Error).message}`;
      }

      try {
        await page.screenshot({ path: screenshotAbsolutePath, fullPage: true, timeout: 30_000, animations: 'disabled' });
      } catch {
        await page.screenshot({ path: screenshotAbsolutePath, fullPage: false, timeout: 10_000, animations: 'disabled' });
      }
      await testInfo.attach(`mobile-screenshot-${slug}`, {
        path: screenshotAbsolutePath,
        contentType: 'image/png',
      });

      mobileChecks.push({
        url,
        status,
        finalUrl,
        result,
        reason,
        viewportWidth,
        scrollWidth,
        hasHorizontalScroll,
        offscreenElementsCount,
        menuOpened,
        screenshotPath: `screenshots/mobile/${path.basename(screenshotAbsolutePath)}`,
        notes,
      });
    }

    writeMobileResponsiveReport(MOBILE_REPORT_HTML, MOBILE_REPORT_JSON, { mobileChecks });
    await testInfo.attach('mobile-responsive-report.json', {
      path: MOBILE_REPORT_JSON,
      contentType: 'application/json',
    });
    await testInfo.attach('mobile-responsive-report.html', {
      path: MOBILE_REPORT_HTML,
      contentType: 'text/html',
    });

    expect(mobileChecks.length, 'At least one page URL should be checked').toBeGreaterThan(0);
  });
});
