import type { Metadata } from "next";

import GamesServicePage from "@/components/services/games-service-page";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";

export const metadata: Metadata = {
  title: "Game Server Hosting",
  description:
    "Deploy Minecraft, Rust, CS2, and FiveM servers in under a minute — DDoS-protected, mod-ready, on high-clock CPUs and NVMe with a full web console. From $4/month.",
};

export const revalidate = 300;

const GamesHome = () => {
  return (
    <main className="bg-[#08090b]">
      <GamesServicePage />
      <ServicesHomeSectionFive
        title="Frequently Asked Questions"
        faqs={[
          {
            question: "How fast is my game server online?",
            answer:
              "Under a minute for every supported game. Provisioning, port allocation, and your console account are fully automated — you get a connect address as soon as the server boots.",
          },
          {
            question: "Which games can I host?",
            answer:
              "Minecraft (Java/Paper), Rust, Counter-Strike 2, and FiveM (GTA V) today. More titles are on the roadmap — tell us what you want to host next and we'll prioritize it.",
          },
          {
            question: "Can I install mods and plugins?",
            answer:
              "Yes, without restrictions. Paper plugins for Minecraft, Oxide/Carbon for Rust, workshop maps and custom configs for CS2, and txAdmin recipes with ESX/QBCore frameworks for FiveM. You get full file access via the web file manager and SFTP.",
          },
          {
            question: "Is DDoS protection really included?",
            answer:
              "Always-on L3/L4 mitigation sits in front of every game port on every plan at no extra cost — attacks are absorbed before they reach your server's network stack.",
          },
          {
            question: "Do CS2 and FiveM need my own license keys?",
            answer:
              "Yes — that's a requirement from the game publishers, not us. CS2 needs a free Steam GSLT token and FiveM needs a free cfx.re license key. Both take about two minutes to create, and our setup flow links you to the right pages.",
          },
          {
            question: "Can I upgrade my plan later?",
            answer:
              "Any time. Your world, mods, and configs stay in place — upgrading changes the resources under the same server, usually with under a minute of downtime.",
          },
          {
            question: "What happens if something breaks at 2 AM?",
            answer:
              "Automated backups let you roll back a bad plugin or corrupted world yourself in seconds, and our support team is online 24/7 — real humans, not a chatbot loop.",
          },
        ]}
      />
    </main>
  );
};

export default GamesHome;
