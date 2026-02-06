import React from "react";

const ServicesHomeSectionSix = ({cases}:{cases:{title: string; description: string}[]}) => {
 

  return (
    <section className="relative overflow-hidden bg-[#C1C1C1] py-16 md:py-24">
      {/* Top triangular black div - edge at top */}
      <div
        className="absolute top-0 left-0 w-full h-[6vw] bg-black
  [clip-path:polygon(0_0,_100%_0,_100%_100%)]"
      ></div>

      {/* Bottom triangular black div - edge at bottom */}
      <div
        className="absolute inset-x-0 -bottom-8 h-[6vw] bg-black [clip-path:polygon(0_100%,_100%_100%,_0_0)]"
        // style={{ clipPath: 'polygon(0 100%, 100% 0, 100% 100%)' }}
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