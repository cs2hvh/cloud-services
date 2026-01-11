# App Deployment Service - Comprehensive Test Plan

## 📋 Overview

This document outlines the comprehensive testing strategy for the **Platform Apps (App Deployment)** service. The plan covers unit tests, integration tests, and component/UI tests following the same conventions established for database, kubernetes, and object-storage services.

---

## 🗂️ Module Structure Analysis

### API Routes (`app/api/services/platform-apps/`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/create` | POST | Deploy new application from Git repository |
| `/delete` | POST | Delete application and cleanup infrastructure |
| `/list` | GET | List all user's deployed applications |
| `/get` | POST | Get single app details with status sync |
| `/redeploy` | POST | Trigger redeployment of existing app |
| `/resize` | POST | Resize app instance (upsize only) |
| `/deployments` | GET | List deployment history |
| `/env-vars/update` | POST | Update environment variables |
| `/domains/*` | Various | Custom domain management (add, verify, activate, remove, set-primary) |
| `/details` | GET | Get detailed K8s info |
| `/health` | GET | App health status |
| `/logs` | GET | Runtime logs |
| `/metrics` | GET | App metrics (CPU, memory) |
| `/pods` | GET | Pod status information |
| `/rollback` | POST | Rollback to previous deployment |
| `/update` | POST | Update app configuration |
| `/events` | GET | App events |
| `/integrations` | Various | Database integrations |

### Service Layer (`lib/services/`)
| Service | File | Description |
|---------|------|-------------|
| DeploymentService | `deployment.ts` | Orchestrates app deployment lifecycle |
| AppStatusService | `app-status.ts` | Manages app status synchronization |
| BuildPollingService | `build-polling.ts` | Monitors Jenkins build status |
| JenkinsService | `jenkins.ts` | Jenkins job management |
| DNSService | `dns.ts` | Cloudflare DNS record management |
| KubernetesCustomDomainService | `kubernetes-custom-domain.ts` | K8s Ingress management |
| InfrastructureCleanupService | `infrastructure-cleanup.ts` | Resource cleanup |
| AutoDeployService | `auto-deploy.ts` | Webhook-triggered deployments |
| RuntimeLogsService | `runtime-logs.ts` | Log streaming |

### UI Components (`components/dashboard/apps/`)
| Component | File | Description |
|-----------|------|-------------|
| AppDeploymentSelect | `new.tsx` | Multi-step deployment wizard |
| AppsList | `apps-list.tsx` | Deployed apps grid/list |
| AppCard | `app-card.tsx` | Individual app card with metrics |
| DeleteAppModal | `delete-app-modal.tsx` | Delete confirmation dialog |
| CustomDomainsManager | `custom-domains.tsx` | Custom domain management UI |
| EnvVarsEditor | `env-vars-editor.tsx` | Environment variables editor |
| RuntimeLogs | `runtime-logs.tsx` | Real-time log viewer |
| AppIssues | `app-issues.tsx` | Build failure diagnostics |
| StatsCards | `stats-cards.tsx` | Dashboard statistics |

### Supabase Queries (`lib/supabase/queries/platform_apps.ts`)
- `count_by_owner` - Count apps for limit checks
- `check_name_exists` - Validate unique app names
- `create` - Insert new app record
- `update` - Update app fields
- `get` - Get single app
- `list_by_owner` - List user's apps
- `delete` - Remove app record
- `set_env_vars` / `get_env_vars` - Environment variable management
- `update_status` - Status transitions

### Validation Schemas (`lib/validation/platform-apps.ts`)
- `createPlatformAppSchema` - New app validation
- `updatePlatformAppSchema` - Update validation
- `deletePlatformAppSchema` - Delete validation
- `getPlatformAppSchema` - Get validation
- `resizePlatformAppSchema` - Resize validation

---

## 🧪 Test Plan Structure

