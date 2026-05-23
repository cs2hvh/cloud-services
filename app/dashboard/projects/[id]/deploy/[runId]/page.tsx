'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter, useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

type StepStatus = 'pending' | 'running' | 'success' | 'failed';
type OperationStatus = 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled' | 'rolled_back' | null;

type Step = {
  stage: string;
  status: StepStatus;
  progressPct: number;
  message: string;
  serviceName?: string;
};

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'success') return <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />;
  if (status === 'failed')  return <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
  if (status === 'running') return <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />;
  return <div className="w-4 h-4 rounded-full border border-white/20 flex-shrink-0" />;
}

function stepLabel(stage: string): string {
  return stage
    .replace(/_/g, ' ')
    .replace(/\b(\w)/g, c => c.toUpperCase());
}

export default function DeployProgressPage() {
  const { id: instanceId, runId } = useParams<{ id: string; runId: string }>();
  const router = useRouter();

  const [steps, setSteps]         = useState<Step[]>([]);
  const [progress, setProgress]   = useState(0);
  const [done, setDone]           = useState(false);
  const [failed, setFailed]       = useState(false);
  const [templateSlug, setTemplateSlug] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<OperationStatus>(null);
  const [liveUrl, setLiveUrl]     = useState<string | null>(null);
  const esRef        = useRef<EventSource | null>(null);
  const doneRef      = useRef(false);
  const retryDelay   = useRef(1000);
  const retryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openStream = useCallback(() => {
    if (doneRef.current) return;

    const es = new EventSource(`/api/templates/deploy/${runId}/events`);
    esRef.current = es;

    es.onmessage = (e) => {
      const event: Step = JSON.parse(e.data);
      retryDelay.current = 1000; // reset backoff on successful message

      setSteps(prev => {
        const idx = prev.findIndex(s => s.stage === event.stage);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = event;
          return next;
        }
        return [...prev, event];
      });

      // Only advance progress — never go backwards (guards against out-of-order events)
      setProgress(prev => Math.max(prev, event.progressPct));
      if (event.status === 'running') setOperationStatus('running');

      if (event.status === 'success' && event.progressPct === 100) {
        doneRef.current = true;
        setOperationStatus('succeeded');
        setDone(true);
        es.close();
        fetch(`/api/instances/${instanceId}`)
          .then(r => r.json())
          .then(d => {
            const webSvc = d.instance?.services?.find(
              (s: { type: string; networking?: { publicUrl?: string } }) =>
                s.type === 'web' && s.networking?.publicUrl,
            );
            if (webSvc?.networking?.publicUrl) setLiveUrl(webSvc.networking.publicUrl);
          })
          .catch(() => {});
      }

      if (event.status === 'failed') {
        doneRef.current = true;
        setOperationStatus('failed');
        setFailed(true);
        es.close();
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (doneRef.current) return;

      // Poll REST for current status in case the stream died mid-deployment
      fetch(`/api/templates/deploy/${runId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const status = data?.operation?.status as OperationStatus;
          if (status) setOperationStatus(status);
          if (data?.operation?.progress_pct != null) {
            setProgress(prev => Math.max(prev, data.operation.progress_pct));
          }
          if (status === 'succeeded') { doneRef.current = true; setDone(true); return; }
          if (status === 'failed' || status === 'cancelled' || status === 'rolled_back') {
            doneRef.current = true; setFailed(true); return;
          }
          // Not terminal — reconnect with exponential backoff (max 30 s)
          retryTimeout.current = setTimeout(() => {
            retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
            openStream();
          }, retryDelay.current);
        })
        .catch(() => {
          if (doneRef.current) return;
          retryTimeout.current = setTimeout(() => {
            retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
            openStream();
          }, retryDelay.current);
        });
    };
  }, [runId, instanceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Load initial status + template slug (for "Try Again" navigation)
    fetch(`/api/templates/deploy/${runId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const status = data?.operation?.status as OperationStatus;
        setOperationStatus(status ?? null);
        setProgress(data?.operation?.progress_pct ?? 0);
        setTemplateSlug(data?.templateSlug ?? null);
        if (status === 'succeeded') { doneRef.current = true; setDone(true); }
        if (status === 'failed' || status === 'cancelled' || status === 'rolled_back') {
          doneRef.current = true; setFailed(true);
        }
      })
      .catch(() => {});

    openStream();

    return () => {
      doneRef.current = true;
      esRef.current?.close();
      if (retryTimeout.current) clearTimeout(retryTimeout.current);
    };
  }, [runId, openStream]);

  return (
    <div className="flex-1 bg-black min-h-screen p-4 sm:p-6 lg:p-8 text-white">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto"
      >
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            {done && !failed && <CheckCircle2 className="w-6 h-6 text-green-400" />}
            {failed && <XCircle className="w-6 h-6 text-red-400" />}
            {!done && !failed && <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />}
            <h1 className="text-xl sm:text-2xl font-bold">
              {done && !failed
                ? 'Deployment complete'
                : failed
                  ? 'Deployment failed'
                  : operationStatus === 'queued'
                    ? 'Deployment queued'
                    : 'Deploying…'}
            </h1>
          </div>

          {/* Progress bar */}
          <Progress value={progress} className="h-1.5 bg-white/10" />
          <p className="text-white/40 text-xs mt-1.5">{progress}% complete</p>
        </div>

        {/* Steps */}
        <div className="space-y-1 mb-8">
          <AnimatePresence initial={false}>
            {steps.map((step) => (
              <motion.div
                key={step.stage}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex items-start gap-3 px-4 py-3 rounded-lg transition-colors ${
                  step.status === 'running'
                    ? 'bg-blue-500/10 border border-blue-500/20'
                    : step.status === 'failed'
                    ? 'bg-red-500/10 border border-red-500/20'
                    : step.status === 'success'
                    ? 'bg-white/3'
                    : 'bg-transparent'
                }`}
              >
                <StepIcon status={step.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${
                      step.status === 'running' ? 'text-white' :
                      step.status === 'success' ? 'text-white/70' :
                      step.status === 'failed'  ? 'text-red-300' : 'text-white/40'
                    }`}>
                      {stepLabel(step.stage)}
                    </span>
                    {step.serviceName && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-white/10 rounded text-white/50">
                        {step.serviceName}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 ${
                    step.status === 'failed' ? 'text-red-400' : 'text-white/40'
                  }`}>
                    {step.message}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Success CTA */}
        {done && !failed && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
            >
              <div className="flex-1">
                <p className="font-semibold text-green-300 text-sm">Your project is live</p>
                {liveUrl && (
                  <a
                    href={liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-white/60 hover:text-white flex items-center gap-1 mt-0.5"
                  >
                    {liveUrl} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {liveUrl && (
                  <Button size="sm" asChild className="bg-green-500 hover:bg-green-400 text-black">
                    <a href={liveUrl} target="_blank" rel="noreferrer">Open App</a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                  onClick={() => router.push(`/dashboard/projects/${instanceId}`)}
                >
                  View Project
                </Button>
              </div>
            </motion.div>

            {/* Service suggestions */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="border border-white/8 rounded-xl p-5"
            >
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Add to your project</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    engine: 'postgres',
                    label: 'PostgreSQL',
                    description: 'SQL database',
                    colorText: 'text-indigo-300',
                    colorBg: 'bg-indigo-500/10 hover:bg-indigo-500/20',
                    colorBorder: 'border-indigo-500/20 hover:border-indigo-500/40',
                  },
                  {
                    engine: 'redis',
                    label: 'Redis',
                    description: 'Cache & sessions',
                    colorText: 'text-red-300',
                    colorBg: 'bg-red-500/10 hover:bg-red-500/20',
                    colorBorder: 'border-red-500/20 hover:border-red-500/40',
                  },
                  {
                    engine: 'rabbitmq',
                    label: 'RabbitMQ',
                    description: 'Message queue',
                    colorText: 'text-orange-300',
                    colorBg: 'bg-orange-500/10 hover:bg-orange-500/20',
                    colorBorder: 'border-orange-500/20 hover:border-orange-500/40',
                  },
                ].map(svc => (
                  <button
                    key={svc.engine}
                    onClick={() => router.push(`/dashboard/projects/${instanceId}?add=${svc.engine}`)}
                    className={`flex flex-col items-start p-3 rounded-lg border transition-all text-left ${svc.colorBg} ${svc.colorBorder}`}
                  >
                    <span className={`text-xs font-semibold ${svc.colorText}`}>{svc.label}</span>
                    <span className="text-[10px] text-white/35 mt-0.5">{svc.description}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-white/20 mt-3">
                More options available in the project canvas.
              </p>
            </motion.div>
          </>
        )}

        {/* Failure CTA */}
        {failed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 flex items-center gap-4"
          >
            <div className="flex-1">
              <p className="font-semibold text-red-300 text-sm">Deployment failed</p>
              <p className="text-xs text-white/40 mt-0.5">Check the steps above for the error. You can re-deploy from the template page.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10 flex-shrink-0"
              onClick={() =>
                router.push(
                  templateSlug
                    ? `/dashboard/templates/${templateSlug}`
                    : '/dashboard/templates',
                )
              }
            >
              <RefreshCw className="w-3 h-3 mr-1.5" /> Try Again
            </Button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
