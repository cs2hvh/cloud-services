# Sensitive Data Exposure - Security Audit Checklist

**Task:** ACS-76 - Verify API responses do not leak sensitive data  
**Status:** In Progress  
**Date:** April 13, 2026  
**Total API Routes:** 240+

---

## Overview

This checklist covers all API endpoints and patterns that could potentially leak sensitive data in responses. Work through each section systematically.

### Route Categories by Risk Level

| Risk Level | Category | Route Count | Description |
|------------|----------|-------------|-------------|
| 🔴 Critical | Admin APIs | 34 | Full system access, user management |
| 🔴 Critical | Auth APIs | 23 | Authentication, tokens, credentials |
| 🟠 High | Billing APIs | 9 | Financial data, payment info |
| 🟠 High | User/Profile APIs | 5 | Personal data |
| 🟡 Medium | Service APIs | 100+ | Infrastructure management |
| 🟡 Medium | Git Provider APIs | 12 | OAuth tokens |
| 🟢 Low | Public APIs | 10 | Pricing, options, docs |

---

## 🔴 CRITICAL: Admin API Routes (34 routes)

All admin routes require verification that they:
1. ✅ Require admin authentication
2. ⬜ Don't expose sensitive credentials in responses
3. ⬜ Use specific column selection (no `select("*")`)

| # | Route | Check Auth | Check Response | Status |
|---|-------|------------|----------------|--------|
| 1 | `/api/admin/ai-agents/agents` | ⬜ | ⬜ | ⬜ |
| 2 | `/api/admin/ai-agents/models` | ⬜ | ⬜ | ⬜ |
| 3 | `/api/admin/ai-agents/models/[id]` | ⬜ | ⬜ | ⬜ |
| 4 | `/api/admin/ai-agents/stats` | ⬜ | ⬜ | ⬜ |
| 5 | `/api/admin/ai-agents/users` | ⬜ | ⬜ | ⬜ |
| 6 | `/api/admin/audit-logs` | ⬜ | ⬜ | ⬜ |
| 7 | `/api/admin/audit-logs/[logId]` | ⬜ | ⬜ | ⬜ |
| 8 | `/api/admin/audit-logs/stats` | ⬜ | ⬜ | ⬜ |
| 9 | `/api/admin/cluster-metrics` | ⬜ | ⬜ | ⬜ |
| 10 | `/api/admin/cluster/fix-coredns` | ⬜ | ⬜ | ⬜ |
| 11 | `/api/admin/coupons` | ⬜ | ⬜ | ⬜ |
| 12 | `/api/admin/database-options` | ⬜ | ⬜ | ⬜ |
| 13 | `/api/admin/database/assign` | ⬜ | ⬜ | ⬜ |
| 14 | `/api/admin/databases` | ⬜ | ⬜ | ⬜ |
| 15 | `/api/admin/kubernetes/clusters/delete` | ⬜ | ⬜ | ⬜ |
| 16 | `/api/admin/network-ddos/apps/delete` | ⬜ | ⬜ | ⬜ |
| 17 | `/api/admin/network-ddos/apps/read-all` | ⬜ | ⬜ | ⬜ |
| 18 | `/api/admin/object-storage/buckets/delete` | ⬜ | ⬜ | ⬜ |
| 19 | `/api/admin/object-storage/buckets/read-all` | ⬜ | ⬜ | ⬜ |
| 20 | `/api/admin/pricing/categories` | ⬜ | ⬜ | ⬜ |
| 21 | `/api/admin/pricing/promos` | ⬜ | ⬜ | ⬜ |
| 22 | `/api/admin/products` | ⬜ | ⬜ | ⬜ |
| 23 | `/api/admin/proxmox/hosts` | ⬜ | ⬜ | ⬜ |
| 24 | `/api/admin/proxmox/test-connection` | ⬜ | ⬜ | ⬜ |
| 25 | `/api/admin/proxmox/vms/create` | ⬜ | ⬜ | ⬜ |
| 26 | `/api/admin/servers` | ⬜ | ⬜ | ⬜ |
| 27 | `/api/admin/support/tickets` | ⬜ | ⬜ | ⬜ |
| 28 | `/api/admin/support/tickets/[ticketId]` | ⬜ | ⬜ | ⬜ |
| 29 | `/api/admin/users` | ⬜ | ⬜ | ⬜ |
| 30 | `/api/admin/users/[id]` | ⬜ | ⬜ | ⬜ |

