"use client";

import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { AuthAwareServiceCta } from "./auth-aware-service-cta";

export default function ObjectStorageCtaSection() {
  const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
  return (
    <section className="relative z-10 py-12">
      <Container>
        <div className="border border-white/[0.06] bg-white/[0.02] p-8 flex flex-col items-center gap-4">
          <h3 className="text-2xl text-white font-medium">Ready to store your data reliably?</h3>
          <p className="text-white/40">Create a bucket and start uploading in minutes — no credit card required.</p>
          <AuthAwareServiceCta
            service="object-storage"
            intent="main"
            className={`${MONO} cursor-pointer inline-flex items-center gap-3 bg-white text-black px-6 py-3 rounded-md font-medium transition-colors hover:bg-[#0095FF] hover:text-white`}
          >
         
            Get Started <ArrowRight className="w-4 h-4" />
      
          </AuthAwareServiceCta>
        </div>
      </Container>
    </section>
  );
}
