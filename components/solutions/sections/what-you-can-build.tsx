import { cn } from "@/lib/utils";

type BuildItem = {
  title: string;
  description: string;
};

type WhatYouCanBuildProps = {
  items: BuildItem[];
  className?: string;
};

export function WhatYouCanBuild({ items, className }: WhatYouCanBuildProps) {
  // Calculate rows for different breakpoints
  const lgCols = 3;
  const smCols = 2;
  const totalItems = items.length;
  const lgRows = Math.ceil(totalItems / lgCols);
  const smRows = Math.ceil(totalItems / smCols);

  return (
    <section
      className={cn(
        "relative w-full bg-black py-16 md:py-20 lg:py-24 border-b border-[#6b6b6b]",
        className
      )}
    >
      {/* Section Header */}
      <div className="text-center mb-12 md:mb-16 mx-auto w-full max-w-[75%] px-[clamp(24px,3vw,80px)]">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-4">
          What you{" "}
          <span className="text-[#0095FF]">can build</span>
        </h2>
        <p className="text-sm sm:text-base text-white/60 max-w-2xl mx-auto">
          From prototypes to production workloads, YourCloud provides the building blocks.
        </p>
      </div>

      {/* Full-width Grid with Borders */}
      <div className="w-full">
        {/* Top border */}
        <div className="w-full h-px bg-[#6b6b6b]" />
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => {
            const lgRowIndex = Math.floor(index / lgCols);
            const lgColIndex = index % lgCols;
            const smRowIndex = Math.floor(index / smCols);
            const smColIndex = index % smCols;
            const mobileRowIndex = index;

            const isLgLastCol = lgColIndex === lgCols - 1;
            const isSmLastCol = smColIndex === smCols - 1;
            const isLgLastRow = lgRowIndex === lgRows - 1;
            const isSmLastRow = smRowIndex === smRows - 1;
            const isMobileLastRow = mobileRowIndex === totalItems - 1;

            return (
              <div
                key={index}
                className={cn(
                  "px-6 py-8 md:px-8 md:py-10 lg:px-10 lg:py-12",
                  // Vertical borders (between columns)
                  !isLgLastCol && "lg:border-r lg:border-[#6b6b6b]",
                  !isSmLastCol && "sm:max-lg:border-r sm:max-lg:border-[#6b6b6b]",
                  // Horizontal borders (between rows)
                  !isLgLastRow && "lg:border-b lg:border-[#6b6b6b]",
                  !isSmLastRow && "sm:max-lg:border-b sm:max-lg:border-[#6b6b6b]",
                  !isMobileLastRow && "max-sm:border-b max-sm:border-[#6b6b6b]"
                )}
              >
                <h3 className="text-lg md:text-xl font-medium text-white mb-3">
                  {item.title}
                </h3>
                <p className="text-sm md:text-base text-white/50 leading-relaxed">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Bottom border */}
        <div className="w-full h-px bg-[#6b6b6b]" />
      </div>
    </section>
  );
}
