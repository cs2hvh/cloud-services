# RunPod Training Images

Container images used by the FT runner when provisioning RunPod pods for fine-tuning jobs.

## Images

| Image | What | Phase | Status |
|---|---|---|---|
| `axolotl/` | Axolotl 0.29.0 + PyTorch 2.4 + CUDA 12.4 + Liger Kernel + Flash Attention | Phase 5.B | ✅ Dockerfile ready, awaiting first push |
| `unsloth/` | Unsloth 0.x for single-GPU QLoRA (2-5× faster than axolotl on that workload) | Phase 5.B+ | Planned |

## How the image gets built and pushed

Two paths — pick one.

### Path A — GitHub Actions (recommended)

The workflow at [.github/workflows/ft-axolotl-image.yml](../../.github/workflows/ft-axolotl-image.yml) auto-builds on push to `ai`/`master`/`dev` branches when this directory changes. No local Docker setup needed.

**One-time setup:**

1. Ensure your repo has GHCR enabled (it is by default for any GitHub repo).
2. The workflow uses `secrets.GITHUB_TOKEN` (auto-provided by Actions) with `packages: write` scope — no manual PAT needed.
3. Push any change in `infra/runpod/training-images/axolotl/` → workflow runs → image pushed to `ghcr.io/<owner>/ahura-ft-axolotl:axolotl-0.29.0`.

**To trigger manually with a custom tag:**

GitHub UI → Actions tab → "Build Axolotl FT Image" → "Run workflow" → enter tag like `test-myname`.

**First run will take ~35 min** because of the PyTorch CUDA base layer (~10 GB). Subsequent builds with cache hit ~10 min.

**Make the image public** (so RunPod pods can pull it without auth):

1. Go to `https://github.com/<owner>?tab=packages`
2. Click `ahura-ft-axolotl` → Package settings (right column)
3. Change visibility → Public
4. Confirm

If you want it private, the RunPod pod env needs a Docker pull secret — more complex; do public for v1.

### Path B — Local build + push (slow, eats disk)

If you want to iterate fast on the Dockerfile without pushing a commit each time.

**Prereqs:**

- Docker Desktop installed (Windows: `winget install Docker.DockerDesktop`)
- ~50 GB free disk
- GHCR personal access token (PAT) with `write:packages` scope:
  - GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
  - Generate new token → name "GHCR push" → expiration 90 days → scopes: `write:packages`, `read:packages`, `delete:packages`
  - Copy the token (shown once)

**Build + push:**

```powershell
cd c:\cloud-services\infra\runpod\training-images\axolotl

# Log in to GHCR (one-time per machine)
$env:CR_PAT = "ghp_paste_your_pat_here"
echo $env:CR_PAT | docker login ghcr.io -u <your-github-username> --password-stdin

# Build (35-60 min first time)
docker build -t ghcr.io/<your-github-username>/ahura-ft-axolotl:axolotl-0.29.0 .

# Push (5-15 min depending on upload speed)
docker push ghcr.io/<your-github-username>/ahura-ft-axolotl:axolotl-0.29.0
```

Then make it public via the same UI step as Path A.

## Verifying the push

```powershell
# Test pull (any machine with Docker)
docker pull ghcr.io/<owner>/ahura-ft-axolotl:axolotl-0.29.0

# Image size sanity check (should be ~22 GB)
docker image ls ghcr.io/<owner>/ahura-ft-axolotl
```

## What the BullMQ runner does with it

When a fine-tuning job arrives:

```typescript
// In workers/ft-runner/src/lifecycle.ts
await runpodCreatePod({
  imageName: "ghcr.io/<owner>/ahura-ft-axolotl:axolotl-0.29.0",
  gpuTypeId: "NVIDIA A100 80GB PCIe",
  env: {
    JOB_ID,
    BASE_MODEL,
    DATASET_URL,
    HYPERPARAMS_JSON,
    METHOD,
    OUTPUT_R2_PREFIX,
    WEBHOOK_URL,
    WEBHOOK_SECRET,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_ENDPOINT,
  },
  volumeMountPath: "/workspace/cache",
  containerDiskInGb: 100,
  volumeInGb: 100,
});
```

The container's `ENTRYPOINT` runs `/workspace/train.sh` automatically, which orchestrates the whole training lifecycle (download dataset → render config → train → upload adapter → webhook back).

## Bumping the axolotl version

1. Edit `Dockerfile` — bump `axolotl[...]==X.Y.Z`
2. Update the tag in `.github/workflows/ft-axolotl-image.yml` (`type=raw,value=axolotl-X.Y.Z`)
3. Commit + push to `ai` branch
4. Wait ~10 min for GHA build
5. Update `AXOLOTL_IMAGE_URI` env in ft-runner k8s deployment

## Pinned versions (matters for reproducibility)

The Dockerfile pins exact versions of: axolotl, transformers, accelerate, peft, trl, bitsandbytes, datasets, huggingface_hub, liger-kernel. Bumping any of these can silently break LoRA training — version mismatches cause subtle issues like missing chat templates or quantization regressions. When upgrading, smoke-test against your reference dataset before promoting.

## Troubleshooting first build

| Symptom | Likely cause | Fix |
|---|---|---|
| `denied: permission_denied` on push | PAT missing `write:packages` | Regenerate PAT with correct scope |
| `unauthorized` after login | Repo doesn't have package linked | Push once → GitHub auto-links → subsequent pushes work |
| Build OOM at FlashAttention compile | Local Docker has <8GB RAM | Use GitHub Actions instead OR `docker desktop > Settings > Resources > 16 GB` |
| `no matching manifest for linux/arm64` when RunPod pulls | Built on Mac M-series | Add `--platform linux/amd64` to docker build, or use GHA (which builds amd64) |
| Image >30 GB | Some intermediate layer not cleaned | Add `&& rm -rf /var/lib/apt/lists/*` to apt-get steps |
