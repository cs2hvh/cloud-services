"use client";

// Custom-drawn icons for the dashboard sidebar / nav surfaces.
// Designed to match lucide-react's visual weight at 14px:
//   - 24x24 viewBox
//   - 1.75 strokeWidth by default
//   - strokeLinecap="round", strokeLinejoin="round"
//   - color via currentColor so they inherit text color
//   - subtle opacity layering for depth instead of flat outlines
//
// Use these instead of lucide for items where a generic icon
// feels too cheap for a premium cloud product.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { strokeWidth?: number | string };

const baseProps = (sw: number | string) => ({
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
});

/* ───────────── Existing brand icons ───────────── */

/**
 * Graphics card / GPU icon — board outline with a central chip,
 * heatsink fins, and PCIe edge pins along the bottom.
 */
export function GpuIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <rect x="2.5" y="6.5" width="19" height="11" rx="1.5" />
            <rect x="9.5" y="9.5" width="5" height="5" rx="0.75" fill="currentColor" stroke="none" opacity="0.85" />
            <path d="M16 10 v4 M18 10 v4 M20 10 v4" opacity="0.65" />
            <path d="M5 10 v4 M7 10 v4" opacity="0.45" />
            <path d="M6 17.5 v2 M8.5 17.5 v2 M11 17.5 v2 M13 17.5 v2 M15.5 17.5 v2 M18 17.5 v2" />
        </svg>
    );
}

/** App deployment — stacked layers with descending opacity. */
export function AppDeployIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <rect x="7" y="3" width="10" height="4" rx="1" opacity="0.4" />
            <rect x="5" y="9" width="14" height="5" rx="1" opacity="0.7" />
            <rect x="3" y="16" width="18" height="5" rx="1" />
            <circle cx="6.5" cy="18.5" r="0.6" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** Kubernetes — three stacked cubes with a depth cue. */
export function K8sIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <path d="M15 5 l5 2.5 v5 l-5 2.5 l-5 -2.5 v-5 z" opacity="0.4" />
            <path d="M9 11 l5 2.5 v5 l-5 2.5 l-5 -2.5 v-5 z" />
            <path d="M9 16 v3.5 M9 16 l-5 -2.5 M9 16 l5 -2.5" opacity="0.55" />
        </svg>
    );
}

/* ───────────── New custom icons ───────────── */

/** Overview — 4-panel mosaic with one accent panel. */
export function OverviewIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <rect x="3" y="3" width="8" height="8" rx="1" />
            <rect x="13" y="3" width="8" height="5" rx="1" opacity="0.55" />
            <rect x="13" y="10" width="8" height="11" rx="1" fill="currentColor" stroke="none" opacity="0.85" />
            <rect x="3" y="13" width="8" height="8" rx="1" opacity="0.55" />
        </svg>
    );
}

/** Compute — refined CPU chip with corner pins and a center die. */
export function ComputeIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <rect x="5" y="5" width="14" height="14" rx="1.5" />
            <rect x="9" y="9" width="6" height="6" rx="0.6" fill="currentColor" stroke="none" opacity="0.85" />
            <path d="M9 2 v3 M12 2 v3 M15 2 v3 M9 19 v3 M12 19 v3 M15 19 v3 M2 9 h3 M2 12 h3 M2 15 h3 M19 9 h3 M19 12 h3 M19 15 h3" opacity="0.55" />
        </svg>
    );
}

/** Server — 2 rack units with status dots and ventilation lines. */
export function ServerIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <rect x="3" y="4" width="18" height="7" rx="1" />
            <rect x="3" y="13" width="18" height="7" rx="1" />
            <circle cx="6" cy="7.5" r="0.7" fill="currentColor" stroke="none" />
            <circle cx="6" cy="16.5" r="0.7" fill="currentColor" stroke="none" />
            <path d="M9 7.5 h9" opacity="0.55" />
            <path d="M9 16.5 h9" opacity="0.55" />
        </svg>
    );
}

