# Dockerfile Framework Support - Complete Guide

## 🎯 Overview

Your platform now supports **4 deployment scenarios** to handle any project:

| Scenario | User Action | What Happens |
|----------|-------------|--------------|
| **1. Custom Dockerfile** | Select "Dockerfile" | Uses existing Dockerfile (any language) |
| **2. Framework + Dockerfile** | Select framework (Next.js, etc) | Detects & uses existing Dockerfile |
| **3. Framework Auto-gen** | Select framework | Generates framework-specific Dockerfile |
| **4. Invalid** | Select "Dockerfile" but none exists | Build fails with clear error message |

---

## 📋 Scenario Details

### Scenario 1: Project with Dockerfile (Unknown Framework)
**Example:** Plausible Analytics (Elixir), Mastodon (Ruby), Gitea (Go)

```
User Input:
  framework: "Dockerfile"
  repository: https://github.com/plausible/analytics

Flow:
  1. ✅ Creates generic Docker pipeline
  2. ✅ Clones repository
  3. ✅ Validates Dockerfile exists
  4. ✅ Builds with Kaniko (no framework assumptions)
  5. ✅ Deploys to Kubernetes

Result: ✅ Works for ANY language (Elixir, Go, Rust, Ruby, PHP, Java, etc.)
```

### Scenario 2: Framework Project with Custom Dockerfile
**Example:** Next.js app with optimized custom Dockerfile

```
User Input:
  framework: "Next.js"
  repository: https://github.com/user/custom-nextjs

Flow:
  1. ✅ Creates Next.js pipeline
  2. ✅ Clones repository
  3. ✅ "Prepare Dockerfile" stage detects existing Dockerfile
  4. ✅ Shows: "✓ FOUND EXISTING DOCKERFILE"
  5. ✅ Uses project's Dockerfile instead of generating
  6. ✅ Still passes framework-specific env vars

Result: ✅ Respects custom optimizations while supporting framework features
```

### Scenario 3: Framework Project without Dockerfile
**Example:** Standard Next.js/Vue/React app from template

```
User Input:
  framework: "Next.js"
  repository: https://github.com/user/nextjs-app

Flow:
  1. ✅ Creates Next.js pipeline
  2. ✅ Clones repository
  3. ✅ "Prepare Dockerfile" stage generates Next.js Dockerfile
  4. ✅ Detects Node version, package manager
  5. ✅ Builds with generated Dockerfile
  6. ✅ Deploys to Kubernetes

Result: ✅ Zero-config deployment for standard projects
```

### Scenario 4: Invalid Configuration
**Example:** User selects "Dockerfile" but repository has none

```
User Input:
  framework: "Dockerfile"
  repository: https://github.com/user/no-dockerfile

Flow:
  1. ✅ Creates generic Docker pipeline
  2. ✅ Clones repository
  3. ❌ "Validate Prerequisites" stage fails
  4. ❌ Clear error message with suggestions

Error Message:
  "ERROR: No Dockerfile found!
   
   This pipeline requires a Dockerfile in the repository root.
   
   If your project uses a supported framework (Next.js, Vue, etc.),
   please select the appropriate framework instead of 'Dockerfile'.
   
   Supported auto-generated frameworks:
     - Next.js, Nuxt.js, Vite-React, Vue.js, Angular, SvelteKit
     - Node.js/Express, Python (Django/Flask/FastAPI)"

Result: ✅ User gets clear guidance on how to fix
```

---

## 🔧 Technical Implementation

### 1. New Framework Option
```typescript
// lib/validation/platform-apps.ts
framework: z.enum([
  "Next.js", "Nuxt.js", "Vite-React", "Vue.js", 
  "Angular", "SvelteKit", "Node.js", "python",
  "Static",
  "Dockerfile" // ← NEW: For custom Dockerfiles
])
```

### 2. Generic Docker Pipeline
```typescript
// lib/jenkins/pipelines/dockerfile.ts
export function createDockerfilePipeline(
  name: string,
  gitUrl: string,
  branch: string,
  size: string = 'small',
  // ...
): string {
  // Pipeline that:
  // 1. Validates Dockerfile exists
  // 2. Builds with Kaniko (no assumptions)
  // 3. Deploys to K8s with standard resources
}
```

### 3. Framework Pipelines with Dockerfile Detection
```typescript
// lib/jenkins/dockerfiles/index.ts
export function generateStaticSiteDockerfileStage(...): string {
  return `
if [ -f Dockerfile ]; then
  echo "=========================================
  echo "✓ FOUND EXISTING DOCKERFILE"
  echo "========================================="
  echo "Using project's existing Dockerfile..."
  cat Dockerfile
  export DOCKERFILE_EXISTS=true
