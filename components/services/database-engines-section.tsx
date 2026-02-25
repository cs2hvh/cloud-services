"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Container } from "@/components/ui/container";

/* ─── Database engine SVG icons ─── */

const icons = {
  postgresql: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M17.128 0a10.134 10.134 0 0 0-2.755.403l-.063.02A10.922 10.922 0 0 0 12.6.258C11.422.238 10.41.524 9.594 1 8.79.721 7.122.24 5.364.336 4.14.403 2.804.775 1.814 1.82.828 2.862.466 4.387.57 6.27c.027.502.203 1.386.498 2.569a43.644 43.644 0 0 0 1.455 4.476c.354.849.741 1.622 1.2 2.198.229.287.504.563.84.748.337.186.748.276 1.143.167.397-.11.692-.39.91-.7.174-.248.32-.527.443-.822a9.46 9.46 0 0 0 2.536 1.568A7.563 7.563 0 0 0 7.78 17.81a.674.674 0 0 0-.009.053c-.08.558-.143 1.092.064 1.621.103.265.299.494.5.664.199.17.42.299.636.404.432.21.897.337 1.307.432.867.202 1.618.283 2.094.325a10.97 10.97 0 0 0-.145 1.2c-.035.634-.037 1.348.263 1.96.15.305.392.592.745.772.352.18.768.204 1.128.103.72-.203 1.235-.813 1.593-1.4.36-.59.607-1.218.805-1.764l.06-.164c.073-.2.136-.392.192-.578.091.04.183.074.277.103.575.177 1.168.153 1.68-.084a2.534 2.534 0 0 0 .844-.636c.202-.235.371-.494.385-.81a.877.877 0 0 0-.058-.4 1.186 1.186 0 0 0-.215-.36c.196-.172.399-.36.589-.575.373-.423.753-.963.87-1.635.06-.348.043-.72-.098-1.072a1.605 1.605 0 0 0-.68-.766c.095-.141.176-.292.239-.453.156-.4.2-.845.169-1.284-.061-.876-.356-1.73-.609-2.41l-.032-.085c-.174-.47-.04-.998.127-1.518.168-.52.383-1.103.37-1.735-.014-.636-.274-1.34-.902-1.853-.627-.512-1.564-.724-2.756-.57a6.153 6.153 0 0 0-1.056.22A10.19 10.19 0 0 0 17.128 0z" />
    </svg>
  ),
  mysql: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M16.405 5.501c-.115 0-.193.014-.274.033v.013h.014c.054.104.146.18.214.273.054.107.1.214.154.32l.014-.015c.094-.066.14-.172.14-.333-.04-.047-.046-.094-.08-.14-.04-.067-.126-.1-.18-.153zM5.77 18.695h-.927a50.854 50.854 0 0 0-.27-4.41h-.008l-1.41 4.41H2.45l-1.4-4.41h-.01a72.892 72.892 0 0 0-.195 4.41H0c.055-1.966.192-3.81.41-5.53h1.15l1.335 4.064h.008l1.347-4.064h1.095c.242 2.015.384 3.86.428 5.53zm4.017-4.08c-.378 2.045-.876 3.533-1.492 4.46-.482.723-1.01 1.084-1.583 1.084-.16 0-.36-.05-.594-.145v-.477c.104.013.2.033.293.033.32 0 .584-.098.79-.297a1.1 1.1 0 0 0 .298-.497c0-.062-.062-.37-.18-.93l-1.02-4.23h.81l.693 3.027c.142.6.22.985.232 1.16l.993-4.187h.756zm9.272 4.08h-.82V16.26a67.724 67.724 0 0 1-.053-1.082c-.025-.434-.04-.776-.04-1.027h-.013l-1.533 4.545h-.584l-1.54-4.545h-.014c0 .247-.01.592-.025 1.033a82.58 82.58 0 0 1-.046 1.089v1.422h-.752v-5.53h1.078l1.385 4.118h.014l1.41-4.118h1.033v5.53zm3.607-2.303c0 .752-.217 1.34-.653 1.764-.435.424-1.024.636-1.767.636-.684 0-1.25-.186-1.694-.553l.293-.454c.388.33.81.497 1.275.497.487 0 .868-.135 1.143-.406.276-.27.413-.655.413-1.152v-.483h-.013c-.35.554-.856.83-1.52.83-.567 0-1.026-.218-1.378-.654-.352-.435-.528-.99-.528-1.664 0-.753.198-1.373.596-1.86.396-.488.907-.73 1.53-.73.594 0 1.034.25 1.318.756h.013V13.5h.705v4.29h-.098v-.397h.366zm-.68-1.886c0-.437-.125-.802-.374-1.094-.25-.292-.58-.438-.99-.438-.458 0-.826.186-1.11.56-.278.378-.42.856-.42 1.44 0 .52.138.94.416 1.262.277.32.627.48 1.048.48.398 0 .738-.157 1.02-.47.282-.316.41-.7.41-1.156v-.584zM22.894 18h-.732v-5.53h.732V18zm.838-.625c0 .115-.04.213-.126.296-.084.084-.19.125-.31.125a.413.413 0 0 1-.306-.125.4.4 0 0 1-.125-.296c0-.115.042-.21.125-.292a.42.42 0 0 1 .306-.122c.12 0 .226.04.31.122.086.082.126.177.126.292z" />
    </svg>
  ),
  redis: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M10.5 2.661l.54.997-1.797.644 2.409.218.748 1.246.467-1.155 2.209-.392-1.747-.467.555-1.2-1.15.673zm-3.86 4.08L0 9.85l7.603 3.493.004-.004 8.304 3.792L24 13.72l-8.693-3.677zM4.308 13.762L0 15.882l7.604 3.489 8.304 3.793L24 19.763l-4.135-1.757-7.248 2.796z" />
    </svg>
  ),
  mongodb: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M17.193 9.555c-1.264-5.58-4.252-7.414-4.573-8.115-.28-.394-.53-.954-.735-1.44-.036.495-.055.685-.523 1.184-.723.566-4.438 3.682-4.74 10.02-.282 5.912 4.27 9.435 4.888 9.884l.07.05A73.49 73.49 0 0 1 11.91 24h.481c.114-.323.284-.897.374-1.575 1.299-.915 5.859-4.086 4.428-12.87" />
    </svg>
  ),
};

