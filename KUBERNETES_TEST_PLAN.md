# Kubernetes Cluster Testing Plan

## 📋 Overview

This document outlines the comprehensive testing strategy for the Kubernetes cluster management feature, covering user-facing pages, admin panel, API routes, Supabase queries, and UI components.

## 🎯 Scope

### User Pages
- `/dashboard/services/kubernetes` - List all user's Kubernetes clusters
- `/dashboard/services/kubernetes/new` - Create new Kubernetes cluster
- `/dashboard/services/kubernetes/clusters/[clusterId]` - Single cluster management page

### Admin Pages
- `/dashboard/admin/kubernetes` - View all Kubernetes clusters (admin)
- `/dashboard/admin/kubernetes/assign` - Assign cluster to user (admin)

### API Routes (16 endpoints)
1. **Cluster Management**
   - `POST /api/services/kubernetes/clusters` - Create cluster
   - `POST /api/services/kubernetes/clusters/read` - List user's clusters
   - `POST /api/services/kubernetes/clusters/delete` - Delete cluster
   - `POST /api/services/kubernetes/clusters/status` - Get cluster status
   - `POST /api/services/kubernetes/clusters/downloadkube` - Download kubeconfig
   - `POST /api/services/kubernetes/clusters/update_project` - Update cluster project
   - `POST /api/services/kubernetes/clusters/delete_node` - Remove worker node
   - `POST /api/services/kubernetes/clusters/ready_by_id` - Get cluster readiness
   - `POST /api/services/kubernetes/clusters/monitering` - Get cluster metrics

2. **IP Management**
   - `POST /api/services/kubernetes/manageip/add` - Add IP to cluster
   - `POST /api/services/kubernetes/manageip/update` - Update IP
   - `POST /api/services/kubernetes/manageip/delete` - Delete IP
   - `POST /api/services/kubernetes/manageip/createdroplet` - Create droplet
   - `POST /api/services/kubernetes/manageip/readdroplet` - Read droplet info
   - `POST /api/services/kubernetes/manageip/dropletstatus` - Get droplet status

3. **Admin APIs**
   - `POST /api/admin/kubernetes/clusters/delete` - Admin delete cluster

### Supabase Queries
- `Clusters.get_by_project_id(projectId)`
- `Clusters.get_by_user_id(userId)`
- `Clusters.get_by_id(cluster_id)`
- `Clusters.get_all_for_admin()`
- `Projects.get_all_by_user(userId)`
- `Projects.get_all_for_admin()`
- `Projects.add_log(props, role)`
- `Products.get_by_type("kubernetes")`
- `Users.get_all_profiles()`

### Components
- `KubernetesPage` - List view component
- `NewClusterForm` - Cluster creation form
- `SingleCluster` - Individual cluster management
- `AdminKubernetes` - Admin cluster list

## 🧪 Test Categories

### 1. Unit Tests (Validation & Utilities)

#### 1.1 Validation Schemas (`tests/unit/validation/kubernetes.test.ts`)
```typescript
describe('Kubernetes Validation Schemas', () => {
  describe('kubernetesClusterSchema', () => {
    // Valid Cases
    ✓ should accept valid cluster name with 3+ characters
    ✓ should accept cluster name with letters and numbers
    ✓ should accept cluster name with hyphens
    ✓ should accept 1 node cluster
    ✓ should accept 10 node cluster
    
    // Invalid Cases - Name Validation
    ✗ should reject name shorter than 3 characters
    ✗ should reject name with less than 2 letters
    ✗ should reject name with only numbers
    ✗ should reject name with special characters except hyphen
    ✗ should reject name with spaces
    ✗ should reject name with underscores
    ✗ should reject name starting with hyphen
    ✗ should reject name ending with hyphen
    
    // Invalid Cases - Node Validation
    ✗ should reject 0 nodes
    ✗ should reject negative nodes
    ✗ should reject decimal nodes
    ✗ should reject non-numeric nodes
  });
});
```

