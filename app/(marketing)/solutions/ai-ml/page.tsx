import type { Metadata } from "next";

import { AiMlLanding } from "@/components/solutions/ai-ml/landing";

export const metadata: Metadata = {
  title: "AI & ML Infrastructure Solutions",
  description:
    "Build, fine-tune, and deploy AI products with premium GPU infrastructure, autoscaling inference, distributed clusters, and secure data pipelines.",
};

export default function AiMlPage() {
  return <AiMlLanding />;
}
