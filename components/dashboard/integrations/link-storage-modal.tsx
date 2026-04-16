'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  AlertTriangle,
  Check,
  ChevronRight,
  Search,
  ArrowLeft,
  ArrowRight,
  Server,
  CheckCircle,
  XCircle,
  Globe,
  Lock,
  Unlock,
  Info,
  Archive,
  HardDrive,
} from 'lucide-react';
import { EnvConfigStep } from './env-config-step';
import type { AvailableBucket, LinkStorageResponse, EnvVarConfig } from './types';

interface LinkStorageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appName: string;
  projectId: string;
  buckets: AvailableBucket[];
  loadingBuckets: boolean;
  onLink: (bucketId: string, envConfigs: EnvVarConfig[], force: boolean, includeAwsVars: boolean) => Promise<LinkStorageResponse>;
  onCreateBucket?: (data: CreateBucketData) => Promise<CreateBucketResponse>;
  onSuccess: () => void;
}

// Types for bucket creation
interface CreateBucketData {
  name: string;
  region: string;
  project_id: string;
  acl?: 'private' | 'public-read';
  cors_enabled?: boolean;
  versioning_enabled?: boolean;
}

interface CreateBucketResponse {
  success: boolean;
  bucket_id?: string;
  error?: string;
}

// Bucket name validation rules (same as bucket-create.tsx)
const BUCKET_NAME_RULES = {
  minLength: 3,
  maxLength: 63,
  pattern: /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/,
  description: 'Must start/end with letter or number, can contain hyphens and periods',
};

// Generate default env configs for Object Storage
// By default, AWS_* vars are NOT included to prevent conflicts when linking multiple buckets
function generateDefaultStorageEnvConfigs(
  bucketName: string,
  region: string,
  prefix: string = 'S3',
  includeAwsVars: boolean = false
): EnvVarConfig[] {
  const configs: EnvVarConfig[] = [];

  // S3-compatible env vars with custom prefix (always included)
  configs.push({
    originalKey: `${prefix}_BUCKET`,
    customKey: `${prefix}_BUCKET`,
    value: bucketName,
    description: 'Bucket name',
  });

  configs.push({
    originalKey: `${prefix}_BUCKET_NAME`,
    customKey: `${prefix}_BUCKET_NAME`,
    value: bucketName,
    description: 'Bucket name (alias)',
  });

  configs.push({
    originalKey: `${prefix}_ENDPOINT`,
    customKey: `${prefix}_ENDPOINT`,
    value: '(fetched securely on link)',
    description: 'S3 endpoint URL',
  });

  configs.push({
    originalKey: `${prefix}_REGION`,
    customKey: `${prefix}_REGION`,
    value: region,
    description: 'Storage region',
  });

  configs.push({
    originalKey: `${prefix}_ACCESS_KEY_ID`,
    customKey: `${prefix}_ACCESS_KEY_ID`,
    value: '(fetched securely on link)',
    description: 'Access key ID',
  });

  configs.push({
    originalKey: `${prefix}_SECRET_ACCESS_KEY`,
    customKey: `${prefix}_SECRET_ACCESS_KEY`,
    value: '(fetched securely on link)',
    description: 'Secret access key',
  });

  // AWS SDK compatible names - ONLY if explicitly requested
  // This prevents conflicts when linking multiple buckets to the same app
  if (includeAwsVars && prefix !== 'AWS') {
    configs.push({
      originalKey: 'AWS_ACCESS_KEY_ID',
      customKey: 'AWS_ACCESS_KEY_ID',
      value: '(fetched securely on link)',
      description: 'AWS SDK access key (optional)',
    });

    configs.push({
      originalKey: 'AWS_SECRET_ACCESS_KEY',
      customKey: 'AWS_SECRET_ACCESS_KEY',
      value: '(fetched securely on link)',
      description: 'AWS SDK secret key (optional)',
    });

    configs.push({
      originalKey: 'AWS_REGION',
      customKey: 'AWS_REGION',
      value: region,
      description: 'AWS SDK region (optional)',
    });

    configs.push({
      originalKey: 'AWS_ENDPOINT_URL',
      customKey: 'AWS_ENDPOINT_URL',
      value: '(fetched securely on link)',
      description: 'AWS SDK endpoint (optional)',
    });
  }

  return configs;
}