#### 1.2 Supabase Query Tests (`tests/unit/supabase/clusters.test.ts`)
```typescript
describe('Clusters Supabase Queries', () => {
  describe('get_by_project_id', () => {
    ✓ should return clusters for valid project ID
    ✓ should return empty array for project with no clusters
    ✓ should handle invalid project ID
    ✓ should handle non-UUID project ID
    ✓ should return clusters in descending order by created_at
  });

  describe('get_by_user_id', () => {
    ✓ should return clusters for valid user ID
    ✓ should return empty array for user with no clusters
    ✓ should handle invalid user ID
    ✓ should handle non-UUID user ID
  });

  describe('get_by_id', () => {
    ✓ should return cluster for valid cluster_id
    ✓ should return null for non-existent cluster
    ✓ should include all cluster fields
  });

  describe('get_all_for_admin', () => {
    ✓ should return all clusters with user data
    ✓ should include owner email from auth users
    ✓ should include owner username from profiles
    ✓ should handle missing user profiles gracefully
    ✓ should return clusters in descending order
  });
});
```

### 2. Integration Tests (API Routes)

#### 2.1 Cluster CRUD Operations

**`tests/integration/api/kubernetes-create.test.ts`**
```typescript
describe('POST /api/services/kubernetes/clusters', () => {
  // Authentication Tests
  ✓ should require authentication
  ✗ should reject unauthenticated requests
  
  // Success Cases
  ✓ should create cluster with valid payload
  ✓ should encrypt password before storing
  ✓ should generate unique cluster_id
  ✓ should queue cluster provisioning job
  ✓ should add activity log to project
  ✓ should derive role correctly (user vs admin)
  ✓ should accept admin-assigned cluster
  
  // Validation Tests
  ✗ should reject invalid cluster name
  ✗ should reject missing required fields
  ✗ should reject invalid node configuration
  ✗ should reject invalid IP addresses
  ✗ should reject empty nodes array
  ✗ should reject invalid auth method
  
  // Rate Limiting
  ✗ should enforce rate limiting (10 requests/minute)
});
```

**`tests/integration/api/kubernetes-read.test.ts`**
```typescript
describe('POST /api/services/kubernetes/clusters/read', () => {
  // Authentication
  ✓ should require authentication
  ✗ should reject unauthenticated requests
  
  // List All Clusters
  ✓ should return all user clusters
  ✓ should not include kubeconfig in list response
  ✓ should return empty array if no clusters
  ✓ should only return authenticated user's clusters
  ✓ should return clusters with basic info (id, name, status, workers, etc.)
  
  // Get Single Cluster
  ✓ should return specific cluster by cluster_id
  ✓ should not include kubeconfig in response
  ✓ should enforce ownership (non-admin)
  ✓ should allow admin to view any cluster
  ✗ should return 404 for non-existent cluster
  ✗ should return 404 if user doesn't own cluster
});
```

**`tests/integration/api/kubernetes-delete.test.ts`**
```typescript
describe('POST /api/services/kubernetes/clusters/delete', () => {
  // Authentication
  ✓ should require authentication
  ✗ should reject unauthenticated requests
  
  // Success Cases
  ✓ should delete cluster with valid cluster_id
  ✓ should delete control plane droplet from DigitalOcean
  ✓ should delete worker droplets from DigitalOcean
  ✓ should add activity log on deletion
  ✓ should handle partial droplet deletion failures
  
  // Error Cases
  ✗ should return error for non-existent cluster
  ✗ should handle DigitalOcean API errors gracefully
  ✗ should still delete from database if droplet deletion fails
  ✗ should include warnings in response for failed droplet deletions
  
  // Authorization
  ✓ should allow user to delete own cluster
  ✗ should prevent user from deleting other's cluster
  ✓ should allow admin to delete any cluster
});
```

**`tests/integration/api/kubernetes-status.test.ts`**
```typescript
describe('POST /api/services/kubernetes/clusters/status', () => {
  // Success Cases
  ✓ should return cluster status for valid cluster_id
  ✓ should return create_status flag
  ✓ should return connect_status flag
  ✓ should return verify_status flag
  ✓ should return overall status (pending/creating/ready/failed)
  ✓ should return kubeconfig if available
  ✓ should return node_config
  ✓ should return control_plane info
  ✓ should return workers array
  
  // Error Cases
  ✗ should return 404 for non-existent cluster
  ✗ should return 400 for invalid cluster_id
});
```

