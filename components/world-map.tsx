"use client";

import WorldMapUI from "@/components/ui/world-map";
import { motion } from "motion/react";

export function WorldMap() {
  // Define datacenter locations with coordinates
  const datacenters = [
    {
      name: "North America - East",
      location: "New York, USA",
      lat: 40.7128,
      lng: -74.006,
      status: "operational",
      servers: 1250,
      latency: "12ms",
    },
    {
      name: "North America - West",
      location: "San Francisco, USA",
      lat: 37.7749,
      lng: -122.4194,
      status: "operational",
      servers: 980,
      latency: "8ms",
    },
    {
      name: "Europe - West",
      location: "London, UK",
      lat: 51.5074,
      lng: -0.1278,
      status: "operational",
      servers: 1100,
      latency: "15ms",
    },
    {
      name: "Europe - Central",
      location: "Frankfurt, Germany",
      lat: 50.1109,
      lng: 8.6821,
      status: "operational",
      servers: 890,
      latency: "18ms",
    },
    {
      name: "Asia - East",
      location: "Tokyo, Japan",
      lat: 35.6762,
      lng: 139.6503,
      status: "operational",
      servers: 1450,
      latency: "22ms",
    },
    {
      name: "Asia - South",
      location: "Singapore",
      lat: 1.3521,
      lng: 103.8198,
      status: "operational",
      servers: 760,
      latency: "25ms",
    },
    {
      name: "India",
      location: "Mumbai, India",
      lat: 11.0760,
      lng: 75.8777,
      status: "operational",
      servers: 920,
      latency: "20ms",
    },
    {
      name: "South America",
      location: "São Paulo, Brazil",
      lat: -23.5505,
      lng: -46.6333,
      status: "operational",
      servers: 540,
      latency: "35ms",
    },
    {
      name: "Australia",
      location: "Sydney, Australia",
      lat: -33.8688,
      lng: 151.2093,
      status: "operational",
      servers: 420,
      latency: "42ms",
    },
  ];

  // Create connections between datacenters (hub connections)
  const connections = [
    { start: datacenters[0], end: datacenters[2] }, // NY to London
    { start: datacenters[0], end: datacenters[1] }, // NY to SF
    { start: datacenters[1], end: datacenters[4] }, // SF to Tokyo
    { start: datacenters[2], end: datacenters[3] }, // London to Frankfurt
    { start: datacenters[3], end: datacenters[5] }, // Frankfurt to Singapore
    { start: datacenters[4], end: datacenters[5] }, // Tokyo to Singapore
    { start: datacenters[0], end: datacenters[7] }, // NY to São Paulo
    { start: datacenters[5], end: datacenters[8] }, // Singapore to Sydney
    { start: datacenters[6], end: datacenters[5] }, // Mumbai to Singapore
    { start: datacenters[3], end: datacenters[6] }, // Frankfurt to Mumbai
  ];

  const dots = connections.map((conn) => ({
    start: {
      lat: conn.start.lat,
      lng: conn.start.lng,
      label: conn.start.name,
    },
    end: {
      lat: conn.end.lat,
      lng: conn.end.lng,
      label: conn.end.name,
    },
  }));


  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-12"
      >
        <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent mb-4">
          Global Infrastructure
        </h2>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Deploy your applications across our worldwide network of data centers
          with ultra-low latency and enterprise-grade reliability.
        </p>
      </motion.div>

      {/* World Map */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="relative rounded-2xl overflow-hidden bg-black/50 backdrop-blur-sm border border-white/10 p-8"
      >
        <WorldMapUI dots={dots} lineColor="#3b82f6" />
      </motion.div>


    </div>
  );
}