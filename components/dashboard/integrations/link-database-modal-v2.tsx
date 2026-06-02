'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  Loader2,
  Plus,
  Search,
  Server,
  Sparkles,
} from 'lucide-react';
import { CreateDatabaseForm } from './create-database-form';
import { EnvConfigStep } from './env-config-step';
import type {
  AvailableDatabase,
  CreateDatabaseData,
  DatabasePlan,
  EnvVarConfig,
  LinkDatabaseResponse,
  WizardStep,
} from './types';

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface LinkDatabaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  appName: string;
  projectId: string;
  databases: AvailableDatabase[];
  loadingDatabases?: boolean;
  databasePlans: DatabasePlan[];
  loadingPlans?: boolean;
  onLink: (databaseId: string, envConfigs: EnvVarConfig[], force: boolean) => Promise<LinkDatabaseResponse>;
  onCreateDatabase: (data: CreateDatabaseData) => Promise<{
    success: boolean;
    database_id?: string;
    connection?: {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
      uri: string;
    };
    error?: string;
  }>;
  onSuccess?: () => void;
}

function generateDefaultEnvConfigs(
  engine: string,
  connection: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    uri: string;
  },
  prefix: string = 'DATABASE'
): EnvVarConfig[] {
  const configs: EnvVarConfig[] = [];

  const urlKey = engine === 'mongodb' ? `${prefix}_URI` : `${prefix}_URL`;
  configs.push({ originalKey: urlKey, customKey: urlKey, value: connection.uri, description: 'Full connection string' });
  configs.push({ originalKey: `${prefix}_HOST`, customKey: `${prefix}_HOST`, value: connection.host, description: 'Database host' });
  configs.push({ originalKey: `${prefix}_PORT`, customKey: `${prefix}_PORT`, value: String(connection.port), description: 'Database port' });
  configs.push({ originalKey: `${prefix}_USER`, customKey: `${prefix}_USER`, value: connection.user, description: 'Database username' });
  configs.push({ originalKey: `${prefix}_PASSWORD`, customKey: `${prefix}_PASSWORD`, value: connection.password, description: 'Database password' });
  configs.push({ originalKey: `${prefix}_NAME`, customKey: `${prefix}_NAME`, value: connection.database, description: 'Database name' });

  return configs;
}