**`tests/integration/api/kubernetes-downloadkube.test.ts`**
```typescript
describe('POST /api/services/kubernetes/clusters/downloadkube', () => {
  // Authentication
  ✓ should require authentication
  ✗ should reject unauthenticated requests
  
  // Success Cases
  ✓ should return kubeconfig for valid cluster_id
  ✓ should convert Buffer to YAML string
  ✓ should handle string kubeconfig format
  ✓ should enforce ownership (non-admin)
  ✓ should allow admin to download any kubeconfig
  
  // Error Cases
  ✗ should return 404 if cluster not found
  ✗ should return 404 if kubeconfig not available
  ✗ should reject if user doesn't own cluster
  ✗ should return 400 if cluster_id missing
  
  // Rate Limiting
  ✗ should enforce rate limiting (15 requests/minute)
  
  // Backward Compatibility
  ✓ should support legacy kubeconfig body parameter
});
```

**`tests/integration/api/kubernetes-update-project.test.ts`**
```typescript
describe('POST /api/services/kubernetes/clusters/update_project', () => {
  // Authentication
  ✓ should require authentication
  
  // Success Cases
  ✓ should update cluster project_id
  ✓ should add activity log to old project
  ✓ should add activity log to new project
  
  // Validation
  ✗ should reject missing cluster_id
  ✗ should reject missing project_id
  ✗ should return error for non-existent cluster
  ✗ should return error for invalid project_id
});
```

**`tests/integration/api/kubernetes-delete-node.test.ts`**
```typescript
describe('POST /api/services/kubernetes/clusters/delete_node', () => {
  // Authentication
  ✓ should require authentication
  
  // Success Cases
  ✓ should remove worker node from workers array
  ✓ should add activity log for node deletion
  ✓ should handle empty workers array
  
  // Error Cases
  ✗ should return error if cluster not found
  ✗ should return error if droplet_id not found in workers
  ✗ should reject missing cluster_id
  ✗ should reject missing droplet_id
});
```

**`tests/integration/api/kubernetes-ready-by-id.test.ts`**
```typescript
describe('POST /api/services/kubernetes/clusters/ready_by_id', () => {
  // Success Cases
  ✓ should return all cluster details
  ✓ should return create_status, connect_status, verify_status
  ✓ should return status field
  
  // Error Cases
  ✗ should return 404 for non-existent cluster
  ✗ should return 400 for missing cluster_id
});
```

**`tests/integration/api/kubernetes-monitoring.test.ts`**
```typescript
describe('POST /api/services/kubernetes/clusters/monitering', () => {
  // Authentication
  ✓ should require authentication
  
  // Success Cases
  ✓ should fetch CPU metrics from DigitalOcean
  ✓ should fetch memory metrics
  ✓ should fetch disk metrics
  ✓ should use correct time range (default 1 hour)
  ✓ should accept custom time range (hrs parameter)
  ✓ should return DigitalOcean monitoring data
  
  // Error Cases
  ✗ should handle DigitalOcean API errors
  ✗ should reject missing droplet_id
  ✗ should reject missing type parameter
  ✗ should return 400 for invalid time range
});
```

#### 2.2 IP Management APIs

**`tests/integration/api/kubernetes-manageip-add.test.ts`**
**`tests/integration/api/kubernetes-manageip-update.test.ts`**
**`tests/integration/api/kubernetes-manageip-delete.test.ts`**
**`tests/integration/api/kubernetes-manageip-createdroplet.test.ts`**
**`tests/integration/api/kubernetes-manageip-readdroplet.test.ts`**
**`tests/integration/api/kubernetes-manageip-dropletstatus.test.ts`**

_(Tests for IP management endpoints - to be implemented based on actual API code)_

#### 2.3 Admin APIs

**`tests/integration/api/admin-kubernetes-delete.test.ts`**
```typescript
describe('POST /api/admin/kubernetes/clusters/delete', () => {
  // Authorization
  ✓ should require admin authentication
  ✗ should reject non-admin users (403)
  ✗ should reject unauthenticated requests
  
  // Success Cases
  ✓ should delete any cluster as admin
  ✓ should delete control plane droplet
  ✓ should delete all worker droplets
  ✓ should handle partial droplet deletion failures
  
  // Error Cases
  ✗ should return 404 for non-existent cluster
  ✗ should return 400 for missing cluster_id
  ✗ should include deletion warnings in response
});
```

### 3. Component Tests

