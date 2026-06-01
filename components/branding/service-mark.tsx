// Shared monoline service marks — the platform's visual language.
// Used in the homepage hero and the pricing page so service iconography
// stays consistent across marketing surfaces.

export type MarkKind =
    | "gpu"
    | "compute"
    | "k8s"
    | "database"
    | "storage"
    | "app"
    | "agent"
    | "shield"
    | "stack"
    | "deploy"
    | "arrow";

// Maps a pricing category slug to its monoline mark.
const CATEGORY_MARKS: Record<string, MarkKind> = {
    compute: "compute",
    gpu: "gpu",
    "gpu-instance": "gpu",
    "object-storage": "storage",
    storage: "storage",
    database: "database",
    kubernetes: "k8s",
    k8s: "k8s",
    security: "shield",
    "network-ddos": "shield",
    "ai-deployment": "agent",
    "ai-agents": "agent",
    "app-deployment": "app",
    "platform-apps": "app",
};

export function markForCategory(slug?: string | null): MarkKind {
    if (!slug) return "stack";
    return CATEGORY_MARKS[slug.toLowerCase().trim()] ?? "stack";
}

export function ServiceMark({
    kind,
    className = "",
}: {
    kind: MarkKind;
    className?: string;
}) {
    const stroke = {
        stroke: "currentColor",
        strokeWidth: 1.2,
        fill: "none",
        strokeLinecap: "square" as const,
        strokeLinejoin: "miter" as const,
    };
    const svgProps = {
        viewBox: "0 0 16 16",
        className,
        "aria-hidden": true,
    } as const;
    switch (kind) {
        case "gpu":
            return (
                <svg {...svgProps}>
                    <rect x="1.5" y="1.5" width="13" height="13" {...stroke} />
                    <rect x="4.5" y="4.5" width="7" height="7" {...stroke} />
                    <circle cx="1.5" cy="1.5" r="0.7" fill="currentColor" />
                    <circle cx="14.5" cy="1.5" r="0.7" fill="currentColor" />
                    <circle cx="1.5" cy="14.5" r="0.7" fill="currentColor" />
                    <circle cx="14.5" cy="14.5" r="0.7" fill="currentColor" />
                </svg>
            );
        case "compute":
            return (
                <svg {...svgProps}>
                    <rect x="1.5" y="3" width="13" height="3" {...stroke} />
                    <rect x="1.5" y="7.5" width="13" height="3" {...stroke} />
                    <rect x="1.5" y="12" width="13" height="2" {...stroke} />
                    <circle cx="3.5" cy="4.5" r="0.5" fill="currentColor" />
                    <circle cx="3.5" cy="9" r="0.5" fill="currentColor" />
                </svg>
            );
        case "k8s":
            return (
                <svg {...svgProps}>
                    <polygon
                        points="8,1.5 13.5,4.75 13.5,11.25 8,14.5 2.5,11.25 2.5,4.75"
                        {...stroke}
                    />
                    <circle cx="8" cy="8" r="2" {...stroke} />
                </svg>
            );
        case "database":
            return (
                <svg {...svgProps}>
                    <ellipse cx="8" cy="3" rx="5.5" ry="1.5" {...stroke} />
                    <path d="M2.5 3 V 13" {...stroke} />
                    <path d="M13.5 3 V 13" {...stroke} />
                    <path d="M2.5 7 Q 8 9 13.5 7" {...stroke} />
                    <path d="M2.5 13 Q 8 15 13.5 13" {...stroke} />
                </svg>
            );
        case "storage":
            return (
                <svg {...svgProps}>
                    <rect x="1.5" y="1.5" width="6" height="6" {...stroke} />
                    <rect x="8.5" y="1.5" width="6" height="6" {...stroke} />
                    <rect x="1.5" y="8.5" width="6" height="6" {...stroke} />
                    <rect x="8.5" y="8.5" width="6" height="6" {...stroke} />
                </svg>
            );
        case "app":
            return (
                <svg {...svgProps}>
                    <path d="M2.5 9 V 14 H 13.5 V 9" {...stroke} />
                    <path d="M8 11 V 2 M4.5 5.5 L 8 2 L 11.5 5.5" {...stroke} />
                </svg>
            );
        case "agent":
            return (
                <svg {...svgProps}>
                    <circle cx="8" cy="8" r="2.6" {...stroke} />
                    <path d="M8 5.4 V 1.5" {...stroke} />
                    <path d="M5.6 9.5 L 2.5 13.5" {...stroke} />
                    <path d="M10.4 9.5 L 13.5 13.5" {...stroke} />
                    <circle cx="8" cy="1.5" r="0.8" fill="currentColor" />
                    <circle cx="2.5" cy="13.5" r="0.8" fill="currentColor" />
                    <circle cx="13.5" cy="13.5" r="0.8" fill="currentColor" />
                </svg>
            );
        case "shield":
            return (
                <svg {...svgProps}>
                    <path
                        d="M8 1.5 L 13.5 3.5 V 8 Q 13.5 12 8 14.5 Q 2.5 12 2.5 8 V 3.5 Z"
                        {...stroke}
                    />
                    <path d="M5.5 8 L 7.5 10 L 10.5 6.5" {...stroke} />
                </svg>
            );
        case "stack":
            return (
                <svg {...svgProps}>
                    <path d="M8 1.5 L 14 4.5 L 8 7.5 L 2 4.5 Z" {...stroke} />
                    <path d="M2 8 L 8 11 L 14 8" {...stroke} />
                    <path d="M2 11.5 L 8 14.5 L 14 11.5" {...stroke} />
                </svg>
            );
        case "deploy":
            return (
                <svg {...svgProps}>
                    <path d="M2 8 H 13" {...stroke} />
                    <path d="M9 4 L 13 8 L 9 12" {...stroke} />
                    <circle cx="2" cy="8" r="1" fill="currentColor" />
                </svg>
            );
        case "arrow":
        default:
            return (
                <svg {...svgProps}>
                    <path d="M2.5 8 H 13.5 M9 3.5 L 13.5 8 L 9 12.5" {...stroke} />
                </svg>
            );
    }
}

export default ServiceMark;
