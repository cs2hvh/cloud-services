# Framework Detection Edge Cases - Gap Analysis

## 🔍 Current Flow Analysis

### Detection Logic (app/api/detect-framework/route.ts)

```typescript
// Step 1: Run all detection functions
const result = {
  framework: "Static",  // DEFAULT
  version: "",
  language: "Static"
};

for (detectFunction of detectionFunctions) {
  // Check package.json → Next.js, React, Vue, etc.
  // Check requirements.txt → Django, Flask, FastAPI
  // Check Dockerfile → hasDockerfile = true
  // Check composer.json → Laravel, PHP
  // Check Gemfile → Rails, Ruby
}

// Step 2: Override if Dockerfile-only project
if (result.hasDockerfile && result.framework === "Static") {
  result.framework = "Dockerfile";
  result.language = "Docker";
}

return result;
```

---

## 📊 All Possible Scenarios

### ✅ **Scenario 1: Known Framework Detected**

**Example:** Next.js project (has package.json with "next" dependency)

```
Detection: { framework: "Next.js", hasDockerfile: false/true }
           ↓
JenkinsService.selectPipeline()
           ↓
Case 'nextjs' → createNextJsPipeline() ✅
           ↓
Pipeline checks for existing Dockerfile first, auto-generates if missing ✅
```

**Status:** ✅ WORKS PERFECTLY

---

### ✅ **Scenario 2: Dockerfile-Only Project** (NEW - just implemented)

**Example:** Go/Elixir/Rust project (has Dockerfile, no package.json/requirements.txt)

```
Detection: { framework: "Dockerfile", hasDockerfile: true }
           ↓
JenkinsService.selectPipeline()
           ↓
Case 'dockerfile' → createDockerfilePipeline() ✅
           ↓
Builds existing Dockerfile with Kaniko ✅
```

**Status:** ✅ WORKS PERFECTLY (after our fix)

---

### ❌ **Scenario 3: Static Site (HTML/CSS/JS only)**

**Example:** Pure HTML/CSS/JS site (no framework, no build step, no Dockerfile)

```
Detection: { framework: "Static", hasDockerfile: false }
           ↓
JenkinsService.selectPipeline()
           ↓
Case 'static' → ❌ NOT FOUND
           ↓
Falls to default → createNodeJsPipeline() ❌ WRONG!
           ↓
FAILURE: Node.js pipeline expects package.json and runs npm install
```

**Status:** ❌ **BROKEN** - No pipeline for static sites!

**Impact:**
- Pure HTML sites cannot deploy
- Landing pages, documentation sites fail
- User gets confusing error about missing package.json

---

### ❌ **Scenario 4: Unknown Framework WITHOUT Dockerfile**

**Example:** PHP project (no Dockerfile, no composer.json detected)

```
Detection: { framework: "Static", hasDockerfile: false }
           ↓
JenkinsService.selectPipeline()
           ↓
Case 'static' → ❌ NOT FOUND
           ↓
Falls to default → createNodeJsPipeline() ❌ WRONG!
           ↓
FAILURE: Tries to run npm install on PHP project
```

**Status:** ❌ **BROKEN** - No handling for unknown frameworks

**Impact:**
- Laravel projects without Dockerfile fail
- Custom PHP/Ruby/Java projects fail
- Misleading error messages

---

### ❓ **Scenario 5: Empty Repository**

**Example:** Brand new repo with no files

```
Detection: { framework: "Static", hasDockerfile: false }
           ↓
Same as Scenario 3 ❌
```

**Status:** ❌ **BROKEN** - Same as Scenario 3

---

### ✅ **Scenario 6: Known Framework WITH Custom Dockerfile**

**Example:** Next.js project with custom multi-stage Dockerfile

```
Detection: { framework: "Next.js", hasDockerfile: true }
           ↓
User has 2 options:
  A) Keep "Next.js" selected → Next.js pipeline finds Dockerfile, uses it ✅
  B) Change to "Dockerfile" → Generic pipeline builds custom Dockerfile ✅
```

**Status:** ✅ WORKS PERFECTLY

---

## 🛠️ Solutions for Broken Scenarios

### Solution 1: Add Static Site Pipeline

**Create:** `lib/jenkins/pipelines/static-site.ts`

**Purpose:** Deploy pure HTML/CSS/JS using nginx

```typescript
export function createStaticSitePipeline(...) {
  return `
  // Clone repo
  // Copy files to nginx:alpine image
  // No build step needed
  // Deploy to K8s with nginx serving files
  `;
}
```

**Update JenkinsService:**
```typescript
case 'static':
  console.log(`[JenkinsService] Using STATIC SITE pipeline (nginx)`);
  return createStaticSitePipeline(...);
```

**Pros:**
- ✅ Pure HTML sites work
- ✅ Fast deployment (no build)
- ✅ Small nginx:alpine image

**Cons:**
- ⚠️ Another pipeline to maintain
- ⚠️ Need to handle SPA routing

---

### Solution 2: Require Dockerfile for Unknown Frameworks

**Update Detection Logic:**
```typescript
// After running all detections...
if (result.framework === "Static" && !result.hasDockerfile) {
  // Return error or special flag
  result.requiresDockerfile = true;
  result.framework = "Unknown";
}
```

**Update Frontend:**
```typescript
if (data.framework === "Unknown" && data.requiresDockerfile) {
  toast.error(
    "Cannot detect framework. Please add a Dockerfile to your repository."
  );
}
```

**Pros:**
- ✅ Clear error message
- ✅ Forces best practices (Dockerfile)
- ✅ No ambiguous "Static" fallback

**Cons:**
- ⚠️ Blocks simple HTML sites
- ⚠️ Extra step for users

