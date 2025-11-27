# Network DDoS Protection - Test Implementation Plan

## 📋 Feature Overview

The Network DDoS Protection feature provides Layer 4 reverse proxy with advanced DDoS protection for TCP/UDP applications using Cloudflare Spectrum.

### Key Components:
- **User Pages**: `/dashboard/services/network-ddos` (list, create, detail)
- **Admin Pages**: `/dashboard/admin/network-ddos` (manage all apps, settings)
- **API Routes**: 7 endpoints (create, read, update, delete, list + admin routes)
- **Database**: `spectrum_apps` table with RLS policies
- **External Integration**: Cloudflare Spectrum API
- **Core Functions**: `config/spectrum-functions.ts`

---

## 📁 Test File Structure

Following the existing database testing pattern:

```
tests/
├── setup.ts                                    # ✅ Already configured
├── utils/
│   ├── mock-data.ts                           # ⏳ Extend with spectrum mocks
│   └── test-helpers.ts                        # ⏳ Extend with spectrum helpers
├── unit/
│   ├── validation/
│   │   ├── database.test.ts                   # ✅ Existing (376 lines)
│   │   └── spectrum.test.ts                   # ⏳ NEW: 200+ lines
│   └── connection-strings.test.ts              # ✅ Existing
├── integration/
│   └── api/
│       ├── database-*.test.ts                 # ✅ Existing (15 files)
│       ├── spectrum-create.test.ts            # ⏳ NEW: ~250 lines
│       ├── spectrum-get.test.ts               # ⏳ NEW: ~120 lines
│       ├── spectrum-update.test.ts            # ⏳ NEW: ~200 lines
│       ├── spectrum-delete.test.ts            # ⏳ NEW: ~150 lines
│       ├── spectrum-list.test.ts              # ⏳ NEW: ~100 lines
│       ├── spectrum-admin-delete.test.ts      # ⏳ NEW: ~100 lines
│       └── spectrum-admin-read-all.test.ts    # ⏳ NEW: ~80 lines
└── components/
    ├── database-*.test.tsx                    # ✅ Existing (3 files, ~2000 lines)
    ├── spectrum-apps-table.test.tsx           # ⏳ NEW: ~400 lines
    ├── spectrum-app-create.test.tsx           # ⏳ NEW: ~600 lines
    ├── spectrum-settings.test.tsx             # ⏳ NEW: ~500 lines
    └── admin-network-ddos.test.tsx            # ⏳ NEW: ~300 lines
```

**Total New Test Files**: 11 files (~2,800 lines of test code)

---

## ✅ Existing Infrastructure (Reusable)

### Already Configured in Project
- ✅ **Vitest** configuration with React support
- ✅ **jsdom** environment for component testing
- ✅ **@testing-library/react** for component rendering
- ✅ **Coverage** reporting (text, json, html, lcov)

### Test Setup (`tests/setup.ts`)
Already mocks:
- ✅ Next.js navigation (useRouter, usePathname, redirect, notFound)
- ✅ Framer Motion → `motion/react`
- ✅ Sonner toast notifications
- ✅ Environment variables:
  ```typescript
  NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  DIGITAL_OCEAN_TOKEN = 'Bearer test-do-token'
  ENCRYPTION_KEY = 'test-encryption-key-32-characters'
  ```

**Need to Add**:
- ⏳ Cloudflare environment variables:
  ```typescript
  CLOUDFLARE_ZONE_ID = 'test-zone-id'
  CLOUDFLARE_API_TOKEN = 'test-cf-token'
  PARENT_DOMAIN = '.hostguardian.net'
  ```

### Test Helpers (`tests/utils/test-helpers.ts`)
Already provides:
- ✅ `renderWithProviders()` - Render components
- ✅ `mockAuthenticatedUser()` - Mock auth session
- ✅ `mockUnauthenticatedUser()` - Mock no auth
- ✅ `createMockRequest()` - Create NextRequest
- ✅ `createMockPostRequest()` - Create POST request
- ✅ `expectResponseStatus()` - Validate response
- ✅ `mockDigitalOceanAPI()` - Mock DO API
- ✅ `mockSupabaseQuery()` - Mock Supabase

**Need to Add**:
- ⏳ `mockCloudflareAPI()` - Mock Cloudflare Spectrum API
- ⏳ `mockAdminUser()` - Mock user with admin role
- ⏳ `mockEncryption()` - Mock encryption/decryption

