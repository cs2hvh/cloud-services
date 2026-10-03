import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/lib/openapi/init';

/**
 * The App Platform's public endpoints.
 *
 * Everything here authenticates with an `sk_` API key, exactly as the rest of
 * this reference does, EXCEPT the deploy hook — whose secret URL is its own
 * credential and which therefore takes no key at all.
 *
 * A key acts as the person who created it and gets precisely the rows they
 * would see in the dashboard; the database applies the same policies either
 * way. So an endpoint listed here needs no separate permission notes: if you
 * cannot do it in the browser, the key cannot do it.
 *
 * NOT LISTED, deliberately: GET and POST /api/v2/projects/{ref}/deployments,
 * which still accept a dashboard session only and answer 401 to a key. Listing
 * them would send integrators to an endpoint that cannot work. Deploy through
 * /deployments/trigger and read status through /deployments/{ref} instead.
 *
 * The error envelope here is nested — { error: { code, message } } — unlike
 * v1's flat one, so it has its own schema rather than reusing ErrorResponse.
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

// ── shared pieces ───────────────────────────────────────────────────────

const projectRefParam = z.object({
  ref: z.string().regex(/^prj-[0-9a-f]{12}$/).openapi({
    example: 'prj-d0ec7956eadf',
    description: 'The app\'s ref, as returned when it was created.',
  }),
});

const deploymentRefParam = z.object({
  ref: z.string().regex(/^dpl-[0-9a-f]{12}$/).openapi({
    example: 'dpl-6a2df67a6cf0',
    description: 'The deployment\'s ref.',
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

/** Sent whenever the key is missing, malformed, revoked, or its account is suspended. */
const unauthenticated = errorResponse(
  'The API key is missing, invalid, revoked, or the account is suspended.',
  'unauthenticated',
  'Sign in to continue.',
);

/**
 * A ref the key's owner cannot see is reported as absent, never as forbidden —
 * so this status cannot be used to discover that another team's app exists.
 */
const notFound = (what: string) =>
  errorResponse(`No such ${what}, or it belongs to a team this key cannot see.`, 'not_found', `${what} not found.`);

const ok = <T extends z.ZodTypeAny>(description: string, schema: T, example: unknown) => ({
  description,
  content: { 'application/json': { schema, example } },
});

// ── response schemas ────────────────────────────────────────────────────

const MeSchema = z
  .object({
    user: z.object({
      id: z.string().openapi({ example: 'fa9e8802-f59b-45d1-b9ee-2d83ce40d955' }),
      email: z
        .string()
        .nullable()
        .openapi({ description: 'Always null for an API key: a key resolves to an account, not to a signed-in session.' }),
    }),
    team: z.object({
      ref: z.string().openapi({ example: 'team-092103f179a4' }),
      slug: z.string().openapi({ example: 'harshit-hv' }),
      name: z.string().openapi({ example: 'harshit-hv' }),
    }),
  })
  .openapi('AppPlatformMe');

const InstallationsSchema = z
  .object({
    installations: z.array(
      z.object({
        id: z.string().openapi({ example: '156779383', description: 'Pass this as `connectionId` when creating an app.' }),
        provider: z.enum(['github', 'gitlab', 'bitbucket']).openapi({ example: 'github' }),
        account: z.string().nullable().openapi({ example: 'acme' }),
        accountType: z.string().nullable().openapi({ example: 'User' }),
      }),
    ),
    canConnectNew: z.boolean().openapi({ example: true }),
    connectUrl: z.string().openapi({ example: '/api/v2/git/connect', description: 'Open in a browser to connect another account.' }),
  })
  .openapi('GitConnections');

const ReposSchema = z
  .object({
    connected: z.boolean().openapi({ example: true }),
    repos: z.array(
      z.object({
        fullName: z.string().openapi({ example: 'acme/web' }),
        private: z.boolean().openapi({ example: false }),
        defaultBranch: z.string().nullable().openapi({ example: 'main' }),
        provider: z.string().openapi({ example: 'github' }),
      }),
    ),
  })
  .openapi('DeployableRepos');

