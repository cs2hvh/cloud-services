# 🎭 Playwright E2E Test Plan: App Deployment Service

## 📋 Executive Summary

This plan outlines comprehensive Playwright end-to-end tests for the **Platform Apps (App Deployment)** service. The tests will cover UI/component behavior, user flows, and integration scenarios for the app deployment dashboard located at `/dashboard/services/apps`.

---

## 🗂️ Analysis Summary

### Pages Analyzed

| Page | Path | Key Features |
|------|------|--------------|
| Apps List | `/dashboard/services/apps` | List deployed apps, stats cards, deploy button |
| New App | `/dashboard/services/apps/new` | Multi-step deployment wizard (4 steps) |
| App Detail | `/dashboard/services/apps/[id]` | Tabs: Overview, Integrations, Domains, Deployments, Logs, Settings |

### APIs Involved

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/services/platform-apps/list` | GET | Fetch user's apps |
| `/api/services/platform-apps/create` | POST | Deploy new app |
| `/api/services/platform-apps/get` | POST | Get app details |
| `/api/services/platform-apps/delete` | POST | Delete app |
| `/api/services/platform-apps/redeploy` | POST | Trigger redeployment |
| `/api/services/platform-apps/resize` | POST | Resize app instance |
| `/api/services/platform-apps/env-vars/update` | POST | Update env vars |
| `/api/services/platform-apps/domains/*` | Various | Custom domain management |
| `/api/services/platform-apps/rollback` | POST | Rollback deployment |
| `/api/services/platform-apps/deployments` | GET | Deployment history |
| `/api/services/platform-apps/details` | GET | Detailed K8s info |
| `/api/services/platform-apps/health` | GET | App health status |
| `/api/services/platform-apps/logs` | GET | Runtime logs |
| `/api/services/platform-apps/metrics` | GET | App metrics (CPU, memory) |
| `/api/services/platform-apps/pods` | GET | Pod status information |
| `/api/services/platform-apps/events` | GET | App events |
| `/api/jenkins/build-info` | GET | Jenkins build status |
| `/api/jenkins/build-logs` | GET | Build logs |
| `/api/auth/providers` | GET | Git provider connections |
| `/api/github/repositories` | GET | GitHub repos |
| `/api/gitlab/repositories` | GET | GitLab repos |
| `/api/bitbucket/repositories` | GET | Bitbucket repos |

### Existing Test Infrastructure

- ✅ Vitest unit/integration tests exist in `tests/integration/api/platform-apps-*.test.ts`
- ✅ Component tests exist in `tests/components/apps/`
- ✅ Mock data available in `tests/utils/mock-data-platform-apps.ts`
- ✅ Test helpers in `tests/utils/test-helpers.ts`
- ⚠️ No Playwright config exists - needs to be created

---

## 📁 Proposed Test File Structure

```
tests/
└── e2e/
    └── platform-apps/
        ├── fixtures/
        │   ├── auth.fixture.ts          # Authentication setup
        │   ├── api-mocks.fixture.ts     # API mocking utilities
        │   └── test-data.fixture.ts     # Test data factories
        ├── apps-list.spec.ts            # Apps listing page tests
        ├── app-create.spec.ts           # New app deployment wizard
        ├── app-detail.spec.ts           # App detail page tests
        ├── app-settings.spec.ts         # Settings tab (env vars, resize, delete)
        ├── app-domains.spec.ts          # Custom domains management
        ├── app-deployments.spec.ts      # Deployment history & rollback
        └── app-monitoring.spec.ts       # Logs, metrics, health
```

---

## 🧪 Test Cases Specification

### 1. Apps List Page (`apps-list.spec.ts`)

#### 1.1 Page Load & Display

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-001 | Display apps list page | Navigate to `/dashboard/services/apps` | Page title "Application Deployment" visible |
| E2E-PA-002 | Show loading state | Navigate to apps page | Loading spinner shown, then apps appear |
| E2E-PA-003 | Display empty state | Mock empty apps list | "No apps" message with deploy CTA |
| E2E-PA-004 | Display stats cards | Load page with apps | Stats cards show totalApps, activeDeployments, successRate |
| E2E-PA-005 | Display apps grid | Load page with mock apps | App cards rendered with name, status, URL |

#### 1.2 App Status Badges

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-010 | Running status badge | Mock app with status='running' | Green badge with "Running" text |
| E2E-PA-011 | Building status badge | Mock app with status='building' | Blue badge with spinner, "Building" text |
| E2E-PA-012 | Failed status badge | Mock app with status='failed' | Red badge with "Failed" text |
| E2E-PA-013 | Pending status badge | Mock app with status='pending' | Yellow badge with "Pending" text |
| E2E-PA-014 | Deleting status badge | Mock app with status='deleting' | Yellow badge with spinner |

#### 1.3 Navigation & Actions

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-020 | Navigate to deploy new app | Click "Deploy Application" button | Navigates to `/dashboard/services/apps/new` |
| E2E-PA-021 | Navigate to app detail | Click on app card | Navigates to `/dashboard/services/apps/[id]` |
| E2E-PA-022 | Refresh apps list | Wait for auto-refresh (10s interval) | Apps list updated |

#### 1.4 Information Sections

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-025 | Display about section | Load apps page | "What is Application Deployment?" card visible |
| E2E-PA-026 | Display supported frameworks | Scroll down | Frameworks section with icons visible |
| E2E-PA-027 | Display git providers info | Scroll down | Git providers section visible |
| E2E-PA-028 | Display how it works | Scroll down | How it works section visible |

---

### 2. New App Deployment Wizard (`app-create.spec.ts`)

#### 2.1 Step 1: Git Provider Selection

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-100 | Display provider options | Navigate to new app page | GitHub, GitLab, Bitbucket options visible |
| E2E-PA-101 | Show connected provider status | Mock connected GitHub | Green checkmark on GitHub option |
| E2E-PA-102 | Show disconnected provider | Mock disconnected GitLab | No checkmark, connect prompt |
| E2E-PA-103 | Connect unconnected provider | Click unconnected GitLab | OAuth redirect or connection modal |
| E2E-PA-104 | Select connected provider | Click connected GitHub | Provider selected, proceed enabled |
| E2E-PA-105 | Proceed to step 2 | Select provider, click Next | Step 2 (repository selection) shown |
| E2E-PA-106 | Loading providers state | Load page | Loading indicator while fetching status |

#### 2.2 Step 2: Repository Selection

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-110 | Load repositories | Reach step 2 | Repositories list fetched and displayed |
| E2E-PA-111 | Display repository info | Load repos | Repo name, description, language, privacy shown |
| E2E-PA-112 | Display private repo indicator | Mock private repo | Lock icon or "Private" badge |
| E2E-PA-113 | Select repository | Click on repository | Repository selected, branches loaded |
| E2E-PA-114 | Select branch | Choose branch from dropdown | Branch selected |
| E2E-PA-115 | Proceed to step 3 | Select repo + branch, click Next | Step 3 (configuration) shown |
| E2E-PA-116 | Handle empty repositories | Mock empty repos response | "No repositories found" message |
| E2E-PA-117 | Handle fetch error | Mock API error | Error toast displayed |
| E2E-PA-118 | Repository pagination | Load more than 3 repos | Pagination controls visible |
| E2E-PA-119 | Search/filter repos | Type in search | Filtered results shown |

#### 2.3 Step 3: Configuration

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-120 | Display framework options | Reach step 3 | Framework dropdown with options |
| E2E-PA-121 | Auto-detect framework | Select Next.js repo | Next.js pre-selected |
| E2E-PA-122 | Display all frameworks | Open dropdown | Next.js, React, Vue, Angular, Python, etc. |
| E2E-PA-123 | Select instance size - small | Click small card | Small selected, pricing shown ($5/mo) |
| E2E-PA-124 | Select instance size - medium | Click medium card | Medium selected, pricing shown ($15/mo) |
| E2E-PA-125 | Select instance size - large | Click large card | Large selected, pricing shown ($30/mo) |
| E2E-PA-126 | Display size specs | View size cards | CPU, memory, replicas info visible |
| E2E-PA-127 | Select project | Choose from dropdown | Project assigned |
| E2E-PA-128 | Enter valid app name | Type "my-app-123" | Name accepted |
| E2E-PA-129 | Invalid app name - uppercase | Enter "MyApp" | Validation error displayed |
| E2E-PA-130 | Invalid app name - spaces | Enter "my app" | Validation error displayed |
| E2E-PA-131 | Invalid app name - special chars | Enter "my_app!" | Validation error displayed |
| E2E-PA-132 | Invalid app name - too short | Enter "ab" | Validation error displayed |
| E2E-PA-133 | Invalid app name - too long | Enter 64+ chars | Validation error displayed |
| E2E-PA-134 | Toggle auto-deploy on | Click auto-deploy switch | Enabled state |
| E2E-PA-135 | Toggle auto-deploy off | Click auto-deploy switch | Disabled state |
| E2E-PA-136 | Proceed to step 4 | Fill config, click Next | Step 4 (env vars) shown |

#### 2.4 Step 4: Environment Variables & Deploy

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-140 | Display env vars editor | Reach step 4 | Environment variables section visible |
| E2E-PA-141 | Add environment variable | Click "Add Variable" | New key/value row added |
| E2E-PA-142 | Edit env var key | Type in key field | Key updated |
| E2E-PA-143 | Edit env var value | Type in value field | Value updated |
| E2E-PA-144 | Remove env var | Click remove button | Row removed |
| E2E-PA-145 | Multiple env vars | Add 5 variables | All 5 visible |
| E2E-PA-146 | Deploy app - success | Click Deploy, mock success | Redirect to apps list, success toast |
| E2E-PA-147 | Deploy app - validation error | Submit invalid data | Validation error displayed |
| E2E-PA-148 | Deploy app - insufficient credits | Mock 402 response | Insufficient credits error shown |
| E2E-PA-149 | Deploy app - app limit reached | Mock 403 response | App limit error shown (max 10) |
| E2E-PA-150 | Deploy app - name conflict | Mock 409 response | Duplicate name error shown |
| E2E-PA-151 | Deploy app - server error | Mock 500 response | Server error message shown |
| E2E-PA-152 | Deploy loading state | Click Deploy | Button disabled, spinner shown |

#### 2.5 Full Deployment Flow (Integration)

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-160 | Complete deployment flow | All 4 steps successful | App created, redirected to detail page |
| E2E-PA-161 | Back navigation step 4→3 | Click Back on step 4 | Returns to step 3, data preserved |
| E2E-PA-162 | Back navigation step 3→2 | Click Back on step 3 | Returns to step 2, data preserved |
| E2E-PA-163 | Back navigation step 2→1 | Click Back on step 2 | Returns to step 1, data preserved |
| E2E-PA-164 | Form reset on page leave | Navigate away, return | Form state reset |
| E2E-PA-165 | Step indicator progress | Progress through steps | Step indicator updates correctly |

---

### 3. App Detail Page (`app-detail.spec.ts`)

#### 3.1 Page Load & Header

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-200 | Load app detail page | Navigate to `/dashboard/services/apps/[id]` | App name, status badge, URL visible |
| E2E-PA-201 | Display app name | Load detail page | App name in header |
| E2E-PA-202 | Display status badge | Load detail page | Correct status badge color/text |
| E2E-PA-203 | Display deployment URL | Load detail page | URL with external link icon |
| E2E-PA-204 | Click deployment URL | Click URL link | New tab opens with app URL |
| E2E-PA-205 | Display quick stats | Load detail page | Framework, branch, port, created date shown |
| E2E-PA-206 | Back to apps link | Click "Back to Apps" | Navigates to apps list |
| E2E-PA-207 | Refresh button | Click Refresh | Data reloaded, loading indicator |
| E2E-PA-208 | Delete button visible | Load detail page | Delete button in header |
| E2E-PA-209 | App not found | Navigate to invalid ID | "App not found" error shown |
| E2E-PA-210 | Display failure reason | Mock failed app with reason | Failure reason banner shown |
| E2E-PA-211 | Loading state | Navigate to page | Loading spinner until data loads |

#### 3.2 Tabs Navigation

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-220 | Overview tab default | Load detail page | Overview tab active |
| E2E-PA-221 | Navigate to Integrations tab | Click Integrations | Tab content changes |
| E2E-PA-222 | Navigate to Domains tab | Click Domains | Custom domains manager shown |
| E2E-PA-223 | Navigate to Deployments tab | Click Deployments | Deployment history shown |
| E2E-PA-224 | Navigate to Logs tab | Click Logs | Build/runtime logs shown |
| E2E-PA-225 | Navigate to Settings tab | Click Settings | Settings options shown |
| E2E-PA-226 | Tab state persistence | Switch tabs, return | Previous tab state preserved |

#### 3.3 Overview Tab

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-230 | Display metrics for running app | Load overview | CPU, memory metrics shown |
| E2E-PA-231 | Display pod status | Load overview | Pod count and status visible |
| E2E-PA-232 | Display health status | Load overview | Health indicator (healthy/unhealthy) |
| E2E-PA-233 | Build info displayed | Load page | Build number, duration, result shown |
| E2E-PA-234 | Build info - building state | Mock building app | Building indicator with progress |
| E2E-PA-235 | Repository info | Load overview | Repo URL, branch visible |
| E2E-PA-236 | Metrics loading state | Load page | Metrics show loading initially |
| E2E-PA-237 | Metrics error state | Mock metrics error | Error message shown |
| E2E-PA-238 | Auto-refresh during build | App in building state | Status updates every 5 seconds |

---

### 4. Settings Tab (`app-settings.spec.ts`)

#### 4.1 Environment Variables

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-300 | Display existing env vars | Load settings tab | Env vars list displayed |
| E2E-PA-301 | Add new env var | Click Add, enter key/value | New row added |
| E2E-PA-302 | Edit env var key | Modify existing key | Key updated |
| E2E-PA-303 | Edit env var value | Modify existing value | Value updated |
| E2E-PA-304 | Remove env var | Click remove button | Row removed |
| E2E-PA-305 | Save env vars - success | Click Save | Success toast, vars saved |
| E2E-PA-306 | Save env vars - duplicate key | Add duplicate key | Error message shown |
| E2E-PA-307 | Save env vars - empty key | Add empty key | Error or filtered out |
| E2E-PA-308 | Discard changes | Modify, don't save | Original values on refresh |
| E2E-PA-309 | Save button disabled initially | Load settings | Save disabled until changes made |
| E2E-PA-310 | Save button enabled on change | Modify env var | Save button enabled |
| E2E-PA-311 | Trigger redeploy after save | Click Redeploy | Build triggered confirmation |

#### 4.2 Resize Instance

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-320 | Display current size | Load settings | Current size highlighted |
| E2E-PA-321 | Display size options | Load settings | Small, medium, large cards |
| E2E-PA-322 | Display pricing per size | Load settings | Prices shown on cards |
| E2E-PA-323 | Select new size | Click larger size card | Size selected |
| E2E-PA-324 | Resize upsize small→medium | Select medium, confirm | Success, build triggered |
| E2E-PA-325 | Resize upsize medium→large | Select large, confirm | Success, build triggered |
| E2E-PA-326 | Resize downsize rejected | Try large→small | Error: downsizing not allowed |
| E2E-PA-327 | Resize same size rejected | Select same size | Error: already this size |
| E2E-PA-328 | Resize insufficient credits | Mock 402 response | Insufficient credits error |
| E2E-PA-329 | Resize loading state | Click resize | Button shows spinner |
| E2E-PA-330 | Resize success message | Complete resize | Success toast with build number |

#### 4.3 Delete App

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-340 | Open delete modal | Click Delete button | Confirmation modal opens |
| E2E-PA-341 | Modal displays app name | Open modal | App name shown in warning |
| E2E-PA-342 | Delete button disabled initially | Open modal | Delete button disabled |
| E2E-PA-343 | Cancel delete | Click Cancel | Modal closes, no action |
| E2E-PA-344 | Type app name to confirm | Type exact app name | Delete button enabled |
| E2E-PA-345 | Type wrong name | Type incorrect name | Delete button stays disabled |
| E2E-PA-346 | Delete app - success | Confirm deletion | Redirect to apps list, success toast |
| E2E-PA-347 | Delete app - error | Mock API error | Error toast, modal stays open |
| E2E-PA-348 | Delete loading state | Confirm deletion | Button shows spinner |
| E2E-PA-349 | Close modal on escape | Press Escape key | Modal closes |
| E2E-PA-350 | Close modal on backdrop | Click outside modal | Modal closes |

---

### 5. Custom Domains (`app-domains.spec.ts`)

#### 5.1 Domains List

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-400 | Display existing domains | Load domains tab | Domain list shown |
| E2E-PA-401 | Display default domain | Load domains tab | Default `.apps.hostguardian.net` shown |
| E2E-PA-402 | Display domain status | Load with custom domains | Status badges (pending, verified, active) |
| E2E-PA-403 | Empty domains state | No custom domains | Only default domain, add CTA |
| E2E-PA-404 | Primary domain indicator | Has primary domain | Star/badge on primary domain |

#### 5.2 Add Domain

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-410 | Open add domain dialog | Click "Add Domain" | Domain input dialog opens |
| E2E-PA-411 | Add domain - valid format | Enter "app.example.com" | Domain added |
| E2E-PA-412 | Add domain - invalid format | Enter "not-valid" | Validation error |
| E2E-PA-413 | Add domain - with subdomain | Enter "www.app.example.com" | Domain added |
| E2E-PA-414 | Verification instructions | Add domain | DNS TXT/CNAME instructions shown |
| E2E-PA-415 | Copy verification token | Click copy button | Token copied to clipboard |

#### 5.3 Domain Verification & Activation

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-420 | Verify domain - DNS ready | Click Verify | Status changes to verified |
| E2E-PA-421 | Verify domain - DNS not ready | Mock DNS failure | Error message with instructions |
| E2E-PA-422 | Verify loading state | Click Verify | Loading indicator |
| E2E-PA-423 | Activate verified domain | Click Activate | Status changes to active |
| E2E-PA-424 | Activate unverified domain | Try to activate pending | Error or button disabled |
| E2E-PA-425 | SSL certificate status | Activate domain | SSL status shown |

#### 5.4 Domain Management

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-430 | Remove domain - confirm | Click Remove, confirm | Domain removed from list |
| E2E-PA-431 | Remove domain - cancel | Click Remove, cancel | Domain remains |
| E2E-PA-432 | Set primary domain | Click "Set as Primary" | Primary badge moves |
| E2E-PA-433 | Cannot remove primary | Try to remove primary | Warning or prevented |
| E2E-PA-434 | Domain limit (5) | Try adding 6th domain | Error: limit reached |

---

### 6. Deployments & Rollback (`app-deployments.spec.ts`)

#### 6.1 Deployment History

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-500 | Display deployment history | Load deployments tab | List of deployments shown |
| E2E-PA-501 | Deployment details | View deployment row | Build number, status, duration, commit |
| E2E-PA-502 | Deployment status - success | View successful deployment | Green status badge |
| E2E-PA-503 | Deployment status - failed | View failed deployment | Red status badge |
| E2E-PA-504 | Deployment trigger type | View deployment | Shows "manual" or "auto" |
| E2E-PA-505 | Commit info | View deployment | Commit SHA and message shown |
| E2E-PA-506 | Empty history | New app with no builds | "No deployments yet" message |

#### 6.2 Redeploy

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-510 | Trigger redeploy button | Click Redeploy | Confirmation or immediate trigger |
| E2E-PA-511 | Redeploy success | Trigger redeploy | New build started, toast shown |
| E2E-PA-512 | Redeploy while building | App is building | Button disabled or warning |
| E2E-PA-513 | Redeploy loading state | Click redeploy | Loading indicator |

#### 6.3 Rollback

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-520 | Rollback button visible | Has previous deployment | Rollback button shown |
| E2E-PA-521 | Rollback to previous | Click Rollback, confirm | Rollback triggered |
| E2E-PA-522 | Rollback - no previous | Only one deployment | Rollback disabled/hidden |
| E2E-PA-523 | Rollback confirmation | Click Rollback | Confirmation dialog shown |
| E2E-PA-524 | Rollback loading state | Confirm rollback | Loading indicator |
| E2E-PA-525 | Rollback success | Complete rollback | Success toast, status updates |

#### 6.4 Build Logs

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-530 | View build logs | Click "View Logs" on deployment | Logs panel expanded |
| E2E-PA-531 | Build logs content | Expand logs | Jenkins build output shown |
| E2E-PA-532 | Logs auto-scroll | Logs streaming | Scrolls to bottom |
| E2E-PA-533 | Collapse logs | Click collapse | Logs panel hidden |

---

### 7. Monitoring & Logs (`app-monitoring.spec.ts`)

#### 7.1 Runtime Logs

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-600 | Display runtime logs | Load logs tab | Log viewer visible |
| E2E-PA-601 | Logs content | View logs | Application stdout/stderr shown |
| E2E-PA-602 | Logs stream updates | Wait for new logs | New entries appear |
| E2E-PA-603 | Clear logs | Click Clear | Logs cleared from view |
| E2E-PA-604 | Download logs | Click Download | File download triggered |
| E2E-PA-605 | Logs loading state | Switch to logs tab | Loading indicator |
| E2E-PA-606 | Logs error state | Mock API error | Error message shown |
| E2E-PA-607 | Logs for non-running app | View stopped app | Appropriate message |

#### 7.2 App Issues

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-610 | Display issues for failed app | Load failed app | Issues/diagnostics shown |
| E2E-PA-611 | No issues for healthy app | Load running app | No issues section or empty |
| E2E-PA-612 | Issue details | View issue | Description and possible fix |

#### 7.3 Metrics

| Test ID | Scenario | Steps | Expected Result |
|---------|----------|-------|-----------------|
| E2E-PA-620 | CPU metrics | Load overview | CPU usage percentage shown |
| E2E-PA-621 | Memory metrics | Load overview | Memory usage shown |
| E2E-PA-622 | Metrics refresh | Wait 30 seconds | Metrics update |
| E2E-PA-623 | Metrics for non-running | View stopped app | N/A or no metrics |

---

## 🔧 Fixtures & Utilities Required

### 1. Authentication Fixture (`auth.fixture.ts`)

```typescript
import { test as base, Page } from '@playwright/test';

// Extend base test with authentication
export const test = base.extend<{
  authenticatedPage: Page;
  adminPage: Page;
}>({
  authenticatedPage: async ({ page }, use) => {
    // Login as regular user
    await page.goto('/signin');
    await page.fill('[data-testid="email"]', process.env.TEST_USER_EMAIL!);
    await page.fill('[data-testid="password"]', process.env.TEST_USER_PASSWORD!);
    await page.click('[data-testid="signin-button"]');
    await page.waitForURL('/dashboard');
    await use(page);
  },
  adminPage: async ({ page }, use) => {
    // Login as admin user
    await page.goto('/signin');
    await page.fill('[data-testid="email"]', process.env.TEST_ADMIN_EMAIL!);
    await page.fill('[data-testid="password"]', process.env.TEST_ADMIN_PASSWORD!);
    await page.click('[data-testid="signin-button"]');
    await page.waitForURL('/dashboard');
    await use(page);
  },
});

export { expect } from '@playwright/test';
```

### 2. API Mocks Fixture (`api-mocks.fixture.ts`)

```typescript
import { Page, Route } from '@playwright/test';

export class ApiMocks {
  constructor(private page: Page) {}

  async mockAppsList(apps: any[]) {
    await this.page.route('**/api/services/platform-apps/list', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ apps }),
      });
    });
  }

  async mockAppGet(app: any) {
    await this.page.route('**/api/services/platform-apps/get', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(app),
      });
    });
  }

  async mockAppCreate(response: any, status = 200) {
    await this.page.route('**/api/services/platform-apps/create', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    });
  }

  async mockProviders(providers: any[]) {
    await this.page.route('**/api/auth/providers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ providers }),
      });
    });
  }

  async mockRepositories(provider: string, repos: any[]) {
    await this.page.route(`**/api/${provider}/repositories`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ repositories: repos }),
      });
    });
  }

  async mockBuildInfo(buildInfo: any) {
    await this.page.route('**/api/jenkins/build-info*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildInfo),
      });
    });
  }

  async mockError(endpoint: string, status: number, error: string) {
    await this.page.route(`**${endpoint}`, async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error }),
      });
    });
  }
}
```

### 3. Test Data Fixture (`test-data.fixture.ts`)

```typescript
// Reuse from tests/utils/mock-data-platform-apps.ts
export {
  mockPlatformApp,
  mockBuildingApp,
  mockFailedApp,
  mockPendingApp,
  mockDeletingApp,
  mockCreatePlatformAppPayload,
  mockBuildInfo,
  mockBuildingInfo,
  mockFailedBuildInfo,
  mockDeployment,
  mockCustomDomain,
  mockActiveDomain,
  mockPendingDomain,
  mockEnvVars,
  mockRepository,
  mockBranches,
  mockAppMetrics,
  mockAppHealth,
  mockPods,
  mockAppEvents,
  mockPlatformAppPricing,
} from '../../utils/mock-data-platform-apps';