### File Organization (Following Existing Conventions)
```
tests/
├── unit/
│   ├── services/
│   │   ├── deployment.test.ts
│   │   ├── app-status.test.ts
│   │   └── build-polling.test.ts
│   ├── supabase/
│   │   └── platform-apps.test.ts
│   └── validation/
│       └── platform-apps.test.ts
├── integration/
│   └── api/
│       ├── platform-apps-create.test.ts
│       ├── platform-apps-delete.test.ts
│       ├── platform-apps-list.test.ts
│       ├── platform-apps-get.test.ts
│       ├── platform-apps-redeploy.test.ts
│       ├── platform-apps-resize.test.ts
│       ├── platform-apps-env-vars.test.ts
│       ├── platform-apps-domains.test.ts
│       └── platform-apps-rollback.test.ts
├── components/
│   ├── apps-list.test.tsx
│   ├── app-card.test.tsx
│   ├── app-create-form.test.tsx
│   ├── custom-domains.test.tsx
│   ├── env-vars-editor.test.tsx
│   ├── delete-app-modal.test.tsx
│   └── runtime-logs.test.tsx
└── utils/
    └── mock-data-platform-apps.ts
```

---

## 📝 Test Cases

### 1. Unit Tests

#### 1.1 Validation Schema Tests (`tests/unit/validation/platform-apps.test.ts`)

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| TC-PA-U001 | Valid app name (lowercase, hyphens) | Schema passes |
| TC-PA-U002 | Invalid app name (uppercase) | Schema fails with error |
| TC-PA-U003 | App name too short (<3 chars) | Schema fails |
| TC-PA-U004 | App name too long (>63 chars) | Schema fails |
| TC-PA-U005 | Valid git provider (github/gitlab/bitbucket) | Schema passes |
| TC-PA-U006 | Invalid git provider | Schema fails |
| TC-PA-U007 | Valid framework selection | Schema passes |
| TC-PA-U008 | Invalid framework | Schema fails |
| TC-PA-U009 | Valid size (small/medium/large) | Schema passes |
| TC-PA-U010 | Invalid size | Schema fails |
| TC-PA-U011 | Valid repository URL | Schema passes |
| TC-PA-U012 | Invalid repository URL | Schema fails |
| TC-PA-U013 | Valid env_vars array | Schema passes |
| TC-PA-U014 | Empty env_var key | Schema fails |
| TC-PA-U015 | Valid UUID for app_id | Schema passes |
| TC-PA-U016 | Invalid UUID format | Schema fails |

#### 1.2 Deployment Service Tests (`tests/unit/services/deployment.test.ts`)

| Test ID | Scenario | Expected Result | Mock Dependencies |
|---------|----------|-----------------|-------------------|
| TC-PA-U020 | Get correct container port for Next.js | Returns 3000 | None |
| TC-PA-U021 | Get correct container port for Python | Returns 8000 | None |
| TC-PA-U022 | Generate unique slug | Slug format: `name-[random6]` | None |
| TC-PA-U023 | Deploy creates DB record | Record created | Platform_Apps.create |
| TC-PA-U024 | Deploy creates DNS record | DNSService.createRecord called | DNSService |
| TC-PA-U025 | Deploy triggers Jenkins job | JenkinsService.createJob called | JenkinsService |
| TC-PA-U026 | Deploy rollback on DNS failure | DB record deleted | All services |
| TC-PA-U027 | Deploy rollback on Jenkins failure | DB & DNS cleaned up | All services |
| TC-PA-U028 | Delete verifies ownership | Unauthorized error | Platform_Apps.get |
| TC-PA-U029 | Delete cleans up infrastructure | All cleanup methods called | All services |
| TC-PA-U030 | Admin can delete any app | Deletion succeeds | Platform_Apps.get |

#### 1.3 App Status Service Tests (`tests/unit/services/app-status.test.ts`)

| Test ID | Scenario | Expected Result | Mock Dependencies |
|---------|----------|-----------------|-------------------|
| TC-PA-U040 | Sync status from K8s - running | Status updated to running | K8s API |
| TC-PA-U041 | Sync status from K8s - failed | Status updated to failed | K8s API |
| TC-PA-U042 | Set status updates DB | Platform_Apps.update_status called | Platform_Apps |
| TC-PA-U043 | Status transition validation | Invalid transitions rejected | None |

