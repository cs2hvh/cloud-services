# Jenkins Local Setup (Cloud Services)

Reproducible local Jenkins that mirrors production exactly.  
Every piece of config — plugins, Kubernetes cloud, pod template, resource limits — is baked into the Docker image. No manual UI steps required after first boot.

---

## How it works

```
Dockerfile
 ├─ jenkins/jenkins:2.528.2-lts-jdk21          ← pinned base image
 ├─ plugins.txt  (99 plugins, pinned versions)  ← pre-installed at build time
 └─ init.d/01-configure-kube-cloud.groovy       ← runs on first boot, creates:
       • linode-kube  Kubernetes cloud
       • common-agent pod template (git, buildkit, kubectl, trivy)
       • all resource limits, DNS config, timeouts matching production

docker-compose.yml
 ├─ ports  8080 (UI) + 50000 (agent JNLP)
 ├─ volume ./data → /var/jenkins_home  (persisted across restarts)
 ├─ volume /var/run/docker.sock        (Docker-in-Docker if needed locally)
 └─ JENKINS_OPTS=--requestHeaderSize=65536  (prevents HTTP 431 errors)
```

---

## Production baseline (snapshotted 2026-03-23)

| Item | Value |
|---|---|
| Host | `170.187.238.34` (Ubuntu 24.04) |
| Jenkins version | `2.528.2` |
| Java | OpenJDK 21 |
| Plugins | 99 (pinned in `plugins.txt`) |
| Kubernetes cloud | `linode-kube` → `https://139.59.1.6:6443` |
| Pod template | `common-agent` |
| Credential IDs required | `dockerhublogin`, `kubeconfig_file` |

---

## Start locally

```bash
cd infra/jenkins
docker compose up -d --build
```

The build takes ~2–3 min the first time (downloading and installing 99 plugins). Subsequent builds are instant (cached).

**Check it started:**
```bash
docker logs -f cloud-services-jenkins
# Wait for: Jenkins is fully up and running
```

---

## First-time browser setup

Open **http://localhost:8080** in a **private/incognito window** (avoids HTTP 431 from stale cookies).

**Step 1 — Unlock Jenkins**

Get the one-time admin password:
```bash
docker exec cloud-services-jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```
Paste it into the browser.

**Step 2 — Plugins screen**

> ⚠️ All 99 plugins are already installed in the image. Do NOT install more here.

Click **"Select plugins to install"** → click **"None"** (top-right, deselects all) → click **"Install"**.  
It completes immediately with nothing to download.

**Step 3 — Create admin user**

Fill in any username/password/name/email you want for your local instance.

**Step 4 — Jenkins URL**

Leave as `http://localhost:8080` and click **"Save and Finish"** → **"Start using Jenkins"**.

---

## What's already configured automatically

After completing setup, go to **Manage Jenkins → Clouds**:

- **`linode-kube`** cloud is already there (created by the init script on first boot)
- Click it → **Pod Templates** → **`common-agent`** is already configured with:

| Container | Image | Memory request/limit | CPU request/limit |
|---|---|---|---|
| `git` | `alpine/git:latest` | 256Mi / 1Gi | 100m / 500m |
| `buildkit` | `moby/buildkit:latest` | 2Gi / 4Gi | 1 / 2 |
| `kubectl` | `alpine/k8s:1.28.0` | 128Mi / 256Mi | 100m / 500m |
| `trivy` | `aquasec/trivy:0.48.0` | 256Mi / 1Gi | 100m / 500m |

DNS configured: `8.8.8.8`, `8.8.4.4`  
YAML merge strategy: `Merge`  
Agent container: `jnlp`  
Pod retention: `Never`

> The cloud points to the **production** Kubernetes cluster URL. It will not connect locally without the `kubeconfig_file` credential (see below). This is expected — local Jenkins is for pipeline development and UI inspection, not for running actual cluster builds.

---

## Add required credentials (for real deployments)

Go to **Manage Jenkins → Credentials → System → Global credentials → Add Credentials**.

### 1. `dockerhublogin`
- Kind: **Username with password**
- Username: your Docker Hub username
- Password: your Docker Hub access token
- ID: `dockerhublogin` ← must be exactly this

### 2. `kubeconfig_file`
- Kind: **Secret file**
- File: upload your cluster's `kubeconfig` file
- ID: `kubeconfig_file` ← must be exactly this

> These IDs are hard-coded in `lib/jenkins/pipelines/*.ts`. Wrong IDs = broken deploys.

---

## Reset to clean state

```bash
cd infra/jenkins
docker compose down
rm -rf ./data
docker compose up -d --build
```

The init script re-creates the cloud config automatically on each fresh `data/` directory.

---

## Re-export plugin list from a live server

If the production Jenkins gets new plugins, re-sync `plugins.txt`:

```bash
./export-jenkins-plugins-from-home.sh /srv/jenkins > plugins.txt
# Then rebuild:
docker compose up -d --build
```

---

## Files in this folder

| File | Purpose |
|---|---|
| `Dockerfile` | Builds image: base + 99 plugins + init script |
| `docker-compose.yml` | Runs Jenkins locally on ports 8080/50000 |
| `plugins.txt` | 99 pinned plugins snapshotted from production |
| `init.d/01-configure-kube-cloud.groovy` | Auto-creates `linode-kube` cloud + `common-agent` on first boot |
| `common-agent-pod.yaml` | Raw YAML reference snapshot from production Jenkins |
| `common-agent-optional-security-containers.yaml` | Optional hadolint + gitleaks containers (not in production yet) |
| `credentials.required.md` | Credential IDs required by pipeline code |
| `linode-kube-cloud.settings.md` | Full production cloud settings snapshot for reference |

