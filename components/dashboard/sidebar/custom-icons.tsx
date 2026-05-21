"use client";

// Custom-drawn icons for the dashboard sidebar / nav surfaces.
// Designed to match lucide-react's visual weight at 14px:
//   - 24x24 viewBox
//   - 1.75 strokeWidth by default
//   - strokeLinecap="round", strokeLinejoin="round"
//   - color via currentColor so they inherit text color
//
// Use these instead of lucide for items where a generic icon
// (Sparkles, Rocket) feels too cheap for a premium cloud product.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { strokeWidth?: number | string };

/**
 * Graphics card / GPU icon — board outline with a central chip,
 * heatsink fins, and PCIe edge pins along the bottom. Reads as
 * "GPU" at any size.
 */
export function GpuIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            {/* Board outline */}
            <rect x="2.5" y="6.5" width="19" height="11" rx="1.5" />
            {/* Central die */}
            <rect x="9.5" y="9.5" width="5" height="5" rx="0.75" fill="currentColor" stroke="none" opacity="0.85" />
            {/* Heatsink fins on the right */}
            <path d="M16 10 v4 M18 10 v4 M20 10 v4" opacity="0.65" />
            {/* Capacitors on the left */}
            <path d="M5 10 v4 M7 10 v4" opacity="0.45" />
            {/* PCIe edge pins */}
            <path d="M6 17.5 v2 M8.5 17.5 v2 M11 17.5 v2 M13 17.5 v2 M15.5 17.5 v2 M18 17.5 v2" />
        </svg>
    );
}

/**
 * App deployment icon — three stacked layers with descending
 * opacity, suggesting build → ship → run. Cleaner than the
 * generic rocket cliché.
 */
export function AppDeployIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            {/* Top layer (smallest, most transparent) */}
            <rect x="7" y="3" width="10" height="4" rx="1" opacity="0.4" />
            {/* Middle layer */}
            <rect x="5" y="9" width="14" height="5" rx="1" opacity="0.7" />
            {/* Bottom layer (deployed) */}
            <rect x="3" y="16" width="18" height="5" rx="1" />
            {/* Tiny "live" pulse dot on the bottom layer */}
            <circle cx="6.5" cy="18.5" r="0.6" fill="currentColor" stroke="none" />
        </svg>
    );
}

/**
 * Kubernetes-style icon — three stacked cubes with a depth
 * cue, conveying "container orchestration" better than the
 * generic Box icon.
 */
export function K8sIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            {/* Back cube (depth) */}
            <path d="M15 5 l5 2.5 v5 l-5 2.5 l-5 -2.5 v-5 z" opacity="0.4" />
            {/* Front cube */}
            <path d="M9 11 l5 2.5 v5 l-5 2.5 l-5 -2.5 v-5 z" />
            {/* Front face center */}
            <path d="M9 16 v3.5 M9 16 l-5 -2.5 M9 16 l5 -2.5" opacity="0.55" />
        </svg>
    );
}
