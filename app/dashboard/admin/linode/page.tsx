import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/supabase/auth";
import LinodeAdmin from "@/components/admin/linode/linode-admin";

export const dynamic = "force-dynamic";

export default async function AdminLinodePage() {
    const admin = await requireAdmin();
    if (!admin.ok) notFound();

    return (
        <div className="min-h-full bg-[#08090b] text-white">
            <div className="px-6 py-10 sm:px-10">
                <LinodeAdmin />
            </div>
        </div>
    );
}
