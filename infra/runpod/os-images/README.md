# GPU pod OS images

Company-owned container images for the consumer **GPU pod** product (the
"rent a GPU" service under `/services/gpu`). These replace the placeholder
`samatva-gpu/*` image names the deploy wizard used to reference — those were
never built or published, so only the "Custom image" option actually worked.

These are **distinct** from the inference-platform images:

| Tree | Purpose |
|---|---|
| `infra/runpod/os-images/` (here) | Customer GPU pods — OS + dev/ML stacks |
| `infra/runpod/training-images/axolotl/` | Fine-tuning runner |
| `infra/runpod/serving-images/vllm-lora/` | Managed FT serving |

## Images

| Template id | Image | Ports | Notes |
|---|---|---|---|
| `ubuntu-22-base` | `ghcr.io/cs2hvh/gpu-ubuntu-22.04-base` | 22 | Minimal CUDA Ubuntu + SSH |
| `pytorch-cuda-12` | `ghcr.io/cs2hvh/gpu-pytorch-cuda-12` | 22, 8888 | PyTorch 2.x cu121, JupyterLab |
| `vllm` | `ghcr.io/cs2hvh/gpu-vllm` | 22, 8000 | vLLM OpenAI server (set `MODEL`) |
| `comfyui` | `ghcr.io/cs2hvh/gpu-comfyui` | 22, 8188 | ComfyUI image generation |

Base: `nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04` with our own OpenSSH
setup — no dependency on the compute vendor's base image.

## Runtime contract

The platform injects these env vars at pod create
(`lib/services/runpod/operations/pod-lifecycle-operations.ts`):

- `PUBLIC_KEY` — SSH public key, appended to root's `authorized_keys`
- `ROOT_PASSWORD` — optional, enables password SSH

The shared `_shared/start.sh` (copied to `/usr/local/bin/ahura-start`) sets up
SSH from those, then execs the image's `SERVICE_CMD`. Per-image runtime knobs:

- `pytorch-cuda-12`: `JUPYTER_TOKEN` — protect the notebook (set this!)
- `vllm`: `MODEL` (HF id, auto-serves on boot), `HF_TOKEN` (gated bases),
  `GPU_MEMORY_UTILIZATION`, `MAX_MODEL_LEN`

## Build & publish

`.github/workflows/gpu-os-images.yml` matrix-builds all four on changes under
`infra/runpod/os-images/**` and pushes to GHCR. The build **context is this
directory** (`infra/runpod/os-images`) so each Dockerfile can `COPY
_shared/start.sh`.

**Make the packages public** in GHCR (Package settings → Change visibility →
Public) so the compute provider can pull them with no registry credentials.
If they're kept private instead, register a container-registry credential on
the provider and set `containerRegistryAuthId` in `createPod` — see the plan.

Manual build of one image:

```bash
cd infra/runpod/os-images
docker build -f pytorch-cuda-12/Dockerfile -t ghcr.io/cs2hvh/gpu-pytorch-cuda-12:dev .
```

## Brand discipline

These images and scripts carry **no upstream-provider names**. The image ref
the customer sees in the dashboard is `ghcr.io/cs2hvh/...` — our registry, not
the compute vendor. Keep vendor names out of any string a pod prints to a user.
