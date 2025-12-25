/**
 * Common types for all Git providers (GitHub, GitLab, Bitbucket)
 * These types provide a unified interface across providers
 */

// Supported Git providers
export type GitProvider = 'github' | 'gitlab' | 'bitbucket';

// Repository information (normalized across all providers)
export interface Repository {
  id: string;
  name: string;
  fullName: string; // github: owner/repo, gitlab: path/with/namespace, bitbucket: workspace/repo
  description: string;
  private: boolean;
  defaultBranch: string;
  language: string | null;
  updatedAt: string;
  provider: GitProvider;
  cloneUrl: string;
  htmlUrl: string;
}

// Branch information (normalized across all providers)
export interface Branch {
  name: string;
  commitSha: string;
  protected: boolean;
}

// OAuth token information
export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  expiresIn?: number;
  tokenType: string;
  scope: string;
}

// API response for repositories
export interface RepositoriesResponse {
  repositories: Repository[];
  message?: string;
  warning?: string;
  needsAppAuth?: boolean;
}

// API response for branches
export interface BranchesResponse {
  branches: Branch[];
  message?: string;
  note?: string;
}

// Provider connection status
export interface ProviderStatus {
  provider: GitProvider;
  connected: boolean;
  username?: string;
  email?: string;
}

// Framework detection result
export interface FrameworkDetection {
  framework: string;
  buildCommand: string;
  outputDir: string;
  installCommand: string;
  description: string;
}

// API error response
export interface ApiError {
  message: string;
  code: string;
  status: number;
  needsAuth?: boolean;
}
