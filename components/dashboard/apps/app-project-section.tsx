'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, Edit2, Save, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProjects } from '@/app/dashboard/provider';
import { toast } from 'sonner';

interface Props {
  appId: string;
  initialProjectId: string | null;
  onSaved: (newProjectId: string | null) => void;
}

export function AppProjectSection({ appId, initialProjectId, onSaved }: Props) {
  const { projects } = useProjects();
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setProjectId(initialProjectId);
    }
  }, [initialProjectId, editing]);

  const getProjectName = (id: string | null) => {
    if (!id) return 'No project assigned';
    const project = projects.find((p) => p.id === id);
    return project?.name || 'Unknown project';
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/services/platform-apps/update-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, project_id: projectId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update project assignment');
      }

      toast.success('Project assignment updated successfully');
      setEditing(false);
      onSaved(projectId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update project assignment';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setProjectId(initialProjectId);
    setEditing(false);
  };

  return (
    <div className="border-t border-white/10 pt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-yellow-400" />
          <div>
            <p className="text-sm font-medium text-white">Project Assignment</p>
            <p className="text-xs text-white/50">Assign this app to a project for organization</p>
          </div>
        </div>
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="h-8 rounded-none text-white/70 hover:bg-white/10"
          >
            <Edit2 className="w-3.5 h-3.5 mr-1" />
            Edit
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <Select
            value={projectId || 'none'}
            onValueChange={(value) => setProjectId(value === 'none' ? null : value)}
          >
            <SelectTrigger className="rounded-none bg-white/5 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-black border-white/10">
              <SelectItem value="none">No project</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="rounded-none bg-green-600 hover:bg-green-700 text-white"
              size="sm"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 mr-1" />
                  Save
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={saving}
              className="rounded-none border-white/20 text-white hover:bg-white/10"
              size="sm"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm font-medium text-yellow-200">
            {getProjectName(projectId)}
          </span>
        </div>
      )}
    </div>
  );
}
