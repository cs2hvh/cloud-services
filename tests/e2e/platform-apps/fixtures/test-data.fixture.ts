/**
 * Test Data Fixtures for Platform Apps E2E Tests
 * Reuses and extends mock data from unit/integration tests
 */

// Re-export all mock data from existing test utilities
export {
  mockPlatformApp,
  mockBuildingApp,
  mockFailedApp,
  mockPendingApp,
  mockDeletingApp,
  mockPythonApp,
  mockCreatePlatformAppPayload,
  mockCreatePythonAppPayload,
  mockInvalidPlatformAppPayloads,
  mockBuildInfo,
  mockBuildingInfo,
  mockFailedBuildInfo,
  mockDeployment,
  mockPreviousDeployment,
  mockFailedDeployment,
  mockCustomDomain,
  mockActiveDomain,
  mockPendingDomain,
  mockEnvVars,
  mockRepository,
  mockPrivateRepository,
  mockBranch,
  mockBranches,
  mockAppMetrics,
  mockAppHealth,
  mockPod,
  mockPods,
  mockAppEvents,
  mockPlatformAppPricing,
  mockJenkinsJobCreateResponse,
  mockJenkinsBuildTriggerResponse,
  mockDNSCreateResponse,
  validFrameworks,
  validGitProviders,
  validSizes,
} from '../../../utils/mock-data-platform-apps';

// Additional E2E-specific test data

/**
 * Mock connected git providers
 */
export const mockConnectedProviders = [
  { provider: 'github', status: true },
  { provider: 'gitlab', status: false },
  { provider: 'bitbucket', status: false },
];

/**
 * Mock all providers connected
 */
export const mockAllProvidersConnected = [
  { provider: 'github', status: true },
  { provider: 'gitlab', status: true },
  { provider: 'bitbucket', status: true },
];

/**
 * Mock GitHub repositories for E2E
 */
export const mockGitHubRepositories = [
  {
    id: 'repo-gh-1',
    name: 'my-nextjs-app',
    fullName: 'user/my-nextjs-app',
    description: 'A Next.js application with TypeScript',
    private: false,
    defaultBranch: 'main',
    language: 'TypeScript',
    updatedAt: '2025-01-10T00:00:00Z',
    provider: 'github' as const,
    branches: [
      { name: 'main', commitSha: 'abc123def456', protected: true },
      { name: 'develop', commitSha: 'def456abc789', protected: false },
      { name: 'staging', commitSha: 'ghi789jkl012', protected: false },
    ],
  },
  {
    id: 'repo-gh-2',
    name: 'my-python-api',
    fullName: 'user/my-python-api',
    description: 'A FastAPI backend service',
    private: true,
    defaultBranch: 'main',
    language: 'Python',
    updatedAt: '2025-01-09T00:00:00Z',
    provider: 'github' as const,
    branches: [
      { name: 'main', commitSha: 'xyz123abc456', protected: true },
      { name: 'feature/api-v2', commitSha: 'uvw789def012', protected: false },
    ],
  },
  {
    id: 'repo-gh-3',
    name: 'react-dashboard',
    fullName: 'user/react-dashboard',
    description: 'React admin dashboard',
    private: false,
    defaultBranch: 'develop',
    language: 'JavaScript',
    updatedAt: '2025-01-08T00:00:00Z',
    provider: 'github' as const,
    branches: [
      { name: 'develop', commitSha: 'rst456uvw789', protected: true },
      { name: 'main', commitSha: 'opq123rst456', protected: true },
    ],
  },
  {
    id: 'repo-gh-4',
    name: 'vue-ecommerce',
    fullName: 'user/vue-ecommerce',
    description: 'Vue.js e-commerce platform',
    private: false,
    defaultBranch: 'main',
    language: 'Vue',
    updatedAt: '2025-01-07T00:00:00Z',
    provider: 'github' as const,
    branches: [
      { name: 'main', commitSha: 'lmn345opq678', protected: true },
      { name: 'hotfix/cart-bug', commitSha: 'jkl012mno345', protected: false },
    ],
  },
];

/**
 * Mock GitLab repositories
 */
export const mockGitLabRepositories = [
  {
    id: 'repo-gl-1',
    name: 'express-backend',
    fullName: 'team/express-backend',
    description: 'Express.js REST API',
    private: true,
    defaultBranch: 'master',
    language: 'JavaScript',
    updatedAt: '2025-01-11T00:00:00Z',
    provider: 'gitlab' as const,
    branches: [
      { name: 'master', commitSha: 'aaa111bbb222', protected: true },
      { name: 'develop', commitSha: 'ccc333ddd444', protected: false },
    ],
  },
  {
    id: 'repo-gl-2',
    name: 'django-app',
    fullName: 'team/django-app',
    description: 'Django web application',
    private: false,
    defaultBranch: 'main',
    language: 'Python',
    updatedAt: '2025-01-10T00:00:00Z',
    provider: 'gitlab' as const,
    branches: [
      { name: 'main', commitSha: 'eee555fff666', protected: true },
    ],
  },
];

/**
 * Mock Bitbucket repositories
 */
