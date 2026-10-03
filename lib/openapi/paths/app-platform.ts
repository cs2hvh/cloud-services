import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/lib/openapi/init';

/**
 * The App Platform's public endpoints.
 *
 * Today that is the deploy hook alone, the one App Platform endpoint a script
 * can call. The rest of the App Platform API (apps, deployments, environment
 * variables, domains) authenticates with a dashboard session, not an API key,
 * so it is deliberately NOT listed here: documenting it beside the bearerAuth
 * scheme would send integrators to endpoints that answer 401. Add each one
 * here when it accepts API keys.
 *
 * Mirrors app/api/v2/hooks/deploy/[token]/route.ts. Its error envelope is
 * nested — { error: { code, message } } — unlike v1's flat one, so it has its
 * own schema rather than reusing ErrorResponseSchema.
 */

const AppPlatformErrorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'not_found', description: 'Error code.' }),
      message: z.string().openapi({ example: 'Deploy hook not found.', description: 'What went wrong.' }),
      retry_after: z
        .number()
        .int()
        .optional()
        .openapi({ example: 1680, description: 'Seconds to wait before calling again. Sent with 429 only.' }),
    }),
  })
  .openapi('AppPlatformError');

const DeployHookAcceptedSchema = z
  .object({
    deployment: z.object({
      ref: z.string().openapi({
        example: 'dpl-8e76876577a2',
        description: 'The deployment this call created or joined. Follow it in the dashboard.',
      }),
    }),
    status: z.enum(['queued', 'already_queued']).openapi({
      example: 'queued',
      description:
        '`queued`: a new deployment was created. `already_queued`: a deployment of the production branch was already waiting to build, so this call joined it instead of creating a second one.',
    }),
  })
  .openapi('DeployHookAccepted');

const tokenParam = z.object({
  token: z
    .string()
    .regex(/^dh_[A-Za-z0-9_-]{43}$/)
    .openapi({
      // Obviously not a real hook: the alphabet in order.
      example: 'dh_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG',
      description: 'The secret at the end of the hook URL. It starts with `dh_` and is shown once, when the hook is created.',
    }),
});

const errorResponse = (description: string, code: string, message: string) => ({
  description,
  content: {
    'application/json': {
      schema: AppPlatformErrorSchema,
      example: { error: { code, message } },
    },
  },
});

export function registerAppPlatformPaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: 'post',
    path: '/api/v2/hooks/deploy/{token}',
    tags: ['App Platform'],
    summary: 'Trigger a deploy hook',
    description: [
      "Deploys the app's production branch. Call it from CI once your tests pass, so production deploys only when your pipeline says so.",
      '',
      'The URL is the credential: send no API key and no body. Anyone holding the URL can deploy the configured branch and do nothing else, so store it as a CI secret.',
      '',
      'Create hooks in the dashboard: open the app and go to **Settings → Deploy hooks**. Only team owners and admins can create or revoke them.',
      '',
      'The call returns `202` as soon as a deployment is queued, without waiting for the build. Either way, the build behind `deployment.ref` starts after your call and checks out the production branch as it is at that moment, so it includes every commit pushed before you called.',
      '',
      '`GET` is refused with `405`, so a link preview or a crawler fetching the URL can never start a deploy.',
      '',
      '**Limits:** 30 calls per hook per hour, including ones that return `already_queued`, and 60 calls per minute from one IP address to any hook.',
      '',
      'Guide, with GitHub Actions, GitLab CI and Bitbucket examples: [Deploy hooks](https://ahurasense.com/docs/apps/deploy-hooks).',
    ].join('\n'),
    security: [],
    request: { params: tokenParam },
    responses: {
      202: {
        description: 'Accepted. A deployment of the production branch is queued.',
        content: {
          'application/json': {
            schema: DeployHookAcceptedSchema,
            example: { deployment: { ref: 'dpl-8e76876577a2' }, status: 'queued' },
          },
        },
      },
      404: errorResponse(
        'Not found. The URL is wrong, the hook was revoked, or its app was deleted. These look the same on purpose, so the endpoint never confirms which hooks exist.',
        'not_found',
        'Deploy hook not found.',
      ),
      409: errorResponse(
        'Conflict. The app has no production environment to deploy to. Contact support with the app name.',
        'conflict',
        'This app has no production environment, so there is nowhere to deploy.',
      ),
      410: errorResponse(
        'Gone. The person who created the hook has left the team, so the hook was revoked. Later calls return 404. Have a current owner or admin create a new hook.',
        'gone',
        "This deploy hook was created by someone who is no longer on the team, so it has been revoked. Create a new one in the app's settings.",
      ),
      429: {
        description: 'Too many calls. Wait for the number of seconds given, then retry, and check your pipeline for a loop.',
        headers: {
          'Retry-After': {
            description: 'Seconds to wait before calling again.',
            schema: { type: 'integer', example: 1680 },
          },
        },
        content: {
          'application/json': {
            schema: AppPlatformErrorSchema,
            example: {
              error: {
                code: 'rate_limited',
                message: 'This deploy hook has been called too often. Try again later.',
                retry_after: 1680,
              },
            },
          },
        },
      },
      500: errorResponse(
        'Something failed on our side, and no deployment was created. Retry; if it keeps happening, contact support.',
        'internal',
        'Could not start the deployment. Try again shortly.',
      ),
    },
  });
}
