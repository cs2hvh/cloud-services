import React from "react";

const ServicesHomeSectionSix = ({cases, hideTopDivider = false}:{cases:{title: string; description: string}[]; hideTopDivider?: boolean}) => {
 

  return (
    <section className="relative overflow-hidden bg-[#C1C1C1] py-16 md:py-24 min-[1920px]:py-28">
      {/* Top triangular black div - edge at top */}
      {!hideTopDivider && (
      <div
        className="absolute top-0 left-0 w-full h-[clamp(48px,6vw,140px)] bg-black
  [clip-path:polygon(0_0,_100%_0,_100%_100%)]"
      ></div>
      )}

      {/* Bottom triangular black div - edge at bottom */}
      <div
        className="absolute inset-x-0 -bottom-8 h-[clamp(48px,6vw,140px)] bg-black [clip-path:polygon(0_100%,_100%_100%,_0_0)]"
        // style={{ clipPath: 'polygon(0 100%, 100% 0, 100% 100%)' }}
        aria-hidden="true"
      />
      <div className="relative mx-auto flex w-full max-w-[1320px] flex-col px-6 lg:max-w-[1440px] lg:px-12 min-[1920px]:max-w-[1800px] min-[1920px]:px-16 min-[2560px]:max-w-[2600px] min-[2560px]:px-12">
        {/* Heading with 30% left margin */}
        <div className="ml-0 sm:ml-[10%] lg:ml-[26%] min-[1920px]:ml-[20%]">
          <p className="text-[clamp(12px,0.9vw,18px)] font-semibold uppercase tracking-[0.3em] text-neutral-700">
            Use Cases
          </p>
          <h2 className="mt-4 text-[clamp(28px,2.6vw,52px)] font-semibold text-neutral-900">
            Built For Your <span className="text-sky-500">Needs</span>
          </h2>
        </div>

        {/* Grid with custom positioning */}
        <div className="mt-12 flex flex-col gap-8">
          {/* Top 2 articles towards left 20% */}
          <div className="grid w-full gap-8 md:grid-cols-2 md:pr-[20%] min-[1920px]:gap-10">
            {cases.slice(0, 2).map((item) => (
              <article
                key={item.title}
                className=" bg-[#1B1B1BBF] px-8 py-8 text-left text-white shadow-[0px_18px_28px_rgba(0,0,0,0.35)] min-[1920px]:px-10 min-[1920px]:py-10"
              >
                <h3 className="text-[clamp(20px,1.6vw,32px)] font-semibold">{item.title}</h3>
                <p className="mt-3 text-[clamp(13px,1.05vw,18px)] leading-relaxed text-neutral-200">
                  {item.description}
                </p>
              </article>
            ))}
          </div>

          {/* Bottom 2 articles towards right 20% */}
          <div className="grid w-full gap-8 md:grid-cols-2 md:pl-[20%] min-[1920px]:gap-10">
            {cases.slice(2, 4).map((item) => (
              <article
                key={item.title}
                className=" bg-[#1B1B1BBF] px-8 py-8 text-left text-white shadow-[0px_18px_28px_rgba(0,0,0,0.35)] min-[1920px]:px-10 min-[1920px]:py-10"
              >
                <h3 className="text-[clamp(20px,1.6vw,32px)] font-semibold">{item.title}</h3>
                <p className="mt-3 text-[clamp(13px,1.05vw,18px)] leading-relaxed text-neutral-200">
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