**Known Issues to Fix:**
- `/api/admin/users` - Uses `select("*")` and maps user emails
- `/api/admin/users/[id]` - Returns full user profiles including auth data
- `/api/admin/databases` - Uses `select("*")` on database_clusters
- `/api/admin/proxmox/*` - May expose host credentials
- `/api/admin/servers` - Uses `select("*")` on proxmox_hosts

---

## 🔴 CRITICAL: Auth API Routes (23 routes)

| # | Route | Error Sanitized | No Sensitive Data | Status |
|---|-------|-----------------|-------------------|--------|
| 1 | `/api/auth/api-keys` | ⬜ | ✅ (masked) | ⬜ |
| 2 | `/api/auth/api-keys/[id]` | ⬜ | ⬜ | ⬜ |
| 3 | `/api/auth/callback` | ⬜ | ⬜ | ⬜ |
| 4 | `/api/auth/callback/gitlab` | ⬜ | ⬜ | ⬜ |
| 5 | `/api/auth/forgot-password` | ⬜ | ⬜ | ⬜ |
| 6 | `/api/auth/link` | ⬜ | ⬜ | ⬜ |
| 7 | `/api/auth/mfa/enroll` | ⬜ | ⬜ | ⬜ |
| 8 | `/api/auth/mfa/status` | ⬜ | ⬜ | ⬜ |
| 9 | `/api/auth/mfa/unenroll` | ⬜ | ⬜ | ⬜ |
| 10 | `/api/auth/mfa/verify` | ⬜ | ⬜ | ⬜ |
| 11 | `/api/auth/onboarding` | ⬜ | ⬜ | ⬜ |
| 12 | `/api/auth/onboarding/verify-otp` | ⬜ | ⬜ | ⬜ |
| 13 | `/api/auth/profile/change-password` | ⬜ | ⬜ | ⬜ |
| 14 | `/api/auth/profile/read` | ⬜ | ⬜ | ⬜ |
| 15 | `/api/auth/profile/update` | ⬜ | ⬜ | ⬜ |
| 16 | `/api/auth/providers` | ⬜ | ⬜ | ⬜ |
| 17 | `/api/auth/reset-password` | ⬜ | ⬜ | ⬜ |
| 18 | `/api/auth/signin/bitbucket` | ⬜ | ⬜ | ⬜ |
| 19 | `/api/auth/signin/email` | ⬜ | ⬜ | ⬜ |
| 20 | `/api/auth/signin/github` | ⬜ | ⬜ | ⬜ |
| 21 | `/api/auth/signin/gitlab` | ⬜ | ⬜ | ⬜ |
| 22 | `/api/auth/signout` | ⬜ | ⬜ | ⬜ |
| 23 | `/api/auth/signup` | ⬜ | ⬜ | ⬜ |

**Known Issues to Fix:**
- Multiple routes return raw `error.message`
- `/api/auth/profile/read` returns `identities` array with OAuth provider data
- `/api/auth/reset-password` exposes validation error details

---

## 🟠 HIGH: Billing API Routes (9 routes)

| # | Route | Error Sanitized | No Sensitive Data | Status |
|---|-------|-----------------|-------------------|--------|
| 1 | `/api/billing/coupons` | ⬜ | ⬜ | ⬜ |
| 2 | `/api/billing/coupons/redeem` | ⬜ | ⬜ | ⬜ |
| 3 | `/api/billing/create-checkout-session` | ⬜ | ⬜ | ⬜ |
| 4 | `/api/billing/payment-method` | ⬜ | ✅ (deprecated) | ✅ |
| 5 | `/api/billing/recurring` | ⬜ | ⬜ | ⬜ |
| 6 | `/api/billing/recurring/create-checkout-session` | ⬜ | ⬜ | ⬜ |
| 7 | `/api/billing/topup` | ⬜ | ⬜ | ⬜ |
| 8 | `/api/billing/transactions` | ⬜ | ⬜ | ⬜ |
| 9 | `/api/billing/webhook` | ⬜ | ⬜ | ⬜ |

