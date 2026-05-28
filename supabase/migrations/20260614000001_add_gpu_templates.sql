-- GPU pod templates: admin-managed catalog of container images the deploy
-- wizard offers (Ubuntu base, PyTorch, TensorFlow, vLLM, ComfyUI, …).
--
-- Replaces the hardcoded TEMPLATES array that lived in the wizard and pointed
-- at unbuilt `samatva-gpu/*` names. Images are now company-owned and published
-- to GHCR by .github/workflows/gpu-os-images.yml. Adding a template later is a
-- row insert, not a code change.
--
-- Brand note: image refs are our own registry; no upstream-provider name
-- appears here or in any value surfaced to a customer.

CREATE TABLE IF NOT EXISTS public.gpu_templates (
    id                        TEXT PRIMARY KEY,
    name                      TEXT NOT NULL,
    image_name                TEXT NOT NULL,
    description               TEXT,
    category                  TEXT NOT NULL DEFAULT 'base'
                              CHECK (category IN ('base','frameworks','llm-serving','image-gen')),
    -- RunPod-style port specs, e.g. {22/tcp,8888/http}. Forwarded verbatim to
    -- the compute backend on pod create.
    ports                     TEXT[] NOT NULL DEFAULT '{22/tcp}',
    default_container_disk_gb INTEGER NOT NULL DEFAULT 50
                              CHECK (default_container_disk_gb BETWEEN 10 AND 2000),
    -- Optional UI hints documenting the env knobs a template honors
    -- (e.g. {"JUPYTER_TOKEN":"Protect the notebook","MODEL":"HF id to serve"}).
    env_hints                 JSONB,
    is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order                INTEGER NOT NULL DEFAULT 100,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gpu_templates_active
    ON public.gpu_templates (is_active, sort_order);

COMMENT ON COLUMN public.gpu_templates.image_name IS
    'Fully-qualified company image ref (e.g. ghcr.io/cs2hvh/gpu-pytorch-cuda-12:latest).';

-- Reuse the existing updated_at trigger function from the GPU service migration.
DROP TRIGGER IF EXISTS trg_gpu_templates_updated_at ON public.gpu_templates;
CREATE TRIGGER trg_gpu_templates_updated_at BEFORE UPDATE ON public.gpu_templates
    FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.gpu_templates ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.gpu_templates TO authenticated, anon;
GRANT ALL    ON public.gpu_templates TO service_role;

-- Active templates are marketing-readable; admins manage the catalog.
DO $$ BEGIN
    CREATE POLICY "Anyone can view active gpu templates" ON public.gpu_templates
        FOR SELECT USING (is_active = TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins manage gpu templates" ON public.gpu_templates
        FOR ALL USING (EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND 'admin' = ANY(roles)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Seed v1 catalog ────────────────────────────────────────────────────────
-- Tag :latest tracks the dev branch build (see gpu-os-images.yml). Pin to a
-- sha- tag here once images are validated in production.
INSERT INTO public.gpu_templates
    (id, name, image_name, description, category, ports, default_container_disk_gb, env_hints, sort_order)
VALUES
    ('ubuntu-22-base', 'Ubuntu 22.04 — base',
     'ghcr.io/cs2hvh/gpu-ubuntu-22.04-base:latest',
     'Minimal CUDA-capable Ubuntu with SSH. Build your own stack.',
     'base', '{22/tcp}', 50, NULL, 10),

    ('cuda-12-4-dev', 'CUDA 12.4 toolkit',
     'ghcr.io/cs2hvh/gpu-cuda-12.4-dev:latest',
     'Full CUDA 12.4 toolkit (nvcc, build-essential, cmake) for compiling CUDA/C++ extensions. SSH only.',
     'base', '{22/tcp}', 50, NULL, 20),

    ('pytorch-cuda-12', 'PyTorch 2.3 + CUDA 12.1',
     'ghcr.io/cs2hvh/gpu-pytorch-cuda-12:latest',
     'PyTorch 2.3, CUDA 12.1, Python 3.11, JupyterLab, common ML packages.',
     'frameworks', '{22/tcp,8888/http}', 80,
     '{"JUPYTER_TOKEN":"Set a token to password-protect the notebook"}'::jsonb, 30),

    ('pytorch-cuda-12-6', 'PyTorch 2.7 + CUDA 12.6',
     'ghcr.io/cs2hvh/gpu-pytorch-cuda-12.6:latest',
     'Newer PyTorch 2.7 line (RTX 5090 / Blackwell capable), Python 3.11, JupyterLab + TensorBoard.',
     'frameworks', '{22/tcp,8888/http,6006/http}', 80,
     '{"JUPYTER_TOKEN":"Set a token to password-protect the notebook"}'::jsonb, 40),

    ('tensorflow', 'TensorFlow 2.x',
     'ghcr.io/cs2hvh/gpu-tensorflow:latest',
     'TensorFlow 2.16 with bundled CUDA, Python 3.11, JupyterLab + TensorBoard.',
     'frameworks', '{22/tcp,8888/http,6006/http}', 80,
     '{"JUPYTER_TOKEN":"Set a token to password-protect the notebook"}'::jsonb, 50),

    ('vllm', 'vLLM inference',
     'ghcr.io/cs2hvh/gpu-vllm:latest',
     'vLLM with an OpenAI-compatible HTTP API on port 8000.',
     'llm-serving', '{22/tcp,8000/http}', 100,
     '{"MODEL":"HuggingFace id to auto-serve on boot","HF_TOKEN":"Required for gated bases"}'::jsonb, 60),

    ('comfyui', 'ComfyUI',
     'ghcr.io/cs2hvh/gpu-comfyui:latest',
     'ComfyUI node-graph image generation; web UI on port 8188.',
     'image-gen', '{22/tcp,8188/http}', 100, NULL, 70)
ON CONFLICT (id) DO NOTHING;
