# Pre-warming the training image (optional speedup)

## What it does

Without this, every first fine-tuning job on a cold compute-provider node
spends 5–10 minutes pulling our ~20 GB training image (`axolotlai/axolotl-cloud-uv` base + our orchestration scripts). Subsequent jobs on the same node start in ~30s because the node already cached the image.

With a **Pod Template** registered on the compute provider, the image is pre-warmed across many of their nodes and most jobs skip the cold pull entirely. Typical cold-start drops from ~10 min to ~30s.

## One-time operator setup (~5 min)

1. Open your compute provider's console → Pod Templates → **New Template**
2. Fill in:
   - **Name:** `ahura-ft-axolotl`
   - **Image:** `ghcr.io/cs2hvh/ahura-ft-axolotl:axolotl-0.29.0` (bump when we ship new images)
   - **Container disk:** **300 GB** (matches what we'd set inline for A100-80GB)
   - **Volume mount:** `/workspace/cache`
   - **Volume size:** 100 GB
   - **Ports:** none (training pods are outbound-only)
   - **Env vars:** **leave empty** — the runner injects them per-job
3. Save → copy the **Template ID** (looks like `xyz123abc`)
4. Apply to the cluster:

```bash
export KUBECONFIG=$HOME/.kube/lke-ahura.yaml
kubectl -n ahura patch secret ahura-ft-runner-secrets \
  --patch '{"stringData":{"RUNPOD_TEMPLATE_ID":"<paste-template-id>"}}'
kubectl -n ahura rollout restart deploy/ahura-ft-runner
```

5. Also add to `~/.ahura-lke.env` so re-applies don't drift:

```
RUNPOD_TEMPLATE_ID=<paste-template-id>
```

## Verifying it works

After applying, kick off a smoke test job from the dashboard. Watch the runner logs:

```bash
kubectl -n ahura logs -f deploy/ahura-ft-runner
```

When you see `"msg":"pod provisioned"`, switch over to the compute provider's pod page. The image-pull progress should be either skipped entirely (template was already on that node) or visibly faster than before (~1-2 min instead of ~10 min for the first hit on a never-templated node).

## When to bump the template

The template is pinned to a specific image tag. When we ship a new `:axolotl-0.29.0` digest (which overwrites in place via the GHA build) the template still points at the OLD digest's content because the provider cached it at template-create time. To refresh:

- Edit the template in the provider's console → change the image field (even to the same value) → save. This forces re-pull on next use.
- Or: create a new template with the same image field, swap the env var, rollout-restart, delete the old template.

## Falling back if the template breaks

Set `RUNPOD_TEMPLATE_ID` to empty in the secret + restart:

```bash
kubectl -n ahura patch secret ahura-ft-runner-secrets \
  --patch '{"stringData":{"RUNPOD_TEMPLATE_ID":""}}'
kubectl -n ahura rollout restart deploy/ahura-ft-runner
```

The runner reverts to inline image/disk/volume params on every pod create — slow first pull but always works.
