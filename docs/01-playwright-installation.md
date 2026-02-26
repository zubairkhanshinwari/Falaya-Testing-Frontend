# Playwright Installation Guide

## Prerequisites

- Node.js 18+ installed
- npm available

## Install Project Dependencies

```bash
npm i
```

## Install Playwright Browsers

```bash
npx playwright install
```

## Verify Installation

List discovered tests:

```bash
npx playwright test --list
```

Run all tests:

```bash
npm test
```

## Useful Commands

- URL test only: `npm run test:url`
- Mobile test only: `npm run test:mobile`
- Open Playwright HTML report: `npm run report:open`