import PricingClient from "@/components/pricing/pricing-client";
import { STATIC_PRICING_DATA } from "@/lib/utils/pricing-data";

export default function PricingPage() {
  return <PricingClient categories={STATIC_PRICING_DATA} />;
}