**`tests/components/kubernetes-list.test.tsx`**
```typescript
describe('KubernetesPage (List View)', () => {
  // Loading States
  ✓ should show loading spinner initially
  ✓ should hide loading spinner after data loads
  
  // Empty State
  ✓ should show empty state when no clusters
  ✓ should show "Create Cluster" button in empty state
  ✓ should navigate to new cluster page on button click
  
  // Cluster List
  ✓ should display cluster name
  ✓ should display cluster ID
  ✓ should display number of worker nodes
  ✓ should display created date
  ✓ should display K8s version
  ✓ should display status badge (ready/pending/error)
  ✓ should render "Download kubeconfig" button
  ✓ should render "View Cluster" link
  
  // User Interactions
  ✓ should download kubeconfig on button click
  ✓ should create YAML blob for download
  ✓ should navigate to cluster detail on "View Cluster" click
  ✓ should navigate to new cluster page on "New Kubernetes" click
  
  // Error Handling
  ✗ should show error message on fetch failure
  ✗ should show error toast on download failure
});
```

**`tests/components/kubernetes-create-form.test.tsx`**
```typescript
describe('NewClusterForm', () => {
  // Form Rendering
  ✓ should render all form fields
  ✓ should show user selector for admin role
  ✓ should hide user selector for non-admin
  ✓ should render location dropdown
  ✓ should render project dropdown
  ✓ should render node configuration section
  ✓ should render terms and conditions checkbox
  
  // Form Validation
  ✗ should show error for invalid cluster name
  ✗ should show error for empty cluster name
  ✗ should show error for insufficient nodes
  ✗ should disable submit until terms accepted
  ✗ should validate name format (alphanumeric + hyphen)
  
  // Multi-Step Flow
  ✓ should show user selection step for admin (step 0)
  ✓ should start at step 1 for regular users
  ✓ should navigate between steps
  ✓ should show summary on final step
  
  // Form Submission
  ✓ should submit valid cluster data
  ✓ should encrypt password before submission
  ✓ should redirect to cluster list on success
  ✓ should show loading state during submission
  ✗ should show error toast on submission failure
  
  // Dynamic Features
  ✓ should update pricing on plan change
  ✓ should calculate total cost (nodes × plan price)
  ✓ should filter available products by type
  ✓ should handle droplet creation flow
});
```

**`tests/components/kubernetes-single-cluster.test.tsx`**
```typescript
describe('SingleCluster (Detail View)', () => {
  // Loading States
  ✓ should show loading spinner initially
  ✓ should poll cluster status periodically
  ✓ should stop polling when cluster is ready
  
  // Cluster Info Display
  ✓ should display cluster status badges
  ✓ should display control plane info
  ✓ should display worker nodes list
  ✓ should display node configuration (CPU, RAM, Storage)
  ✓ should display creation progress (create/connect/verify)
  
  // Tabs
  ✓ should render Overview tab
  ✓ should render Settings tab
  ✓ should render Monitoring tab
  ✓ should switch between tabs
  
  // Monitoring Tab
  ✓ should fetch CPU metrics
  ✓ should fetch Memory metrics
  ✓ should fetch Disk metrics
  ✓ should display charts with data
  ✓ should allow time range selection
  ✓ should refresh metrics on time range change
  
  // Settings Tab
  ✓ should show project dropdown
  ✓ should update cluster project
  ✓ should show delete cluster button
  ✓ should show confirmation dialog on delete
  ✓ should delete cluster on confirmation
  
  // Worker Node Management
  ✓ should list all worker nodes
  ✓ should show delete button per worker
  ✓ should confirm before deleting worker
  ✓ should delete worker node
  ✓ should update UI after worker deletion
  
  // Error Handling
  ✗ should show error for failed status fetch
  ✗ should show error for failed monitoring data
  ✗ should show error toast on project update failure
});
```

**`tests/components/admin-kubernetes.test.tsx`**
```typescript
describe('AdminKubernetes', () => {
  // Rendering
  ✓ should display all clusters for admin
  ✓ should display owner username
  ✓ should display owner email
  ✓ should display cluster details
  ✓ should show "Assign Cluster" button
  
  // Filtering
  ✓ should filter by owner username
  ✓ should filter by cluster status
  ✓ should filter by k8s version
  
  // Actions
  ✓ should navigate to assign page
  ✓ should delete cluster as admin
  ✓ should show confirmation dialog before delete
  
  // Pagination
  ✓ should paginate results if many clusters
  ✓ should show total count
});
```

### 4. E2E Tests (Optional but Recommended)

