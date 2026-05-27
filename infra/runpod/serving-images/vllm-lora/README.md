# Fine-tune serving image (vLLM + LoRA)

Wraps the official `vllm/vllm-openai:v0.7.3` image with an entry script
that downloads a LoRA adapter from R2 at startup and launches vLLM with
the adapter loaded.

## What it serves

One fine-tuned LoRA adapter on top of one base model, exposed as
OpenAI-compatible `/v1/chat/completions` on port 8000. Per-FT pod;
scales to zero between requests on the provider's serverless runtime.

## Required env (set by the runner at endpoint create time)

| Var | Example | Notes |
|---|---|---|
| `BASE_MODEL` | `microsoft/phi-4` | HuggingFace base model id |
| `ADAPTER_R2_URL` | `r2://ahura-ft-adapters/<org>/<job>/` | LoRA adapter directory |
| `R2_ACCESS_KEY_ID` | `…` | Read access to the adapter bucket |
| `R2_SECRET_ACCESS_KEY` | `…` | |
| `R2_ENDPOINT` | `https://<acct>.r2.cloudflarestorage.com` | |
| `HF_TOKEN` | (optional) | Required for gated bases (Llama, Gemma) |
| `MAX_MODEL_LEN` | (optional) | vllm `--max-model-len` override |
| `GPU_MEMORY_UTILIZATION` | `0.9` | vllm `--gpu-memory-utilization` |
| `SERVED_MODEL_NAME` | `adapter` | Name the client uses in `model` field |

## How the gateway calls it

After the webhook handler provisions an endpoint, it stores the
endpoint id on `inference.models.runpod_endpoint_id`. When a client
requests the fine-tuned model:

```
POST /v1/chat/completions { "model": "ahura/phi-4:ft-abc12345", ... }
```

The Cloudflare Worker looks up the row, sees `serving_type='runpod_ft'`
and `runpod_endpoint_id='xyz123'`, then forwards the OpenAI-format body
to:

```
https://api.runpod.ai/v2/xyz123/openai/v1/chat/completions
```

with the body's `model` field rewritten to `adapter` (the
`--served-model-name`) so vLLM's served-model check passes.

## Cold start

First request after idle: ~30-60s (provider spins up a worker, pulls
the image if not cached, our entrypoint downloads base from HF +
adapter from R2, vLLM loads the model into VRAM).

Subsequent requests on a warm worker: ~1-2s including LoRA inference.

The provider's idle timeout is configurable per endpoint; we default
to 60s (cheap-to-zero, cold-start once per minute of inactivity).
