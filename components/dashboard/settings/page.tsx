"use client";

import React, { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import {
  ExternalLink,
  Key,
  QrCode,
  Shield,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";

import ProfileSettings from "@/components/dashboard/profile/page";
import Accounts from "@/components/dashboard/accounts/page";
import EnableTotp from "@/components/dashboard/2fa/page";
import { useRouter } from "next/navigation";

type SettingsTab = "profile" | "account" | "security";

const SECTION_META: Record<
  SettingsTab,
  {
    title: string;
    description: string;
    icon: LucideIcon;
    helper: string;
    eyebrow: string;
  }
> = {
  profile: {
    title: "Profile",
    description: "Update your personal details, identity, and password preferences.",
    icon: User,
    helper: "Keep contact details current so account recovery and notifications stay reliable.",
    eyebrow: "Identity",
  },
  account: {
    title: "Connections",
    description: "Manage login methods and repository connections separately.",
    icon: Shield,
    helper: "Login methods are for authentication. Repository connections grant repo access for deployments.",
    eyebrow: "Access",
  },
  security: {
    title: "Security",
    description: "Configure two-factor authentication and strengthen sign-in controls.",
    icon: QrCode,
    helper: "Turning on two-factor authentication is the fastest way to improve account security.",
    eyebrow: "Protection",
  },
};

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const router = useRouter();

  const activeSection = useMemo(() => SECTION_META[activeTab], [activeTab]);
  const ActiveIcon = activeSection.icon;

  const handleApiKeysClick = () => {
    router.push("/dashboard/settings/api-keys");
  };

  const renderContent = () => {
    if (activeTab === "profile") {
      return <ProfileSettings />;
    }

    if (activeTab === "account") {
      return <Accounts />;
    }

    return <EnableTotp />;
  };

  return (
    <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="glass-panel overflow-hidden"
      >
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
              User Settings
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Manage your profile, account access, and security controls.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">
              Review identity details, connected accounts, and authentication posture from a
              cleaner settings workspace designed for day-to-day account management.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[260px]">
            <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Sections
              </div>
              <div className="mt-2 text-lg font-semibold text-white">4 areas</div>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Active View
              </div>
              <div className="mt-2 text-lg font-semibold text-white">{activeSection.title}</div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.28 }}
          className="space-y-4 xl:sticky xl:top-8"
        >
          <Card className="glass-panel overflow-hidden">
            <CardContent className="p-4">
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Account Areas
                </p>
                <p className="mt-2 text-sm text-white/45">
                  Move between profile, account, and security settings without leaving the page.
                </p>
              </div>

              <div className="space-y-2">
                {(Object.entries(SECTION_META) as Array<[SettingsTab, (typeof SECTION_META)[SettingsTab]]>).map(
                  ([tab, section]) => {
                    const SectionIcon = section.icon;
                    const isActive = activeTab === tab;

                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`w-full border px-3 py-3 text-left transition-colors ${
                          isActive
                            ? "border-blue-400/30 bg-blue-500/10"
                            : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-9 w-9 items-center justify-center border ${
                              isActive
                                ? "border-blue-400/30 bg-blue-500/15 text-blue-200"
                                : "border-white/[0.08] bg-white/[0.04] text-white/55"
                            }`}
                          >
                            <SectionIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white">{section.title}</div>
                            <div className="mt-1 text-xs leading-5 text-white/40">
                              {section.description}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  }
                )}

                <button
                  type="button"
                  onClick={handleApiKeysClick}
                  className="w-full border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-left transition-colors hover:bg-white/[0.05]"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center border border-white/[0.08] bg-white/[0.04] text-white/55">
                      <Key className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        API Keys
                        <ExternalLink className="h-3.5 w-3.5 text-white/45" />
                      </div>
                      <div className="mt-1 text-xs leading-5 text-white/40">
                        Open the dedicated credentials page for programmatic access management.
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center border border-blue-500/20 bg-blue-500/10 text-blue-300">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Recommended next step</div>
                  <p className="mt-2 text-sm leading-6 text-white/45">{activeSection.helper}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.12, duration: 0.28 }}
        >
          <Card className="glass-panel overflow-hidden">
            <CardContent className="p-0">
              <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center border border-blue-500/20 bg-blue-500/10 text-blue-300">
                    <ActiveIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      {activeSection.eyebrow}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-white">{activeSection.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
                      {activeSection.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-5 py-5 sm:px-6 sm:py-6">{renderContent()}</div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default SettingsPage;