**Sensitive Data to Verify:**
- No Stripe customer IDs in client responses
- No payment method details beyond last 4 digits
- Transaction history doesn't include internal payment IDs

---

## 🟠 HIGH: Git Provider OAuth Routes (12 routes)

| # | Route | Tokens Not Exposed | Error Sanitized | Status |
|---|-------|-------------------|-----------------|--------|
| 1 | `/api/github/branches` | ⬜ | ⬜ | ⬜ |
| 2 | `/api/github/repositories` | ⬜ | ⬜ | ⬜ |
| 3 | `/api/gitlab/app-auth` | ⬜ | ⬜ | ⬜ |
| 4 | `/api/gitlab/branches` | ⬜ | ⬜ | ⬜ |
| 5 | `/api/gitlab/callback` | ⬜ | ⬜ | ⬜ |
| 6 | `/api/gitlab/repositories` | ⬜ | ⬜ | ⬜ |
| 7 | `/api/bitbucket/app-auth` | ⬜ | ⬜ | ⬜ |
| 8 | `/api/bitbucket/branches` | ⬜ | ⬜ | ⬜ |
| 9 | `/api/bitbucket/callback` | ⬜ | ⬜ | ⬜ |
| 10 | `/api/bitbucket/repositories` | ⬜ | ⬜ | ⬜ |

**Sensitive Data to Verify:**
- OAuth access tokens never returned to client
- Refresh tokens never exposed
- Provider user IDs not leaked

---

## 🟡 MEDIUM: Service APIs - Compute (6 routes)

| # | Route | Auth | No Credentials | Error Safe | Status |
|---|-------|------|----------------|------------|--------|
| 1 | `/api/services/compute/options` | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | `/api/services/compute/vms/[id]` | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | `/api/services/compute/vms/[id]/console` | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | `/api/services/compute/vms/[id]/metrics` | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | `/api/services/compute/vms/create` | ⬜ | ⬜ | ⬜ | ⬜ |
| 6 | `/api/services/compute/vms/power` | ⬜ | ⬜ | ⬜ | ⬜ |

**Known Issues:**
- `/api/services/compute/vms/[id]/console` - Uses `select("*")` on proxmox_hosts
- `/api/services/compute/vms/[id]/metrics` - Uses `select("*")` on proxmox_hosts
- `/api/services/compute/options` - No auth (may be intentional)

---

## 🟡 MEDIUM: Service APIs - Database (20 routes)

| # | Route | Auth | No Passwords | Error Safe | Status |
|---|-------|------|--------------|------------|--------|
| 1 | `/api/services/database/create` | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | `/api/services/database/dbs/create` | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | `/api/services/database/dbs/delete` | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | `/api/services/database/dbs/list` | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | `/api/services/database/dbs/retrieve` | ⬜ | ⬜ | ⬜ | ⬜ |
| 6 | `/api/services/database/delete` | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | `/api/services/database/maintenance` | ⬜ | ⬜ | ⬜ | ⬜ |
| 8 | `/api/services/database/maintenance/read` | ⬜ | ⬜ | ⬜ | ⬜ |
| 9 | `/api/services/database/network/*` (3) | ⬜ | ⬜ | ⬜ | ⬜ |
| 10 | `/api/services/database/read` | ⬜ | ⬜ | ⬜ | ⬜ |
| 11 | `/api/services/database/read_all_owner` | ⬜ | ⬜ | ⬜ | ⬜ |
| 12 | `/api/services/database/users/*` (4) | ⬜ | ⬜ | ⬜ | ⬜ |

**Sensitive Data to Verify:**
- Connection strings don't include passwords
- CA certificates not exposed unless explicitly requested
- Database user passwords only shown once on creation

---

## 🟡 MEDIUM: Service APIs - Kubernetes (14 routes)

