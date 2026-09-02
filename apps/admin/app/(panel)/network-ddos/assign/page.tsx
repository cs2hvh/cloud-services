import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { Projects } from "@/lib/supabase/queries/projects";
import { Spectrum_Apps } from "@/lib/supabase/queries/spectrum_apps";
import { Users } from "@/lib/supabase/queries/users";
import SpectrumAppCreate from "@/components/dashboard/network-ddos/new";

export const dynamic = "force-dynamic";

const AssignSuspense = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const [projects, usersData, spectrumApps] = await Promise.all([
    Projects.get_all_for_admin(),
    Users.get_all_profiles(),
    Spectrum_Apps.get_all_app_name("admin"),
  ]);

  const allUsers = usersData
    .map((user) => ({
      id: user.id,
      email: user.email || "",
      username: user.username || undefined,
    }))
    .filter((user) => user.email);

  return (
    <SpectrumAppCreate
      projects={projects}
      userId={checkAdmin.userId || ""}
      role="admin"
      allUsers={allUsers}
      spectrumApps={spectrumApps}
    />
  );
};

export default function AdminNetworkDDoSAssignPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          Assign DDoS Protection to User
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a Spectrum app (Layer 4 protection) on behalf of any user.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }
      >
        <AssignSuspense />
      </Suspense>
    </div>
  );
}
