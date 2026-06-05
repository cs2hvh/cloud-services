/**
 * Mock data for Platform Apps (App Deployment) testing
 */

// ============================================
// Mock User
// ============================================
export const mockPlatformAppUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  name: 'Test User',
};

export const mockAdminUser = {
  id: '550e8400-e29b-41d4-a716-446655440099',
  email: 'admin@example.com',
  name: 'Admin User',
};

// ============================================
// Mock Project
// ============================================
export const mockProject = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  name: 'Test Project',
  owner: mockPlatformAppUser.id,
  description: 'Test project for platform app tests',
  default_project: false,
  users: [],
  created_at: '2025-01-01T00:00:00Z',
};

// ============================================
// Mock Platform App
// ============================================
export const mockPlatformApp = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'my-nextjs-app',
  slug: 'my-nextjs-app-abc123',
  user_id: mockPlatformAppUser.id,
  git_provider: 'github' as const,
  repository_id: 'repo-123456789',
  repository_name: 'user/my-repo',
  repository_url: 'https://github.com/user/my-repo',
  branch: 'main',
  framework: 'Next.js' as const,
  build_command: 'npm run build',
  output_directory: '.next',
  status: 'running' as const,
  port: 3000,
  ip: '10.0.0.1',
  deployment_url: 'https://my-nextjs-app.apps.hostguardian.net',
  size: 'small' as const,
  auto_deploy: true,
  deploy_branch: 'main',
  project_id: mockProject.id,
  active_deployment_id: 'deploy-123',
  last_failure_reason: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

export const mockBuildingApp = {
  ...mockPlatformApp,
  id: '550e8400-e29b-41d4-a716-446655440002',
  name: 'building-app',
  slug: 'building-app-def456',
  status: 'building' as const,
};

export const mockFailedApp = {
  ...mockPlatformApp,
  id: '550e8400-e29b-41d4-a716-446655440003',
  name: 'failed-app',
  slug: 'failed-app-ghi789',
  status: 'failed' as const,
  last_failure_reason: 'Build failed: npm install error',
};

export const mockPendingApp = {
  ...mockPlatformApp,
  id: '550e8400-e29b-41d4-a716-446655440004',
  name: 'pending-app',
  slug: 'pending-app-jkl012',
  status: 'pending' as const,
};

export const mockDeletingApp = {
  ...mockPlatformApp,
  id: '550e8400-e29b-41d4-a716-446655440005',
  name: 'deleting-app',
  slug: 'deleting-app-mno345',
  status: 'deleting' as const,
};

export const mockPythonApp = {
  ...mockPlatformApp,
  id: '550e8400-e29b-41d4-a716-446655440006',
  name: 'my-python-api',
  slug: 'my-python-api-pqr678',
  framework: 'fastapi' as const,
  port: 8000,
  build_command: '',
  output_directory: '.',
};

// ============================================
// Mock Create Payload
// ============================================
export const mockCreatePlatformAppPayload = {
  name: 'new-test-app',
  git_provider: 'github' as const,
  repository_id: 'repo-456789012',
  repository_name: 'user/new-repo',
  repository_url: 'https://github.com/user/new-repo',
  branch: 'main',
  framework: 'Next.js' as const,
  size: 'small' as const,
  auto_deploy: true,
  project_id: mockProject.id,
  env_vars: [
    { key: 'NODE_ENV', value: 'production' },
    { key: 'API_URL', value: 'https://api.example.com' },
  ],
};

export const mockCreatePythonAppPayload = {
  ...mockCreatePlatformAppPayload,
  name: 'new-python-app',
  framework: 'fastapi' as const,
  env_vars: [
    { key: 'PYTHONUNBUFFERED', value: '1' },
    { key: 'DATABASE_URL', value: 'postgresql://localhost/db' },
  ],
};