---

### Solution 3: Smart Default Handling (RECOMMENDED)

**Strategy:**
1. If `framework === "Static"` AND `hasDockerfile === false` → **Require Dockerfile**
2. Create a minimal static site helper (optional Dockerfile generation)

**Update Detection:**
```typescript
// After all detections
if (result.framework === "Static") {
  if (result.hasDockerfile) {
    // Has Dockerfile but no framework → Use it
    result.framework = "Dockerfile";
    result.language = "Docker";
  } else {
    // No framework AND no Dockerfile → Flag as unknown
    result.framework = "Unknown";
    result.requiresDockerfile = true;
  }
}
```

**Update JenkinsService:**
```typescript
case 'unknown':
case 'static':
  // Show helpful error
  throw new Error(
    `Cannot deploy: No supported framework detected and no Dockerfile found.\n\n` +
    `Options:\n` +
    `1. Add a Dockerfile to your repository\n` +
    `2. Select a framework manually (Next.js, Vue, etc.)\n` +
    `3. Use the "Dockerfile" option for custom builds`
  );
```

**Pros:**
- ✅ Clear error for unsupported projects
- ✅ Guides users to solutions
- ✅ No ambiguous fallback
- ✅ Prevents confusing Node.js pipeline failures

**Cons:**
- ⚠️ Pure HTML sites need manual Dockerfile (but very simple)

---

## 📋 Comparison Table

| Scenario | Current Behavior | Solution 1 (Static Pipeline) | Solution 2 (Require Dockerfile) | Solution 3 (Smart Default) ✅ |
|----------|------------------|------------------------------|--------------------------------|------------------------------|
| HTML/CSS/JS site | ❌ Fails (tries npm install) | ✅ Works (nginx) | ❌ Blocked | ⚠️ Clear error + guidance |
| PHP without Dockerfile | ❌ Fails (wrong pipeline) | ❌ Still fails | ✅ Clear error | ✅ Clear error + guidance |
| Go with Dockerfile | ✅ Works | ✅ Works | ✅ Works | ✅ Works |
| Empty repo | ❌ Fails | ❌ Fails | ✅ Clear error | ✅ Clear error + guidance |
| Next.js | ✅ Works | ✅ Works | ✅ Works | ✅ Works |

---

## 🎯 Recommended Implementation

### **Solution 3: Smart Default Handling**

This is the cleanest approach that:
- ✅ Prevents silent failures
- ✅ Provides clear error messages
- ✅ Guides users to correct solutions
- ✅ Doesn't add pipeline complexity

---

## 🔧 Implementation Steps

### Step 1: Update Detection API

**File:** `app/api/detect-framework/route.ts`

```typescript
// After running all detection functions
if (result.framework === "Static") {
  if (result.hasDockerfile) {
    // Has Dockerfile but no framework detected → Use generic pipeline
    result.framework = "Dockerfile";
    result.language = "Docker";
  } else {
    // No framework AND no Dockerfile → Cannot deploy
    result.framework = "Unknown";
    result.requiresDockerfile = true;
  }
}

return result;
```

---

### Step 2: Update Frontend Detection Handler

**File:** `components/dashboard/apps/new.tsx`

```typescript
const detectFramework = useCallback(async (...) => {
  const response = await fetch("/api/detect-framework", {...});
  
  if (response.ok) {
    const data = await response.json();
    
    if (data.framework === "Unknown" || data.requiresDockerfile) {
      toast.error(
        "Framework not detected",
        {
          description: "Please add a Dockerfile or select a framework manually"
        }
      );
      setFramework(""); // Don't auto-select anything
      return;
    }
    
    // Normal framework mapping...
  }
});
```

---

### Step 3: Add Validation in Create API

**File:** `app/api/services/platform-apps/create/route.ts`

```typescript
// Before creating Jenkins job
if (!framework || framework === "Unknown" || framework === "Static") {
  return NextResponse.json(
    {
      error: "No framework selected",
      message: "Please select a framework or add a Dockerfile to your repository",
      hint: "Supported: Next.js, Vue, React, Python, or custom Dockerfile"
    },
    { status: 400 }
  );
}
```

---

### Step 4: Update JenkinsService (Safety Net)

**File:** `lib/services/jenkins.ts`

```typescript
private static selectPipeline(...) {
  const fw = framework?.toLowerCase();
  
  // Prevent unknown/static from falling through
  if (!fw || fw === 'unknown' || fw === 'static') {
    throw new Error(
      `Cannot create pipeline: Framework "${framework}" is not supported.\n\n` +
      `Please:\n` +
      `1. Add a Dockerfile to your repository, OR\n` +
      `2. Select a supported framework (Next.js, Vue, Python, etc.)`
    );
  }
  
  // Rest of switch cases...
}
```

---

## 📝 Summary of Changes

### Current Issues:
1. ❌ "Static" framework falls through to Node.js pipeline (wrong)
2. ❌ Unknown frameworks silently fail with confusing errors
3. ❌ Pure HTML sites cannot deploy

### After Solution 3:
1. ✅ "Static" with Dockerfile → Becomes "Dockerfile" framework
2. ✅ "Static" without Dockerfile → Clear error, helpful guidance
3. ✅ Unknown frameworks → Prevented with validation errors
4. ✅ All scenarios have defined behavior

### Files to Update:
1. `app/api/detect-framework/route.ts` - Update detection logic
2. `components/dashboard/apps/new.tsx` - Add Unknown framework handling
3. `app/api/services/platform-apps/create/route.ts` - Add validation
4. `lib/services/jenkins.ts` - Add safety net error

### Estimated Time: 15 minutes

### Breaking Changes: **NONE** (only improves error handling)
