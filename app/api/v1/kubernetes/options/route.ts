import axios from "axios";
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { getDigitalOceanHeaders } from "@/lib/services/kubernetes/helpers";
import { vmLocations } from "@/config/locations";
import { Products } from "@/lib/supabase/queries/products";
import type { Tables } from "@/lib/supabase/types";

type DoKubernetesOption = {
  slug: string;
  kubernetes_versions: string[];
};

type DoRegion = {
  slug: string;
  available: boolean;
  sizes: string[];
  features?: string[];
};

export const GET = withV1Auth("kubernetes:options:list", async () => {
  try {
    const [ regionsRes, sizesRes, products] = await Promise.all([
      axios.get<{ regions: DoRegion[] }>("https://api.digitalocean.com/v2/regions", {
        headers: getDigitalOceanHeaders(),
      }),
      axios.get<{ sizes: Array<{ slug: string; available: boolean; regions: string[] }> }>(
        "https://api.digitalocean.com/v2/sizes",
        { headers: getDigitalOceanHeaders() }
      ),
      Products.get_by_type("kubernetes"),
    ]);

    // const versions = new Set<string>();
    // for (const opt of optionsRes.data.options ?? []) {
    //   for (const version of opt.kubernetes_versions ?? []) {
    //     versions.add(version);
    //   }
    // }

    const k8sRegions = (regionsRes.data.regions ?? [])
      .filter((r) => r.available && (r.features ?? []).includes("kubernetes"))
      .map((r) => r.slug)
      .sort();

    const dashboardLocations = vmLocations
      .filter((loc) => loc.available)
      .map((loc) => loc.short);

    const effectiveRegions = k8sRegions.filter((region) =>
      dashboardLocations.includes(region)
    );

    const regionSet = new Set(k8sRegions);
    const nodeSizes = (sizesRes.data.sizes ?? [])
      .filter((s) => s.available && s.regions.some((region) => regionSet.has(region)))
      .map((s) => s.slug)
      .sort();

    const plans = (products as Tables<"products">[])
      .filter((p) => p.type==="kubernetes")
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        price: plan.price,
        resources: plan.resources,
        cpu_type: (plan as { cpu_type?: string }).cpu_type ?? null,
        machine_type: (plan as { machine_type?: string }).machine_type ?? null,
      }));

    return v1Ok({
      data: {
        versions: "31.1.0",
        locations: vmLocations,
        plans,
        regions: effectiveRegions,
        node_sizes: nodeSizes,
      },
    });
  } catch {
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch Kubernetes options");
  }
});
