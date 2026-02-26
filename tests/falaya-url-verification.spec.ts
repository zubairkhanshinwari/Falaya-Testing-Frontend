import path from 'node:path';
import { expect, test } from '@playwright/test';
import { argosScreenshot } from '@argos-ci/playwright';
import {
  discoverNavUrls,
  extractFooterLinks,
  loadCachedDiscoveredUrls,
  normalizeUrl,
  writeJsonFile,
} from '../utils/linkDiscovery';
import {
  FooterLinkCheck,
  UrlPageCheck,
  writeUrlVerificationReport,
} from '../utils/reportWriter';

const REPORTS_DIR = path.resolve('reports');
const DISCOVERED_URLS_CACHE = path.join(REPORTS_DIR, 'discovered-urls.json');
const URL_REPORT_HTML = path.join(REPORTS_DIR, 'url-verification-report.html');
const URL_REPORT_JSON = path.join(REPORTS_DIR, 'url-verification-report.json');

function toSlug(urlValue: string): string {
  const parsed = new URL(urlValue);
  const pathnameSlug = parsed.pathname.replace(/\/+$/, '').replace(/^\/+/, '').replace(/[^a-zA-Z0-9]+/g, '-');
  const searchSlug = parsed.search.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const slug = [pathnameSlug || 'home', searchSlug].filter(Boolean).join('-');
  return slug.toLowerCase();
}

async function hasMeaningfulTitleOrHeading(page: import('@playwright/test').Page): Promise<boolean> {
  const pageTitle = await page.title();
  if (pageTitle.trim().length > 3) {
    return true;
  }

  const heading = page.locator('h1, [role="heading"]').first();
  try {
    if (await heading.isVisible({ timeout: 1000 })) {
      const text = (await heading.textContent())?.trim() ?? '';
      return text.length > 1;
    }
  } catch {
    // Fallback to false if heading access is noisy.
  }

  return false;
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

test.describe.serial('Falaya URL verification', () => {
  test('Falaya URL verification', async ({ page, baseURL, request }, testInfo) => {
    expect(baseURL, 'baseURL must be configured in Playwright config').toBeTruthy();
    const rootUrl = baseURL as string;

    const freshDiscovery = await discoverNavUrls(page, rootUrl);
    const mergedNavUrls = mergeAndNormalizeUrls(rootUrl, freshDiscovery.navUrls);
    const discoveredPayload = {
      ...freshDiscovery,
      navUrls: mergedNavUrls,
    };

    writeJsonFile(DISCOVERED_URLS_CACHE, discoveredPayload);

    const cache = loadCachedDiscoveredUrls(DISCOVERED_URLS_CACHE);
    const urlsToCheck = mergeAndNormalizeUrls(rootUrl, cache?.navUrls ?? mergedNavUrls);

    const pagesChecked: UrlPageCheck[] = [];
    const footerLinksChecked: FooterLinkCheck[] = [];
    const footerResultCache = new Map<string, Omit<FooterLinkCheck, 'sourcePageUrl' | 'linkText' | 'href'>>();

    for (const url of urlsToCheck) {
      let status: number | null = null;
      let finalUrl = url;

      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        status = response?.status() ?? null;
        finalUrl = page.url();
        const pageSlug = toSlug(finalUrl);

        const reasons: string[] = [];
        const statusOk = status !== null && status >= 200 && status <= 399;
        if (!statusOk) {
          reasons.push(`HTTP status ${status ?? 'N/A'} is outside 200-399`);
        }

        if (await hasObvious404(page)) {
          reasons.push('Page appears to be an error/404 page');
        }

        const finalUrlLower = finalUrl.toLowerCase();
        if (finalUrlLower.includes('/404') || finalUrlLower.endsWith('/not-found')) {
          reasons.push(`Unexpected final URL: ${finalUrl}`);
        }

        const meaningfulContent = await hasMeaningfulTitleOrHeading(page);
        if (!meaningfulContent) {
          reasons.push('Missing meaningful title and visible heading');
        }

        pagesChecked.push({
          url,
          status,
          finalUrl,
          result: reasons.length === 0 ? 'PASS' : 'FAIL',
          reason: reasons.length === 0 ? 'All checks passed' : reasons.join('; '),
        });

        await argosScreenshot(page, `url-verification-page-${pageSlug}`, {
          fullPage: true,
        });

        const footerLinks = await extractFooterLinks(page, finalUrl, rootUrl);
        for (const footerLink of footerLinks) {
          if (!footerResultCache.has(footerLink.href)) {
            let footerStatus: number | null = null;
            let footerFinalUrl = footerLink.href;
            let reason = 'All checks passed';
            let result: 'PASS' | 'FAIL' = 'PASS';

            try {
              const footerResponse = await request.get(footerLink.href, { timeout: 15_000 });
              footerStatus = footerResponse.status();
              footerFinalUrl = footerResponse.url();

              const statusOkForFooter = footerStatus >= 200 && footerStatus <= 399;
              if (!statusOkForFooter) {
                result = 'FAIL';
                reason = `HTTP status ${footerStatus} is outside 200-399`;
              }
            } catch (error) {
              result = 'FAIL';
              reason = `Footer link request failed: ${(error as Error).message}`;
            }

            footerResultCache.set(footerLink.href, {
              status: footerStatus,
              finalUrl: footerFinalUrl,
              result,
              reason,
            });
          }

          const cachedFooterResult = footerResultCache.get(footerLink.href)!;
          footerLinksChecked.push({
            sourcePageUrl: url,
            linkText: footerLink.linkText,
            href: footerLink.href,
            status: cachedFooterResult.status,
            finalUrl: cachedFooterResult.finalUrl,
            result: cachedFooterResult.result,
            reason: cachedFooterResult.reason,
          });
        }
      } catch (error) {
        pagesChecked.push({
          url,
          status,
          finalUrl,
          result: 'FAIL',
          reason: `Navigation failed: ${(error as Error).message}`,
        });
      }
    }

    writeUrlVerificationReport(URL_REPORT_HTML, URL_REPORT_JSON, {
      pagesChecked,
      footerLinksChecked,
    });

    const screenshotPath = path.join(REPORTS_DIR, 'screenshots', 'url', 'url-verification-final.png');
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 30_000, animations: 'disabled' });
      await argosScreenshot(page, 'url-verification-final-state', {
        fullPage: true,
      });
      await testInfo.attach('url-verification-final-screenshot', {
        path: screenshotPath,
        contentType: 'image/png',
      });
    } catch {
      // Ignore screenshot attachment failures.
    }

    await testInfo.attach('discovered-urls.json', {
      path: DISCOVERED_URLS_CACHE,
      contentType: 'application/json',
    });
    await testInfo.attach('url-verification-report.json', {
      path: URL_REPORT_JSON,
      contentType: 'application/json',
    });
    await testInfo.attach('url-verification-report.html', {
      path: URL_REPORT_HTML,
      contentType: 'text/html',
    });

    expect(pagesChecked.length, 'At least one page URL should be checked').toBeGreaterThan(0);
  });
});
