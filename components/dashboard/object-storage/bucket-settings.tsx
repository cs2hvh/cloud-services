"use client";

import { useState } from "react";
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
          endpoint = "/api/services/object-storage/buckets/settings/update-cors";
          payload.enabled = settings.corsEnabled;
          break;
        case "versioning":
          endpoint = "/api/services/object-storage/buckets/settings/update-versioning";
          payload.enabled = settings.versioningEnabled;
          break;
        case "project":
          endpoint = "/api/services/object-storage/buckets/settings/update-project";
          payload.project_id = settings.projectId;
          break;
        default:
          throw new Error("Unknown setting");
      }

      const response = await axios.post(endpoint, payload);

      if (response?.data?.success) {
        toast.success(
          `${setting.charAt(0).toUpperCase() + setting.slice(1)} updated successfully`
        );
        setEditMode((prev) => ({ ...prev, [setting]: false }));
      } else {
        throw new Error(response?.data?.error || "Update failed");
      }
    } catch (error: unknown) {
      console.error("Error updating setting:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(message || `Failed to update ${setting}`);
    } finally {
      setIsLoading((prev) => ({ ...prev, [setting]: false }));
    }
  };

  const handleCancel = (setting: string) => {
    setEditMode((prev) => ({ ...prev, [setting]: false }));
    switch (setting) {
      case "acl":
        setSettings((prev) => ({ ...prev, acl: bucket.acl || "private" }));
        break;
      case "cors":
        setSettings((prev) => ({ ...prev, corsEnabled: bucket.cors_enabled || false }));
        break;
      case "versioning":
        setSettings((prev) => ({ ...prev, versioningEnabled: bucket.versioning_enabled || false }));
        break;
      case "project":
        setSettings((prev) => ({ ...prev, projectId: bucket.project_id || null }));
        break;
    }
  };

  const startEdit = (setting: string) =>
    setEditMode((prev) => ({ ...prev, [setting]: true }));

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return "No project assigned";
    const project = projects.find((p) => p.id === projectId);
    return project?.name || "Unknown project";
  };

  const EditControls = ({ setting }: { setting: string }) => (
    <div className="flex items-center gap-1">
      {editMode[setting] ? (
        <>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleCancel(setting)}
            disabled={isLoading[setting]}
            className="h-8 w-8 cursor-pointer hover:bg-white/10"
          >
            <X className="h-4 w-4 text-white/60" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleSave(setting)}
            disabled={isLoading[setting]}
            className="h-8 w-8 cursor-pointer hover:bg-white/10"
          >
            {isLoading[setting] ? (
              <Loader2 className="h-4 w-4 animate-spin text-white/60" />
            ) : (
              <Save className="h-4 w-4 text-emerald-400" />
            )}
          </Button>
        </>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => startEdit(setting)}
          className="h-8 w-8 cursor-pointer hover:bg-white/10"
        >
          <Edit2 className="h-4 w-4 text-white/50" />
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Access Control */}
      <div className="glass-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-white/50" />
            <div>
              <p className="text-sm font-semibold text-white">Access Control (ACL)</p>
              <p className="mt-0.5 text-xs text-white/45">Control who can access your bucket</p>
            </div>
          </div>
          <EditControls setting="acl" />
        </div>
        <div className="px-6 py-4">
          {editMode.acl ? (
            <Select
              value={settings.acl}
              onValueChange={(value: "private" | "public-read") =>
                setSettings((prev) => ({ ...prev, acl: value }))
              }
            >
              <SelectTrigger className="w-52 border-white/[0.12] bg-white/[0.04] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/[0.12] bg-[#0a0e16] text-white">
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="public-read">Public Read</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                  settings.acl === "private" ? "text-white/70" : "text-emerald-300"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    settings.acl === "private" ? "bg-white/30" : "bg-emerald-400"
                  }`}
                />
                {settings.acl === "private" ? "Private" : "Public Read"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* CORS */}
      <div className="glass-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-white/50" />
            <div>
              <p className="text-sm font-semibold text-white">CORS (Cross-Origin Resource Sharing)</p>
              <p className="mt-0.5 text-xs text-white/45">Allow web browsers to access your bucket from other origins</p>
            </div>
          </div>
          <EditControls setting="cors" />
        </div>
        <div className="px-6 py-4">
          {editMode.cors ? (
            <div className="flex items-center gap-3">
              <Switch
                checked={settings.corsEnabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, corsEnabled: checked }))
                }
              />
              <span className="text-sm text-white/70">
                {settings.corsEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          ) : (
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                settings.corsEnabled ? "text-emerald-300" : "text-white/50"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  settings.corsEnabled ? "bg-emerald-400" : "bg-white/25"
                }`}
              />
              {settings.corsEnabled ? "Enabled" : "Disabled"}
            </span>
          )}
        </div>
      </div>

      {/* Versioning */}
      <div className="glass-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <div className="flex items-center gap-3">
            <GitBranch className="h-5 w-5 text-white/50" />
            <div>
              <p className="text-sm font-semibold text-white">Versioning</p>
              <p className="mt-0.5 text-xs text-white/45">Keep multiple versions of objects in your bucket</p>
            </div>
          </div>
          <EditControls setting="versioning" />
        </div>
        <div className="px-6 py-4">
          {editMode.versioning ? (
            <div className="flex items-center gap-3">
              <Switch
                checked={settings.versioningEnabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, versioningEnabled: checked }))
                }
              />
              <span className="text-sm text-white/70">
                {settings.versioningEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          ) : (
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                settings.versioningEnabled ? "text-violet-300" : "text-white/50"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  settings.versioningEnabled ? "bg-violet-400" : "bg-white/25"
                }`}
              />
              {settings.versioningEnabled ? "Enabled" : "Disabled"}
            </span>
          )}
        </div>
      </div>

      {/* Project Assignment */}
      <div className="glass-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <div className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-white/50" />
            <div>
              <p className="text-sm font-semibold text-white">Project Assignment</p>
              <p className="mt-0.5 text-xs text-white/45">Assign this bucket to a project for organisation</p>
            </div>
          </div>
          <EditControls setting="project" />
        </div>
        <div className="px-6 py-4">
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
              <SelectTrigger className="w-64 border-white/[0.12] bg-white/[0.04] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/[0.12] bg-[#0a0e16] text-white">
                <SelectItem value="none">No project</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm font-medium text-white/75">
              {getProjectName(settings.projectId)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default BucketSettings;
