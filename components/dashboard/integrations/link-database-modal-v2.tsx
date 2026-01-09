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
    setEnvConfigs([]);
    setForce(false);
    setConflicts([]);
    setIsCreating(false);
    setIsLinking(false);
    setError(null);
    setSuccess(null);
    setDatabaseStatus('creating');
  }, []);

  // Poll database status for newly created databases
  const pollDatabaseStatus = useCallback(async (dbId: string, engine?: string) => {
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
            // Update env configs with real connection info when database is ready
            const conn = data.data?.public_connection;
            if (conn && engine) {
              setEnvConfigs(generateDefaultEnvConfigs(
                engine,
                {
                  host: conn.host || dbId,
                  port: conn.port || (engine === 'mongodb' ? 27017 : engine === 'mysql' ? 3306 : 5432),
                  user: conn.user || 'doadmin',
                  password: conn.password || '(encrypted)',
                  database: conn.database || 'defaultdb',
                  uri: conn.uri || '(connection string)',
                },
                'DATABASE'
              ));
            }
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
          // Fetch real connection info from database before showing env config
          setIsCreating(true); // Reuse loading state
          setError(null);
          try {
            const res = await fetch('/api/services/database/read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: selectedDb.cluster_id }),
            });
            
            if (!res.ok) {
              throw new Error('Failed to fetch database details');
            }
            
            const dbData = await res.json();
            const conn = dbData.data?.public_connection;
            
            if (conn) {
              // Use real connection data
              setEnvConfigs(generateDefaultEnvConfigs(
                selectedDb.engine,
                {
                  host: conn.host || selectedDb.cluster_id,
                  port: conn.port || (selectedDb.engine === 'mongodb' ? 27017 : selectedDb.engine === 'mysql' ? 3306 : 5432),
                  user: conn.user || 'doadmin',
                  password: conn.password || '(encrypted)', // Show actual password if available
                  database: conn.database || 'defaultdb',
                  uri: conn.uri || '(will be generated)', // Use actual URI from connection
                },
                'DATABASE'
              ));
            } else {
              // Fallback if no connection info yet
              setEnvConfigs(generateDefaultEnvConfigs(
                selectedDb.engine,
                {
                  host: '(fetching...)',
                  port: selectedDb.engine === 'mongodb' ? 27017 : selectedDb.engine === 'mysql' ? 3306 : 5432,
                  user: 'doadmin',
                  password: '••••••••',
                  database: 'defaultdb',
                  uri: '(will be generated)',
                },
                'DATABASE'
              ));
            }
            setStep('configure-env');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch database info');
          } finally {
            setIsCreating(false);
          }
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
              pollDatabaseStatus(result.database_id, createData.engine);
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
      <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
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
          
          {/* Progress indicator */}
          <div className="flex items-center gap-2 pt-2">
            {[1, 2, 3].map((num) => (
              <div
                key={num}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  num <= getStepNumber() ? 'bg-blue-500' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Database Linked!</h3>
            <p className="text-white/60 text-sm mb-4">
              {success.injectedVars.length} environment variables injected
            </p>
            {success.redeployTriggered && (
              <p className="text-sm text-blue-400">
                Redeploy triggered to apply changes
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Step 1: Choose Source */}
            {step === 'choose-source' && (
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setSource('existing')}
                  className={`
                    p-6 rounded-lg border-2 transition-all text-center
                    ${source === 'existing'
                      ? 'bg-blue-500/20 border-blue-500/50'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }
                  `}
                >
                  <Server className="w-8 h-8 text-blue-400 mx-auto mb-3" />
                  <p className="font-medium text-white">Use Existing</p>
                  <p className="text-xs text-white/50 mt-1">
                    Link an existing database
                  </p>
                </button>
                
                <button
                  onClick={() => setSource('create')}
                  className={`
                    p-6 rounded-lg border-2 transition-all text-center
                    ${source === 'create'
                      ? 'bg-blue-500/20 border-blue-500/50'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }
                  `}
                >
                  <Plus className="w-8 h-8 text-green-400 mx-auto mb-3" />
                  <p className="font-medium text-white">Create New</p>
                  <p className="text-xs text-white/50 mt-1">
                    Deploy a new database
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
                    className="pl-9 bg-white/5 border-white/10 text-white"
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
                    filteredDatabases.map((db) => (
                      <button
                        key={db.cluster_id}
                        onClick={() => setSelectedDb(db)}
                        disabled={db.status !== 'online'}
                        className={`
                          w-full p-3 rounded-lg border transition-all text-left
                          ${selectedDb?.cluster_id === db.cluster_id
                            ? 'bg-blue-500/20 border-blue-500/50'
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                          }
                          ${db.status !== 'online' ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                      >
                        <div className="flex items-center gap-3">
                          <Database className="w-5 h-5 text-blue-400" />
                          <div className="flex-1">
                            <p className="font-medium text-white">{db.name}</p>
                            <p className="text-xs text-white/50">
                              {getEngineLabel(db.engine)} • {db.region || 'Unknown region'}
                            </p>
                          </div>
                          {db.status !== 'online' && (
                            <span className="text-xs text-yellow-400">{db.status}</span>
                          )}
                        </div>
                      </button>
                    ))
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
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
                      <div>
                        <p className="text-sm text-blue-400 font-medium">
                          Database is provisioning...
                        </p>
                        <p className="text-xs text-blue-400/70 mt-0.5">
                          Status: {databaseStatus}. This typically takes 3-5 minutes. You can link once it&apos;s online.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {source === 'create' && isDatabaseReady && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Server className="w-5 h-5 text-green-400 flex-shrink-0" />
                      <p className="text-sm text-green-400">
                        Database is online and ready to link!
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between gap-3 pt-2 border-t border-white/10">
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
