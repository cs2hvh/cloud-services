# Jenkins Container Management

This directory contains configuration and tooling for managing Jenkins pod template containers used in the CI/CD pipeline.

## 📦 Container Inventory

### Currently in Jenkins (Pod Template: `common-agent`)

| Container | Image | Memory | CPU | Used By Security |
|-----------|-------|--------|-----|------------------|
| **git** | alpine/git:latest | 1Gi | 500m | ✅ 5 stages |
| **kaniko** | gcr.io/kaniko-project/executor:v1.24.0-debug | 6Gi | 1 core | ❌ Build only |
| **kubectl** | alpine/k8s:1.28.0 | 256Mi | 500m | ❌ Deploy only |
| **trivy** | aquasec/trivy:0.48.0 | 1Gi | 500m | ✅ IMAGE-SCAN |
| **jnlp** | jenkins/inbound-agent | 512Mi | 500m | ❌ Jenkins agent |

**Total Resources:** 8.75 Gi memory, 3.0 CPU cores

### Recommended to Add

| Container | Image | Memory | CPU | Benefit |
|-----------|-------|--------|-----|---------|
| **hadolint** | hadolint/hadolint:v2.12.0-alpine | 128Mi | 200m | Faster builds, better security |
| **gitleaks** | zricethezav/gitleaks:v8.18.0 | 256Mi | 300m | No runtime downloads, faster builds |

**Additional Resources Needed:** +384 Mi memory, +0.5 CPU cores

## 🔍 Security Stage Container Usage

| Security Stage | Primary Container | Downloads at Runtime | Recommendation |
|----------------|-------------------|----------------------|----------------|
| SECRET-SCAN | git | gitleaks v8.18.0 | ⭐ Add gitleaks container |
| STATIC-ANALYSIS | git | bandit (Python), eslint (Node) | ✅ Works well |
| DEPENDENCY-SCAN | git | pip-audit (Python) | ✅ Works well |
| DOCKERFILE-LINT | git | hadolint v2.12.0 | ⭐ Add hadolint container |
| IMAGE-SCAN | trivy | None | ✅ Perfect |
| K8S-VALIDATION | git | None | ✅ Perfect |

## 🛠️ Usage

### View Container Report

```bash
npx tsx infra/jenkins/show-jenkins-containers.ts
```

### Export as JSON

```bash
npx tsx infra/jenkins/export-jenkins-containers.ts > containers.json
```

### Export as Markdown

```bash
npx tsx infra/jenkins/export-jenkins-containers.ts --format=markdown > CONTAINERS.md
```

### Export as YAML (for Jenkins)

```bash
npx tsx infra/jenkins/export-jenkins-containers.ts --format=yaml > containers.yaml
```

### Programmatic Access

```typescript
import { getContainerUsageReport } from '@/lib/jenkins/security';

const report = getContainerUsageReport();

// Check which containers are in Jenkins
const inJenkins = Object.values(report.inJenkins)
  .filter(c => c.inJenkins);

// Get recommendations
console.log(report.recommendations);

// Find which container a security stage uses
const secretScanContainer = report.stageMapping['SECRET-SCAN'].primary;
```

## 📋 Adding Containers to Jenkins

### Step 1: Navigate to Pod Template

1. Go to: **Manage Jenkins** → **Clouds** → **linode-kube** → **common-agent**
2. Scroll to **Containers** section

### Step 2: Add Container Template

For **hadolint**:
- Click **Add Container**
- Name: `hadolint`
- Docker image: `hadolint/hadolint:v2.12.0-alpine`
- Command: `cat`
- Allocate pseudo-TTY: ✓
- Working directory: `/home/jenkins/agent`

For **gitleaks**:
- Click **Add Container**
- Name: `gitleaks`
- Docker image: `zricethezav/gitleaks:v8.18.0`
- Command: `cat`
- Allocate pseudo-TTY: ✓
- Working directory: `/home/jenkins/agent`