else
  echo "No Dockerfile found - generating..."
  # Generate framework-specific Dockerfile
  export DOCKERFILE_EXISTS=false
fi
`.trim();
}
```

### 4. Pipeline Selection Logic
```typescript
// lib/services/jenkins.ts
private static selectPipeline(...): string {
  switch (framework.toLowerCase()) {
    case 'dockerfile':
    case 'custom':
      return createDockerfilePipeline(...); // Generic
    
    case 'next.js':
      return createNextJsPipeline(...); // Has Dockerfile detection
    
    // ... other frameworks
  }
}
```

---

## 🚀 Usage Examples

### Example 1: Deploy Plausible Analytics (Elixir)
```typescript
POST /api/services/platform-apps/create
{
  "name": "analytics-test",
  "framework": "Dockerfile", // ← Select this!
  "repository_url": "https://github.com/plausible/analytics",
  "branch": "master",
  "port": 8000,
  "env_vars": [
    { "key": "BASE_URL", "value": "https://analytics-test.galaxyhvh.com" },
    { "key": "SECRET_KEY_BASE", "value": "..." }
  ]
}
```

### Example 2: Deploy Next.js with Custom Dockerfile
```typescript
POST /api/services/platform-apps/create
{
  "name": "my-nextjs-app",
  "framework": "Next.js", // ← Framework-specific
  "repository_url": "https://github.com/user/nextjs-custom",
  "branch": "main",
  // Pipeline will detect and use existing Dockerfile
}
```

### Example 3: Deploy Standard Vue App
```typescript
POST /api/services/platform-apps/create
{
  "name": "my-vue-app",
  "framework": "Vue.js", // ← Auto-generates Dockerfile
  "repository_url": "https://github.com/user/vue-app",
  "branch": "main",
  "env_vars": [
    { "key": "VITE_API_URL", "value": "https://api.example.com" }
  ]
}
```

---

## 📊 Decision Tree

```
Does project have Dockerfile?
├─ YES
│  ├─ Is framework known/supported?
│  │  ├─ YES → Select framework (e.g., "Next.js")
│  │  │         Pipeline detects Dockerfile and uses it
│  │  └─ NO  → Select "Dockerfile"
│  │            Uses generic Docker pipeline
│  └─ Unsure? → Select "Dockerfile" (safest option)
│
└─ NO
   ├─ Is framework supported?
   │  ├─ YES → Select framework
   │  │         Pipeline generates Dockerfile automatically
   │  └─ NO  → Cannot deploy
   │            (Add Dockerfile to project first)
   └─ Selected "Dockerfile"? → Build fails with clear error
```

---

## ✅ What This Solves

### Before (Problems):
1. ❌ Plausible (Elixir) failed - selected "Static", got Node.js runtime
2. ❌ No way to deploy non-Node.js projects
3. ❌ Custom Dockerfiles were overwritten by generators
4. ❌ Confusing errors when framework mismatched

### After (Solutions):
1. ✅ Any project with Dockerfile works (select "Dockerfile")
2. ✅ Supports Elixir, Go, Rust, Ruby, PHP, Java, etc.
3. ✅ Framework pipelines respect existing Dockerfiles
4. ✅ Clear error messages guide users to correct selection

---

## 🎯 Frontend Integration

To complete this feature, update the frontend framework dropdown:

```typescript
// components/platform-apps/create-form.tsx
const FRAMEWORKS = [
  { value: "Dockerfile", label: "Dockerfile (Custom)", description: "Project has existing Dockerfile (any language)" },
  { value: "Next.js", label: "Next.js", description: "React framework with SSR" },
  { value: "Vue.js", label: "Vue.js", description: "Progressive JavaScript framework" },
  // ... other frameworks
];
```

---

## 🔍 Testing Checklist

- [ ] Deploy project with Dockerfile (Elixir/Go/Rust)
- [ ] Deploy Next.js with custom Dockerfile
- [ ] Deploy Vue without Dockerfile (auto-gen)
- [ ] Try "Dockerfile" on project without Dockerfile (should fail clearly)
- [ ] Verify env vars work in generic Docker pipeline
- [ ] Check resource limits (small/medium/large)
- [ ] Verify webhooks and deployment records

---

## 📝 Summary

**What Changed:**
1. Added "Dockerfile" framework option
2. Created generic Docker pipeline (language-agnostic)
3. Enhanced framework pipelines to detect existing Dockerfiles
4. Improved error messages for invalid configurations

**Benefits:**
- ✅ Supports ANY language/runtime (not just Node.js)
- ✅ Respects custom optimizations
- ✅ Maintains zero-config for standard frameworks
- ✅ Clear user guidance when misconfigured
- ✅ Competitive with Vercel/Netlify/Railway

**Migration:**
- No breaking changes
- Existing deployments work as-is
- New "Dockerfile" option is additive
