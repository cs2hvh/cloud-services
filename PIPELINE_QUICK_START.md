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
- ❌ No image build
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
- ✅ Builds image with Kaniko
- ✅ Pushes to registry
- ✅ Deploys to Kubernetes
- ✅ Creates SSL certificate
- ✅ Sets up Ingress

**Jenkins Requirements:**
- Kubernetes plugin installed
- Credentials: `dockerhublogin`, `kubeconfig_file`
- Access to Kubernetes cluster

**Setup Required:**
```bash
# On Jenkins server
# 1. Install Kubernetes plugin in Jenkins UI
# 2. Configure kubeconfig credential
# 3. Configure Docker Hub credential (dockerhublogin)

# No Docker installation needed on Jenkins!
# Builds run in Kubernetes pods using Kaniko
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
- ✅ Builds image with Kaniko
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

### ✅ No Installation Required

**Builds run in Kubernetes:**
- Images built with Kaniko in K8s pods
- No Docker daemon needed on Jenkins
- Cleaner and more secure

### 🔧 Setup Required

**Jenkins Configuration:**
```bash
# 1. Install Kubernetes plugin
# Jenkins UI → Manage Jenkins → Plugin Manager → Kubernetes

# 2. Add credentials:
# - dockerhublogin (username/password)
# - kubeconfig_file (secret file)

# 3. Ensure Jenkins can access K8s cluster
```

---

## 🧪 Testing Flow

### Phase 1: Test Jenkins Connection (Now)
```bash
Framework: simple-test
```
**Expected**: Should work ✅ (only needs Git)

### Phase 2: Test Image Build
```bash
Framework: express
Repo: https://github.com/deep-aghera-001/simple-express
```
**Expected**: 
- Kaniko pod created ✅
- Image built in K8s ✅
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

**Do you have an Express.js app?**
→ Use `express` (auto-builds image)

**Do you have a Next.js/React app with Dockerfile?**
→ Use `nextjs` or `react`

**Do you have a Python app?**
→ Use `python` (auto-builds image)

**Is Kubernetes configured?**
- ❌ No → Can only use `simple-test`
- ✅ Yes → Can use any pipeline

---

## 📝 Common Issues

### Issue: "Cannot connect to Kubernetes"
**Solution**: Configure kubeconfig credential and install Kubernetes plugin

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
