# How to Connect Playwright with Allure

## 1) Install Dependencies

```bash
npm i -D allure-playwright allure-commandline
```

## 2) Configure Playwright Reporter

In `playwright.config.ts`, include Allure reporter:

```ts
reporter: [
  ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ['list'],
  ['allure-playwright', { resultsDir: 'allure-results' }],
]
```

## 3) Add Scripts (Optional but Recommended)

In `package.json`:

```json
{
  "scripts": {
    "allure:clean": "if exist allure-results rmdir /s /q allure-results && if exist allure-report rmdir /s /q allure-report",
    "allure:generate": "allure generate allure-results --clean -o allure-report",
    "allure:open": "allure open allure-report",
    "test:allure": "npm run allure:clean && playwright test && npm run allure:generate"
  }
}
```

## 4) Run Tests to Produce Allure Results

```bash
npm run test:url
```

or

```bash
npm run test:mobile
```

This creates `allure-results/`.

## 5) Generate and Open Allure Report

```bash
npm run allure:generate
npm run allure:open
```

Generated report path:

- `allure-report/index.html`