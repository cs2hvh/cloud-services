import React from "react";

const ServicesHomeSectionSix = () => {
  const cases = [
    {
      title: "AI/ML Training",
      description:
        "Train large language models and deep learning networks with high-performance GPU clusters.",
    },
    {
      title: "Inference at Scale",
      description:
        "Deploy ML models for real-time inference with auto-scaling based on request volume.",
    },
    {
      title: "3D Rendering",
      description:
        "Render complex 3D scenes and animations with professional-grade GPU acceleration.",
    },
    {
      title: "Scientific Computing",
      description:
        "Run simulations, molecular dynamics, and other HPC workloads with GPU acceleration.",
    },
  ];

  return (
    <section className="relative overflow-hidden bg-[#C1C1C1] py-16 md:py-24">
      {/* Top triangular black div */}
      <div
        className="absolute inset-x-0 -top-16 h-24 bg-black origin-top-left skew-y-3"
        aria-hidden="true"
      />
      {/* Bottom triangular black div */}
      <div
        className="absolute inset-x-0 -bottom-16 h-24 bg-black origin-bottom-left -skew-y-3"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col px-6">
        {/* Heading with 30% left margin */}
        <div className="ml-[30%]">
          <p className="text-base font-semibold uppercase tracking-[0.3em] text-neutral-700">
            Use Cases
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-neutral-900 md:text-4xl">
            Built For Your <span className="text-sky-500">Needs</span>
          </h2>
        </div>
        
        {/* Grid with custom positioning */}
        <div className="mt-12 flex flex-col gap-8">
          {/* Top 2 articles towards left 20% */}
          <div className="grid w-full gap-8 md:grid-cols-2 md:pr-[20%]">
            {cases.slice(0, 2).map((item) => (
              <article
                key={item.title}
                className="rounded-lg bg-[#1B1B1BBF] px-8 py-8 text-left text-white shadow-[0px_18px_28px_rgba(0,0,0,0.35)]"
              >
                <h3 className="text-xl font-semibold">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-200">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
          
          {/* Bottom 2 articles towards right 20% */}
          <div className="grid w-full gap-8 md:grid-cols-2 md:pl-[20%]">
            {cases.slice(2, 4).map((item) => (
              <article
                key={item.title}
                className="rounded-lg bg-[#1B1B1BBF] px-8 py-8 text-left text-white shadow-[0px_18px_28px_rgba(0,0,0,0.35)]"
              >
                <h3 className="text-xl font-semibold">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-200">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ServicesHomeSectionSix;