"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProfileRequest {
  id: string;
  status: "pending" | "approved" | "rejected" | "applied";
  reason: string;
  user_id: string;
  user_email: string | null;
  requested_cpu: string | null;
  requested_memory: string | null;
  requested_replicas: number | null;
  approved_spec: Record<string, unknown> | null;
  approved_hourly_rate: number | null;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  app: { id: string; name: string; size: string; status: string; framework: string; user_id: string } | null;
}

const STATUS_FILTER = ["pending", "approved", "applied", "rejected", "all"] as const;

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-500/15 text-amber-400 border border-amber-500/25">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
  if (status === "approved" || status === "applied") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-500/15 text-green-400 border border-green-500/25">
      <CheckCircle className="w-3 h-3" /> {status === "applied" ? "Applied" : "Approved"}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-500/15 text-red-400 border border-red-500/25">
      <XCircle className="w-3 h-3" /> Rejected
    </span>
  );
}

function ApproveForm({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const [spec, setSpec] = useState({
    cpuRequest: "", cpuLimit: "", memoryRequest: "", memoryLimit: "",
    replicas: "1",
  });
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      const custom_spec: Record<string, unknown> = {
        cpuRequest: spec.cpuRequest,
        cpuLimit: spec.cpuLimit,
        memoryRequest: spec.memoryRequest,
        memoryLimit: spec.memoryLimit,
        replicas: parseInt(spec.replicas, 10),
      };
      const res = await fetch(`/api/admin/platform-apps/custom-profile-requests/${requestId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_spec, hourly_rate: parseFloat(rate), admin_notes: notes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to approve"); return; }
      onDone();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const field = (label: string, key: keyof typeof spec, placeholder: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-neutral-400">{label}</label>
      <input
        className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500"
        placeholder={placeholder}
        value={spec[key]}
        onChange={e => setSpec(s => ({ ...s, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="mt-3 border border-neutral-700 rounded-lg p-4 bg-neutral-900/60 space-y-3">
      <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Approve with spec</p>
      <div className="grid grid-cols-2 gap-3">
        {field("CPU Request", "cpuRequest", "e.g. 4 or 4000m")}
        {field("CPU Limit", "cpuLimit", "e.g. 8 or 8000m")}
        {field("Memory Request", "memoryRequest", "e.g. 8Gi")}
        {field("Memory Limit", "memoryLimit", "e.g. 16Gi")}
        {field("Replicas", "replicas", "e.g. 4")}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-400">Hourly rate ($/hr)</label>
        <input
          className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white placeholder:text-neutral-500 w-40 focus:outline-none focus:border-neutral-500"
          placeholder="e.g. 0.541"
          value={rate}
          onChange={e => setRate(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-400">Message to user (optional)</label>
        <textarea
          className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white placeholder:text-neutral-500 resize-none focus:outline-none focus:border-neutral-500"
          rows={2}
          placeholder="Explain the approved profile or next steps..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={loading || !spec.cpuRequest || !spec.memoryRequest || !rate}
          className="bg-green-700 hover:bg-green-800 text-white rounded"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
          Approve
        </Button>
      </div>
    </div>
  );
}

function RejectForm({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReject = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/platform-apps/custom-profile-requests/${requestId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_notes: notes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to reject"); return; }
      onDone();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 border border-neutral-700 rounded-lg p-4 bg-neutral-900/60 space-y-3">
      <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Reject request</p>
      <textarea
        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white placeholder:text-neutral-500 resize-none focus:outline-none focus:border-neutral-500"
        rows={2}
        placeholder="Reason for rejection (shown to user)..."
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <Button
        size="sm"
        variant="destructive"
        onClick={handleReject}
        disabled={loading}
        className="rounded"
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
        Reject
      </Button>
    </div>
  );
}

function RequestRow({ request, onRefresh }: { request: ProfileRequest; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);

  const handleDone = () => { setAction(null); setExpanded(false); onRefresh(); };

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-start justify-between gap-4 px-4 py-3 text-left hover:bg-neutral-800/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={request.status} />
            <span className="text-sm font-medium text-white">{request.app?.name ?? "Unknown app"}</span>
            <span className="text-xs text-neutral-500">{request.user_email ?? request.app?.user_id}</span>
            <span className="text-xs text-neutral-600">{new Date(request.created_at).toLocaleDateString()}</span>
          </div>
          <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{request.reason}</p>
          {(request.requested_cpu || request.requested_memory || request.requested_replicas) && (
            <div className="flex gap-3 mt-1 text-xs text-neutral-500">
              {request.requested_cpu && <span>CPU: {request.requested_cpu}</span>}
              {request.requested_memory && <span>Mem: {request.requested_memory}</span>}
              {request.requested_replicas && <span>Replicas: {request.requested_replicas}</span>}
            </div>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-neutral-800 pt-3 space-y-3">
          <div className="text-sm text-neutral-300">
            <span className="text-neutral-500">App:</span>{" "}
            {request.app?.name} · {request.app?.framework} · {request.app?.size} · {request.app?.status}
          </div>
          {request.approved_spec && (
            <div className="text-xs text-neutral-400 bg-neutral-800/50 rounded p-2">
              <span className="text-neutral-500">Approved spec:</span>{" "}
              {JSON.stringify(request.approved_spec)} @ ${request.approved_hourly_rate}/hr
            </div>
          )}
          {request.admin_notes && (
            <p className="text-xs text-neutral-400 italic">Admin notes: {request.admin_notes}</p>
          )}

          {request.status === "pending" && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="rounded border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                onClick={() => setAction(a => a === "approve" ? null : "approve")}>
                <CheckCircle className="w-3 h-3 mr-1 text-green-400" /> Approve
              </Button>
              <Button size="sm" variant="outline" className="rounded border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                onClick={() => setAction(a => a === "reject" ? null : "reject")}>
                <XCircle className="w-3 h-3 mr-1 text-red-400" /> Reject
              </Button>
            </div>
          )}

          {action === "approve" && <ApproveForm requestId={request.id} onDone={handleDone} />}
          {action === "reject" && <RejectForm requestId={request.id} onDone={handleDone} />}
        </div>
      )}
    </div>
  );
}

export default function CustomProfileRequestsTab() {
  const [requests, setRequests] = useState<ProfileRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<typeof STATUS_FILTER[number]>("pending");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/platform-apps/custom-profile-requests?status=${statusFilter}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load"); return; }
      setRequests(data.requests ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Custom Profile Requests</h2>
        <div className="flex gap-1">
          {STATUS_FILTER.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors capitalize ${
                statusFilter === s
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
        </div>
      )}

      {error && (
        <div className="border border-red-500/30 bg-red-500/10 rounded p-3 text-sm text-red-400">{error}</div>
      )}

      {!loading && !error && requests.length === 0 && (
        <div className="text-center py-10 text-neutral-500 text-sm">
          No {statusFilter === "all" ? "" : statusFilter} custom profile requests.
        </div>
      )}

      {!loading && requests.map(r => (
        <RequestRow key={r.id} request={r} onRefresh={load} />
      ))}
    </div>
  );
}
