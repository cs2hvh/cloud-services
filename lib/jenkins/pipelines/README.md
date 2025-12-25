# Jenkins Pipeline Templates

This directory contains modular Jenkins pipeline templates for different project types.

## Pipeline Types

### 1. Simple Test Pipeline (`simple-test.ts`)
**No Docker, No Kubernetes - Just Testing**

Use this to test Jenkins connectivity and repository access without any deployment.

**Features:**
- ✅ Clones repository
- ✅ Lists files
- ✅ Detects project type (Node.js, Python, etc.)
- ✅ Shows basic validation
- ❌ No Docker build
- ❌ No Kubernetes deployment

**When to Use:**
- Testing Jenkins setup
- Verifying Git credentials
- Quick repository validation

**Requirements:**
- Only Git needs to be installed on Jenkins

**Example Usage:**
```typescript
import { createSimpleTestPipeline } from '@/lib/jenkins/pipelines';

const xml = createSimpleTestPipeline(
  'my-app',
  'https://github.com/user/repo',
  'main'
);
```

---

### 2. Node.js Pipeline (`nodejs.ts`)
**For Next.js, React, Vue.js, Node.js apps with existing Dockerfile**

Full production pipeline with Docker build and Kubernetes deployment.

**Features:**
- ✅ Clones repository
- ✅ Validates Dockerfile exists (fails if missing)
- ✅ Builds Docker image
- ✅ Pushes to Docker Hub
- ✅ Deploys to Kubernetes with health checks
- ✅ Creates Ingress with SSL (cert-manager)
- ✅ 2 replicas for high availability

**When to Use:**
- Production Next.js apps
- React/Vue apps with custom Dockerfile
- Node.js apps with existing Dockerfile

**Requirements:**
- Kubernetes cluster with Kaniko support
- Jenkins credentials: `dockerhublogin`, `kubeconfig_file`
- Kubernetes cluster with cert-manager, nginx-ingress
- **Repository must have Dockerfile**
- **No Docker needed on Jenkins** - builds run in K8s pods

**Example Usage:**
```typescript
import { createNodeJsPipeline } from '@/lib/jenkins/pipelines';

const xml = createNodeJsPipeline(
  'my-nextjs-app',
  'https://github.com/user/nextjs-repo',
  'main',
  '31001'
);
```

---

### 3. Express Pipeline (`express.ts`)
**For Express.js apps - Auto-creates Dockerfile if missing**

Simplified pipeline that auto-generates Dockerfile for Express apps.

**Features:**
- ✅ Clones repository
- ✅ Auto-creates Dockerfile if missing
- ✅ Builds Docker image
- ✅ Pushes to Docker Hub
- ✅ Deploys to Kubernetes with health checks
- ✅ Creates Ingress with SSL
- ✅ 1 replica (can scale later)

**When to Use:**
- Simple Express.js APIs
- Express apps without Dockerfile
- Quick Express deployments

**Requirements:**
- Kubernetes cluster with Kaniko support
- Jenkins credentials: `dockerhublogin`, `kubeconfig_file`
- Kubernetes cluster with cert-manager, nginx-ingress
- Repository must have `package.json` with `start` script
- **No Docker needed on Jenkins** - builds run in K8s pods

**Auto-Generated Dockerfile:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE <port>
CMD ["npm", "start"]
```

**Example Usage:**
```typescript
import { createExpressPipeline } from '@/lib/jenkins/pipelines';

const xml = createExpressPipeline(
  'my-api',
  'https://github.com/user/express-api',
  'main',
  '31002'
);
```

---

### 4. Python Pipeline (`python.ts`)
**For Django, Flask, FastAPI apps**

Pipeline for Python web applications with auto-Dockerfile.

**Features:**
- ✅ Clones repository
- ✅ Auto-creates Dockerfile if missing
- ✅ Builds Docker image
- ✅ Pushes to Docker Hub
- ✅ Deploys to Kubernetes with health checks
- ✅ Creates Ingress with SSL
- ✅ 1 replica

**When to Use:**
- Django applications
- Flask APIs
- FastAPI services
- Python web apps

**Requirements:**
- Kubernetes cluster with Kaniko support
- Jenkins credentials: `dockerhublogin`, `kubeconfig_file`
- Kubernetes cluster with cert-manager, nginx-ingress
- Repository must have `requirements.txt`
- **No Docker needed on Jenkins** - builds run in K8s pods

**Auto-Generated Dockerfile:**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE <port>
CMD ["python", "app.py"]
```