**`tests/e2e/kubernetes-flow.spec.ts`** (Using Playwright)
```typescript
describe('Kubernetes Full Flow', () => {
  test('Create and manage cluster end-to-end', async ({ page }) => {
    // 1. Login
    await page.goto('/signin');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    
    // 2. Navigate to Kubernetes
    await page.goto('/dashboard/services/kubernetes');
    await expect(page.locator('h1')).toContainText('Kubernetes');
    
    // 3. Create new cluster
    await page.click('text=New Kubernetes');
    await page.fill('[name="name"]', 'test-cluster-001');
    await page.selectOption('[name="location"]', 'nyc1');
    await page.selectOption('[name="project"]', { index: 0 });
    await page.click('[name="terms"]');
    await page.click('button:has-text("Create Cluster")');
    
    // 4. Wait for creation
    await expect(page.locator('text=Cluster created')).toBeVisible();
    
    // 5. View cluster
    await page.click('text=View Cluster');
    await expect(page.locator('text=test-cluster-001')).toBeVisible();
    
    // 6. Download kubeconfig
    const downloadPromise = page.waitForEvent('download');
    await page.click('text=Download kubeconfig');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.yaml');
    
    // 7. Delete cluster
    await page.click('text=Delete Cluster');
    await page.click('text=Confirm');
    await expect(page.locator('text=Cluster deleted')).toBeVisible();
  });
});
```

## 📊 Coverage Goals

| Category | Target Coverage | Critical |
|----------|----------------|----------|
| Validation Schemas | 100% | ✅ Yes |
| API Routes | 90%+ | ✅ Yes |
| Supabase Queries | 85%+ | ✅ Yes |
| Components | 70%+ | ⚠️ Medium |
| E2E Flows | 50%+ | ℹ️ Nice to have |

## 🛠️ Mock Data Required

Create `tests/utils/mock-data-kubernetes.ts`:

```typescript
import { Tables } from '@/lib/supabase/types';

export const mockKubernetesUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  name: 'Test User',
};

export const mockKubernetesProject = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test K8s Project',
  owner: mockKubernetesUser.id,
  created_at: '2024-01-01T00:00:00Z',
} as Tables<'projects'>;

export const mockKubernetesCluster = {
  id: 'cluster-uuid-001',
  cluster_id: 'k8s-cluster-001',
  cluster_name: 'test-k8s-cluster',
  status: 'ready',
  workers: [
    { id: 'worker-1', droplet_id: 123, public_ip: '1.2.3.4', private_ip: '10.0.0.1' },
    { id: 'worker-2', droplet_id: 124, public_ip: '1.2.3.5', private_ip: '10.0.0.2' },
  ],
  control_plane: {
    droplet_id: 122,
    public_ip: '1.2.3.3',
    private_ip: '10.0.0.0',
  },
  created_at: '2024-01-01T00:00:00Z',
  k8s_version: '1.31.0',
  kubeconfig: Buffer.from('mock-kubeconfig-yaml').toString(),
  owner_id: mockKubernetesUser.id,
  project_id: mockKubernetesProject.id,
  node_config: { cpu: 2, ram: 4096, storage: 50 },
  create_status: true,
  connect_status: true,
  verify_status: true,
  cni_plugin: 'calico',
};

export const mockCreateKubernetesPayload = {
  provider: 'existing',
  cluster: {
    name: 'test-cluster-new',
    location: 'nyc1',
    pod_cidr: '10.244.0.0/16',
    k8s_minor: '1.31.0',
  },
  auth: {
    method: 'password',
    user: 'ubuntu',
    password: {
      encrypted: 'encrypted-password-hex',
      iv: 'test-iv-hex',
      tag: 'test-tag-hex',
      salt: 'test-salt-hex',
    },
  },
  nodes: [
    {
      host: '1.2.3.4',
      role: 'control-plane',
      hostname: 'cp-01',
      cpu: 2,
      memory_mb: 4096,
      storage: 50,
      private_ip: '10.0.0.1',
      droplet_id: 123,
    },
    {
      host: '1.2.3.5',
      role: 'worker',
      hostname: 'worker-01',
      cpu: 2,
      memory_mb: 4096,
      storage: 50,
      private_ip: '10.0.0.2',
      droplet_id: 124,
    },
  ],
  ips: ['1.2.3.4', '1.2.3.5'],
  ownerId: mockKubernetesUser.id,
  projectId: mockKubernetesProject.id,
};

export const mockInvalidKubernetesPayloads = {
  invalidName: {
    ...mockCreateKubernetesPayload,
    cluster: { ...mockCreateKubernetesPayload.cluster, name: 'ab' }, // Too short
  },
  invalidNameFormat: {
    ...mockCreateKubernetesPayload,
    cluster: { ...mockCreateKubernetesPayload.cluster, name: 'test_cluster' }, // Underscore not allowed
  },
  emptyNodes: {
    ...mockCreateKubernetesPayload,
    nodes: [],
  },
  invalidIP: {
    ...mockCreateKubernetesPayload,
    nodes: [
      { ...mockCreateKubernetesPayload.nodes[0], private_ip: 'invalid-ip' },
    ],
  },
};

export const mockKubernetesProducts = [
  {
    id: 'k8s-s-2vcpu-4gb',
    name: 'Small',
    type: 'kubernetes',
    specs: { cpu: 2, ram: 4096, storage: 50 },
    price: 24,
  },
  {
    id: 'k8s-m-4vcpu-8gb',
    name: 'Medium',
    type: 'kubernetes',
    specs: { cpu: 4, ram: 8192, storage: 100 },
    price: 48,
  },
] as Tables<'products'>[];

export const mockDigitalOceanDroplet = {
  droplet: {
    id: 123,
    name: 'k8s-node-01',
    status: 'active',
    networks: {
      v4: [
        { ip_address: '1.2.3.4', type: 'public' },
        { ip_address: '10.0.0.1', type: 'private' },
      ],
    },
  },
};

export const mockDigitalOceanMetrics = {
  status: 'success',
  data: {
    resultType: 'matrix',
    result: [
      {
        metric: { host_id: '123', mode: 'user' },
        values: [
          [1704067200, '25.5'],
          [1704067260, '30.2'],
        ],
      },
    ],
  },
};
```