export function LinkDatabaseModal({
  open,
  onOpenChange,
  appName,
  projectId,
  databases,
  loadingDatabases = false,
  databasePlans,
  loadingPlans = false,
  onLink,
  onCreateDatabase,
  onSuccess,
}: LinkDatabaseModalProps) {
  const [step, setStep] = useState<WizardStep>('choose-source');
  const [source, setSource] = useState<'existing' | 'create' | null>(null);
  const [selectedDb, setSelectedDb] = useState<AvailableDatabase | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [createData, setCreateData] = useState<CreateDatabaseData | null>(null);
  const [createdDatabaseId, setCreatedDatabaseId] = useState<string | null>(null);
  const [, setCreatedEngine] = useState<string>('');
  const [envConfigs, setEnvConfigs] = useState<EnvVarConfig[]>([]);
  const [force, setForce] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ injectedVars: string[]; redeployTriggered: boolean } | null>(null);
  const [databaseStatus, setDatabaseStatus] = useState<string>('creating');
  const [, setIsPollingStatus] = useState(false);

  const filteredDatabases = databases.filter(db =>
    db.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    db.engine.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getEngineLabel = (engine: string) => {
    switch (engine) {
      case 'pg': return 'PostgreSQL';
      case 'mysql': return 'MySQL';
      case 'mongodb': return 'MongoDB';
      default: return engine;
    }
  };

  const handleCreateDataChange = useCallback((data: Partial<CreateDatabaseData> | null) => {
    setCreateData(data as CreateDatabaseData | null);
  }, []);

  const resetWizard = useCallback(() => {
    setStep('choose-source'); setSource(null); setSelectedDb(null); setSearchQuery('');
    setCreateData(null); setCreatedDatabaseId(null); setCreatedEngine('');
    setEnvConfigs([]); setForce(false); setConflicts([]);
    setIsCreating(false); setIsLinking(false); setError(null); setSuccess(null);
    setDatabaseStatus('creating'); setIsPollingStatus(false);
  }, []);

  const pollDatabaseStatus = useCallback(async (dbId: string) => {
    setIsPollingStatus(true);
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/services/database/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: dbId, checkStatus: true }),
        });
        if (res.ok) {
          const data = await res.json();
          const status = data.data?.status || 'creating';
          setDatabaseStatus(status);
          if (status === 'online') { setIsPollingStatus(false); return true; }
        }
      } catch (err) { console.error('Error checking database status:', err); }
      return false;
    };
    const isReady = await checkStatus();
    if (isReady) return;
    let attempts = 0;
    const maxAttempts = 30;
    const interval = setInterval(async () => {
      attempts++;
      const ready = await checkStatus();
      if (ready || attempts >= maxAttempts) { clearInterval(interval); setIsPollingStatus(false); }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleClose = () => {
    if (!isCreating && !isLinking) {
      onOpenChange(false);
      setTimeout(resetWizard, 300);
    }
  };

  const goNext = async () => {
    setError(null);
    switch (step) {
      case 'choose-source':
        if (source === 'existing') setStep('select-existing');
        else if (source === 'create') setStep('create-database');
        break;
      case 'select-existing':
        if (selectedDb) {
          setStep('configure-env');
          const port = selectedDb.engine === 'mongodb' ? 27017 : selectedDb.engine === 'mysql' ? 3306 : 5432;
          setEnvConfigs(generateDefaultEnvConfigs(selectedDb.engine, {
            host: '(fetched securely on link)', port, user: '(fetched securely on link)',
            password: '(fetched securely on link)', database: '(fetched securely on link)', uri: '(fetched securely on link)',
          }, 'DATABASE'));
        }
        break;
      case 'create-database':
        if (createData) {
          setIsCreating(true); setError(null);
          try {
            const result = await onCreateDatabase(createData);
            if (!result.success) { setError(result.error || 'Failed to create database'); return; }
            setCreatedDatabaseId(result.database_id || null);
            setCreatedEngine(createData.engine);
            if (result.connection) {
              setEnvConfigs(generateDefaultEnvConfigs(createData.engine, result.connection, 'DATABASE'));
            } else {
              setEnvConfigs(generateDefaultEnvConfigs(createData.engine, {
                host: 'creating...', port: createData.engine === 'mongodb' ? 27017 : createData.engine === 'mysql' ? 3306 : 5432,
                user: 'doadmin', password: 'will be generated', database: 'defaultdb', uri: 'will be generated after creation',
              }, 'DATABASE'));
            }
            setStep('configure-env');
            if (result.database_id) { setDatabaseStatus('creating'); pollDatabaseStatus(result.database_id); }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create database');
          } finally { setIsCreating(false); }
        }
        break;
      case 'configure-env':
        await handleLink();
        break;
    }
  };

  const goBack = () => {
    setError(null);
    switch (step) {
      case 'select-existing': case 'create-database':
        setStep('choose-source'); setSelectedDb(null); setCreateData(null); break;
      case 'configure-env':
        if (source === 'existing') setStep('select-existing');
        else setStep('create-database');
        setEnvConfigs([]); break;
    }
  };

  const handleLink = async () => {
    const databaseId = source === 'existing' ? selectedDb?.cluster_id : createdDatabaseId;
    if (!databaseId) { setError('No database selected'); return; }
    setIsLinking(true); setError(null); setConflicts([]);
    try {
      const result = await onLink(databaseId, envConfigs, force);
      if (!result.success) {
        if (result.code === 'ENV_VAR_CONFLICT' && result.conflicts) {
          setConflicts(result.conflicts);
          setError('Environment variable conflict. Enable "Force Overwrite" to continue.');
        } else { setError(result.error || 'Failed to link database'); }
        return;
      }
      setSuccess({ injectedVars: result.injected_vars || [], redeployTriggered: result.redeploy_triggered || false });
      setTimeout(() => { handleClose(); onSuccess?.(); }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link database');
    } finally { setIsLinking(false); }
  };

  const isDatabaseReady = source === 'existing' || databaseStatus === 'online';

  const canProceed = () => {
    switch (step) {
      case 'choose-source': return source !== null;
      case 'select-existing': return selectedDb !== null;
      case 'create-database': return createData !== null;
      case 'configure-env': return envConfigs.length > 0 && isDatabaseReady;
      default: return false;
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'choose-source': return 'Link Database';
      case 'select-existing': return 'Select Database';
      case 'create-database': return 'Create New Database';
      case 'configure-env': return 'Configure Environment';
      default: return 'Link Database';
    }
  };

  const getStepNumber = () => {
    switch (step) {
      case 'choose-source': return 1;
      case 'select-existing': case 'create-database': return 2;
      case 'configure-env': return 3;
      default: return 1;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#0c0d11] border border-white/[0.08] rounded-[10px] text-white p-0 gap-0 overflow-hidden max-w-lg max-h-[90svh] flex flex-col [&_[data-slot=dialog-close]]:text-white/35 [&_[data-slot=dialog-close]]:hover:text-white/75 [&_[data-slot=dialog-close]]:hover:bg-white/[0.06]">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-5 border-b border-white/[0.06] flex-shrink-0 pr-14">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-7 w-7 rounded-[6px] bg-[#0095FF]/[0.12] border border-[#0095FF]/20 flex items-center justify-center flex-shrink-0">
              <Database className="h-3.5 w-3.5 text-[#0095FF]" />
            </div>
            <DialogTitle className="text-[15px] font-semibold text-white tracking-[-0.01em]">
              {getStepTitle()}
            </DialogTitle>
          </div>
          <DialogDescription className="text-[13px] text-white/45 leading-relaxed pl-[38px]">
            {step === 'choose-source' && <>Connect a database to <span className="text-white/70">{appName}</span></>}
            {step === 'select-existing' && 'Select an existing database to link'}
            {step === 'create-database' && 'Configure your new database'}
            {step === 'configure-env' && 'Customize environment variable names'}
          </DialogDescription>

          {/* Progress */}
          <div className="flex items-center gap-1.5 pt-3 pl-[38px]">
            {(['Source', 'Select', 'Configure'] as const).map((label, idx) => {
              const active = idx + 1 <= getStepNumber();
              return (
                <div key={label} className="flex-1 flex flex-col gap-1">
                  <div className={`h-[2px] rounded-full transition-colors ${active ? 'bg-[#0095FF]' : 'bg-white/[0.08]'}`} />
                  <span className={`${MONO} text-[9.5px] uppercase tracking-[0.10em] ${active ? 'text-[#0095FF]/70' : 'text-white/20'}`}>{label}</span>
                </div>
              );
            })}
          </div>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {success ? (
            <div className="px-6 py-8 space-y-4 flex flex-col items-center text-center">
              <div className="h-10 w-10 rounded-full bg-emerald-500/[0.12] border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-white">Database linked</p>
                <p className={`${MONO} text-[12px] text-white/40 mt-1`}>
                  {success.injectedVars.length} environment variable{success.injectedVars.length !== 1 ? 's' : ''} injected
                </p>
              </div>
              {success.injectedVars.length > 0 && (
                <div className="w-full border border-white/[0.06] bg-[#0d0e11] rounded-[6px] divide-y divide-white/[0.04] overflow-hidden">
                  {success.injectedVars.map((key) => (
                    <div key={key} className={`${MONO} break-all px-3 py-1.5 text-[11px] text-white/55`}>{key}</div>
                  ))}
                </div>
              )}
              {success.redeployTriggered ? (
                <p className={`${MONO} text-[11px] text-[#0095FF]/70`}>A redeploy was triggered to apply the new variables.</p>
              ) : (
                <p className={`${MONO} text-[11px] text-white/35`}>Redeploy your app to apply the new environment variables.</p>
              )}
            </div>
          ) : (
            <div className="px-6 py-5 space-y-4">
              {/* Step 1: Choose Source */}
              {step === 'choose-source' && (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {[
                    { value: 'existing' as const, icon: <Server className="h-4 w-4 text-[#0095FF]" />, label: 'Use Existing', desc: 'Link a database you already have' },
                    { value: 'create' as const, icon: <Plus className="h-4 w-4 text-emerald-400" />, label: 'Create New', desc: 'Deploy a managed database' },
                  ].map(({ value, icon, label, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSource(value)}
                      className={`min-h-[118px] p-4 rounded-[6px] border text-left transition-all ${
                        source === value
                          ? 'border-[#0095FF]/30 bg-[#0095FF]/[0.06]'
                          : 'border-white/[0.06] bg-[#0d0e11] hover:border-white/[0.12] hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex h-full flex-col">
                        <div className="mb-2.5 flex items-center justify-between gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-white/[0.04]">
                            {icon}
                          </span>
                          {source === value && <CheckCircle2 className="h-3.5 w-3.5 text-[#0095FF]" />}
                        </div>
                        <p className="text-[13px] font-medium text-white">{label}</p>
                        <p className={`${MONO} mt-1 text-[11px] text-white/40 leading-relaxed`}>{desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2a: Select Existing */}
              {step === 'select-existing' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
                    <input
                      placeholder="Search databases…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`${MONO} w-full bg-[#0d0e11] border border-white/[0.08] text-white text-[12.5px] pl-9 pr-3 h-9 rounded-[6px] placeholder:text-white/20 focus:outline-none focus:border-[#0095FF]/50 transition-colors`}
                    />
                  </div>

                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {loadingDatabases ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-white/35" />
                      </div>
                    ) : filteredDatabases.length === 0 ? (
                      <div className="flex flex-col items-center py-8 gap-2">
                        <Database className="h-8 w-8 text-white/15" />
                        <p className={`${MONO} text-[12px] text-white/40`}>
                          {searchQuery ? 'No databases match your search' : 'No databases available'}
                        </p>
                        <button
                          type="button"
                          onClick={() => { setSource('create'); setStep('create-database'); }}
                          className={`${MONO} mt-1 h-8 inline-flex items-center gap-1.5 px-3 border border-[#0095FF]/30 bg-[#0095FF]/[0.08] text-[10.5px] uppercase tracking-[0.12em] text-[#0095FF] hover:bg-[#0095FF]/[0.12] rounded-[5px] transition-colors`}
                        >
                          <Plus className="h-3 w-3" />
                          Create New Database
                        </button>
                      </div>
                    ) : (
                      filteredDatabases.map((db) => {
                        const engineColor = db.engine === 'pg' ? 'text-blue-400' : db.engine === 'mysql' ? 'text-orange-400' : 'text-emerald-400';
                        return (
                          <button
                            key={db.cluster_id}
                            type="button"
                            onClick={() => setSelectedDb(db)}
                            disabled={db.status !== 'online'}
                            className={`w-full px-3 py-2.5 rounded-[6px] border text-left flex items-center gap-3 transition-all ${
                              selectedDb?.cluster_id === db.cluster_id
                                ? 'border-[#0095FF]/30 bg-[#0095FF]/[0.06]'
                                : 'border-white/[0.06] bg-[#0d0e11] hover:border-white/[0.12]'
                            } ${db.status !== 'online' ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            <Database className={`h-3.5 w-3.5 flex-shrink-0 ${engineColor}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-white truncate">{db.name}</p>
                              <p className={`${MONO} text-[10.5px] text-white/40`}>
                                {getEngineLabel(db.engine)}{db.region ? ` · ${db.region}` : ''}
                              </p>
                            </div>
                            {db.status !== 'online' && (
                              <span className={`${MONO} flex-shrink-0 text-[10px] text-amber-300`}>{db.status}</span>
                            )}
                            {selectedDb?.cluster_id === db.cluster_id && (
                              <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF] flex-shrink-0" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Step 2b: Create New Database */}
              {step === 'create-database' && (
                <CreateDatabaseForm
                  projectId={projectId}
                  availablePlans={databasePlans}
                  loadingPlans={loadingPlans}
                  onDataChange={handleCreateDataChange}
                  disabled={isCreating}
                />
              )}

              {/* Step 3: Configure Environment Variables */}
              {step === 'configure-env' && (
                <div className="space-y-4">
                  <EnvConfigStep
                    envVarConfigs={envConfigs}
                    onChange={setEnvConfigs}
                    conflicts={conflicts}
                    onResolveConflicts={() => setForce(true)}
                    disabled={isLinking}
                  />

                  {conflicts.length > 0 && (
                    <label className={`${MONO} flex items-center gap-2 cursor-pointer px-3 py-2.5 border border-amber-400/20 bg-amber-500/[0.05] rounded-[6px]`}>
                      <input
                        type="checkbox"
                        checked={force}
                        onChange={(e) => setForce(e.target.checked)}
                        className="rounded border-amber-500/50 accent-amber-400"
                      />
                      <span className="text-[12px] text-amber-200">Force overwrite existing variables</span>
                    </label>
                  )}

                  {source === 'create' && !isDatabaseReady && (
                    <div className={`${MONO} flex items-center gap-2.5 px-3 py-2.5 border border-white/[0.06] bg-white/[0.02] rounded-[6px]`}>
                      <Loader2 className="h-3.5 w-3.5 text-white/35 animate-spin flex-shrink-0" />
                      <div>
                        <p className="text-[11.5px] text-white/55 font-medium">Database provisioning</p>
                        <p className="text-[10.5px] text-white/30 mt-0.5">
                          Status: {databaseStatus} — typically 3–5 minutes. You can link once it&apos;s online.
                        </p>
                      </div>
                    </div>
                  )}

                  {source === 'create' && isDatabaseReady && (
                    <div className={`${MONO} flex items-center gap-2 px-3 py-2 border border-emerald-500/20 bg-emerald-500/[0.05] rounded-[6px]`}>
                      <Server className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                      <p className="text-[11.5px] text-emerald-300">Database online — ready to link</p>
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className={`${MONO} flex items-start gap-2 px-3 py-2.5 border border-rose-500/20 bg-rose-500/[0.05] rounded-[6px]`}>
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11.5px] text-rose-300">{error}</p>
                </div>
              )}

            </div>
          )}
        </div>
        {!success && (
          <div className="px-6 pb-6 pt-4 border-t border-white/[0.06] flex-shrink-0 flex flex-wrap items-center justify-between gap-2">
            {step !== 'choose-source' ? (
              <button
                type="button"
                onClick={goBack}
                disabled={isCreating || isLinking}
                className="h-9 px-4 rounded-[5px] text-[13px] font-medium text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                disabled={isCreating || isLinking}
                className="h-9 px-4 rounded-[5px] text-[13px] font-medium text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            )}

            <button
              type="button"
              onClick={goNext}
              disabled={!canProceed() || isCreating || isLinking}
              className="inline-flex h-9 min-w-[120px] items-center justify-center gap-2 rounded-[5px] border border-[#0095FF]/30 bg-[#0d0e11] px-4 text-[13px] font-medium text-[#0095FF] transition-colors hover:bg-[#0095FF]/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isCreating ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</>
              ) : isLinking ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Linking…</>
              ) : step === 'configure-env' ? (
                <><Sparkles className="h-3.5 w-3.5" /> Inject & Link</>
              ) : (
                <>Next <ArrowRight className="h-3.5 w-3.5" /></>
              )}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
