# Platform App Bandwidth Lifecycle

This applies to any network transfer that touches deployed app infrastructure,
not only first-party object storage.

## Traffic Model

- Browser to third-party storage directly: not counted by platform app bandwidth.
- Browser to app to third-party storage: counted.
- Third-party storage to app to browser: counted.
- App to database/object storage over the same private network: counted by pod
  counters today, but can be discounted later if ingress/service-mesh logs split
  private and public traffic.

## Quotas

Plan quotas come from `products.resources` for `platform-apps` products:

```json
{
  "bandwidth_gb": 1000,
  "ingress_gb": 500,
  "egress_gb": 500,
  "max_request_body_mb": 100,
  "overage_per_gb": 0.05,
  "overage_limit_gb": 500
}
```

Defaults are used when a plan does not define bandwidth:

| Size | Included monthly transfer | Max request body |
| --- | ---: | ---: |
| small | 100 GB | 25 MB |
| medium | 250 GB | 50 MB |
| large | 1 TB | 100 MB |
| xlarge | 2 TB | 250 MB |
| xxlarge | 5 TB | 500 MB |

## Lifecycle

| Usage | Lifecycle state | User notification | Platform action |
| --- | --- | --- | --- |
| < 80% | `ok` | none | allow |
| >= 80% | `warning` | in-app warning | allow |
| >= 90% | `critical` | in-app warning | allow |
| >= 100%, no overage, < 105% | `critical` | limit reached warning | allow (grace buffer) |
| >= 105%, no overage | `restricted` | error notification | restrict new public traffic |
| >= 100%, overage enabled, under cap | `overage` | overage warning | allow and bill overage |
| overage cap exceeded | `restricted` | error notification | restrict new public traffic |
| Back under quota | `ok` | restored notification | remove restriction |

The 5% grace buffer (`RESTRICTION_GRACE_PERCENT = 105`) prevents instant block when the
first cron sample tips just over 100%. The overage cap (`overageLimitBytes`) prevents
a single app from running an unbounded bill; defaults by size: small=50 GB, medium=100 GB,
large=500 GB, xlarge=1 TB, xxlarge=2 TB.

Events are idempotent per app/month in `platform_app_bandwidth_events`, so cron
can run repeatedly without spamming users.

## Scenario Walkthroughs

These examples describe the expected behavior for a real app named `media-api`
owned by user `u_123`.

### 1. User creates an app

Example:

- User balance: `$20.00`
- App size: `small`
- Included platform app bandwidth: `100 GB/month`
- Initial app setup cost: from platform app pricing
- Hourly app rate: from platform app pricing

Flow:

1. `POST /api/services/platform-apps/create` validates ownership, app limits,
   name uniqueness, repository token, and current balance.
2. The app row is created as `pending`; DNS and Jenkins build are started.
3. No active hourly billing row is created yet.
4. When the first deployment becomes healthy, `PlatformAppBillingService`
   activates billing exactly once.
5. `Billing.activate_platform_app` deducts the initial setup cost, records a
   setup transaction, and inserts `billing.active_platform_apps`.
6. `AppBuildSideEffectsService` syncs the app's NGINX `proxy-body-size` limit
   based on the selected plan.
7. Bandwidth usage starts at zero. The monthly row is created by the next
   bandwidth sync, dashboard refresh, or bandwidth pack purchase.

If the first build fails, active billing is not started.

### 2. User uploads files through the deployed app

Example:

- Visitor uploads a `200 MB` video to `media-api`.
- The app then forwards that file to S3, R2, MinIO, or any other external store.

What counts:

- Browser to app: counted as ingress.
- App to external storage: counted as egress.
- Later app to browser download/proxy: counted again as egress.
- Browser directly to external storage using that provider's signed URL: not
  counted by platform app bandwidth because traffic does not touch the app pod.

Flow:

1. Prometheus exposes pod network counters.
2. Cron calls `/api/internal/platform-apps/bandwidth/sync`.
3. The sync reads current counters and previous saved counters.
4. Only the delta since the last sample is added to the current monthly row.
5. The lifecycle status is recalculated against included quota plus purchased
   bandwidth packs.

### 3. User reaches warning/critical thresholds

Example:

