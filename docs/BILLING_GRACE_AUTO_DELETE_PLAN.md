# Billing Grace Period and Auto-Delete Plan (Current Architecture)

Last reviewed: 2026-04-16

## 1) Objective

When hourly billing hits insufficient balance for a service:

1. Start a 7-day grace period.
2. Notify user in-app and email.
3. If still underfunded after grace, auto-delete the service.
4. If topped up before expiry, cancel deletion and restore normal state.

## 2) Current System Facts (Validated in Code)

- Standalone repo `deep-aghera-001/credit-system-cron` runs every 5 minutes.
- Billing source tables:
  - `billing.active_kubernetes`
  - `billing.active_database`
  - `billing.active_objectspace`
  - `billing.active_spectrum`
  - `billing.active_platform_apps`
- Atomic RPC used by cron: `billing.bill_service_cycle_atomic(...)`.
- Important behavior: RPC deducts credits before advancing `last_billed_at`.
  - On `insufficient_credit`, timestamp does not advance.
  - Meaning: unpaid usage is not skipped while user is underfunded.
- Existing deletion services already include billing close + notifications:
  - `DatabaseService.deleteCluster(...)`
  - `KubernetesService.deleteCluster(...)`
  - `ObjectStorageService.deleteBucket(...)`
  - `SpectrumService.deleteApp(...)`
  - `PlatformAppService.deleteApp(...)`
- In-app notifications exist via `NotificationService` + `notifications` table.
- Email exists via `emailService` + `billingNotification` template.
- `notifications.action` is constrained to existing actions (`updated`, `failed`, etc.), so grace events should reuse those actions.

## 3) Is This Plan Standard and Flexible?

Yes. A lifecycle-state machine + idempotent outbox + staged cron processing is standard for metered billing systems.

Yes, it is flexible for your needs if we keep it generic per service row and avoid service-specific schema changes.

Two adjustments are required to make it production-safe in this codebase:

1. Add explicit service-id translation for delete handlers (details in section 7).
2. Add internal cron-auth API routes for side effects (notifications/email/deletion execution), because cron worker is isolated from app service modules.

## 4) Recommended Data Model

### 4.1 `billing.service_lifecycle`

Purpose: single source of truth for grace and deletion state.

Suggested columns:

- `id BIGSERIAL PRIMARY KEY`
- `service_table TEXT NOT NULL`
- `service_id UUID NOT NULL`
- `user_id UUID NOT NULL`
- `state TEXT NOT NULL` (`grace|deletion_scheduled|deleting|deleted|restored`)
- `grace_started_at TIMESTAMPTZ`
- `grace_expires_at TIMESTAMPTZ`
- `deletion_started_at TIMESTAMPTZ`
- `deleted_at TIMESTAMPTZ`
- `deletion_attempts INT NOT NULL DEFAULT 0`
- `last_error TEXT`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `UNIQUE(service_table, service_id)`

Recommended indexes:

- `(state, grace_expires_at)`
- `(user_id, state)`

### 4.2 `billing.notification_outbox`

Purpose: idempotent reminders and retry-safe delivery.

