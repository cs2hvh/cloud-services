"use client";

import { motion } from "motion/react";
import { Shield, Zap, Cloud } from "lucide-react";

export function HomeFeaturesSection() {
  const features = [
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Bank-grade encryption and security protocols to protect your infrastructure.",
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Optimized network routes and NVMe storage for maximum performance.",
    },
    {
      icon: Cloud,
      title: "99.99% Uptime",
      description: "Redundant infrastructure with guaranteed uptime SLA.",
    },
  ];

  return (
    <section className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white/5 rounded-xl mb-4">
                <feature.icon className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-500 text-sm">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