// Available regions for object storage
const STORAGE_REGIONS = [
  { id: '1', short: 'nyc3', city: 'New York', country: 'United States', country_code: 'US', available: true },
  { id: '2', short: 'sfo3', city: 'San Francisco', country: 'United States', country_code: 'US', available: true },
  { id: '3', short: 'ams3', city: 'Amsterdam', country: 'Netherlands', country_code: 'NL', available: true },
  { id: '4', short: 'sgp1', city: 'Singapore', country: 'Singapore', country_code: 'SG', available: true },
  { id: '5', short: 'fra1', city: 'Frankfurt', country: 'Germany', country_code: 'DE', available: true },
  { id: '6', short: 'blr1', city: 'Bangalore', country: 'India', country_code: 'IN', available: true },
  { id: '7', short: 'syd1', city: 'Sydney', country: 'Australia', country_code: 'AU', available: true },
];

type WizardStep = 'choose-source' | 'select-existing' | 'create-bucket' | 'configure-env' | 'success';

/**
 * Multi-step modal for linking object storage to an app
 * 
 * Flow:
 * 1. Choose source (existing bucket or create new)
 * 2a. Select existing bucket OR 2b. Create new bucket
 * 3. Configure environment variable prefix
 * 4. Success confirmation
 */
export function LinkStorageModal({
  open,
  onOpenChange,
  appName,
  projectId,
  buckets,
  loadingBuckets,
  onLink,
  onCreateBucket,
  onSuccess,
}: LinkStorageModalProps) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>('choose-source');
  const [source, setSource] = useState<'existing' | 'create' | null>(null);
  
  // Existing bucket selection
  const [selectedBucket, setSelectedBucket] = useState<AvailableBucket | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create bucket form
  const [newBucketName, setNewBucketName] = useState('');
  const [newBucketRegion, setNewBucketRegion] = useState('nyc3');
  const [newBucketAcl, setNewBucketAcl] = useState<'private' | 'public-read'>('private');
  const [newBucketCorsEnabled, setNewBucketCorsEnabled] = useState(false);
  const [newBucketVersioningEnabled, setNewBucketVersioningEnabled] = useState(false);
  const [createdBucketId, setCreatedBucketId] = useState<string | null>(null);
  
  // Name availability checking
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Env configuration
  const [envConfigs, setEnvConfigs] = useState<EnvVarConfig[]>([]);
  const [force, setForce] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [includeAwsVars, setIncludeAwsVars] = useState(false);  // Optional AWS_* vars
  
  // Loading/success states
  const [isCreating, setIsCreating] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LinkStorageResponse | null>(null);

  // Filter buckets by search
  const filteredBuckets = buckets.filter(bucket => 
    bucket.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bucket.region.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reset wizard state
  const resetWizard = useCallback(() => {
    setStep('choose-source');
    setSource(null);
    setSelectedBucket(null);
    setSearchQuery('');
    setNewBucketName('');
    setNewBucketRegion('nyc3');
    setNewBucketAcl('private');
    setNewBucketCorsEnabled(false);
    setNewBucketVersioningEnabled(false);
    setCreatedBucketId(null);
    setIsCheckingName(false);
    setNameAvailable(null);
    setNameError(null);
    setEnvConfigs([]);
    setForce(false);
    setConflicts([]);
    setIncludeAwsVars(false);
    setIsCreating(false);
    setIsLinking(false);
    setError(null);
    setResult(null);
    if (nameCheckTimeoutRef.current) {
      clearTimeout(nameCheckTimeoutRef.current);
    }
  }, []);

  // Validate bucket name locally
  const validateBucketName = useCallback((name: string): string | null => {
    if (!name) {
      return null; // Not an error, just empty
    }
    if (name.length < BUCKET_NAME_RULES.minLength) {
      return `Must be at least ${BUCKET_NAME_RULES.minLength} characters`;
    }
    if (name.length > BUCKET_NAME_RULES.maxLength) {
      return `Must be at most ${BUCKET_NAME_RULES.maxLength} characters`;
    }
    if (!BUCKET_NAME_RULES.pattern.test(name)) {
      return BUCKET_NAME_RULES.description;
    }
    if (name.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      return 'Cannot be formatted as an IP address';
    }
    if (name.startsWith('xn--')) {
      return 'Cannot start with "xn--"';
    }
    if (name.endsWith('-s3alias')) {
      return 'Cannot end with "-s3alias"';
    }
    return null;
  }, []);

  // Check bucket name availability via API
  const checkNameAvailability = useCallback(async (name: string) => {
    if (!name || name.length < BUCKET_NAME_RULES.minLength) {
      setNameAvailable(null);
      return;
    }

    // Validate locally first
    const localError = validateBucketName(name);
    if (localError) {
      setNameError(localError);
      setNameAvailable(null);
      return;
    }

    setIsCheckingName(true);
    try {
      const res = await fetch(`/api/services/object-storage/check-bucket?name=${encodeURIComponent(name)}&region=${newBucketRegion}`);
      const data = await res.json();
      
      if (data.exists) {
        setNameAvailable(false);
        setNameError('Bucket name is already taken globally');
      } else {
        setNameAvailable(true);
        setNameError(null);
      }
    } catch (err) {
      console.error('Error checking bucket name:', err);
      setNameAvailable(null);
      setNameError(null);
    } finally {
      setIsCheckingName(false);
    }
  }, [newBucketRegion, validateBucketName]);

  // Debounced name availability check
  const handleBucketNameChange = useCallback((name: string) => {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setNewBucketName(cleanName);
    setNameAvailable(null);
    
    // Validate locally first
    const localError = validateBucketName(cleanName);
    setNameError(localError);

    // Clear previous timeout
    if (nameCheckTimeoutRef.current) {
      clearTimeout(nameCheckTimeoutRef.current);
    }

    // Only check availability if local validation passes
    if (!localError && cleanName.length >= BUCKET_NAME_RULES.minLength) {
      nameCheckTimeoutRef.current = setTimeout(() => {
        checkNameAvailability(cleanName);
      }, 500);
    }
  }, [validateBucketName, checkNameAvailability]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (nameCheckTimeoutRef.current) {
        clearTimeout(nameCheckTimeoutRef.current);
      }
    };
  }, []);

  const handleClose = () => {
    if (!isCreating && !isLinking) {
      onOpenChange(false);
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
          setStep('create-bucket');
        }
        break;
        
      case 'select-existing':
        if (selectedBucket) {
          // Generate env configs for existing bucket (includeAwsVars based on state)
          const configs = generateDefaultStorageEnvConfigs(
            selectedBucket.name,
            selectedBucket.region,
            'S3',
            includeAwsVars
          );
          setEnvConfigs(configs);
          setStep('configure-env');
        }
        break;
        
      case 'create-bucket':
        if (newBucketName && newBucketRegion) {
          // Validate name one more time before creating
          const localError = validateBucketName(newBucketName);
          if (localError) {
            setNameError(localError);
            setError(localError);
            return;
          }
          if (nameAvailable === false) {
            setError('Bucket name is already taken. Please choose a different name.');
            return;
          }
          await handleCreateBucket();
        }
        break;
        
      case 'configure-env':
        await handleLink();
        break;
    }
  };

  // Navigate to previous step
  const goBack = () => {
    setError(null);
    setConflicts([]);
    
    switch (step) {
      case 'select-existing':
      case 'create-bucket':
        setStep('choose-source');
        break;
      case 'configure-env':
        if (source === 'existing') {
          setStep('select-existing');
        } else {
          // source === 'create': bucket already provisioned — cannot go back to re-create.
          // Going back to choose-source would orphan the created bucket.
          // Stay on configure-env (back button is hidden for this case).
        }
        break;
    }
  };

  // Create new bucket
  const handleCreateBucket = async () => {
    if (!onCreateBucket) {
      setError('Bucket creation not available');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await onCreateBucket({
        name: newBucketName,
        region: newBucketRegion,
        project_id: projectId,
        acl: newBucketAcl,
        cors_enabled: newBucketCorsEnabled,
        versioning_enabled: newBucketVersioningEnabled,
      });

      if (response.success && response.bucket_id) {
        setCreatedBucketId(response.bucket_id);
        // Generate env configs for new bucket (includeAwsVars based on state)
        const configs = generateDefaultStorageEnvConfigs(
          newBucketName,
          newBucketRegion,
          'S3',
          includeAwsVars
        );
        setEnvConfigs(configs);
        setStep('configure-env');
      } else {
        setError(response.error || 'Failed to create bucket');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsCreating(false);
    }
  };

  // Link bucket to app
  const handleLink = async (forceLink = false) => {
    const bucketId = selectedBucket?.id || createdBucketId;
    if (!bucketId || envConfigs.length === 0) return;

    setIsLinking(true);
    setError(null);

    try {
      const response = await onLink(bucketId, envConfigs, forceLink || force, includeAwsVars);

      if (response.success) {
        setResult(response);
        setStep('success');
        onSuccess();
      } else if (response.code === 'ENV_VAR_CONFLICT' && response.conflicts) {
        setConflicts(response.conflicts);
        setError('Environment variable conflict detected');
      } else {
        setError(response.error || 'Failed to link bucket');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsLinking(false);
    }
  };

  // Can proceed to next step?
  const canProceed = () => {
    switch (step) {
      case 'choose-source':
        return source !== null;
      case 'select-existing':
        return selectedBucket !== null;
      case 'create-bucket':
        return (
          newBucketName.length >= BUCKET_NAME_RULES.minLength && 
          newBucketRegion && 
          !nameError && 
          nameAvailable !== false &&
          !isCheckingName
        );
      case 'configure-env':
        return envConfigs.length > 0;
      default:
        return false;
    }
  };

  // Step titles
  const stepTitles: Record<WizardStep, string> = {
    'choose-source': 'Link Object Storage',
    'select-existing': 'Select Bucket',
    'create-bucket': 'Create New Bucket',
    'configure-env': 'Configure Environment',
    'success': 'Success!',
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] bg-neutral-900 border-neutral-800 flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl flex items-center gap-2">
            <Archive className="w-5 h-5 text-neutral-300" />
            {stepTitles[step]}
          </DialogTitle>
          <DialogDescription className="text-white/60">
            {step === 'choose-source' && `Connect a bucket to ${appName} for automatic S3 credentials injection`}
            {step === 'select-existing' && 'Choose an existing bucket from your account'}
            {step === 'create-bucket' && 'Create a new S3-compatible bucket'}
            {step === 'configure-env' && 'Configure how credentials are injected into your app'}
            {step === 'success' && 'Your bucket has been linked successfully'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 -mr-2">{/* Scrollable content area */}
        {step === 'choose-source' && (
          <div className="space-y-4">
            {/* Existing Bucket Option */}
            <button
              onClick={() => setSource('existing')}
              className={`w-full p-4 rounded-lg border transition-all text-left ${
                source === 'existing'
                  ? 'bg-purple-500/10 border-purple-500/50'
                  : 'bg-neutral-800/30 border-neutral-700 hover:border-neutral-600'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${source === 'existing' ? 'bg-purple-500/20' : 'bg-neutral-800'}`}>
                  <Server className={`w-6 h-6 ${source === 'existing' ? 'text-purple-400' : 'text-white/60'}`} />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold mb-1 ${source === 'existing' ? 'text-purple-400' : 'text-white'}`}>
                    Use Existing Bucket
                  </h3>
                  <p className="text-sm text-white/50">
                    Connect to a bucket you&apos;ve already created
                  </p>
                  {buckets.length > 0 && (
                    <p className="text-xs text-white/40 mt-2">
                      {buckets.length} bucket{buckets.length !== 1 ? 's' : ''} available
                    </p>
                  )}
                </div>
                {source === 'existing' && (
                  <Check className="w-5 h-5 text-purple-400" />
                )}
              </div>
            </button>

            {/* Create New Option */}
            <button
              onClick={() => setSource('create')}
              disabled={!onCreateBucket}
              className={`w-full p-4 rounded-lg border transition-all text-left ${
                source === 'create'
                  ? 'bg-purple-500/10 border-purple-500/50'
                  : 'bg-neutral-800/30 border-neutral-700 hover:border-neutral-600'
              } ${!onCreateBucket ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${source === 'create' ? 'bg-purple-500/20' : 'bg-neutral-800'}`}>
                  <Archive className={`w-6 h-6 ${source === 'create' ? 'text-purple-400' : 'text-white/60'}`} />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold mb-1 ${source === 'create' ? 'text-purple-400' : 'text-white'}`}>
                    Create New Bucket
                  </h3>
                  <p className="text-sm text-white/50">
                    Provision a new S3-compatible bucket and link it
                  </p>
                  {!onCreateBucket && (
                    <p className="text-xs text-amber-400 mt-2">
                      Coming soon
                    </p>
                  )}
                </div>
                {source === 'create' && (
                  <Check className="w-5 h-5 text-purple-400" />
                )}
              </div>
            </button>

            {/* Navigation */}
            <div className="flex justify-end pt-4">
              <Button
                onClick={goNext}
                disabled={!canProceed()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2a: Select Existing Bucket */}
        {step === 'select-existing' && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input
                placeholder="Search buckets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-neutral-800/50 border-neutral-700"
              />
            </div>

            {/* Bucket List */}
            {loadingBuckets ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-white/50" />
              </div>
            ) : filteredBuckets.length === 0 ? (
              <div className="text-center py-8">
                <Archive className="w-12 h-12 opacity-20 mx-auto mb-4 text-white" />
                <h3 className="text-lg font-medium text-white/70 mb-2">
                  {searchQuery ? 'No buckets match your search' : 'No Buckets Available'}
                </h3>
                <p className="text-sm text-white/50">
                  {searchQuery ? 'Try a different search term' : 'Create a bucket first or all buckets are already linked'}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {filteredBuckets.map((bucket) => (
                  <button
                    key={bucket.id}
                    onClick={() => setSelectedBucket(bucket)}
                    className={`w-full p-4 rounded-lg border transition-all text-left ${
                      selectedBucket?.id === bucket.id
                        ? 'bg-purple-500/10 border-purple-500/50'
                        : 'bg-neutral-800/30 border-neutral-700 hover:border-neutral-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          selectedBucket?.id === bucket.id ? 'bg-neutral-700' : 'bg-neutral-800'
                        }`}>
                          <Archive className="w-5 h-5 text-neutral-300" />
                        </div>
                        <div>
                          <h4 className="font-medium text-white">{bucket.name}</h4>
                          <p className="text-sm text-white/50">{bucket.region}</p>
                        </div>
                      </div>
                      {selectedBucket?.id === bucket.id ? (
                        <Check className="w-5 h-5 text-purple-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-white/30" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={goBack} className="text-white/60">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={goNext}
                disabled={!canProceed()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2b: Create New Bucket */}
        {step === 'create-bucket' && (
          <div className="space-y-4">
            {/* Bucket Name */}
            <div className="space-y-2">
              <Label htmlFor="bucket-name" className="text-white/70">Bucket Name</Label>
              <div className="relative">
                <Input
                  id="bucket-name"
                  value={newBucketName}
                  onChange={(e) => handleBucketNameChange(e.target.value)}
                  placeholder="my-app-bucket"
                  className={`bg-neutral-800/50 border-neutral-700 pr-10 ${
                    nameError ? 'border-red-500/50' : 
                    nameAvailable === true ? 'border-green-500/50' : ''
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isCheckingName && (
                    <Loader2 className="w-4 h-4 animate-spin text-white/40" />
                  )}
                  {!isCheckingName && nameAvailable === true && (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  )}
                  {!isCheckingName && nameAvailable === false && (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                </div>
              </div>
              {nameError ? (
                <p className="text-xs text-red-400">{nameError}</p>
              ) : nameAvailable === true ? (
                <p className="text-xs text-green-400">✓ Bucket name is available</p>
              ) : (
                <p className="text-xs text-white/40">
                  Lowercase letters, numbers, and hyphens only. Must be globally unique.
                </p>
              )}
            </div>

            {/* Region */}
            <div className="space-y-2">
              <Label className="text-white/70">Location</Label>
              <RadioGroup
                value={newBucketRegion}
                onValueChange={setNewBucketRegion}
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
              >
                {STORAGE_REGIONS.map((region) => (
                  <div key={region.id}>
                    <RadioGroupItem
                      value={region.short}
                      id={region.city}
                      className="peer sr-only"
                      disabled={!region.available}
                    />
                    <Label
                      htmlFor={region.city}
                      className="flex items-center gap-3 rounded-md bg-white/10 border-2 border-transparent cursor-pointer p-4 transition-all peer-data-[state=checked]:border-blue-500"
                    >
                      <Image
                        src={`https://flagsapi.com/${region.country_code}/flat/64.png`}
                        alt={region.city}
                        width={32}
                        height={24}
                        className="rounded-sm"
                      />
                      <div>
                        <div className="font-medium text-white">
                          {region.city}
                        </div>
                        <div className="text-xs text-white/60">
                          {region.country}
                        </div>
                      </div>
                      {!region.available && (
                        <Badge
                          variant="outline"
                          className="text-xs ml-auto text-white/70 border-white/30"
                        >
                          Coming soon
                        </Badge>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Access Control */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {newBucketAcl === 'private' ? (
                  <Lock className="h-4 w-4 text-green-400" />
                ) : (
                  <Unlock className="h-4 w-4 text-blue-400" />
                )}
                <Label className="text-white/70">Access Control (ACL)</Label>
              </div>
              <p className="text-sm text-white/60">
                {newBucketAcl === 'private'
                  ? 'Private (recommended)'
                  : 'Public read access'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setNewBucketAcl('private')}
                  className={`p-3 rounded-lg border transition-all text-left ${
                    newBucketAcl === 'private'
                      ? 'bg-green-500/10 border-green-500/50'
                      : 'bg-neutral-800/30 border-neutral-700 hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Lock className={`w-4 h-4 ${newBucketAcl === 'private' ? 'text-green-400' : 'text-white/60'}`} />
                    <span className="text-sm text-white">Private</span>
                  </div>
                  <p className="text-xs text-white/40 mt-1">Secure, API access only</p>
                </button>
                <button
                  onClick={() => setNewBucketAcl('public-read')}
                  className={`p-3 rounded-lg border transition-all text-left ${
                    newBucketAcl === 'public-read'
                      ? 'bg-blue-500/10 border-blue-500/50'
                      : 'bg-neutral-800/30 border-neutral-700 hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Unlock className={`w-4 h-4 ${newBucketAcl === 'public-read' ? 'text-blue-400' : 'text-white/60'}`} />
                    <span className="text-sm text-white">Public Read</span>
                  </div>
                  <p className="text-xs text-white/40 mt-1">Anyone can read files</p>
                </button>
              </div>
            </div>

            {/* Optional Settings */}
            <div className="space-y-3 p-3 rounded-lg bg-neutral-800/30 border border-neutral-700">
              <div className="flex items-center gap-2 text-white/60 text-sm">
                <Info className="w-4 h-4" />
                <span>Optional Settings</span>
              </div>
              
              {/* CORS */}
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-2 flex-1">
                  <Globe className="w-4 h-4 text-blue-400 mt-0.5" />
                  <div>
                    <Label className="text-white/70">CORS (Cross-Origin Resource Sharing)</Label>
                    <p className="text-xs text-white/40">Allow cross-origin requests to your bucket</p>
                  </div>
                </div>
                <Switch
                  checked={newBucketCorsEnabled}
                  onCheckedChange={setNewBucketCorsEnabled}
                />
              </div>

              {/* Versioning */}
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-2 flex-1">
                  <HardDrive className="w-4 h-4 text-purple-400 mt-0.5" />
                  <div>
                    <Label className="text-white/70">Object Versioning</Label>
                    <p className="text-xs text-white/40">Keep multiple versions of objects in your bucket</p>
                  </div>
                </div>
                <Switch
                  checked={newBucketVersioningEnabled}
                  onCheckedChange={setNewBucketVersioningEnabled}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={goBack} disabled={isCreating} className="text-white/60">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={goNext}
                disabled={!canProceed() || isCreating}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create & Continue
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Configure Environment */}
        {step === 'configure-env' && (
          <div className="space-y-6">
            {/* Selected Bucket Info */}
            <div className="p-4 rounded-lg bg-neutral-800/30 border border-neutral-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-neutral-800">
                  <Archive className="w-5 h-5 text-neutral-300" />
                </div>
                <div>
                  <h4 className="font-medium text-white">
                    {selectedBucket?.name || newBucketName}
                  </h4>
                  <p className="text-sm text-white/50">
                    {selectedBucket?.region || newBucketRegion}
                  </p>
                </div>
              </div>
            </div>

            {/* AWS SDK Variables Toggle */}
            <div className="p-3 rounded-lg bg-neutral-800/30 border border-neutral-700">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-white/70">Include AWS SDK Variables</Label>
                  <p className="text-xs text-white/40 mt-1">
                    Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, etc.
                    <br />
                    <span className="text-amber-400/70">⚠️ Only enable for single bucket apps to avoid conflicts</span>
                  </p>
                </div>
                <Switch
                  checked={includeAwsVars}
                  onCheckedChange={(checked) => {
                    setIncludeAwsVars(checked);
                    // Regenerate env configs with new setting
                    const bucketName = selectedBucket?.name || newBucketName;
                    const bucketRegion = selectedBucket?.region || newBucketRegion;
                    const configs = generateDefaultStorageEnvConfigs(bucketName, bucketRegion, 'S3', checked);
                    setEnvConfigs(configs);
                  }}
                  disabled={isLinking}
                />
              </div>
            </div>

            {/* Environment Variable Configuration */}
            <EnvConfigStep
              envVarConfigs={envConfigs}
              onChange={setEnvConfigs}
              conflicts={conflicts}
              onResolveConflicts={() => setForce(true)}
              disabled={isLinking}
            />

            {/* Error */}
            {error && !conflicts.length && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4">
              {source === 'existing' ? (
                <Button variant="ghost" onClick={goBack} disabled={isLinking} className="text-white/60">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              ) : (
                <div /> /* Back not available after bucket creation */
              )}
              <div className="flex gap-2">
                {conflicts.length > 0 && !force && (
                  <Button
                    onClick={() => handleLink(true)}
                    disabled={isLinking}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    {isLinking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Force Link'}
                  </Button>
                )}
                <Button
                  onClick={() => handleLink(false)}
                  disabled={isLinking || !canProceed()}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {isLinking ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    <>
                      <ChevronRight className="w-4 h-4 mr-2" />
                      Link Bucket
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 'success' && result && (
          <div className="space-y-6">
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Bucket Linked!</h3>
              <p className="text-white/60">
                {result.injected_vars?.length || 0} environment variables injected
              </p>
              {result.redeploy_triggered && (
                <p className="text-sm text-green-400 mt-2">
                  ✨ App restart triggered to apply changes
                </p>
              )}
            </div>

            {/* Injected Variables */}
            {result.injected_vars && result.injected_vars.length > 0 && (
              <div className="space-y-2">
                <Label className="text-white/70">Injected Variables</Label>
                <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-black/30 max-h-[150px] overflow-y-auto">
                  {result.injected_vars.map((key) => (
                    <code 
                      key={key} 
                      className="text-xs bg-green-500/10 text-green-400 px-2 py-1 rounded"
                    >
                      {key}
                    </code>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleClose}
              className="w-full bg-white/10 hover:bg-white/20"
            >
              Done
            </Button>
          </div>
        )}
        </div>{/* End scrollable content area */}
      </DialogContent>
    </Dialog>
  );
}