/** Hard drive — refined disk profile with a needle indicator. */
export function HardDriveIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <rect x="2.5" y="10" width="19" height="9" rx="1.5" />
            <path d="M2.5 14 h19" opacity="0.5" />
            <circle cx="17" cy="16.5" r="1" fill="currentColor" stroke="none" />
            <path d="M5 4 l1.5 5 h11 l1.5 -5 z" opacity="0.55" />
        </svg>
    );
}

/** Database — three stacked cylinders with one accent layer. */
export function DatabaseIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <ellipse cx="12" cy="5" rx="8" ry="2.2" />
            <path d="M4 5 v5.5 c0 1.2 3.6 2.2 8 2.2 s8 -1 8 -2.2 V5" />
            <path d="M4 10.5 v5.5 c0 1.2 3.6 2.2 8 2.2 s8 -1 8 -2.2 V10.5" />
            <path d="M4 16 v3 c0 1.2 3.6 2.2 8 2.2 s8 -1 8 -2.2 V16" />
            <circle cx="17" cy="10" r="0.7" fill="currentColor" stroke="none" />
            <circle cx="17" cy="15.5" r="0.7" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** Object storage — bucket with contained objects. */
export function BucketIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <path d="M4 7 h16 l-1.6 13.2 a1.2 1.2 0 0 1 -1.2 1.05 H6.8 a1.2 1.2 0 0 1 -1.2 -1.05 z" />
            <path d="M4 7 h16" opacity="0.55" />
            <path d="M9 7 V5 a3 3 0 0 1 6 0 V7" opacity="0.7" />
            <circle cx="10" cy="14" r="0.9" fill="currentColor" stroke="none" />
            <circle cx="14" cy="16" r="0.9" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** Globe — clean meridian + equator profile. */
export function GlobeIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12 h18" opacity="0.55" />
            <path d="M12 3 c2.6 3 4 6 4 9 s -1.4 6 -4 9 c -2.6 -3 -4 -6 -4 -9 s 1.4 -6 4 -9 z" opacity="0.7" />
        </svg>
    );
}

/** Cart — refined shopping cart silhouette. */
export function CartIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <path d="M3 4 h2.4 l2 11 h11 l1.8 -7.5 H7.4" />
            <circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="17" cy="20" r="1.2" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** Transfer — registry-to-registry exchange. */
export function TransferIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <path d="M4 8 h14 l-3 -3 M4 8 l3 3" />
            <path d="M20 16 H6 l3 3 M20 16 l-3 -3" />
        </svg>
    );
}

/** Network — central hub with 4 satellite nodes. */
export function NetworkIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" opacity="0.85" />
            <circle cx="4.5" cy="4.5" r="1.8" />
            <circle cx="19.5" cy="4.5" r="1.8" />
            <circle cx="4.5" cy="19.5" r="1.8" />
            <circle cx="19.5" cy="19.5" r="1.8" />
            <path d="M6 6 l4.5 4.5 M18 6 l-4.5 4.5 M6 18 l4.5 -4.5 M18 18 l-4.5 -4.5" opacity="0.55" />
        </svg>
    );
}

/** Shield — clean crest outline with subtle inner highlight. */
export function ShieldIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <path d="M12 3 l8 3 v6 c0 4.7 -3.3 8.6 -8 10 c -4.7 -1.4 -8 -5.3 -8 -10 V6 z" />
            <path d="M12 7 v10" opacity="0.35" />
        </svg>
    );
}

/** Shield + check — audit / verified. */
export function ShieldCheckIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <path d="M12 3 l8 3 v6 c0 4.7 -3.3 8.6 -8 10 c -4.7 -1.4 -8 -5.3 -8 -10 V6 z" />
            <path d="M8.5 12 l2.5 2.5 L16 9.5" />
        </svg>
    );
}

/** Lock — refined padlock with shackle and keyhole dot. */
export function LockIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <rect x="4.5" y="11" width="15" height="10" rx="1.5" />
            <path d="M8 11 V8 a4 4 0 0 1 8 0 v3" />
            <circle cx="12" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
            <path d="M12 16.5 v1.8" />
        </svg>
    );
}

