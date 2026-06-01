// Pod template catalog operations.
//
// Templates are the company-owned container images the deploy wizard offers
// (Ubuntu base, PyTorch, TensorFlow, vLLM, ComfyUI, …). They live in
// public.gpu_templates and are admin-managed. This module reads them for the
// wizard and exposes a server-side lookup used to allowlist image names at
// pod-create time, so a non-custom deploy can't smuggle in an arbitrary image.

import { createServiceClient } from "@/lib/supabase/server";

import type { GpuTemplate, ServiceResult, TemplateCategory } from "../types";

interface TemplateRowDb {
    id: string;
    name: string;
    image_name: string;
    description: string | null;
    category: TemplateCategory;
    ports: string[];
    default_container_disk_gb: number;
    env_hints: Record<string, string> | null;
    sort_order: number;
}

function mapRow(r: TemplateRowDb): GpuTemplate {
    return {
        id: r.id,
        name: r.name,
        imageName: r.image_name,
        description: r.description,
        category: r.category,
        ports: r.ports ?? [],
        defaultContainerDiskGb: r.default_container_disk_gb,
        envHints: r.env_hints,
        sortOrder: r.sort_order,
    };
}

export const templateOperations = {
    /** List active templates for the deploy wizard, ordered for display. */
    async listTemplates(): Promise<ServiceResult<GpuTemplate[]>> {
        try {
            const supabase = await createServiceClient();
            const { data, error } = await supabase
                .from("gpu_templates")
                .select(
                    "id, name, image_name, description, category, ports, default_container_disk_gb, env_hints, sort_order"
                )
                .eq("is_active", true)
                .order("sort_order", { ascending: true });
            if (error) throw new Error(error.message);
            return { success: true, data: (data as TemplateRowDb[]).map(mapRow) };
        } catch (e) {
            console.error("[GPU:listTemplates] failed:", e);
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                errorCode: "SERVER",
            };
        }
    },

    /**
     * Resolve a template by id (active only). Returns null when not found.
     * Used at pod-create time to validate that a non-custom deploy references a
     * real catalog template and to confirm its image matches.
     */
    async getActiveTemplate(id: string): Promise<GpuTemplate | null> {
        const supabase = await createServiceClient();
        const { data, error } = await supabase
            .from("gpu_templates")
            .select(
                "id, name, image_name, description, category, ports, default_container_disk_gb, env_hints, sort_order"
            )
            .eq("id", id)
            .eq("is_active", true)
            .maybeSingle();
        if (error) throw new Error(`gpu_templates lookup failed: ${error.message}`);
        return data ? mapRow(data as TemplateRowDb) : null;
    },
};