/* ─── Database engines ─── */

const ENGINES = [
  {
    name: "PostgreSQL",
    icon: icons.postgresql,
    color: "#336791",
    version: "16",
    type: "Relational",
    description: "Advanced open-source relational database with ACID compliance, JSON support, and powerful extensions like PostGIS and pgvector.",
    highlights: ["ACID Compliant", "JSON Support", "Extensions"],
  },
  {
    name: "MongoDB",
    icon: icons.mongodb,
    color: "#47A248",
    version: "7.0",
    type: "Document",
    description: "Flexible document database built for modern applications. Store, query, and index JSON-like data with horizontal scaling.",
    highlights: ["Document Store", "Sharding", "Aggregation"],
  },
  {
    name: "MySQL",
    icon: icons.mysql,
    color: "#4479A1",
    version: "8.4",
    type: "Relational",
    description: "The world's most popular open-source relational database. Battle-tested reliability with InnoDB engine and replication support.",
    highlights: ["InnoDB Engine", "Replication", "Battle-tested"],
  },
  {
    name: "Redis",
    icon: icons.redis,
    color: "#DC382D",
    version: "7.2",
    type: "Key-Value",
    description: "In-memory data store for caching, sessions, and real-time analytics. Sub-millisecond latency with persistence options.",
    highlights: ["Sub-ms Latency", "Pub/Sub", "Data Structures"],
  },
];

/* ─── Animations ─── */

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

/* ─── Component ─── */

