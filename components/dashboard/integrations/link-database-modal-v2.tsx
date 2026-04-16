'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Database, 
  Loader2, 
  AlertTriangle,
  CheckCircle2,
  Search,
  Plus,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Server,
} from 'lucide-react';
import { CreateDatabaseForm } from './create-database-form';
import { EnvConfigStep } from './env-config-step';
import type { 
  AvailableDatabase, 
  LinkDatabaseResponse,
  WizardStep,
  CreateDatabaseData,
  EnvVarConfig,
  DatabasePlan,
} from './types';

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
    error?: string 
  }>;
  onSuccess?: () => void;
}

// Default env vars to generate based on engine
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
  
  // URL/URI - different naming for MongoDB
  const urlKey = engine === 'mongodb' ? `${prefix}_URI` : `${prefix}_URL`;
  configs.push({
    originalKey: urlKey,
    customKey: urlKey,
    value: connection.uri,
    description: 'Full connection string',
  });

  configs.push({
    originalKey: `${prefix}_HOST`,
    customKey: `${prefix}_HOST`,
    value: connection.host,
    description: 'Database host',
  });

  configs.push({
    originalKey: `${prefix}_PORT`,
    customKey: `${prefix}_PORT`,
    value: String(connection.port),
    description: 'Database port',
  });

  configs.push({
    originalKey: `${prefix}_USER`,
    customKey: `${prefix}_USER`,
    value: connection.user,
    description: 'Database username',
  });

  configs.push({
    originalKey: `${prefix}_PASSWORD`,
    customKey: `${prefix}_PASSWORD`,
    value: connection.password,
    description: 'Database password',
  });

  configs.push({
    originalKey: `${prefix}_NAME`,
    customKey: `${prefix}_NAME`,
    value: connection.database,
    description: 'Database name',
  });

  return configs;
}