| # | Route | Auth | No Kubeconfig | Error Safe | Status |
|---|-------|------|---------------|------------|--------|
| 1 | `/api/services/kubernetes/clusters` | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | `/api/services/kubernetes/clusters/delete` | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | `/api/services/kubernetes/clusters/delete_node` | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | `/api/services/kubernetes/clusters/downloadkube` | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | `/api/services/kubernetes/clusters/init` | ⬜ | ⬜ | ⬜ | ⬜ |
| 6 | `/api/services/kubernetes/clusters/monitering` | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | `/api/services/kubernetes/clusters/read` | ⬜ | ⬜ | ⬜ | ⬜ |
| 8 | `/api/services/kubernetes/clusters/ready_by_id` | ⬜ | ⬜ | ⬜ | ⬜ |
| 9 | `/api/services/kubernetes/clusters/status` | ⬜ | ⬜ | ⬜ | ⬜ |
| 10 | `/api/services/kubernetes/clusters/update_project` | ⬜ | ⬜ | ⬜ | ⬜ |
| 11 | `/api/services/kubernetes/clusters/update-status` | ⬜ | ⬜ | ⬜ | ⬜ |
| 12 | `/api/services/kubernetes/manageip/*` (4) | ⬜ | ⬜ | ⬜ | ⬜ |

**Known Issues:**
- `/api/services/kubernetes/clusters/update-status` - Uses `select("*")` on clusters
- `/api/services/kubernetes/clusters/ready_by_id` - Uses `select("*")` on clusters
- Kubeconfig should only be returned via authorized download endpoint

---

## 🟡 MEDIUM: Service APIs - Platform Apps (25 routes)

| # | Route | Auth | No Secrets | Error Safe | Status |
|---|-------|------|------------|------------|--------|
| 1 | `/api/services/platform-apps/create` | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | `/api/services/platform-apps/delete` | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | `/api/services/platform-apps/deployments` | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | `/api/services/platform-apps/details` | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | `/api/services/platform-apps/env-vars/update` | ⬜ | ⬜ | ⬜ | ⬜ |
| 6 | `/api/services/platform-apps/events` | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | `/api/services/platform-apps/get` | ⬜ | ⬜ | ⬜ | ⬜ |
| 8+ | (17 more platform-apps routes) | ⬜ | ⬜ | ⬜ | ⬜ |

**Sensitive Data to Verify:**
- Environment variables never returned in GET responses
- Build logs don't contain secrets
- Git tokens not exposed in deployment info

---

## 🟡 MEDIUM: V1 Public API Routes (30+ routes)

All V1 routes are public API endpoints. Extra care needed:

| Category | Routes | Check |
|----------|--------|-------|
| `/api/v1/agents/*` | 1 route | ⬜ |
| `/api/v1/apps/*` | 5 routes | ⬜ |
| `/api/v1/databases/*` | 11 routes | ⬜ |
| `/api/v1/domains/*` | 12 routes | ⬜ |
| `/api/v1/kubernetes/*` | 2 routes | ⬜ |
| `/api/v1/network/spectrum/*` | 2 routes | ⬜ |
| `/api/v1/projects/*` | 2 routes | ⬜ |
| `/api/v1/storage/buckets/*` | 2 routes | ⬜ |

**Key Checks:**
- All use proper API key authentication
- Response data is filtered (no internal IDs)
- Validation errors use `v1TransformValidationError`
- No stack traces in error responses

---

## 🟡 MEDIUM: Webhook Routes (5 routes)

| # | Route | Error Sanitized | No Internal Data | Status |
|---|-------|-----------------|------------------|--------|
| 1 | `/api/webhooks/git/bitbucket` | ⬜ | ⬜ | ⬜ |
| 2 | `/api/webhooks/git/github` | ⬜ | ⬜ | ⬜ |
| 3 | `/api/webhooks/git/gitlab` | ⬜ | ⬜ | ⬜ |
| 4 | `/api/webhooks/platform-apps/deployment-record` | ⬜ | ⬜ | ⬜ |
| 5 | `/api/webhooks/register` | ⬜ | ⬜ | ⬜ |

**Known Issues:**
- Git webhooks return `error.message` in catch blocks
- `/api/webhooks/register` returns `error.message` on lines 104, 159

---

## 🟢 LOW: AI Agent Routes (12 routes)