#### 1.4 Supabase Query Tests (`tests/unit/supabase/platform-apps.test.ts`)

| Test ID | Scenario | Expected Result | Mock |
|---------|----------|-----------------|------|
| TC-PA-U050 | count_by_owner returns correct count | Number >= 0 | Supabase client |
| TC-PA-U051 | check_name_exists for existing name | Returns true | Supabase client |
| TC-PA-U052 | check_name_exists for new name | Returns false | Supabase client |
| TC-PA-U053 | create returns success with data | { success: true, data } | Supabase client |
| TC-PA-U054 | create handles error | { success: false, error } | Supabase client |
| TC-PA-U055 | update modifies record | Updated data returned | Supabase client |
| TC-PA-U056 | get returns app details | App object | Supabase client |
| TC-PA-U057 | list_by_owner filters correctly | Array of user's apps | Supabase client |
| TC-PA-U058 | delete removes record | Success | Supabase client |
| TC-PA-U059 | set_env_vars stores variables | Success | Supabase client |
| TC-PA-U060 | get_env_vars retrieves variables | Array of env vars | Supabase client |

---

### 2. Integration Tests (API Routes)

#### 2.1 Create App (`tests/integration/api/platform-apps-create.test.ts`)

| Test ID | Scenario | Expected Status | Mock Dependencies |
|---------|----------|-----------------|-------------------|
| TC-PA-I001 | Unauthenticated request | 401 | authenticateUser |
| TC-PA-I002 | Valid payload - success | 200 | All services |
| TC-PA-I003 | Invalid payload - validation error | 400 | None |
| TC-PA-I004 | Rate limit exceeded | 429 | limitByUser |
| TC-PA-I005 | Insufficient credits | 402 | ensureBalance |
| TC-PA-I006 | App limit reached (10 apps) | 403 | Platform_Apps.count_by_owner |
| TC-PA-I007 | Duplicate app name | 409 | Platform_Apps.check_name_exists |
| TC-PA-I008 | Missing env variables (server config) | 500 | None |
| TC-PA-I009 | GitHub private repo with token | 200 | GitHubProvider |
| TC-PA-I010 | GitLab private repo with token | 200 | GitLab token refresh |
| TC-PA-I011 | Bitbucket private repo with token | 200 | Bitbucket token refresh |
| TC-PA-I012 | Creates billing record | Billing.start_active_service called | Billing |
| TC-PA-I013 | Adds project log | Projects.add_log called | Projects |
| TC-PA-I014 | Framework detection (Next.js) | Port 3000 assigned | DeploymentService |
| TC-PA-I015 | Framework detection (Python) | Port 8000 assigned | DeploymentService |

#### 2.2 Delete App (`tests/integration/api/platform-apps-delete.test.ts`)

| Test ID | Scenario | Expected Status | Mock Dependencies |
|---------|----------|-----------------|-------------------|
| TC-PA-I020 | Unauthenticated request | 401 | authenticateUser |
| TC-PA-I021 | Valid delete - success | 200 | DeploymentService.delete |
| TC-PA-I022 | Invalid app_id format | 400 | None |
| TC-PA-I023 | App not found | 404 | Platform_Apps.get |
| TC-PA-I024 | Unauthorized (not owner) | 403 | Platform_Apps.get |
| TC-PA-I025 | Admin override delete | 200 | requireAdmin |
| TC-PA-I026 | Rate limit exceeded | 429 | limitByUser |
| TC-PA-I027 | Closes billing record | Billing.close_active_service called | Billing |
| TC-PA-I028 | Adds project log on delete | Projects.add_log called | Projects |

#### 2.3 List Apps (`tests/integration/api/platform-apps-list.test.ts`)

| Test ID | Scenario | Expected Status | Mock Dependencies |
|---------|----------|-----------------|-------------------|
| TC-PA-I030 | Unauthenticated request | 401 | authenticateUser |
| TC-PA-I031 | List user's apps | 200 | Platform_Apps.list_by_owner |
| TC-PA-I032 | Empty list for new user | 200, empty array | Platform_Apps.list_by_owner |
| TC-PA-I033 | Includes rollback capability | Response has can_rollback field | Platform_App_Deployments |
| TC-PA-I034 | Rate limit exceeded | 429 | limitByUser |

