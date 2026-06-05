# Platform App — Resize (Downgrade) + Custom Profiles

This document covers two features shipped together in the `feature/ai-inference` branch.

---

## Feature 1 — Allow Downgrade (resize in both directions)

### What changed

Previously, apps could only be resized upward (small → large). Downgrading was blocked at the API, service, and UI layers.

### Files changed

#### `app/api/services/platform-apps/resize/route.ts`
- **Before:** rejected any resize where `SIZE_ORDER[new_size] <= SIZE_ORDER[current_size]`
- **After:** only rejects when `new_size === current_size` (same tier)
- Balance check now skipped on downgrades — no reason to check if the user can afford a cheaper tier
- `SIZE_ORDER` now includes `custom: 6` so custom-profile apps don't crash on comparison
- JSDoc updated from "upsize only" → "upsize or downsize"

#### `lib/services/platform-app-service.ts`
- Same guard removed in `resizeApp()`
- `SIZE_ORDER` now includes `custom: 6`
- `CreateAppRequest.size` type extended to include `'custom'`

#### `components/dashboard/apps/app-resize-section.tsx`
- `SizeKey` type extended with `'custom'`
- `PLATFORM_APP_SIZE_SPECS` includes a `custom` fallback entry
- Cards now selectable in both directions (up and down from current)
- Smaller tiers show orange **Downgrade** badge; larger tiers show green **Upgrade** badge
- Confirmation banner before downgrade: orange warning with impact summary
- Button text changes: "Upgrade & Redeploy" (green) or "Downgrade & Redeploy" (orange)
- Success message after trigger: orange for downgrade, green for upgrade
- Custom-profile apps (`app.size === 'custom'`) see an info message instead of resize cards — resizing is admin-managed

#### `app/dashboard/services/apps/[id]/page.tsx`
- `resizeDirectionLabel` computed from `pendingResizeSize` vs `currentSize`:
  - `'Upgrading to'` / `'Downgrading to'` / `'Resizing to'` (fallback when direction unknown)
- Header label and in-progress status text are now direction-aware
- `deploymentMutationBlocked` includes `resizeInProgress` to close the window between API response and realtime status update
- `AppDetail` interface extended with `custom_spec` and `custom_hourly_rate`
- When `app.size === 'custom'`, header shows actual CPU/RAM from `app.custom_spec` instead of "Custom"

#### `lib/notifications/service.ts`
- `PLATFORM_APP_SIZE_ORDER` constant defined at module level (was an inline array — duplicate)
- `resized` action now produces direction-aware messages:
  - Upgrade: `"Application 'my-app' has been upgraded from small to large."`
  - Downgrade: `"Application 'my-app' has been downgraded from large to small."`
  - Notification title: "Application Upgraded" or "Application Downgraded"

### Resize flow end-to-end

```
User clicks size card (now any direction)
  → handleResize() in page.tsx
    → POST /api/services/platform-apps/resize
      → SIZE_ORDER check (only blocks same-size)
      → balance check skipped if downgrade
      → AppRuntimeMutationService.resize()
        → acquires mutation lock
        → creates platform_app_deployments record (trigger='resize', source.size, target.size)
        → JenkinsService.ensureResizeJob() → Jenkins resize-job
        → BuildPollingService polls Jenkins
          → on success: AppBuildSideEffectsService
            → settles elapsed usage at the old rate
            → atomically updates platform_apps.size and the billing rate/cursor
            → clamps custom_request_body_mb to new plan max (on downgrade)
            → lifts bandwidth restriction if new quota covers usage (on upgrade)
          → logResizeAudit() → AuditLog + direction-aware Notification
```

---

## Feature 2 — Custom Deployment Profiles

### What is a custom profile

A custom profile is an admin-assigned set of explicit K8s resources for enterprise customers who need more than XXLarge:

```
cpuRequest  / cpuLimit      e.g. '8' / '16'
memoryRequest / memoryLimit  e.g. '16Gi' / '32Gi'
replicas                     e.g. 8
```

Standard plans (small → xxlarge) use a size-key lookup table. Custom profiles bypass that lookup entirely and inject exact values into the same K8s manifest.

Users can request a custom profile only after reaching XXLarge. An admin approves an
explicit resource spec and hourly rate. Approval stores those values as pending; it
does not change the running app or its billing rate.

### Database changes

**Migration:** `supabase/migrations/20260605000001_add_custom_size_to_platform_apps.sql`

