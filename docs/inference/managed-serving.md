# Managed FT serving — operator activation (Phase 11.A)

Phase 11.A ships the **keystone** for managed FT serving: the gateway can now
forward `/v1/chat/completions` to an AhuraCloud-operated vLLM endpoint when a
fine-tune is flagged as managed. Dashboard activation, k8s automation,
multi-LoRA hot-swap, and billing all come later (Phase 11.B–D).

For now, activation is a 3-step manual operator flow.

---

## What "managed" means today

A fine-tune row in `inference.finetunes` is **managed** when both of:

1. The corresponding `inference.models` row has `serving_url` set to the full
   HTTPS base URL of a vLLM openai-server (`http(s)://host:port`).
2. `is_managed = TRUE` on both rows (cosmetic — drives the dashboard badge).

When those are set, gateway requests for that model_id forward to
`<serving_url>/v1/chat/completions` instead of returning the
`self_serve_model` 400. Response header `X-Ahura-Routing: managed` confirms
the route.

The user does not see any difference in the API. Same URL, same shape, same
billing posture — just no GPU pod for them to operate.

---

## Activation flow (operator-side)

### 1. Stand up a vLLM container for the adapter

Use the existing Phase 10 image and command, but point its `ADAPTER_DOWNLOAD_URL`
at the FT's adapter and pin it to always-on infrastructure (k8s Deployment,
RunPod Pod, GCE VM, anywhere with a public HTTPS endpoint).

```bash
docker run --gpus all -p 8000:8000 \
  -e BASE_MODEL="microsoft/phi-4" \
  -e ADAPTER_DOWNLOAD_URL="https://wao.cs2hvh.com/api/inference/fine-tuning/jobs/<ft_id>/adapter-url" \
  ghcr.io/cs2hvh/ahura-ft-serving-vllm:vllm-0.7.3
```

Front it with a reverse proxy / load balancer / k8s Service so it has a stable
HTTPS hostname:

```
https://phi-4-ft-abc12345.managed.ahura.cloud:8000
```

For now, no TLS check or auth between gateway and vLLM — the URL itself is
the secret. (Phase 11.B layers in a shared bearer token.)

### 2. Flip the model row to managed

```sql
UPDATE inference.models
SET
  serving_url = 'https://phi-4-ft-abc12345.managed.ahura.cloud:8000',
  is_managed  = TRUE
WHERE model_id = 'ahura/phi-4:ft-abc12345';

-- Mirror onto the finetune row for the dashboard badge:
UPDATE inference.finetunes
SET
  serving_url = 'https://phi-4-ft-abc12345.managed.ahura.cloud:8000',
  is_managed  = TRUE
WHERE id = 'abc12345-0000-...';
```

### 3. Test the route

```bash
curl https://api.cs2hvh.com/v1/chat/completions \
  -H "Authorization: Bearer ahu_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ahura/phi-4:ft-abc12345",
    "messages": [{"role":"user","content":"Hello from managed serving"}]
  }'
```

Expect:
- 200 OK with normal chat-completions response
- Header `X-Ahura-Routing: managed`
- Usage row in `inference.usage` (billed at the platform rate)
- Dashboard FT list shows the "Managed" badge on this row

---

## Deactivating

Either flip `serving_url = NULL` (instant — gateway flips back to the
`self_serve_model` 400 next request) or `is_managed = FALSE` (route stays
working but the dashboard badge goes away — useful for billed-but-quiet
diagnostic states).

---

## What's NOT yet automated

| Concern | Where it lives today | Phase that fixes it |
|---|---|---|
| k8s Deployment generation per FT | Operator runs `kubectl apply` manually | 11.B (operator-shipped manifests + a control-plane endpoint to apply them) |
| Multi-LoRA per base (Fireworks pattern: 1 vLLM container holding N adapters) | One container per FT | 11.B (multi-LoRA serving image with hot-swap) |
| Scale-to-zero when idle | Always-on, full hourly cost | 11.C (KEDA on request-rate from gateway access logs) |
| Activation button in dashboard | `UPDATE inference.models` by hand | 11.D (button on FT detail panel) |
| Per-org pricing override (managed flat rate vs per-token) | Single platform rate from catalog | 11.D (managed_pricing JSONB on inference.orgs) |
| Auth between gateway → vLLM | URL is the only secret | 11.B (`Authorization: Bearer <shared>` + per-tenant rotation) |

---

## Gotchas

- **Cold pull is slow.** First request to a fresh vLLM container can take
  60–120s for the upstream tarball download + vLLM warmup. The gateway
  doesn't currently buffer / retry on first-hit timeout — the customer's
  first request may 504. Either pre-warm the container with a sentinel
  request after `docker run` or wait for Phase 11.C's readiness gating.
- **`served-model-name` must be "adapter".** The forward function rewrites
  the outgoing `model` field to `"adapter"` (the vLLM `--served-model-name`
  the Phase 10 image sets by default). If you customize the container with
  a different `--served-model-name`, update `served_model_name` in
  `workers/inference/src/lib/model-routing.ts:lookupModelRouting` or the
  forward will get rejected by vLLM with "model not found".
- **No auth between gateway and vLLM.** Anyone who knows the `serving_url`
  can hit it directly and bypass your gateway's auth/rate-limit/spend cap.
  Lock the URL down at the network layer (private VPC, k8s ClusterIP) until
  Phase 11.B ships the bearer-token check.