### Step 3: Add to Raw YAML

Scroll to **Raw YAML for the Pod** and add:

```yaml
    - name: hadolint
      resources:
        requests:
          memory: "64Mi"
          cpu: "50m"
        limits:
          memory: "128Mi"
          cpu: "200m"

    - name: gitleaks
      resources:
        requests:
          memory: "128Mi"
          cpu: "100m"
        limits:
          memory: "256Mi"
          cpu: "300m"
```

### Step 4: Update Security Module (Optional)

Once containers are added to Jenkins, update `lib/jenkins/security/index.ts`:

```typescript
// Change from:
gitleaks: {
  inJenkins: false,
  recommended: true,
  ...
}

// To:
gitleaks: {
  inJenkins: true,
  recommended: false,
  ...
}
```

Then update the stage generators to use the dedicated containers instead of downloading tools.

## 📊 Performance Impact

### Current State (Downloads at Runtime)
- Hadolint download: ~3-5 seconds
- Gitleaks download: ~4-6 seconds
- SHA256 verification: ~1 second each
- **Total overhead per build: ~10-15 seconds**

### With Dedicated Containers
- No downloads needed
- Instant availability
- **Build time reduction: 10-15 seconds**
- **Supply-chain security: Improved** (no wget downloads)

## 🔐 Security Benefits

### Current Approach
✅ SHA256 checksum verification
✅ Specific version pinning
⚠️ Downloads from GitHub releases at runtime
⚠️ Vulnerable to GitHub/network issues

### With Dedicated Containers
✅ SHA256 checksum verification (Docker layer)
✅ Specific version pinning
✅ No runtime downloads
✅ Faster builds
✅ Better supply-chain security
✅ Easier to audit (containers pre-pulled)

## 📈 Resource Planning

### Current Pod Resource Usage
```
git:     1Gi    / 500m CPU  (multi-purpose)
kaniko:  6Gi    / 1 CPU     (image builds)
kubectl: 256Mi  / 500m CPU  (K8s deploys)
trivy:   1Gi    / 500m CPU  (image scanning)
jnlp:    512Mi  / 500m CPU  (Jenkins agent)
-------------------------------------------
TOTAL:   8.75Gi / 3.0 CPU
```

### If Hadolint + Gitleaks Added
```
+ hadolint: 128Mi / 200m CPU
+ gitleaks: 256Mi / 300m CPU
-------------------------------------------
NEW TOTAL:  9.12Gi / 3.5 CPU (+4.3% memory, +16.7% CPU)
```

**Verdict:** Minimal resource impact for significant build time improvement.

## 🎯 Recommendations

### Priority 1: Add Now ⭐
- **gitleaks** - Used on every build, saves 4-6 seconds
- **hadolint** - Used on every build, saves 3-5 seconds

### Priority 2: Consider Later
- None currently - all other tools work well in existing containers

### Not Recommended
- Separate containers for npm/pip-audit (works well in git container)
- Separate ESLint container (part of application dependencies)
- Kubesec container (manual checks are reliable and lightweight)

## 📝 Maintenance

### Updating Tool Versions

1. Update `SECURITY_TOOL_VERSIONS` in `lib/jenkins/security/index.ts`
2. Update `JENKINS_CONTAINERS` image versions
3. Update Jenkins pod template container images
4. Verify SHA256 checksums match
5. Run tests to ensure compatibility

### Monitoring Container Usage

```bash
# See which containers are actually being used
npx tsx infra/jenkins/show-jenkins-containers.ts

# Export for analysis
npx tsx infra/jenkins/export-jenkins-containers.ts > audit.json
```

## 🔗 Related Documentation

- [Jenkins Pod Template Configuration](https://jenkins.hav0k.dev)
- [Security Module Documentation](../lib/jenkins/security/index.ts)
- [Pipeline Architecture](../SERVICE_ARCHITECTURE.md)
