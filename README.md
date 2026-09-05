# AhuraCloud

Sovereign cloud platform: GPU pods, VPS compute, object storage, managed
inference, game servers, domains, and a platform-app PaaS. Next.js on a custom
server, Supabase Postgres, a Cloudflare Worker for the inference edge, and
Kubernetes workers on LKE.

**Operators start at [docs/PRODUCTION.md](docs/PRODUCTION.md).** It is the map of
every deployable, what runs on a schedule, and how to bring the platform up.

## Run it locally

```bash
npm install
npm run dev
```

The app serves on http://localhost:3000.

`npm run dev` starts the **custom server** (`server.ts`), which adds the VPS VNC
WebSocket proxy and the in-process build workers on top of Next. `npm run dev:next`
runs Next alone without either. The distinction matters in production too; see
[PRODUCTION.md §3](docs/PRODUCTION.md).

You need a root `.env` before the app is useful. There is no `.env.example`;
the variable list lives in [PRODUCTION.md §11](docs/PRODUCTION.md). A local Redis
(`docker run -p 6379:6379 redis:7`) is needed for build workers.

## Checks

```bash
npx tsc --noEmit    # this is what gates the deploy
npm test            # vitest, currently NOT gating
npm run lint
npm run test:e2e    # playwright
```

## Database

Migrations are versioned in `supabase/migrations/` (228 files).

Read [docs/SUPABASE_MIGRATION_RUNBOOK.md](docs/SUPABASE_MIGRATION_RUNBOOK.md)
before adding one. Applying SQL without committing the matching file produces
drift that has twice cost real reconstruction work, and
`.github/workflows/migration-drift.yml` will catch it on push.

## Deployment

Pushing to `dev` deploys to production over SSH via
`.github/workflows/deploy.yml`. There is no staging environment, and the unit
test job does not gate the deploy. [PRODUCTION.md §9](docs/PRODUCTION.md) spells
out exactly what does and does not block a release.

Jenkins is still used, but only for the **platform-app** build pipeline
(`infra/jenkins/README.md`), not for deploying this application.

## Documentation

| Where | What |
|---|---|
| [docs/PRODUCTION.md](docs/PRODUCTION.md) | operator runbook, start here |
| [docs/architecture/](docs/architecture/) | how the platform works, eight documents |
| [docs/worklog/](docs/worklog/) | dated day logs of significant changes |
| [docs/inference/](docs/inference/) | inference gateway deep-dives |