const ProjectSummarySchema = z.object({
  ref: z.string().openapi({ example: 'prj-d0ec7956eadf' }),
  name: z.string().openapi({ example: 'api-e2e-test' }),
  slug: z.string().openapi({ example: 'api-e2e-test' }),
  repo: z.string().nullable().openapi({ example: 'acme/web' }),
  productionBranch: z.string().nullable().openapi({ example: 'main' }),
  tier: z.string().openapi({ example: 'starter' }),
  instances: z.number().int().openapi({ example: 1 }),
  hostname: z.string().nullable().openapi({ example: 'v2-api-e2e-test.ahurasense.com' }),
  state: z.string().nullable().openapi({ example: 'ready', description: 'State of the newest deployment.' }),
  lastDeployedAt: z.string().nullable().openapi({ example: '2026-10-03T17:46:55.087Z' }),
  previews: z.number().int().openapi({ example: 0 }),
});

const ProjectListSchema = z
  .object({ projects: z.array(ProjectSummarySchema), count: z.number().int().openapi({ example: 3 }) })
  .openapi('AppList');

const ProjectDetailSchema = z
  .object({
    project: z.object({
      ref: z.string().openapi({ example: 'prj-d0ec7956eadf' }),
      name: z.string().openapi({ example: 'api-e2e-test' }),
      slug: z.string().openapi({ example: 'api-e2e-test' }),
      repo: z.object({
        provider: z.string().openapi({ example: 'github' }),
        fullName: z.string().openapi({ example: 'acme/web' }),
        productionBranch: z.string().openapi({ example: 'main' }),
        rootDirectory: z.string().nullable(),
        installed: z.boolean().openapi({ example: true, description: 'Whether the git connection can still read it.' }),
      }),
      sizing: z.object({
        tier: z.string().openapi({ example: 'starter' }),
        label: z.string().openapi({ example: 'Starter' }),
        memoryMib: z.number().int().openapi({ example: 512 }),
        vcpu: z.number().openapi({ example: 1 }),
        instanceCount: z.number().int().openapi({ example: 1 }),
        priceUsd: z.number().openapi({ example: 7 }),
      }),
      team: z.object({ ref: z.string(), slug: z.string(), name: z.string() }),
      createdAt: z.string().openapi({ example: '2026-10-03T17:36:16.877Z' }),
    }),
  })
  .openapi('AppPlatformApp');

const CreateProjectRequestSchema = z
  .object({
    repo: z.string().openapi({ example: 'acme/web', description: '`owner/repo`. On GitLab this may include subgroups.' }),
    provider: z.enum(['github', 'gitlab', 'bitbucket']).openapi({ example: 'github' }),
    connectionId: z.string().openapi({
      example: '156779383',
      description: 'From GET /api/v2/git/installations. Must belong to your team; the repository is read through it.',
    }),
    branch: z.string().optional().openapi({ example: 'main', description: 'Production branch. Defaults to `main`.' }),
    name: z.string().optional().openapi({
      example: 'web',
      description: 'Sets the app\'s address. Defaults to the repository name. Must be unique within your team.',
    }),
    rootDirectory: z.string().optional().openapi({ example: 'apps/web', description: 'For a monorepo.' }),
    tier: z.string().optional().openapi({ example: 'starter', description: 'Defaults to `starter`.' }),
    instances: z.number().int().optional().openapi({ example: 1, description: 'Defaults to 1.' }),
  })
  .openapi('CreateAppRequest');

const EnvListSchema = z
  .object({
    vars: z.array(
      z.object({
        key: z.string().openapi({ example: 'DATABASE_URL' }),
        isPublic: z.boolean().openapi({ example: false, description: 'True for NEXT_PUBLIC_ / PUBLIC_ names, which reach the browser.' }),
        scope: z.string().openapi({ example: 'all' }),
        updatedAt: z.string().openapi({ example: '2026-10-03T17:36:33.567Z' }),
      }),
    ),
  })
  .openapi('EnvVarList');

