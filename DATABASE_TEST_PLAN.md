# Database Cluster - Comprehensive Test Plan

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [Testing Stack Recommendation](#testing-stack-recommendation)
3. [Test Categories](#test-categories)
4. [Detailed Test Cases](#detailed-test-cases)
5. [Setup Instructions](#setup-instructions)
6. [Running Tests](#running-tests)
7. [CI/CD Integration](#cicd-integration)

---

## 🎯 Project Overview

### Key Features Analyzed
Your database cluster implementation includes:

**Frontend Pages:**
- `/dashboard/services/database` - Database listing page
- `/dashboard/services/database/new` - Create new database cluster
- `/dashboard/services/database/clusters/[databaseId]` - Single cluster details with tabs

**API Routes (16+ endpoints):**
- `/api/services/database/create` - Create cluster
- `/api/services/database/read` - Read cluster details
- `/api/services/database/read_all_owner` - List all user clusters
- `/api/services/database/update` - Update project assignment
- `/api/services/database/delete` - Delete cluster
- `/api/services/database/users/*` - User management (create, delete, list, reset)
- `/api/services/database/dbs/*` - Database management (list, delete, create)
- `/api/services/database/network/*` - Firewall rules (read, update, delete)
- `/api/services/database/maintenance/*` - Maintenance window (read, update)
- `/api/services/database/update_status` - Status updates
- `/api/services/database/region` - Region info
- `/api/services/database/readForMigrate` - Migration data

**Key Technologies:**
- Next.js 15 with App Router
- Supabase for database
- DigitalOcean API integration
- Zod validation
- Encryption for sensitive data

---

## 🧪 Testing Stack Recommendation

### Recommended Tools
```json
{
  "testing": {
    "unit-integration": "Vitest (faster) or Jest",
    "react-testing": "@testing-library/react",
    "api-mocking": "MSW (Mock Service Worker)",
    "e2e": "Playwright (recommended) or Cypress",
    "coverage": "c8 or Istanbul"
  }
}
```

### Why This Stack?
- **Vitest**: Faster than Jest, built for Vite, works great with Next.js
- **Testing Library**: Best practices for React component testing
- **MSW**: Intercepts API calls at network level, realistic mocking
- **Playwright**: Full E2E testing with excellent Next.js support

---

## 📊 Test Categories

### 1. Unit Tests (40% coverage)
- Validation schemas
- Utility functions
- Component logic

### 2. Integration Tests (35% coverage)
- API routes with Supabase
- DigitalOcean API integration
- Database operations

### 3. Component Tests (15% coverage)
- React components
- Form interactions
- State management

### 4. E2E Tests (10% coverage)
- Complete user flows
- Critical paths

---

## 🔍 Detailed Test Cases

## A. API Route Tests

### 1. `/api/services/database/create` - Create Database Cluster

#### Test Cases:
```typescript
describe('POST /api/services/database/create', () => {
  // ✅ Success Cases
  test('should create MySQL database with valid data', async () => {
    // Test successful creation
    // Verify Supabase record created
    // Verify encryption of passwords
    // Verify DO API called with correct params
  });

  test('should create PostgreSQL database', async () => {});
  test('should create MongoDB database', async () => {});
  test('should create Redis database', async () => {});

  // ❌ Validation Errors
  test('should reject invalid cluster name (too short)', async () => {
    // Name < 3 chars
  });

  test('should reject invalid cluster name (special chars)', async () => {
    // Name with spaces, _, etc.
  });

  test('should reject invalid engine', async () => {
    // Engine not in allowed list
  });

  test('should reject invalid version for engine', async () => {
    // MySQL with PG version
  });

  test('should reject invalid region', async () => {});

  test('should reject too many nodes', async () => {
    // > MAX_NODES_PER_CLUSTER
  });

  test('should reject invalid size/tier', async () => {});

  test('should reject invalid UUIDs for project_id/owner_id', async () => {});

  // 🔒 Authentication/Authorization
  test('should reject unauthenticated requests', async () => {});

  test('should reject requests from unauthorized users', async () => {});

  // 🔥 Error Handling
  test('should handle DigitalOcean API errors gracefully', async () => {
    // Mock DO API failure
  });

  test('should handle Supabase write failures', async () => {});

  test('should handle encryption failures', async () => {});

  // 💾 Data Integrity
  test('should encrypt connection passwords before storing', async () => {
    // Verify encrypted data in Supabase
  });

  test('should store all connection details correctly', async () => {});

  test('should create activity log entry', async () => {});
});
```

---

### 2. `/api/services/database/read` - Read Database Details

#### Test Cases:
```typescript
describe('POST /api/services/database/read', () => {
  // ✅ Success Cases
  test('should read database cluster without status check', async () => {});

  test('should read database and check DO status', async () => {
    // checkStatus: true
  });

  test('should update Supabase when status changes to online', async () => {
    // Cluster was "creating", now "online"
    // Verify Supabase updated
  });

  test('should decrypt passwords when returning data', async () => {});

  test('should resolve hostnames to IPs for MySQL/PG', async () => {});

  // ❌ Error Cases
  test('should reject invalid UUID', async () => {});

  test('should return 404 for non-existent cluster', async () => {});

  test('should handle DO API timeout gracefully', async () => {});

  test('should handle decryption failures', async () => {});

  // 🔒 Security
  test('should not return passwords to unauthorized users', async () => {});

  test('should reject requests without authentication', async () => {});
});
```

---

### 3. `/api/services/database/delete` - Delete Cluster

#### Test Cases:
```typescript
describe('POST /api/services/database/delete', () => {
  // ✅ Success Cases
  test('should delete cluster from DO and Supabase', async () => {});

  test('should add activity log for deletion', async () => {});

  // ❌ Error Cases
  test('should handle DO deletion failure', async () => {
    // Cluster already deleted in DO
  });

  test('should handle Supabase deletion failure', async () => {});

  test('should reject deletion of non-owned cluster', async () => {});

  test('should reject unauthenticated deletion', async () => {});

  // 🔒 Authorization
  test('should only allow owner to delete cluster', async () => {});

  test('should verify project membership before deletion', async () => {});
});
```

---

### 4. `/api/services/database/users/create` - Create Database User

#### Test Cases:
```typescript
describe('POST /api/services/database/users/create', () => {
  // ✅ Success Cases
  test('should create database user', async () => {});

  test('should encrypt user password before storing', async () => {});

  test('should add activity log for user creation', async () => {});

  // ❌ Validation Errors
  test('should reject invalid username format', async () => {});

  test('should reject duplicate usernames', async () => {});

  test('should reject invalid cluster_id', async () => {});

  // 🔥 Error Handling
  test('should handle DO API errors', async () => {});

  test('should handle Supabase sync failures', async () => {});

  // 🔒 Security
  test('should only allow cluster owner to create users', async () => {});
});
```

---

### 5. `/api/services/database/users/delete` - Delete Database User

#### Test Cases:
```typescript
describe('POST /api/services/database/users/delete', () => {
  // ✅ Success Cases
  test('should delete database user from DO and Supabase', async () => {});

  test('should add activity log for user deletion', async () => {});

  // ❌ Error Cases
  test('should handle non-existent user gracefully', async () => {});

  test('should reject deletion of default user', async () => {
    // Prevent deleting 'doadmin' or default user
  });

  // 🔒 Authorization
  test('should only allow cluster owner to delete users', async () => {});
});
```

---

### 6. `/api/services/database/maintenance` - Update Maintenance Window

#### Test Cases:
```typescript
describe('PUT /api/services/database/maintenance', () => {
  // ✅ Success Cases
  test('should update maintenance window', async () => {});

  test('should update Supabase with new maintenance window', async () => {});

  test('should add activity log', async () => {});

  // ❌ Validation Errors
  test('should reject invalid day', async () => {
    // Not in VALID_MAINTENANCE_DAYS
  });

  test('should reject invalid hour format', async () => {
    // Not matching MAINTENANCE_HOUR_PATTERN
  });

  test('should reject invalid database_id', async () => {});

  // 🔥 Error Handling
  test('should handle DO API errors', async () => {});
});
```

---

### 7. `/api/services/database/network/update` - Add Firewall Rule

#### Test Cases:
```typescript
describe('POST /api/services/database/network/update', () => {
  // ✅ Success Cases
  test('should add IPv4 address to firewall', async () => {});

  test('should add IPv6 address to firewall', async () => {});

  test('should add CIDR notation', async () => {});

  test('should handle "allow all" special IPs', async () => {
    // 0.0.0.0/0 and ::/0
  });

  // ❌ Validation Errors
  test('should reject invalid IP format', async () => {});

  test('should reject duplicate IP addresses', async () => {});

  test('should reject injection attempts', async () => {
    // IP with SQL/NoSQL injection patterns
  });

  // 🔒 Security
  test('should only allow cluster owner to modify firewall', async () => {});

  test('should validate IP belongs to user organization', async () => {});
});
```

---

### 8. `/api/services/database/update` - Update Project Assignment

#### Test Cases:
```typescript
describe('PUT /api/services/database/update', () => {
  // ✅ Success Cases
  test('should move cluster to different project', async () => {});

  test('should add activity log to new project', async () => {});

  // ❌ Error Cases
  test('should reject moving to non-existent project', async () => {});

  test('should reject moving to project user does not own', async () => {});

  test('should validate both cluster_id and project_id are UUIDs', async () => {});

  // 🔒 Authorization
  test('should only allow owner to move clusters', async () => {});
});
```

---

## B. Frontend Component Tests

### 1. Database Listing Page (`page.tsx`)

#### Test Cases:
```typescript
describe('DatabasePage Component', () => {
  // 🎨 Rendering
  test('should display loading state initially', () => {});

  test('should display empty state when no databases', () => {});

  test('should display database table with clusters', () => {});

  test('should show correct database icons', () => {});

  test('should format dates correctly', () => {});

  test('should show status badges with correct colors', () => {});

  // 🖱️ Interactions
  test('should navigate to new database page on button click', () => {});

  test('should navigate to cluster details on "View Cluster"', () => {});

  test('should disable "View Cluster" for migrating clusters', () => {});

  test('should show tooltip on disabled button hover', () => {});

  // 📡 Data Fetching
  test('should fetch clusters on mount', () => {});

  test('should handle API errors gracefully', () => {});

  test('should redirect to login if not authenticated', () => {});

  // 🎯 Data Display
  test('should display cluster name and ID', () => {});

  test('should display correct location from region code', () => {});

  test('should show version info', () => {});
});
```

---

### 2. New Database Form (`components/dashboard/database/new.tsx`)

#### Test Cases:
```typescript
describe('DatabaseSelect Component', () => {
  // 🎨 Step Navigation
  test('should start at step 1', () => {});

  test('should move to step 2 when database type selected', () => {});

  test('should validate form before allowing submission', () => {});

  // 📝 Form Validation
  test('should show error for invalid cluster name', () => {
    // Test all NAMING_RULES
  });

  test('should show error when location not selected', () => {});

  test('should show error when plan not selected', () => {});

  test('should show error when version not selected', () => {});

  test('should show error when project not selected', () => {});

  test('should validate engine-specific versions', () => {});

  test('should prevent form submission with errors', () => {});

  // 🖱️ Interactions
  test('should load available database types on mount', () => {});

  test('should filter plans based on selected database type', () => {});

  test('should update versions when database type changes', () => {});

  test('should calculate and display pricing', () => {});

  test('should require terms acceptance', () => {});

  test('should disable submit button during creation', () => {});

  // 📡 Form Submission
  test('should submit valid form successfully', () => {});

  test('should show success toast on creation', () => {});

  test('should redirect to cluster page after creation', () => {});

  test('should handle API errors during creation', () => {});

  test('should display error messages from API', () => {});

  // 💾 State Management
  test('should preserve form state on step navigation', () => {});

  test('should clear errors when user corrects input', () => {});
});
```

---

### 3. Single Database View (`components/dashboard/database/singledb.tsx`)

#### Test Cases:
```typescript
describe('Singledb Component', () => {
  // 🎨 Rendering
  test('should show loading spinner initially', () => {});

  test('should display cluster details when loaded', () => {});

  test('should render all tabs (Overview, Network, Users, Settings)', () => {});

  // 🔄 Auto-refresh
  test('should poll for status when cluster is creating', () => {});

  test('should stop polling when cluster is online', () => {});

  test('should show toast when cluster becomes online', () => {});

  test('should cleanup interval on unmount', () => {});

  // 🗑️ Delete Modal
  test('should open delete modal on delete button click', () => {});

  test('should require exact cluster name for deletion', () => {});

  test('should disable delete button until name matches', () => {});

  test('should call delete API on confirmation', () => {});

  test('should redirect after successful deletion', () => {});

  test('should handle deletion errors', () => {});

  // 📑 Tab Navigation
  test('should switch between tabs', () => {});

  test('should preserve tab state on re-render', () => {});

  // 🔐 Connection Display
  test('should toggle password visibility', () => {});

  test('should switch between public and private connection', () => {});

  test('should copy connection strings to clipboard', () => {});
});
```

---

### 4. Network Tab (`components/dashboard/database/tabs/network-tab.tsx`)

#### Test Cases:
```typescript
describe('NetworkTab Component', () => {
  // 🎨 Rendering
  test('should display existing firewall rules', () => {});

  test('should show empty state when no rules', () => {});

  test('should display add IP form', () => {});

  // ✅ Adding Rules
  test('should validate IP format before submission', () => {});

  test('should show error for invalid IP', () => {});

  test('should add firewall rule successfully', () => {});

  test('should refresh rules list after adding', () => {});

  test('should show success toast', () => {});

  // ❌ Deleting Rules
  test('should delete firewall rule', () => {});

  test('should show confirmation before deletion', () => {});

  test('should handle deletion errors', () => {});

  // 🔒 Security
  test('should warn when adding 0.0.0.0/0', () => {});
});
```

---

### 5. Users & DBs Tab (`components/dashboard/database/tabs/users-dbs-tab.tsx`)

#### Test Cases:
```typescript
describe('UsersDbsTab Component', () => {
  // 👤 User Management
  test('should list existing database users', () => {});

  test('should create new database user', () => {});

  test('should validate username format', () => {});

  test('should delete database user', () => {});

  test('should reset user password', () => {});

  test('should show decrypted passwords securely', () => {});

  // 🗄️ Database Management
  test('should list databases in cluster', () => {});

  test('should create new database', () => {});

  test('should validate database name', () => {});

  test('should delete database', () => {});

  test('should show confirmation before deletion', () => {});

  // 🔄 Data Refresh
  test('should refresh lists after operations', () => {});
});
```

---

### 6. Settings Tab (`components/dashboard/database/tabs/settings-tab.tsx`)

#### Test Cases:
```typescript
describe('SettingsTab Component', () => {
  // ⚙️ Maintenance Window
  test('should display current maintenance window', () => {});

  test('should update maintenance day', () => {});

  test('should update maintenance hour', () => {});

  test('should validate hour format', () => {});

  test('should show success message after update', () => {});

  // 📦 Project Assignment
  test('should display current project', () => {});

  test('should list available projects', () => {});

  test('should move cluster to different project', () => {});

  test('should confirm before moving', () => {});

  // 🔥 Danger Zone
  test('should show delete cluster option', () => {});

  test('should open confirmation modal', () => {});
});
```

---

## C. Validation Schema Tests

### 1. `lib/validation/database.ts`

#### Test Cases:
```typescript
describe('Database Validation Schemas', () => {
  describe('createDatabaseSchema', () => {
    // ✅ Valid Cases
    test('should accept valid MySQL cluster config', () => {});
    test('should accept valid PostgreSQL config', () => {});
    test('should accept valid MongoDB config', () => {});
    test('should accept valid Redis config', () => {});

    // ❌ Name Validation
    test('should reject names < 3 chars', () => {});
    test('should reject names > 63 chars', () => {});
    test('should reject names with uppercase', () => {});
    test('should reject names with underscores', () => {});
    test('should reject names starting with hyphen', () => {});
    test('should reject names ending with hyphen', () => {});

    // ❌ Engine Validation
    test('should reject invalid engine', () => {});
    test('should reject mismatched engine-version', () => {});

    // ❌ Resource Limits
    test('should reject num_nodes < 1', () => {});
    test('should reject num_nodes > MAX', () => {});
    test('should reject invalid size', () => {});
    test('should reject invalid region', () => {});

    // ❌ UUID Validation
    test('should reject invalid project_id format', () => {});
    test('should reject invalid owner_id format', () => {});
  });

  describe('updateNetworkSchema', () => {
    test('should accept valid IPv4', () => {});
    test('should accept valid IPv6', () => {});
    test('should accept CIDR notation', () => {});
    test('should accept special IPs (0.0.0.0/0)', () => {});
    test('should reject invalid IP format', () => {});
    test('should reject injection attempts', () => {});
  });

  describe('validateEngineVersion', () => {
    test('should validate MySQL versions', () => {});
    test('should validate PostgreSQL versions', () => {});
    test('should validate MongoDB versions', () => {});
    test('should validate Redis versions', () => {});
    test('should reject invalid combinations', () => {});
  });
});
```

---

## D. Integration Tests

### 1. Complete Cluster Lifecycle

```typescript
describe('Database Cluster Lifecycle', () => {
  test('should complete full cluster lifecycle', async () => {
    // 1. Create cluster
    const cluster = await createCluster({...});
    expect(cluster.status).toBe('creating');

    // 2. Wait for online status
    await waitForStatus(cluster.id, 'online');

    // 3. Add firewall rule
    await addFirewallRule(cluster.id, '203.0.113.0/24');

    // 4. Create database user
    const user = await createDatabaseUser(cluster.id, 'testuser');
    expect(user).toBeDefined();

    // 5. Update maintenance window
    await updateMaintenanceWindow(cluster.id, 'tuesday', '02:00');

    // 6. Move to different project
    await updateProject(cluster.id, newProjectId);

    // 7. Delete cluster
    await deleteCluster(cluster.id);
  });
});
```

---

## E. E2E Tests (Playwright)

### Critical User Flows

```typescript
describe('Database Cluster E2E', () => {
  test('User can create a new database cluster', async ({ page }) => {
    // 1. Navigate to databases page
    await page.goto('/dashboard/services/database');

    // 2. Click "New Database"
    await page.click('text=New Database');

    // 3. Fill form
    await page.fill('[name="clusterName"]', 'test-db-01');
    await page.click('text=MySQL');
    await page.selectOption('[name="version"]', '8');
    await page.click('text=New York');
    await page.click('[data-plan="db-s-1vcpu-1gb"]');
    await page.check('[name="terms"]');

    // 4. Submit
    await page.click('button:has-text("Create Database")');

    // 5. Verify success
    await page.waitForURL(/\/dashboard\/services\/database\/clusters/);
    await expect(page.locator('text=test-db-01')).toBeVisible();
  });

  test('User can manage database users', async ({ page }) => {
    // Navigate to cluster
    await page.goto('/dashboard/services/database/clusters/test-cluster-id');

    // Switch to Users tab
    await page.click('text=Users & DBs');

    // Add user
    await page.fill('[name="username"]', 'newuser');
    await page.click('button:has-text("Add User")');

    // Verify user appears
    await expect(page.locator('text=newuser')).toBeVisible();
  });

  test('User can delete database cluster', async ({ page }) => {
    await page.goto('/dashboard/services/database/clusters/test-cluster-id');

    // Open delete modal
    await page.click('button:has-text("Delete Cluster")');

    // Type cluster name
    await page.fill('[name="confirmName"]', 'test-cluster');
    await page.click('button:has-text("Permanently Delete")');

    // Verify redirect
    await page.waitForURL('/dashboard/services/database');
    await expect(page.locator('text=test-cluster')).not.toBeVisible();
  });
});
```

---

## 🛠️ Setup Instructions

### Step 1: Install Testing Dependencies

```bash
# Vitest + React Testing Library
npm install -D vitest @vitejs/plugin-react
npm install -D @testing-library/react @testing-library/jest-dom
npm install -D @testing-library/user-event

# MSW for API mocking
npm install -D msw

# For component testing
npm install -D jsdom

# Playwright for E2E (optional)
npm install -D @playwright/test
npx playwright install
```

### Step 2: Create Configuration Files

**vitest.config.ts:**
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

**tests/setup.ts:**
```typescript
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// Cleanup after each test
afterEach(() => {
  cleanup();
});
```

**playwright.config.ts:**
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Step 3: Update package.json

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

---

## 🚀 Running Tests

### Unit & Integration Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- database.test.ts

# Run with coverage
npm run test:coverage

# Run with UI
npm run test:ui
```

### E2E Tests
```bash
# Run all E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run specific browser
npx playwright test --project=chromium

# Debug mode
npx playwright test --debug
```

---

## 📁 Recommended Test Structure

```
cloud-services/
├── tests/
│   ├── setup.ts                          # Global test setup
│   ├── utils/                            # Test utilities
│   │   ├── mock-data.ts                  # Mock database clusters, users, etc.
│   │   ├── test-helpers.ts               # Helper functions
│   │   └── msw-handlers.ts               # MSW request handlers
│   ├── unit/
│   │   ├── validation/
│   │   │   └── database.test.ts          # Validation schema tests
│   │   └── utils/
│   │       └── encryption.test.ts        # Encryption utility tests
│   ├── integration/
│   │   └── api/
│   │       ├── database-create.test.ts   # Create API tests
│   │       ├── database-read.test.ts     # Read API tests
│   │       ├── database-delete.test.ts   # Delete API tests
│   │       ├── database-users.test.ts    # User management tests
│   │       ├── database-network.test.ts  # Firewall tests
│   │       └── database-maintenance.test.ts # Maintenance tests
│   ├── components/
│   │   ├── database-page.test.tsx        # Listing page tests
│   │   ├── database-new.test.tsx         # Create form tests
│   │   ├── single-database.test.tsx      # Single cluster view tests
│   │   └── tabs/
│   │       ├── network-tab.test.tsx      # Network tab tests
│   │       ├── users-tab.test.tsx        # Users tab tests
│   │       └── settings-tab.test.tsx     # Settings tab tests
│   └── e2e/
│       ├── database-lifecycle.spec.ts    # Complete user flows
│       ├── database-creation.spec.ts     # Creation flow
│       ├── database-management.spec.ts   # Management operations
│       └── database-deletion.spec.ts     # Deletion flow
└── package.json
```

---

## 🔧 Example Test Files

### Example: API Route Test
**tests/integration/api/database-create.test.ts**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { POST } from '@/app/api/services/database/create/route';
import { NextRequest } from 'next/server';

describe('POST /api/services/database/create', () => {
  it('should create a MySQL database cluster', async () => {
    const payload = {
      name: 'test-mysql-01',
      engine: 'mysql',
      version: '8',
      num_nodes: 1,
      size: 'db-s-1vcpu-1gb',
      region: 'nyc1',
      project_id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: '123e4567-e89b-12d3-a456-426614174001',
    };

    const request = new NextRequest('http://localhost:3000/api/services/database/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data.name).toBe('test-mysql-01');
    expect(data.data.engine).toBe('mysql');
  });

  it('should reject invalid cluster name', async () => {
    const payload = {
      name: 'AB', // Too short
      engine: 'mysql',
      version: '8',
      num_nodes: 1,
      size: 'db-s-1vcpu-1gb',
      region: 'nyc1',
      project_id: '123e4567-e89b-12d3-a456-426614174000',
      owner_id: '123e4567-e89b-12d3-a456-426614174001',
    };

    const request = new NextRequest('http://localhost:3000/api/services/database/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

### Example: Component Test
**tests/components/database-page.test.tsx**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DatabasePage from '@/app/dashboard/services/database/page';

// Mock the API
vi.mock('@/lib/axios/axios', () => ({
  default: {
    post: vi.fn(() => Promise.resolve({
      status: 200,
      data: {
        data: [
          {
            id: '1',
            name: 'test-db',
            engine: 'mysql',
            status: 'online',
            num_nodes: 1,
            created_at: new Date().toISOString(),
            version: '8',
            cluster_id: 'cluster-123',
            region: 'nyc1',
          },
        ],
      },
    })),
  },
}));

describe('DatabasePage', () => {
  it('should display loading state initially', () => {
    render(<DatabasePage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('should display database clusters after loading', async () => {
    render(<DatabasePage />);
    
    await waitFor(() => {
      expect(screen.getByText('test-db')).toBeInTheDocument();
    });
  });

  it('should show empty state when no databases', async () => {
    // Mock empty response
    vi.mock('@/lib/axios/axios', () => ({
      default: {
        post: vi.fn(() => Promise.resolve({
          status: 200,
          data: { data: [] },
        })),
      },
    }));

    render(<DatabasePage />);
    
    await waitFor(() => {
      expect(screen.getByText(/no databases found/i)).toBeInTheDocument();
    });
  });
});
```

---

## 🎯 Test Priorities

### Phase 1: Critical Path (Week 1)
1. ✅ Create database cluster API + validation
2. ✅ Read database cluster API
3. ✅ Delete database cluster API
4. ✅ Database listing page
5. ✅ Create form validation

### Phase 2: Core Features (Week 2)
1. ✅ User management APIs (create, delete, reset)
2. ✅ Firewall management APIs
3. ✅ Maintenance window API
4. ✅ Network tab component
5. ✅ Users tab component

### Phase 3: Edge Cases (Week 3)
1. ✅ Error handling across all APIs
2. ✅ Authentication/authorization tests
3. ✅ Data integrity tests
4. ✅ E2E critical flows

### Phase 4: Polish (Week 4)
1. ✅ Increase coverage to 80%+
2. ✅ Performance tests
3. ✅ Security audit tests
4. ✅ Documentation

---

## 📊 Coverage Goals

- **Overall**: 80%+
- **API Routes**: 90%+ (critical business logic)
- **Validation Schemas**: 100% (security critical)
- **Components**: 70%+ (UI logic)
- **E2E**: Cover 5-10 critical user flows

---

## 🔐 Security Testing Checklist

- [ ] SQL/NoSQL injection prevention
- [ ] XSS protection in user inputs
- [ ] Authentication on all protected routes
- [ ] Authorization (users can only access their resources)
- [ ] Password encryption verification
- [ ] API rate limiting
- [ ] CSRF protection
- [ ] Input sanitization
- [ ] Output encoding

---

## 🚨 CI/CD Integration

### GitHub Actions Example
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:coverage
      - run: npm run test:e2e
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

---

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [MSW Documentation](https://mswjs.io/)
- [Playwright Documentation](https://playwright.dev/)
- [Next.js Testing Guide](https://nextjs.org/docs/testing)

---

## 🎉 Summary

This comprehensive test plan covers:
- **150+ test cases** across API routes, components, and E2E flows
- Clear **setup instructions** with configuration files
- **Prioritized testing phases** for systematic implementation
- **Security testing** checklist for production readiness
- **CI/CD integration** for automated testing

Start with Phase 1 (critical path tests) and gradually expand coverage. Focus on high-impact areas first: API validation, authentication, and core user flows.

Good luck with your testing! 🚀
