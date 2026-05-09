import { ServiceHeroSection } from "@/components/services/service-hero-section";
import AppDeployHowSection from "@/components/services/app-deploy-how-section";
import AppDeployWorkloadsSection from "@/components/services/app-deploy-workloads-section";
import AppDeployFrameworksSection from "@/components/services/app-deploy-frameworks-section";
import AppDeployShowcaseSection from "@/components/services/app-deploy-showcase-section";
import AppDeployPricingSection from "@/components/services/app-deploy-pricing-section";
import AppDeployFinalCtaSection from "@/components/services/app-deploy-final-cta-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import { getAppDeployPlans } from "@/lib/helpers/app-deploy-plans";

const AppDeploymentHome = async () => {
  // Fetch dynamic app deployment plans from database
  const plans = await getAppDeployPlans();
  console.log("Fetched app deployment plans:", plans);
  // const cases = [
  //   {
  //     title: "SaaS & Web Applications",
  //     description:
  //       "Ship production-ready web apps with zero-downtime deployments, automatic SSL, and global CDN — from monoliths to microservices.",
  //   },
  //   {
  //     title: "APIs & Backend Services",
  //     description:
  //       "Deploy REST and GraphQL APIs with auto-scaling, health checks, and built-in rate limiting. Connect to managed databases in one click.",
  //   },
  //   {
  //     title: "Static Sites & Jamstack",
  //     description:
  //       "Instant builds for Next.js, Nuxt, Astro, and other SSG frameworks. Edge-cached globally with automatic cache invalidation.",
  //   },
  //   {
  //     title: "Internal Tools & Dashboards",
  //     description:
  //       "Deploy admin panels, monitoring dashboards, and internal tools with environment isolation and team-based access controls.",
  //   },
  // ];

  return (
    <main className="bg-black">
      <ServiceHeroSection
        badge="App Platform"
        title="App Deployment"
        description="Push your code, we handle the rest. Automatic builds, zero-downtime deployments, and instant rollbacks — from Git push to production in seconds."
        primaryAction={{ label: "Deploy Your App", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/app-deploy.png", alt: "App Deployment infrastructure" }}
      />
       <AppDeployShowcaseSection />
      <AppDeployHowSection />
      <AppDeployFrameworksSection />
      <AppDeployWorkloadsSection />
      
     
      <AppDeployPricingSection plans={plans} />
      
      <ServicesHomeSectionFive
        title="Frequently Asked Questions"
        faqs={[
          {
            question: "How does deployment work?",
            answer:
              "Connect your GitHub, GitLab, or Bitbucket repository. Every push to your configured branch triggers an automatic build and deploy. You can also deploy manually via CLI or API.",
          },
          {
            question: "Which languages and frameworks are supported?",
            answer:
              "We support Node.js, Python, Go, Java, Ruby, PHP, Rust, .NET, and more. Popular frameworks like Next.js, Django, Spring Boot, Laravel, and FastAPI are auto-detected with optimized build pipelines.",
          },
          {
            question: "Can I use Docker?",
            answer:
              "Yes. If your repo contains a Dockerfile, we'll build and deploy it automatically. You can also push pre-built images from any container registry.",
          },
          {
            question: "How do rollbacks work?",
            answer:
              "Every deployment creates an immutable release. Roll back to any previous version instantly from the dashboard or CLI — no rebuild required.",
          },
          {
            question: "Is there a free tier?",
            answer:
              "Yes. The Starter plan includes 3 apps with 512 MB RAM each, automatic SSL, and 100 GB bandwidth per month — no credit card required to get started.",
          },
          {
            question: "How does scaling work?",
            answer:
              "Scale horizontally by adding instances or vertically by upgrading resources. Auto-scaling rules can trigger based on CPU, memory, or request count thresholds.",
          },
          {
            question: "Do you support environment variables and secrets?",
            answer:
              "Yes. Manage environment variables per app and per environment (preview, staging, production). Secrets are encrypted at rest and injected securely at runtime.",
          },
        ]}
      />
      {/* <ServicesHomeSectionSix cases={cases} /> */}
      <AppDeployFinalCtaSection />
    </main>
  );
};

export default AppDeploymentHome;
