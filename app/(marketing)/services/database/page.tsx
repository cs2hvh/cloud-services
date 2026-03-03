import { ServiceHeroSection } from "@/components/services/service-hero-section";
import DatabaseEnginesSection from "@/components/services/database-engines-section";
import DatabaseShowcaseSection from "@/components/services/database-showcase-section";
import DatabaseComparisonSection from "@/components/services/database-comparison-section";
import DatabaseMetricsSection from "@/components/services/database-metrics-section";
import DatabasePricingSection from "@/components/services/database-pricing-section";
import DatabaseCtaSection from "@/components/services/database-cta-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import ServicesHomeSectionSix from "@/components/serviceshome/section-6";
import { getDatabasePlans} from "@/lib/helpers/database-plans";

const cases = [
  {
    title: "SaaS & Multi-Tenant Apps",
    description:
      "Power multi-tenant SaaS platforms with connection pooling, row-level security, and automatic scaling as your customer base grows.",
  },
  {
    title: "E-Commerce & Transactions",
    description:
      "Handle high-throughput transactional workloads with ACID-compliant databases, read replicas for product catalogs, and sub-millisecond caching.",
  },
  {
    title: "Real-Time Analytics",
    description:
      "Ingest and query billions of events with ClickHouse or time-series extensions. Build dashboards and alerts on live data streams.",
  },
  {
    title: "Mobile & IoT Backends",
    description:
      "Store user profiles, device telemetry, and session data with low-latency reads. Sync across regions for globally distributed apps.",
  },
];

const DatabaseHome = async () => {
  // Fetch dynamic pricing plans from database
  const plans = await getDatabasePlans();

  return (
    <main className="bg-black">
      <ServiceHeroSection
        badge="Managed Databases"
        title="Database"
        description="Fully managed database services with automatic backups, scaling, and high availability. Focus on your application, not database administration."
        primaryAction={{ label: "Launch a Database", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/service-home-db-section-1.png", alt: "Database infrastructure" }}
      />
      <DatabaseEnginesSection />
      <DatabaseShowcaseSection />
      <DatabaseComparisonSection />
      <DatabaseMetricsSection />
      <DatabasePricingSection plans={plans} />
      <DatabaseCtaSection />
      <ServicesHomeSectionFive
        title="Frequently Asked Questions"
        faqs={[
          {
            question: "Which database engines are supported?",
            answer:
              "We offer fully managed PostgreSQL, MySQL, MariaDB, Redis, MongoDB, and ClickHouse. Each engine runs on optimized infrastructure with automatic tuning for your workload profile.",
          },
          {
            question: "How do backups and recovery work?",
            answer:
              "All databases include automatic daily snapshots with configurable retention (7–90 days). Pro and Enterprise plans support point-in-time recovery — restore your database to any second within the retention window.",
          },
          {
            question: "Can I add read replicas?",
            answer:
              "Yes. On Pro and Enterprise plans, you can add up to 15 read replicas per database with automatic load balancing. Replicas can be deployed in different regions for low-latency reads.",
          },
          {
            question: "How does high availability work?",
            answer:
              "Production databases run on multi-node clusters with synchronous replication. Automatic failover promotes a standby node within seconds if the primary becomes unavailable.",
          },
          {
            question: "Is my data encrypted?",
            answer:
              "Yes. All data is encrypted at rest with AES-256 and in transit with TLS 1.3. You can also bring your own encryption keys (BYOK) on Enterprise plans.",
          },
          {
            question: "Can I connect from my existing VPC?",
            answer:
              "Yes. VPC peering is available on Pro and Enterprise plans, allowing private connectivity without exposing your database to the public internet. We support AWS, GCP, and Azure peering.",
          },
          {
            question: "How does scaling work?",
            answer:
              "Scale storage and compute independently with zero downtime. Storage auto-expands when you hit 90% capacity. CPU and RAM can be upgraded with a brief restart window.",
          },
        ]}
      />
      <ServicesHomeSectionSix cases={cases} />
    </main>
  );
};

export default DatabaseHome;
