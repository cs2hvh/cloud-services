/**
 * OpenAPI Registry for API v1
 * Registers all public API endpoints and schemas
 */
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';

import { registerAppPaths } from '@/lib/openapi/paths/apps';
import { registerDatabasePaths } from '@/lib/openapi/paths/databases';
import { registerDomainPaths } from '@/lib/openapi/paths/domains';
import { registerNetworkPaths } from '@/lib/openapi/paths/network';
import { registerProjectPaths } from '@/lib/openapi/paths/projects';
import { registerStoragePaths } from '@/lib/openapi/paths/storage';

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'API Key',
  description: 'API key authentication. Format: `Bearer sk_live_xxx` or `Bearer sk_test_xxx`',
});

registerAppPaths(registry);
registerProjectPaths(registry);
registerStoragePaths(registry);
registerNetworkPaths(registry);
registerDatabasePaths(registry);
registerDomainPaths(registry);

/**
 * Generate the complete OpenAPI document
 */
export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Cloud Services - API v1',
      version: '1.0.0',
      description: `
# Cloud Services REST API

A comprehensive REST API for managing cloud infrastructure, including platform apps, databases, Kubernetes clusters, and object storage.

## Authentication

All API requests require authentication using an API key. Include your API key in the \`Authorization\` header:

\`\`\`
Authorization: Bearer sk_live_YOUR_API_KEY
\`\`\`

You can generate API keys from your [dashboard settings](https://galaxyhvh.com/dashboard/settings/api-keys).

## Rate Limits

- **Free Plan:** 30 requests per minute per operation
- **Paid Plans:** Higher limits available

Rate limit headers are included in all responses:
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

## Getting Started

1. [Generate an API key](https://galaxyhvh.com/dashboard/settings/api-keys)
2. Make your first request:

\`\`\`bash
curl -H "Authorization: Bearer sk_live_xxx" \\
  https://galaxyhvh.com/api/v1/apps
\`\`\`

For more examples, see the API reference below.
      `.trim(),
      contact: {
        name: 'Cloud Services Support',
        email: 'support@galaxyhvh.com',
        url: 'https://galaxyhvh.com/support',
      },
      license: {
        name: 'Proprietary',
        url: 'https://galaxyhvh.com/terms',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://galaxyhvh.com',
        description: 'Production server',
      },
    ],
    tags: [
      {
        name: 'Platform Apps',
        description: 'Manage application deployments, containers, and infrastructure.',
      },
      {
        name: 'Projects',
        description: 'Manage projects used to organize cloud services and ownership.',
      },
      {
        name: 'Databases',
        description: 'Manage database clusters, databases, and users.',
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
    ],
  });
}