#### 2.4 Get App (`tests/integration/api/platform-apps-get.test.ts`)

| Test ID | Scenario | Expected Status | Mock Dependencies |
|---------|----------|-----------------|-------------------|
| TC-PA-I040 | Unauthenticated request | 401 | authenticateUser |
| TC-PA-I041 | Get app details | 200 | Platform_Apps.get |
| TC-PA-I042 | App not found | 404 | Platform_Apps.get |
| TC-PA-I043 | Unauthorized (not owner) | 403 | Platform_Apps.get |
| TC-PA-I044 | Status synced from K8s | Status field accurate | AppStatusService |
| TC-PA-I045 | Includes env_vars | Response has env_vars | Platform_Apps.get_env_vars |
| TC-PA-I046 | Rate limit exceeded | 429 | limitByUser |

#### 2.5 Redeploy App (`tests/integration/api/platform-apps-redeploy.test.ts`)

| Test ID | Scenario | Expected Status | Mock Dependencies |
|---------|----------|-----------------|-------------------|
| TC-PA-I050 | Unauthenticated request | 401 | authenticateUser |
| TC-PA-I051 | Trigger redeploy - success | 200 | JenkinsService.triggerBuild |
| TC-PA-I052 | App not found | 404 | Platform_Apps.get |
| TC-PA-I053 | Unauthorized (not owner) | 403 | Platform_Apps.get |
| TC-PA-I054 | App already building | 409 | Platform_Apps.get |
| TC-PA-I055 | App being deleted | 409 | Platform_Apps.get |
| TC-PA-I056 | Rate limit exceeded | 429 | limitByUser |
| TC-PA-I057 | Updates status to building | AppStatusService.setStatus called | AppStatusService |
| TC-PA-I058 | Adds project log | Projects.add_log called | Projects |

#### 2.6 Resize App (`tests/integration/api/platform-apps-resize.test.ts`)

| Test ID | Scenario | Expected Status | Mock Dependencies |
|---------|----------|-----------------|-------------------|
| TC-PA-I060 | Unauthenticated request | 401 | authenticateUser |
| TC-PA-I061 | Upsize small to medium | 200 | JenkinsService |
| TC-PA-I062 | Upsize medium to large | 200 | JenkinsService |
| TC-PA-I063 | Downsize rejected (large to small) | 400 | None |
| TC-PA-I064 | Same size rejected | 400 | None |
| TC-PA-I065 | App not found | 404 | Platform_Apps.get |
| TC-PA-I066 | Unauthorized (not owner) | 403 | Platform_Apps.get |
| TC-PA-I067 | Insufficient credits for upsize | 402 | ensureBalance |
| TC-PA-I068 | Rate limit exceeded | 429 | limitByUser |
| TC-PA-I069 | Updates billing for new size | Billing methods called | Billing |

#### 2.7 Environment Variables (`tests/integration/api/platform-apps-env-vars.test.ts`)

| Test ID | Scenario | Expected Status | Mock Dependencies |
|---------|----------|-----------------|-------------------|
| TC-PA-I070 | Unauthenticated request | 401 | authenticateUser |
| TC-PA-I071 | Update env vars - success | 200 | Platform_Apps.set_env_vars |
| TC-PA-I072 | App not found | 404 | Platform_Apps.get |
| TC-PA-I073 | Unauthorized (not owner) | 403 | Platform_Apps.get |
| TC-PA-I074 | Duplicate keys rejected | 400 | None |
| TC-PA-I075 | Empty key rejected | 400 | None |
| TC-PA-I076 | Large value accepted | 200 | Platform_Apps.set_env_vars |

#### 2.8 Custom Domains (`tests/integration/api/platform-apps-domains.test.ts`)

