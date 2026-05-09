# Cloud Services

Production web platform built with Next.js, Supabase, and Jenkins-driven Kubernetes deployment pipelines.

## Quick Start (App)

```bash
npm ci
npm run dev
```

App runs on [http://localhost:3000](http://localhost:3000).

## Deployment/CI Setup

For reproducible Jenkins setup (container, plugins, pod template, required credentials), use:
- [`infra/jenkins/README.md`](infra/jenkins/README.md)

For existing container inventory/report tooling:
- [`infra/jenkins/JENKINS_CONTAINERS_README.md`](infra/jenkins/JENKINS_CONTAINERS_README.md)

## Supabase

Database migrations are versioned in:
- `supabase/migrations/`

Apply them to a target database with Supabase CLI:

```bash
supabase db push --db-url "postgresql://postgres:<password>@<host>:5432/postgres"
```