### Mock Data (`tests/utils/mock-data.ts`)
Already provides:
- ✅ `mockUser` - Test user
- ✅ `mockProject` - Test project
- ✅ `mockDatabaseCluster` - Database cluster data

**Need to Add**:
- ⏳ `mockSpectrumApp` - Spectrum app data
- ⏳ `mockCloudflareSpectrumApp` - Cloudflare API response
- ⏳ `mockEncryptedDNS` - Encrypted DNS structure
- ⏳ `mockSpectrumPayloads` - Valid/invalid payloads
- ⏳ `mockAdminSpectrumApp` - Admin view data

---

## 📝 Test Files to Create

### 1. Unit Tests

#### `tests/unit/validation/spectrum.test.ts` (~200 lines)

Pattern from `database.test.ts` (376 lines). Test all validation schemas:

```typescript
import { describe, it, expect } from 'vitest';
import {
  createSpectrumAppSchema,
  updateSpectrumAppSchema,
  deleteSpectrumAppSchema,
  getSpectrumAppSchema,
} from '@/lib/validation/spectrum';
import { mockSpectrumPayloads } from '../../utils/mock-data';

describe('Spectrum Validation Schemas', () => {
  describe('createSpectrumAppSchema', () => {
    describe('Valid Cases', () => {
      it('should accept valid spectrum app payload')
      it('should accept TCP protocol (tcp/22)')
      it('should accept UDP protocol (udp/27015)')
      it('should accept port range (tcp/8000-9000)')
      it('should default optional fields')
      // ... 10 more tests
    })

    describe('Invalid Cases - Fields', () => {
      it('should reject invalid project_id')
      it('should reject invalid owner_id')
      it('should reject invalid dns format')
      it('should reject invalid protocol')
      it('should reject empty origin_direct')
      // ... 15 more tests
    })
  })

  describe('updateSpectrumAppSchema', () => {
    // ... 12 tests
  })

  describe('deleteSpectrumAppSchema', () => {
    // ... 6 tests
  })

  describe('getSpectrumAppSchema', () => {
    // ... 6 tests
  })
})
```

**Total**: ~50 test cases

---

### 2. Integration Tests (API Routes)

#### `tests/integration/api/spectrum-create.test.ts` (~250 lines)

Pattern from `database-create.test.ts` (255 lines):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/spectrum/apps/create/route';
import { NextRequest } from 'next/server';
import {
  mockCreateSpectrumPayload,
  mockCloudflareSpectrumApp,
} from '../../utils/mock-data';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockCloudflareAPI,
} from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('axios');
vi.mock('@/config/functions'); // For encryption

describe('POST /api/services/spectrum/apps/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
  });

  describe('Authentication', () => {
    it('should return 401 if not authenticated')
    // 1 test
  })

  describe('Rate Limiting', () => {
    it('should allow 3 requests per minute')
    it('should return 429 on 4th request')
    it('should include retry-after header')
    // 3 tests
  })

  describe('Validation', () => {
    it('should validate with createSpectrumAppSchema')
    it('should reject invalid project_id')
    it('should reject invalid protocol')
    it('should reject empty origin_direct')
    // 8 tests
  })

  describe('Success Cases', () => {
    it('should create app in Cloudflare')
    it('should persist app to database')
    it('should encrypt DNS name')
    it('should resolve DNS to IP')
    it('should add project log')
    it('should return 201 with app data')
    // 10 tests
  })

  describe('Error Cases', () => {
    it('should handle Cloudflare API error')
    it('should handle database insert failure')
    it('should handle DNS resolution timeout')
    it('should handle encryption error')
    // 8 tests
  })
})
```

**Total**: ~30 test cases

#### `tests/integration/api/spectrum-update.test.ts` (~200 lines)

```typescript
describe('PUT /api/services/spectrum/apps/update', () => {
  // Authentication (1)
  // Validation (6)
  // Success Cases (8)
  // Error Cases (6)
})
```

**Total**: ~21 test cases

#### `tests/integration/api/spectrum-delete.test.ts` (~150 lines)

```typescript
describe('POST /api/services/spectrum/apps/delete', () => {
  // Authentication & Authorization (4)
  // Rate Limiting (3)
  // Success Cases (5)
  // Error Cases (5)
})
```

**Total**: ~17 test cases

#### `tests/integration/api/spectrum-get.test.ts` (~120 lines)

```typescript
describe('POST /api/services/spectrum/apps/get', () => {
  // Authentication & Authorization (3)
  // Success Cases (5)
  // Error Cases (4)
})
```

**Total**: ~12 test cases

#### `tests/integration/api/spectrum-list.test.ts` (~100 lines)

```typescript
describe('POST /api/services/spectrum/apps/list', () => {
  // Authentication (1)
  // Success Cases (5)
  // Error Cases (3)
})
```

**Total**: ~9 test cases

#### `tests/integration/api/spectrum-admin-delete.test.ts` (~100 lines)

```typescript
describe('POST /api/admin/network-ddos/apps/delete', () => {
  // Authentication & Authorization (3)
  // Success Cases (3)
  // Error Cases (3)
})
```

**Total**: ~9 test cases

#### `tests/integration/api/spectrum-admin-read-all.test.ts` (~80 lines)

```typescript
describe('GET /api/admin/network-ddos/apps/read-all', () => {
  // Authentication & Authorization (2)
  // Success Cases (4)
})
```

**Total**: ~6 test cases

---

### 3. Component Tests

#### `tests/components/spectrum-apps-table.test.tsx` (~400 lines)

Pattern from `database-list.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpectrumAppsTable from '@/components/dashboard/network-ddos/spectrum-apps-table';
import { mockSpectrumApps } from '../utils/mock-data';

