# GitHub Actions CI/CD for Playwright Tests

## Purpose
This workflow automatically runs Playwright test cases:
- On every push
- On pull requests to `main` and `master`
- Daily at `07:00` (UTC)
- Manually from the Actions tab

## Workflow File
Path:
- `.github/workflows/playwright.yml`

## Trigger Configuration
Current triggers in the workflow:

```yaml
on:
  push:
  pull_request:
    branches: [ main, master ]
  schedule:
    - cron: "0 7 * * *"
  workflow_dispatch:
```

## Important Timezone Note
GitHub Actions scheduled workflows use **UTC**.

- `0 7 * * *` means the job runs every day at **07:00 UTC**
- If you want 7:00 AM in another timezone, convert that time to UTC and update the cron expression

## What the Job Does
The workflow:
1. Checks out the repository
2. Sets up Node.js
3. Installs dependencies (`npm ci`)
4. Installs Playwright browsers (`npx playwright install --with-deps`)
5. Runs tests (`npx playwright test`)
6. Uploads `playwright-report` as an artifact

## How to Verify
1. Open your GitHub repository
2. Go to **Actions**
3. Select **Playwright Tests**
4. Confirm runs appear for:
   - Push events
   - Daily scheduled event
   - Manual runs (if triggered)