| # | Route | Auth | Validation Safe | Error Safe | Status |
|---|-------|------|-----------------|------------|--------|
| 1 | `/api/ai-agents` | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | `/api/ai-agents/[id]` | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | `/api/ai-agents/[id]/stats` | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | `/api/ai-agents/[id]/test` | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | `/api/ai-agents/api-keys` | ⬜ | ✅ (masked) | ⬜ | ⬜ |
| 6 | `/api/ai-agents/api-keys/[id]` | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | `/api/ai-agents/platform-models` | ⬜ | ⬜ | ⬜ | ⬜ |
| 8 | `/api/ai-model-keys` | ⬜ | ✅ (masked) | ⬜ | ⬜ |
| 9 | `/api/ai-model-keys/[id]` | ⬜ | ⬜ | ⬜ | ⬜ |
| 10 | `/api/knowledge-bases` | ⬜ | ⬜ | ⬜ | ⬜ |
| 11 | `/api/knowledge-bases/[id]` | ⬜ | ⬜ | ⬜ | ⬜ |
| 12 | `/api/knowledge-bases/[id]/documents` | ⬜ | ⬜ | ⬜ | ⬜ |

**Known Issues:**
- Validation errors exposed with full details
- Console logging validation errors

---

## Implementation Plan - Step by Step

### Step 1: Create Error Sanitizer Utility ✅
**Priority:** 🔴 Critical (Foundation for all other fixes)  
**Location:** `lib/api/error-sanitizer.ts`

Tasks:
- [x] Create `sanitizeError()` function
- [x] Create `sanitizeValidationError()` function  
- [x] Create `sanitizeAuthError()` function
- [x] Handle production vs development modes
- [x] Export utility for use across all routes

**Completed:** April 13, 2026

---

### Step 2: Fix Auth Routes Error Messages ✅
**Priority:** 🔴 Critical  
**Routes to fix:** 8 files, ~15 error returns

| File | Lines | Status |
|------|-------|--------|
| `auth/signout/route.ts` | 28 | ✅ |
| `auth/signup/route.ts` | 28 | ✅ |
| `auth/mfa/unenroll/route.ts` | 47, 94, 108 | ✅ |
| `auth/mfa/verify/route.ts` | 63, 89, 103 | ✅ |
| `auth/mfa/status/route.ts` | 24, 32, 57 | ✅ |
| `auth/mfa/enroll/route.ts` | 90, 101, 131 | ✅ |
| `auth/link/route.ts` | 102, 104, 141 | ✅ |
| `auth/profile/change-password/route.ts` | 70 | ✅ |

**Completed:** April 13, 2026

---

### Step 3: Fix Validation Error Exposure ✅
**Priority:** 🟠 High  
**Routes to fix:** 8 files

| File | Lines | Status |
|------|-------|--------|
| `ai-agents/route.ts` | 117-119 | ✅ |
| `ai-agents/[id]/route.ts` | 129 | ✅ |
| `ai-agents/[id]/test/route.ts` | 84 | ✅ |
| `knowledge-bases/route.ts` | 91 | ✅ |
| `knowledge-bases/[id]/route.ts` | 118 | ✅ |
| `knowledge-bases/[id]/documents/route.ts` | 158 | ✅ |
| `v1/agents/[endpointId]/chat/route.ts` | 171 | ✅ |
| `auth/reset-password/route.ts` | 21 | ✅ |

**Also fixed:** Removed debug `console.log` body dump in `ai-agents/route.ts`  
**Completed:** April 13, 2026

---

### Step 4: Fix `select("*")` Queries ✅
**Priority:** 🔴 Critical  
**Tables affected:** proxmox_hosts, clusters, database_clusters, user_profiles

| File | Line | Table | Status |
|------|------|-------|--------|
| `compute/vms/[id]/console/route.ts` | 90 | proxmox_hosts | ✅ |
| `compute/vms/[id]/metrics/route.ts` | 126 | proxmox_hosts | ✅ |
| `admin/servers/route.ts` | 251, 333 | proxmox_hosts | ✅ |
| `admin/proxmox/vms/create/route.ts` | 223 | proxmox_hosts | ✅ |
| `admin/proxmox/test-connection/route.ts` | 85 | proxmox_hosts | ✅ |
| `compute/vms/create/route.ts` | 237 | proxmox_hosts | ✅ |
| `admin/databases/route.ts` | 181 | database_cluster | ✅ |
| `kubernetes/clusters/update-status/route.ts` | 34 | clusters | ✅ |
| `kubernetes/clusters/ready_by_id/route.ts` | 23 | clusters | ✅ |

