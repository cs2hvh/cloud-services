"use client";
import Image from "next/image";
import { Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { GitProvider } from "./new-types";

interface Props {
  gitProviders: GitProvider[];
  loadingProviders: boolean;
  selectedProvider: string;
  onSelectProvider: (id: string) => void;
  isLoading: boolean;
  connectingProvider: string | null;
  connectionError: { provider: string; message: string } | null;
  onConnect: (id: string) => void;
  onRefresh: () => void;
  onNext: () => void;
}

export function StepProvider({
  gitProviders, loadingProviders, selectedProvider, onSelectProvider,
  isLoading, connectingProvider, connectionError, onConnect, onRefresh, onNext,
}: Props) {
  return (
    <Card className="glass-panel overflow-hidden">
      <CardHeader className="border-b border-white/[0.06] px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Step 1</p>
        <CardTitle className="mt-1 text-lg font-semibold text-white">Select Git Provider</CardTitle>
        <p className="mt-1 text-sm text-white/48">Connect an approved Git provider to access repositories for deployment.</p>
      </CardHeader>
      <CardContent className="px-6 py-6">
        {loadingProviders ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
            <p className="text-sm text-white/55">Checking connected providers...</p>
          </div>
        ) : (
          <RadioGroup value={selectedProvider} onValueChange={onSelectProvider} className="space-y-3">
            {gitProviders.map((provider) => (
              <div key={provider.id}>
                <RadioGroupItem value={provider.id} id={provider.id} className="peer sr-only" disabled={!provider.connected} />
                <Label
                  htmlFor={provider.id}
                  className="flex items-center gap-4 rounded-lg border-2 border-transparent bg-white/[0.06] p-4 transition-all cursor-pointer hover:bg-white/[0.09] peer-data-[state=checked]:border-blue-500/60 peer-data-[state=checked]:bg-blue-500/10 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                >
                  <div className="flex items-center gap-3 shrink-0">
                    <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors ${selectedProvider === provider.id ? "border-blue-500 bg-blue-500" : "border-white/30"}`}>
                      {selectedProvider === provider.id && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                    <Image src={provider.icon} alt={provider.name} width={28} height={28} className="rounded" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white">{provider.name}</div>
                    <div className="mt-0.5 text-sm text-white/55">
                      {provider.connected
                        ? `Connected${provider.username ? ` — @${provider.username}` : ""}`
                        : "Not connected"}
                    </div>
                  </div>
                  {provider.connected ? (
                    <Badge className="shrink-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/25">Connected</Badge>
                  ) : (
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onConnect(provider.id); }}
                        size="sm"
                        disabled={isLoading || connectingProvider !== null}
                        className="cursor-pointer border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
                      >
                        {connectingProvider === provider.id ? (
                          <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Connecting...</>
                        ) : "Connect"}
                      </Button>
                      {connectionError?.provider === provider.id && (
                        <span className="max-w-[160px] text-right text-xs text-red-400">{connectionError.message}</span>
                      )}
                    </div>
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="text-xs text-white/45">Only connected providers allow repository access.</p>
          <Button
            onClick={onRefresh}
            size="sm"
            variant="outline"
            disabled={loadingProviders}
            className="shrink-0 border-white/[0.14] bg-white/[0.03] text-white/75 hover:bg-white/[0.07]"
          >
            {loadingProviders ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end border-t border-white/[0.06] px-6 py-4">
        <Button
          onClick={onNext}
          disabled={loadingProviders || !selectedProvider}
          className="cursor-pointer rounded-md bg-white text-black hover:bg-white/90"
        >
          Next <ChevronRight className="ml-1.5 h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