## 🚀 Implementation Priority

### Phase 1: Critical (Week 1)
1. ✅ Validation schema tests
2. ✅ Kubernetes create API test
3. ✅ Kubernetes read API test
4. ✅ Kubernetes delete API test
5. ✅ Supabase Clusters queries tests

### Phase 2: Important (Week 2)
6. ✅ Download kubeconfig API test
7. ✅ Cluster status API test
8. ✅ Update project API test
9. ✅ Delete node API test
10. ✅ Component tests (list, create form)

### Phase 3: Additional (Week 3)
11. ✅ Monitoring API test
12. ✅ IP management API tests
13. ✅ Admin delete API test
14. ✅ Single cluster component test
15. ✅ Admin components test

### Phase 4: Optional (Week 4)
16. E2E tests with Playwright
17. Performance tests
18. Load tests

## 📝 Test File Structure

```
tests/
├── unit/
│   ├── validation/
│   │   └── kubernetes.test.ts
│   └── supabase/
│       └── clusters.test.ts
├── integration/
│   └── api/
│       ├── kubernetes-create.test.ts
│       ├── kubernetes-read.test.ts
│       ├── kubernetes-delete.test.ts
│       ├── kubernetes-status.test.ts
│       ├── kubernetes-downloadkube.test.ts
│       ├── kubernetes-update-project.test.ts
│       ├── kubernetes-delete-node.test.ts
│       ├── kubernetes-ready-by-id.test.ts
│       ├── kubernetes-monitoring.test.ts
│       ├── kubernetes-manageip-*.test.ts (5 files)
│       └── admin-kubernetes-delete.test.ts
├── components/
│   ├── kubernetes-list.test.tsx
│   ├── kubernetes-create-form.test.tsx
│   ├── kubernetes-single-cluster.test.tsx
│   └── admin-kubernetes.test.tsx
├── e2e/
│   └── kubernetes-flow.spec.ts
└── utils/
    ├── mock-data-kubernetes.ts
    └── test-helpers-kubernetes.ts
```

## ✅ Success Criteria

- [ ] All validation tests passing (100% coverage)
- [ ] All API route tests passing (90%+ coverage)
- [ ] All Supabase query tests passing (85%+ coverage)
- [ ] All component tests passing (70%+ coverage)
- [ ] E2E happy path test passing
- [ ] CI/CD integration complete
- [ ] Test documentation complete

## 🔧 Running Tests

```bash
# Run all Kubernetes tests
npm test -- kubernetes

# Run specific test file
npm test kubernetes-create.test.ts

# Run with coverage
npm run test:coverage -- kubernetes

# Run in watch mode
npm test -- --watch kubernetes

# Run E2E tests
npx playwright test kubernetes-flow.spec.ts
```

---

**Ready to start testing!** 🚀 Follow the implementation priority and refer to existing database tests for patterns.
