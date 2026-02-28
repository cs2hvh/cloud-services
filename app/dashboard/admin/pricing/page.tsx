import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import AdminPricing from "@/components/admin/pricing/admin-pricing";
import { PricingCategories, PricingPromos } from "@/lib/supabase/queries/pricing";
import { Products } from "@/lib/supabase/queries/products";

export const dynamic = "force-dynamic";

const AdminPricingSuspense = async () => {
  const checkAdmin = await requireAdmin();

  if (!checkAdmin.ok) {
    notFound();
  }

  // Fetch categories, promos, and products in parallel
  const [categories, promos, products] = await Promise.all([
    PricingCategories.get_all_admin(),
    PricingPromos.get_all_admin(),
    Products.get_all(),
  ]);

  // Filter products for pricing display (compute, gpu, etc.)
  const pricingProductTypes = [
    "compute",
    "gpu",
    "object-storage",
    "database",
    "security",
    "kubernetes",
    "ai-deployment",
    "app-deployment",
    "network-ddos",
  ];
  const pricingProducts = products.filter((p) =>
    pricingProductTypes.includes(p.type)
  );

  return (
    <AdminPricing
      categories={categories}
      promos={promos}
      products={pricingProducts}
    />
  );
};

const AdminPricingPage = async () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AdminPricingSuspense />
    </Suspense>
  );
};

export default AdminPricingPage;
