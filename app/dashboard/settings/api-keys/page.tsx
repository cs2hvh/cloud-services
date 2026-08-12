"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { copyToClipboard as safeCopyToClipboard } from "@/lib/utils/safe-clipboard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Copy, 
  Trash2, 
  Key, 
  AlertCircle, 
  CheckCircle, 
  Plus, 
  Eye, 
  EyeOff,
  Calendar,
  Activity,
  Shield,
  Loader2,
  Terminal,
  ExternalLink,
  Info
} from "lucide-react";

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  plan: string;
  last_used_at: string | null;
  created_at: string;
};

// Editorial design tokens (match the rest of the dashboard).
const SERIF_STYLE = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
} as const;
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    try {
      const res = await fetch("/api/auth/api-keys");
      if (!res.ok) throw new Error("Failed to fetch API keys");
      const data = await res.json();
      setKeys(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }

  async function createKey() {
    if (!newKeyName.trim()) {
      setError("Please enter a key name");
      return;
    }

    if (newKeyName.trim().length < 3) {
      setError("Key name must be at least 3 characters");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create API key");
      }

      const data = await res.json();
      setNewKeyValue(data.key);
      setNewKeyName("");
      setShowCreateDialog(false);
      fetchKeys();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  function openDeleteDialog(id: string, name: string) {
    setKeyToDelete({ id, name });
    setDeleteDialogOpen(true);
  }

  async function confirmDelete() {
    if (!keyToDelete) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/auth/api-keys/${keyToDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete key");
      fetchKeys();
      setDeleteDialogOpen(false);
      setKeyToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete key");
    } finally {
      setDeleting(false);
    }
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await safeCopyToClipboard(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Failed to copy to clipboard. Please copy manually.");
      setTimeout(() => setError(null), 3000);
    }
  }

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="relative flex-1 bg-[#08090b] min-h-screen text-white [&_button]:cursor-pointer [&_a]:cursor-pointer [&_[role=tab]]:cursor-pointer">
      {/* Editorial canvas — aurora glow + dotted grid */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{ background: "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-8 sm:px-10 sm:py-10">
        {/* Global Error Banner */}
        <AnimatePresence>
          {error && !showCreateDialog && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6"
            >
              <Alert className="bg-red-500/10 border-red-500/50">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-400">{error}</AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45 mb-2`}>
                Developer access
              </p>
              <h1 className="text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold mb-2">
                API{" "}
                <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">
                  keys
                </span>
              </h1>
              <p className={`${MONO} max-w-2xl text-[11.5px] text-white/45 leading-relaxed`}>
                Authenticate applications with personal access tokens — for CI/CD,
                automation, and integrations.
              </p>
            </div>
            <Button 
              onClick={() => setShowCreateDialog(true)}
              className="bg-[#0095FF] text-white hover:bg-[#33adff] flex items-center gap-2"
              disabled={keys.length >= 10}
            >
              <Plus className="h-4 w-4" />
              Create Key
            </Button>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/60 text-sm">Total Keys</p>
                    <p className="text-2xl font-bold text-white">{keys.length}/10</p>
                  </div>
                  <Shield className="h-8 w-8 text-white/40" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/60 text-sm">Active Keys</p>
                    <p className="text-2xl font-bold text-white">{keys.filter(k => k.last_used_at).length}</p>
                  </div>
                  <Activity className="h-8 w-8 text-green-400/60" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/60 text-sm">Rate Limit</p>
                    <p className="text-2xl font-bold text-white">30/min</p>
                  </div>
                  <Terminal className="h-8 w-8 text-blue-400/60" />
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* Success Modal for New Key */}
        <AnimatePresence>
          {newKeyValue && (
            <Dialog open={!!newKeyValue} onOpenChange={(open) => !open && setNewKeyValue(null)}>
              <DialogContent className="bg-black border-white/10 text-white max-w-2xl">
                <DialogHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-green-500/20 rounded-full">
                      <CheckCircle className="h-6 w-6 text-green-400" />
                    </div>
                    <DialogTitle className="text-2xl">API Key Created Successfully!</DialogTitle>
                  </div>
                  <DialogDescription className="text-white/60">
                    This is the only time you&apos;ll see this key. Copy it now and store it securely.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 my-4">
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5" />
                      <div className="flex-1 text-sm">
                        <p className="font-semibold text-yellow-400 mb-1">Important Security Notice</p>
                        <p className="text-white/70">
                          Never commit this key to version control or share it publicly. Store it in environment variables or a secure secret manager.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-white/80 mb-2 block">Your API Key</Label>
                    <div className="relative">
                      <div className="flex items-center gap-2 p-4 bg-white/5 border border-white/10 rounded-lg font-mono text-sm">
                        <code className="flex-1 break-all text-white select-all">
                          {showKey ? newKeyValue : newKeyValue.replace(/./g, "•")}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowKey(!showKey)}
                          className="text-white/60 hover:text-white hover:bg-white/10"
                        >
                          {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => copyToClipboard(newKeyValue, "new")}
                          className="bg-[#0095FF] text-white hover:bg-[#33adff]"
                        >
                          {copiedId === "new" ? (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button 
                    onClick={() => setNewKeyValue(null)}
                    className="bg-[#0095FF] text-white hover:bg-[#33adff] w-full"
                  >
                    I&apos;ve Saved My Key Securely
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </AnimatePresence>

        {/* API Keys List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-white/5 border-white/10 mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white">Your API Keys</CardTitle>
                  <CardDescription className="text-white/60">
                    Manage your personal access tokens
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 text-white/40 animate-spin" />
                </div>
              ) : keys.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12"
                >
                  <div className="inline-flex p-4 bg-white/5 rounded-full mb-4">
                    <Key className="h-12 w-12 text-white/40" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">No API keys yet</h3>
                  <p className="text-white/60 mb-6 max-w-sm mx-auto">
                    Create your first API key to start making authenticated requests to the platform API
                  </p>
                  <Button 
                    onClick={() => setShowCreateDialog(true)}
                    className="bg-[#0095FF] text-white hover:bg-[#33adff]"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Key
                  </Button>
                </motion.div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence>
                    {keys.map((key, index) => (
                      <motion.div
                        key={key.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: index * 0.05 }}
                        className="group p-4 border border-white/10 rounded-lg hover:bg-white/5 hover:border-white/20 transition-all"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold text-white">{key.name}</h4>
                              <span className="px-2 py-0.5 text-xs bg-white/10 text-white/70 rounded">
                                Free
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <code className="text-sm text-white/60 font-mono bg-white/5 px-2 py-1 rounded">
                                {key.key_prefix}
                              </code>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => copyToClipboard(key.key_prefix, key.id)}
                                className="h-6 px-2 text-white/60 hover:text-white"
                              >
                                {copiedId === key.id ? (
                                  <CheckCircle className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-white/40">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Created {formatDate(key.created_at)}
                              </span>
                              {key.last_used_at ? (
                                <span className="flex items-center gap-1 text-green-400/70">
                                  <Activity className="h-3 w-3" />
                                  Last used {formatDate(key.last_used_at)}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-white/30">
                                  <Activity className="h-3 w-3" />
                                  Never used
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openDeleteDialog(key.id, key.name)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Documentation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Quick Start Guide
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-white/60 hover:text-white">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Full Documentation
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2 text-white flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Authentication
                </h3>
                <p className="text-sm text-white/60 mb-3">
                  Include your API key in the Authorization header with Bearer scheme:
                </p>
                <div className="relative group">
                  <pre className="p-4 bg-black/50 border border-white/10 rounded-lg text-sm overflow-x-auto">
                    <code className="text-green-400">Authorization: Bearer <span className="text-white/60">sk_live_your_key_here</span></code>
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => copyToClipboard("Authorization: Bearer sk_live_your_key_here", "auth")}
                  >
                    {copiedId === "auth" ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2 text-white">Example cURL Request</h3>
                <div className="relative group">
                  <pre className="p-4 bg-black/50 border border-white/10 rounded-lg text-sm overflow-x-auto">
                    <code className="text-blue-400">{`curl -X GET https://yourdomain.com/api/v1/apps \\
  -H `}<span className="text-green-400">&quot;Authorization: Bearer sk_live_your_key&quot;</span></code>
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => copyToClipboard(`curl -X GET https://yourdomain.com/api/v1/apps -H "Authorization: Bearer sk_live_your_key"`, "curl")}
                  >
                    {copiedId === "curl" ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3 text-white">Rate Limits by Plan</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <p className="text-xs text-white/60 mb-1">Free</p>
                    <p className="text-lg font-bold text-white">30 req/min</p>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <p className="text-xs text-white/60 mb-1">Pro</p>
                    <p className="text-lg font-bold text-white">100 req/min</p>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <p className="text-xs text-white/60 mb-1">Enterprise</p>
                    <p className="text-lg font-bold text-white">500 req/min</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Create Key Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) {
            setError(null);
            setNewKeyName("");
          }
        }}>
          <DialogContent className="bg-black border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Create New API Key</DialogTitle>
              <DialogDescription className="text-white/60">
                Give your API key a descriptive name to help you identify it later
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="keyName" className="text-white mb-2 block">
                  Key Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="keyName"
                  placeholder="e.g., Production CI/CD, Development Server"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !creating && createKey()}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  autoFocus
                />
                <p className="text-xs text-white/40 mt-1">
                  Use a descriptive name (minimum 3 characters)
                </p>
              </div>

              {error && (
                <Alert className="bg-red-500/10 border-red-500/50">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <AlertDescription className="text-red-400">{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewKeyName("");
                  setError(null);
                }}
                disabled={creating}
                className="text-white/60 hover:text-white"
              >
                Cancel
              </Button>
              <Button 
                onClick={createKey} 
                disabled={creating || !newKeyName.trim() || newKeyName.trim().length < 3}
                className="bg-[#0095FF] text-white hover:bg-[#33adff]"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Key
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setKeyToDelete(null);
          }
        }}>
          <DialogContent className="bg-black border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-400" />
                Revoke API Key?
              </DialogTitle>
              <DialogDescription className="text-white/60">
                This action cannot be undone. Any applications using this key will lose access immediately.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-white/80">
                  You are about to revoke: <span className="font-semibold text-white">{keyToDelete?.name}</span>
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setKeyToDelete(null);
                }}
                disabled={deleting}
                className="text-white/60 hover:text-white"
              >
                Cancel
              </Button>
              <Button 
                onClick={confirmDelete} 
                disabled={deleting}
                className="bg-red-500 text-white hover:bg-red-600"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Revoking...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Revoke Key
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
