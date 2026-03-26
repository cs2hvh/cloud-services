import { Container } from "@/components/ui/container";

export default function DomainArcCtaSection() {
  return (
    <section className="relative overflow-hidden bg-[#202124] pt-16 sm:pt-20 lg:pt-24">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 18%, rgba(53,114,255,0.5), transparent 24%), linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.45))",
        }}
        aria-hidden="true"
      />

      <Container className="relative z-10">
        <div className="mx-auto flex max-w-[760px] flex-col items-center text-center">
          <span className="inline-flex rounded-full border border-[#2F7BFF] bg-[#171C2B] px-4 py-1 text-xs font-medium text-white shadow-[0_0_24px_rgba(69,132,255,0.75)]">
            ahuracloud
          </span>

          <h2 className="mt-6 text-3xl font-semibold leading-tight text-[#D8D8E8] sm:text-4xl lg:text-[48px]">
            Own Your Domain
            <span className="block text-[#2F5CFF]">Power Your Online Presence</span>
          </h2>

          <p className="mt-4 max-w-[680px] text-sm leading-relaxed text-white/65 sm:text-base">
            Find the right name, connect it to your infrastructure, and manage everything
            from one reliable platform. Simple registration, smart DNS tools, and dependable
            security for every stage of growth.
          </p>
        </div>
      </Container>

      <div
        className="pointer-events-none absolute left-1/2 bottom-[-270px] h-[420px] w-[150%] -translate-x-1/2 rounded-[50%] border-t border-[#E5EBFF]/90 bg-[radial-gradient(ellipse_at_center,rgba(61,93,255,0.38),rgba(37,52,100,0.18)_48%,rgba(8,10,14,0)_72%)] shadow-[0_-8px_60px_rgba(66,95,255,0.45)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none relative mt-14 h-20 bg-[#08090C] opacity-95 sm:h-24"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 40%, rgba(255,255,255,0.12) 1px, transparent 1px), radial-gradient(circle at 60% 70%, rgba(255,255,255,0.12) 1px, transparent 1px), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "160px 120px, 220px 140px, 180px 120px",
        }}
        aria-hidden="true"
      />
    </section>
  );
}