```sql
-- 1. Allow 'custom' as a valid size value
ALTER TABLE platform_apps ADD CONSTRAINT platform_apps_size_check
  CHECK (size IN ('small', 'medium', 'large', 'xlarge', 'xxlarge', 'custom'));

-- 2. Store the resource spec so every redeployment can recover it
ALTER TABLE platform_apps
  ADD COLUMN custom_spec        JSONB,       -- CustomProfileSpec JSON
  ADD COLUMN custom_hourly_rate NUMERIC(12,6), -- negotiated billing rate
  ADD COLUMN pending_custom_profile_request_id UUID,
  ADD COLUMN pending_custom_spec JSONB,
  ADD COLUMN pending_custom_hourly_rate NUMERIC(12,6);
```

The pending fields separate approval from activation. Auto-deploy and webhook builds
continue using the active standard profile until the user explicitly redeploys the
approved profile.

### Request and activation lifecycle

```
XXLarge app
  → user submits one pending request
  → admin rejects, or approves an explicit spec and hourly rate
  → approval writes pending_* fields; running resources and billing stay unchanged
  → user sees the approved resources/rate and starts a manual redeploy
  → API verifies balance for accrued old-rate usage plus one hour at the new rate
  → deployment records the approved request id and deploys pending_custom_spec
  → successful build atomically settles old-rate usage, updates the billing cursor/rate,
    promotes the pending spec/rate, and marks the request applied
  → failed build leaves the approved profile pending for retry
```

### Type definition

`CustomProfileSpec` is defined in `lib/jenkins/pipelines/utils.ts` alongside `AppSizeSpec`:

```ts
export type CustomProfileSpec = AppSizeSpec;
```

It is re-exported from `lib/jenkins/pipelines/index.ts` and imported as a named type across the service layer.

### Pipeline changes

#### `lib/jenkins/pipelines/utils.ts` — `resolveAppSize()` accepts override

```ts
export function resolveAppSize(
  sizeKey: string,
  minSize: string = 'small',
  sizeOverride?: Partial<AppSizeSpec>  // NEW
): AppSizeSpec {
  if (sizeOverride) return { ...APP_SIZE_SPECS.small, ...sizeOverride };
  // existing size-key lookup unchanged
}
```

When `sizeOverride` is provided the lookup table is bypassed entirely. Standard apps pass nothing — behaviour unchanged.

#### All 11 framework pipeline files (nodejs, express, python, nextjs, nuxtjs, vite-react, vue, angular, sveltekit, java, generic-docker)

Each file receives 3-line change:

```ts
// 1. Import AppSizeSpec
import { ..., AppSizeSpec } from './utils';

// 2. Accept sizeOverride as last parameter
export function createNodeJsPipeline(
  ...,
  healthcheckPath?: string,
  sizeOverride?: AppSizeSpec,   // NEW
): string {

// 3. Pass override to resolveAppSize
const { cpuRequest, cpuLimit, memoryRequest, memoryLimit, replicas } =
  resolveAppSize(size, 'small', sizeOverride);  // NEW: third arg
```

This means **any framework** (Next.js, Python, Java, etc.) can now deploy with custom resources. The build logic (Dockerfile generation, dependency management) stays framework-specific. Only the K8s resource spec changes.

#### `lib/services/jenkins.ts` — routing in `selectPipeline()`

```ts
// Convert CustomProfileSpec → Partial<AppSizeSpec> for pipeline override
const sizeOverride = customSpec ? {
  cpuRequest: customSpec.cpuRequest,
  cpuLimit: customSpec.cpuLimit,
  memoryRequest: customSpec.memoryRequest,
  memoryLimit: customSpec.memoryLimit,
  replicas: customSpec.replicas,
} : undefined;

// Every pipeline case now passes sizeOverride as the last argument
// Standard apps: sizeOverride is undefined → resolveAppSize uses size key
// Custom apps:   sizeOverride is set → resolveAppSize uses override values
```

`createJob()` and `updateJobConfig()` both accept the new `customSpec?: CustomProfileSpec` parameter, which is passed through to `selectPipeline()`.

### Service layer chain

```
lib/services/platform-app-service.ts   — CreateAppRequest accepts customSpec + customHourlyRate
  → lib/services/deployment.ts         — DeploymentConfig carries them; persists to DB at create
    → lib/services/jenkins.ts          — selectPipeline() converts to sizeOverride
      → framework pipeline             — resolveAppSize() uses override
        → K8s Deployment manifest      — exact CPU/RAM/replicas baked in
```

### Billing

`config/pricing.ts` — `getRatesForPlatformApp()` extended:

```ts
async function getRatesForPlatformApp(
  size: '...' | 'custom',
  customHourlyRate?: number,
): Promise<Rates> {
  if (size === 'custom') {
    return { initialCost: 0, hourlyRate: clampCurrencyAmount(customHourlyRate ?? 0) };
  }
  // standard product table lookup unchanged
}
```

