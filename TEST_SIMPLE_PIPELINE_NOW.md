# Test Simple Pipeline NOW (No Docker Required)

## Current Situation
- ❌ Docker not installed on Jenkins server
- ❌ Cannot build or deploy apps yet
- ✅ Can test Jenkins connectivity and Git access

## Solution: Simple Test Pipeline

I created a **simple test pipeline** that only needs Git (already installed on Jenkins).

---

## How to Test (Step by Step)

### Option 1: Via Your Web Interface

If you have a form to create apps, use these values:

```
App Name: test-app
Framework: simple-test
GitHub URL: https://github.com/deep-aghera-001/simple-express
Branch: main
Port: 31000
```

### Option 2: Via API/Code

```typescript
import { JenkinsService } from '@/lib/services/jenkins';

await JenkinsService.createJob(
  'test-app',
  'https://github.com/deep-aghera-001/simple-express',
  'main',
  31000,
  'simple-test'  // ← This is the key!
);
```

---

## What Will Happen

### Jenkins Pipeline Stages:

**Stage 1: Clone Repository**
```bash
✓ Cloning repository...
✓ Checked out to main branch
```

**Stage 2: Check Files**
```bash
✓ Listing repository files...
=== Repository Contents ===
package.json
index.js
README.md
...
```

**Stage 3: Detect Project Type**
```bash
✓ Found package.json - Node.js project
{
  "name": "simple-express",
  "version": "1.0.0",
  "scripts": {
    "start": "node index.js"
  }
}
```

**Stage 4: Basic Validation**
```bash
=== File Count ===
12 files total

=== File Types ===
JavaScript files: 1
TypeScript files: 0
Python files: 0
```

**Post Actions:**
```bash
✓ Test pipeline completed successfully!
Repository cloned and validated. Ready for actual deployment pipeline.
```

---

## Expected Success Output

```
Started by user hav0k
[Pipeline] Start of Pipeline
[Pipeline] node
Running on Jenkins in /var/jenkins_home/workspace/test-app-job
[Pipeline] {
[Pipeline] stage
[Pipeline] { (Clone Repository)
[Pipeline] echo
Cloning repository...
[Pipeline] git
Cloning the remote Git repository
✓ Checked out Revision abc123 (main)
[Pipeline] }
[Pipeline] // stage
[Pipeline] stage
[Pipeline] { (Check Files)
[Pipeline] echo
Listing repository files...
[Pipeline] sh
+ ls -lah
total 24K
drwxr-xr-x 3 jenkins jenkins 4.0K Nov 20 10:30 .
drwxr-xr-x 5 jenkins jenkins 4.0K Nov 20 10:30 ..
-rw-r--r-- 1 jenkins jenkins  123 Nov 20 10:30 package.json
-rw-r--r-- 1 jenkins jenkins  456 Nov 20 10:30 index.js
[Pipeline] }
[Pipeline] // stage
[Pipeline] stage
[Pipeline] { (Detect Project Type)
[Pipeline] echo
Detecting project type...
[Pipeline] sh
+ [ -f package.json ]
✓ Found package.json - Node.js project
[Pipeline] }
[Pipeline] // stage
[Pipeline] stage
[Pipeline] { (Basic Validation)
[Pipeline] echo
Running basic validation...
[Pipeline] sh
=== File Count ===
12
=== File Types ===
JavaScript files: 1
[Pipeline] }
[Pipeline] // stage
[Pipeline] stage
[Pipeline] { (Declarative: Post Actions)
[Pipeline] echo
✓ Test pipeline completed successfully!
Repository cloned and validated. Ready for actual deployment pipeline.
[Pipeline] }
[Pipeline] // stage
[Pipeline] }
[Pipeline] // node
[Pipeline] End of Pipeline
Finished: SUCCESS
```

---

## What This Proves

If this test succeeds, you've verified:

✅ Jenkins is running and accessible  
✅ Jenkins can connect to GitHub  
✅ Jenkins can clone repositories  
✅ Git credentials are working  
✅ Jenkins workspace is functional  
✅ Pipeline syntax is correct  

---

## After Test Succeeds

### Next: Ask Manager to Install Docker

Once the simple test works, ask your manager to install Docker:

```bash
# On Jenkins server (manager runs this)
sudo apt-get update
sudo apt-get install docker.io -y
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins

# Verify
docker --version
```

### Then: Test Express Pipeline

After Docker is installed, test actual deployment:

```
App Name: apptree
Framework: express
GitHub URL: https://github.com/deep-aghera-001/simple-express
Branch: main
Port: 31001
```

This will:
- ✅ Auto-create Dockerfile
- ✅ Build Docker image
- ✅ Push to Docker Hub
- ✅ Deploy to Kubernetes
- ✅ Create Ingress with SSL
- ✅ Make app accessible at https://apptree.uizb210.xyz

---

## Troubleshooting Simple Test

### If test fails with "git: not found"
Git is not installed (very unlikely). Manager should install:
```bash
sudo apt-get install git -y
```

### If test fails with "Permission denied"
Jenkins doesn't have access to workspace. Manager should fix permissions:
```bash
sudo chown -R jenkins:jenkins /var/jenkins_home
```

### If test fails with "Repository not found"
- Check GitHub URL is correct
- Check repository is public OR Jenkins has GitHub credentials
- Verify branch name is correct

### If test fails with "Connection refused"
Jenkins server cannot reach GitHub. Check network/firewall.

---

## Quick Test Script

If you want to test directly via curl:

```bash
# Trigger job creation (adjust URL to your API endpoint)
curl -X POST http://localhost:3000/api/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-app",
    "framework": "simple-test",
    "githubUrl": "https://github.com/deep-aghera-001/simple-express",
    "branch": "main",
    "port": 31000
  }'
```

Then check Jenkins:
```
http://your-jenkins-url/job/test-app-job/
```

---

## Summary

🎯 **Try This Now**: Create a deployment with `framework: 'simple-test'`  
⏱️ **Takes**: ~30 seconds  
📋 **Proves**: Jenkins and Git are working  
🚫 **No Need**: Docker, Kubernetes, or any deployment  
✅ **Success**: Confirms pipeline system is working  
➡️ **Next**: Wait for Docker install, then deploy for real
