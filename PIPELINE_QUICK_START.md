# Pipeline Quick Start Guide

## 🚀 Test Your Setup (No Docker Required)

### Step 1: Simple Test Pipeline

Test if Jenkins can access your repository **without any deployment**.

**Framework**: `simple-test` or `test`

```bash
# In your app creation form, use:
Framework: simple-test
GitHub URL: https://github.com/deep-aghera-001/simple-express
Branch: main
Port: 31000 (any port, not used)
```

**What it does:**
- ✅ Clones your repository
- ✅ Lists files
- ✅ Detects project type
- ✅ Shows basic info
- ❌ No Docker build
- ❌ No deployment

**Jenkins Requirements:**
- Only Git (already installed)

**Expected Output:**
```
✓ Repository cloned successfully
✓ Found package.json - Node.js project
✓ Test pipeline completed successfully!
```

---

## 📦 Deploy Express App (Auto-Dockerfile)

### Step 2: Express Pipeline with Docker

Deploys Express.js app and **auto-creates Dockerfile** if missing.

**Framework**: `express`

```bash
# In your app creation form, use:
Framework: express
GitHub URL: https://github.com/deep-aghera-001/simple-express
Branch: main
Port: 31001
```

**What it does:**
- ✅ Clones repository
- ✅ Creates Dockerfile automatically if missing
- ✅ Builds Docker image
- ✅ Pushes to Docker Hub
- ✅ Deploys to Kubernetes
- ✅ Creates SSL certificate
- ✅ Sets up Ingress

**Jenkins Requirements:**
- Docker installed
- kubectl installed
- Credentials: `dockerhublogin`, `kubeconfig_file`

**Your Manager Must Install:**
```bash
# On Jenkins server
sudo apt-get install docker.io -y
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins

# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
```

---

## 🎯 Deploy Node.js App (Requires Dockerfile)

### Step 3: Node.js Pipeline

For Next.js, React, Vue apps that **already have a Dockerfile**.

**Framework**: `nextjs`, `react`, `vue`, or `nodejs`

```bash
# In your app creation form, use:
Framework: nextjs
GitHub URL: https://github.com/user/nextjs-app
Branch: main
Port: 31002
```

**What it does:**
- ✅ Validates Dockerfile exists
- ✅ Builds Docker image
- ✅ Deploys to Kubernetes
- ❌ Does NOT create Dockerfile (must exist)

**Requirements:**
- Repository **must** have Dockerfile
- Same Jenkins setup as Express

---

## 🐍 Deploy Python App (Auto-Dockerfile)

### Step 4: Python Pipeline

For Django, Flask, FastAPI apps.

**Framework**: `python`, `django`, `flask`, or `fastapi`

```bash
# In your app creation form, use:
Framework: flask
GitHub URL: https://github.com/user/flask-api
Branch: main
Port: 31003
```

**What it does:**
- ✅ Creates Python Dockerfile if missing
- ✅ Installs from requirements.txt
- ✅ Deploys to Kubernetes

**Requirements:**
- Repository must have `requirements.txt`
- Same Jenkins setup as Express

---

## 📋 Current Status & Next Steps

### ✅ What's Working
1. Pipeline templates created and organized by type
2. Separate files for different frameworks
3. Simple test pipeline (no Docker needed)
4. Auto-Dockerfile for Express and Python

### ❌ Current Error
```
docker: not found
```

**Cause**: Docker not installed on Jenkins server

### 🔧 Fix Required (Manager Task)

**On Jenkins Server:**
```bash
# 1. Install Docker
sudo apt-get update
sudo apt-get install docker.io -y

# 2. Add jenkins user to docker group
sudo usermod -aG docker jenkins

# 3. Restart Jenkins
sudo systemctl restart jenkins

# 4. Verify
docker --version
```

---

## 🧪 Testing Flow

### Phase 1: Test Jenkins Connection (Now)
```bash
Framework: simple-test
```
**Expected**: Should work ✅ (only needs Git)

### Phase 2: Test After Docker Install
```bash
Framework: express
Repo: https://github.com/deep-aghera-001/simple-express
```
**Expected**: 
- Dockerfile auto-created ✅
- Docker build succeeds ✅
- Push to Docker Hub ✅
- Deploy to K8s ✅

### Phase 3: Production Apps
Use appropriate framework:
- `express` - Express.js (auto-Dockerfile)
- `nextjs` - Next.js (needs Dockerfile)
- `react` - React (needs Dockerfile)
- `python` - Python/Django/Flask (auto-Dockerfile)

---

## 🎯 Quick Decision Tree

**Do you just want to test Jenkins?**
→ Use `simple-test` (no Docker needed)

**Do you have an Express.js app without Dockerfile?**
→ Use `express` (auto-creates Dockerfile)

**Do you have a Next.js/React app with Dockerfile?**
→ Use `nextjs` or `react`

**Do you have a Python app?**
→ Use `python` (auto-creates Dockerfile)

**Is Docker installed on Jenkins?**
- ❌ No → Can only use `simple-test`
- ✅ Yes → Can use any pipeline

---

## 📝 Common Issues

### Issue: "docker: not found"
**Solution**: Ask manager to install Docker (see above)

### Issue: "Dockerfile not found" (Node.js pipeline)
**Solution**: Either:
1. Add Dockerfile to your repo, OR
2. Use `express` or `python` pipeline (auto-creates Dockerfile)

### Issue: "kubectl: not found"
**Solution**: Ask manager to install kubectl:
```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install kubectl /usr/local/bin/kubectl
```

### Issue: Build succeeds but app not accessible
**Solution**: Check:
1. DNS points to Ingress IP
2. cert-manager installed on K8s
3. nginx-ingress installed on K8s

---

## 🎉 Success Criteria

### Simple Test Success:
```
✓ Test pipeline completed successfully!
Repository cloned and validated.
```

### Express Deployment Success:
```
✓ Express deployment successful!
Access your app at: https://apptree.uizb210.xyz
```

### Verification:
```bash
# Check if running
kubectl get pods -l app=apptree-app

# Check service
kubectl get service apptree-service

# Check ingress
kubectl get ingress apptree-ingress

# Visit your app
https://apptree.uizb210.xyz
```
