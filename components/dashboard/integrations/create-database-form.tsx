'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Info } from 'lucide-react';
import { DatabaseTypeSelector } from './database-type-selector';
import { 
  DATABASE_ENGINES, 
  DATABASE_VERSIONS,
  type DatabaseEngineType, 
  type DatabasePlan,
  type CreateDatabaseData 
} from './types';

interface CreateDatabaseFormProps {
  projectId: string;
  availablePlans: DatabasePlan[];
  loadingPlans?: boolean;
  regions?: Array<{ id: string; name: string; city: string }>;
  loadingRegions?: boolean;
  onDataChange: (data: Partial<CreateDatabaseData> | null) => void;
  disabled?: boolean;
}

/**
 * Form for creating a new database
 * Step-by-step: Type -> Name -> Version -> Plan -> Region
 */
export function CreateDatabaseForm({
  projectId,
  availablePlans,
  loadingPlans = false,
  regions = [],
  loadingRegions = false,
  onDataChange,
  disabled = false,
}: CreateDatabaseFormProps) {
  const [engine, setEngine] = useState<DatabaseEngineType | null>(null);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [planId, setPlanId] = useState('');
  const [region, setRegion] = useState('');
  const [nameError, setNameError] = useState('');

  // Filter plans based on selected engine
  // Plans have 'sub' field that matches engine type exactly (pg, mysql, mongodb)
  const filteredPlans = availablePlans.filter(plan => {
    if (!engine) return false;
    const planSub = (plan.sub || '').toLowerCase();
    // Match engine type exactly
    return planSub === engine.toLowerCase();
  });

  // Available versions for selected engine
  const versions = engine ? DATABASE_VERSIONS[engine] : [];

  // Validate database name
  const validateName = (value: string) => {
    if (!value) {
      setNameError('Name is required');
      return false;
    }
    if (value.length < 3) {
      setNameError('Name must be at least 3 characters');
      return false;
    }
    if (value.length > 63) {
      setNameError('Name must be less than 63 characters');
      return false;
    }
    if (!/^[a-z][a-z0-9-]*$/.test(value)) {
      setNameError('Name must start with a letter and contain only lowercase letters, numbers, and hyphens');
      return false;
    }
    setNameError('');
    return true;
  };

  // Check if projectId is valid UUID
  const isValidUUID = (str: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  const hasValidProjectId = projectId && isValidUUID(projectId);

  // Update parent when data changes
  useEffect(() => {
    const isValid = engine && name && !nameError && version && planId && region && hasValidProjectId;
    
    if (isValid) {
      onDataChange({
        name,
        engine: engine!,
        version,
        plan_id: planId,
        region,
        project_id: projectId,
      });
    } else {
      onDataChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, name, nameError, version, planId, region, projectId, hasValidProjectId]);

  // Reset dependent fields when engine changes
  useEffect(() => {
    setVersion('');
    setPlanId('');
  }, [engine]);

  const handleNameChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setName(sanitized);
    validateName(sanitized);
  };

  return (
    <div className="space-y-6">
      {/* Warning if no project */}
      {!hasValidProjectId && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-400/80">
              This app is not associated with a project. Please create a database from the 
              <a href="/dashboard/services/database/new" className="underline ml-1">Database page</a> 
              and link it to this app.
            </p>
          </div>
        </div>
      )}

      {/* Step 1: Database Type */}
      <div className="space-y-2">
        <Label className="text-white/70">Database Type</Label>
        <DatabaseTypeSelector
          selected={engine}
          onSelect={setEngine}
          disabled={disabled || !hasValidProjectId}
        />
      </div>

      {engine && (
        <>
          {/* Step 2: Database Name */}
          <div className="space-y-2">
            <Label className="text-white/70">Database Name</Label>
            <Input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={`my-${engine}-database`}
              disabled={disabled}
              className={`bg-white/5 border-white/10 text-white ${
                nameError ? 'border-red-500/50' : ''
              }`}
            />
            {nameError ? (
              <p className="text-xs text-red-400">{nameError}</p>
            ) : (
              <p className="text-xs text-white/40">
                Lowercase letters, numbers, and hyphens only. Must start with a letter.
              </p>
            )}
          </div>

          {/* Step 3: Version */}
          <div className="space-y-2">
            <Label className="text-white/70">Version</Label>
            <Select value={version} onValueChange={setVersion} disabled={disabled}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a] border-white/10">
                {versions.map((v) => (
                  <SelectItem key={v} value={v} className="text-white hover:bg-white/10">
                    {DATABASE_ENGINES[engine].label} {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step 4: Plan Selection */}
          <div className="space-y-2">
            <Label className="text-white/70">Plan</Label>
            {loadingPlans ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-white/50" />
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="text-center py-4 text-white/50 text-sm">
                No plans available for {DATABASE_ENGINES[engine].label}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto">
                {filteredPlans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setPlanId(plan.id)}
                    disabled={disabled}
                    className={`
                      p-3 rounded-lg border-2 text-left transition-all
                      ${planId === plan.id
                        ? 'bg-blue-500/20 border-blue-500/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }
                      ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-white text-sm">{plan.name}</p>
                        {plan.resources && (
                          <p className="text-xs text-white/50 mt-0.5">
                            {plan.resources.cpu} vCPU • {plan.resources.ram}GB RAM • {plan.resources.storage}GB Storage
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        {plan.price === 0 || plan.price === null ? (
                          <span className="text-green-400 font-medium">Free</span>
                        ) : (
                          <span className="text-white font-medium">${plan.price}/mo</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 5: Region */}
          <div className="space-y-2">
            <Label className="text-white/70">Region</Label>
            {loadingRegions ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-white/50" />
              </div>
            ) : (
              <Select value={region} onValueChange={setRegion} disabled={disabled}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/10">
                  {regions.length > 0 ? (
                    regions.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="text-white hover:bg-white/10">
                        {r.city} ({r.id})
                      </SelectItem>
                    ))
                  ) : (
                    // Fallback regions if not loaded
                    <>
                      <SelectItem value="nyc1" className="text-white hover:bg-white/10">New York (nyc1)</SelectItem>
                      <SelectItem value="sfo3" className="text-white hover:bg-white/10">San Francisco (sfo3)</SelectItem>
                      <SelectItem value="ams3" className="text-white hover:bg-white/10">Amsterdam (ams3)</SelectItem>
                      <SelectItem value="sgp1" className="text-white hover:bg-white/10">Singapore (sgp1)</SelectItem>
                      <SelectItem value="lon1" className="text-white hover:bg-white/10">London (lon1)</SelectItem>
                      <SelectItem value="fra1" className="text-white hover:bg-white/10">Frankfurt (fra1)</SelectItem>
                      <SelectItem value="blr1" className="text-white hover:bg-white/10">Bangalore (blr1)</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Info */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-400/70">
                Database will be created and automatically linked to your app. 
                You&apos;ll be able to customize environment variable names in the next step.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
