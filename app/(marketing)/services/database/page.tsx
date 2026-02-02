import { ServiceHeroSection } from "@/components/services/service-hero-section";

const DatabaseHome = () => {
  return (
    <main className="bg-black">
      <ServiceHeroSection
        badge="Managed Database Platform"
        title="Database"
        description="Provision secure, high-availability databases with automated backups, scaling, and monitoring. Deploy in minutes with optimized performance."
        primaryAction={{ label: "Get Started", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/hero-bg.png", alt: "" }}
        illustration={{ src: "/images/Features/database.png", alt: "Database cluster" }}
      />
    </main>
  );
};

export default DatabaseHome;