// Additional E2E-specific test data
export const mockConnectedProviders = [
  { provider: 'github', status: true },
  { provider: 'gitlab', status: false },
  { provider: 'bitbucket', status: false },
];

export const mockGitHubRepositories = [
  {
    id: 'repo-1',
    name: 'my-nextjs-app',
    fullName: 'user/my-nextjs-app',
    description: 'A Next.js application',
    private: false,
    defaultBranch: 'main',
    language: 'TypeScript',
    updatedAt: '2025-01-01T00:00:00Z',
    provider: 'github',
  },
  {
    id: 'repo-2',
    name: 'my-python-api',
    fullName: 'user/my-python-api',
    description: 'A FastAPI backend',
    private: true,
    defaultBranch: 'main',
    language: 'Python',
    updatedAt: '2025-01-01T00:00:00Z',
    provider: 'github',
  },
];
```

---

## 📊 Coverage Matrix

| Feature Area | Test Count | Priority | Complexity |
|--------------|------------|----------|------------|
| Apps List Page | 18 | High | Low |
| New App Wizard - Step 1 | 7 | High | Medium |
| New App Wizard - Step 2 | 10 | High | Medium |
| New App Wizard - Step 3 | 17 | High | Medium |
| New App Wizard - Step 4 | 13 | High | Medium |
| New App Wizard - Flow | 6 | High | High |
| App Detail Page | 20 | High | Medium |
| Settings - Env Vars | 12 | High | Medium |
| Settings - Resize | 11 | Medium | Medium |
| Settings - Delete | 11 | High | Low |
| Custom Domains | 20 | Medium | High |
| Deployments & Rollback | 16 | Medium | Medium |
| Monitoring & Logs | 14 | Low | Medium |
| **Total** | **175** | - | - |

---

## ⚙️ Configuration Requirements

### Playwright Config (`playwright.config.ts`)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['list'],
    ...(process.env.CI ? [['github'] as const] : []),
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

### Environment Variables (`.env.test`)

```env
# Test user credentials
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=test-password
TEST_ADMIN_EMAIL=admin@example.com
TEST_ADMIN_PASSWORD=admin-password

