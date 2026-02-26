import { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const MAX_LINKS_PER_SECTION = 15;
const SECTION_NAMES = ['Sell', 'Pricing', 'Research', 'Why Falaya'] as const;
const DIRECT_LINK_NAMES = ['Login', 'Signup', 'Sign up', 'Forgot Password', 'Forgot'] as const;
const INVALID_HREF_PREFIXES = ['javascript:', 'mailto:', 'tel:'];

export type DiscoveredUrls = {
  generatedAt: string;
  baseUrl: string;
  navUrls: string[];
  sectionUrls: Record<string, string[]>;
  directUrls: string[];
};

export type FooterLink = {
  linkText: string;
  href: string;
};

function trimTrailingSlash(url: URL): string {
  const normalizedPathname = url.pathname.replace(/\/+$/, '');
  url.pathname = normalizedPathname === '' ? '/' : normalizedPathname;
  return url.toString();
}

export function normalizeUrl(rawUrl: string, baseUrl: string): string | null {
  try {
    const normalized = new URL(rawUrl, baseUrl);
    normalized.hash = '';
    if (!['http:', 'https:'].includes(normalized.protocol)) {
      return null;
    }
    return trimTrailingSlash(normalized);
  } catch {
    return null;
  }
}

export function isInternalUrl(candidate: string, baseUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const parsed = new URL(candidate, baseUrl);
    return parsed.hostname === base.hostname;
  } catch {
    return false;
  }
}

function isInvalidHref(href: string): boolean {
  if (!href) {
    return true;
  }
  const lowered = href.trim().toLowerCase();
  if (lowered === '#' || lowered.startsWith('#')) {
    return true;
  }
  return INVALID_HREF_PREFIXES.some((prefix) => lowered.startsWith(prefix));
}

function pushUniqueUrl(set: Set<string>, candidate: string | null): void {
  if (candidate) {
    set.add(candidate);
  }
}

async function collectHeaderLinks(page: Page, baseUrl: string): Promise<Set<string>> {
  const links = await page.evaluate(() => {
    const root = document.querySelector('header') ?? document.querySelector('nav') ?? document.body;
    if (!root) {
      return [];
    }
    return Array.from(root.querySelectorAll('a[href]')).map((anchor) => anchor.getAttribute('href') || '');
  });

  const normalized = new Set<string>();
  for (const href of links) {
    if (isInvalidHref(href)) {
      continue;
    }
    const url = normalizeUrl(href, baseUrl);
    if (!url || !isInternalUrl(url, baseUrl)) {
      continue;
    }
    normalized.add(url);
  }

  return normalized;
}

async function collectAllInternalLinks(page: Page, baseUrl: string): Promise<Array<{ text: string; url: string }>> {
  const rows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]')).map((anchor) => ({
      text: (anchor.textContent || '').trim(),
      href: anchor.getAttribute('href') || '',
    }));
  });

  const unique = new Set<string>();
  const output: Array<{ text: string; url: string }> = [];
  for (const row of rows) {
    if (isInvalidHref(row.href)) {
      continue;
    }
    const normalized = normalizeUrl(row.href, baseUrl);
    if (!normalized || !isInternalUrl(normalized, baseUrl)) {
      continue;
    }
    if (unique.has(normalized)) {
      continue;
    }
    unique.add(normalized);
    output.push({ text: row.text, url: normalized });
  }

  return output;
}

function classifySectionUrl(url: string): (typeof SECTION_NAMES)[number] | null {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.startsWith('/sell')) {
    return 'Sell';
  }
  if (pathname.startsWith('/pricing')) {
    return 'Pricing';
  }
  if (pathname.startsWith('/research')) {
    return 'Research';
  }
  if (
    pathname.startsWith('/why-falaya') ||
    pathname.startsWith('/about-falaya') ||
    pathname.startsWith('/features') ||
    pathname.startsWith('/comparison')
  ) {
    return 'Why Falaya';
  }
  return null;
}

async function clickLikelyCookieButtons(page: Page): Promise<void> {
  const selectors = [
    'button:has-text("Accept")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
    'button:has-text("Allow all")',
    'button:has-text("Got it")',
    '[aria-label*="accept" i]',
  ];

  for (const selector of selectors) {
    const candidate = page.locator(selector).first();
    try {
      if (await candidate.isVisible({ timeout: 1000 })) {
        await candidate.click({ timeout: 2000 });
      }
    } catch {
      // Ignore noisy popups and continue.
    }
  }
}