**Notes:**
- proxmox_hosts: credentials still selected server-side (needed for Proxmox API calls) but never returned to client
- database_cluster: `password` and `ca_certificate` stripped from PUT response with `Object.fromEntries` filter
- clusters: only fields actually used are now selected

**Completed:** April 13, 2026

---

### Step 5: Filter API Response Data ✅
**Priority:** 🟠 High

| File | Issue | Fix | Status |
|------|-------|-----|--------|
| `auth/profile/read/route.ts` | Returns full `identities` (OAuth tokens) + raw error catch | Removed `identities`, added `logError`+`sanitizeError` | ✅ |
| `admin/users/route.ts` | `select("*")` on user_profiles (GET + PATCH) | Explicit cols: id, username, display_name, avatar, roles, suspend, created_at | ✅ |
| `admin/users/[id]/route.ts` | `select("*")` on user_profiles | Same explicit column list | ✅ |

**Completed:** April 13, 2026

---

### Step 6: Fix Webhook Error Responses ✅
**Priority:** 🟡 Medium

| File | Lines | Status |
|------|-------|--------|
| `webhooks/git/github/route.ts` | 254 | ✅ |
| `webhooks/git/gitlab/route.ts` | 244 | ✅ |
| `webhooks/git/bitbucket/route.ts` | 244 | ✅ |
| `webhooks/register/route.ts` | 104, 159, 221 (3 catch blocks) | ✅ |
| `billing/webhook/route.ts` | Reviewed — response bodies use static strings; `err.message` only goes to internal DB audit function | ✅ no change needed |

**Also fixed:** `auth/link/route.ts` line 141 — code collapse formatting corrected  
**Completed:** April 13, 2026

---

### Step 7: Audit All Admin Routes ✅
**Priority:** 🟠 High  
**Routes:** 30 audited

**Findings & Fixes:**

| File | Issue | Status |
|------|-------|--------|
| `admin/products/route.ts` | Local `getErrorMessage()` helper leaked `error.message` in 4 responses (GET/POST/PUT/DELETE) | ✅ Replaced with `sanitizeError` |
| `admin/pricing/promos/route.ts` | Same local helper, 4 responses | ✅ Replaced |
| `admin/pricing/categories/route.ts` | Same local helper, 4 responses | ✅ Replaced |
| `admin/audit-logs/route.ts` | `details: errorMessage` (raw) in response | ✅ Fixed |
| `admin/audit-logs/[logId]/route.ts` | `details: errorMessage` (raw) in response | ✅ Fixed |
| `admin/audit-logs/stats/route.ts` | `details: errorMessage` (raw) in response | ✅ Fixed |
| `admin/cluster-metrics/route.ts` | `error: errorMessage` (raw) in response | ✅ Fixed |
| `admin/cluster/fix-coredns/route.ts` | `detail: message` (raw) + stack pattern in response | ✅ Fixed |
| `admin/network-ddos/apps/delete/route.ts` | `message: errorMessage` (raw) in response | ✅ Fixed |
| `admin/object-storage/buckets/delete/route.ts` | `message: errorMessage` (raw) in response | ✅ Fixed |
| `admin/object-storage/buckets/read-all/route.ts` | `message: errorMessage` (raw) in response | ✅ Fixed |
| `admin/kubernetes/clusters/delete/route.ts` | `message: errorMessage` (raw) in response | ✅ Fixed |
| `admin/ai-agents/agents/route.ts` | `err.message` in response | ✅ Fixed |
| `admin/ai-agents/users/route.ts` | `err.message` in response | ✅ Fixed |
| `admin/ai-agents/stats/route.ts` | `err.message` in response | ✅ Fixed |
| `admin/coupons/route.ts` | `error.message` in 4 responses | ✅ Fixed |
| `admin/database/assign/route.ts` | Raw `e.message` in billing error detail | ✅ Fixed |
| `admin/database-options/route.ts` | `error.response?.data?.message \|\| error.message` in response | ✅ Fixed |
| `admin/proxmox/test-connection/route.ts` | `err.message` + `err.stack` exposed in response | ✅ Fixed (stack removed) |
| `admin/proxmox/hosts/route.ts` | Reviewed — response bodies already use static strings | ✅ No change needed |
| `admin/users/route.ts` | Already fixed in Step 5 | ✅ |
| `admin/users/[id]/route.ts` | Already fixed in Step 5 | ✅ |
| `admin/databases/route.ts` | Already fixed in Step 4/5 | ✅ |
| `admin/proxmox/vms/create/route.ts` | Already fixed in Step 4 | ✅ |
| `admin/servers/route.ts` | Already fixed in Step 4 | ✅ |
| `admin/ai-agents/models/route.ts` | `console.error` only (not in response body) | ✅ No change needed |
| `admin/ai-agents/models/[id]/route.ts` | `console.error` only (not in response body) | ✅ No change needed |
| `admin/support/tickets/route.ts` | `console.error` only | ✅ No change needed |
| `admin/support/tickets/[ticketId]/route.ts` | `console.error` only | ✅ No change needed |
| `admin/proxmox/vms/create/route.ts` | `provisionErr.message` goes to DB status update, not response | ✅ No change needed |

