// "use client";

// import Image from "next/image";

// export function GlobalNetworkSection() {
//   return (
//     <section className="relative overflow-hidden bg-[#020617]">
//       {/* Diagonal background bands */}
//       <div className="pointer-events-none absolute inset-0">
//         <div className="absolute -left-40 top-[20%] h-[220px] w-[160%] -rotate-6 bg-gradient-to-r from-black via-[#020617] to-black" />
//         <div className="absolute -left-40 bottom-[-180px] h-[260px] w-[160%] rotate-6 bg-gradient-to-r from-black via-[#020617] to-black" />
//       </div>

//       {/* Top content */}
//       <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 lg:pt-28">
//         <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
//           {/* Left text */}
//           <div className="max-w-xl">
//             <h2 className="text-2xl sm:text-3xl lg:text-[32px] font-semibold leading-tight tracking-tight">
//               <span className="text-slate-400">Global </span>
//               <span className="text-white">Network </span>
//               <span className="block text-[#00A2FF]">Infrastructure</span>
//             </h2>

//             <p className="mt-3 max-w-md text-[11px] sm:text-xs text-slate-300">
//               Data centers across the world ensuring your applications are always fast and
//               available, no matter where your users are.
//             </p>
//           </div>

//           {/* Right boxed world map */}
//           <div className="relative justify-self-end w-full max-w-[360px] sm:max-w-[420px] lg:max-w-[560px]">
//             <div className="relative aspect-[16/9] ">
//               <Image
//                 src="/images/main-page/world-map.svg"
//                 alt="Global network map"
//                 fill
//                 className="object-contain"
//                 priority={false}
//               />
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Bottom centered copy */}
//       <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-24 sm:mt-28 lg:mt-40 pb-16 sm:pb-20 lg:pb-28">
//         <div className="flex flex-col items-center gap-6">
//           {/* Boxed headline */}
//           <div className="border border-[#00A2FF] px-6 py-5 text-center">
//             <p className="text-2xl sm:text-3xl lg:text-[32px] font-semibold leading-snug tracking-tight text-white">
//               <span className="block">Powered by an easy-</span>
//               <span className="block">to-use, developer-</span>
//               <span className="block">
//                 friendly <span className="text-[#00A2FF]">platform</span>
//               </span>
//             </p>
//           </div>

//           {/* Footnote + description */}
//           <div className="max-w-xl text-center text-[10px] sm:text-xs text-slate-400 space-y-2">
//             <p>
//               *Use this anim effect in this page
//               https://velocity.uxdevtemplates.io/keon/portasmap-6-lento
//             </p>
//             <p>
//               All Primitives share a common suite of platform features that enhance security and
//               ensure ahura-cloud fits neatly into your existing infrastructure.
//             </p>
//           </div>
//         </div>
//       </div>
//     </section>
//   );
// }


"use client";
import WorldMap from "@/components/ui/worldmap";
import { motion } from "motion/react";

export default function GlobalNetworkSection() {
  return (
    <div className="bg-[#030625] w-full">
      
      <WorldMap
        dots={[
          {
            start: {
              lat: 64.2008,
              lng: -149.4937,
              label: "Alaska, USA",
            },
            end: {
              lat: 34.0522,
              lng: -118.2437,
              label: "Los Angeles, USA",
            },
          },
          {
            start: { lat: 64.2008, lng: -149.4937, label: "Alaska, USA" },
            end: { lat: -15.7975, lng: -47.8919, label: "Brasília, Brazil" },
          },
          {
            start: { lat: -15.7975, lng: -47.8919, label: "Brasília, Brazil" },
            end: { lat: 38.7223, lng: -9.1393, label: "Lisbon, Portugal" },
          },
          {
            start: { lat: 51.5074, lng: -0.1278, label: "London, UK" },
            end: { lat: 28.6139, lng: 77.209, label: "New Delhi, India" },
          },
          {
            start: { lat: 28.6139, lng: 77.209, label: "New Delhi, India" },
            end: { lat: 43.1332, lng: 131.9113, label: "Vladivostok, Russia" },
          },
          {
            start: { lat: 28.6139, lng: 77.209, label: "New Delhi, India" },
            end: { lat: -1.2921, lng: 36.8219, label: "Nairobi, Kenya" },
          },
        ]}
      />
    </div>
  );
}



