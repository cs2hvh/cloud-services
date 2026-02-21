"use client";

import WorldMap from "@/components/ui/worldmap";
import { Container } from "@/components/ui/container";
import { motion } from "motion/react";
import Image from "next/image";

const POP_LOCATIONS = [
  { lat: 37.7749, lng: -122.4194, label: "San Francisco" },
  { lat: 40.7128, lng: -74.006, label: "New York" },
  { lat: 34.0522, lng: -118.2437, label: "Los Angeles" },
  { lat: -23.5505, lng: -46.6333, label: "Sao Paulo" },
  { lat: 51.5074, lng: -0.1278, label: "London" },
  { lat: 48.8566, lng: 2.3522, label: "Paris" },
  { lat: 50.1109, lng: 8.6821, label: "Frankfurt" },
  { lat: 52.3676, lng: 4.9041, label: "Amsterdam" },
  { lat: 59.3293, lng: 18.0686, label: "Stockholm" },
  { lat: 40.4168, lng: -3.7038, label: "Madrid" },
  { lat: 19.076, lng: 72.8777, label: "Mumbai" },
  { lat: 25.2048, lng: 55.2708, label: "Dubai" },
  { lat: 1.3521, lng: 103.8198, label: "Singapore" },
  { lat: 35.6762, lng: 139.6503, label: "Tokyo" },
  { lat: -33.8688, lng: 151.2093, label: "Sydney" },
];

const STATS = [
  { value: "15", label: "Global Regions" },
  { value: "30+", label: "PoP Locations" },
  { value: "<20ms", label: "Avg Latency" },
  { value: "99.99%", label: "Uptime SLA" },
];

const REGIONS = [
  {
    continent: "Americas",
    locations: [
      { city: "San Francisco", flag: "us" },
      { city: "Los Angeles", flag: "us" },
      { city: "New York", flag: "us" },
      { city: "Sao Paulo", flag: "br" },
    ],
  },
  {
    continent: "Europe",
    locations: [
      { city: "London", flag: "gb" },
      { city: "Paris", flag: "fr" },
      { city: "Frankfurt", flag: "de" },
      { city: "Amsterdam", flag: "nl" },
      { city: "Stockholm", flag: "se" },
      { city: "Madrid", flag: "es" },
    ],
  },
  {
    continent: "Asia",
    locations: [
      { city: "Mumbai", flag: "in" },
      { city: "Dubai", flag: "ae" },
      { city: "Singapore", flag: "sg" },
      { city: "Tokyo", flag: "jp" },
    ],
  },
  {
    continent: "Oceania",
    locations: [
      { city: "Sydney", flag: "au" },
    ],
  },
];

export default function GlobalNetworkSection() {
  return (
    <section className="relative z-10 py-16 lg:py-24">
      {/* Background */}
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-black" />

        {/* Top/bottom fade */}
        <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-black to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />

        {/* Top divider */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <Container>
        {/* Header */}
        <motion.div
          className="text-center mb-8 lg:mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] as const }}
        >
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-[400] tracking-tight leading-tight text-white">
            Global Network Infrastructure
          </h2>
          <p className="mt-3 lg:mt-4 mx-auto max-w-2xl text-xs sm:text-sm leading-relaxed text-white/50 px-4">
            Strategically placed data centers and PoP locations across 15 regions
            deliver sub-20ms latency to 95% of the world&apos;s internet users.
          </p>
        </motion.div>

        {/* Map */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.25, 0.4, 0.25, 1] as const }}
        >
          <WorldMap locations={POP_LOCATIONS} />
        </motion.div>

        {/* Locations by continent */}
        <motion.div
          className="mt-6 lg:mt-8 pt-6 lg:pt-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, delay: 0.25, ease: [0.25, 0.4, 0.25, 1] as const }}
        >
          <div className="flex flex-wrap justify-center gap-12 lg:gap-16">
            {REGIONS.map((region) => (
              <div key={region.continent}>
                <h4 className="text-[11px] font-medium text-white/30 uppercase tracking-widest mb-4">
                  {region.continent}
                </h4>
                <ul className="space-y-2.5">
                  {region.locations.map((loc) => (
                    <li key={loc.city} className="flex items-center gap-2.5">
                      <Image
                        src={`https://flagcdn.com/w40/${loc.flag}.png`}
                        alt={loc.flag}
                        width={18}
                        height={12}
                        className="rounded-[1px] shrink-0"
                      />
                      <span className="text-[13px] text-white/60">{loc.city}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          className="mt-8 lg:mt-10 grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/[0.06]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, delay: 0.35, ease: [0.25, 0.4, 0.25, 1] as const }}
        >
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="bg-black p-5 sm:p-6 text-center transition-colors duration-300 hover:bg-white/[0.02]"
            >
              <div className="text-2xl sm:text-3xl font-semibold text-[#0095FF]">
                {stat.value}
              </div>
              <div className="mt-1 text-xs sm:text-sm text-white/40">
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}
