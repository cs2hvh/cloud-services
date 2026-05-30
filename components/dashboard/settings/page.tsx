"use client";

// User settings — editorial canvas, pill tab nav (Profile /
// Connections / Security / API Keys), tab content sits directly on
// the canvas. Matches the rest of the dashboard's design language.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ExternalLink,
    Key,
    QrCode,
    Shield,
    User,
    type LucideIcon,
} from "lucide-react";

import ProfileSettings from "@/components/dashboard/profile/page";
import Accounts from "@/components/dashboard/accounts/page";
import EnableTotp from "@/components/dashboard/2fa/page";

// ─── Design tokens ─────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

type SettingsTab = "profile" | "account" | "security";

const SECTION_META: Record<
    SettingsTab,
    {
        title: string;
        eyebrow: string;
        description: string;
        icon: LucideIcon;
    }
> = {
    profile: {
        title: "Profile",
        eyebrow: "Identity",
        description:
            "Update your personal details, identity, and password preferences.",
        icon: User,
    },
    account: {
        title: "Connections",
        eyebrow: "Access",
        description:
            "Manage login methods and repository connections separately.",
        icon: Shield,
    },
    security: {
        title: "Security",
        eyebrow: "Protection",
        description:
            "Configure two-factor authentication and strengthen sign-in controls.",
        icon: QrCode,
    },
};

const TABS = [
    { value: "profile" as const, label: "Profile", icon: User },
    { value: "account" as const, label: "Connections", icon: Shield },
    { value: "security" as const, label: "Security", icon: QrCode },
];

const SettingsPage = () => {
    const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
    const router = useRouter();

    const activeSection = useMemo(() => SECTION_META[activeTab], [activeTab]);

    const renderContent = () => {
        if (activeTab === "profile") return <ProfileSettings />;
        if (activeTab === "account") return <Accounts />;
        return <EnableTotp />;
    };

    return (
        <div className="relative min-h-full bg-[#08090b] text-white [&_button]:cursor-pointer [&_a]:cursor-pointer [&_[role=tab]]:cursor-pointer">
            {/* Background layer */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                <div
                    className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
                    style={{
                        background:
                            "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
                    }}
                />
                <div
                    className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
                    style={{
                        background:
                            "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
                    }}
                />
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage:
                            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
                        backgroundSize: "28px 28px",
                    }}
                />
            </div>

            <div className="relative z-10 px-6 py-8 sm:px-10 sm:py-10 max-w-[1280px] mx-auto">
                {/* Hero */}
                <h1 className="text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold mb-2">
                    Account{" "}
                    <span
                        style={{ ...SERIF_STYLE, color: ACCENT }}
                        className="font-normal"
                    >
                        settings
                    </span>
                </h1>
                <p
                    className={`${MONO} max-w-xl text-[11.5px] text-white/45 leading-relaxed mb-10`}
                >
                    Manage your profile, connected accounts, and authentication
                    controls.
                </p>

                {/* Pill tab nav + API keys link */}
                <div className="border-b border-white/[0.06] mb-8">
                    <div className="flex items-center justify-between gap-2 flex-wrap -mb-px">
                        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                            {TABS.map((t) => {
                                const isActive = activeTab === t.value;
                                const Icon = t.icon;
                                return (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => setActiveTab(t.value)}
                                        className={`${MONO} relative inline-flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] transition-colors whitespace-nowrap`}
                                        style={{
                                            color: isActive
                                                ? "#ffffff"
                                                : "rgba(255,255,255,0.45)",
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isActive)
                                                e.currentTarget.style.color =
                                                    "rgba(255,255,255,0.75)";
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isActive)
                                                e.currentTarget.style.color =
                                                    "rgba(255,255,255,0.45)";
                                        }}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                        {t.label}
                                        {isActive && (
                                            <span
                                                className="absolute left-2 right-2 bottom-0 h-[2px]"
                                                style={{
                                                    background: ACCENT,
                                                    boxShadow:
                                                        "0 0 8px rgba(0,149,255,0.5)",
                                                }}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            type="button"
                            onClick={() =>
                                router.push("/dashboard/settings/api-keys")
                            }
                            className={`${MONO} inline-flex items-center gap-1.5 h-9 px-3.5 mb-1 text-[10.5px] uppercase tracking-[0.14em] text-white/60 hover:text-white border border-white/[0.08] hover:bg-white/[0.04] rounded-[5px] transition-colors`}
                        >
                            <Key className="h-3 w-3" />
                            API keys
                            <ExternalLink className="h-3 w-3 opacity-60" />
                        </button>
                    </div>
                </div>

                {/* Section header */}
                <header className="mb-6 flex items-start gap-4">
                    <span
                        className={`${MONO} text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30 mt-0.5`}
                    >
                        {`0${TABS.findIndex((t) => t.value === activeTab) + 1}`}
                    </span>
                    <div>
                        <p
                            className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45 mb-1`}
                        >
                            {activeSection.eyebrow}
                        </p>
                        <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-white">
                            {activeSection.title}
                        </h2>
                        <p
                            className={`${MONO} mt-1.5 text-[11px] text-white/45 leading-snug max-w-[640px]`}
                        >
                            {activeSection.description}
                        </p>
                    </div>
                </header>

                {/* Tab content */}
                <div className="border-t border-white/[0.06] pt-6">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
