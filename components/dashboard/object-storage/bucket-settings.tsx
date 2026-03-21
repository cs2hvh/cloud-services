"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  Shield,
  Globe,
  GitBranch,
  FolderOpen,
  Edit2,
  Save,
  X,
  Loader2,
} from "lucide-react";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import axios from "axios";
import { useProjects } from "@/app/dashboard/provider";

interface BucketSettingsProps {
  bucket: ObjectSpaceBucket;
}

const BucketSettings = ({ bucket }: BucketSettingsProps) => {
  const { projects } = useProjects();
  const [isLoading, setIsLoading] = useState<{ [key: string]: boolean }>({});
  const [editMode, setEditMode] = useState<{ [key: string]: boolean }>({});

  // Local state for settings
  const [settings, setSettings] = useState({
    acl: bucket.acl || "private",
    corsEnabled: bucket.cors_enabled || false,
    versioningEnabled: bucket.versioning_enabled || false,
    projectId: bucket.project_id || null,
  });

  const handleSave = async (setting: string) => {
    setIsLoading((prev) => ({ ...prev, [setting]: true }));

    try {
      let endpoint = "";
      const payload: Record<string, unknown> = { bucket_id: bucket.id };

      switch (setting) {
        case "acl":
          endpoint = "/api/services/object-storage/buckets/settings/update-acl";
          payload.acl = settings.acl;
          break;
        case "cors":
          endpoint =
            "/api/services/object-storage/buckets/settings/update-cors";
          payload.enabled = settings.corsEnabled;
          break;
        case "versioning":
          endpoint =
            "/api/services/object-storage/buckets/settings/update-versioning";
          payload.enabled = settings.versioningEnabled;
          break;
        case "project":
          endpoint =
            "/api/services/object-storage/buckets/settings/update-project";
          payload.project_id = settings.projectId;
          break;
        default:
          throw new Error("Unknown setting");
      }

      const response = await axios.post(endpoint, payload);

      if (response.data.success) {
        toast.success(
          `${setting.charAt(0).toUpperCase() + setting.slice(1)} updated successfully`
        );
        setEditMode((prev) => ({ ...prev, [setting]: false }));
      } else {
        throw new Error(response.data.error || "Update failed");
      }
    } catch (error: unknown) {
  console.error('Error emptying bucket:', error);

  let message = 'Unknown error';

  if (error instanceof Error) {
    message = error.message;
  }
      toast.error(message || `Failed to update ${setting}`);
    } finally {
      setIsLoading((prev) => ({ ...prev, [setting]: false }));
    }
  };

  const handleCancel = (setting: string) => {
    setEditMode((prev) => ({ ...prev, [setting]: false }));
    // Reset to original values
    switch (setting) {
      case "acl":
        setSettings((prev) => ({ ...prev, acl: bucket.acl || "private" }));
        break;
      case "cors":
        setSettings((prev) => ({
          ...prev,
          corsEnabled: bucket.cors_enabled || false,
        }));
        break;
      case "versioning":
        setSettings((prev) => ({
          ...prev,
          versioningEnabled: bucket.versioning_enabled || false,
        }));
        break;
      case "project":
        setSettings((prev) => ({
          ...prev,
          projectId: bucket.project_id || null,
        }));
        break;
    }
  };

  const SettingsCard = ({
    title,
    description,
    icon: Icon,
    setting,
    children,
    gradientFrom = "blue-500/10",
    gradientTo = "blue-600/5",
    borderColor = "blue-500/20",
    iconColor = "blue-400",
  }: {
    title: string;
    description: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    setting: string;
    children: React.ReactNode;
    gradientFrom?: string;
    gradientTo?: string;
    borderColor?: string;
    iconColor?: string;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card
        className={`bg-gradient-to-br from-${gradientFrom} to-${gradientTo} border-${borderColor} h-fit`}
      >
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                className={`h-8 w-8 sm:h-10 sm:w-10 bg-${iconColor.replace("400", "500/20")} rounded-lg flex items-center justify-center flex-shrink-0`}
              >
                <Icon className={`h-4 w-4 sm:h-5 sm:w-5 text-${iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-white text-base sm:text-lg leading-tight">
                  {title}
                </CardTitle>
                <p className="text-white/60 text-xs sm:text-sm mt-1 leading-tight">
                  {description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {editMode[setting] ? (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleCancel(setting)}
                    disabled={isLoading[setting]}
                    className="cursor-pointer h-7 w-7 sm:h-8 sm:w-8 hover:bg-white/10"
                  >
                    <X className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/70" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleSave(setting)}
                    disabled={isLoading[setting]}
                    className="cursor-pointer h-7 w-7 sm:h-8 sm:w-8 hover:bg-white/10"
                  >
                    {isLoading[setting] ? (
                      <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-white/70" />
                    ) : (
                      <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-400" />
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    setEditMode((prev) => ({ ...prev, [setting]: true }))
                  }
                  className="cursor-pointer h-7 w-7 sm:h-8 sm:w-8 hover:bg-white/10"
                >
                  <Edit2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/70" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">{children}</CardContent>
      </Card>
    </motion.div>
  );

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return "No project assigned";
    const project = projects.find((p) => p.id === projectId);
    return project?.name || "Unknown project";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      {/* ACL Settings */}
      <SettingsCard
        title="Access Control (ACL)"
        description="Control who can access your bucket"
        icon={Shield}
        setting="acl"
        gradientFrom="red-500/10"
        gradientTo="red-600/5"
        borderColor="red-500/20"
        iconColor="red-400"
      >
        {editMode.acl ? (
          <Select
            value={settings.acl}
            onValueChange={(value: "private" | "public-read") =>
              setSettings((prev) => ({ ...prev, acl: value }))
            }
          >
            <SelectTrigger className="bg-white/5 border-white/10 text-white cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-black border-white/10 cursor-pointer">
              <SelectItem className="cursor-pointer" value="private">Private</SelectItem>
              <SelectItem className="cursor-pointer" value="public-read">Public Read</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                settings.acl === "private"
                  ? "bg-red-500/20 text-red-300 border border-red-500/30"
                  : "bg-green-500/20 text-green-300 border border-green-500/30"
              }`}
            >
              {settings.acl === "private" ? "Private" : "Public Read"}
            </span>
          </div>
        )}
      </SettingsCard>

      {/* CORS Settings */}
      <SettingsCard
        title="CORS (Cross-Origin Resource Sharing)"
        description="Allow web browsers to access your bucket"
        icon={Globe}
        setting="cors"
        gradientFrom="green-500/10"
        gradientTo="green-600/5"
        borderColor="green-500/20"
        iconColor="green-400"
      >
        {editMode.cors ? (
          <div className="flex items-center gap-3">
            <Switch
              className="cursor-pointer"
              checked={settings.corsEnabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, corsEnabled: checked }))
              }
            />
            <span className="text-white/80 text-sm">
              {settings.corsEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className={`h-3 w-3 rounded-full ${
                settings.corsEnabled ? "bg-green-400" : "bg-gray-400"
              }`}
            />
            <span className="text-white/80 text-sm">
              {settings.corsEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        )}
      </SettingsCard>

      {/* Versioning Settings */}
      <SettingsCard
        title="Versioning"
        description="Keep multiple versions of objects in your bucket"
        icon={GitBranch}
        setting="versioning"
        gradientFrom="purple-500/10"
        gradientTo="purple-600/5"
        borderColor="purple-500/20"
        iconColor="purple-400"
      >
        {editMode.versioning ? (
          <div className="flex items-center gap-3">
            <Switch
              className="cursor-pointer"
              checked={settings.versioningEnabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, versioningEnabled: checked }))
              }
            />
            <span className="text-white/80 text-sm">
              {settings.versioningEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className={`h-3 w-3 rounded-full ${
                settings.versioningEnabled ? "bg-green-400" : "bg-gray-400"
              }`}
            />
            <span className="text-white/80 text-sm">
              {settings.versioningEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        )}
      </SettingsCard>

      {/* Project Assignment */}
      <SettingsCard
        title="Project Assignment"
        description="Assign this bucket to a project for organization"
        icon={FolderOpen}
        setting="project"
        gradientFrom="yellow-500/10"
        gradientTo="yellow-600/5"
        borderColor="yellow-500/20"
        iconColor="yellow-400"
      >
        {editMode.project ? (
          <Select
            value={settings.projectId || "none"}
            onValueChange={(value) =>
              setSettings((prev) => ({
                ...prev,
                projectId: value === "none" ? null : value,
              }))
            }
          >
            <SelectTrigger className="bg-white/5 border-white/10 text-white cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-black border-white/10">
              <SelectItem value="none">No project</SelectItem>
              {projects.map((project) => (
                <SelectItem className="cursor-pointer" key={project.id} value={project.id}>
                  {project.name}
                  
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
              {getProjectName(settings.projectId)}
            </span>
          </div>
        )}
      </SettingsCard>
    </div>
  );
};

export default BucketSettings;