// ============================================
// Mock Invalid Payloads
// ============================================
export const mockInvalidPlatformAppPayloads = {
  invalidName: {
    ...mockCreatePlatformAppPayload,
    name: 'Invalid Name With Spaces!',
  },
  nameTooShort: {
    ...mockCreatePlatformAppPayload,
    name: 'ab',
  },
  nameTooLong: {
    ...mockCreatePlatformAppPayload,
    name: 'a'.repeat(64),
  },
  nameStartsWithHyphen: {
    ...mockCreatePlatformAppPayload,
    name: '-invalid-name',
  },
  nameEndsWithHyphen: {
    ...mockCreatePlatformAppPayload,
    name: 'invalid-name-',
  },
  invalidProvider: {
    ...mockCreatePlatformAppPayload,
    git_provider: 'invalid-provider',
  },
  invalidFramework: {
    ...mockCreatePlatformAppPayload,
    framework: 'unknown-framework',
  },
  invalidSize: {
    ...mockCreatePlatformAppPayload,
    size: 'enterprise',
  },
  invalidUrl: {
    ...mockCreatePlatformAppPayload,
    repository_url: 'not-a-valid-url',
  },
  emptyRepoId: {
    ...mockCreatePlatformAppPayload,
    repository_id: '',
  },
  emptyRepoName: {
    ...mockCreatePlatformAppPayload,
    repository_name: '',
  },
  invalidProjectId: {
    ...mockCreatePlatformAppPayload,
    project_id: 'not-a-uuid',
  },
  emptyEnvVarKey: {
    ...mockCreatePlatformAppPayload,
    env_vars: [{ key: '', value: 'some-value' }],
  },
  emptyEnvVarValue: {
    ...mockCreatePlatformAppPayload,
    env_vars: [{ key: 'SOME_KEY', value: '' }],
  },
};

// ============================================
// Mock Build Info
// ============================================
export const mockBuildInfo = {
  number: 5,
  building: false,
  result: 'SUCCESS' as const,
  duration: 120000,
  timestamp: Date.now() - 3600000,
  url: 'https://jenkins.example.com/job/my-nextjs-app-job/5/',
};

export const mockBuildingInfo = {
  ...mockBuildInfo,
  number: 6,
  building: true,
  result: null,
  duration: 0,
};

export const mockFailedBuildInfo = {
  ...mockBuildInfo,
  number: 4,
  result: 'FAILURE' as const,
};

// ============================================
// Mock Deployment
// ============================================
export const mockDeployment = {
  id: 'deploy-550e8400-e29b-41d4-a716-446655440020',
  app_id: mockPlatformApp.id,
  build_number: 5,
  status: 'success' as const,
  started_at: '2025-01-01T00:00:00Z',
  completed_at: '2025-01-01T00:02:00Z',
  duration: 120000,
  commit_sha: 'abc123def456789012345678901234567890abcd',
  commit_message: 'feat: add new feature',
  trigger: 'manual' as const,
  failure_reason: null,
};

export const mockPreviousDeployment = {
  ...mockDeployment,
  id: 'deploy-previous-123',
  build_number: 4,
  started_at: '2024-12-31T00:00:00Z',
  completed_at: '2024-12-31T00:02:00Z',
};

export const mockFailedDeployment = {
  ...mockDeployment,
  id: 'deploy-failed-123',
  build_number: 3,
  status: 'failed' as const,
  failure_reason: 'Build failed: npm install error',
};

// ============================================
// Mock Custom Domain
// ============================================
export const mockCustomDomain = {
  id: 'domain-550e8400-e29b-41d4-a716-446655440030',
  app_id: mockPlatformApp.id,
  domain: 'custom.example.com',
  status: 'verified' as const,
  verification_token: 'verify-abc123def456',
  verification_method: 'DNS TXT',
  verified_at: '2025-01-01T01:00:00Z',
  activated_at: null,
  ssl_status: 'pending',
  is_primary: false,
  last_error: null,
  created_at: '2025-01-01T00:00:00Z',
  dns_ready: true,
  dns_message: 'DNS configured correctly',
  dns_resolved_ips: ['10.0.0.1'],
  dns_expected_ips: ['10.0.0.1'],
};

export const mockActiveDomain = {
  ...mockCustomDomain,
  id: 'domain-active-123',
  domain: 'active.example.com',
  status: 'active' as const,
  activated_at: '2025-01-01T02:00:00Z',
  ssl_status: 'active',
  is_primary: true,
};

export const mockPendingDomain = {
  ...mockCustomDomain,
  id: 'domain-pending-123',
  domain: 'pending.example.com',
  status: 'pending' as const,
  verified_at: null,
  dns_ready: false,
  dns_message: 'Waiting for DNS propagation',
};

// ============================================
// Mock Environment Variables
// ============================================
export const mockEnvVars = [
  { key: 'NODE_ENV', value: 'production' },
  { key: 'API_URL', value: 'https://api.example.com' },
  { key: 'DATABASE_URL', value: 'postgresql://localhost/db' },
  { key: 'SECRET_KEY', value: 'super-secret-key-123' },
];

