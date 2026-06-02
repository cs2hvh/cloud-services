'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  ChevronRight,
  Globe,
  HardDrive,
  Info,
  Loader2,
  Lock,
  Search,
  Server,
  Unlock,
  XCircle,
} from 'lucide-react';
import { EnvConfigStep } from './env-config-step';
import type { AvailableBucket, EnvVarConfig, LinkStorageResponse } from './types';

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

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

const BUCKET_NAME_RULES = {
  minLength: 3,
  maxLength: 63,
  pattern: /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/,
  description: 'Must start/end with letter or number, can contain hyphens and periods',
};

function generateDefaultStorageEnvConfigs(
  bucketName: string,
  region: string,
  prefix: string = 'S3',
  includeAwsVars: boolean = false
): EnvVarConfig[] {
  const configs: EnvVarConfig[] = [];
  configs.push({ originalKey: `${prefix}_BUCKET`, customKey: `${prefix}_BUCKET`, value: bucketName, description: 'Bucket name' });
  configs.push({ originalKey: `${prefix}_BUCKET_NAME`, customKey: `${prefix}_BUCKET_NAME`, value: bucketName, description: 'Bucket name (alias)' });
  configs.push({ originalKey: `${prefix}_ENDPOINT`, customKey: `${prefix}_ENDPOINT`, value: '(fetched securely on link)', description: 'S3 endpoint URL' });
  configs.push({ originalKey: `${prefix}_REGION`, customKey: `${prefix}_REGION`, value: region, description: 'Storage region' });
  configs.push({ originalKey: `${prefix}_ACCESS_KEY_ID`, customKey: `${prefix}_ACCESS_KEY_ID`, value: '(fetched securely on link)', description: 'Access key ID' });
  configs.push({ originalKey: `${prefix}_SECRET_ACCESS_KEY`, customKey: `${prefix}_SECRET_ACCESS_KEY`, value: '(fetched securely on link)', description: 'Secret access key' });
  if (includeAwsVars && prefix !== 'AWS') {
    configs.push({ originalKey: 'AWS_ACCESS_KEY_ID', customKey: 'AWS_ACCESS_KEY_ID', value: '(fetched securely on link)', description: 'AWS SDK access key (optional)' });
    configs.push({ originalKey: 'AWS_SECRET_ACCESS_KEY', customKey: 'AWS_SECRET_ACCESS_KEY', value: '(fetched securely on link)', description: 'AWS SDK secret key (optional)' });
    configs.push({ originalKey: 'AWS_REGION', customKey: 'AWS_REGION', value: region, description: 'AWS SDK region (optional)' });
    configs.push({ originalKey: 'AWS_ENDPOINT_URL', customKey: 'AWS_ENDPOINT_URL', value: '(fetched securely on link)', description: 'AWS SDK endpoint (optional)' });
  }
  return configs;
}

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
  const [step, setStep] = useState<WizardStep>('choose-source');
  const [source, setSource] = useState<'existing' | 'create' | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<AvailableBucket | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newBucketName, setNewBucketName] = useState('');
  const [newBucketRegion, setNewBucketRegion] = useState('nyc3');
  const [newBucketAcl, setNewBucketAcl] = useState<'private' | 'public-read'>('private');
  const [newBucketCorsEnabled, setNewBucketCorsEnabled] = useState(false);
  const [newBucketVersioningEnabled, setNewBucketVersioningEnabled] = useState(false);
  const [createdBucketId, setCreatedBucketId] = useState<string | null>(null);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [envConfigs, setEnvConfigs] = useState<EnvVarConfig[]>([]);
  const [force, setForce] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [includeAwsVars, setIncludeAwsVars] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LinkStorageResponse | null>(null);

  const filteredBuckets = buckets.filter(bucket =>
    bucket.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bucket.region.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const resetWizard = useCallback(() => {
    setStep('choose-source'); setSource(null); setSelectedBucket(null); setSearchQuery('');
    setNewBucketName(''); setNewBucketRegion('nyc3'); setNewBucketAcl('private');
    setNewBucketCorsEnabled(false); setNewBucketVersioningEnabled(false); setCreatedBucketId(null);
    setIsCheckingName(false); setNameAvailable(null); setNameError(null);
    setEnvConfigs([]); setForce(false); setConflicts([]); setIncludeAwsVars(false);
    setIsCreating(false); setIsLinking(false); setError(null); setResult(null);
    if (nameCheckTimeoutRef.current) clearTimeout(nameCheckTimeoutRef.current);
  }, []);

  const validateBucketName = useCallback((name: string): string | null => {
    if (!name) return null;
    if (name.length < BUCKET_NAME_RULES.minLength) return `Must be at least ${BUCKET_NAME_RULES.minLength} characters`;
    if (name.length > BUCKET_NAME_RULES.maxLength) return `Must be at most ${BUCKET_NAME_RULES.maxLength} characters`;
    if (!BUCKET_NAME_RULES.pattern.test(name)) return BUCKET_NAME_RULES.description;
    if (name.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) return 'Cannot be formatted as an IP address';
    if (name.startsWith('xn--')) return 'Cannot start with "xn--"';
    if (name.endsWith('-s3alias')) return 'Cannot end with "-s3alias"';
    return null;
  }, []);

  const checkNameAvailability = useCallback(async (name: string) => {
    if (!name || name.length < BUCKET_NAME_RULES.minLength) { setNameAvailable(null); return; }
    const localError = validateBucketName(name);
    if (localError) { setNameError(localError); setNameAvailable(null); return; }
    setIsCheckingName(true);
    try {
      const res = await fetch(`/api/services/object-storage/check-bucket?name=${encodeURIComponent(name)}&region=${newBucketRegion}`);
      const data = await res.json();
      if (data.exists) { setNameAvailable(false); setNameError('Bucket name is already taken globally'); }
      else { setNameAvailable(true); setNameError(null); }
    } catch (err) {
      console.error('Error checking bucket name:', err);
      setNameAvailable(null); setNameError(null);
    } finally { setIsCheckingName(false); }
  }, [newBucketRegion, validateBucketName]);

  const handleBucketNameChange = useCallback((name: string) => {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setNewBucketName(cleanName); setNameAvailable(null);
    const localError = validateBucketName(cleanName);
    setNameError(localError);
    if (nameCheckTimeoutRef.current) clearTimeout(nameCheckTimeoutRef.current);
    if (!localError && cleanName.length >= BUCKET_NAME_RULES.minLength) {
      nameCheckTimeoutRef.current = setTimeout(() => checkNameAvailability(cleanName), 500);
    }
  }, [validateBucketName, checkNameAvailability]);

  useEffect(() => {
    return () => { if (nameCheckTimeoutRef.current) clearTimeout(nameCheckTimeoutRef.current); };
  }, []);

  const handleClose = () => {
    if (!isCreating && !isLinking) { onOpenChange(false); setTimeout(resetWizard, 300); }
  };

  const goNext = async () => {
    setError(null);
    switch (step) {
      case 'choose-source':
        if (source === 'existing') setStep('select-existing');
        else if (source === 'create') setStep('create-bucket');
        break;
      case 'select-existing':
        if (selectedBucket) {
          setEnvConfigs(generateDefaultStorageEnvConfigs(selectedBucket.name, selectedBucket.region, 'S3', includeAwsVars));
          setStep('configure-env');
        }
        break;
      case 'create-bucket':
        if (newBucketName && newBucketRegion) {
          const localError = validateBucketName(newBucketName);
          if (localError) { setNameError(localError); setError(localError); return; }
          if (nameAvailable === false) { setError('Bucket name is already taken. Please choose a different name.'); return; }
          await handleCreateBucket();
        }
        break;
      case 'configure-env':
        await handleLink();
        break;
    }
  };

  const goBack = () => {
    setError(null); setConflicts([]);
    switch (step) {
      case 'select-existing': case 'create-bucket': setStep('choose-source'); break;
      case 'configure-env': if (source === 'existing') setStep('select-existing'); break;
    }
  };

  const handleCreateBucket = async () => {
    if (!onCreateBucket) { setError('Bucket creation not available'); return; }
    setIsCreating(true); setError(null);
    try {
      const response = await onCreateBucket({ name: newBucketName, region: newBucketRegion, project_id: projectId, acl: newBucketAcl, cors_enabled: newBucketCorsEnabled, versioning_enabled: newBucketVersioningEnabled });
      if (response.success && response.bucket_id) {
        setCreatedBucketId(response.bucket_id);
        setEnvConfigs(generateDefaultStorageEnvConfigs(newBucketName, newBucketRegion, 'S3', includeAwsVars));
        setStep('configure-env');
      } else { setError(response.error || 'Failed to create bucket'); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Network error'); }
    finally { setIsCreating(false); }
  };

  const handleLink = async (forceLink = false) => {
    const bucketId = selectedBucket?.id || createdBucketId;
    if (!bucketId || envConfigs.length === 0) return;
    setIsLinking(true); setError(null);
    try {
      const response = await onLink(bucketId, envConfigs, forceLink || force, includeAwsVars);
      if (response.success) { setResult(response); setStep('success'); onSuccess(); }
      else if (response.code === 'ENV_VAR_CONFLICT' && response.conflicts) {
        setConflicts(response.conflicts); setError('Environment variable conflict detected');
      } else { setError(response.error || 'Failed to link bucket'); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Network error'); }
    finally { setIsLinking(false); }
  };

  const canProceed = () => {
    switch (step) {
      case 'choose-source': return source !== null;
      case 'select-existing': return selectedBucket !== null;
      case 'create-bucket': return newBucketName.length >= BUCKET_NAME_RULES.minLength && !!newBucketRegion && !nameError && nameAvailable !== false && !isCheckingName;
      case 'configure-env': return envConfigs.length > 0;
      default: return false;
    }
  };

  const stepTitles: Record<WizardStep, string> = {
    'choose-source': 'Link Object Storage', 'select-existing': 'Select Bucket',
    'create-bucket': 'Create New Bucket', 'configure-env': 'Configure Environment', 'success': 'Bucket Linked',
  };

  const getStepNumber = () => {
    switch (step) {
      case 'choose-source': return 1;
      case 'select-existing': case 'create-bucket': return 2;
      case 'configure-env': return 3;
      case 'success': return 3;
      default: return 1;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#0c0d11] border border-white/[0.08] rounded-[10px] text-white p-0 gap-0 overflow-hidden max-w-lg max-h-[90svh] flex flex-col [&_[data-slot=dialog-close]]:text-white/35 [&_[data-slot=dialog-close]]:hover:text-white/75 [&_[data-slot=dialog-close]]:hover:bg-white/[0.06]">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-5 border-b border-white/[0.06] flex-shrink-0 pr-14">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-7 w-7 rounded-[6px] bg-violet-500/[0.12] border border-violet-500/20 flex items-center justify-center flex-shrink-0">
              <Archive className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <DialogTitle className="text-[15px] font-semibold text-white tracking-[-0.01em]">
              {stepTitles[step]}
            </DialogTitle>
          </div>
          <DialogDescription className="text-[13px] text-white/45 leading-relaxed pl-[38px]">
            {step === 'choose-source' && <>Connect a bucket to <span className="text-white/70">{appName}</span> for automatic S3 credential injection</>}
            {step === 'select-existing' && 'Choose an existing bucket from your account'}
            {step === 'create-bucket' && 'Create a new S3-compatible bucket'}
            {step === 'configure-env' && 'Configure how credentials are injected into your app'}
            {step === 'success' && 'Your bucket has been linked successfully'}
          </DialogDescription>

          {step !== 'success' && (
            <div className="flex items-center gap-1.5 pt-3 pl-[38px]">
              {(['Source', 'Select', 'Configure'] as const).map((label, idx) => {
                const active = idx + 1 <= getStepNumber();
                return (
                  <div key={label} className="flex-1 flex flex-col gap-1">
                    <div className={`h-[2px] rounded-full transition-colors ${active ? 'bg-violet-500' : 'bg-white/[0.08]'}`} />
                    <span className={`${MONO} text-[9.5px] uppercase tracking-[0.10em] ${active ? 'text-violet-400/70' : 'text-white/20'}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 py-5 space-y-4">

            {/* Step 1: Choose Source */}
            {step === 'choose-source' && (
              <div className="space-y-2.5">
                {[
                  { value: 'existing' as const, icon: <Server className="h-4 w-4 text-violet-400" />, label: 'Use Existing Bucket', desc: 'Connect to a bucket you\'ve already created', count: buckets.length > 0 ? `${buckets.length} bucket${buckets.length !== 1 ? 's' : ''} available` : undefined },
                  { value: 'create' as const, icon: <Archive className="h-4 w-4 text-violet-400" />, label: 'Create New Bucket', desc: 'Provision a new S3-compatible bucket and link it', disabled: !onCreateBucket },
                ].map(({ value, icon, label, desc, count, disabled }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => !disabled && setSource(value)}
                    disabled={disabled}
                    className={`w-full p-4 rounded-[6px] border text-left transition-all ${
                      source === value
                        ? 'border-violet-400/30 bg-violet-500/[0.08]'
                        : 'border-white/[0.06] bg-[#0d0e11] hover:border-white/[0.12] hover:bg-white/[0.02]'
                    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 h-8 w-8 rounded-[6px] flex items-center justify-center flex-shrink-0 ${source === value ? 'bg-violet-500/[0.15]' : 'bg-white/[0.04]'}`}>
                        {icon}
                      </div>
                      <div className="flex-1">
                        <p className={`text-[13px] font-medium ${source === value ? 'text-violet-200' : 'text-white'}`}>{label}</p>
                        <p className={`${MONO} text-[11px] text-white/40 mt-0.5`}>{desc}</p>
                        {count && <p className={`${MONO} text-[10.5px] text-white/30 mt-1`}>{count}</p>}
                        {disabled && <p className={`${MONO} text-[10.5px] text-amber-400/70 mt-1`}>Coming soon</p>}
                      </div>
                      {source === value && <Check className="h-4 w-4 text-violet-400 flex-shrink-0 mt-0.5" />}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Step 2a: Select Existing Bucket */}
            {step === 'select-existing' && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
                  <input
                    placeholder="Search buckets…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`${MONO} w-full bg-[#0d0e11] border border-white/[0.08] text-white text-[12.5px] pl-9 pr-3 h-9 rounded-[6px] placeholder:text-white/20 focus:outline-none focus:border-violet-400/50 transition-colors`}
                  />
                </div>

                <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                  {loadingBuckets ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-white/35" />
                    </div>
                  ) : filteredBuckets.length === 0 ? (
                    <div className="flex flex-col items-center py-8 gap-2">
                      <Archive className="h-8 w-8 text-white/15" />
                      <p className={`${MONO} text-[12px] text-white/40`}>
                        {searchQuery ? 'No buckets match your search' : 'No buckets available'}
                      </p>
                      <p className={`${MONO} text-[10.5px] text-white/25`}>
                        {searchQuery ? 'Try a different term' : 'Create a bucket first or all buckets are already linked'}
                      </p>
                    </div>
                  ) : (
                    filteredBuckets.map((bucket) => (
                      <button
                        key={bucket.id}
                        type="button"
                        onClick={() => setSelectedBucket(bucket)}
                        className={`w-full px-3 py-2.5 rounded-[6px] border text-left flex items-center gap-3 transition-all ${
                          selectedBucket?.id === bucket.id
                            ? 'border-violet-400/30 bg-violet-500/[0.08]'
                            : 'border-white/[0.06] bg-[#0d0e11] hover:border-white/[0.12]'
                        }`}
                      >
                        <div className="h-8 w-8 rounded-[5px] bg-[#111216] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                          <Archive className="h-3.5 w-3.5 text-white/40" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-white truncate">{bucket.name}</p>
                          <p className={`${MONO} text-[10.5px] text-white/40`}>{bucket.region}</p>
                        </div>
                        {selectedBucket?.id === bucket.id ? (
                          <Check className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-white/20 flex-shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Step 2b: Create New Bucket */}
            {step === 'create-bucket' && (
              <div className="space-y-4">
                {/* Bucket Name */}
                <div className="space-y-1.5">
                  <label className={`${MONO} text-[11.5px] text-white/55`}>Bucket name</label>
                  <div className="relative">
                    <input
                      value={newBucketName}
                      onChange={(e) => handleBucketNameChange(e.target.value)}
                      placeholder="my-app-bucket"
                      className={`${MONO} w-full bg-[#0d0e11] border text-white text-[13px] px-3 pr-9 h-10 rounded-[6px] placeholder:text-white/20 focus:outline-none transition-colors ${
                        nameError ? 'border-rose-500/40 focus:border-rose-500/60' :
                        nameAvailable === true ? 'border-emerald-500/40 focus:border-emerald-500/60' :
                        'border-white/[0.08] focus:border-violet-400/50'
                      }`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isCheckingName && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/30" />}
                      {!isCheckingName && nameAvailable === true && <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
                      {!isCheckingName && nameAvailable === false && <XCircle className="h-3.5 w-3.5 text-rose-400" />}
                    </div>
                  </div>
                  {nameError ? (
                    <p className={`${MONO} text-[10.5px] text-rose-400`}>{nameError}</p>
                  ) : nameAvailable === true ? (
                    <p className={`${MONO} text-[10.5px] text-emerald-400`}>Bucket name is available</p>
                  ) : (
                    <p className={`${MONO} text-[10.5px] text-white/30`}>Lowercase letters, numbers, and hyphens only. Must be globally unique.</p>
                  )}
                </div>

                {/* Region */}
                <div className="space-y-2">
                  <label className={`${MONO} text-[11.5px] text-white/55`}>Location</label>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {STORAGE_REGIONS.map((region) => (
                      <button
                        key={region.id}
                        type="button"
                        onClick={() => region.available && setNewBucketRegion(region.short)}
                        disabled={!region.available}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[6px] border text-left transition-all ${
                          newBucketRegion === region.short
                            ? 'border-violet-400/30 bg-violet-500/[0.08]'
                            : 'border-white/[0.06] bg-[#0d0e11] hover:border-white/[0.12]'
                        } ${!region.available ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <Image
                          src={`https://flagsapi.com/${region.country_code}/flat/64.png`}
                          alt={region.city}
                          width={20}
                          height={15}
                          className="rounded-[2px] flex-shrink-0"
                          unoptimized
                        />
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-white truncate">{region.city}</p>
                          <p className={`${MONO} text-[10px] text-white/35 truncate`}>{region.short}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ACL */}
                <div className="space-y-2">
                  <label className={`${MONO} text-[11.5px] text-white/55 flex items-center gap-1.5`}>
                    {newBucketAcl === 'private' ? <Lock className="h-3 w-3 text-emerald-400" /> : <Unlock className="h-3 w-3 text-[#0095FF]" />}
                    Access Control
                  </label>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {([
                      { value: 'private' as const, icon: <Lock className="h-3.5 w-3.5" />, label: 'Private', desc: 'Secure, API access only', color: 'emerald' },
                      { value: 'public-read' as const, icon: <Unlock className="h-3.5 w-3.5" />, label: 'Public Read', desc: 'Anyone can read files', color: 'blue' },
                    ]).map(({ value, icon, label, desc, color }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setNewBucketAcl(value)}
                        className={`min-h-[76px] px-3 py-2.5 rounded-[6px] border text-left transition-all ${
                          newBucketAcl === value
                            ? color === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/[0.08]' : 'border-[#0095FF]/30 bg-[#0095FF]/[0.08]'
                            : 'border-white/[0.06] bg-[#0d0e11] hover:border-white/[0.12]'
                        }`}
                      >
                        <div className={`flex items-center gap-1.5 mb-1 ${newBucketAcl === value ? (color === 'emerald' ? 'text-emerald-400' : 'text-[#0095FF]') : 'text-white/45'}`}>
                          {icon}
                          <span className="text-[12px] font-medium text-white">{label}</span>
                        </div>
                        <p className={`${MONO} text-[10.5px] text-white/35`}>{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Settings */}
                <div className="border border-white/[0.06] bg-[#0d0e11] rounded-[6px] overflow-hidden divide-y divide-white/[0.04]">
                  <div className={`${MONO} flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-[0.10em] text-white/35`}>
                    <Info className="h-3 w-3" />
                    Optional Settings
                  </div>
                  {[
                    { icon: <Globe className="h-3.5 w-3.5 text-[#0095FF]" />, label: 'CORS', desc: 'Allow cross-origin requests', checked: newBucketCorsEnabled, onChange: setNewBucketCorsEnabled },
                    { icon: <HardDrive className="h-3.5 w-3.5 text-violet-400" />, label: 'Versioning', desc: 'Keep multiple versions of objects', checked: newBucketVersioningEnabled, onChange: setNewBucketVersioningEnabled },
                  ].map(({ icon, label, desc, checked, onChange }) => (
                    <label key={label} className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {icon}
                        <div className="min-w-0">
                          <p className="text-[12.5px] text-white/70">{label}</p>
                          <p className={`${MONO} text-[10.5px] text-white/35`}>{desc}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        onClick={() => onChange(!checked)}
                        className={`relative h-5 w-9 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-violet-500' : 'bg-white/[0.10]'}`}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Configure Environment */}
            {step === 'configure-env' && (
              <div className="space-y-4">
                {/* Selected bucket info */}
                <div className="flex items-center gap-3 px-3 py-3 border border-white/[0.06] bg-[#0d0e11] rounded-[6px]">
                  <div className="h-8 w-8 rounded-[5px] bg-[#111216] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <Archive className="h-3.5 w-3.5 text-white/40" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-white truncate">{selectedBucket?.name || newBucketName}</p>
                    <p className={`${MONO} text-[10.5px] text-white/40`}>{selectedBucket?.region || newBucketRegion}</p>
                  </div>
                </div>

                {/* AWS vars toggle */}
                <label className="flex items-center justify-between gap-3 px-3 py-3 border border-white/[0.06] bg-[#0d0e11] rounded-[6px] cursor-pointer">
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-white/70">Include AWS SDK Variables</p>
                    <p className={`${MONO} text-[10.5px] text-white/35 mt-0.5`}>
                      Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, etc.
                    </p>
                    <p className={`${MONO} text-[10px] text-amber-400/60 mt-0.5`}>
                      Only enable for single bucket apps to avoid conflicts
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeAwsVars}
                    disabled={isLinking}
                    onClick={() => {
                      const next = !includeAwsVars;
                      setIncludeAwsVars(next);
                      const bucketName = selectedBucket?.name || newBucketName;
                      const bucketRegion = selectedBucket?.region || newBucketRegion;
                      setEnvConfigs(generateDefaultStorageEnvConfigs(bucketName, bucketRegion, 'S3', next));
                    }}
                    className={`relative h-5 w-9 rounded-full transition-colors flex-shrink-0 ml-4 ${includeAwsVars ? 'bg-violet-500' : 'bg-white/[0.10]'} disabled:opacity-40`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${includeAwsVars ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </label>

                <EnvConfigStep
                  envVarConfigs={envConfigs}
                  onChange={setEnvConfigs}
                  conflicts={conflicts}
                  onResolveConflicts={() => setForce(true)}
                  disabled={isLinking}
                />
              </div>
            )}

            {/* Success */}
            {step === 'success' && result && (
              <div className="flex flex-col items-center py-6 gap-4 text-center">
                <div className="h-10 w-10 rounded-full bg-emerald-500/[0.12] border border-emerald-500/20 flex items-center justify-center">
                  <Check className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-white">Bucket Linked!</p>
                  <p className={`${MONO} text-[12px] text-white/40 mt-1`}>
                    {result.injected_vars?.length || 0} environment variables injected
                  </p>
                  {result.redeploy_triggered && (
                    <p className={`${MONO} text-[11px] text-emerald-400 mt-1`}>App restart triggered to apply changes</p>
                  )}
                </div>
                {result.injected_vars && result.injected_vars.length > 0 && (
                  <div className="w-full border border-white/[0.06] bg-[#0d0e11] rounded-[6px] divide-y divide-white/[0.04] overflow-hidden max-h-[150px] overflow-y-auto">
                    {result.injected_vars.map((key) => (
                      <div key={key} className={`${MONO} break-all px-3 py-1.5 text-[11px] text-emerald-300/70`}>{key}</div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="h-9 px-6 rounded-[5px] text-[13px] font-medium text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {/* Error */}
            {error && !conflicts.length && step !== 'success' && (
              <div className={`${MONO} flex items-start gap-2 px-3 py-2.5 border border-rose-500/20 bg-rose-500/[0.05] rounded-[6px]`}>
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-rose-300">{error}</p>
              </div>
            )}

          </div>
        </div>
        {step !== 'success' && (
          <div className="px-6 pb-6 pt-4 border-t border-white/[0.06] flex-shrink-0 flex flex-wrap items-center justify-between gap-2">
            {step !== 'choose-source' && (source === 'existing' || step !== 'configure-env') ? (
              <button
                type="button"
                onClick={goBack}
                disabled={isCreating || isLinking}
                className="h-9 px-4 rounded-[5px] text-[13px] font-medium text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            ) : step === 'choose-source' ? (
              <button
                type="button"
                onClick={handleClose}
                disabled={isCreating || isLinking}
                className="h-9 px-4 rounded-[5px] text-[13px] font-medium text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            ) : (
              <div />
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {conflicts.length > 0 && !force && (
                <button
                  type="button"
                  onClick={() => handleLink(true)}
                  disabled={isLinking}
                  className="inline-flex h-9 items-center gap-2 rounded-[5px] border border-amber-400/25 bg-[#0d0e11] px-4 text-[13px] font-medium text-amber-300 transition-colors hover:bg-amber-500/[0.10] disabled:opacity-40"
                >
                  {isLinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Force Link
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
                  <>Link Bucket <ArrowRight className="h-3.5 w-3.5" /></>
                ) : (
                  <>Continue <ArrowRight className="h-3.5 w-3.5" /></>
                )}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
