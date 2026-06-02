import { assetUrl } from "@/lib/asset-url";
import { ServiceHeroSection } from "@/components/services/service-hero-section";
import AppDeployHowSection from "@/components/services/app-deploy-how-section";
import AppDeployWorkloadsSection from "@/components/services/app-deploy-workloads-section";
import AppDeployFrameworksSection from "@/components/services/app-deploy-frameworks-section";
import AppDeployPricingSection from "@/components/services/app-deploy-pricing-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import { getAppDeployPlans } from "@/lib/helpers/app-deploy-plans";

const AppDeploymentHome = async () => {
  const plans = await getAppDeployPlans();

  return (
    <main className="bg-black">
      <ServiceHeroSection
        badge="Application Platform"
        title="App Deployment"
        description="Deploy applications directly from Git with managed builds, zero-downtime releases, and instant rollbacks. Production infrastructure without the operational overhead."
        primaryAction={{ label: "Deploy Your App", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{ src: assetUrl("/images/hero/service-hero-bg.png"), alt: "" }}
        illustration={{ src: assetUrl("/images/main-page/app-deploy.png"), alt: "App Deployment infrastructure" }}
      />
      <AppDeployHowSection />
      <AppDeployFrameworksSection />
      <AppDeployWorkloadsSection />
      <AppDeployPricingSection plans={plans} />
      <ServicesHomeSectionFive
        title="Frequently asked questions"
        faqs={[
          {
            question: "How does deployment work?",
            answer:
              "Connect a GitHub, GitLab, or Bitbucket repository. Every push to the tracked branch triggers an automatic build and zero-downtime deploy. Manual deploys via CLI and API are also supported.",
          },
          {
            question: "Which languages and frameworks are supported?",
            answer:
              "Node.js, Python, Go, Java, Ruby, PHP, Rust, and .NET are supported out of the box. Frameworks such as Next.js, Django, Spring Boot, Laravel, and FastAPI are auto-detected, with optimized build pipelines applied automatically.",
          },
          {
            question: "Can I use Docker?",
            answer:
              "Yes. A Dockerfile in the repository is built and deployed automatically. Pre-built images from any compliant container registry can also be deployed directly.",
          },
          {
            question: "How do rollbacks work?",
            answer:
              "Each deployment produces an immutable release. Rolling back to any prior release takes a single action from the dashboard or CLI; no rebuild is required.",
          },
          {
            question: "Is there a free tier?",
            answer:
              "The Starter plan includes three apps with 512 MB RAM each, automatic TLS, and 100 GB of monthly bandwidth. No credit card is required to begin.",
          },
          {
            question: "How does scaling work?",
            answer:
              "Scale horizontally by adding instances, or vertically by upgrading resources. Autoscaling rules can be triggered by CPU, memory, or request-rate thresholds.",
          },
          {
            question: "Do you support environment variables and secrets?",
            answer:
              "Environment variables are managed per app and per environment (preview, staging, production). Secrets are encrypted at rest and injected securely at runtime.",
          },
        ]}
      />
    </main>
  );
};

export default AppDeploymentHome;
