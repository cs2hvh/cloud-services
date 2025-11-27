# Kubernetes Testing - Quick Reference

## 📋 Quick Overview

This is a comprehensive testing plan for the Kubernetes cluster management feature in the cloud services platform.

## 🎯 What Gets Tested

### Pages
- **User Pages**: List, Create, Detail views (`/dashboard/services/kubernetes/*`)
- **Admin Pages**: Admin list, Assign cluster (`/dashboard/admin/kubernetes/*`)

### APIs (16 endpoints)
- **Cluster Management**: Create, Read, Delete, Status, Download Kubeconfig, Update Project, Delete Node, Monitoring
- **IP Management**: Add, Update, Delete, Create Droplet, Read Droplet, Droplet Status
- **Admin**: Admin Delete

### Database
- `Clusters` queries: get_by_user_id, get_by_project_id, get_by_id, get_all_for_admin
- `Projects` queries: get_all_by_user, add_log
- `Products` queries: get_by_type

### Components
- KubernetesPage (List), NewClusterForm, SingleCluster, AdminKubernetes

## 🚀 Getting Started

### 1. Install Dependencies (if not already installed)
```bash
npm install -D vitest @vitejs/plugin-react @vitest/ui
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install -D jsdom
```

### 2. Run Tests
```bash
# All Kubernetes tests
npm test -- kubernetes

# Specific test
npm test kubernetes-create.test.ts

# With coverage
npm run test:coverage -- kubernetes

# Watch mode
npm test -- --watch kubernetes
```

## 📁 Test Files to Create

### Phase 1 (Critical - Week 1)
```
tests/
├── unit/
│   ├── validation/
│   │   └── kubernetes.test.ts ⭐ START HERE
│   └── supabase/
│       └── clusters.test.ts
└── integration/
    └── api/
        ├── kubernetes-create.test.ts ⭐
        ├── kubernetes-read.test.ts ⭐
        └── kubernetes-delete.test.ts ⭐
```

### Phase 2 (Important - Week 2)
```
tests/
├── integration/
│   └── api/
│       ├── kubernetes-downloadkube.test.ts
│       ├── kubernetes-status.test.ts
│       ├── kubernetes-update-project.test.ts
│       └── kubernetes-delete-node.test.ts
└── components/
    ├── kubernetes-list.test.tsx
    └── kubernetes-create-form.test.tsx
```

### Phase 3 (Additional - Week 3)
```
tests/
├── integration/
│   └── api/
│       ├── kubernetes-monitoring.test.ts
│       ├── kubernetes-manageip-*.test.ts (5 files)
│       └── admin-kubernetes-delete.test.ts
└── components/
    ├── kubernetes-single-cluster.test.tsx
    └── admin-kubernetes.test.tsx
```

## 🧪 Test Patterns

### Pattern 1: Validation Test
```typescript
import { describe, it, expect } from 'vitest';
import { kubernetesClusterSchema } from '@/lib/validation/kubernetes';

describe('kubernetesClusterSchema', () => {
  it('should accept valid cluster configuration', () => {
    const result = kubernetesClusterSchema.safeParse({
      name: 'test-cluster-01',
      nodes: 3,
    });
    expect(result.success).toBe(true);
  });
});
```

### Pattern 2: API Route Test
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/kubernetes/clusters/route';
import { createMockPostRequest, mockAuthenticatedUser } from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');

describe('POST /api/services/kubernetes/clusters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
  });

  it('should create cluster with valid data', async () => {
    const request = createMockPostRequest(
      'http://localhost:3000/api/services/kubernetes/clusters',
      mockCreateKubernetesPayload
    );

    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
```

### Pattern 3: Component Test
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import KubernetesPage from '@/app/dashboard/services/kubernetes/page';

describe('KubernetesPage', () => {
  it('should display cluster list', async () => {
    render(<KubernetesPage />);
    
    await waitFor(() => {
      expect(screen.getByText('test-cluster-01')).toBeInTheDocument();
    });
  });
});
```

## 📊 Coverage Goals

| Category | Target | Status |
|----------|--------|--------|
| Validation | 100% | 🔴 Not Started |
| APIs | 90%+ | 🔴 Not Started |
| Queries | 85%+ | 🔴 Not Started |
| Components | 70%+ | 🔴 Not Started |

## 🎯 Key Functionality to Test

### Create Cluster
- ✅ Valid payload creates cluster
- ✅ Encrypts passwords
- ✅ Generates unique cluster_id
- ✅ Queues provisioning job
- ✅ Adds activity log
- ❌ Validates cluster name format
- ❌ Validates node configuration
- ❌ Enforces rate limiting

### Read Clusters
- ✅ Lists user's clusters
- ✅ Returns specific cluster by ID
- ✅ Enforces ownership
- ✅ Allows admin to view all
- ❌ Excludes kubeconfig from list

### Delete Cluster
- ✅ Deletes cluster from database
- ✅ Deletes DigitalOcean droplets
- ✅ Adds activity log
- ❌ Handles droplet deletion failures

### Download Kubeconfig
- ✅ Returns YAML format
- ✅ Converts Buffer to string
- ✅ Enforces ownership
- ❌ Rate limits downloads

## 📚 Related Documents

- **Full Test Plan**: `KUBERNETES_TEST_PLAN.md` (detailed specifications)
- **Database Tests**: `tests/integration/api/database-*.test.ts` (reference patterns)
- **Test Utils**: `tests/utils/mock-data.ts`, `tests/utils/test-helpers.ts`

## 🔍 Key API Endpoints Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/services/kubernetes/clusters` | POST | ✅ | Create cluster |
| `/api/services/kubernetes/clusters/read` | POST | ✅ | List/Get clusters |
| `/api/services/kubernetes/clusters/delete` | POST | ✅ | Delete cluster |
| `/api/services/kubernetes/clusters/status` | POST | ❌ | Get status |
| `/api/services/kubernetes/clusters/downloadkube` | POST | ✅ | Download config |
| `/api/services/kubernetes/clusters/update_project` | POST | ✅ | Update project |
| `/api/services/kubernetes/clusters/delete_node` | POST | ✅ | Remove worker |
| `/api/services/kubernetes/clusters/monitering` | POST | ✅ | Get metrics |
| `/api/admin/kubernetes/clusters/delete` | POST | ✅ Admin | Admin delete |

## ✨ Next Steps

1. **Create mock data file**: `tests/utils/mock-data-kubernetes.ts`
2. **Start with validation**: `tests/unit/validation/kubernetes.test.ts`
3. **Test create API**: `tests/integration/api/kubernetes-create.test.ts`
4. **Follow the pattern**: Use database tests as reference
5. **Run frequently**: `npm test -- --watch kubernetes`

---

**Need help?** Refer to:
- `KUBERNETES_TEST_PLAN.md` for detailed specifications
- `tests/README.md` for testing setup guide
- Existing database tests for working examples