**Completed:** April 13, 2026

---

### Step 8: Audit Git Provider Routes ⬜
**Priority:** 🟠 High  
**Routes:** 12 total

- [ ] Verify tokens never returned to client
- [ ] Check callback routes don't expose tokens
- [ ] Review error responses

---

### Step 9: Final Testing & Verification ⬜
**Priority:** 🔴 Critical

- [ ] Test all modified endpoints
- [ ] Run in production mode to verify sanitization
- [ ] Check no sensitive data in responses
- [ ] Verify error responses are generic
- [ ] Update build and run `npm run build`

---

## Safe Columns Reference

### `proxmox_hosts` - Safe to Return:
```
id, name, host_url, allow_insecure_tls, node, storage, bridge, 
gateway_ip, dns_primary, dns_secondary, template_vmid, is_active
```

### `proxmox_hosts` - NEVER Return:
```
password, token_id, token_secret, username
```

### `clusters` - Safe to Return:
```
id, cluster_id, clusterName, status, k8sVersion, created_at, 
owner_id, project_id, region, node_config, cni_plugin
```

### `clusters` - NEVER Return:
```
kubeconfig, vm_password, password
```

### `database_clusters` - NEVER Return:
```
password, ca_certificate
```

### `user_profiles` - Review Before Returning:
```
id, username, display_name, avatar - OK
roles, suspend - Admin only
bio, discord, steam - Check privacy settings
```

---

## Progress Tracker

| Step | Description | Items | Completed | Status |
|------|-------------|-------|-----------|--------|
| 1 | Create Error Sanitizer Utility | 4 tasks | 4 | ✅ |
| 2 | Fix Auth Routes Error Messages | 8 files | 8 | ✅ |
| 3 | Fix Validation Error Exposure | 8 files | 8 | ✅ |
| 4 | Fix `select("*")` Queries | 11 queries | 9 | ✅ |
| 5 | Filter API Response Data | 3 files | 0 | ⬜ |
| 6 | Fix Webhook Error Responses | 5 files | 0 | ⬜ |
| 7 | Audit All Admin Routes | 34 routes | 0 | ⬜ |
| 8 | Audit Git Provider Routes | 12 routes | 2 | ⬜ |
| 9 | Final Testing & Verification | 5 tasks | 0 | ⬜ |
| **Total** | | **90** | **14** | **16%** |

---

## Quick Start - Next Action

**Current Step:** Step 5 - Filter API Response Data (`auth/profile/read`, `admin/users`)

---

## Notes

- Mark items with ✅ when fixed and tested
- Mark items with ⬜ for pending
- Mark items with ⚠️ if needs discussion
- Mark steps with 🔄 when in progress

### Status Legend:
- ⬜ Not started
- 🔄 In progress
- ✅ Completed
- ⚠️ Needs discussion

### Items Already Verified ✅:
1. `/api/auth/api-keys` - Keys are masked, only shown once on creation
2. `/api/ai-model-keys` - Keys are masked with `••••••••` prefix

### Additional Findings:
<!-- Add any new issues discovered during review -->

