import DatabaseHeroSection from "@/components/services/database-hero-section";
import DatabaseControlPlaneSection from "@/components/services/database-control-plane-section";
import DatabaseEnginesSection from "@/components/services/database-engines-section";
import DatabasePricingSection from "@/components/services/database-pricing-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import ServicesHomeSectionSix, {
  type UseCase,
} from "@/components/serviceshome/section-6";
import { getDatabasePlans } from "@/lib/helpers/database-plans";
import { Database, ShoppingBag, FileJson, Gauge } from "lucide-react";

const cases: UseCase[] = [
  {
    icon: Database,
    metric: "SaaS",
    title: "PostgreSQL for tenant-aware platforms",
    description:
      "Account systems, billing tables, and multi-tenant APIs on Postgres clusters with synchronous replicas, point-in-time recovery, and private networking out of the box.",
  },
  {
    icon: ShoppingBag,
    metric: "Commerce",
    title: "MySQL for transactional storefronts",
    description:
      "Checkout flows, catalog reads, customer portals, and order pipelines on MySQL with managed failover, automated backups, and read-replica fan-out.",
  },
  {
    icon: FileJson,
    metric: "Content",
    title: "MongoDB for evolving product data",
    description:
      "Catalogs, content models, user profiles, and internal tools that need schema flexibility — managed replica sets with snapshot recovery and zero ops overhead.",
  },
  {
    icon: Gauge,
    metric: "Cache",
    title: "Redis for sessions and low-latency reads",
    description:
      "Hot data next to the app — sessions, queues, counters, rate limits, and response caching. Sub-millisecond reads with AOF persistence and HA failover.",
  },
];

const DatabaseHome = async () => {
  // Fetch dynamic pricing plans from database
  const plans = await getDatabasePlans();

  return (
    <main className="bg-[#0E0F0F]">
      <DatabaseHeroSection
        primaryAction={{ label: "Create a Cluster", href: "/signup" }}
        secondaryAction={{ label: "Compare Engines", href: "#engines" }}
      />
      <DatabaseControlPlaneSection />
      <DatabaseEnginesSection />
      <DatabasePricingSection plans={plans} />
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
      <ServicesHomeSectionSix
        cases={cases}
        eyebrow="Use cases"
        heading="Built for the data layer you"
        headingAccent="actually run."
        subtitle="Four engines, one managed control plane — replication, backups, and private networking come standard."
      />
    </main>
  );
};

export default DatabaseHome;