Custom apps carry their negotiated rate directly. The rate changes only after the
approved deployment succeeds; elapsed time before activation stays at the old rate.

### Redeploy / auto-deploy / rollback

`lib/workers/build-worker.ts` reads `app.custom_spec` from the DB record and passes it to `AutoDeployService`:

```ts
customSpec: (app.custom_spec as CustomProfileSpec | null) ?? undefined,
```

`lib/services/auto-deploy.ts` passes it to `JenkinsService.updateJobConfig()`.

Once applied, every webhook trigger, manual redeploy, and rollback reads the active
custom spec from the database. Before activation, only the explicit manual redeploy
uses the pending spec.

### Admin API usage

`POST /api/services/platform-apps/create` — admin-only extra fields:

```json
{
  "name": "acme-production",
  "framework": "nextjs",
  "size": "custom",
  "custom_spec": {
    "cpuRequest": "8",
    "cpuLimit": "16",
    "memoryRequest": "16Gi",
    "memoryLimit": "32Gi",
    "replicas": 4
  },
  "custom_hourly_rate": 0.541
}
```

Non-admin requests containing `custom_spec` are rejected with `403`.

### UI behaviour for custom-profile apps

- Header shows actual CPU/RAM/replicas from `app.custom_spec` (not "Custom · Custom")
- Settings tab → Instance Size section shows: *"This app runs on a custom resource profile. Resizing is managed by your account team."*
- Standard resize cards are hidden
- All other features (logs, rollback, env vars, domains, build history) work identically

### Complete custom profile flow

```
Admin calls POST /api/services/platform-apps/create
  with custom_spec + custom_hourly_rate
    → create/route.ts extracts fields (admin only)
    → PlatformAppService.createApp()
      → getRatesForPlatformApp('custom', rate) → returns custom rate directly
      → ensureBalance() checks user has sufficient credits
      → DeploymentService.deploy()
        → Platform_Apps.create() persists custom_spec + custom_hourly_rate to DB
        → JenkinsService.createJob()
          → selectPipeline() computes sizeOverride from customSpec
          → framework pipeline runs with exact CPU/RAM/replicas
          → K8s Deployment applied
      → billing activated at custom rate

User redeploys / git push auto-deploy:
  → build-worker reads app.custom_spec from DB
  → passes to AutoDeployService → JenkinsService.updateJobConfig()
  → same pipeline runs with same resources — spec recovered from DB

User views app:
  → header shows "8 CPU · 16Gi" from custom_spec
  → resize section shows info message (no cards)
```

---

## Files summary

| File | Purpose |
|---|---|
| `supabase/migrations/20260605000001_...sql` | Add `custom` to size constraint; add `custom_spec` + `custom_hourly_rate` columns |
| `lib/jenkins/pipelines/utils.ts` | `resolveAppSize()` override; `CustomProfileSpec` type |
| `lib/jenkins/pipelines/index.ts` | Re-export `CustomProfileSpec` |
| `lib/jenkins/pipelines/*.ts` (×11) | Accept `sizeOverride?: AppSizeSpec`; pass to `resolveAppSize()` |
| `lib/services/jenkins.ts` | Convert `customSpec` → `sizeOverride`; pass through all pipeline calls |
| `lib/app-operations/integrations/jenkins-build.adapter.ts` | `customSpec` param on `createJobAndTrigger()` |
| `lib/services/deployment.ts` | `customSpec` + `customHourlyRate` in `DeploymentConfig`; persisted to DB |
| `lib/services/platform-app-service.ts` | `customSpec` + `customHourlyRate` in `CreateAppRequest`; passed to billing + deploy |
| `lib/services/auto-deploy.ts` | `customSpec` in `AutoDeployConfig`; passed to `updateJobConfig()` |
| `lib/workers/build-worker.ts` | Reads `app.custom_spec` from DB; passes to `AutoDeployService` |
| `config/pricing.ts` | `getRatesForPlatformApp()` handles `'custom'` size with direct rate |
| `app/api/services/platform-apps/create/route.ts` | Extracts `custom_spec` + `custom_hourly_rate` from body (admin only) |
| `app/api/services/platform-apps/resize/route.ts` | Allow downgrade; skip balance check on downgrade; `custom: 6` in SIZE_ORDER |
| `lib/supabase/types.ts` | `PlatformApp` extended with `custom_spec` + `custom_hourly_rate` |
| `app/dashboard/services/apps/[id]/page.tsx` | Direction-aware resize labels; custom spec display in header |
| `components/dashboard/apps/app-resize-section.tsx` | Downgrade UI (orange badge/button/warning); custom profile info message |
