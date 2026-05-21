import { Suspense } from "react";

import DatabasePage from "@/components/dashboard/database/main";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getCachedProducts } from "@/lib/cache/query-cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EngineMeta = {
  code: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  versions: string[];
  fromPrice: number | null;
};

async function loadEngines(): Promise<EngineMeta[]> {
  try {
    const supabase = await createClient();
    const [{ data: types }, products] = await Promise.all([
      supabase
        .from("database_types")
        .select("code, name, description, icon_url, versions")
        .eq("available", true)
        .order("name", { ascending: true }),
      getCachedProducts.byType("database"),
    ]);

    const minByEngine = new Map<string, number>();
    for (const product of products) {
      const sub = product.sub;
      const rawPrice = Number(product.price);
      if (!sub || !Number.isFinite(rawPrice) || rawPrice <= 0) continue;
      const discount = Number(product.discount ?? 0);
      const effective = discount > 0 ? rawPrice * (1 - discount / 100) : rawPrice;
      const prev = minByEngine.get(sub);
      if (prev === undefined || effective < prev) {
        minByEngine.set(sub, effective);
      }
    }

    return (types ?? []).map((t) => {
      const rawVersions = (t.versions as unknown) ?? [];
      const versions = Array.isArray(rawVersions)
        ? rawVersions.map((v) => String(v))
        : [];
      return {
        code: t.code,
        name: t.name,
        description: t.description,
        icon_url: t.icon_url,
        versions,
        fromPrice: minByEngine.get(t.code) ?? null,
      };
    });
  } catch (err) {
    console.error("[database/page] failed to load engines", err);
    return [];
  }
}

const DatabasePageSuspense = async () => {
  const engines = await loadEngines();
  return <DatabasePage engines={engines} />;
};

const DatabasePageWrapper = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <DatabasePageSuspense />
    </Suspense>
  );
};

export default DatabasePageWrapper;