export default function DatabaseEnginesSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  /* Parallax layers — each moves at a different speed */
  const bgY1 = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const bgY2 = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const bgY3 = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const bgY4 = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <section
      ref={sectionRef}
      className="relative w-full bg-black py-12 md:py-16 lg:py-28 overflow-hidden"
    >
      {/* ── Background layers ── */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
        {/* Fade edges of grid */}
        <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent via-50% to-black" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent via-50% to-black" />

        {/* Primary blue glow — top center, slow parallax */}
        <motion.div
          className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[1000px] h-[700px] rounded-full bg-[#0095FF]/[0.04] blur-[160px]"
          style={{ y: bgY1 }}
        />

        {/* Secondary warm glow — right side */}
        <motion.div
          className="absolute top-[30%] right-[-200px] w-[600px] h-[600px] rounded-full bg-[#0095FF]/[0.025] blur-[140px]"
          style={{ y: bgY2 }}
        />

        {/* Accent glow — left bottom, faster parallax */}
        <motion.div
          className="absolute bottom-[10%] left-[-150px] w-[500px] h-[500px] rounded-full bg-[#336791]/[0.04] blur-[120px]"
          style={{ y: bgY3 }}
        />

        {/* Small sharp accent — center, moves opposite */}
        <motion.div
          className="absolute top-[55%] left-[40%] w-[300px] h-[300px] rounded-full bg-[#0095FF]/[0.03] blur-[80px]"
          style={{ y: bgY4 }}
        />

        {/* Horizontal accent lines */}
        <div className="absolute top-[25%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
        <div className="absolute top-[65%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />

        {/* Vertical subtle accent */}
        <div className="absolute top-0 bottom-0 left-[20%] w-px bg-gradient-to-b from-transparent via-white/[0.025] to-transparent" />
        <div className="absolute top-0 bottom-0 right-[20%] w-px bg-gradient-to-b from-transparent via-white/[0.025] to-transparent" />
      </div>

      <Container>
        {/* Header */}
        <motion.div
          className="text-center mb-16 lg:mb-20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0095FF] animate-pulse" />
            <span className="text-[11px] font-medium text-white/60 uppercase tracking-wider">
              Managed Database Engines
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-[400] tracking-tight leading-[1.1] text-white">
            Your Data.{" "}
            <span className="text-[#0095FF]">Fully Managed.</span>
          </h2>
          <p className="mt-4 text-sm lg:text-base leading-[1.7] text-white/65 max-w-2xl mx-auto">
            Deploy production-ready databases in seconds. We handle provisioning,
            patching, backups, and failover — you focus on your queries.
          </p>
        </motion.div>

        {/* ── Engine cards: 2x2 grid ── */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          transition={{ staggerChildren: 0.1 }}
        >
          {ENGINES.map((engine) => (
            <motion.div
              key={engine.name}
              variants={fadeUp}
              className="group relative rounded-xl p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-white/[0.04] to-white/[0.01] hover:from-white/[0.06] hover:to-white/[0.02] transition-all duration-300 overflow-hidden min-h-0"
            >
              {/* Top accent line in engine color */}
              <div
                className="absolute top-0 left-4 right-4 sm:left-6 sm:right-6 h-px opacity-40 group-hover:opacity-70 transition-opacity duration-300"
                style={{ background: `linear-gradient(90deg, transparent, ${engine.color}, transparent)` }}
              />

              {/* Background glow */}
              <div
                className="absolute top-[-60px] right-[-60px] w-[200px] h-[200px] rounded-full blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ backgroundColor: `${engine.color}15` }}
              />

              <div className="relative flex flex-col sm:flex-row md:flex-row items-start gap-4 sm:gap-5">
                {/* Large icon */}
                  <div className="shrink-0 mb-3 sm:mb-0">
                  <div
                    className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
                    style={{
                      backgroundColor: `${engine.color}15`,
                      boxShadow: `0 0 0 1px ${engine.color}20, 0 0 30px ${engine.color}08`,
                    }}
                  >
                    <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8" style={{ color: engine.color }}>
                      {engine.icon}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                    <h3 className="text-[15px] sm:text-[16px] lg:text-[18px] font-[600] text-white">
                      {engine.name}
                    </h3>
                    <div className="flex items-center gap-2 ml-0 sm:ml-2">
                      <span
                        className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-sm"
                      style={{
                        color: `${engine.color}`,
                        backgroundColor: `${engine.color}15`,
                      }}
                    >
                      v{engine.version}
                    </span>
                      <span className="text-[10px] text-white/35 uppercase tracking-wider">
                        {engine.type}
                      </span>
                    </div>
                  </div>

                  <p className="text-[13px] sm:text-[14px] text-white/60 leading-[1.5] mb-3 sm:mb-4 break-words">
                    {engine.description}
                  </p>

                  {/* Highlight tags */}
                  <div className="flex flex-wrap gap-2">
                    {engine.highlights.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] text-white/45 bg-white/[0.04] px-2.5 py-1 rounded-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}
