# Database Cluster Testing - Quick Start Guide

## 📋 Overview

This directory contains comprehensive tests for the database cluster feature, including:
- ✅ **Unit Tests**: Validation schemas, utility functions
- ✅ **Integration Tests**: API routes with Supabase & DigitalOcean
- ✅ **Component Tests**: React components and UI interactions
- ✅ **E2E Tests**: Complete user flows (optional, with Playwright)

## 🚀 Quick Start

### 1. Install Testing Dependencies

```bash
# Install Vitest and React Testing Library
npm install -D vitest @vitejs/plugin-react @vitest/ui

# Install testing utilities
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event

# Install MSW for API mocking (optional but recommended)
npm install -D msw

# Install jsdom for DOM simulation
npm install -D jsdom

# For E2E testing (optional)
npm install -D @playwright/test
npx playwright install
```

### 2. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (recommended during development)
npm test -- --watch

# Run with coverage report
npm run test:coverage

# Run with UI (interactive mode)
npm run test:ui

# Run specific test file
npm test database-create.test.ts

# Run tests matching a pattern
npm test -- -t "should create MySQL"
```

### 3. View Coverage Report

```bash
npm run test:coverage
# Open coverage/index.html in your browser
```

## 📁 Test Structure

```
tests/
├── setup.ts                          # Global test setup
├── utils/
│   ├── mock-data.ts                  # Mock database clusters, users, etc.
│   └── test-helpers.ts               # Helper functions
├── unit/
│   └── validation/
│       └── database.test.ts          # ✅ Ready to run
├── integration/
│   └── api/
│       └── database-create.test.ts   # ✅ Example provided
└── components/
    └── (to be created)
```

## ✅ Current Test Status

### Completed
- ✅ Vitest configuration (`vitest.config.ts`)
- ✅ Test setup file (`tests/setup.ts`)
- ✅ Mock data utilities (`tests/utils/mock-data.ts`)
- ✅ Test helper functions (`tests/utils/test-helpers.ts`)
- ✅ Validation schema tests (`tests/unit/validation/database.test.ts`)
- ✅ Example API test (`tests/integration/api/database-create.test.ts`)

### To Be Implemented (See DATABASE_TEST_PLAN.md)
- ⏳ Remaining API route tests (14 more endpoints)
- ⏳ Component tests (6 main components)
- ⏳ E2E tests (optional but recommended)

## 🧪 Writing Your First Test

### Example: Testing a Validation Schema

```typescript
import { describe, it, expect } from 'vitest';
import { createDatabaseSchema } from '@/lib/validation/database';

describe('createDatabaseSchema', () => {
  it('should accept valid MySQL configuration', () => {
    const payload = {
      name: 'test-mysql-01',
      engine: 'mysql',
      version: '8',
      num_nodes: 1,
      size: 'db-s-1vcpu-1gb',
      region: 'nyc1',
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      owner_id: '550e8400-e29b-41d4-a716-446655440001',
    };

    const result = createDatabaseSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should reject invalid cluster name', () => {
    const payload = {
      name: 'AB', // Too short
      // ... rest of payload
    };

    const result = createDatabaseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
```

### Example: Testing an API Route

```typescript
import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/services/database/create/route';
import { createMockPostRequest } from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('axios');

describe('POST /api/services/database/create', () => {
  it('should create database successfully', async () => {
    const axios = await import('axios');
    vi.mocked(axios.default.post).mockResolvedValue({
      status: 201,
      data: { database: { name: 'test-db' } },
    });

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/database/create',
      { name: 'test-db', engine: 'mysql', /* ... */ }
    );

    const response = await POST(request);
    expect(response.status).toBe(201);
  });
});
```

### Example: Testing a React Component

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DatabasePage from '@/app/dashboard/services/database/page';

describe('DatabasePage', () => {
  it('should display database clusters', async () => {
    render(<DatabasePage />);
    
    await waitFor(() => {
      expect(screen.getByText('test-db')).toBeInTheDocument();
    });
  });

  it('should navigate to new database page', async () => {
    const user = userEvent.setup();
    render(<DatabasePage />);
    
    const button = screen.getByText('New Database');
    await user.click(button);
    
    // Assert navigation occurred
  });
});
```

## 🛠️ Common Testing Patterns

### Mocking Authenticated User
```typescript
import { mockAuthenticatedUser } from '../utils/test-helpers';

beforeEach(() => {
  mockAuthenticatedUser('user-id-123');
});
```

### Mocking API Responses
```typescript
import axios from 'axios';
import { vi } from 'vitest';

vi.mock('axios');

const axiosMock = vi.mocked(axios);
axiosMock.post.mockResolvedValue({
  status: 200,
  data: { success: true },
});
```

### Using Mock Data
```typescript
import { mockDatabaseCluster, mockCreateDatabasePayload } from '../utils/mock-data';

// Use in your tests
const cluster = mockDatabaseCluster;
const payload = mockCreateDatabasePayload;
```

### Testing Async Operations
```typescript
import { waitFor } from '@testing-library/react';

await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});
```

## 🎯 Next Steps

1. **Start with validation tests** - Run existing tests:
   ```bash
   npm test database.test.ts
   ```

2. **Add API route tests** - Use `database-create.test.ts` as template

3. **Add component tests** - Test UI interactions

4. **Monitor coverage** - Aim for 80%+ overall coverage

5. **Set up CI/CD** - Automate testing in GitHub Actions

## 📚 Resources

- [Vitest Docs](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [DATABASE_TEST_PLAN.md](../DATABASE_TEST_PLAN.md) - Full test plan

## ⚠️ Known Issues

The test files currently show TypeScript errors because testing dependencies are not yet installed. After running:
```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```
All errors should resolve.

## 💡 Tips

1. **Write tests as you code** - Don't leave testing for later
2. **Test behavior, not implementation** - Focus on what users experience
3. **Keep tests simple** - One assertion per test when possible
4. **Use descriptive test names** - Make failures easy to understand
5. **Mock external dependencies** - Don't call real APIs in tests

## 🐛 Debugging Tests

```bash
# Run a single test in debug mode
npm test -- --reporter=verbose database-create.test.ts

# Run with browser debugging
npm run test:ui

# Show console logs
npm test -- --reporter=verbose
```

## 📊 Coverage Goals

- Overall: **80%+**
- API Routes: **90%+** (business critical)
- Validation: **100%** (security critical)
- Components: **70%+** (UI logic)

---

**Ready to test?** Start with:
```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
npm test
```

Good luck! 🚀
