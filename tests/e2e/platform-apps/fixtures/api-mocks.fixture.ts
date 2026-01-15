import { Page, Route } from '@playwright/test';

/**
 * API Mocking Utilities for Platform Apps E2E Tests
 * Provides methods to intercept and mock API calls
 */
export class ApiMocks {
  constructor(private page: Page) {}

  /**
   * Mock the apps list endpoint
   */
  async mockAppsList(apps: any[], status = 200) {
    await this.page.route('**/api/services/platform-apps/list', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ apps }),
      });
    });
  }

  /**
   * Mock the get single app endpoint
   */
  async mockAppGet(app: any, status = 200) {
    await this.page.route('**/api/services/platform-apps/get', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(app),
      });
    });
  }

  /**
   * Mock the create app endpoint
   */
  async mockAppCreate(response: any, status = 200) {
    await this.page.route('**/api/services/platform-apps/create', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();
      
      // Simulate response with created app data
      const responseData = status === 200 ? {
        ...response,
        app_id: response.app_id || 'mock-app-id-123',
        message: 'App created successfully',
      } : response;

      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(responseData),
      });
    });
  }

  /**
   * Mock the delete app endpoint
   */
  async mockAppDelete(status = 200, error?: string) {
    await this.page.route('**/api/services/platform-apps/delete', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(
          status === 200
            ? { message: 'App deleted successfully' }
            : { error: error || 'Failed to delete app' }
        ),
      });
    });
  }

  /**
   * Mock the redeploy endpoint
   */
  async mockAppRedeploy(buildNumber = 2, status = 200) {
    await this.page.route('**/api/services/platform-apps/redeploy', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Redeploy triggered successfully',
          build_number: buildNumber,
        }),
      });
    });
  }

  /**
   * Mock the resize endpoint
   */
  async mockAppResize(newSize: string, buildNumber = 3, status = 200) {
    await this.page.route('**/api/services/platform-apps/resize', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          message: `App resized to ${newSize}`,
          build_number: buildNumber,
          new_size: newSize,
        }),
      });
    });
  }

  /**
   * Mock environment variables update endpoint
   */
  async mockEnvVarsUpdate(status = 200) {
    await this.page.route('**/api/services/platform-apps/env-vars/update', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Environment variables updated successfully',
        }),
      });
    });
  }

  /**
   * Mock custom domain endpoints
   */
  async mockDomainAdd(status = 200) {
    await this.page.route('**/api/services/platform-apps/domains/add', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(
          status === 200
            ? { message: 'Domain added successfully' }
            : status === 409
            ? { error: 'Domain already exists' }
            : { error: 'Failed to add domain' }
        ),
      });
    });
  }

  async mockDomainsList(domains: any[], status = 200) {
    await this.page.route('**/api/services/platform-apps/domains*', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ domains }),
      });
    });
  }

  async mockDomainVerify(verified = true, status = 200) {
    await this.page.route('**/api/services/platform-apps/domains/verify', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          verified,
          message: verified ? 'Domain verified successfully' : 'DNS not configured correctly',
        }),
      });
    });
  }

  async mockDomainActivate(status = 200) {
    await this.page.route('**/api/services/platform-apps/domains/activate', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Domain activated successfully',
        }),
      });
    });
  }

  async mockDomainRemove(status = 200) {
    await this.page.route('**/api/services/platform-apps/domains/remove', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Domain removed successfully',
        }),
      });
    });
  }

  /**
   * Mock deployments history endpoint
   */
  async mockDeployments(deployments: any[], status = 200) {
    await this.page.route('**/api/services/platform-apps/deployments*', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ deployments }),
      });
    });
  }

  /**
   * Mock deployments list endpoint (alias for compatibility)
   */
  async mockDeploymentsList(deployments: any[], status = 200) {
    return this.mockDeployments(deployments, status);
  }

  /**
   * Mock rollback endpoint
   */
  async mockRollback(buildNumber = 4, status = 200) {
    await this.page.route('**/api/services/platform-apps/rollback', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Rollback triggered successfully',
          build_number: buildNumber,
        }),
      });
    });
  }

  /**
   * Mock rollback endpoint (alias for compatibility)
   */
  async mockAppRollback(status = 200) {
    return this.mockRollback(4, status);
  }

  /**
   * Mock Jenkins build info endpoint
   */
  async mockBuildInfo(buildInfo: any, status = 200) {
    await this.page.route('**/api/jenkins/build-info*', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(buildInfo),
      });
    });
  }

  /**
   * Mock Jenkins build logs endpoint
   */
  async mockBuildLogs(logs: string, status = 200) {
    await this.page.route('**/api/jenkins/build-logs*', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ logs }),
      });
    });
  }

  /**
   * Mock git provider status endpoint
   */
  async mockProviders(providers: any[], status = 200) {
    await this.page.route('**/api/auth/providers', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ providers }),
      });
    });
  }

  /**
   * Mock repository list for a provider
   */
  async mockRepositories(provider: string, repos: any[], status = 200) {
    await this.page.route(`**/api/${provider}/repositories`, async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ repositories: repos }),
      });
    });
  }

  /**
   * Mock branches for a specific repository
   */
  async mockBranches(provider: string, repoId: string, branches: any[], status = 200) {
    await this.page.route(`**/api/${provider}/repositories/${repoId}/branches`, async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ branches }),
      });
    });
  }

  /**
   * Mock all branches for repositories (wildcard matching)
   * This automatically returns branches from the repo object if available
   */
  async mockAllRepoBranches(repos: any[], status = 200) {
    await this.page.route('**/api/*/repositories/*/branches', async (route) => {
      const url = route.request().url();
      const matches = url.match(/api\/([^/]+)\/repositories\/([^/]+)\/branches/);
      
      if (matches) {
        const provider = matches[1];
        const repoId = matches[2];
        
        // Find the repository in the provided repos array
        const repo = repos.find(r => r.id === repoId);
        
        if (repo && repo.branches) {
          await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify({ branches: repo.branches }),
          });
        } else {
          // Return default branches if repo not found or has no branches
          await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify({ 
              branches: [
                { name: 'main', commitSha: 'abc123def456', protected: true },
                { name: 'develop', commitSha: 'def456abc789', protected: false },
              ] 
            }),
          });
        }
      } else {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Repository not found' }),
        });
      }
    });
  }

  /**
   * Mock app metrics endpoint
   */
  async mockMetrics(metrics: any, status = 200) {
    await this.page.route('**/api/services/platform-apps/metrics*', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(metrics),
      });
    });
  }

  /**
   * Mock app metrics endpoint (alias for compatibility)
   */
  async mockAppMetrics(metrics: any, status = 200) {
    return this.mockMetrics(metrics, status);
  }

  /**
   * Mock app health endpoint
   */
  async mockHealth(health: any, status = 200) {
    await this.page.route('**/api/services/platform-apps/health*', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(health),
      });
    });
  }

  /**
   * Mock runtime logs endpoint
   */
  async mockRuntimeLogs(logs: string, status = 200) {
    await this.page.route('**/api/services/platform-apps/logs*', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ logs }),
      });
    });
  }

  /**
   * Mock pods status endpoint
   */
  async mockPods(pods: any[], status = 200) {
    await this.page.route('**/api/services/platform-apps/pods*', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ pods }),
      });
    });
  }

  /**
   * Mock pricing endpoint
   */
  async mockPricing(pricing: any, status = 200) {
    await this.page.route('**/api/services/platform-apps/prices', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ prices: pricing }),
      });
    });
  }

  /**
   * Generic error mock for any endpoint
   */
  async mockError(endpoint: string, status: number, error: string) {
    await this.page.route(`**${endpoint}`, async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error }),
      });
    });
  }

  /**
   * Clear all route mocks
   */
  async clearMocks() {
    await this.page.unroute('**/*');
  }
}
