# Playwright E2E Tests - Platform Apps

End-to-end tests for the Platform Apps (App Deployment) service using Playwright.

## 📁 Structure

```
tests/e2e/platform-apps/
├── fixtures/
│   ├── auth.fixture.ts          # Authentication helpers
│   ├── api-mocks.fixture.ts     # API mocking utilities
│   └── test-data.fixture.ts     # Test data and mocks
├── apps-list.spec.ts            # Apps listing page tests (18 tests)
├── app-create.spec.ts           # Deployment wizard tests (20 tests)
├── app-detail.spec.ts           # App detail page tests
├── app-settings.spec.ts         # Settings & configuration tests
├── app-domains.spec.ts          # Custom domains tests
├── app-deployments.spec.ts      # Deployments & rollback tests
└── app-monitoring.spec.ts       # Logs & metrics tests
```

## 🚀 Quick Start

### Install Dependencies

```bash
npm install
npx playwright install
```

### Configure Environment

Create `.env.test` file with test credentials:

```env
TEST_USER_EMAIL=your-test-user@example.com
TEST_USER_PASSWORD=your-test-password
TEST_ADMIN_EMAIL=admin@example.com
TEST_ADMIN_PASSWORD=admin-password
BASE_URL=http://localhost:3000
```

### Run Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI mode (recommended for development)
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Run specific test file
npm run test:e2e tests/e2e/platform-apps/apps-list.spec.ts

# Run platform-apps tests only
npm run test:e2e:platform-apps

# Debug mode
npm run test:e2e:debug

# Generate HTML report
npm run test:e2e:report
```

## 🧪 Test Coverage

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| Apps List | 18 | ✅ Complete | Page load, statuses, navigation |
| App Create | 20 | ✅ Complete | Wizard flow, validation, deployment |
| App Detail | 20 | 🚧 In Progress | Detail page, tabs, overview |
| App Settings | 34 | 📋 Planned | Env vars, resize, delete |
| Custom Domains | 20 | 📋 Planned | Add, verify, activate, remove |
| Deployments | 16 | 📋 Planned | History, redeploy, rollback |
| Monitoring | 14 | 📋 Planned | Logs, metrics, health |
| **Total** | **142** | - | - |

## 🔧 Fixtures

### Authentication (`auth.fixture.ts`)

Provides authenticated page contexts:

```typescript
test('my test', async ({ authenticatedPage }) => {
  // Already logged in as regular user
  await authenticatedPage.goto('/dashboard/services/apps');
});

test('admin test', async ({ adminPage }) => {
  // Already logged in as admin
  await adminPage.goto('/admin/apps');
});
```

### API Mocks (`api-mocks.fixture.ts`)

Mock API responses:

```typescript
const apiMocks = new ApiMocks(page);

// Mock apps list
await apiMocks.mockAppsList([mockApp1, mockApp2]);

// Mock app creation
await apiMocks.mockAppCreate({ app_id: 'new-app' }, 200);

// Mock error
await apiMocks.mockError('/api/services/platform-apps/create', 402, 'Insufficient credits');
```

### Test Data (`test-data.fixture.ts`)

Pre-defined test data:

```typescript
import {
  mockPlatformApp,
  mockBuildingApp,
  mockFailedApp,
  mockGitHubRepositories,
  mockMultipleApps,
} from './fixtures/test-data.fixture';
```

## 📝 Writing Tests

### Test Structure

```typescript
import { test, expect } from './fixtures/auth.fixture';
import { ApiMocks } from './fixtures/api-mocks.fixture';
import { mockPlatformApp } from './fixtures/test-data.fixture';

test.describe('Feature Name', () => {
  test('E2E-PA-XXX: Test description', async ({ authenticatedPage }) => {
    // Setup mocks
    const apiMocks = new ApiMocks(authenticatedPage);
    await apiMocks.mockAppsList([mockPlatformApp]);

    // Navigate
    await authenticatedPage.goto('/dashboard/services/apps');

    // Assert
    await expect(authenticatedPage.locator('text=my-nextjs-app')).toBeVisible();
  });
});
```

### Best Practices

1. **Use Test IDs**: Always use `E2E-PA-XXX` format matching the test plan
2. **Mock APIs**: Use `ApiMocks` class for consistent API mocking
3. **Wait for Visibility**: Use `waitFor` or `{ timeout: 10000 }` for dynamic content
4. **Descriptive Selectors**: Prefer `text=`, `role=`, or data-testid over CSS selectors
5. **Isolated Tests**: Each test should be independent and not rely on others
6. **Clean State**: Use fixtures to ensure clean authentication state

## 🐛 Debugging

### UI Mode

```bash
npm run test:e2e:ui
```

Best for interactive debugging with time-travel and step-through.

### Headed Mode

```bash
npm run test:e2e:headed
```

Watch the browser as tests run.

### Debug Mode

```bash
npm run test:e2e:debug
```

Pauses execution and allows inspection.

### Screenshots & Videos

Failed tests automatically capture:
- Screenshots (`playwright-report/`)
- Videos (only on failure)
- Traces (on first retry)

## 🎯 Test Scenarios Covered

### Apps List Page
- ✅ Page load and display
- ✅ Empty state handling
- ✅ Stats cards rendering
- ✅ Status badges (running, building, failed, pending)
- ✅ Navigation to new app
- ✅ Navigation to app detail
- ✅ Information sections

### App Create Wizard
- ✅ Git provider selection
- ✅ Connected provider status
- ✅ Repository listing
- ✅ Repository selection
- ✅ Branch selection
- ✅ Framework configuration
- ✅ Instance size selection
- ✅ App name validation
- ✅ Environment variables
- ✅ Deployment success/errors
- ✅ Insufficient credits handling
- ✅ Name conflict handling

### Future Tests (Planned)
- App detail page and tabs
- Environment variables management
- Instance resizing
- App deletion
- Custom domain management
- Deployment history
- Rollback functionality
- Runtime logs
- Metrics and monitoring

## 📊 CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Pull requests
- Merges to main
- Manual workflow dispatch

Configuration in `.github/workflows/e2e-tests.yml` (if created).

### Running in CI

```bash
# CI mode with retries and GitHub reporter
CI=true npm run test:e2e
```

## 🔒 Security

- **Never commit real credentials** to `.env.test`
- Use test accounts with limited permissions
- Credentials are in `.gitignore`
- Mock all external API calls

## 📚 References

- [Playwright Documentation](https://playwright.dev/)
- [Test Plan](../../../PLATFORM_APPS_E2E_TEST_PLAN.md)
- [Unit Tests](../../integration/api/)
- [Component Tests](../../components/apps/)

## 💡 Tips

1. **Run dev server first**: Tests expect app running on `localhost:3000`
2. **Use UI mode**: Best experience for writing/debugging tests
3. **Check selectors**: If tests fail, selectors may need adjustment
4. **Mock liberally**: Mock all API calls for deterministic tests
5. **Keep tests fast**: Each test should complete in < 30 seconds

## 🆘 Troubleshooting

### Tests hang at login
- Check test credentials in `.env.test`
- Verify Supabase is running
- Check auth fixture selectors

### API mocks not working
- Verify route patterns match actual API calls
- Check network tab in UI mode
- Ensure mocks are set before navigation

### Flaky tests
- Add explicit waits for dynamic content
- Use `waitForLoadState('networkidle')`
- Check for race conditions

### Timeout errors
- Increase timeout in specific assertions
- Check if element selector is correct
- Verify app is running and responsive

---

**Questions?** Check the [full test plan](../../../PLATFORM_APPS_E2E_TEST_PLAN.md) or existing test files for examples.
