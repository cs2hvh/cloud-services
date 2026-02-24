"use client";

import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";

export default function ObjectStorageCtaSection() {
  return (
    <section className="relative z-10 py-12">
      <Container>
        <div className="border border-white/[0.06] bg-white/[0.02] p-8 flex flex-col items-center gap-4">
          <h3 className="text-2xl text-white font-medium">Ready to store your data reliably?</h3>
          <p className="text-white/40">Create a bucket and start uploading in minutes — no credit card required.</p>
          <a href="/signup" className="inline-flex items-center gap-3 bg-white text-black px-6 py-3 rounded-md font-medium">
            Get Started <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </Container>
    </section>
  );
}
