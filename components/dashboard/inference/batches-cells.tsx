"use client";

/**
 * Leaf presentational components extracted from batches.tsx. Each is
 * purely render-based with no cross-component state — extracting them
 * keeps the main file focused on flow logic instead of cell chrome.
 */

import { Download } from "lucide-react";

import { Label } from "@/components/ui/label";
import { MONO } from "@/components/dashboard/inference/chrome";
import type { BatchListItem } from "@/components/dashboard/inference/batches";

export function ExpandedRow({
  batch,
  onDownloadInput,
  onDownloadOutput,
  onDownloadErrors,
}: {
  batch: BatchListItem;
  onDownloadInput: () => void;
  onDownloadOutput?: () => void;
  onDownloadErrors?: () => void;
}) {
  return (
    <div className="px-5 py-4 border-b border-white/[0.04] bg-[#0e0f13]">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DetailGroup label="Counts">
          <DetailLine k="Total" v={batch.counts.total.toLocaleString()} />
          <DetailLine k="Completed" v={batch.counts.completed.toLocaleString()} />
          <DetailLine k="Failed" v={batch.counts.failed.toLocaleString()} />
        </DetailGroup>
        <DetailGroup label="Timing">
          <DetailLine k="Created" v={new Date(batch.created_at).toLocaleString()} />
          {batch.completed_at && (
            <DetailLine k="Completed" v={new Date(batch.completed_at).toLocaleString()} />
          )}
          {batch.failed_at && (
            <DetailLine k="Failed" v={new Date(batch.failed_at).toLocaleString()} />
          )}
          {batch.cancelled_at && (
            <DetailLine k="Cancelled" v={new Date(batch.cancelled_at).toLocaleString()} />
          )}
          <DetailLine k="Expires" v={new Date(batch.expires_at).toLocaleString()} />
        </DetailGroup>
        <DetailGroup label="Files">
          <FileRow label="Input" fileId={batch.input_file_id} onDownload={onDownloadInput} />
          {batch.output_file_id ? (
            <FileRow label="Output" fileId={batch.output_file_id} onDownload={onDownloadOutput} />
          ) : (
            <p className={`${MONO} text-[10.5px] text-white/35`}>Output: pending</p>
          )}
          {batch.error_file_id ? (
            <FileRow label="Errors" fileId={batch.error_file_id} onDownload={onDownloadErrors} />
          ) : null}
        </DetailGroup>
      </div>
    </div>
  );
}

export function DetailGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] font-semibold text-white/45 mb-2`}>
        {label}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export function DetailLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`${MONO} text-[10.5px] text-white/45`}>{k}</span>
      <span className={`${MONO} text-[11px] text-white/85 tabular-nums truncate`}>{v}</span>
    </div>
  );
}

export function FileRow({
  label,
  fileId,
  onDownload,
}: {
  label: string;
  fileId: string;
  onDownload?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <span className={`${MONO} text-[10.5px] text-white/45 block`}>{label}</span>
        <code className={`${MONO} text-[10.5px] text-white/75 truncate block`}>{fileId}</code>
      </div>
      {onDownload && (
        <button
          type="button"
          onClick={onDownload}
          className={`${MONO} h-7 px-2 text-[10px] uppercase tracking-[0.12em] font-semibold text-white/70 hover:text-white inline-flex items-center gap-1 rounded border border-white/[0.08] hover:bg-white/[0.06] transition-colors shrink-0`}
        >
          <Download className="h-3 w-3" />
          Download
        </button>
      )}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className={`${MONO} block mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
        {label}
      </Label>
      {children}
    </div>
  );
}