// ============================================
// Mock Repository
// ============================================
export const mockRepository = {
  id: 'repo-123456789',
  name: 'my-repo',
  fullName: 'user/my-repo',
  description: 'A test repository',
  private: false,
  defaultBranch: 'main',
  language: 'TypeScript',
  updatedAt: '2025-01-01T00:00:00Z',
  provider: 'github' as const,
};

export const mockPrivateRepository = {
  ...mockRepository,
  id: 'repo-private-123',
  name: 'private-repo',
  fullName: 'user/private-repo',
  private: true,
};

// ============================================
// Mock Branch
// ============================================
export const mockBranch = {
  name: 'main',
  commitSha: 'abc123def456',
  protected: true,
};

export const mockBranches = [
  mockBranch,
  { name: 'develop', commitSha: 'def456abc789', protected: false },
  { name: 'feature/new-feature', commitSha: 'ghi789jkl012', protected: false },
];

// ============================================
// Mock Metrics
// ============================================
export const mockAppMetrics = {
  cpu: {
    usage: 25.5,
    limit: 500, // millicores
  },
  memory: {
    usage: 128, // MB
    limit: 512, // MB
  },
  network: {
    rx: 1024000, // bytes
    tx: 512000, // bytes
  },
};

export const mockAppHealth = {
  status: 'healthy' as const,
  lastCheck: '2025-01-01T12:00:00Z',
  uptime: 86400, // seconds
  responseTime: 45, // ms
};

// ============================================
// Mock Pods
// ============================================
export const mockPod = {
  name: 'my-nextjs-app-abc123-pod-1',
  status: 'Running',
  restarts: 0,
  age: '24h',
  node: 'worker-node-1',
  ip: '10.244.0.15',
};

export const mockPods = [
  mockPod,
  {
    ...mockPod,
    name: 'my-nextjs-app-abc123-pod-2',
    ip: '10.244.0.16',
  },
];

// ============================================
// Mock Events
// ============================================
export const mockAppEvents = [
  {
    type: 'Normal',
    reason: 'Scheduled',
    message: 'Successfully assigned default/my-nextjs-app to worker-node-1',
    timestamp: '2025-01-01T00:00:00Z',
  },
  {
    type: 'Normal',
    reason: 'Pulled',
    message: 'Container image pulled successfully',
    timestamp: '2025-01-01T00:00:30Z',
  },
  {
    type: 'Normal',
    reason: 'Started',
    message: 'Started container my-nextjs-app',
    timestamp: '2025-01-01T00:00:45Z',
  },
];

// ============================================
// Mock Pricing
// ============================================
export const mockPlatformAppPricing = {
  small: {
    initialCost: 5,
    hourlyRate: 0.007,
    price: 5,
  },
  medium: {
    initialCost: 15,
    hourlyRate: 0.021,
    price: 15,
  },
  large: {
    initialCost: 30,
    hourlyRate: 0.042,
    price: 30,
  },
};

// ============================================
// Mock Jenkins Response
// ============================================
export const mockJenkinsJobCreateResponse = {
  success: true,
  jobUrl: 'https://jenkins.example.com/job/new-test-app-job/',
};

export const mockJenkinsBuildTriggerResponse = {
  success: true,
  buildNumber: 1,
  queueId: 12345,
};

// ============================================
// Mock DNS Response
// ============================================
export const mockDNSCreateResponse = {
  success: true,
  result: {
    id: 'dns-record-123',
    name: 'my-nextjs-app.apps.hostguardian.net',
    type: 'A',
    content: '10.0.0.1',
  },
};

// ============================================
// Frameworks List (for validation)
// ============================================
export const validFrameworks = [
  'simple-test',
  'Next.js',
  'Nuxt.js',
  'Vite-React',
  'React',
  'Vue.js',
  'Angular',
  'SvelteKit',
  'Svelte',
  'Node.js',
  'express',
  'python',
  'django',
  'flask',
  'fastapi',
  'Static',
] as const;

// ============================================
// Git Providers List
// ============================================
export const validGitProviders = ['github', 'gitlab', 'bitbucket'] as const;

// ============================================
// Valid Sizes
// ============================================
export const validSizes = ['small', 'medium', 'large'] as const;

// ============================================
// Size Specifications
// ============================================
export const sizeSpecs = {
  small: { cpu: '250m', memory: '256Mi', replicas: 1 },
  medium: { cpu: '500m', memory: '512Mi', replicas: 2 },
  large: { cpu: '1', memory: '1Gi', replicas: 3 },
};