| Test ID | Scenario | Expected Status | Mock Dependencies |
|---------|----------|-----------------|-------------------|
| TC-PA-I080 | Add domain - success | 200 | DNSService, Platform_Apps |
| TC-PA-I081 | Add invalid domain format | 400 | None |
| TC-PA-I082 | Verify domain - DNS ready | 200 | DNS lookup |
| TC-PA-I083 | Verify domain - DNS not configured | 400 | DNS lookup |
| TC-PA-I084 | Activate domain - success | 200 | KubernetesCustomDomainService |
| TC-PA-I085 | Activate unverified domain | 400 | None |
| TC-PA-I086 | Remove domain - success | 200 | All cleanup services |
| TC-PA-I087 | Set primary domain | 200 | Platform_Apps |
| TC-PA-I088 | Domain limit per app (5) | 403 | Platform_Apps |

#### 2.9 Rollback (`tests/integration/api/platform-apps-rollback.test.ts`)

| Test ID | Scenario | Expected Status | Mock Dependencies |
|---------|----------|-----------------|-------------------|
| TC-PA-I090 | Unauthenticated request | 401 | authenticateUser |
| TC-PA-I091 | Rollback to previous - success | 200 | JenkinsService, Platform_App_Deployments |
| TC-PA-I092 | No previous deployment | 400 | Platform_App_Deployments |
| TC-PA-I093 | App not found | 404 | Platform_Apps.get |
| TC-PA-I094 | Unauthorized (not owner) | 403 | Platform_Apps.get |

---

### 3. Component Tests

#### 3.1 App Create Form (`tests/components/app-create-form.test.tsx`)

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| TC-PA-C001 | Render deployment wizard | All 4 steps visible |
| TC-PA-C002 | Git provider selection | Shows GitHub/GitLab/Bitbucket options |
| TC-PA-C003 | Connected provider shows checkmark | Provider status indicator |
| TC-PA-C004 | Repository list loads | Repositories fetched from API |
| TC-PA-C005 | Branch selection populates | Branches fetched for selected repo |
| TC-PA-C006 | Framework auto-detection | Framework selected based on repo |
| TC-PA-C007 | Instance size selection | Size cards with pricing displayed |
| TC-PA-C008 | Project selection dropdown | User's projects listed |
| TC-PA-C009 | Environment variables editor | Add/remove env vars |
| TC-PA-C010 | Form validation errors | Invalid inputs show errors |
| TC-PA-C011 | Submit creates app | API called with correct payload |
| TC-PA-C012 | Submit shows loading state | Button disabled during submission |
| TC-PA-C013 | Success redirects to app list | Router.push called |
| TC-PA-C014 | Error shows toast notification | Toast.error called |
| TC-PA-C015 | Step navigation | Can navigate between steps |

#### 3.2 Apps List (`tests/components/apps-list.test.tsx`)

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| TC-PA-C020 | Render apps grid | Apps displayed in grid |
| TC-PA-C021 | Loading state | Spinner shown |
| TC-PA-C022 | Empty state | "No apps" message with CTA |
| TC-PA-C023 | Search filters apps | Filtered list updates |
| TC-PA-C024 | App count badge | Shows X of Y apps |
| TC-PA-C025 | Click app opens details | Navigation triggered |
| TC-PA-C026 | Delete button shows modal | Modal opens |
| TC-PA-C027 | Metrics displayed for running apps | CPU/Memory shown |

#### 3.3 App Card (`tests/components/app-card.test.tsx`)

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| TC-PA-C030 | Render app card | Name, status, URL visible |
| TC-PA-C031 | Status badge - running | Green badge |
| TC-PA-C032 | Status badge - building | Blue badge with spinner |
| TC-PA-C033 | Status badge - failed | Red badge |
| TC-PA-C034 | Status badge - deleting | Yellow badge with spinner |
| TC-PA-C035 | Deployment URL link | External link icon |
| TC-PA-C036 | Build info displayed | Build number, duration |
| TC-PA-C037 | Expand logs toggle | Logs section shows/hides |
| TC-PA-C038 | Metrics display | CPU, memory percentages |
| TC-PA-C039 | Rollback badge | Shows when can_rollback true |