const DeploymentSchema = z
  .object({
    deployment: z.object({
      ref: z.string().openapi({ example: 'dpl-6a2df67a6cf0' }),
      state: z
        .enum(['queued', 'building', 'publishing', 'ready', 'error'])
        .openapi({ example: 'ready', description: 'Terminal states are `ready` and `error`.' }),
      isTerminal: z.boolean().openapi({ example: true }),
      trigger: z.string().openapi({ example: 'redeploy' }),
      commit: z.object({
        sha: z.string().nullable().openapi({ example: 'e3c659e6ae9f0849f15e9308b904eb3e39087e38' }),
        shortSha: z.string().nullable().openapi({ example: 'e3c659e' }),
        ref: z.string().nullable().openapi({ example: 'main' }),
      }),
      error: z.string().nullable().openapi({ description: 'Why it failed, when state is `error`.' }),
      timing: z.object({
        queuedAt: z.string().nullable(),
        readyAt: z.string().nullable(),
        durationMs: z.number().nullable().openapi({ example: 591247 }),
      }),
    }),
    servedBy: z.array(
      z.object({
        hostname: z.string().openapi({ example: 'v2-api-e2e-test.ahurasense.com' }),
        url: z.string().openapi({ example: 'https://v2-api-e2e-test.ahurasense.com' }),
        kind: z.string().openapi({ example: 'production' }),
      }),
    ),
    isLive: z.boolean().openapi({ example: true, description: 'Whether this deployment is the one currently serving.' }),
  })
  .openapi('AppPlatformDeployment');

const LogsSchema = z
  .object({
    ref: z.string().openapi({ example: 'dpl-6a2df67a6cf0' }),
    state: z.string().openapi({ example: 'ready' }),
    lines: z.array(z.string()).openapi({ description: 'Build output, oldest first.' }),
    offset: z.number().int().openapi({ example: 0 }),
    total: z.number().int().openapi({ example: 358 }),
    hasMore: z.boolean().openapi({ example: false }),
    alterationNotice: z.string().openapi({ example: 'Only build output is shown.' }),
  })
  .openapi('BuildLog');

// ── registration ────────────────────────────────────────────────────────