/** Settings — hex gear with center dot, more architectural than the lucide gear. */
export function SettingsIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <path d="M12 3 l6.9 4 v10 L12 21 l-6.9 -4 V7 z" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" opacity="0.85" />
            <path d="M12 3 v3 M12 18 v3 M5.1 7 l2.6 1.5 M16.3 15.5 l2.6 1.5 M5.1 17 l2.6 -1.5 M16.3 8.5 l2.6 -1.5" opacity="0.55" />
        </svg>
    );
}

/** Users — two-person silhouette, refined. */
export function UsersIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20 c1.5 -3.5 4 -5 6 -5 s4.5 1.5 6 5" />
            <circle cx="17" cy="9" r="2.4" opacity="0.65" />
            <path d="M14 14.5 c2 -1.6 4 -1.6 6.5 0.5 l0.5 1" opacity="0.65" />
        </svg>
    );
}

/** Help — question mark in a circle. */
export function HelpIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.4 9.5 a2.6 2.6 0 0 1 5.2 0.4 c0 1.7 -2.6 2.1 -2.6 4" />
            <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** Activity — heartbeat / pulse line. */
export function ActivityIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <path d="M3 12 h4 l2 -6 l4 12 l2 -6 h2 l1 -3 h3" />
        </svg>
    );
}

/** Billing — coin / dollar badge. */
export function BillingIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M14.5 8.5 H10.5 a2 2 0 0 0 0 4 h3 a2 2 0 0 1 0 4 H9" />
            <path d="M12 6.5 v1.5 M12 16 v1.8" />
        </svg>
    );
}

/** Ticket / coupon — refined ticket silhouette. */
export function TicketIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <path d="M3 8 a2 2 0 0 1 2 -2 h14 a2 2 0 0 1 2 2 v2 a2 2 0 0 0 0 4 v2 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 v-2 a2 2 0 0 0 0 -4 z" />
            <path d="M14 6 v12" opacity="0.55" strokeDasharray="1.5 1.5" />
        </svg>
    );
}

/** AI agent — clean bot head with two eye dots and antenna. */
export function BotIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <rect x="4" y="8" width="16" height="11" rx="2.5" />
            <path d="M12 4 v4" />
            <circle cx="12" cy="3.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="9" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="15" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
            <path d="M9.5 16.5 h5" opacity="0.55" />
        </svg>
    );
}

/** Docs — page with text lines. */
export function DocsIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <path d="M5 3 h9 l5 5 v13 a 0 0 0 0 1 0 0 H5 z" />
            <path d="M14 3 v5 h5" opacity="0.55" />
            <path d="M8 13 h8 M8 16 h8 M8 19 h5" opacity="0.55" />
        </svg>
    );
}

/** Book — open book / knowledge. */
export function BookIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <path d="M3 5 h7 a2 2 0 0 1 2 2 v13 a2 2 0 0 0 -2 -2 H3 z" />
            <path d="M21 5 h-7 a2 2 0 0 0 -2 2 v13 a2 2 0 0 1 2 -2 h7 z" />
        </svg>
    );
}

/** Key — refined api-key icon. */
export function KeyIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <circle cx="7" cy="12" r="3.5" />
            <circle cx="7" cy="12" r="1.1" fill="currentColor" stroke="none" />
            <path d="M10.5 12 H21 M17 12 v3 M20 12 v2.5" />
        </svg>
    );
}

/** Rocket — refined silhouette for "deploy / launch". */
export function RocketIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <path d="M12 3 c3 2.5 5 6 5 11 v3 H7 v-3 c0 -5 2 -8.5 5 -11 z" />
            <circle cx="12" cy="10" r="1.5" fill="currentColor" stroke="none" />
            <path d="M7 17 l-2 4 M17 17 l2 4 M10 21 h4" opacity="0.55" />
        </svg>
    );
}

/** Plus — refined thin plus for "create / new". */
export function PlusIcon({ strokeWidth = 1.75, ...props }: IconProps) {
    return (
        <svg {...baseProps(strokeWidth)} {...props}>
            <path d="M12 5 v14 M5 12 h14" />
        </svg>
    );
}