#### 3.4 Delete App Modal (`tests/components/delete-app-modal.test.tsx`)

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| TC-PA-C040 | Modal renders | Title, description visible |
| TC-PA-C041 | Confirmation input required | Delete disabled until typed |
| TC-PA-C042 | Cancel closes modal | onOpenChange(false) called |
| TC-PA-C043 | Delete triggers API call | API called with app_id |
| TC-PA-C044 | Loading state during delete | Button shows spinner |
| TC-PA-C045 | Success callback | onSuccess called |
| TC-PA-C046 | Error shows toast | Toast.error called |

#### 3.5 Custom Domains Manager (`tests/components/custom-domains.test.tsx`)

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| TC-PA-C050 | Render domains list | Existing domains shown |
| TC-PA-C051 | Add domain button | Opens dialog |
| TC-PA-C052 | Domain input validation | Invalid domain shows error |
| TC-PA-C053 | Add domain success | Domain added to list |
| TC-PA-C054 | Verification instructions | DNS record info displayed |
| TC-PA-C055 | Verify button | Triggers verification API |
| TC-PA-C056 | Activate button | Triggers activation API |
| TC-PA-C057 | Remove domain | Confirmation and removal |
| TC-PA-C058 | Primary domain badge | Star icon on primary |
| TC-PA-C059 | Set as primary | API called, badge moves |
| TC-PA-C060 | Copy DNS record | Clipboard API called |

#### 3.6 Environment Variables Editor (`tests/components/env-vars-editor.test.tsx`)

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| TC-PA-C060 | Render env vars list | Existing vars displayed |
| TC-PA-C061 | Add new variable | New row added |
| TC-PA-C062 | Remove variable | Row removed |
| TC-PA-C063 | Edit key | Key updated |
| TC-PA-C064 | Edit value | Value updated |
| TC-PA-C065 | Duplicate key warning | Error message shown |
| TC-PA-C066 | Save button state | Enabled when modified |
| TC-PA-C067 | Cancel discards changes | Original values restored |

#### 3.7 Runtime Logs (`tests/components/runtime-logs.test.tsx`)

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| TC-PA-C070 | Render log viewer | Container visible |
| TC-PA-C071 | Logs stream in real-time | New logs appear |
| TC-PA-C072 | Auto-scroll to bottom | Scroll position updated |
| TC-PA-C073 | Clear logs button | Logs cleared |
| TC-PA-C074 | Download logs | File download triggered |
| TC-PA-C075 | Error state | Error message shown |

---

## 🔧 Mock Data Requirements

### New Mock Data File (`tests/utils/mock-data-platform-apps.ts`)

```typescript
// Mock User (reuse from existing)
export const mockPlatformAppUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  name: 'Test User',
};

// Mock Platform App
export const mockPlatformApp = {
  id: 'app-550e8400-e29b-41d4-a716-446655440001',
  name: 'my-nextjs-app',
  slug: 'my-nextjs-app-abc123',
  user_id: mockPlatformAppUser.id,
  git_provider: 'github',
  repository_id: 'repo-123',
  repository_name: 'my-repo',
  repository_url: 'https://github.com/user/my-repo',
  branch: 'main',
  framework: 'Next.js',
  status: 'running',
  port: 3000,
  deployment_url: 'https://my-nextjs-app.apps.hostguardian.net',
  size: 'small',
  auto_deploy: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

// Mock Create Payload
export const mockCreatePlatformAppPayload = {
  name: 'new-test-app',
  git_provider: 'github',
  repository_id: 'repo-456',
  repository_name: 'new-repo',
  repository_url: 'https://github.com/user/new-repo',
  branch: 'main',
  framework: 'Next.js',
  size: 'small',
  env_vars: [
    { key: 'NODE_ENV', value: 'production' },
    { key: 'API_URL', value: 'https://api.example.com' },
  ],
};

// Mock Build Info
export const mockBuildInfo = {
  number: 5,
  building: false,
  result: 'SUCCESS',
  duration: 120000,
  timestamp: Date.now() - 3600000,
  url: 'https://jenkins.example.com/job/my-nextjs-app-job/5/',
};

// Mock Deployment
export const mockDeployment = {
  id: 'deploy-123',
  app_id: mockPlatformApp.id,
  build_number: 5,
  status: 'success',
  started_at: '2025-01-01T00:00:00Z',
  completed_at: '2025-01-01T00:02:00Z',
  duration: 120000,
  commit_sha: 'abc123def456',
  commit_message: 'feat: add new feature',
  trigger: 'manual',
};

// Mock Custom Domain
export const mockCustomDomain = {
  id: 'domain-123',
  app_id: mockPlatformApp.id,
  domain: 'custom.example.com',
  status: 'verified',
  verification_token: 'verify-abc123',
  verification_method: 'DNS TXT',
  verified_at: '2025-01-01T00:00:00Z',
  ssl_status: 'active',
  is_primary: false,
  dns_ready: true,
};

// Mock Invalid Payloads for validation testing
export const mockInvalidPlatformAppPayloads = {
  invalidName: { ...mockCreatePlatformAppPayload, name: 'Invalid Name!' },
  nameTooShort: { ...mockCreatePlatformAppPayload, name: 'ab' },
  invalidProvider: { ...mockCreatePlatformAppPayload, git_provider: 'invalid' },
  invalidFramework: { ...mockCreatePlatformAppPayload, framework: 'unknown' },
  invalidSize: { ...mockCreatePlatformAppPayload, size: 'xlarge' },
  invalidUrl: { ...mockCreatePlatformAppPayload, repository_url: 'not-a-url' },
};
```