describe('SpectrumAppsTable Component', () => {
  describe('Empty State', () => {
    it('should show empty state when no apps')
    it('should display "No Protected Applications" message')
    it('should show "Enable Protection" button')
    // 3 tests
  })

  describe('Table Rendering', () => {
    it('should render table headers')
    it('should display app name (dns.original_name)')
    it('should display spectrum_id')
    it('should display protocol')
    it('should show status badge')
    it('should display traffic type')
    it('should render action buttons')
    // 15 tests
  })

  describe('Status Badges', () => {
    it('should show Active badge for created status')
    it('should show Creating badge with spinner')
    it('should show Unknown badge for null status')
    // 3 tests
  })

  describe('Actions', () => {
    it('should navigate to detail on View click')
    it('should open delete dialog on Delete click')
    it('should call delete API on confirm')
    it('should show loading during deletion')
    it('should refresh after deletion')
    it('should show error toast on failure')
    // 10 tests
  })

  describe('Responsive Behavior', () => {
    it('should hide columns on mobile')
    // 3 tests
  })
})
```

**Total**: ~34 test cases

#### `tests/components/spectrum-app-create.test.tsx` (~600 lines)

Pattern from `database-create-form.test.tsx` (701 lines):

```typescript
describe('SpectrumAppCreate Component', () => {
  describe('Form Initialization', () => {
    it('should start at step 0 for admin')
    it('should start at step 1 for user')
    it('should fetch spectrum pricing')
    it('should load projects list')
    // 8 tests
  })

  describe('User Selection (Admin Only)', () => {
    it('should show user search')
    it('should filter users by query')
    it('should validate user selection')
    // 5 tests
  })

  describe('App Type Step', () => {
    it('should render protocol types')
    it('should select SSH')
    it('should select RDP')
    it('should select custom')
    // 8 tests
  })

  describe('Domain Step', () => {
    it('should validate domain name')
    it('should check unique name')
    it('should show PARENT_DOMAIN suffix')
    it('should enforce min/max length')
    // 8 tests
  })

  describe('Edge Port Step', () => {
    it('should skip for SSH/RDP')
    it('should validate port number')
    it('should accept valid port')
    // 5 tests
  })

  describe('Origin Step', () => {
    it('should validate IP address')
    it('should validate port number')
    it('should accept valid origin')
    // 6 tests
  })

  describe('Settings Step', () => {
    it('should skip for SSH/RDP')
    it('should toggle TLS')
    it('should toggle IP firewall')
    it('should select proxy protocol')
    // 8 tests
  })

  describe('Project Selection', () => {
    it('should validate project required')
    it('should select project')
    // 3 tests
  })

  describe('Navigation', () => {
    it('should advance to next step')
    it('should go back')
    it('should skip steps for SSH/RDP')
    // 6 tests
  })

  describe('Form Submission', () => {
    it('should build complete payload')
    it('should call create API')
    it('should show loading state')
    it('should redirect on success')
    it('should show error on failure')
    // 8 tests
  })
})
```

**Total**: ~65 test cases

#### `tests/components/spectrum-settings.test.tsx` (~500 lines)

```typescript
describe('SpectrumSettings Component', () => {
  describe('Rendering', () => {
    it('should display all settings')
    it('should show DNS type')
    it('should show protocol')
    it('should show TLS setting')
    it('should show origins list')
    // 12 tests
  })

  describe('Edit Mode', () => {
    it('should enter edit mode on Edit click')
    it('should show Save/Cancel buttons')
    it('should enable input fields')
    // 5 tests
  })

  describe('Origin Management', () => {
    it('should add new origin')
    it('should validate IP:Port format')
    it('should remove origin')
    it('should require at least one origin')
    // 8 tests
  })

  describe('Validation', () => {
    it('should validate protocol format')
    it('should validate IP address')
    it('should validate port range')
    // 10 tests
  })

  describe('Save/Cancel', () => {
    it('should call update API on save')
    it('should show loading state')
    it('should exit edit mode on success')
    it('should revert on cancel')
    // 8 tests
  })
})
```

**Total**: ~43 test cases

#### `tests/components/admin-network-ddos.test.tsx` (~300 lines)

```typescript
describe('AdminNetworkDDoS Component', () => {
  describe('Page Rendering', () => {
    it('should render page title')
    it('should display total apps count')
    it('should render tabs')
    // 5 tests
  })

  describe('DDoS Users Tab', () => {
    it('should render search input')
    it('should filter by query')
    it('should sort apps')
    it('should paginate apps')
    it('should navigate pages')
    it('should show app data in table')
    it('should show owner email/username')
    it('should delete app on confirm')
    it('should update table after deletion')
    // 20 tests
  })

  describe('DDoS Settings Tab', () => {
    it('should render pricing settings')
    it('should update pricing')
    // 5 tests
  })
})
```

**Total**: ~30 test cases

---

## 🎯 Test Coverage Summary

| Category | Files | Test Cases | Estimated Lines |
|----------|-------|------------|-----------------|
| **Unit Tests** | 1 | 50 | 200 |
| **Integration Tests** | 7 | 104 | 1,000 |
| **Component Tests** | 4 | 172 | 1,800 |
| **TOTAL** | **12** | **326** | **~3,000** |

---

## 🔧 Mock Data Extensions Needed

### `tests/utils/mock-data.ts` - Add:

```typescript
// Spectrum App Mock Data
export const mockSpectrumApp: Tables<'spectrum_apps'> = {
  id: 'spec-550e8400-e29b-41d4-a716-446655440001',
  spectrum_id: 'cf-spectrum-app-123',
  dns: {
    name: {
      iv: 'test-iv',
      encrypted: 'encrypted-ip',
      tag: 'test-tag',
      salt: 'test-salt',
    },
    type: 'A',
    original_name: 'myapp',
  },
  protocol: 'tcp/22',
  origin_direct: ['tcp://192.168.1.100:22'],
  tls: 'off',
  edge_ips: {
    type: 'dynamic',
    connectivity: 'all',
  },
  ip_firewall: false,
  traffic_type: 'direct',
  proxy_protocol: 'off',
  owner_id: mockUser.id,
  project_id: mockProject.id,
  status: 'created',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const mockCloudflareSpectrumApp = {
  id: 'cf-spectrum-app-123',
  dns: { name: 'myapp.hostguardian.net', type: 'A' },
  protocol: 'tcp/22',
  origin_direct: ['tcp://192.168.1.100:22'],
  tls: 'off',
  edge_ips: { type: 'dynamic', connectivity: 'all' },
  ip_firewall: false,
  traffic_type: 'direct',
  proxy_protocol: 'off',
  argo_smart_routing: true,
};

export const mockCreateSpectrumPayload = {
  project_id: mockProject.id,
  owner_id: mockUser.id,
  dns: { name: 'myapp', type: 'A' },
  protocol: 'tcp/22',
  origin_direct: ['192.168.1.100:22'],
  tls: 'off',
  edge_ips: { type: 'dynamic', connectivity: 'all' },
  ip_firewall: false,
  traffic_type: 'direct',
  proxy_protocol: 'off',
};

export const mockAdminSpectrumApp: Admin_SpectrumApp = {
  ...mockSpectrumApp,
  owner_email: mockUser.email,
  owner_username: 'testuser',
};

export const mockInvalidSpectrumPayloads = {
  invalidProtocol: { ...mockCreateSpectrumPayload, protocol: 'http/80' },
  invalidProjectId: { ...mockCreateSpectrumPayload, project_id: 'not-a-uuid' },
  emptyOrigins: { ...mockCreateSpectrumPayload, origin_direct: [] },
  // ... more invalid cases
};
```

### `tests/utils/test-helpers.ts` - Add:

```typescript
/**
 * Mock Cloudflare Spectrum API
 */
export function mockCloudflareAPI(
  endpoint: string,
  response: any,
  status = 200
) {
  return vi.fn((url: string) => {
    if (url.includes('spectrum/apps')) {
      return Promise.resolve({
        status,
        data: {
          success: status < 400,
          result: response,
          errors: status >= 400 ? [{ message: 'Cloudflare error' }] : [],
        },
      });
    }
    return Promise.reject(new Error('Endpoint not mocked'));
  });
}

/**
 * Mock admin user session
 */
export function mockAdminUser(userId?: string) {
  const mockUser = mockAuthenticatedUser(userId);
  
  vi.mock('@/lib/supabase/queries', async () => {
    const actual = await vi.importActual('@/lib/supabase/queries');
    return {
      ...actual,
      User_Profiles: {
        ...actual.User_Profiles,
        get_by_id: vi.fn(() => Promise.resolve({
          ...mockUser,
          roles: ['admin'],
        })),
      },
    };
  });
  
  return mockUser;
}

/**
 * Mock encryption functions
 */
export function mockEncryption() {
  vi.mock('@/config/functions', () => ({
    Encryption: {
      encrypt: vi.fn((data: string) => ({
        iv: 'mock-iv',
        encrypted: `encrypted-${data}`,
        tag: 'mock-tag',
        salt: 'mock-salt',
      })),
      decrypt: vi.fn((encrypted: any) => {
        return encrypted.encrypted.replace('encrypted-', '');
      }),
    },
  }));
}
```

### `tests/setup.ts` - Add Cloudflare env vars:

```typescript
// Add to existing environment variables
process.env.CLOUDFLARE_ZONE_ID = 'test-zone-id';
process.env.CLOUDFLARE_API_TOKEN = 'test-cf-token';
process.env.PARENT_DOMAIN = '.hostguardian.net';
```

---

## 📋 Implementation Plan

### Phase 1: Setup & Unit Tests (Week 1)
1. ✅ Extend `mock-data.ts` with spectrum data
2. ✅ Extend `test-helpers.ts` with spectrum helpers
3. ✅ Update `setup.ts` with Cloudflare env vars
4. ✅ Create `spectrum.test.ts` (unit tests)
5. ✅ Run and verify unit tests pass

### Phase 2: Integration Tests (Week 2)
6. ✅ Create `spectrum-create.test.ts`
7. ✅ Create `spectrum-update.test.ts`
8. ✅ Create `spectrum-delete.test.ts`
9. ✅ Create `spectrum-get.test.ts`
10. ✅ Create `spectrum-list.test.ts`
11. ✅ Create `spectrum-admin-*.test.ts` (2 files)
12. ✅ Run and verify all API tests pass

### Phase 3: Component Tests (Week 3)
13. ✅ Create `spectrum-apps-table.test.tsx`
14. ✅ Create `spectrum-app-create.test.tsx`
15. ✅ Create `spectrum-settings.test.tsx`
16. ✅ Create `admin-network-ddos.test.tsx`
17. ✅ Run and verify all component tests pass

### Phase 4: Coverage & Refinement (Week 4)
18. ✅ Run full test suite
19. ✅ Generate coverage report
20. ✅ Add missing edge case tests
21. ✅ Refactor and optimize tests
22. ✅ Update documentation

---

## 🚀 Running Tests

```bash
# Run all spectrum tests
npm test -- spectrum

# Run specific test file
npm test tests/unit/validation/spectrum.test.ts

# Run integration tests only
npm test tests/integration/api/spectrum

# Run component tests only
npm test tests/components/spectrum

# Run with coverage
npm run test:coverage

# Run in watch mode
npm test -- --watch
```

---

## 📈 Success Metrics

- ✅ All unit tests pass (50 tests)
- ✅ All integration tests pass (104 tests)
- ✅ All component tests pass (172 tests)
- ✅ **Total: 326 tests passing**
- ✅ Coverage > 85% for spectrum-related code
- ✅ No critical bugs found in testing
- ✅ All edge cases covered
- ✅ CI/CD pipeline includes spectrum tests

---

**Document Version**: 2.0  
**Created**: November 27, 2025  
**Last Updated**: November 27, 2025  
**Pattern**: Following existing database test structure
