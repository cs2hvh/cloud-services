"use client";

// Monochrome OS distribution icons.
//
// Visual approach matches Azure / AWS / GCP / Linode conventions:
//   - Single color (currentColor) — colored "brand" hues are reserved
//     for status pills and primary actions, not list rows
//   - 24x24 viewBox so they sit cleanly next to lucide icons
//   - Recognisable distro silhouette but simplified — no marketing
//     marks, no gradients, no embedded text
//
// Use osIconFor(name) to resolve a free-form OS name (e.g. "Ubuntu
// Server 22.04 LTS") to the right glyph.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Ubuntu — three-dot circle of friends, simplified. */
export function UbuntuIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" fill="none" {...props}>
            <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.4" opacity="0.85" />
            <circle cx="12" cy="4.5" r="1.8" fill="currentColor" />
            <circle cx="5.5" cy="15.5" r="1.8" fill="currentColor" />
            <circle cx="18.5" cy="15.5" r="1.8" fill="currentColor" />
        </svg>
    );
}

/** Debian — spiral / open swirl. */
export function DebianIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" fill="none" {...props}>
            <path
                d="M16.5 12.5 a4.5 4.5 0 1 0 -4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
            <path
                d="M18.5 9 a7.5 7.5 0 1 0 1.2 5.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                opacity="0.7"
            />
            <circle cx="16.5" cy="12.5" r="0.9" fill="currentColor" opacity="0.6" />
        </svg>
    );
}

/** CentOS Stream — pinwheel quadrants. */
export function CentosIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" {...props}>
            <path d="M12 3 l2.5 4 H17 v3 l4 2.5 -4 2.5 v3 h-2.5 L12 21 l-2.5 -4 H7 v-3 l-4 -2.5 4 -2.5 v-3 h2.5 z" />
            <path d="M12 7 v10 M7 12 h10" opacity="0.6" />
        </svg>
    );
}

/** AlmaLinux — angled chevrons (compass-like). */
export function AlmaIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" {...props}>
            <path d="M12 3 L4 12 L12 21 L20 12 Z" />
            <path d="M12 8 L8 12 L12 16 L16 12 Z" opacity="0.55" />
            <circle cx="12" cy="12" r="1.2" fill="currentColor" opacity="0.8" />
        </svg>
    );
}

/** Rocky Linux — angular mountain peaks. */
export function RockyIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" {...props}>
            <circle cx="12" cy="12" r="9.5" opacity="0.45" />
            <path d="M3.5 17 L9 9.5 L13.5 14.5 L17 11 L21 16.5" />
            <circle cx="17" cy="6.5" r="1.4" fill="currentColor" opacity="0.7" />
        </svg>
    );
}

/** Fedora — stylized 'f' inside a disc. */
export function FedoraIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" fill="none" {...props}>
            <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.4" opacity="0.85" />
            <path
                d="M14 7 a2.5 2.5 0 0 0 -2.5 2.5 v8 M10 12 h4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/** Windows — four-pane window. */
export function WindowsIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" fill="none" {...props}>
            <rect x="3" y="3" width="8" height="8" fill="currentColor" opacity="0.95" />
            <rect x="13" y="3" width="8" height="8" fill="currentColor" opacity="0.95" />
            <rect x="3" y="13" width="8" height="8" fill="currentColor" opacity="0.95" />
            <rect x="13" y="13" width="8" height="8" fill="currentColor" opacity="0.95" />
        </svg>
    );
}

/** Generic Linux / Tux — simple penguin silhouette. */
export function LinuxIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" fill="none" {...props}>
            <path
                d="M12 3 c2.6 0 4.5 2 4.5 4.5 v3.5 c1.6 1 3 3.5 3 6 c0 1.5 -0.8 2.5 -2 2.5 c-1 0 -1.5 -0.6 -2 -1.5 c-0.5 1 -1.6 2 -3.5 2 s-3 -1 -3.5 -2 c-0.5 0.9 -1 1.5 -2 1.5 c-1.2 0 -2 -1 -2 -2.5 c0 -2.5 1.4 -5 3 -6 V7.5 c0 -2.5 1.9 -4.5 4.5 -4.5 z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
                opacity="0.95"
            />
            <circle cx="10.5" cy="9" r="0.8" fill="currentColor" />
            <circle cx="13.5" cy="9" r="0.8" fill="currentColor" />
            <path d="M11 12 c0.4 0.6 1.6 0.6 2 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" />
        </svg>
    );
}

/** Resolve an OS name to the right icon component. */
export function osIconFor(osName: string | null | undefined) {
    const n = (osName ?? "").toLowerCase();
    if (n.includes("ubuntu")) return UbuntuIcon;
    if (n.includes("debian")) return DebianIcon;
    if (n.includes("centos")) return CentosIcon;
    if (n.includes("alma")) return AlmaIcon;
    if (n.includes("rocky")) return RockyIcon;
    if (n.includes("fedora")) return FedoraIcon;
    if (n.includes("windows") || n.includes("win ")) return WindowsIcon;
    return LinuxIcon;
}
