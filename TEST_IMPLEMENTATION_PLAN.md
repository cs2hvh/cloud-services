# Test Implementation Plan

**Created:** February 15, 2026  
**Based on:** [TEST_CASE_FEEDBACK_REPORT.md](TEST_CASE_FEEDBACK_REPORT.md)  
**Goal:** Close all missing and improvement scenarios identified in the feedback report

---

## Table of Contents

1. [Phase Overview](#phase-overview)
2. [Phase 1 — Fix Broken & Skipped Tests](#phase-1--fix-broken--skipped-tests-week-1)
3. [Phase 2 — Critical Missing Routes (Auth, Billing)](#phase-2--critical-missing-routes-auth-billing-weeks-2-3)
4. [Phase 3 — Service Route Gaps](#phase-3--service-route-gaps-weeks-4-5)
5. [Phase 4 — Unit Tests for Core Libraries](#phase-4--unit-tests-for-core-libraries-week-6)
6. [Phase 5 — Webhooks, Admin & Supporting Routes](#phase-5--webhooks-admin--supporting-routes-weeks-7-8)
7. [Phase 6 — Component & E2E Expansion](#phase-6--component--e2e-expansion-weeks-9-10)
8. [Phase 7 — Quality & Consistency Cleanup](#phase-7--quality--consistency-cleanup-week-11)
9. [Appendix A — Test File Naming Convention](#appendix-a--test-file-naming-convention)
10. [Appendix B — Standard Test Template](#appendix-b--standard-test-template)
11. [Appendix C — Dependency Mock Reference](#appendix-c--dependency-mock-reference)

---

## Phase Overview

| Phase | Focus | New Test Files | Est. Test Cases | Priority |
|-------|-------|---------------|-----------------|----------|
| 1 | Fix skipped/broken tests | 0 (fix existing) | ~49 unskipped | CRITICAL |
| 2 | Auth + Billing routes | 12 | ~180 | CRITICAL |
| 3 | Service route gaps | 18 | ~270 | HIGH |
| 4 | Unit tests for core libs | 6 | ~120 | HIGH |
| 5 | Webhooks, Admin, Supporting | 14 | ~180 | MEDIUM |
| 6 | Component & E2E expansion | 10 | ~150 | MEDIUM |
| 7 | Quality & consistency cleanup | 0 (fix existing) | — | LOW |
| **Total** | | **~60 new files** | **~900+ new tests** | |

---

## Phase 1 — Fix Broken & Skipped Tests (Week 1)

**Goal:** Get all 49 skipped/commented-out tests running. No new files, only fixes to existing tests.

### 1.1 Unskip `database-dbs-retrieves.test.ts` (16 tests)

**Current State:** `describe.skip` — tests were written speculatively for a route that didn't exist at the time.  
**File:** `tests/integration/api/database-dbs-retrieves.test.ts`

| Action | Detail |
|--------|--------|
| Verify route exists | Check if `app/api/services/database/dbs/retrieve/route.ts` now exists |
| If route exists | Remove `describe.skip` → `describe`, run tests, fix any assertion mismatches |
| If route does NOT exist | Delete the test file and remove from coverage expectations |
| Estimated effort | 1-2 hours |

### 1.2 Fix Object Storage Admin Delete Tests (6 tests)

**Current State:** `it.skip` — admin auth mocking doesn't work correctly.  
**File:** `tests/integration/api/object-storage-admin.test.ts`

| Action | Detail |
|--------|--------|
| Root cause | The `mockAdminUser()` helper doesn't mock the specific admin auth pattern used by the delete route |
| Fix approach | Read the admin delete route's auth mechanism, adjust the mock setup in `beforeEach` |
| Verify | All 6 tests pass: delete bucket, force delete, not found, missing ID, deletion failures, unexpected errors |
| Also fix | Describe label mismatch: change `POST /api/admin/object-storage/buckets/read-all` → `GET /api/admin/...` |
| Estimated effort | 2-3 hours |

### 1.3 Fix Object Storage Read-All Decrypt Test (1 test)

**File:** `tests/integration/api/object-storage-read-all.test.ts`

| Action | Detail |
|--------|--------|
| Root cause | Endpoint decryption assertion doesn't match current implementation |
| Fix approach | Read the current `read_all` route to see how endpoints are returned, update assertion |
| Estimated effort | 30 minutes |

### 1.4 Restore Spectrum Commented-Out Tests (10 tests)

**Files:** `spectrum-create.test.ts` (2), `spectrum-get.test.ts` (3), `spectrum-update.test.ts` (3), `spectrum-delete.test.ts` (2)

| Action | Detail |
|--------|--------|
| Encryption tests (5) | Encryption was refactored into `spectrum-functions.ts`. Rewrite these 5 tests to mock the new encryption path |
| Rate limit tests (2) | `spectrum-update` and `spectrum-delete` have commented 429 tests. Investigate if rate limiting changed, restore with correct mock |
| Validation tests (2) | `spectrum-update` validation changed. Read current schema, restore with correct assertions |
| App not found (1) | `spectrum-get` — restore and verify the 404 path matches the route handler |
| Estimated effort | 3-4 hours |

### 1.5 Add Error Cases to `spectrum-delete.test.ts`

**Current State:** Only `describe` block WITHOUT error handling tests (unlike all other Spectrum files).

| Action | Detail |
|--------|--------|
| Add describe | `Error Cases` block with 3 tests |
| Test cases | 1. Should handle Cloudflare API errors (mock axios rejection) |
| | 2. Should handle database deletion failure (mock Supabase error) |
| | 3. Should handle unexpected errors (throw generic Error) |
| Estimated effort | 1 hour |

### 1.6 Unskip Platform Apps Tests (2 tests)

**Files:** `platform-apps-create.test.ts`, `platform-apps-redeploy.test.ts`

| Action | Detail |
|--------|--------|
| TC-PA-I009 | "should use GitHub token for private repo" — mock `GitProviderService.getToken()` returning a token, verify it's passed to deployment config |
| Redeploy DB error | Uncomment "should handle database errors" — mock `AppStatusService.updateStatus()` throwing, verify 500 response |
| Estimated effort | 1 hour |

### 1.7 Unskip Kubernetes Tests (2 tests)

**Files:** `kubernetes-create.test.ts`, `kubernetes-read.test.ts`

| Action | Detail |
|--------|--------|
| "should reject unauthorized user" | Read the create route's ownership check, add proper mock for authorization rejection |
| "should include kubeconfig in response" | Read the read route's kubeconfig field handling, assert it's present in response |
| Estimated effort | 1 hour |

### 1.8 Unskip Component Tests (10 tests)

**Files:** `app-card.test.tsx` (3), `env-vars-editor.test.tsx` (6), `object-storage.test.tsx` (1)

| Action | Detail |
|--------|--------|
| app-card: branch, framework, size | Check current AppCard props structure, update selectors/assertions to match current UI |
| env-vars: remove, duplicate, paste (3), suggestions | Read EnvVarsEditor component, fix event handlers and DOM queries |
| object-storage: copy to clipboard | Mock `navigator.clipboard.writeText`, fix assertion |
| Estimated effort | 3-4 hours |

### Phase 1 Completion Criteria
- [ ] `npm test -- --run` passes with 0 skipped tests (or skips are documented with GitHub issue links)
- [ ] All 49 previously-skipped tests are either running or deleted with justification

---

## Phase 2 — Critical Missing Routes: Auth & Billing (Weeks 2-3)

**Goal:** Test all security-critical and financial routes that currently have zero coverage.

### 2.1 Auth — Signup & Signin (2 files, ~30 tests each)

#### `tests/integration/api/auth-signup.test.ts`
**Route:** `POST /api/auth/signup` — Public, creates user account  
**Mocks:** `@/lib/supabase/server` → `createClient`

| Test Group | Test Cases |
|-----------|------------|
| **Success Cases** | Valid signup with email+password; Returns session; Sets auth cookies |
| **Validation** | Missing email; Invalid email format; Password too short (<6 chars); Password too long; Missing password; Empty body |
| **Duplicate Handling** | Email already registered (Supabase returns error); Case-insensitive email check |
| **Rate Limiting** | Excessive signup attempts from same IP |
| **Error Handling** | Supabase API failure; Network timeout; Unexpected error format |
| **Security** | SQL injection in email field; XSS in email; Password not returned in response |
| **Est. tests** | ~20 |

#### `tests/integration/api/auth-signin-email.test.ts`
**Route:** `POST /api/auth/signin/email` — Public, email+password login  
**Mocks:** `@/lib/supabase/server`, `@/lib/cooldown/emailbased`, `@/lib/audit`, `@/lib/audit/context`

| Test Group | Test Cases |
|-----------|------------|
| **Success Cases** | Valid login returns session + user; Audit log created on success |
| **Invalid Credentials** | Wrong password; Non-existent email; Empty password; Empty email |
| **Validation** | Invalid email format; Missing fields |
| **Rate Limiting** | Brute-force protection via `limitByEmail`; Returns 429 after threshold |
| **Audit Logging** | Failed login attempt logged; Successful login logged |
| **Error Handling** | Supabase auth failure; Unexpected errors |
| **Est. tests** | ~18 |

### 2.2 Auth — MFA (4 files, ~15 tests each)

#### `tests/integration/api/auth-mfa-enroll.test.ts`
**Route:** `POST /api/auth/mfa/enroll` — Authenticated, enrolls TOTP factor  
**Mocks:** `@/lib/supabase/server` → `createClient`, `@/lib/rate-limit`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Success** | Enrolls new TOTP factor; Returns QR code URI + secret; Unenrolls existing unverified factor first |
| **Validation** | Already has verified factor (blocks re-enroll) |
| **Rate Limiting** | Enforces rate limit |
| **Error Handling** | Supabase enroll failure; Factor list failure |
| **Est. tests** | ~12 |

#### `tests/integration/api/auth-mfa-verify.test.ts`
**Route:** `POST /api/auth/mfa/verify` — Authenticated, verifies TOTP code  
**Mocks:** `@/lib/supabase/server` → `createClient`, `@/lib/rate-limit`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Success** | Valid TOTP code verifies factor; Returns verified session |
| **Invalid Code** | Wrong code returns error; Empty code; Expired code |
| **Validation** | Missing factor_id; Invalid factor_id format |
| **Rate Limiting** | Enforces rate limit (prevents brute-force) |
| **Error Handling** | Challenge failure; Verify failure |
| **Est. tests** | ~14 |

#### `tests/integration/api/auth-mfa-status.test.ts`
**Route:** `GET or POST /api/auth/mfa/status` — Returns MFA enrollment status  
**Mocks:** `@/lib/supabase/server`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Success** | Returns factors list; Correctly identifies verified vs unverified |
| **Empty State** | No factors enrolled returns empty |
| **Error Handling** | Supabase failure |
| **Est. tests** | ~8 |

#### `tests/integration/api/auth-mfa-unenroll.test.ts`
**Route:** `POST /api/auth/mfa/unenroll` — Removes MFA factor  
**Mocks:** `@/lib/supabase/server`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Success** | Unenrolls existing factor; Returns success |
| **Validation** | Missing factor_id; Non-existent factor_id |
| **Error Handling** | Supabase unenroll failure |
| **Est. tests** | ~10 |

### 2.3 Auth — Password Management (2 files)

#### `tests/integration/api/auth-forgot-password.test.ts`
**Route:** `POST /api/auth/forgot-password` — Public, sends OTP email  
**Mocks:** `@/lib/supabase/server`, `@/lib/supabase/queries/users`, `@/lib/supabase/queries/otps`, `@/lib/resend/send_forgot`, `@/lib/cooldown/emailbased`, `@/lib/utils`

| Test Group | Test Cases |
|-----------|------------|
| **Success Cases** | Valid email sends OTP; OTP stored in database; Email sent via Resend |
| **Validation** | Missing email; Invalid email format |
| **Non-existent User** | Unknown email — should return success (don't leak existence) |
| **Rate Limiting** | `limitByEmail` prevents abuse |
| **Error Handling** | Email send failure; OTP creation failure; User lookup failure |
| **Est. tests** | ~14 |

#### `tests/integration/api/auth-change-password.test.ts`
**Route:** `PUT /api/auth/profile/change-password` — Authenticated  
**Mocks:** `@/lib/supabase/server` (createClient + createServiceClient), `@/lib/audit`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Success** | Valid current + new password updates; Audit log created |
| **Validation** | Missing current_password; Missing new_password; New password too short; Same as current password |
| **Wrong Password** | Invalid current password rejected |
| **Error Handling** | Supabase update failure |
| **Est. tests** | ~12 |

### 2.4 Auth — Profile (2 files)

#### `tests/integration/api/auth-profile-read.test.ts`
**Route:** `GET /api/auth/profile/read`  
**Mocks:** `@/lib/supabase/server`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Success** | Returns user profile data; Includes email, username, avatar |
| **Error Handling** | Supabase query failure |
| **Est. tests** | ~6 |

#### `tests/integration/api/auth-profile-update.test.ts`
**Route:** `PUT /api/auth/profile/update`  
**Mocks:** `@/lib/supabase/server`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Success** | Update username; Update avatar_url; Partial update |
| **Validation** | Invalid username format; Username too short; Username too long |
| **Error Handling** | Supabase update failure |
| **Est. tests** | ~12 |

### 2.5 Billing (2 files)

#### `tests/integration/api/billing-topup.test.ts`
**Route:** `POST /api/billing/topup` — Authenticated, adds credits  
**Mocks:** `@/lib/supabase/server`, `@/lib/supabase/queries/billing`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Success** | Valid topup amount added to balance; Returns updated balance |
| **Validation** | Missing amount; Negative amount; Zero amount; Non-numeric amount; Amount exceeds max limit |
| **Error Handling** | Billing service failure; Supabase error |
| **Est. tests** | ~14 |

#### `tests/integration/api/billing-coupon-redeem.test.ts`
**Route:** `POST /api/billing/coupons/redeem` — Authenticated  
**Mocks:** `@/lib/supabase/server`, `@/lib/supabase/queries/promocodes`, `@/lib/cooldown/userbased`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Success** | Valid coupon redeemed; Credits added to balance; Coupon marked as used |
| **Invalid Coupon** | Non-existent code; Already redeemed; Expired coupon; Max uses reached |
| **Rate Limiting** | `limitByUser` enforced |
| **Validation** | Missing code; Empty code |
| **Error Handling** | Redemption failure; Database error |
| **Est. tests** | ~16 |

### Phase 2 Completion Criteria
- [ ] 12 new test files created and passing
- [ ] All auth routes (signup, signin, MFA, password, profile) have integration tests
- [ ] All billing routes have integration tests
- [ ] Test IDs follow `TC-AUTH-XXX` and `TC-BILL-XXX` schemes

---

## Phase 3 — Service Route Gaps (Weeks 4-5)

**Goal:** Add integration tests for untested service routes within services that already have partial coverage.

### 3.1 Database Service — 5 New Files (~75 tests)

#### `tests/integration/api/database-update.test.ts`
**Route:** `PUT /api/services/database/update`  
**Mocks:** `@/lib/auth/server-auth`, `@/lib/supabase/queries/database_clusters`, `@/lib/supabase/queries/projects`, `@/lib/notifications`, `@/lib/audit`, `@/lib/supabase/auth`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Rate Limiting** | Enforced |
| **Validation** | Missing cluster_id; Missing project_id; Invalid UUID formats |
| **Success** | Updates project association; Logs activity; Creates notification |
| **Not Found** | Non-existent cluster_id returns 404 |
| **Authorization** | Non-owner rejected |
| **Error Handling** | DB update failure; Notification failure (non-blocking) |
| **Est. tests** | ~16 |

#### `tests/integration/api/database-upsize-storage.test.ts`
**Route:** `PUT /api/services/database/upsize-storage`  
**Mocks:** `@/lib/auth/server-auth`, `@/lib/supabase/queries/database_clusters`, `@/lib/supabase/queries/projects`, `axios`, `@/lib/middleware/validate-request`, `@/lib/notifications`, `@/lib/audit`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Validation** | Missing cluster_id; Missing new_size; Invalid size value |
| **Success** | Calls DigitalOcean resize API; Updates Supabase storage size; Logs activity |
| **Billing** | Verifies sufficient credits before upsize |
| **DO API Failure** | DigitalOcean 500 error handled; Timeout handled |
| **Authorization** | Non-owner rejected |
| **Error Handling** | DB update failure; Partial failure (DO succeeds, DB fails) |
| **Est. tests** | ~18 |

#### `tests/integration/api/database-maintenance.test.ts`
**Route:** `PUT /api/services/database/maintenance`  
**Mocks:** `@/lib/auth/server-auth`, `@/lib/supabase/queries/database_clusters`, `@/lib/supabase/queries/projects`, `axios`, `@/lib/middleware/validate-request`, `@/lib/notifications`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Validation** | Missing cluster_id; Invalid day; Invalid hour format |
| **Success** | Updates DO maintenance window; Updates Supabase; Logs activity |
| **Authorization** | Non-owner rejected |
| **Error Handling** | DO API failure; DB failure |
| **Est. tests** | ~14 |

#### `tests/integration/api/database-network-delete.test.ts`
**Route:** `POST /api/services/database/network/delete`  
**Mocks:** `@/lib/auth/server-auth`, `@/lib/supabase/queries/database_clusters`, `@/lib/supabase/queries/projects`, `axios`, `@/lib/middleware/validate-request`, `@/lib/notifications`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Validation** | Missing cluster_id; Missing rule UUID |
| **Success** | Fetches current firewall rules from DO; Removes specified rule; Updates DO firewall; Logs activity |
| **Not Found** | Rule UUID not in current rules |
| **Authorization** | Non-owner rejected |
| **Error Handling** | DO GET failure; DO PUT failure; DB failure |
| **Est. tests** | ~14 |

#### `tests/integration/api/database-dns.test.ts` (Improvement)
**Current State:** Only 2 tests (env var checks). Needs expansion.

| Test Group | Test Cases to Add |
|-----------|------------|
| **Create Record** | Successfully creates A record; Creates CNAME record; Creates TXT record |
| **Delete Record** | Successfully deletes record; No matching records found (already tested) |
| **Error Handling** | Cloudflare API failure on create; Invalid record type; Zone not found |
| **Est. new tests** | ~8 |

### 3.2 Kubernetes Service — 5 New Files (~70 tests)

#### `tests/integration/api/kubernetes-delete-node.test.ts`
**Route:** `POST /api/services/kubernetes/clusters/delete_node`  
**Mocks:** `@/lib/auth/server-auth`, `@/lib/supabase/server`, `@/lib/supabase/queries/projects`, `@/lib/audit`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Validation** | Missing cluster_id; Missing droplet_id; Invalid formats |
| **Success** | Removes node from workers array; Updates cluster in Supabase |
| **Not Found** | Non-existent cluster; droplet_id not in cluster's workers |
| **Authorization** | Non-owner rejected |
| **Edge Cases** | Last node in cluster (should it be allowed?); Node already removed |
| **Error Handling** | Supabase read failure; Supabase update failure |
| **Est. tests** | ~16 |

#### `tests/integration/api/kubernetes-downloadkube.test.ts`
**Route:** `POST /api/services/kubernetes/clusters/downloadkube`  
**Mocks:** `@/lib/auth/server-auth`, `@/lib/supabase/server`, `@/lib/supabase/auth`, `@/lib/rate-limit`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Rate Limiting** | Enforced |
| **Validation** | Missing cluster_id |
| **Success** | Returns kubeconfig YAML; Sets correct content-type header |
| **Not Found** | Cluster doesn't exist |
| **Authorization** | Non-owner rejected; Admin allowed (if applicable) |
| **Security** | Kubeconfig not cached; Credentials not leaked in error responses |
| **Error Handling** | Supabase query failure |
| **Est. tests** | ~14 |

#### `tests/integration/api/kubernetes-manageip-add.test.ts`
**Route:** `POST /api/services/kubernetes/manageip/add`  
**Mocks:** `@/lib/supabase/server` → `createServiceClient`, `bcryptjs`

| Test Group | Test Cases |
|-----------|------------|
| **Validation** | Schema validation via `vmCreateSchema`; Missing required fields; Invalid field types |
| **Success** | Creates VM record in Supabase; Hashes password with bcrypt |
| **Duplicate** | Duplicate IP/hostname handling |
| **Error Handling** | Supabase insert failure; bcrypt failure |
| **Est. tests** | ~12 |

#### `tests/integration/api/kubernetes-manageip-update.test.ts`
**Route:** `POST or PUT /api/services/kubernetes/manageip/update`  
**Similar pattern — ~10 tests**

#### `tests/integration/api/kubernetes-manageip-delete.test.ts`
**Route:** `POST or DELETE /api/services/kubernetes/manageip/delete`  
**Similar pattern — ~10 tests**

### 3.3 Platform Apps Service — 6 New Files (~80 tests)

#### `tests/integration/api/platform-apps-update.test.ts`
**Route:** `POST /api/services/platform-apps/update`  
**Mocks:** `@/lib/auth/server-auth`, `@/lib/supabase/queries`, `@/lib/supabase/queries/projects`, `@/lib/cooldown/userbased`, `@/lib/middleware/validate-request`, `@/lib/audit`, `@/lib/supabase/auth`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Rate Limiting** | `limitByUser` enforced |
| **Validation** | Missing app_id; Invalid status value; Invalid framework value; Invalid deployment_url format |
| **Success** | Updates app fields; Logs activity when project_id present |
| **Not Found** | Non-existent app_id |
| **Authorization** | Non-owner rejected; Admin allowed via `requireAdmin` |
| **Error Handling** | DB update failure; Unexpected errors |
| **Est. tests** | ~18 |

#### `tests/integration/api/platform-apps-domains-add.test.ts`
**Route:** `POST /api/services/platform-apps/domains/add`  
**Mocks:** `@/lib/auth/server-auth`, `@/lib/supabase/queries`, `@/lib/services/custom-domain`, `@/lib/cooldown/userbased`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Validation** | Missing domain; Invalid domain format (no TLD, spaces, protocols); Missing app_id |
| **Success** | Adds domain via CustomDomainService; Returns DNS records to configure |
| **Limit** | Rejects when 5 domains already attached |
| **Duplicate** | Domain already added to this app; Domain used by another app |
| **Not Found** | App doesn't exist |
| **Authorization** | Non-owner rejected |
| **Error Handling** | CustomDomainService failure |
| **Est. tests** | ~16 |

#### `tests/integration/api/platform-apps-domains-verify.test.ts`
**Route:** `POST /api/services/platform-apps/domains/verify`  
**Mocks:** `@/lib/auth/server-auth`, `@/lib/services/custom-domain`, `@/lib/cooldown/userbased`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Validation** | Missing domain; Missing app_id |
| **Success** | DNS configured correctly → returns verified |
| **DNS Not Ready** | DNS records not configured → returns pending |
| **Not Found** | Domain not found |
| **Error Handling** | DNS lookup timeout; Service failure |
| **Est. tests** | ~12 |

#### `tests/integration/api/platform-apps-integrations-link.test.ts`
**Route:** `POST /api/services/platform-apps/integrations/link`  
**Mocks:** `@/lib/supabase/server`, `@/lib/services/database-integration`, `@/lib/audit`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Validation** | Missing app_id; Missing database_id; Invalid UUID formats |
| **Success** | Links database to app via DatabaseIntegrationService; Audit log created |
| **Already Linked** | Same integration already exists |
| **Not Found** | App doesn't exist; Database doesn't exist |
| **Authorization** | Non-owner of app; Non-owner of database |
| **Error Handling** | Service failure; Audit log failure (non-blocking) |
| **Est. tests** | ~14 |

#### `tests/integration/api/platform-apps-integrations-unlink.test.ts`
**Route:** `POST /api/services/platform-apps/integrations/unlink`  
**Similar pattern to link — ~10 tests**

#### `tests/integration/api/platform-apps-integrations-linked.test.ts`
**Route:** `GET or POST /api/services/platform-apps/integrations/linked`  
**Read-only — ~8 tests (auth, success with data, empty state, errors)**

### 3.4 Object Storage — 1 New File

#### `tests/integration/api/object-storage-check-bucket.test.ts`
**Route:** `POST /api/services/object-storage/check-bucket`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Success** | Available bucket name returns `available: true` |
| **Taken** | Existing bucket name returns `available: false` |
| **Validation** | Invalid bucket name format |
| **Error Handling** | Provider check failure |
| **Est. tests** | ~8 |

### Phase 3 Completion Criteria
- [ ] 18 new test files created and passing
- [ ] All HIGH-priority untested service routes have integration tests
- [ ] Database, Kubernetes, Platform Apps gaps closed for core operations
- [ ] Test IDs assigned: `TC-DB-1XX`, `TC-K8S-1XX`, `TC-PA-I1XX`, `TC-OBJ-XXX`

---

## Phase 4 — Unit Tests for Core Libraries (Week 6)

**Goal:** Add unit tests for critical shared libraries that all services depend on.

### 4.1 `tests/unit/billing/credits.test.ts` (~25 tests)
**Module:** `lib/billing/credits.ts` — `BillingCredits`

| Test Group | Test Cases |
|-----------|------------|
| **getBalance** | Returns balance for valid user; Returns 0 for user with no credits; Returns 0 on Supabase error |
| **hasSufficientBalance** | True when balance ≥ required; False when balance < required; Handles zero balance; Handles zero required amount |
| **deduct** | Deducts correct amount; Throws on insufficient balance; Handles exact balance (edge case); Handles concurrent deductions |
| **addActiveKubernetes** | Inserts correct record; Handles duplicate inserts |

### 4.2 `tests/unit/pricing/pricing.test.ts` (~20 tests)
**Module:** `config/pricing.ts`

| Test Group | Test Cases |
|-----------|------------|
| **monthlyToHourly** | Correct conversion (720 hours/month); Handles 0; Rounds to 6 decimals |
| **ratesFromProduct** | Extracts initialCost and hourlyRate from product |
| **getRatesForDatabase** | Returns rates for valid plan; Handles missing product |
| **getRatesForPlatformApp** | Returns rates for small/medium/large; Handles invalid size |
| **getAllPlatformAppRates** | Returns array of all sizes with correct structure |
| **getRatesForObjectStorage** | Returns correct rates |
| **getRatesForSpectrum** | Returns correct rates |
| **getRatesForKubernetesExisting** | Returns rates for valid plan |

### 4.3 `tests/unit/rate-limit.test.ts` (~15 tests)
**Module:** `lib/rate-limit.ts`

| Test Group | Test Cases |
|-----------|------------|
| **check** | Allows requests within limit; Throws after limit exceeded; Resets after interval; Uses correct IP from headers |
| **clearRateLimits** | Clears all stored limits |
| **IP extraction** | Prefers x-forwarded-for; Falls back to x-real-ip; Handles missing headers |
| **Edge cases** | Multiple tokens; Concurrent requests |

### 4.4 `tests/unit/supabase/database-clusters.test.ts` (~20 tests)
**Module:** `lib/supabase/queries/database_clusters.ts`

| Test Group | Test Cases |
|-----------|------------|
| **read** | Returns cluster by ID; Returns null for non-existent |
| **create** | Creates cluster with all fields |
| **update_project** | Updates project association |
| **update_network_rules** | Updates firewall rules array |
| **update_storage_size** | Updates storage size value |
| **update_maintenance_window** | Updates maintenance day/hour |
| **list_by_owner** | Returns user's clusters; Empty array for no clusters |
| **delete** | Soft-deletes cluster |

### 4.5 `tests/unit/supabase/billing.test.ts` (~15 tests)
**Module:** `lib/supabase/queries/billing.ts` (Billing queries)

| Test Group | Test Cases |
|-----------|------------|
| **start_hourly_billing** | Creates billing record with correct rates |
| **close_active_service** | Closes active billing for service ID |
| **get_active_services** | Returns active services for user |
| **topup** | Adds credits to user balance |

### 4.6 `tests/unit/supabase/spectrum-apps.test.ts` (~15 tests)
**Module:** `lib/supabase/queries/spectrum_apps.ts`

| Test Group | Test Cases |
|-----------|------------|
| **create** | Creates spectrum app record |
| **get** | Returns app by ID; Returns null for non-existent |
| **list_by_owner** | Returns user's apps |
| **update** | Updates app fields |
| **delete** | Deletes app record |
| **admin_delete** | Admin-level delete |

### Phase 4 Completion Criteria
- [ ] 6 new unit test files created and passing
- [ ] Billing, pricing, and rate-limit logic verified
- [ ] Supabase query coverage expanded to 5 modules (from 2)

---

## Phase 5 — Webhooks, Admin & Supporting Routes (Weeks 7-8)

**Goal:** Test webhook processing, admin operations, and supporting infrastructure routes.

### 5.1 Webhook Tests (4 files, ~60 tests)

#### `tests/integration/api/webhook-github.test.ts`
**Route:** `POST /api/webhooks/git/github`  
**Mocks:** `@/lib/webhooks/github`, `@/lib/supabase/queries`, `@/lib/services/auto-deploy`, `@/lib/audit`

| Test Group | Test Cases |
|-----------|------------|
| **Signature Validation** | Valid HMAC signature accepted; Invalid signature returns 401; Missing signature header |
| **Push Event** | Triggers auto-deploy for matching app; Skips deploy for non-matching branch |
| **Repository Matching** | Finds apps by repository URL; Handles renamed repositories |
| **Auto-Deploy** | Calls AutoDeployService with correct config; Records webhook trigger |
| **Ignored Events** | Ignores non-push events (PR, issue, etc.) |
| **Error Handling** | Auto-deploy failure; DB lookup failure |
| **Est. tests** | ~18 |

#### `tests/integration/api/webhook-deployment-status.test.ts`
**Route:** `POST /api/webhooks/deployment-status`  
**Mocks:** `@/lib/supabase/queries`

| Test Group | Test Cases |
|-----------|------------|
| **Success Callback** | Updates app status to running; Creates deployment record; Sets active deployment |
| **Failure Callback** | Updates app status to failed; Records failure reason |
| **Validation** | Missing app_id; Missing status; Invalid status value |
| **Idempotency** | Duplicate callback handled gracefully |
| **Error Handling** | DB update failure |
| **Est. tests** | ~14 |

#### `tests/integration/api/webhook-gitlab.test.ts` (~12 tests)
#### `tests/integration/api/webhook-bitbucket.test.ts` (~12 tests)

### 5.2 Admin Tests (4 files, ~50 tests)

#### `tests/integration/api/admin-databases.test.ts`
**Route:** `GET /api/admin/databases`  
**Mocks:** `@/lib/auth/server-auth`, `@/lib/supabase/auth` → `requireAdmin`, `@/lib/supabase/queries/database_clusters`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401; Non-admin returns 403 |
| **Success** | Returns all databases with owner info; Supports pagination |
| **Empty State** | No databases returns empty array |
| **Error Handling** | DB query failure |
| **Est. tests** | ~10 |

#### `tests/integration/api/admin-kubernetes-delete.test.ts`
**Route:** `POST /api/admin/kubernetes/clusters/delete`  
**Pattern:** Admin auth + destructive cluster deletion — ~12 tests

#### `tests/integration/api/admin-users.test.ts`
**Route:** `GET /api/admin/users` + `GET /api/admin/users/[id]`  
**Pattern:** Admin auth + user listing/detail — ~14 tests

#### `tests/integration/api/admin-audit-logs.test.ts`
**Route:** `GET /api/admin/audit-logs` + `GET /api/admin/audit-logs/[id]` + `GET /api/admin/audit-logs/stats`  
**Pattern:** Admin auth + log querying/filtering — ~14 tests

### 5.3 Supporting Routes (6 files, ~60 tests)

#### `tests/integration/api/projects-crud.test.ts`
**Routes:** `POST|GET|PUT|DELETE /api/projects`, `GET /api/projects/list`, `GET /api/projects/[id]`

| Test Group | Test Cases |
|-----------|------------|
| **Create** | Valid project creation; Missing name; Duplicate name |
| **Read** | List user's projects; Get by ID; Not found |
| **Update** | Update name/description; Authorization |
| **Delete** | Successful delete; Non-owner rejected |
| **Est. tests** | ~20 |

#### `tests/integration/api/projects-activity.test.ts`
**Routes:** `POST /api/projects/logs/add`, `GET /api/projects/logs/read`, `POST /api/projects/activity/add`, `GET /api/projects/activity/read`  
**~12 tests**

#### `tests/integration/api/git-github.test.ts`
**Routes:** `GET /api/github/repositories`, `GET /api/github/branches`

| Test Group | Test Cases |
|-----------|------------|
| **Auth** | Unauthenticated returns 401 |
| **Success** | Lists user repos; Lists branches for repo |
| **Token** | Uses stored GitHub token; Handles expired token |
| **Error Handling** | GitHub API failure; Rate limited by GitHub |
| **Est. tests** | ~12 |

#### `tests/integration/api/git-gitlab.test.ts` (~12 tests — similar pattern)
#### `tests/integration/api/git-bitbucket.test.ts` (~12 tests — similar pattern)

#### `tests/integration/api/notifications.test.ts`
**Routes:** `GET /api/notifications`, `GET /api/notifications/count`, `POST /api/notifications/mark-read`  
**~12 tests**

### Phase 5 Completion Criteria
- [ ] 14 new test files created and passing
- [ ] All webhook routes have integration tests with signature validation
- [ ] Admin routes tested with proper role enforcement
- [ ] Supporting routes (projects, git providers, notifications) covered

---

## Phase 6 — Component & E2E Expansion (Weeks 9-10)

**Goal:** Extend component tests to untested services and add E2E tests beyond Platform Apps.

### 6.1 New Component Tests (4 files, ~60 tests)

#### `tests/components/spectrum/spectrum-list.test.tsx`
**Components to test:** Spectrum apps list page

| Test Group | Test Cases |
|-----------|------------|
| **Rendering** | Page title; Empty state; Loading state; App cards |
| **Data Display** | Protocol, DNS name, origin, status badge |
| **Actions** | Create new app button; Delete app; View details link |
| **Error Handling** | API fetch failure |
| **Est. tests** | ~16 |

#### `tests/components/spectrum/spectrum-create-form.test.tsx`
**Components to test:** Spectrum app creation form  
**~14 tests (form fields, validation, submission, error handling)**

#### `tests/components/billing/billing-topup.test.tsx`
**Components to test:** Credit topup UI  
**~14 tests (amount input, payment flow, success/error states)**

#### `tests/components/auth/mfa-setup.test.tsx`
**Components to test:** MFA enrollment UI  
**~14 tests (QR code display, code input, verification flow)**

### 6.2 New E2E Tests (6 files, ~90 tests)

#### `tests/e2e/database/database-list.spec.ts`
| Test Cases |
|-----------|
| Display databases list page; Show empty state; Display database cards with status; Navigate to database detail; Show loading state |
| **~12 tests** |

#### `tests/e2e/database/database-create.spec.ts`
| Test Cases |
|-----------|
| Step-by-step form wizard; Engine selection; Region selection; Name validation; Submit and redirect; Handle creation error |
| **~15 tests** |

#### `tests/e2e/kubernetes/kubernetes-list.spec.ts`
| Test Cases |
|-----------|
| Display clusters list; Download kubeconfig; Show cluster status; Navigate to detail |
| **~12 tests** |

#### `tests/e2e/kubernetes/kubernetes-create.spec.ts`
| Test Cases |
|-----------|
| Name input and validation; Location selection; Node count; Terms acceptance; Submit flow |
| **~14 tests** |

#### `tests/e2e/object-storage/object-storage-list.spec.ts`
| Test Cases |
|-----------|
| Display buckets list; Show empty state; Bucket status badges; Copy bucket ID; Navigate to create |
| **~12 tests** |

#### `tests/e2e/object-storage/object-storage-create.spec.ts`
| Test Cases |
|-----------|
| Bucket name input/validation; Region selection; ACL selection; CORS/Versioning toggles; Submit and redirect |
| **~15 tests** |

### Phase 6 Completion Criteria
- [ ] 4 new component test files for services currently without UI tests
- [ ] 6 new E2E spec files bringing Database, Kubernetes, and Object Storage to parity with Platform Apps
- [ ] E2E test follow consistent setup patterns with mock API interception

---

## Phase 7 — Quality & Consistency Cleanup (Week 11)

**Goal:** Fix all remaining quality issues across the test suite.

### 7.1 Fix Duplicate Test IDs

| Current Duplicate | Files | Fix |
|-------------------|-------|-----|
| TC-DB-054 (used twice) | `database-network-read.test.ts` | Renumber second to TC-DB-055, shift subsequent |
| TC-PA-C070 (used twice) | `runtime-logs.test.tsx` + `delete-app-modal.test.tsx` | Renumber runtime-logs to TC-PA-C120+ |
| TC-PA-C050/C051 (overlap) | `custom-domains-manager.test.tsx` + `apps-list.test.tsx` | Renumber domains to TC-PA-C130+ |
| TC-PA-U015/U016 (overlap) | `platform-apps.test.ts` validation | Renumber delete schema to TC-PA-U060+ |

### 7.2 Add Test IDs to ID-less Tests

| Service | Current IDs | Add IDs |
|---------|------------|---------|
| Object Storage (integration) | None | TC-OBJ-001 through TC-OBJ-084 |
| Object Storage (component) | None | TC-OBJ-C001 through TC-OBJ-C025 |
| Spectrum (integration) | None | TC-SP-001 through TC-SP-065 |
| Kubernetes (unit/validation) | None | TC-K8S-U001 through TC-K8S-U025 |

### 7.3 Fix Describe Label Mismatches

| File | Current | Correct |
|------|---------|---------|
| `object-storage-admin.test.ts` | `POST /api/admin/object-storage/buckets/read-all` | `GET /api/admin/object-storage/buckets/read-all` |
| `object-storage-settings.test.ts` | `PUT /api/services/object-storage/buckets/settings` | `POST /api/services/object-storage/buckets/settings/*` |
| `spectrum-update.test.ts` | `POST /api/services/spectrum/apps/update` | `PUT /api/services/spectrum/apps/update` (if PUT) |

### 7.4 Standardize Billing Verification

Add billing credit check tests to all service create routes that don't have them:

| File | Add Test Case |
|------|--------------|
| `database-create.test.ts` | "should reject when insufficient credits" + "should deduct credits on successful creation" |
| `kubernetes-create.test.ts` | "should reject when insufficient credits" + "should deduct credits on successful creation" |
| `object-storage-create.test.ts` | "should verify sufficient credits" (if applicable) |
| `spectrum-create.test.ts` | "should verify sufficient credits" (if applicable) |

### 7.5 Add Missing Error Recovery Tests

Add partial-failure tests to all service create/delete routes:

| File | Add Test Case |
|------|--------------|
| `database-create.test.ts` | "should handle DO success + Supabase failure (cleanup DO resource)" |
| `database-delete.test.ts` | "should handle DO success + Supabase failure" |
| `kubernetes-create.test.ts` | "should handle DO success + Supabase failure" |
| `spectrum-create.test.ts` | "should handle Cloudflare success + Supabase failure" |
| `object-storage-create.test.ts` | "should handle DO Spaces success + Supabase failure" |

### Phase 7 Completion Criteria
- [ ] Zero duplicate test IDs across entire test suite
- [ ] All test files have test IDs following service-specific schemes
- [ ] All describe labels match actual HTTP methods
- [ ] All create endpoints test billing deduction
- [ ] All create/delete endpoints test partial failure recovery

---

## Appendix A — Test File Naming Convention

```
tests/
├── integration/api/
│   ├── {service}-{operation}.test.ts          # Service routes
│   ├── auth-{feature}.test.ts                 # Auth routes
│   ├── billing-{operation}.test.ts            # Billing routes
│   ├── webhook-{provider}.test.ts             # Webhook routes
│   ├── admin-{resource}.test.ts               # Admin routes
│   ├── git-{provider}.test.ts                 # Git provider routes
│   ├── projects-{operation}.test.ts           # Project routes
│   └── notifications.test.ts                  # Notification routes
├── unit/
│   ├── billing/credits.test.ts                # Billing credits logic
│   ├── pricing/pricing.test.ts                # Pricing calculations
│   ├── rate-limit.test.ts                     # Rate limiter
│   ├── supabase/{table}.test.ts               # Supabase query modules
│   ├── services/{service}.test.ts             # Service classes
│   └── validation/{schema}.test.ts            # Zod schemas
├── components/
│   ├── {service}/{component}.test.tsx          # Component tests
│   └── auth/{component}.test.tsx              # Auth UI components
└── e2e/
    ├── {service}/{feature}.spec.ts            # E2E specs
    └── auth/{flow}.spec.ts                    # Auth E2E flows
```

### Test ID Scheme

| Service | Integration | Unit | Component | E2E |
|---------|------------|------|-----------|-----|
| Database | TC-DB-XXX | TC-DB-UXXX | TC-DB-CXXX | E2E-DB-XXX |
| Kubernetes | TC-K8S-XXX | TC-K8S-UXXX | TC-K8S-CXXX | E2E-K8S-XXX |
| Platform Apps | TC-PA-IXXX | TC-PA-UXXX | TC-PA-CXXX | E2E-PA-XXX |
| Object Storage | TC-OBJ-XXX | TC-OBJ-UXXX | TC-OBJ-CXXX | E2E-OBJ-XXX |
| Spectrum | TC-SP-XXX | TC-SP-UXXX | TC-SP-CXXX | E2E-SP-XXX |
| Auth | TC-AUTH-XXX | — | TC-AUTH-CXXX | E2E-AUTH-XXX |
| Billing | TC-BILL-XXX | TC-BILL-UXXX | TC-BILL-CXXX | — |
| Admin | TC-ADM-XXX | — | — | — |
| Webhooks | TC-WH-XXX | — | — | — |

---

## Appendix B — Standard Test Template

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/{path}/route';
import {
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  createMockPostRequest,
  expectResponseStatus,
  mockRateLimitAllow,
  mockRateLimitDeny,
} from '../../utils/test-helpers';

// Mock all external dependencies at module level
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/{module}');
vi.mock('@/lib/cooldown/userbased');
// ... additional mocks

describe('{METHOD} /api/{path}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set environment variables
    process.env.REQUIRED_VAR = 'test-value';
    // Setup default happy-path mocks
    mockAuthenticatedUser('test-user-id');
    mockRateLimitAllow();
    // ... service-specific mocks
  });

  describe('Authentication Tests', () => {
    it('TC-XXX-001: should require authentication', async () => {
      mockUnauthenticatedUser();
      const request = createMockPostRequest({});
      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('should accept authenticated user request', async () => {
      const request = createMockPostRequest({ /* valid payload */ });
      const response = await POST(request);
      expect(response.status).not.toBe(401);
    });
  });

  describe('Rate Limiting Tests', () => {
    it('TC-XXX-004: should enforce rate limiting', async () => {
      mockRateLimitDeny(60);
      const request = createMockPostRequest({ /* valid payload */ });
      const response = await POST(request);
      expect(response.status).toBe(429);
    });
  });

  describe('Validation Tests', () => {
    it('TC-XXX-005: should reject invalid payload', async () => {
      const request = createMockPostRequest({ invalid: 'data' });
      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe('Success Cases', () => {
    it('TC-XXX-002: should handle valid request', async () => {
      const request = createMockPostRequest({ /* valid payload */ });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 200);
      expect(data).toHaveProperty('expected_field');
    });
  });

  describe('Error Handling', () => {
    it('TC-XXX-010: should handle service errors', async () => {
      // Mock dependency to throw
      const request = createMockPostRequest({ /* valid payload */ });
      const response = await POST(request);
      expect(response.status).toBe(500);
    });
  });
});
```

---

## Appendix C — Dependency Mock Reference

### Common Mocks (used across most tests)

| Dependency | Mock Function | Location |
|------------|--------------|----------|
| `@/lib/auth/server-auth` | `mockAuthenticatedUser()` / `mockUnauthenticatedUser()` | `tests/utils/test-helpers.ts` |
| `@/lib/cooldown/userbased` | `mockRateLimitAllow()` / `mockRateLimitDeny()` | `tests/utils/test-helpers.ts` |
| `@/lib/supabase/auth` | `mockAdminUser()` / `mockNonAdminUser()` | `tests/utils/test-helpers.ts` |
| `@/config/functions` | `mockEncryption()` | `tests/utils/test-helpers.ts` |

### Service-Specific Mocks (need to be set up in each test)

| Service | Key Dependencies to Mock |
|---------|-------------------------|
| **Auth** | `@/lib/supabase/server` → `createClient` (returns `auth.signUp`, `auth.signInWithPassword`, `mfa.*`) |
| **Billing** | `@/lib/supabase/queries/billing` → `Billing`, `@/lib/supabase/queries/promocodes` → `Promocodes` |
| **Database** | `@/lib/supabase/queries/database_clusters`, `axios` (DigitalOcean API), `@/lib/notifications` |
| **Kubernetes** | `@/lib/supabase/server` → `createServiceClient` / `createSSRClient`, `@/lib/supabase/queries/projects` |
| **Platform Apps** | `@/lib/supabase/queries` → `Platform_Apps`, `@/lib/services/*` (deployment, custom-domain, database-integration) |
| **Object Storage** | `@/lib/supabase/queries/object_spaces`, `@/config/object-storage-functions` |
| **Spectrum** | `@/lib/supabase/queries/spectrum_apps`, `axios` (Cloudflare API), `@/config/spectrum-functions` |
| **Webhooks** | `@/lib/webhooks/{provider}` → signature validation, `@/lib/services/auto-deploy` |
| **Admin** | `@/lib/supabase/auth` → `requireAdmin`, all service query modules |

### New Helpers to Add to `test-helpers.ts`

```typescript
// Auth-specific helpers (Phase 2)
export function mockSupabaseAuth(methods: Partial<SupabaseAuthMethods>) { ... }
export function createMockSupabaseClient(overrides?: Partial<SupabaseClient>) { ... }

// Billing helpers (Phase 2)
export function mockBillingTopup(result: { balance: number }) { ... }
export function mockInsufficientCredits() { ... }

// Webhook helpers (Phase 5)
export function createWebhookRequest(payload: any, signature: string) { ... }
export function generateGitHubSignature(payload: any, secret: string) { ... }
```

---

## Progress Tracking

Use this checklist to track implementation progress across phases:

### Phase 1 — Fix Broken & Skipped Tests
- [ ] 1.1 `database-dbs-retrieves.test.ts` — resolved (unskipped or deleted)
- [ ] 1.2 Object Storage admin delete tests — 6 tests unskipped and passing
- [ ] 1.3 Object Storage read-all decrypt test — unskipped and passing
- [ ] 1.4 Spectrum commented-out tests — 10 tests restored or rewritten
- [ ] 1.5 Spectrum delete error cases — 3 new tests added
- [ ] 1.6 Platform Apps skipped tests — 2 tests unskipped
- [ ] 1.7 Kubernetes skipped tests — 2 tests unskipped
- [ ] 1.8 Component skipped tests — 10 tests unskipped

### Phase 2 — Auth & Billing
- [ ] 2.1 `auth-signup.test.ts`
- [ ] 2.1 `auth-signin-email.test.ts`
- [ ] 2.2 `auth-mfa-enroll.test.ts`
- [ ] 2.2 `auth-mfa-verify.test.ts`
- [ ] 2.2 `auth-mfa-status.test.ts`
- [ ] 2.2 `auth-mfa-unenroll.test.ts`
- [ ] 2.3 `auth-forgot-password.test.ts`
- [ ] 2.3 `auth-change-password.test.ts`
- [ ] 2.4 `auth-profile-read.test.ts`
- [ ] 2.4 `auth-profile-update.test.ts`
- [ ] 2.5 `billing-topup.test.ts`
- [ ] 2.5 `billing-coupon-redeem.test.ts`

### Phase 3 — Service Route Gaps
- [ ] 3.1 `database-update.test.ts`
- [ ] 3.1 `database-upsize-storage.test.ts`
- [ ] 3.1 `database-maintenance.test.ts`
- [ ] 3.1 `database-network-delete.test.ts`
- [ ] 3.1 `database-dns.test.ts` (improved)
- [ ] 3.2 `kubernetes-delete-node.test.ts`
- [ ] 3.2 `kubernetes-downloadkube.test.ts`
- [ ] 3.2 `kubernetes-manageip-add.test.ts`
- [ ] 3.2 `kubernetes-manageip-update.test.ts`
- [ ] 3.2 `kubernetes-manageip-delete.test.ts`
- [ ] 3.3 `platform-apps-update.test.ts`
- [ ] 3.3 `platform-apps-domains-add.test.ts`
- [ ] 3.3 `platform-apps-domains-verify.test.ts`
- [ ] 3.3 `platform-apps-integrations-link.test.ts`
- [ ] 3.3 `platform-apps-integrations-unlink.test.ts`
- [ ] 3.3 `platform-apps-integrations-linked.test.ts`
- [ ] 3.4 `object-storage-check-bucket.test.ts`

### Phase 4 — Unit Tests for Core Libraries
- [ ] 4.1 `billing/credits.test.ts`
- [ ] 4.2 `pricing/pricing.test.ts`
- [ ] 4.3 `rate-limit.test.ts`
- [ ] 4.4 `supabase/database-clusters.test.ts`
- [ ] 4.5 `supabase/billing.test.ts`
- [ ] 4.6 `supabase/spectrum-apps.test.ts`

### Phase 5 — Webhooks, Admin & Supporting Routes
- [ ] 5.1 `webhook-github.test.ts`
- [ ] 5.1 `webhook-deployment-status.test.ts`
- [ ] 5.1 `webhook-gitlab.test.ts`
- [ ] 5.1 `webhook-bitbucket.test.ts`
- [ ] 5.2 `admin-databases.test.ts`
- [ ] 5.2 `admin-kubernetes-delete.test.ts`
- [ ] 5.2 `admin-users.test.ts`
- [ ] 5.2 `admin-audit-logs.test.ts`
- [ ] 5.3 `projects-crud.test.ts`
- [ ] 5.3 `projects-activity.test.ts`
- [ ] 5.3 `git-github.test.ts`
- [ ] 5.3 `git-gitlab.test.ts`
- [ ] 5.3 `git-bitbucket.test.ts`
- [ ] 5.3 `notifications.test.ts`

### Phase 6 — Component & E2E Expansion
- [ ] 6.1 `spectrum/spectrum-list.test.tsx`
- [ ] 6.1 `spectrum/spectrum-create-form.test.tsx`
- [ ] 6.1 `billing/billing-topup.test.tsx`
- [ ] 6.1 `auth/mfa-setup.test.tsx`
- [ ] 6.2 `database/database-list.spec.ts`
- [ ] 6.2 `database/database-create.spec.ts`
- [ ] 6.2 `kubernetes/kubernetes-list.spec.ts`
- [ ] 6.2 `kubernetes/kubernetes-create.spec.ts`
- [ ] 6.2 `object-storage/object-storage-list.spec.ts`
- [ ] 6.2 `object-storage/object-storage-create.spec.ts`

### Phase 7 — Quality Cleanup
- [ ] 7.1 Fix duplicate test IDs
- [ ] 7.2 Add test IDs to Object Storage and Spectrum
- [ ] 7.3 Fix describe label mismatches
- [ ] 7.4 Add billing verification to all service create tests
- [ ] 7.5 Add partial failure tests to all create/delete tests
