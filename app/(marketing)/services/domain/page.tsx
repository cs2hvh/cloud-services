import DomainTransferSection from "@/components/services/domain-transfer-section";
import DomainChoiceSection from "@/components/services/domain-choice-section";
import DomainPricingSection from "@/components/services/domain-pricing-section";
import DomainGuidesSection from "@/components/services/domain-guides-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";

const DomainHome = () => {
  return (
    <main className="bg-[#0E0F0F]">
      <DomainTransferSection />
      <DomainChoiceSection />
      <DomainPricingSection />
      <DomainGuidesSection />
      <ServicesHomeSectionFive
        title="Frequently asked questions"
        faqs={[
          {
            question: "How long does it take to register a domain?",
            answer:
              "Registration is typically instant — your domain is live within seconds of checkout, and DNS propagates globally within a few minutes through our Anycast network.",
          },
          {
            question: "Can I transfer my domain from another registrar?",
            answer:
              "Yes. We support inbound transfers from any ICANN-accredited registrar. You'll need the auth/EPP code from your current provider and to unlock the domain. Transfers usually complete within an hour with no downtime if your DNS records are migrated first.",
          },
          {
            question: "Is WHOIS privacy really free?",
            answer:
              "Yes — on every TLD that supports it (which covers the vast majority). Your contact details are replaced with proxy values in the public WHOIS database at no extra cost, forever, on every domain you register or transfer to AhuraCloud.",
          },
          {
            question: "Do you offer bulk or volume pricing?",
            answer:
              "Yes. Portfolios of 50+ domains qualify for tiered discounts on registration, renewal, and transfer pricing. Contact sales for a quote, or manage bulk operations directly via our API and CSV import in the dashboard.",
          },
          {
            question: "Can I use my domain with services outside AhuraCloud?",
            answer:
              "Absolutely. You have full control over your nameservers and DNS records — point your domain at any third-party host, CDN, or email provider. We never lock you into our infrastructure.",
          },
          {
            question: "What happens if I forget to renew?",
            answer:
              "All domains have auto-renew enabled by default, billed against your account balance or card on file. We also send renewal reminders 90, 30, and 7 days before expiration. If a domain does expire, you have a 30-day grace period to renew at standard price before it enters redemption.",
          },
          {
            question: "What payment methods do you accept?",
            answer:
              "All major credit and debit cards (Visa, Mastercard, American Express), PayPal, ACH bank transfer for US-based customers, and wire transfer for enterprise accounts. Invoiced billing with NET-30 terms is available on annual contracts.",
          },
          {
            question: "Do you support DNSSEC and custom nameservers?",
            answer:
              "Yes to both. DNSSEC can be enabled per-domain from the dashboard with a single click. Custom nameservers (vanity NS or external) are configurable on every domain, with no minimum or maximum.",
          },
        ]}
      />
    </main>
  );
};

export default DomainHome;
