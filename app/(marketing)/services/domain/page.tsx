import DomainTransferSection from "@/components/services/domain-transfer-section";
import DomainChoiceSection from "@/components/services/domain-choice-section";
import DomainPricingSection from "@/components/services/domain-pricing-section";
import DomainGuidesSection from "@/components/services/domain-guides-section";
import DomainWhyChooseSection from "@/components/services/domain-why-choose-section";
import DomainSupportSection from "@/components/services/domain-support-section";
import DomainArcCtaSection from "@/components/services/domain-arc-cta-section";

const DomainHome = () => {
  return (
    <main className="bg-[#0E0F0F]">
      <DomainTransferSection />
      <DomainChoiceSection />
      <DomainPricingSection />
      <DomainGuidesSection />
      <DomainWhyChooseSection />
      <DomainSupportSection />
      <DomainArcCtaSection />
    </main>
  );
};

export default DomainHome;
