import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser, requireAdmin } from "@/lib/supabase/auth";
import { Spectrum_Apps } from "@/lib/supabase/queries/spectrum_apps";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import SpectrumAppTabs from "@/components/dashboard/network-ddos/spectrum-tabs";
import { Encryption, type EncryptedData } from "@/config/functions";

interface PageProps {
  params: Promise<{ spectrum_id: string }>;
}

const SpectrumAppSuspense = async ({ spectrumId }: { spectrumId: string }) => {
  const user = await getUser();
  const checkAdmin = await requireAdmin();

  if (!user) {
    console.log("User not found");
    notFound();
  }

  // Fetch spectrum app data
  const spectrumApp = await Spectrum_Apps.get(spectrumId);

  //console.log("Fetched spectrum app:", !spectrumApp.success);

  if (!spectrumApp.success || !spectrumApp.data) {
    notFound();
  }

 // console.log(spectrumApp.data.owner_id !== user.id ,".......1" )
  //console.log(checkAdmin,".........2")

  // Verify ownership
  if (spectrumApp.data.owner_id !== user.id && !checkAdmin.ok) {
    notFound();
  }

  // Decrypt DNS name before passing to client
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY is missing");
  }

  const decryptedSpectrumApp = { ...spectrumApp.data };

  if (
    decryptedSpectrumApp.dns &&
    typeof decryptedSpectrumApp.dns === "object"
  ) {
    const dns = decryptedSpectrumApp.dns as { name: unknown; type: string };
    try {
      const encryptedData = dns.name as EncryptedData;
      const decryptedName = Encryption.decrypt(encryptedData, encryptionKey);
      decryptedSpectrumApp.dns = {
        ...dns,
        name: decryptedName,
        decrypted_name: decryptedName,
      };
    } catch (error) {
      console.error("Failed to decrypt DNS name:", error);
    }
  }

  return <SpectrumAppTabs spectrumApp={decryptedSpectrumApp} />;
};

export default async function SpectrumAppPage({ params }: PageProps) {
  const { spectrum_id } = await params;

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>
      <div className="relative z-10 px-6 py-8 sm:px-8 xl:px-10">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner />
            </div>
          }
        >
          <SpectrumAppSuspense spectrumId={spectrum_id} />
        </Suspense>
      </div>
    </div>
  );
}