# Supabase (local or test instance)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key

# Feature flags for testing
ENABLE_E2E_MOCKS=true
```

### Package.json Scripts

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:platform-apps": "playwright test tests/e2e/platform-apps/"
  }
}
```

---

## 🚀 Implementation Phases

### Phase 1: Setup (Prerequisites) - Day 1
1. ✅ Create `playwright.config.ts`
2. ✅ Create auth fixture with session management
3. ✅ Create API mocking fixture
4. ✅ Setup test data factories
5. ✅ Add data-testid attributes to components (if needed)

### Phase 2: Core Flows (High Priority) - Days 2-4
6. `apps-list.spec.ts` - List page tests (18 tests)
7. `app-create.spec.ts` - Deployment wizard tests (53 tests)
8. `app-detail.spec.ts` - Detail page tests (20 tests)

### Phase 3: Settings (High Priority) - Days 5-6
9. `app-settings.spec.ts` - Settings tests (34 tests)

### Phase 4: Advanced Features (Medium Priority) - Days 7-8
10. `app-domains.spec.ts` - Custom domains tests (20 tests)
11. `app-deployments.spec.ts` - Deployments tests (16 tests)

### Phase 5: Monitoring (Low Priority) - Day 9
12. `app-monitoring.spec.ts` - Logs/metrics tests (14 tests)

