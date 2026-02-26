# Argos Visual Testing (Playwright SDK)

## What is integrated
- Argos Playwright reporter is configured in `playwright.config.ts`
- Visual test spec added: `tests/falaya-visual.spec.ts`
- Step-level Argos screenshots are captured in:
  - `tests/falaya-url-verification.spec.ts`
  - `tests/falaya-mobile-responsive.spec.ts`
- CI passes `ARGOS_TOKEN` from GitHub secrets in `.github/workflows/playwright.yml`

## One-time setup
1. Create an Argos project and copy your project token.
2. In GitHub repository settings, add a secret:
   - Name: `ARGOS_TOKEN`
   - Value: your Argos token

## How it works
- The visual suite captures page screenshots using `argosScreenshot(...)`.
- Functional suites also capture screenshots at each major step and page check.
- In CI, snapshots are uploaded to Argos when `ARGOS_TOKEN` is available.
- Local runs still work without a token (upload is disabled).

## Commands
- Run only visual tests:
  - `npm run test:visual`
- Run all tests:
  - `npm test`

## Notes
- Visual test targets currently included:
  - `/`
  - `/pricing`
  - `/research`
- You can add more pages in `tests/falaya-visual.spec.ts` by extending `PAGES_TO_CAPTURE`.
