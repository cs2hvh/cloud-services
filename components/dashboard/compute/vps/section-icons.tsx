"use client";

// Custom inline-SVG icons for the VPS create-flow section headers.
// Each one carries small decorative cues (chips, dots, hatch lines)
// so the page reads as "designed" rather than templated. Drawn at
// 32×32, light-weight strokes, accents in brand colors.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Image / OS — a disc with subtle reflection. */
export function ImageIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 32 32" fill="none" {...props}>
            <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
            <circle cx="16" cy="16" r="6.5" stroke="currentColor" strokeWidth="1.25" opacity="0.5" />
            <circle cx="16" cy="16" r="1.5" fill="currentColor" />
            <path
                d="M16 4 a12 12 0 0 1 8.5 3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.9"
            />
        </svg>
    );
}

/** Region / geography — globe with longitude lines + pin. */
export function RegionIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 32 32" fill="none" {...props}>
            <circle cx="14" cy="15" r="11" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
            <ellipse cx="14" cy="15" rx="11" ry="4.5" stroke="currentColor" strokeWidth="1" opacity="0.45" />
            <ellipse cx="14" cy="15" rx="5" ry="11" stroke="currentColor" strokeWidth="1" opacity="0.45" />
            {/* pin */}
            <path
                d="M22 7 c2 0 3.5 1.5 3.5 3.5 c0 2.2 -3.5 5.5 -3.5 5.5 s-3.5 -3.3 -3.5 -5.5 c0 -2 1.5 -3.5 3.5 -3.5 z"
                fill="currentColor"
                opacity="0.95"
            />
            <circle cx="22" cy="10.5" r="1.25" fill="#0c0d11" />
        </svg>
    );
}

/** Plan — chip board with central die + edge pins. */
export function PlanIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 32 32" fill="none" {...props}>
            <rect x="4" y="6" width="24" height="18" rx="1" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
            <rect x="10" y="11" width="12" height="8" rx="0.75" fill="currentColor" opacity="0.85" />
            {/* pins top */}
            <path d="M9 4v2 M14 4v2 M19 4v2 M24 4v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.6" />
            {/* pins bottom */}
            <path d="M9 24v3 M14 24v3 M19 24v3 M24 24v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            {/* highlight */}
            <path d="M11 12 h6" stroke="#0c0d11" strokeWidth="0.85" opacity="0.6" />
        </svg>
    );
}

/** Details — tag with hole + short copy lines. */
export function DetailsIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 32 32" fill="none" {...props}>
            <path
                d="M5 14 L14 5 H25 a2 2 0 0 1 2 2 v11 L18 27 a2 2 0 0 1 -2.8 0 L5 16.8 a2 2 0 0 1 0 -2.8 z"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.9"
            />
            <circle cx="21" cy="11" r="2" fill="currentColor" opacity="0.95" />
            <path d="M11 18 l3 3 M14 15 l3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.55" />
        </svg>
    );
}

/** Authentication — shield with keyhole + sparkle. */
export function AuthIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 32 32" fill="none" {...props}>
            <path
                d="M16 3 l11 4 v9 c0 7 -5 11 -11 13 c-6 -2 -11 -6 -11 -13 V7 z"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.9"
            />
            {/* keyhole */}
            <circle cx="16" cy="14" r="2.2" fill="currentColor" opacity="0.95" />
            <path d="M16 16 v3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            {/* sparkle */}
            <path d="M24 8 l0.5 1.2 L26 9.5 l-1.2 0.5 L24 11 l-0.5 -1.2 L22 9.5 l1.5 -0.3 z" fill="currentColor" opacity="0.55" />
        </svg>
    );
}

/** Server in the list page — a custom "stacked rack unit" icon. */
export function ServerStackIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 32 32" fill="none" {...props}>
            <rect x="4" y="5" width="24" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" opacity="0.9" />
            <rect x="4" y="14" width="24" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" opacity="0.95" />
            <rect x="4" y="23" width="24" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
            <circle cx="8" cy="8.5" r="1" fill="currentColor" />
            <circle cx="8" cy="17.5" r="1" fill="currentColor" />
            <circle cx="8" cy="26" r="1" fill="currentColor" opacity="0.6" />
            <path d="M12 8.5 h10 M12 17.5 h10" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.5" />
            <path d="M12 26 h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.3" />
        </svg>
    );
}