### Phase 6: CI Integration - Day 10
13. GitHub Actions workflow
14. Test stability improvements
15. Documentation

---

## ✅ Success Criteria

| Metric | Target |
|--------|--------|
| Test Pass Rate | 100% (CI) |
| Execution Time | < 15 minutes (full suite) |
| Flakiness Rate | < 2% |
| Coverage | All critical user flows |
| Parallel Execution | Supported |

---

## 🔍 Test Data-TestID Requirements

The following `data-testid` attributes should be added to components for reliable test selection:

### Apps List Page
- `apps-list-container`
- `app-card-{id}`
- `deploy-button`
- `stats-total-apps`
- `stats-active-deployments`
- `stats-success-rate`

### New App Wizard
- `step-indicator`
- `provider-option-{github|gitlab|bitbucket}`
- `provider-connected-badge`
- `repository-list`
- `repository-item-{id}`
- `branch-select`
- `framework-select`
- `size-card-{small|medium|large}`
- `project-select`
- `app-name-input`
- `auto-deploy-switch`
- `env-var-row-{index}`
- `add-env-var-button`
- `remove-env-var-button-{index}`
- `deploy-button`
- `next-button`
- `back-button`

### App Detail Page
- `app-detail-header`
- `app-name`
- `app-status-badge`
- `deployment-url`
- `refresh-button`
- `delete-button`
- `tab-overview`
- `tab-integrations`
- `tab-domains`
- `tab-deployments`
- `tab-logs`
- `tab-settings`