export function registerAppPlatformPaths(registry: OpenAPIRegistry) {
  const keyed = {
    tags: ['App Platform'],
    security: [{ bearerAuth: [] }],
  };

  // ---- who am I, and what can I deploy ----

  registry.registerPath({
    ...keyed,
    method: 'get',
    path: '/api/v2/me',
    summary: 'Who this key belongs to',
    description:
      'The account the key acts as, and the team that owns its apps. A good first call to check a key works.',
    responses: {
      200: ok('The key\'s owner and team.', MeSchema, {
        user: { id: 'fa9e8802-f59b-45d1-b9ee-2d83ce40d955', email: null },
        team: { ref: 'team-092103f179a4', slug: 'acme', name: 'acme' },
      }),
      401: unauthenticated,
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'get',
    path: '/api/v2/git/installations',
    summary: 'List connected git accounts',
    description: [
      'Each entry\'s `id` is the `connectionId` you pass when creating an app, so a script never has to hard-code it.',
      '',
      'Connecting an account is the one step that cannot be an API call: it is the provider\'s own consent screen (installing the GitHub App, or authorizing GitLab or Bitbucket), so it happens once in a browser. Everything after that is here.',
    ].join('\n'),
    responses: {
      200: ok('Connected accounts.', InstallationsSchema, {
        installations: [{ id: '156779383', provider: 'github', account: 'acme', accountType: 'User' }],
        canConnectNew: true,
        connectUrl: '/api/v2/git/connect',
      }),
      401: unauthenticated,
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'get',
    path: '/api/v2/repos',
    summary: 'List repositories you can deploy',
    description: 'Every repository the connected accounts can read, across all providers.',
    responses: {
      200: ok('Deployable repositories.', ReposSchema, {
        connected: true,
        repos: [{ fullName: 'acme/web', private: false, defaultBranch: 'main', provider: 'github' }],
      }),
      401: unauthenticated,
    },
  });

  // ---- apps ----

  registry.registerPath({
    ...keyed,
    method: 'get',
    path: '/api/v2/projects',
    summary: 'List your apps',
    responses: {
      200: ok('Your team\'s apps, with the state of each one\'s newest deployment.', ProjectListSchema, {
        projects: [
          {
            ref: 'prj-d0ec7956eadf',
            name: 'web',
            slug: 'web',
            repo: 'acme/web',
            productionBranch: 'main',
            tier: 'starter',
            instances: 1,
            hostname: 'v2-web.ahurasense.com',
            state: 'ready',
            lastDeployedAt: '2026-10-03T17:46:55.087Z',
            previews: 0,
          },
        ],
        count: 1,
      }),
      401: unauthenticated,
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'post',
    path: '/api/v2/projects',
    summary: 'Create an app',
    description: [
      'Creates the app and its production environment. It does NOT deploy — call `/deployments/trigger` next, or push to the production branch.',
      '',
      'The app gets an `https://v2-<name>.ahurasense.com` address immediately, with a certificate; `name` is what sets it.',
      '',
      '`connectionId` must be a git connection belonging to your team (see GET /api/v2/git/installations). This is checked before anything is created, because it selects the credential the build reads the repository with.',
      '',
      'Guide: [App Platform documentation](https://ahurasense.com/docs/apps).',
    ].join('\n'),
    request: { body: { content: { 'application/json': { schema: CreateProjectRequestSchema } } } },
    responses: {
      201: ok('The app was created.', ProjectDetailSchema, {
        project: {
          ref: 'prj-d0ec7956eadf',
          name: 'web',
          slug: 'web',
          repo_full_name: 'acme/web',
          production_branch: 'main',
          tier: 'starter',
          instance_count: 1,
        },
      }),
      400: errorResponse(
        'A field is missing or malformed — for example a `connectionId` your team does not hold.',
        'invalid_request',
        'That github connection is not available to your account.',
      ),
      401: unauthenticated,
      409: errorResponse(
        'You already have an app with that name. The name sets the address, so two apps cannot share one.',
        'conflict',
        'You already have an app called "web". Give this one a different name.',
      ),
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'get',
    path: '/api/v2/projects/{ref}',
    summary: 'Get an app',
    request: { params: projectRefParam },
    responses: {
      200: ok('The app, its repository, sizing and team.', ProjectDetailSchema, {
        project: {
          ref: 'prj-d0ec7956eadf',
          name: 'web',
          slug: 'web',
          repo: { provider: 'github', fullName: 'acme/web', productionBranch: 'main', rootDirectory: null, installed: true },
          sizing: { tier: 'starter', label: 'Starter', memoryMib: 512, vcpu: 1, instanceCount: 1, priceUsd: 7 },
          team: { ref: 'team-092103f179a4', slug: 'acme', name: 'acme' },
          createdAt: '2026-10-03T17:36:16.877Z',
        },
      }),
      401: unauthenticated,
      404: notFound('App'),
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'patch',
    path: '/api/v2/projects/{ref}',
    summary: 'Change an app\'s settings',
    description:
      'Send only the fields you want to change. Renaming changes the app\'s address. Set `deployOnPush` to false to make a deploy hook the only way production deploys.',
    request: {
      params: projectRefParam,
      body: {
        content: {
          'application/json': {
            schema: z
              .object({
                name: z.string().optional(),
                productionBranch: z.string().optional(),
                rootDirectory: z.string().nullable().optional(),
                deployOnPush: z.boolean().optional().openapi({ example: false }),
                tier: z.string().optional(),
                instances: z.number().int().optional(),
              })
              .openapi('AppPlatformUpdateAppRequest'),
          },
        },
      },
    },
    responses: {
      200: ok('The updated app.', ProjectDetailSchema, { project: { ref: 'prj-d0ec7956eadf', name: 'web' } }),
      400: errorResponse('A field is malformed.', 'invalid_request', 'That is not a valid name.'),
      401: unauthenticated,
      404: notFound('App'),
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'delete',
    path: '/api/v2/projects/{ref}',
    summary: 'Delete an app',
    description:
      'Stops serving it, removes its deployments and domains, and releases its resources. This cannot be undone.',
    request: { params: projectRefParam },
    responses: {
      200: ok('The app was deleted.', z.object({ ok: z.boolean() }).openapi('DeleteAppResult'), { ok: true }),
      401: unauthenticated,
      404: notFound('App'),
    },
  });

  // ---- configuration ----

  registry.registerPath({
    ...keyed,
    method: 'get',
    path: '/api/v2/projects/{ref}/env',
    summary: 'List environment variable names',
    description:
      'Names only. Values are encrypted and are never returned by any endpoint — if you lose one, set it again.',
    request: { params: projectRefParam },
    responses: {
      200: ok('The variables set on this app, without their values.', EnvListSchema, {
        vars: [{ key: 'DATABASE_URL', isPublic: false, scope: 'all', updatedAt: '2026-10-03T17:36:33.567Z' }],
      }),
      401: unauthenticated,
      404: notFound('App'),
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'put',
    path: '/api/v2/projects/{ref}/env',
    summary: 'Set environment variables',
    description: [
      'Adds or replaces the variables you send and leaves the rest alone. Up to 100 per call; values up to 32,768 characters.',
      '',
      'A name beginning `NEXT_PUBLIC_` or `PUBLIC_` is built into your client code and is readable by anyone visiting the site. Never put a secret in one.',
      '',
      'Saving does not restart anything — the change takes effect on the next deployment.',
    ].join('\n'),
    request: {
      params: projectRefParam,
      body: {
        content: {
          'application/json': {
            schema: z
              .object({ vars: z.record(z.string()).openapi({ example: { DATABASE_URL: 'postgres://…' } }) })
              .openapi('SetEnvVarsRequest'),
          },
        },
      },
    },
    responses: {
      200: ok(
        'The variables were saved.',
        z.object({ saved: z.array(z.string()), note: z.string() }).openapi('SetEnvVarsResult'),
        { saved: ['DATABASE_URL'], note: 'Saved. Redeploy for these to take effect.' },
      ),
      400: errorResponse('A name or value is not acceptable.', 'invalid_request', '"1BAD" is not a valid variable name.'),
      401: unauthenticated,
      404: notFound('App'),
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'delete',
    path: '/api/v2/projects/{ref}/env',
    summary: 'Delete an environment variable',
    request: {
      params: projectRefParam,
      query: z.object({ key: z.string().openapi({ example: 'DATABASE_URL' }) }),
    },
    responses: {
      200: ok('The variable was removed.', z.object({ deleted: z.string() }).openapi('DeleteEnvVarResult'), {
        deleted: 'DATABASE_URL',
      }),
      400: errorResponse('No usable `key` was given.', 'invalid_request', 'Give a valid ?key= to delete.'),
      401: unauthenticated,
      404: notFound('App'),
    },
  });

  // ---- deploying ----

  registry.registerPath({
    ...keyed,
    method: 'post',
    path: '/api/v2/projects/{ref}/deployments/trigger',
    summary: 'Deploy',
    description: [
      'Builds and deploys the production branch at its current head. Returns as soon as the deployment is queued; poll `/api/v2/deployments/{ref}` for the outcome.',
      '',
      'A healthy deploy usually takes four to ten minutes.',
    ].join('\n'),
    request: { params: projectRefParam },
    responses: {
      202: ok(
        'A deployment was queued.',
        z
          .object({
            deployment: z.object({ ref: z.string(), gitRef: z.string().nullable() }),
            status: z.string().openapi({ example: 'building' }),
          })
          .openapi('TriggeredDeployment'),
        { deployment: { ref: 'dpl-6a2df67a6cf0', gitRef: 'main' }, status: 'building' },
      ),
      401: unauthenticated,
      404: notFound('App'),
      409: errorResponse(
        'There is nowhere to deploy — the app has no production environment.',
        'conflict',
        'This project has no production environment, so there is nowhere to deploy.',
      ),
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'get',
    path: '/api/v2/deployments/{ref}',
    summary: 'Get a deployment',
    description:
      'Poll this after deploying. `state` reaches `ready` or `error`; `isTerminal` tells you when to stop. `servedBy` carries the addresses it answers on.',
    request: { params: deploymentRefParam },
    responses: {
      200: ok('The deployment, with its commit, timing and addresses.', DeploymentSchema, {
        deployment: {
          ref: 'dpl-6a2df67a6cf0',
          state: 'ready',
          isTerminal: true,
          trigger: 'redeploy',
          commit: { sha: 'e3c659e6ae9f0849f15e9308b904eb3e39087e38', shortSha: 'e3c659e', ref: 'main' },
          error: null,
          timing: { queuedAt: '2026-10-03T17:36:34.025Z', readyAt: '2026-10-03T17:46:55.087Z', durationMs: 591247 },
        },
        servedBy: [{ hostname: 'v2-web.ahurasense.com', url: 'https://v2-web.ahurasense.com', kind: 'production' }],
        isLive: true,
      }),
      401: unauthenticated,
      404: notFound('Deployment'),
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'get',
    path: '/api/v2/deployments/{ref}/logs',
    summary: 'Build log',
    description:
      'What the build printed. When a deployment fails because your build command failed, its own output is here.',
    request: { params: deploymentRefParam },
    responses: {
      200: ok('The build output.', LogsSchema, {
        ref: 'dpl-6a2df67a6cf0',
        state: 'ready',
        lines: ['build complete', '=== finishing: status=success ==='],
        offset: 0,
        total: 358,
        hasMore: false,
        alterationNotice: 'Only build output is shown.',
      }),
      401: unauthenticated,
      404: notFound('Deployment'),
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'get',
    path: '/api/v2/deployments/{ref}/runtime-logs',
    summary: 'Runtime logs',
    description:
      'What your running app has printed. This is where to look when a deployment reports `ready` but the app answers 500.',
    request: { params: deploymentRefParam },
    responses: {
      200: ok(
        'Recent output, per running instance.',
        z
          .object({
            ref: z.string(),
            state: z.string(),
            pods: z.array(z.object({ pod: z.string(), previous: z.boolean(), lines: z.array(z.string()) })),
          })
          .openapi('RuntimeLogs'),
        {
          ref: 'dpl-6a2df67a6cf0',
          state: 'ready',
          pods: [{ pod: 'dpl-6a2df67a6cf0-54c6557dc7-b9q6l', previous: false, lines: ['✓ Ready in 4.1s'] }],
        },
      ),
      401: unauthenticated,
      404: notFound('Deployment'),
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'post',
    path: '/api/v2/projects/{ref}/rollback',
    summary: 'Roll back to an earlier deployment',
    description:
      'Points the app\'s address at a deployment that already built, so there is nothing to rebuild and it takes effect in seconds.',
    request: {
      params: projectRefParam,
      body: {
        content: {
          'application/json': {
            schema: z
              .object({ deployment: z.string().openapi({ example: 'dpl-6a2df67a6cf0' }) })
              .openapi('RollbackRequest'),
          },
        },
      },
    },
    responses: {
      200: ok(
        'The app now serves that deployment. `changed` is false when it already did.',
        z.object({ ok: z.boolean(), changed: z.boolean(), deployment: z.string() }).openapi('RollbackResult'),
        { ok: true, changed: true, deployment: 'dpl-6a2df67a6cf0' },
      ),
      400: errorResponse('No usable deployment ref was given.', 'invalid_request', '`deployment` is required and must be a deployment ref.'),
      401: unauthenticated,
      404: notFound('App'),
    },
  });

  // ---- custom domains ----

  registry.registerPath({
    ...keyed,
    method: 'get',
    path: '/api/v2/projects/{ref}/domains',
    summary: 'List custom domains',
    request: { params: projectRefParam },
    responses: {
      200: ok(
        'The domains attached to this app and their verification state.',
        z
          .object({
            domains: z.array(
              z.object({
                ref: z.string().openapi({ example: 'dom-2f1c9a7b4e55' }),
                domain: z.string().openapi({ example: 'app.example.com' }),
                status: z.string().openapi({ example: 'active' }),
              }),
            ),
          })
          .openapi('DomainList'),
        { domains: [] },
      ),
      401: unauthenticated,
      404: notFound('App'),
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'post',
    path: '/api/v2/projects/{ref}/domains',
    summary: 'Add a custom domain',
    description: [
      'Claims the domain for this app and returns the DNS records to create.',
      '',
      'Creating those records is the second step that cannot be an API call here — they live at your DNS provider, not with us. If your DNS is on a provider with its own API, you can script that step there. The certificate issues once the records resolve.',
      '',
      'Guide: [Custom domains](https://ahurasense.com/docs/apps/domains).',
    ].join('\n'),
    request: {
      params: projectRefParam,
      body: {
        content: {
          'application/json': {
            schema: z
              .object({ domain: z.string().openapi({ example: 'app.example.com' }) })
              .openapi('AppPlatformAddDomainRequest'),
          },
        },
      },
    },
    responses: {
      200: ok(
        'The domain was claimed. Create the records it returns.',
        z
          .object({
            domain: z.object({ ref: z.string(), domain: z.string(), status: z.string() }),
            records: z.array(z.object({ type: z.string(), name: z.string(), value: z.string() })),
          })
          .openapi('AddDomainResult'),
        {
          domain: { ref: 'dom-2f1c9a7b4e55', domain: 'app.example.com', status: 'pending' },
          records: [{ type: 'CNAME', name: 'app.example.com', value: 'fallback.ahurasense.com' }],
        },
      ),
      400: errorResponse('Not a valid domain, or one that belongs to the platform.', 'invalid_request', 'That is not a valid domain name.'),
      401: unauthenticated,
      404: notFound('App'),
      409: errorResponse('That domain is already attached to an app.', 'conflict', 'That domain is already claimed.'),
    },
  });

  registry.registerPath({
    ...keyed,
    method: 'delete',
    path: '/api/v2/projects/{ref}/domains',
    summary: 'Remove a custom domain',
    description: 'It stops serving your app and its certificate is withdrawn. Delete the DNS records afterwards.',
    request: {
      params: projectRefParam,
      query: z.object({ domain: z.string().openapi({ example: 'dom-2f1c9a7b4e55', description: 'The domain\'s ref.' }) }),
    },
    responses: {
      200: ok('The domain was removed.', z.object({ ok: z.boolean() }).openapi('RemoveDomainResult'), { ok: true }),
      400: errorResponse('No domain ref was given.', 'invalid_request', 'A `domain` ref is required.'),
      401: unauthenticated,
      404: notFound('Domain'),
    },
  });

  // ---- the deploy hook: the one endpoint with no API key ----

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
    request: {
      params: z.object({
        token: z
          .string()
          .regex(/^dh_[A-Za-z0-9_-]{43}$/)
          .openapi({
            // Obviously not a real hook: the alphabet in order.
            example: 'dh_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG',
            description: 'The secret at the end of the hook URL. It starts with `dh_` and is shown once, when the hook is created.',
          }),
      }),
    },
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