**Example Usage:**
```typescript
import { createPythonPipeline } from '@/lib/jenkins/pipelines';

const xml = createPythonPipeline(
  'my-flask-api',
  'https://github.com/user/flask-app',
  'main',
  '31003'
);
```

---

## Usage in Service

The `JenkinsService` automatically selects the right pipeline based on framework:

```typescript
import { JenkinsService } from '@/lib/services/jenkins';

// Simple test (no deployment)
await JenkinsService.createJob('test-app', 'https://...', 'main', 3000, 'simple-test');

// Express with auto-Dockerfile (port 3000 is standard for Node.js)
await JenkinsService.createJob('my-api', 'https://...', 'main', 3000, 'express');

// Node.js / Next.js (requires Dockerfile, uses port 3000)
await JenkinsService.createJob('my-next-app', 'https://...', 'main', 3000, 'nextjs');

// Python (uses port 8000 for FastAPI/Flask/Django)
await JenkinsService.createJob('my-django', 'https://...', 'main', 8000, 'django');
```

**Note:** The port parameter now represents the internal container port, not a NodePort.
All apps are exposed via NGINX Ingress Controller on ports 80/443 using ClusterIP services.

## Framework Mapping

| Framework Input | Pipeline Used | Auto-Dockerfile? |
|----------------|---------------|------------------|
| `simple-test`, `test` | Simple Test | N/A |
| `express`, `express.js` | Express | ✅ Yes |
| `python`, `django`, `flask`, `fastapi` | Python | ✅ Yes |
| `nodejs`, `nextjs`, `react`, `vue` | Node.js | ❌ No (must exist) |
| Default (any other) | Node.js | ❌ No (must exist) |

## Common Requirements

### All Production Pipelines (Node.js, Express, Python)

**Jenkins Server:**
```bash
# No Docker installation needed!
# Kaniko runs in Kubernetes pods on the control-plane node

# Jenkins only needs:
# 1. Kubernetes plugin installed
# 2. Access to Kubernetes cluster
# 3. Docker Hub credentials configured
```

**Jenkins Credentials:**
- `dockerhublogin`: Docker Hub username/password
- `kubeconfig_file`: Kubernetes config file (secret file)

**Kubernetes Cluster:**
```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create Let's Encrypt ClusterIssuer
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

# Install nginx-ingress
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml
```

## Pipeline Stages Comparison

| Stage | Simple Test | Express | Node.js | Python |
|-------|------------|---------|---------|--------|
| Clone Repository | ✅ | ✅ | ✅ | ✅ |
| Check Files | ✅ | - | - | - |
| Detect Project | ✅ | - | - | - |
| Prepare Dockerfile | - | ✅ Auto | ❌ Validate | ✅ Auto |
| Build Docker | - | ✅ | ✅ | ✅ |
| Push to Docker Hub | - | ✅ | ✅ | ✅ |
| Deploy to K8s | - | ✅ | ✅ | ✅ |
| Verify Deployment | - | ✅ | ✅ | ✅ |

## Testing Strategy

1. **Start with Simple Test**
   - Verify Jenkins connectivity
   - Test Git credentials
   - Confirm repository access

2. **Test Docker Build**
   - Use Express pipeline (auto-creates Dockerfile)
   - Verify Docker is installed
   - Check Docker Hub credentials

3. **Test Full Deployment**
   - Use Node.js or Express pipeline
   - Verify kubectl access
   - Check Kubernetes cluster

4. **Production Ready**
   - Use appropriate pipeline for your stack
   - Monitor first deployment
   - Verify health checks and ingress

## Troubleshooting

### "Cannot connect to Kubernetes cluster"
- Kubeconfig credentials not configured
- Jenkins Kubernetes plugin not installed
- Solution: Install plugin, configure kubeconfig credential

### "kubectl: not found in container"in container"
- bitnami/kubectl image not pulled
- Solution: Ensure Kubernetes cluster can pull public images

### "Dockerfile not found" (Node.js pipeline)
- Repository missing Dockerfile
- Solution: Add Dockerfile OR use Express/Python pipeline (auto-creates)

### Deployment succeeds but app not accessible
- DNS not pointing to Ingress IP
- cert-manager not installed
- nginx-ingress not installed
- Solution: Check Kubernetes requirements above
