import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser, requireAdmin } from "@/lib/supabase/auth";
import { Spectrum_Apps } from "@/lib/supabase/queries";
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

  console.log("Fetched spectrum app:", !spectrumApp.success);

  if (!spectrumApp.success || !spectrumApp.data) {
    notFound();
  }

  console.log(spectrumApp.data.owner_id !== user.id ,".......1" )
  console.log(checkAdmin,".........2")

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
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
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
  );
}