- Included quota: `100 GB`
- Current total: `82 GB`

Flow:

1. Sync stores `82 GB`.
2. Lifecycle becomes `warning`.
3. A single `warning_80` event is inserted for that app/month.
4. The user receives one notification and sees the dashboard warning.

At `92 GB`, lifecycle becomes `critical` and a `critical_90` notification is
sent once for that app/month.

### 4. User exceeds quota without overage enabled

Example:

- Included quota: `100 GB`
- Current total: `103 GB`
- Overage disabled

Flow:

1. Lifecycle remains `critical` inside the 5% grace window.
2. User receives the limit-reached warning.
3. Traffic is still allowed.

At `106 GB`:

1. Lifecycle becomes `restricted`.
2. Sync patches the app's Kubernetes Ingress with the managed bandwidth block.
3. New public requests receive HTTP `429`.
4. User receives the traffic-restricted notification.

Existing files already stored by the user's app are not deleted by this system.
Only new public traffic through the app is blocked.

### 5. User buys a bandwidth pack

Example:

- Current usage: `106 GB`
- Included quota: `100 GB`
- User buys `100 GB` pack for `$5.00`
- Effective quota becomes `200 GB`

Flow:

1. `POST /api/services/platform-apps/bandwidth/purchase` verifies app ownership.
2. The user's credit balance is atomically deducted.
3. A purchase transaction is recorded.
4. `purchased_bytes` is incremented on the current monthly usage row.
5. The updated summary is returned to the dashboard.
6. If the app was restricted and is now under effective quota, the ingress block
   is removed immediately and the row is marked restored.

Purchased bandwidth applies only to the current billing period.

### 6. Overage-enabled plan

Example:

- Included quota: `1 TB`
- Overage rate: `$0.05/GB`
- Current total: `1.1 TB`

Flow:

1. Lifecycle becomes `overage`.
2. Sync charges only newly accrued overage bytes that have not already been
   billed.
3. Charged bytes and charged amount are stored in usage row metadata to prevent
   double charging on later cron runs.
4. A usage transaction is recorded in billing transactions.

If the overage charge fails because the account has insufficient balance:

1. The row is moved to `restricted`.
2. Metadata stores `restriction_reason = overage_billing_failed`.
3. The normal ingress restriction flow blocks public traffic.

If the plan's overage cap is exceeded, traffic is restricted even if overage is
enabled.

### 7. User resizes the app

Example:

- App moves from `small` to `large`.
- Quota moves from default `100 GB` to default `1 TB`.

Flow:

1. Resize request validates ownership and only allows upsizing.
2. Jenkins performs the resize/deploy operation.
3. Only after confirmed success, `AppBuildSideEffectsService` updates the app
   size and active billing hourly rate.
4. The NGINX request body limit is updated to the new plan limit.
5. If the larger quota brings a restricted app back under limit, the ingress
   restriction is removed.

If the resize fails, the side-effect service reverts the app size and keeps the
old billing rate.

### 8. User deletes the app

Flow:

1. Delete request verifies ownership or admin privileges.
2. A mutation lock prevents concurrent resize/deploy/delete changes.
3. Database and object storage integrations are unlinked.
4. Custom domains, DNS, Jenkins jobs, and Kubernetes resources are cleaned up.
5. The `platform_apps` row is deleted.
6. Bandwidth usage, bandwidth events, and pod counter rows cascade-delete through
   their `app_id` foreign keys.
7. `Billing.close_active_service("platform_apps")` computes the final prorated
   hourly charge from `last_billed_at`, deducts credits if possible, records a
   usage transaction, and removes the active billing row.

Deletion does not fail just because the user has insufficient credits for the
final prorated charge; billing cleanup logs a warning and stops future accrual.
If infrastructure cleanup fails after DNS/database cleanup, the API returns a
warning so support can clean any orphaned resources.

### 9. Month rollover

Example:

- App was restricted on May 31.
- New period starts June 1.

Flow:

1. The new monthly usage row starts from zero usage.
2. Pod counters are not reset; this prevents counting a running pod's full
   lifetime traffic as new-month traffic.
3. The first sync computes only the delta since the last sample.
4. The sync checks both current and previous month restricted apps.
5. If the new month summary is `ok`, the old ingress restriction is removed.