async function openSectionMenu(page: Page, sectionName: string): Promise<void> {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selectors = [
    `header a:has-text("${sectionName}")`,
    `header button:has-text("${sectionName}")`,
    `nav a:has-text("${sectionName}")`,
    `nav button:has-text("${sectionName}")`,
    `[role="button"]:has-text("${sectionName}")`,
    `a:has-text("${sectionName}")`,
  ];

  for (const selector of selectors) {
    const candidate = page.locator(selector).first();
    try {
      if (!(await candidate.isVisible({ timeout: 1000 }))) {
        continue;
      }
      await candidate.scrollIntoViewIfNeeded();
      await candidate.hover({ timeout: 2000 });
      const tagName = await candidate.evaluate((node) => node.tagName.toLowerCase());
      if (tagName === 'button') {
        await candidate.click({ timeout: 2000 });
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      return;
    } catch {
      // Try the next selector.
    }
  }

  const regexCandidate = page.getByRole('link', { name: new RegExp(escaped, 'i') }).first();
  try {
    if (await regexCandidate.isVisible({ timeout: 1000 })) {
      await regexCandidate.hover({ timeout: 2000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      return;
    }
  } catch {
    // Intentionally ignored.
  }

  const regexButton = page.getByRole('button', { name: new RegExp(escaped, 'i') }).first();
  try {
    if (await regexButton.isVisible({ timeout: 1000 })) {
      await regexButton.click({ timeout: 2000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
    }
  } catch {
    // Intentionally ignored.
  }
}

async function collectDirectLinks(page: Page, baseUrl: string): Promise<string[]> {
  const directUrls = new Set<string>();

  for (const label of DIRECT_LINK_NAMES) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const candidates = [
      page.locator(`header a:has-text("${label}")`).first(),
      page.locator(`nav a:has-text("${label}")`).first(),
      page.getByRole('link', { name: new RegExp(escaped, 'i') }).first(),
    ];

    for (const candidate of candidates) {
      try {
        if (!(await candidate.isVisible({ timeout: 1000 }))) {
          continue;
        }
        const href = await candidate.getAttribute('href');
        if (!href || isInvalidHref(href)) {
          continue;
        }
        const url = normalizeUrl(href, baseUrl);
        if (url && isInternalUrl(url, baseUrl)) {
          directUrls.add(url);
        }
      } catch {
        // Move to next candidate.
      }
    }
  }

  return Array.from(directUrls);
}

export async function discoverNavUrls(page: Page, baseUrl: string): Promise<DiscoveredUrls> {
  const sectionUrls: Record<string, string[]> = {};
  const allNavUrls = new Set<string>();

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await clickLikelyCookieButtons(page);

  const headerSeedLinks = await collectHeaderLinks(page, baseUrl);
  for (const seedLink of headerSeedLinks) {
    pushUniqueUrl(allNavUrls, seedLink);
  }

  const directUrls = await collectDirectLinks(page, baseUrl);
  directUrls.forEach((url) => pushUniqueUrl(allNavUrls, url));

  const allInternalLinks = await collectAllInternalLinks(page, baseUrl);
  if (directUrls.length === 0) {
    for (const link of allInternalLinks) {
      const lowered = `${link.text} ${link.url}`.toLowerCase();
      if (lowered.includes('login') || lowered.includes('sign up') || lowered.includes('signup') || lowered.includes('forgot')) {
        pushUniqueUrl(allNavUrls, link.url);
      }
    }
  }
  const sectionBuckets: Record<string, Set<string>> = Object.fromEntries(
    SECTION_NAMES.map((section) => [section, new Set<string>()])
  );

  for (const link of allInternalLinks) {
    const section = classifySectionUrl(link.url);
    if (section) {
      sectionBuckets[section].add(link.url);
    }
  }

  for (const sectionName of SECTION_NAMES) {
    await openSectionMenu(page, sectionName);

    const after = await collectHeaderLinks(page, baseUrl);

    const sectionSet = new Set<string>();
    for (const link of after) {
      if (classifySectionUrl(link) === sectionName) {
        sectionSet.add(link);
      }
    }

    if (sectionSet.size === 0) {
      for (const link of sectionBuckets[sectionName]) {
        sectionSet.add(link);
      }
    }

    sectionUrls[sectionName] = Array.from(sectionSet).slice(0, MAX_LINKS_PER_SECTION);
    sectionUrls[sectionName].forEach((url) => pushUniqueUrl(allNavUrls, url));
  }

  return {
    generatedAt: new Date().toISOString(),
    baseUrl,
    navUrls: Array.from(allNavUrls).sort(),
    sectionUrls,
    directUrls: directUrls.sort(),
  };
}

export async function extractFooterLinks(page: Page, pageUrl: string, baseUrl: string): Promise<FooterLink[]> {
  const rawLinks = await page.evaluate(() => {
    const footer = document.querySelector('footer');

    const toRows = (anchors: Element[]) =>
      anchors.map((anchor) => {
        const element = anchor as HTMLAnchorElement;
        return {
          text: (element.textContent || '').trim(),
          href: element.getAttribute('href') || '',
        };
      });

    if (footer) {
      return toRows(Array.from(footer.querySelectorAll('a[href]')));
    }

    const viewportHeight = window.innerHeight;
    const lowerBound = viewportHeight * 0.75;
    const anchors = Array.from(document.querySelectorAll('a[href]')).filter((anchor) => {
      const rect = anchor.getBoundingClientRect();
      return rect.top >= lowerBound;
    });

    return toRows(anchors);
  });

  const unique = new Set<string>();
  const footerLinks: FooterLink[] = [];

  for (const item of rawLinks) {
    if (!item.href || isInvalidHref(item.href)) {
      continue;
    }

    const absolute = normalizeUrl(item.href, pageUrl);
    if (!absolute || !isInternalUrl(absolute, baseUrl)) {
      continue;
    }

    const key = `${item.text}|${absolute}`;
    if (unique.has(key)) {
      continue;
    }

    unique.add(key);
    footerLinks.push({
      linkText: item.text || '(no text)',
      href: absolute,
    });
  }

  return footerLinks;
}

export function ensureDir(targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
}

export function writeJsonFile<T>(outputFile: string, data: T): void {
  ensureDir(path.dirname(outputFile));
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf-8');
}

export function loadCachedDiscoveredUrls(cacheFilePath: string): DiscoveredUrls | null {
  if (!fs.existsSync(cacheFilePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(cacheFilePath, 'utf-8');
    const parsed = JSON.parse(raw) as DiscoveredUrls;
    return parsed;
  } catch {
    return null;
  }
}
