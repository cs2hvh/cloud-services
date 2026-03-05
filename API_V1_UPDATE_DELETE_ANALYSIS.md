# API v1 - UPDATE & DELETE Analysis

**Date:** 2026-02-27  
**Status:** Planning Phase

---

## 🔍 PATCH /api/v1/apps/{id} - UPDATE Analysis

### What Internal Route Does
File: `app/api/services/platform-apps/update/route.ts`

```typescript
1. ✅ Validates request body (Zod schema)
2. ✅ Verify ownership (app.user_id === auth.userId)  
3. ✅ Update database record (Platform_Apps.update)
4. ✅ Create audit log
5. ✅ Add project log
6. ❌ NO REDEPLOYMENT - only updates metadata
```

### Dependencies Analysis

| Dependency | Required? | Available via PAT? |
|------------|-----------|-------------------|
| User ID | ✅ Yes | ✅ Yes (from token) |
| App ownership | ✅ Yes | ✅ Yes (check DB) |
| Database access | ✅ Yes | ✅ Yes (service role) |
| OAuth tokens | ❌ No | N/A |
| Jenkins | ❌ No | N/A |
| Cloudflare | ❌ No | N/A |

### What Can Be Updated?

```typescript
// From updatePlatformAppSchema
{
  name?: string           // App name
  branch?: string         // Git branch
  framework?: string      // Framework type
  build_command?: string  // Build command
  output_directory?: string
  status?: string         // pending/building/running/failed/stopped
  deployment_url?: string
  container_port?: number
}
```

### ⚠️ Important Notes

1. **NO REDEPLOYMENT** - Only updates database metadata
2. Users must manually redeploy via dashboard to apply changes
3. Updating `name` doesn't update DNS or Jenkins job name
4. Updating `branch` doesn't pull new code
5. This is for **metadata management only**

### ✅ Recommendation: **SAFE TO IMPLEMENT**

**Reasons:**
- No infrastructure operations
- No session dependencies
- No billing impact
- Simple database update
- Clear use case: metadata corrections

---

## 🗑️ DELETE /api/v1/apps/{id} - DELETE Analysis

### What Internal Route Does
File: `app/api/services/platform-apps/delete/route.ts`

```typescript
1. ✅ Get app details (Platform_Apps.get)
2. ✅ Verify ownership (app.user_id === auth.userId)
3. ❌ Clean up custom domains (Kubernetes Ingress + Cloudflare DNS)
4. ✅ Delete from database (Platform_Apps.delete)
5. ❌ Clean up infrastructure:
   - Delete Jenkins job (via Jenkins API)
   - Delete Kubernetes resources (via Jenkins deletion pipeline)
   - Delete DNS record (via Cloudflare API)
6. ✅ Stop billing (prorated final charge)
7. ✅ Add project logs
8. ✅ Create notifications
```

### Dependencies Analysis

| Dependency | Required? | Available via PAT? | Source |
|------------|-----------|-------------------|---------|
| User ID | ✅ Yes | ✅ Yes | From token |
| App ownership | ✅ Yes | ✅ Yes | DB check |
| Jenkins API | ✅ Yes | ✅ Yes | `process.env.JENKINS_URL` |
| Cloudflare API | ✅ Yes | ✅ Yes | `process.env.CLOUDFLARE_API_TOKEN` |
| Kubernetes | ✅ Yes | ✅ Yes | Via Jenkins pipeline |
| Database | ✅ Yes | ✅ Yes | Service role |
| Billing system | ✅ Yes | ✅ Yes | No session needed |

### Infrastructure Operations

```typescript
DeploymentService.delete() performs:
1. Custom domain cleanup:
   - Remove from Kubernetes Ingress
   - Delete Cloudflare DNS records
2. Jenkins job deletion (app-name-job)
3. Kubernetes deletion (via Jenkins deletion pipeline):
   - Deletes Deployment
   - Deletes Service
   - Deletes Ingress
4. DNS cleanup (app-name.galaxyhvh.com)
5. Database cascade deletion
```