## Data Flow

1. Prometheus collects pod network counters.
2. `POST /api/internal/platform-apps/bandwidth/sync` samples running apps.
3. Usage is upserted into `platform_app_bandwidth_usage_monthly`.
4. Overage-enabled plans are charged for newly crossed overage bytes.
5. The lifecycle evaluator records threshold events.
6. Notifications are inserted into `notifications`.
7. The cron sync applies or removes K8s ingress restrictions.
8. Dashboard/API reads `GET /api/services/platform-apps/bandwidth?app_id=...`.

The sync route can also scan Kubernetes deployments:

```json
{
  "include_k8s_discovery": true,
  "limit": 100
}
```

That creates baseline monthly usage rows for deployed apps that missed the
first bandwidth sync or existed before this lifecycle was introduced.

## Enforcement

All enforcement is applied at the Kubernetes Ingress layer, not inside user containers.

### Traffic restriction (bandwidth exceeded, no overage plan)

When `lifecycle_status = restricted`, the cron sync patches the app's NGINX Ingress
with a `server-snippet` annotation that returns 429 for all requests:

```
nginx.ingress.kubernetes.io/server-snippet: |
  # platform-app-bandwidth:begin
  default_type application/json;
  return 429 '{"error":"bandwidth_quota_exceeded",...}';
  # platform-app-bandwidth:end
```

If an operator already has a `server-snippet`, the platform block is appended
inside its own markers. Restore removes only the marked platform block and keeps
the operator snippet intact. The annotation is removed entirely only when no
other snippet content remains.

### Request body limit

`syncMaxRequestBodySize` is called from `AppBuildSideEffectsService` on every
successful deploy and resize. First deploy bootstraps the NGINX
`proxy-body-size` annotation; resize updates it to match the new plan.

### Bandwidth packs

Users can buy current-period bandwidth packs through:

```
POST /api/services/platform-apps/bandwidth/purchase
```

The purchase path:

1. verifies app ownership;
2. atomically deducts credit balance;
3. records a billing transaction;
4. increments `purchased_bytes` for the current monthly row;
5. returns the updated summary;
6. immediately removes the ingress restriction if the new quota restores the app.

### Overage billing

When a plan defines `overage_per_gb`, sync charges only newly accrued overage
bytes above included quota plus purchased packs. Charged bytes and totals are
stored in row metadata so repeated cron runs do not double charge. If the charge
fails because the account has no balance, the row is moved to `restricted` with
`restriction_reason = overage_billing_failed`; the normal ingress restriction
flow then blocks public traffic until the user restores balance or buys enough
bandwidth.

### Admin operations

Admins can inspect all current-month app usage in the platform apps bandwidth
tab. The admin API returns backend-calculated effective quota, purchased bytes,
remaining bytes, percentage used, lifecycle status, and policy action. Admins
can force a fresh sync for one app or manually lift a K8s ingress restriction.

### Gaps — not yet implemented

- **Billing-accurate traffic source (priority)**: pod-level counters include cluster-internal
  traffic (DB connections, Redis, health checks, inter-service calls). This overstates
  customer-visible bandwidth. Switch to `getIngressHttpCounters` (NGINX HTTP layer bytes,
  already implemented in `prometheus.ts` as dead code) once validated in production.
  This should be treated as a priority, not a later cleanup, because users will complain
  if internal traffic consumes their quota.

- **Pod counter pruning**: old pod rows (from replaced deployments) accumulate in
  `platform_app_bandwidth_pod_counters`. Already pruned per-app on each sync cycle via
  `pruneStalePodCounters`. A separate periodic job should sweep rows older than 90 days
  across all apps to catch orphans from deleted apps.

### Already implemented

- **Bandwidth packs**: pack purchases add `purchased_bytes`, record a billing transaction,
  and can restore restricted apps immediately.
- **Overage billing**: incremental overage charges are recorded as usage transactions,
  with failed charges forcing restriction.
- **Grace buffer**: 5% window after 100% before traffic is blocked.
- **Overage cap**: per-size hard ceiling on billable overage bytes; trips restriction if
  breached regardless of overage plan setting.
