import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import AdminCoupons from "@/components/admin/coupons/admin-coupons";
import { Promocodes } from "@/lib/supabase/queries";

const AdminCouponsSuspense = async () => {
  const checkAdmin = await requireAdmin();

  if (!checkAdmin.ok) {
    notFound();
  }

  const coupons = await Promocodes.get_all();

  return <AdminCoupons all_coupons={coupons} />;
};

const AdminCouponsPage = async () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AdminCouponsSuspense />
    </Suspense>
  );
};

export default AdminCouponsPage;
