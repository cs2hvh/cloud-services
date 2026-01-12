'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
import { 
  HardDrive, 
  Loader2, 
  AlertTriangle,
  Check,
  MapPin,
  ChevronRight,
  Plus,
  Search,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Server,
  CheckCircle,
  XCircle,
  Globe,
  Lock,
  Info,
} from 'lucide-react';
import type { AvailableBucket, LinkStorageResponse } from './types';

interface LinkStorageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appName: string;
  projectId: string;
  buckets: AvailableBucket[];
  loadingBuckets: boolean;
  onLink: (bucketId: string, envPrefix: string, force: boolean) => Promise<LinkStorageResponse>;
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

// Available regions for object storage
const STORAGE_REGIONS = [
  { value: 'nyc3', label: 'New York 3', flag: '🇺🇸' },
  { value: 'sfo3', label: 'San Francisco 3', flag: '🇺🇸' },
  { value: 'ams3', label: 'Amsterdam 3', flag: '🇳🇱' },
  { value: 'sgp1', label: 'Singapore 1', flag: '🇸🇬' },
  { value: 'fra1', label: 'Frankfurt 1', flag: '🇩🇪' },
  { value: 'blr1', label: 'Bangalore 1', flag: '🇮🇳' },
  { value: 'syd1', label: 'Sydney 1', flag: '🇦🇺' },
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
  const [envPrefix, setEnvPrefix] = useState('S3');
  const [force, setForce] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  
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
    setEnvPrefix('S3');
    setForce(false);
    setConflicts([]);
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
          setStep('choose-source');
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
    if (!bucketId) return;

    setIsLinking(true);
    setError(null);

    try {
      const response = await onLink(bucketId, envPrefix, forceLink || force);

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

  // Preview of env vars that will be injected
  const previewEnvVars = [
    `${envPrefix}_BUCKET`,
    `${envPrefix}_BUCKET_NAME`,
    `${envPrefix}_ENDPOINT`,
    `${envPrefix}_REGION`,
    `${envPrefix}_ACCESS_KEY_ID`,
    `${envPrefix}_SECRET_ACCESS_KEY`,
    ...(envPrefix !== 'AWS' ? [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_REGION',
      'AWS_ENDPOINT_URL',
    ] : []),
  ];

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
        return envPrefix.length >= 1;
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
      <DialogContent className="max-w-lg bg-[#0a0a0f] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-purple-400" />
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

        {/* Step 1: Choose Source */}
        {step === 'choose-source' && (
          <div className="space-y-4">
            {/* Existing Bucket Option */}
            <button
              onClick={() => setSource('existing')}
              className={`w-full p-4 rounded-lg border transition-all text-left ${
                source === 'existing'
                  ? 'bg-purple-500/10 border-purple-500/50'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${source === 'existing' ? 'bg-purple-500/20' : 'bg-white/10'}`}>
                  <Server className={`w-6 h-6 ${source === 'existing' ? 'text-purple-400' : 'text-white/60'}`} />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold mb-1 ${source === 'existing' ? 'text-purple-400' : 'text-white'}`}>
                    Use Existing Bucket
                  </h3>
                  <p className="text-sm text-white/50">
                    Connect to a bucket you've already created
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
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              } ${!onCreateBucket ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${source === 'create' ? 'bg-purple-500/20' : 'bg-white/10'}`}>
                  <Sparkles className={`w-6 h-6 ${source === 'create' ? 'text-purple-400' : 'text-white/60'}`} />
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
                className="pl-10 bg-white/5 border-white/10"
              />
            </div>

            {/* Bucket List */}
            {loadingBuckets ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-white/50" />
              </div>
            ) : filteredBuckets.length === 0 ? (
              <div className="text-center py-8">
                <HardDrive className="w-12 h-12 text-white/20 mx-auto mb-4" />
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
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          selectedBucket?.id === bucket.id ? 'bg-purple-500/20' : 'bg-purple-500/10'
                        }`}>
                          <HardDrive className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                          <h4 className="font-medium text-white">{bucket.name}</h4>
                          <div className="flex items-center gap-2 text-sm text-white/50">
                            <MapPin className="w-3 h-3" />
                            <span>{bucket.region}</span>
                          </div>
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
                  className={`bg-white/5 border-white/10 pr-10 ${
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
              <Label className="text-white/70">Region</Label>
              <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto">
                {STORAGE_REGIONS.map((region) => (
                  <button
                    key={region.value}
                    onClick={() => setNewBucketRegion(region.value)}
                    className={`p-3 rounded-lg border transition-all text-left ${
                      newBucketRegion === region.value
                        ? 'bg-purple-500/10 border-purple-500/50'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{region.flag}</span>
                      <span className="text-sm text-white">{region.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Access Control */}
            <div className="space-y-2">
              <Label className="text-white/70">Access Control</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setNewBucketAcl('private')}
                  className={`p-3 rounded-lg border transition-all text-left ${
                    newBucketAcl === 'private'
                      ? 'bg-purple-500/10 border-purple-500/50'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Lock className={`w-4 h-4 ${newBucketAcl === 'private' ? 'text-purple-400' : 'text-white/60'}`} />
                    <span className="text-sm text-white">Private</span>
                  </div>
                  <p className="text-xs text-white/40 mt-1">Secure, API access only</p>
                </button>
                <button
                  onClick={() => setNewBucketAcl('public-read')}
                  className={`p-3 rounded-lg border transition-all text-left ${
                    newBucketAcl === 'public-read'
                      ? 'bg-purple-500/10 border-purple-500/50'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Globe className={`w-4 h-4 ${newBucketAcl === 'public-read' ? 'text-purple-400' : 'text-white/60'}`} />
                    <span className="text-sm text-white">Public Read</span>
                  </div>
                  <p className="text-xs text-white/40 mt-1">Anyone can read files</p>
                </button>
              </div>
            </div>

            {/* Optional Settings */}
            <div className="space-y-3 p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 text-white/60 text-sm">
                <Info className="w-4 h-4" />
                <span>Optional Settings</span>
              </div>
              
              {/* CORS */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-white/70">Enable CORS</Label>
                  <p className="text-xs text-white/40">Allow browser access from web apps</p>
                </div>
                <Switch
                  checked={newBucketCorsEnabled}
                  onCheckedChange={setNewBucketCorsEnabled}
                />
              </div>

              {/* Versioning */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-white/70">Enable Versioning</Label>
                  <p className="text-xs text-white/40">Keep history of file changes (adds cost)</p>
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
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <HardDrive className="w-5 h-5 text-purple-400" />
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

            {/* Environment Prefix */}
            <div className="space-y-2">
              <Label htmlFor="env-prefix" className="text-white/70">
                Environment Variable Prefix
              </Label>
              <Input
                id="env-prefix"
                value={envPrefix}
                onChange={(e) => setEnvPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                placeholder="S3"
                className="bg-white/5 border-white/10 text-white"
              />
              <p className="text-xs text-white/40">
                Variables will be named like {envPrefix}_BUCKET, {envPrefix}_ACCESS_KEY_ID, etc.
              </p>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label className="text-white/70">Environment Variables to Inject</Label>
              <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-black/30 max-h-[100px] overflow-y-auto">
                {previewEnvVars.map((key) => (
                  <code 
                    key={key} 
                    className="text-xs bg-purple-500/10 text-purple-400 px-2 py-1 rounded"
                  >
                    {key}
                  </code>
                ))}
              </div>
            </div>

            {/* Conflicts */}
            {conflicts.length > 0 && (
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-400 mb-1">Conflict Detected</h4>
                    <p className="text-sm text-white/70 mb-2">
                      The following variables already exist. Force to overwrite.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {conflicts.map((key) => (
                        <code key={key} className="text-xs bg-amber-500/20 text-amber-300 px-2 py-1 rounded">
                          {key}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && !conflicts.length && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={goBack} disabled={isLinking} className="text-white/60">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="flex gap-2">
                {conflicts.length > 0 && (
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
                      <HardDrive className="w-4 h-4 mr-2" />
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
      </DialogContent>
    </Dialog>
  );
}
