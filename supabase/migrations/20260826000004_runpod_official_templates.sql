-- Add RunPod's official container images alongside our own.
--
-- WHY THIS IS URGENT, not cosmetic
-- --------------------------------
-- Every existing template is a self-built image on CUDA 12.1, 12.4 or 12.6.
-- Blackwell silicon is sm_100 (B200/B300) and sm_120 (RTX 50-series), and
-- neither compute capability exists in a CUDA build older than 12.8. So a
-- customer selecting a B300 — the flagship, top of the "Latest generation"
-- group in the deploy wizard — and any of our PyTorch templates gets
-- "no kernel image is available for execution on the device".
--
-- That is 14 of the 48 GPUs in the catalogue with no working image.
--
-- Second gap: we sell MI300X, and every template we offer is CUDA. On AMD
-- hardware none of them run at all. The ROCm row below is the first image
-- that works on that GPU.
--
-- WHY RUNPOD'S IMAGES RATHER THAN REBUILDING OURS
-- -----------------------------------------------
-- Ours are kept (the user asked to keep them) and still suit anyone pinned to
-- an older CUDA. But RunPod's official images are pre-cached on RunPod's own
-- infrastructure, so a cold pod starts materially faster than pulling ~10 GB
-- from ghcr.io on every create. Tags verified against Docker Hub's live API
-- on 2026-08-26, not taken from documentation.
--
-- ORDERING
-- --------
-- These take sort_order 1-7, ahead of the existing 10-70. Deliberate: the
-- images that actually work on our newest GPUs should be the ones a customer
-- sees first. Nothing existing is reordered or deactivated.
--
-- NOT HANDLED HERE: the wizard does not filter templates by GPU vendor, so
-- the ROCm image is offered even when an NVIDIA card is selected. Its name
-- says "AMD only" so the choice is at least self-explanatory, but real
-- gating is a wizard change, not a data change.

INSERT INTO public.gpu_templates
    (id, name, image_name, description, category, ports, default_container_disk_gb, env_hints, is_active, sort_order)
VALUES
    ('runpod-pytorch-cu130-torch291',
     'PyTorch 2.9.1 · CUDA 13.0',
     'runpod/pytorch:1.1.0-cu1300-torch291-ubuntu2404',
     'Newest stack. Required for Blackwell (B200, B300, RTX 50-series). Ubuntu 24.04.',
     'frameworks', ARRAY['22/tcp','8888/http','6006/http'], 80, NULL, TRUE, 1),

    ('runpod-pytorch-cu129-torch291',
     'PyTorch 2.9.1 · CUDA 12.9',
     'runpod/pytorch:1.1.0-cu1290-torch291-ubuntu2404',
     'Blackwell-capable with slightly wider driver compatibility than CUDA 13. Ubuntu 24.04.',
     'frameworks', ARRAY['22/tcp','8888/http','6006/http'], 80, NULL, TRUE, 2),

    ('runpod-pytorch-cu128-torch280',
     'PyTorch 2.8 · CUDA 12.8.1',
     'runpod/pytorch:1.1.0-cu1281-torch280-ubuntu2404',
     'Oldest CUDA that still supports Blackwell. Best choice when a dependency is not ready for 12.9+.',
     'frameworks', ARRAY['22/tcp','8888/http','6006/http'], 80, NULL, TRUE, 3),

    ('runpod-pytorch-cu130-cluster',
     'PyTorch 2.9.1 · CUDA 13.0 · multi-node',
     'runpod/pytorch:1.1.0-cu1300-torch291-ubuntu2404-cluster',
     'Cluster build for multi-node distributed training across several pods.',
     'frameworks', ARRAY['22/tcp','8888/http','6006/http','29500/tcp'], 120, NULL, TRUE, 4),

    ('runpod-base-cuda130',
     'CUDA 13.0 toolkit',
     'runpod/base:1.1.0-cuda1300-ubuntu2404',
     'Bare CUDA 13.0 on Ubuntu 24.04. Bring your own framework.',
     'base', ARRAY['22/tcp'], 50, NULL, TRUE, 5),

    ('runpod-base-cuda129',
     'CUDA 12.9 toolkit',
     'runpod/base:1.1.0-cuda1290-ubuntu2404',
     'Bare CUDA 12.9 on Ubuntu 24.04. Bring your own framework.',
     'base', ARRAY['22/tcp'], 50, NULL, TRUE, 6),

    ('runpod-base-rocm644',
     'ROCm 6.4.4 · PyTorch 2.7.1 — AMD only',
     'runpod/base:1.1.0-rocm644-ubuntu2404-py312-pytorch271',
     'For AMD Instinct (MI300X). Will not run on NVIDIA GPUs. Python 3.12, Ubuntu 24.04.',
     'base', ARRAY['22/tcp','8888/http'], 80, NULL, TRUE, 7)

ON CONFLICT (id) DO UPDATE SET
    name                      = EXCLUDED.name,
    image_name                = EXCLUDED.image_name,
    description               = EXCLUDED.description,
    category                  = EXCLUDED.category,
    ports                     = EXCLUDED.ports,
    default_container_disk_gb = EXCLUDED.default_container_disk_gb,
    is_active                 = TRUE,
    sort_order                = EXCLUDED.sort_order,
    updated_at                = NOW();

-- Flag the templates that predate Blackwell, so the wizard can say so rather
-- than letting a customer discover it as a CUDA error on a running pod they
-- are already paying for.
UPDATE public.gpu_templates
   SET description = COALESCE(description || ' ', '')
                     || '(CUDA below 12.8 — not compatible with Blackwell GPUs: B200, B300, RTX 50-series.)',
       updated_at  = NOW()
 WHERE id IN ('pytorch-cuda-12', 'pytorch-cuda-12-6', 'cuda-12-4-dev', 'tensorflow')
   AND description NOT LIKE '%not compatible with Blackwell%';
