"use client";

/**
 * Per-capability kill switches.
 *
 * The highest-consequence control in the admin — turning inference off stops
 * every customer request on the platform — so the UI is deliberately slower than
 * a toggle: turning something OFF requires a typed reason and an explicit
 * confirmation that names what will stop. Turning it back ON is one click,
 * because recovery should never be the friction-heavy direction.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Power, PowerOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import api from "@/lib/axios/axios";
import type { FeatureSwitchSpec } from "@/lib/admin/feature-switches";

type SwitchRow = FeatureSwitchSpec & { enabled: boolean };

interface Payload {
  switches: SwitchRow[];
  summary: { total: number; disabled: number };
  note: string;
}

export default function FeatureSwitchesPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<SwitchRow | null>(null);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/inference/switches");
      setData(res.data);
    } catch {
      toast.error("Failed to load capability switches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flip = async (row: SwitchRow, enabled: boolean, why: string | null) => {
    setWorking(row.key);
    try {
      const res = await api.put("/admin/inference/switches", { key: row.key, enabled, reason: why });
      toast[enabled ? "success" : "warning"](res.data.note ?? "Saved", { duration: 8_000 });
      setPending(null);
      setReason("");
      await load();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Could not save the switch";
      toast.error(message);
    } finally {
      setWorking(null);
    }
  };

  if (loading && !data) return <Skeleton className="h-48 w-full rounded-2xl bg-white/5" />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-white">Capability switches</h2>
        <p className="mt-0.5 text-sm text-neutral-400">
          {data.summary.disabled === 0
            ? "Everything is serving customers."
            : `${data.summary.disabled} capability(ies) are currently OFF.`}{" "}
          {data.note}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {data.switches.map((row) => (
          <div
            key={row.key}
            className={cn(
              "rounded-2xl border p-4 backdrop-blur-xl",
              row.enabled ? "border-white/10 bg-black/40" : "border-red-500/30 bg-red-500/10"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {row.enabled ? (
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <PowerOff className="h-4 w-4 shrink-0 text-red-400" />
                  )}
                  <p className="font-medium text-white">{row.label}</p>
                  {!row.enabled && (
                    <span className="rounded-full border border-red-500/30 bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-200">
                      OFF
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-neutral-400">{row.effect}</p>
                <p className="mt-1.5 font-mono text-[11px] text-neutral-600">{row.enforced_in}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={working === row.key}
                className={cn(
                  "h-8 shrink-0 border-white/10 text-xs",
                  row.enabled ? "text-red-300 hover:text-red-200" : "text-emerald-300 hover:text-emerald-200"
                )}
                onClick={() => {
                  // Turning ON is one click; turning OFF asks why.
                  if (row.enabled) setPending(row);
                  else void flip(row, true, null);
                }}
              >
                {working === row.key ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : row.enabled ? (
                  <PowerOff className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Power className="mr-1.5 h-3.5 w-3.5" />
                )}
                {row.enabled ? "Turn off" : "Turn on"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
            setReason("");
          }
        }}
      >
        <AlertDialogContent className="border-white/10 bg-neutral-950">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-300">
              <AlertTriangle className="h-4 w-4" />
              Turn off {pending?.label}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-neutral-300">
                <p>{pending?.effect}</p>
                <p className="text-xs text-neutral-500">
                  Edge locations pick this up within about 30 seconds, and each serves one more
                  request while it refreshes — so expect a handful to get through. Requests refused
                  while it is off are not charged.
                </p>
                <Input
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why are you turning this off? (recorded in the audit log)"
                  className="border-white/10 bg-black/40"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent">Back</AlertDialogCancel>
            <AlertDialogAction
              // A reason is required: a switch found off six weeks later with no
              // explanation is how an outage gets prolonged by someone afraid to
              // turn it back on.
              disabled={reason.trim().length < 3 || working !== null}
              className="bg-red-600 hover:bg-red-500"
              onClick={(e) => {
                e.preventDefault();
                if (pending) void flip(pending, false, reason.trim());
              }}
            >
              {working ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PowerOff className="mr-1.5 h-3.5 w-3.5" />}
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