### Settings
- `env-vars-editor`
- `save-env-vars-button`
- `redeploy-button`
- `resize-card-{size}`
- `resize-button`
- `delete-app-button`
- `delete-modal`
- `delete-confirm-input`
- `delete-confirm-button`

---

## 📎 Dependencies

| Dependency | Version | Status |
|------------|---------|--------|
| `@playwright/test` | ^1.41.2 | To install |
| Mock data (`mock-data-platform-apps.ts`) | - | ✅ Exists |
| Test helpers (`test-helpers.ts`) | - | ✅ Exists |
| Vitest tests (reference) | - | ✅ Exists |

---

## 📚 References

- [Playwright Documentation](https://playwright.dev/)
- [Next.js Testing Guide](https://nextjs.org/docs/testing)
- Existing test conventions: `tests/integration/api/database-create.test.ts`
- Test helpers: `tests/utils/test-helpers.ts`
- Setup file: `tests/setup.ts`
- Vitest config: `vitest.config.ts`
- App Deployment Test Plan: `APP_DEPLOYMENT_TEST_PLAN.md`

---

## 📝 Notes

1. **Mocking Strategy**: Use Playwright's route interception for API mocking rather than MSW for E2E tests
2. **Authentication**: Store auth state to reuse across tests for speed
3. **Parallel Execution**: Tests should be isolated and not depend on shared state
4. **CI Considerations**: Use single worker in CI to avoid flakiness
5. **Screenshots**: Capture on failure for debugging
6. **Video Recording**: Enable for CI failures only to save storage

---

**Document Version**: 1.0  
**Created**: January 12, 2026  
**Author**: GitHub Copilot  
**Status**: Ready for Implementation