- `event_key TEXT UNIQUE NOT NULL`
- `event_type TEXT NOT NULL`
- `user_id UUID NOT NULL`
- `service_table TEXT`
- `service_id UUID`
- `payload JSONB`
- `status TEXT NOT NULL DEFAULT 'pending'`
- `attempts INT NOT NULL DEFAULT 0`
- `last_error TEXT`
- `processed_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

## 5) Cron Architecture (3 Stages)

Keep current billing loop and add two stages.

### Stage A: Billing Decision (existing + grace trigger)

For each service row:

- If RPC status = `charged`: clear unresolved failure markers as today.
- If RPC status = `insufficient_credit`:
  - upsert lifecycle row to `state='grace'` only if not already in grace/deleting/deleted.
  - set `grace_started_at=now()`, `grace_expires_at=now()+7 days`.
  - enqueue one outbox event: `grace_started:<table>:<service_id>`.

Policy decision (recommended):

- Grace starts on first insufficient event and does not extend on repeated failures.

### Stage B: Reminder Dispatch (new)

- For lifecycle rows in `state='grace'`, compute days/hours left.
- enqueue milestones (e.g. start, 3d, 1d, 6h).
- use deterministic `event_key` to prevent duplicate sends.
- cron calls internal route to deliver pending events.

### Stage C: Grace Expiry Deletion (new)

- select rows where `state='grace' AND grace_expires_at <= now()`.
- transition atomically:
  - `grace -> deletion_scheduled -> deleting`
- execute deletion handler.
- on success: mark `deleted`.
- on failure: increment attempts and retry with backoff until max retries.

## 6) Internal Routes (Cron-Auth)

Use `CRON_SECRET` + timing-safe compare, same style as `/api/domains/market/sync-contacts`.

Recommended routes:

- `POST /api/internal/billing/grace-events/process`
  - Reads `notification_outbox` pending events.
  - Sends in-app notification + email.
  - Marks outbox rows processed/failed.

- `POST /api/internal/billing/grace-delete/execute`
  - Input: `service_table`, `service_id`, `user_id`.
  - Executes service-specific deletion via existing service modules.
  - Returns normalized result for cron lifecycle update.

This avoids duplicating provider logic inside cron worker JS.

## 7) Service Deletion Mapping (Critical)

`service_id` in billing tables is not always the same identifier expected by delete services.

- `active_kubernetes`
  - `service_id` matches `clusters.cluster_id`.
  - call `KubernetesService.deleteCluster({ clusterId: service_id, userId, isAdmin: true })`.

- `active_objectspace`
  - `service_id` matches `object_spaces.id`.
  - call `ObjectStorageService.deleteBucket({ bucket_id: service_id, user_id: owner, is_admin: true, force: true })`.

- `active_platform_apps`
  - `service_id` matches `platform_apps.id`.
  - call `PlatformAppService.deleteApp({ appId: service_id, userId: owner, isAdmin: true })`.

- `active_database`
  - `service_id` is typically `database_cluster.id` (internal UUID), but delete flow needs `cluster_id` for DigitalOcean delete.
  - resolver step: lookup `database_cluster` by `id=service_id`, then call delete with `cluster_id`.

- `active_spectrum`
  - `service_id` is local `spectrum_apps.id`, but `SpectrumService.deleteApp` expects `spectrum_id`.
  - resolver step: lookup `spectrum_apps` by `id=service_id`, then call delete with `spectrum_id`.

Without these mapping resolvers, deletion can silently fail.

## 8) Balance Recovery Flow

After successful top-up events:

- Stripe webhook (`/api/billing/webhook`) already knows `userId`: trigger grace resolution.
- Crypto callback (`/api/billing/crypto-callback`) should also trigger recovery.
  - if current RPC does not return `user_id`, extend `process_deposit_callback` to return it.

Recommended helper:

- `billing.resolve_grace_for_user(p_user_id uuid, p_min_hours_coverage numeric default 1)`

Behavior:

- if user balance now covers at least configured minimum burn window:
  - move lifecycle `grace/deletion_scheduled -> restored` (or directly to removed row).
  - enqueue `grace_resolved` outbox event.

## 9) API Access Guard During Grace

Backend-first enforcement:

- For service mutation endpoints, block if lifecycle state is `grace` or `deletion_scheduled`.
- Return deterministic error code and expiry timestamp in metadata.
- UI can show countdown/banner from this metadata.

## 10) Safe Rollout Sequence

1. Add migrations (`service_lifecycle`, `notification_outbox`, indexes, optional RPC helpers).
2. Add internal cron-auth routes for event dispatch + deletion execution.
3. Update cron worker with stage A/B/C flow.
4. Add top-up recovery hook in Stripe and crypto callback.
5. Add mutation access guards.
6. Add dashboards/alerts for:
   - grace starts/day
   - deletions/day
   - deletion failures
   - outbox retries

## 11) Suggested Config

- `BILLING_GRACE_PERIOD_DAYS=7`
- `BILLING_REMINDER_OFFSETS_DAYS=7,3,1`
- `BILLING_FINAL_WARNING_HOURS=6`
- `BILLING_DELETE_MAX_RETRIES=5`
- `BILLING_DELETE_RETRY_BACKOFF_SECONDS=60`
- `BILLING_RECOVERY_MIN_HOURS_COVERAGE=1`

## 12) Must-Have Tests

- grace starts once per service on first `insufficient_credit`.
- repeated insufficient cycles do not duplicate start event.
- reminders are idempotent by `event_key`.
- top-up resolves grace and prevents deletion.
- expiry triggers exactly one deletion attempt at a time.
- per-service resolver mapping works for database and spectrum ID translation.
- concurrent cron runs do not double-schedule deletion.

## 13) Final Verdict

This plan is standard and flexible for your requirement.

To make it fully implementation-ready in your current codebase, keep the plan as-is and include:

1. ID translation logic in deletion handlers.
2. Internal cron-auth execution routes for side effects and deletion orchestration.