export const mockBitbucketRepositories = [
  {
    id: 'repo-bb-1',
    name: 'angular-portal',
    branches: [
      { name: 'main', commitSha: 'ggg777hhh888', protected: true },
      { name: 'feature/new-ui', commitSha: 'iii999jjj000', protected: false },
    ],
    fullName: 'company/angular-portal',
    description: 'Angular enterprise portal',
    private: true,
    defaultBranch: 'main',
    language: 'TypeScript',
    updatedAt: '2025-01-09T00:00:00Z',
    provider: 'bitbucket' as const,
  },
];

/**
 * Mock branches for a repository
 */
export const mockRepositoryBranches = [
  { name: 'main', commitSha: 'abc123def456', protected: true },
  { name: 'develop', commitSha: 'def456abc789', protected: false },
  { name: 'staging', commitSha: 'ghi789jkl012', protected: false },
  { name: 'feature/new-feature', commitSha: 'jkl012mno345', protected: false },
  { name: 'hotfix/urgent-fix', commitSha: 'mno345pqr678', protected: false },
];

/**
 * Mock multiple apps for list view
 */
export const mockMultipleApps = [
  {
    id: 'app-1',
    name: 'my-nextjs-app',
    slug: 'my-nextjs-app-abc123',
    status: 'running',
    deployment_url: 'https://my-nextjs-app.apps.hostguardian.net',
    framework: 'Next.js',
    size: 'small',
    created_at: '2025-01-01T00:00:00Z',
    can_rollback: true,
  },
  {
    id: 'app-2',
    name: 'python-api',
    slug: 'python-api-def456',
    status: 'building',
    deployment_url: 'https://python-api.apps.hostguardian.net',
    framework: 'fastapi',
    size: 'medium',
    created_at: '2025-01-05T00:00:00Z',
    can_rollback: false,
  },
  {
    id: 'app-3',
    name: 'react-dashboard',
    slug: 'react-dashboard-ghi789',
    status: 'failed',
    deployment_url: 'https://react-dashboard.apps.hostguardian.net',
    framework: 'React',
    size: 'small',
    created_at: '2025-01-08T00:00:00Z',
    last_failure_reason: 'Build failed: npm install error',
    can_rollback: true,
  },
  {
    id: 'app-4',
    name: 'vue-app',
    slug: 'vue-app-jkl012',
    status: 'pending',
    deployment_url: null,
    framework: 'Vue.js',
    size: 'small',
    created_at: '2025-01-12T00:00:00Z',
    can_rollback: false,
  },
];

/**
 * Mock deployment history with multiple builds
 */
export const mockDeploymentHistory = [
  {
    build_number: 5,
    status: 'success',
    started_at: '2025-01-12T10:00:00Z',
    duration: 120000,
    commit_sha: 'abc123',
    commit_message: 'feat: add new feature',
    trigger: 'manual',
  },
  {
    build_number: 4,
    status: 'success',
    started_at: '2025-01-11T15:30:00Z',
    duration: 115000,
    commit_sha: 'def456',
    commit_message: 'fix: resolve bug in auth',
    trigger: 'auto',
  },
  {
    build_number: 3,
    status: 'failed',
    started_at: '2025-01-11T14:00:00Z',
    duration: 45000,
    commit_sha: 'ghi789',
    commit_message: 'chore: update dependencies',
    trigger: 'manual',
    failure_reason: 'npm install error',
  },
  {
    build_number: 2,
    status: 'success',
    started_at: '2025-01-10T09:00:00Z',
    duration: 130000,
    commit_sha: 'jkl012',
    commit_message: 'Initial deployment',
    trigger: 'manual',
  },
];

/**
 * Mock sample build logs
 */
export const mockSampleBuildLogs = `
[INFO] Starting build process...
[INFO] Cloning repository...
[INFO] Repository cloned successfully
[INFO] Installing dependencies...
[INFO] Running npm install...
[SUCCESS] Dependencies installed
[INFO] Running build command...
[INFO] Building Next.js application...
[SUCCESS] Build completed successfully
[INFO] Creating Docker image...
[SUCCESS] Docker image created
[INFO] Deploying to Kubernetes...
[SUCCESS] Deployment successful
[INFO] Build completed in 2m 15s
`;

/**
 * Mock sample runtime logs
 */
export const mockSampleRuntimeLogs = `
2025-01-12T12:00:01.123Z [INFO] Application starting...
2025-01-12T12:00:01.456Z [INFO] Connected to database
2025-01-12T12:00:01.789Z [INFO] Server listening on port 3000
2025-01-12T12:00:15.234Z [INFO] GET /api/health 200 - 5ms
2025-01-12T12:00:30.567Z [INFO] GET /api/users 200 - 12ms
2025-01-12T12:01:00.890Z [INFO] POST /api/auth/login 200 - 45ms
`;

/**
 * E2E Test User Credentials (from env or defaults)
 */
export const testUser = {
  email:  'pankajsoni93444@gmail.com',
  password:'Pankaj11@',
};

export const testAdmin = {
  email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com',
  password: process.env.TEST_ADMIN_PASSWORD || 'admin-password',
};