### ⚠️ Risks

1. **Infrastructure Failures**
   - Jenkins API fails → orphaned jobs
   - Kubernetes deletion fails → orphaned pods
   - DNS deletion fails → orphaned records
   - Partial cleanup leaves inconsistent state

2. **Billing Impact**
   - Stops hourly billing immediately
   - Prorated final charge deducted
   - Low balance could block deletion

3. **No Rollback**
   - Once infrastructure deleted, cannot undo
   - Database deletion cascades to all related records

4. **Async Operations**
   - Jenkins deletion job takes ~30-60 seconds
   - Could time out on slow networks
   - User won't see deletion progress

### ✅ Recommendation: **CAUTIOUSLY IMPLEMENT**

**Why it's feasible:**
- All credentials in env vars (not session)
- Billing system works without session
- Infrastructure APIs don't need OAuth

**Safeguards needed:**
1. Add confirmation via test first (dry-run mode)
2. Return immediate 202 Accepted (async processing)
3. Log all operations for debugging
4. Don't fail on billing insufficient funds
5. Clear documentation about infrastructure impact

---

## 📊 Implementation Comparison

| Feature | PATCH | DELETE |
|---------|-------|--------|
| **Complexity** | Low | High |
| **Infrastructure** | None | Jenkins + K8s + DNS |
| **Session Required** | ❌ No | ❌ No |
| **Billing Impact** | ❌ None | ✅ Yes (stop billing) |
| **Reversible** | ✅ Yes | ❌ No (permanent) |
| **Failure Risk** | Low | Medium-High |
| **Use Case** | Metadata fixes | Full app removal |

---

## 🎯 Final Recommendations

### ✅ PATCH /api/v1/apps/{id}
**Status:** **SAFE - IMPLEMENT IMMEDIATELY**

**Benefits:**
- Simple database update
- No infrastructure risk
- Clear use case
- Easy to test

**Limitations:**
- Doesn't trigger redeployment
- Metadata only

**Implementation:**
```typescript
export const PATCH = withV1Auth("apps:update", async (req, auth, context) => {
  // 1. Parse ID from params
  // 2. Validate request body
  // 3. Check ownership
  // 4. Update database
  // 5. Return updated app
});
```

### ⚠️ DELETE /api/v1/apps/{id}
**Status:** **RISKY - IMPLEMENT WITH SAFEGUARDS**

**Benefits:**
- Full deletion workflow
- No session dependency
- Useful for automation

**Risks:**
- Infrastructure cleanup failures
- Billing edge cases
- No progress feedback
- Permanent operation

**Implementation Strategy:**
1. Return 202 Accepted immediately
2. Queue deletion in background
3. Provide status endpoint (GET /api/v1/apps/{id}/deletion-status)
4. Comprehensive logging
5. Handle partial failures gracefully

**Alternative:** Only support via dashboard (current state)

---

## 🚦 Decision Required

### Option A: Implement PATCH only (Conservative)
- ✅ Zero risk
- ✅ Useful for metadata
- ❌ Users must use dashboard for deletion

### Option B: Implement PATCH + DELETE (Aggressive)
- ✅ Full API coverage
- ✅ Automation friendly
- ⚠️ Infrastructure risk
- ⚠️ Requires careful testing

### Option C: Implement PATCH + DELETE (Safeguarded)
- ✅ Full API coverage
- ✅ Async/background processing
- ✅ Status monitoring
- ⚠️ More complex implementation

---

## 💡 My Recommendation

**Implement Option A first (PATCH only)**

**Reasoning:**
1. Start with safe operation (PATCH)
2. Test in production
3. Gather feedback
4. Add DELETE later if needed with proper async handling

**User journey for deletion:**
- API v1: Use dashboard for deletion (current)
- Future: Add DELETE with async job queue + status endpoint

This follows the principle: **"Make it work, make it right, make it fast"**

Start simple, add complexity only when proven necessary.
