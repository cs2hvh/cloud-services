// GET /api/v1/resources — list resource plans (optionally filtered by type)
import { z } from "zod";
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

const PRODUCT_TYPES = [
  "vps",
  "vds",
  "game",
  "database",
  "object-storage",
  "kubernetes",
  "network-ddos",
  "platform-apps",
  "compute",
  "gpu",
  "security",
  "ai-deployment",
  "app-deployment",
] as const;

const resourceTypeSchema = z.enum(PRODUCT_TYPES);

type ResourceRow = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "id" | "name" | "description" | "type" | "sub"
>;

export const GET = withV1Auth("resources:list", async (req) => {
  const url = new URL(req.url);
  const rawType = url.searchParams.get("type");

  let type: z.infer<typeof resourceTypeSchema> | null = null;
  if (rawType) {
    const parsedType = resourceTypeSchema.safeParse(rawType);
    if (!parsedType.success) {
      return v1Error("INVALID_PARAMETER", 400, "Invalid resource type", {
        field: "type",
        allowed_values: PRODUCT_TYPES,
      });
    }
    type = parsedType.data;
  }

  const supabase = await createServiceClient();
  let query = supabase
    .from("products")
    .select("id,name,description,type,sub")
    .order("created_at", { ascending: false });

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/v1/resources]", error);
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch resources");
  }

  const resources = (data ?? []).map((product: ResourceRow) => ({
    plan_id: product.id,
    name: product.name,
    description: product.description,
    type: product.type,
    sub_type: product.sub,
  }));

  return v1Ok({
    data: resources,
    meta: {
      total: resources.length,
      ...(type ? { type } : {}),
    },
  });
});

