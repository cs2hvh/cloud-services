/**
 * OpenAPI Registry for API v1
 * Registers all public API endpoints and schemas
 */
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';

import { registerAppPlatformPaths } from '@/lib/openapi/paths/app-platform';
import { registerAppPaths } from '@/lib/openapi/paths/apps';
import { registerBillingPaths } from '@/lib/openapi/paths/billing';
import { registerComputePaths } from '@/lib/openapi/paths/compute';
import { registerDatabasePaths } from '@/lib/openapi/paths/databases';
import { registerDomainPaths } from '@/lib/openapi/paths/domains';
import { registerKubernetesPaths } from '@/lib/openapi/paths/kubernetes';
import { registerNetworkPaths } from '@/lib/openapi/paths/network';
import { registerProjectPaths } from '@/lib/openapi/paths/projects';
import { registerResourcePaths } from '@/lib/openapi/paths/resources';
import { registerStoragePaths } from '@/lib/openapi/paths/storage';

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'API Key',
  description: 'API key authentication. Format: `Bearer sk_live_xxx` or `Bearer sk_test_xxx`',
});

registerAppPlatformPaths(registry);
registerAppPaths(registry);
registerBillingPaths(registry);
registerProjectPaths(registry);
registerResourcePaths(registry);
registerStoragePaths(registry);
registerNetworkPaths(registry);
registerComputePaths(registry);
registerDatabasePaths(registry);
registerKubernetesPaths(registry);
registerDomainPaths(registry);

/**
 * Generate the complete OpenAPI document
 */
export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'AhuraSense Cloud — API v1',
      version: '1.0.0',
      description: `
# AhuraSense Cloud REST API

A REST API for managing cloud infrastructure — compute, databases, Kubernetes clusters, object storage and domains — and for deploying apps on the App Platform.

## Authentication

All API requests require authentication using an API key. Include your API key in the \`Authorization\` header:

\`\`\`
Authorization: Bearer sk_live_YOUR_API_KEY
\`\`\`

You can generate API keys from your [dashboard settings](https://ahurasense.com/dashboard/settings/api-keys).

The same key drives the **App Platform**: create an app from a git repository, set its environment variables, deploy, read build and runtime logs, roll back, and attach a domain — all from your own code. A key acts as the person who created it and can do exactly what they can do in the dashboard, no more.

**Deploy hooks are the one exception.** A deploy hook's secret URL is its own credential, so it is called with no API key at all. See the [deploy hooks guide](https://ahurasense.com/docs/apps/deploy-hooks).

## Rate Limits

- **Free Plan:** 30 requests per minute per operation
- **Paid Plans:** Higher limits available

Rate limiting is enforced by v1 middleware on all authenticated endpoints.
Runtime responses include rate-limit headers:
- \`X-RateLimit-Limit\`: Maximum requests per window
- \`X-RateLimit-Remaining\`: Remaining requests in current window
- \`Retry-After\`: Seconds until rate limit resets (on 429 responses)

## Errors

The API uses standard HTTP status codes:

- \`200\`: Success
- \`400\`: Bad Request (validation error)
- \`401\`: Unauthorized (missing or invalid API key)
- \`403\`: Forbidden (insufficient permissions)
- \`404\`: Not Found
- \`429\`: Too Many Requests (rate limit exceeded)
- \`500\`: Internal Server Error

Error responses include details:

\`\`\`json
{
  "error": "Validation failed",
  "message": "Invalid request body",
  "details": {
    "field": "name",
    "issue": "Must be at least 3 characters"
  }
}
\`\`\`

App Platform endpoints nest the error instead:

\`\`\`json
{
  "error": {
    "code": "not_found",
    "message": "Deploy hook not found."
  }
}
\`\`\`

## Getting Started

1. [Generate an API key](https://ahurasense.com/dashboard/settings/api-keys)
2. Make your first request:

\`\`\`bash
curl -H "Authorization: Bearer sk_live_xxx" \\
  https://ahurasense.com/api/v1/projects
\`\`\`

For more examples, see the API reference below.
      `.trim(),
      contact: {
        name: 'AhuraSense Cloud Support',
        email: 'support@ahurasense.com',
        url: 'https://ahurasense.com/support',
      },
      license: {
        name: 'Proprietary',
        url: 'https://ahurasense.com/terms',
      },
    },
    servers: [
      {
        url: 'https://ahurasense.com',
        description: 'Production',
      },
    ],
    tags: [
      {
        name: 'App Platform',
        description:
          'Deploy apps from GitHub, GitLab or Bitbucket, from the dashboard or entirely from code. Create an app, set its configuration, deploy, follow the build, roll back and attach a domain with the endpoints below. Two steps stay outside the API on every platform: connecting a git account (the provider\'s own consent screen) and pointing DNS at us (records at your own provider). Guides: [App Platform documentation](https://ahurasense.com/docs/apps).',
      },
      {
        name: 'Projects',
        description: 'Manage projects used to organize cloud services and ownership.',
      },
      {
        name: 'Resources',
        description: 'List available product plans/resources and filter by type.',
      },
      {
        name: 'Compute',
        description: 'Manage virtual server instances: create, power, resize, rebuild, backups, and the region/type/image catalog.',
      },
      {
        name: 'Databases',
        description: 'Manage database clusters, databases, and users.',
      },
      {
        name: 'Kubernetes',
        description: 'Manage Kubernetes clusters and their lifecycle.',
      },
      {
        name: 'Object Storage',
        description: 'Manage S3-compatible object storage buckets for file storage and CDN.',
      },
      {
        name: 'Network DDoS (Spectrum)',
        description: 'Configure Cloudflare Spectrum for DDoS protection on Layer 4 protocols (TCP/UDP).',
      },
      {
        name: 'Domains',
        description: 'Manage custom domains, verification, activation, and operation status.',
      },
      {
        name: 'Domain Marketplace',
        description: 'Search, purchase, and track domain marketplace purchase requests.',
      },
      {
        name: 'Platform Apps (legacy)',
        description:
          'The previous generation of app hosting. These endpoints still work for apps on that platform, but those apps are not App Platform apps and do not appear on the dashboard\'s Apps page. For new integrations, use the [App Platform](https://ahurasense.com/docs/apps).',
      },
    ],
  });
}
