# Test Plan: Current Falaya Test Cases

## Scope

Base URL: `https://falaya.com`

Current automated test cases:

1. `Falaya URL verification`
2. `Falaya mobile responsive`

## Test Case 1: Falaya URL verification

### Objective
Validate discovered navigation URLs and footer internal links.

### Steps

1. Discover URLs from top-level sections:
   - Sell
   - Pricing
   - Research
   - Why Falaya
2. Normalize and de-duplicate URLs.
3. Save discovered URLs to `reports/discovered-urls.json`.
4. For each discovered page URL:
   - Navigate to page
   - Validate HTTP status 200-399
   - Validate not an obvious 404 page
   - Validate meaningful title or visible heading
   - Capture PASS/FAIL and reason
5. On each visited page, extract internal footer links and validate each link.
6. Write reports:
   - `reports/url-verification-report.json`
   - `reports/url-verification-report.html`

### Result Data

- `pagesChecked`: URL-level results
- `footerLinksChecked`: footer link results per source page

## Test Case 2: Falaya mobile responsive

### Objective
Validate responsive behavior on mobile using `iPhone 13 Pro Max` device profile.

### Steps

1. Load URL list from `reports/discovered-urls.json`.
2. For each URL under mobile device config:
   - Navigate and validate status/title/404 checks
   - Check horizontal overflow
   - Check off-screen element count for key visible elements
   - Validate menu behavior when hamburger/menu trigger exists
   - Capture screenshot in `reports/screenshots/mobile/`
   - Record PASS/FAIL with metrics
3. Write reports:
   - `reports/mobile-responsive-report.json`
   - `reports/mobile-responsive-report.html`

### Mobile Metrics Recorded

- `viewportWidth`
- `scrollWidth`
- `hasHorizontalScroll`
- `offscreenElementsCount`
- `menuOpened`
- `notes`
- `screenshotPath`

## Execution Strategy

- URL discovery and dependent checks are deterministic and serialized per spec.
- No hard waits are used.
- Reports include each checked URL entry, including failures.