/**
 * Multi-step modal for linking a database to an app
 * 
 * Flow:
 * 1. Choose source (existing or create new)
 * 2a. Select existing database OR 2b. Create new database
 * 3. Configure environment variable names
 * 4. Confirm and inject
 */
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
  // Wizard state
  const [step, setStep] = useState<WizardStep>('choose-source');
  const [source, setSource] = useState<'existing' | 'create' | null>(null);
  
  // Existing database selection
  const [selectedDb, setSelectedDb] = useState<AvailableDatabase | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create database form
  const [createData, setCreateData] = useState<CreateDatabaseData | null>(null);
  const [createdDatabaseId, setCreatedDatabaseId] = useState<string | null>(null);
  const [ ,setCreatedEngine] = useState<string>('');
  
  // Env configuration
  const [envConfigs, setEnvConfigs] = useState<EnvVarConfig[]>([]);
  const [force, setForce] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  
  // Loading/success states
  const [isCreating, setIsCreating] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ injectedVars: string[]; redeployTriggered: boolean } | null>(null);
  
  // Database status tracking for newly created databases
  const [databaseStatus, setDatabaseStatus] = useState<string>('creating');
  const [, setIsPollingStatus] = useState(false);

  // Filter databases by search
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

  // Stable callback for create form data changes
  const handleCreateDataChange = useCallback((data: Partial<CreateDatabaseData> | null) => {
    setCreateData(data as CreateDatabaseData | null);
  }, []);

  // Reset wizard state
  const resetWizard = useCallback(() => {
    setStep('choose-source');
    setSource(null);
    setSelectedDb(null);
    setSearchQuery('');
    setCreateData(null);
    setCreatedDatabaseId(null);
    setCreatedEngine('');
    setEnvConfigs([]);
    setForce(false);
    setConflicts([]);
    setIsCreating(false);
    setIsLinking(false);
    setError(null);
    setSuccess(null);
    setDatabaseStatus('creating');
    setIsPollingStatus(false);
  }, []);

  // Poll database status for newly created databases
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
          
          if (status === 'online') {
            setIsPollingStatus(false);
            return true; // Stop polling
          }
        }
      } catch (err) {
        console.error('Error checking database status:', err);
      }
      return false; // Continue polling
    };

    // Check immediately
    const isReady = await checkStatus();
    if (isReady) return;

    // Poll every 10 seconds for up to 5 minutes
    let attempts = 0;
    const maxAttempts = 30;
    const interval = setInterval(async () => {
      attempts++;
      const ready = await checkStatus();
      if (ready || attempts >= maxAttempts) {
        clearInterval(interval);
        setIsPollingStatus(false);
      }
    }, 10000);

    // Cleanup on unmount
    return () => clearInterval(interval);
  }, []);

  const handleClose = () => {
    if (!isCreating && !isLinking) {
      onOpenChange(false);
      // Reset after animation
      setTimeout(resetWizard, 300);
    }
  };

  // Navigate to next step
  const goNext = async () => {
    setError(null);
    
    switch (step) {
      case 'choose-source':
        if (source === 'existing') {
          setStep('select-existing');
        } else if (source === 'create') {
          setStep('create-database');
        }
        break;
        
      case 'select-existing':
        if (selectedDb) {
          setStep('configure-env');
          // For existing DB: show key names only — actual values are fetched
          // securely by the backend from DigitalOcean API at link time
          const port = selectedDb.engine === 'mongodb' ? 27017 : selectedDb.engine === 'mysql' ? 3306 : 5432;
          setEnvConfigs(generateDefaultEnvConfigs(
            selectedDb.engine,
            {
              host: '(fetched securely on link)',
              port,
              user: '(fetched securely on link)',
              password: '(fetched securely on link)',
              database: '(fetched securely on link)',
              uri: '(fetched securely on link)',
            },
            'DATABASE'
          ));
        }
        break;
        
      case 'create-database':
        if (createData) {
          setIsCreating(true);
          setError(null);
          try {
            const result = await onCreateDatabase(createData);
            if (!result.success) {
              setError(result.error || 'Failed to create database');
              return;
            }
            setCreatedDatabaseId(result.database_id || null);
            setCreatedEngine(createData.engine);
            
            // Generate env configs from created database connection
            if (result.connection) {
              setEnvConfigs(generateDefaultEnvConfigs(
                createData.engine,
                result.connection,
                'DATABASE'
              ));
            } else {
              // Fallback if no connection info yet (db still creating)
              setEnvConfigs(generateDefaultEnvConfigs(
                createData.engine,
                {
                  host: 'creating...',
                  port: createData.engine === 'mongodb' ? 27017 : createData.engine === 'mysql' ? 3306 : 5432,
                  user: 'doadmin',
                  password: 'will be generated',
                  database: 'defaultdb',
                  uri: 'will be generated after creation',
                },
                'DATABASE'
              ));
            }
            
            setStep('configure-env');
            
            // Start polling for database status if we have an ID
            if (result.database_id) {
              setDatabaseStatus('creating');
              pollDatabaseStatus(result.database_id);
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create database');
          } finally {
            setIsCreating(false);
          }
        }
        break;
        
      case 'configure-env':
        // Proceed to linking
        await handleLink();
        break;
    }
  };

  // Navigate back
  const goBack = () => {
    setError(null);
    
    switch (step) {
      case 'select-existing':
      case 'create-database':
        setStep('choose-source');
        setSelectedDb(null);
        setCreateData(null);
        break;
        
      case 'configure-env':
        if (source === 'existing') {
          setStep('select-existing');
        } else {
          setStep('create-database');
        }
        setEnvConfigs([]);
        break;
    }
  };

  // Handle final link action
  const handleLink = async () => {
    const databaseId = source === 'existing' 
      ? selectedDb?.cluster_id 
      : createdDatabaseId;
      
    if (!databaseId) {
      setError('No database selected');
      return;
    }

    setIsLinking(true);
    setError(null);
    setConflicts([]);

    try {
      const result = await onLink(databaseId, envConfigs, force);

      if (!result.success) {
        if (result.code === 'ENV_VAR_CONFLICT' && result.conflicts) {
          setConflicts(result.conflicts);
          setError('Environment variable conflict. Enable "Force Overwrite" to continue.');
        } else {
          setError(result.error || 'Failed to link database');
        }
        return;
      }

      setSuccess({
        injectedVars: result.injected_vars || [],
        redeployTriggered: result.redeploy_triggered || false,
      });

      // Auto-close after success
      setTimeout(() => {
        handleClose();
        onSuccess?.();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link database');
    } finally {
      setIsLinking(false);
    }
  };

  // Check if database is ready (for newly created databases)
  const isDatabaseReady = source === 'existing' || databaseStatus === 'online';

  // Check if can proceed to next step
  const canProceed = () => {
    switch (step) {
      case 'choose-source':
        return source !== null;
      case 'select-existing':
        return selectedDb !== null;
      case 'create-database':
        return createData !== null;
      case 'configure-env':
        // For configure-env step, also check if database is ready when linking
        return envConfigs.length > 0 && isDatabaseReady;
      default:
        return false;
    }
  };

  // Get step title
  const getStepTitle = () => {
    switch (step) {
      case 'choose-source':
        return 'Link Database';
      case 'select-existing':
        return 'Select Database';
      case 'create-database':
        return 'Create New Database';
      case 'configure-env':
        return 'Configure Environment';
      default:
        return 'Link Database';
    }
  };

  // Get step number for progress
  const getStepNumber = () => {
    switch (step) {
      case 'choose-source': return 1;
      case 'select-existing':
      case 'create-database': return 2;
      case 'configure-env': return 3;
      default: return 1;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-neutral-900 border-neutral-800 text-white max-w-lg max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-neutral-800 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            {getStepTitle()}
          </DialogTitle>
          <DialogDescription className="text-white/60">
            {step === 'choose-source' && (
              <>Connect a database to <span className="text-white font-medium">{appName}</span></>
            )}
            {step === 'select-existing' && 'Select an existing database to link'}
            {step === 'create-database' && 'Configure your new database'}
            {step === 'configure-env' && 'Customize environment variable names'}
          </DialogDescription>
          
          {/* Progress indicator with labels */}
          <div className="flex items-center gap-1 pt-2">
            {(['Source', 'Select', 'Configure'] as const).map((label, idx) => {
              const num = idx + 1;
              const active = num <= getStepNumber();
              return (
                <div key={label} className="flex-1 flex flex-col gap-1">
                  <div className={`h-[3px] rounded-full transition-colors ${active ? 'bg-blue-500' : 'bg-neutral-700'}`} />
                  <span className={`text-[10px] ${active ? 'text-blue-400/80' : 'text-white/25'}`}>{label}</span>
                </div>
              );
            })}
          </div>
        </DialogHeader>

        {success ? (
          <div className="flex-1 overflow-y-auto py-6 px-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
              <h3 className="text-base font-semibold text-white">Database linked</h3>
              <p className="text-sm text-white/50">
                {success.injectedVars.length} environment variable{success.injectedVars.length !== 1 ? 's' : ''} injected into your app
              </p>
            </div>

            {success.injectedVars.length > 0 && (
              <div className="rounded-md border border-white/[0.08] bg-white/[0.03] overflow-hidden divide-y divide-white/[0.06]">
                {success.injectedVars.map((key) => (
                  <div key={key} className="px-3 py-2 font-mono text-xs text-white/60">
                    {key}
                  </div>
                ))}
              </div>
            )}

            {success.redeployTriggered ? (
              <p className="text-center text-xs text-blue-400/80">
                A redeploy was triggered to apply the new variables.
              </p>
            ) : (
              <p className="text-center text-xs text-white/40">
                Redeploy your app to apply the new environment variables.
              </p>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 px-6 py-4">
            {/* Step 1: Choose Source */}
            {step === 'choose-source' && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSource('existing')}
                  className={`
                    p-4 rounded-lg border-2 transition-all text-left
                    ${source === 'existing'
                      ? 'bg-blue-500/15 border-blue-500/50'
                      : 'bg-neutral-800/30 border-neutral-700 hover:bg-neutral-800/50 hover:border-neutral-600'
                    }
                  `}
                >
                  <Server className="w-5 h-5 text-blue-400 mb-2" />
                  <p className="font-medium text-white text-sm">Use Existing</p>
                  <p className="text-xs text-white/45 mt-0.5 leading-relaxed">
                    Link a database you already have
                  </p>
                </button>
                
                <button
                  onClick={() => setSource('create')}
                  className={`
                    p-4 rounded-lg border-2 transition-all text-left
                    ${source === 'create'
                      ? 'bg-blue-500/15 border-blue-500/50'
                      : 'bg-neutral-800/30 border-neutral-700 hover:bg-neutral-800/50 hover:border-neutral-600'
                    }
                  `}
                >
                  <Plus className="w-5 h-5 text-green-400 mb-2" />
                  <p className="font-medium text-white text-sm">Create New</p>
                  <p className="text-xs text-white/45 mt-0.5 leading-relaxed">
                    Deploy a managed database
                  </p>
                </button>
              </div>
            )}

            {/* Step 2a: Select Existing Database */}
            {step === 'select-existing' && (
              <>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <Input
                    placeholder="Search databases..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-neutral-800/50 border-neutral-700 text-white"
                  />
                </div>

                {/* Database List */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {loadingDatabases ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-white/50" />
                    </div>
                  ) : filteredDatabases.length === 0 ? (
                    <div className="text-center py-8">
                      <Database className="w-10 h-10 text-white/20 mx-auto mb-3" />
                      <p className="text-white/50">
                        {searchQuery ? 'No databases match your search' : 'No databases available'}
                      </p>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSource('create');
                          setStep('create-database');
                        }}
                        className="text-blue-400 hover:text-blue-300 mt-3"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create New Database
                      </Button>
                    </div>
                  ) : (
                    filteredDatabases.map((db) => {
                      const engineColors: Record<string, string> = {
                        pg: 'text-blue-400',
                        mysql: 'text-orange-400',
                        mongodb: 'text-green-400',
                      };
                      const EngineIcon = () => {
                        switch (db.engine) {
                          case 'pg': return (
                            <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <ellipse cx="12" cy="5" rx="7" ry="3" />
                              <path d="M5 5v6c0 1.66 3.13 3 7 3s7-1.34 7-3V5" />
                              <path d="M5 11v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" />
                            </svg>
                          );
                          case 'mysql': return (
                            <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <ellipse cx="12" cy="5" rx="7" ry="3" />
                              <path d="M5 5v14c0 1.66 3.13 3 7 3s7-1.34 7-3V5" />
                              <path d="M5 12h14" />
                            </svg>
                          );
                          case 'mongodb': return (
                            <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M12 2C9 6 7 9 7 13a5 5 0 0 0 5 5 5 5 0 0 0 5-5c0-4-2-7-5-11z" />
                              <path d="M12 18v4" />
                            </svg>
                          );
                          default: return <Database className="w-4 h-4 flex-shrink-0 text-blue-400" />;
                        }
                      };
                      return (
                        <button
                          key={db.cluster_id}
                          onClick={() => setSelectedDb(db)}
                          disabled={db.status !== 'online'}
                          className={`
                            w-full px-3 py-2.5 rounded-lg border transition-all text-left flex items-center gap-3
                            ${selectedDb?.cluster_id === db.cluster_id
                              ? 'bg-blue-500/15 border-blue-500/50'
                              : 'bg-neutral-800/30 border-neutral-700 hover:bg-neutral-800/50'
                            }
                            ${db.status !== 'online' ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                        >
                          <span className={engineColors[db.engine] || 'text-blue-400'}>
                            <EngineIcon />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white text-sm truncate">{db.name}</p>
                            <p className="text-xs text-white/45">
                              {getEngineLabel(db.engine)}{db.region ? ` · ${db.region}` : ''}
                            </p>
                          </div>
                          {db.status !== 'online' && (
                            <span className="text-xs text-yellow-400 flex-shrink-0">{db.status}</span>
                          )}
                          {selectedDb?.cluster_id === db.cluster_id && (
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </>
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
              <>
                <EnvConfigStep
                  envVarConfigs={envConfigs}
                  onChange={setEnvConfigs}
                  conflicts={conflicts}
                  onResolveConflicts={() => setForce(true)}
                  disabled={isLinking}
                />
                
                {/* Force overwrite checkbox */}
                {conflicts.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <input
                      type="checkbox"
                      checked={force}
                      onChange={(e) => setForce(e.target.checked)}
                      className="rounded border-yellow-500/50"
                    />
                    <span className="text-sm text-yellow-400">Force overwrite existing variables</span>
                  </label>
                )}

                {/* Database status indicator for newly created databases */}
                {source === 'create' && !isDatabaseReady && (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-neutral-800/60 border border-white/[0.07]">
                    <Loader2 className="w-4 h-4 text-white/40 animate-spin flex-shrink-0" />
                    <div>
                      <p className="text-xs text-white/60 font-medium">Database provisioning</p>
                      <p className="text-[11px] text-white/35 mt-0.5">
                        Status: {databaseStatus} — typically 3–5 minutes. You can link once it&apos;s online.
                      </p>
                    </div>
                  </div>
                )}
                
                {source === 'create' && isDatabaseReady && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-500/10 border border-green-500/20">
                    <Server className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <p className="text-xs text-green-400">Database online — ready to link</p>
                  </div>
                )}
              </>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-md bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between gap-3 pt-4 border-t border-neutral-800">
              {step !== 'choose-source' ? (
                <Button
                  variant="ghost"
                  onClick={goBack}
                  disabled={isCreating || isLinking}
                  className="text-white/60"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={handleClose}
                  disabled={isCreating || isLinking}
                  className="text-white/60"
                >
                  Cancel
                </Button>
              )}
              
              <Button
                onClick={goNext}
                disabled={!canProceed() || isCreating || isLinking}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : isLinking ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Linking...
                  </>
                ) : step === 'configure-env' ? (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Inject & Link
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