---

## 🎯 What Should Be Mocked vs Real

### Mock (Required)
| Dependency | Reason |
|------------|--------|
| `authenticateUser` | Auth state control |
| `limitByUser` | Rate limit testing |
| `ensureBalance` / `postProvisionBilling` | Billing flow |
| `Platform_Apps.*` | Supabase queries |
| `JenkinsService.*` | External Jenkins API |
| `DNSService.*` | External Cloudflare API |
| `GitHubProvider` / GitLab / Bitbucket tokens | OAuth tokens |
| `fetch` / `axios` | External HTTP calls |
| `next/navigation` | Router functions |

### Real (Use Actual Implementation)
| Component | Reason |
|-----------|--------|
| Validation schemas (Zod) | Test actual validation logic |
| Utility functions (slug generation, port mapping) | Test business logic |
| React component rendering | Test UI behavior |

---

## 📊 Coverage Goals

| Category | Target Coverage |
|----------|-----------------|
| Unit Tests | 80%+ |
| Integration Tests | 70%+ |
| Component Tests | 75%+ |
| Overall | 75%+ |

### Priority Order
1. **High Priority**: Create, Delete, List, Get APIs (core CRUD)
2. **Medium Priority**: Redeploy, Resize, Env Vars (operational)
3. **Lower Priority**: Custom Domains, Rollback, Metrics (advanced features)

---

## 🚀 Implementation Order

### Phase 1: Foundation
1. Create `mock-data-platform-apps.ts`
2. Add platform-app specific test helpers
3. Unit tests for validation schemas

### Phase 2: Core API Tests
4. `platform-apps-create.test.ts`
5. `platform-apps-delete.test.ts`
6. `platform-apps-list.test.ts`
7. `platform-apps-get.test.ts`

### Phase 3: Operational API Tests
8. `platform-apps-redeploy.test.ts`
9. `platform-apps-resize.test.ts`
10. `platform-apps-env-vars.test.ts`

### Phase 4: Advanced API Tests
11. `platform-apps-domains.test.ts`
12. `platform-apps-rollback.test.ts`

### Phase 5: Component Tests
13. `app-create-form.test.tsx`
14. `apps-list.test.tsx`
15. `app-card.test.tsx`
16. `delete-app-modal.test.tsx`
17. `custom-domains.test.tsx`
18. `env-vars-editor.test.tsx`
19. `runtime-logs.test.tsx`

### Phase 6: Service Unit Tests
20. `deployment.test.ts`
21. `app-status.test.ts`
22. `build-polling.test.ts`

---

## 📎 References

- Existing test conventions: `tests/integration/api/database-create.test.ts`
- Test helpers: `tests/utils/test-helpers.ts`
- Setup file: `tests/setup.ts`
- Vitest config: `vitest.config.ts`
