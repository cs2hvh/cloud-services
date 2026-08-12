"use client";

// SSH keys vault — sibling of settings/api-keys. Keys added here (or inline on
// the deploy page) are injected as authorized_keys at instance create/rebuild.

import { useCallback, useEffect, useState } from "react";
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
  AlertCircle,
  Calendar,
  CheckCircle,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Server,
  Trash2,
} from "lucide-react";

type SshKey = {
  id: string;
  label: string;
  key_type: string;
  fingerprint_sha256: string;
  created_at: string;
  last_used_at: string | null;
};

const SERIF_STYLE = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
} as const;
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

const KEY_TYPE_BADGE: Record<string, string> = {
  "ssh-ed25519": "ED25519",
  "ssh-rsa": "RSA",
  "ecdsa-sha2-nistp256": "ECDSA-256",
  "ecdsa-sha2-nistp384": "ECDSA-384",
  "ecdsa-sha2-nistp521": "ECDSA-521",
};

export default function SshKeysPage() {
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPublicKey, setNewPublicKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [renameTarget, setRenameTarget] = useState<SshKey | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SshKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/user/ssh-keys");
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to fetch SSH keys");
      setKeys(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SSH keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function addKey() {
    if (!newLabel.trim() || !newPublicKey.trim()) {
      setDialogError("Both a label and the public key are required.");
      return;
    }
    setSaving(true);
    setDialogError(null);
    try {
      const res = await fetch("/api/user/ssh-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), public_key: newPublicKey }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save SSH key");
      setShowAddDialog(false);
      setNewLabel("");
      setNewPublicKey("");
      fetchKeys();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Failed to save SSH key");
    } finally {
      setSaving(false);
    }
  }

  async function renameKey() {
    if (!renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const res = await fetch(`/api/user/ssh-keys/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: renameValue.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to rename SSH key");
      setRenameTarget(null);
      fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename SSH key");
    } finally {
      setRenaming(false);
    }
  }

  async function deleteKey() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/user/ssh-keys/${deleteTarget.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to delete SSH key");
      setDeleteTarget(null);
      fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete SSH key");
    } finally {
      setDeleting(false);
    }
  }

  async function copyFingerprint(text: string, id: string) {
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
    const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="relative flex-1 bg-[#08090b] min-h-screen text-white [&_button]:cursor-pointer [&_a]:cursor-pointer">
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
        <AnimatePresence>
          {error && (
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
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-start justify-between mb-2 gap-4 flex-wrap">
            <div>
              <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45 mb-2`}>
                Server access
              </p>
              <h1 className="text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold mb-2">
                SSH{" "}
                <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">
                  keys
                </span>
              </h1>
              <p className={`${MONO} max-w-2xl text-[11.5px] text-white/45 leading-relaxed`}>
                Public keys saved here can be attached to any new server at deploy
                time — key-based login, no passwords over the wire.
              </p>
            </div>
            <Button
              onClick={() => setShowAddDialog(true)}
              className="bg-[#0095FF] text-white hover:bg-[#33adff] flex items-center gap-2"
              disabled={keys.length >= 25}
            >
              <Plus className="h-4 w-4" />
              Add SSH Key
            </Button>
          </div>
        </motion.div>

        {/* Keys list */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Your SSH Keys</CardTitle>
              <CardDescription className="text-white/60">
                {keys.length}/25 keys · used at server create and rebuild
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 text-white/40 animate-spin" />
                </div>
              ) : keys.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
                  <div className="inline-flex p-4 bg-white/5 rounded-full mb-4">
                    <KeyRound className="h-12 w-12 text-white/40" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">No SSH keys yet</h3>
                  <p className="text-white/60 mb-6 max-w-sm mx-auto">
                    Add your public key (usually <code className={MONO}>~/.ssh/id_ed25519.pub</code>)
                    to log into servers without a password.
                  </p>
                  <Button onClick={() => setShowAddDialog(true)} className="bg-[#0095FF] text-white hover:bg-[#33adff]">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Key
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
                        transition={{ delay: index * 0.04 }}
                        className="group p-4 border border-white/10 rounded-lg hover:bg-white/5 hover:border-white/20 transition-all"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold text-white truncate">{key.label}</h4>
                              <span className="px-2 py-0.5 text-xs bg-white/10 text-white/70 rounded shrink-0">
                                {KEY_TYPE_BADGE[key.key_type] ?? key.key_type}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mb-2 min-w-0">
                              <code className={`${MONO} text-sm text-white/60 bg-white/5 px-2 py-1 rounded truncate`}>
                                {key.fingerprint_sha256}
                              </code>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => copyFingerprint(key.fingerprint_sha256, key.id)}
                                className="h-6 px-2 text-white/60 hover:text-white shrink-0"
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
                                Added {formatDate(key.created_at)}
                              </span>
                              {key.last_used_at ? (
                                <span className="flex items-center gap-1 text-green-400/70">
                                  <Server className="h-3 w-3" />
                                  Last used {formatDate(key.last_used_at)}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-white/30">
                                  <Server className="h-3 w-3" />
                                  Never used
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setRenameTarget(key);
                                setRenameValue(key.label);
                              }}
                              className="text-white/50 hover:text-white hover:bg-white/10"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteTarget(key)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Add dialog */}
        <Dialog
          open={showAddDialog}
          onOpenChange={(open) => {
            setShowAddDialog(open);
            if (!open) {
              setDialogError(null);
              setNewLabel("");
              setNewPublicKey("");
            }
          }}
        >
          <DialogContent className="bg-black border-white/10 text-white max-w-xl">
            <DialogHeader>
              <DialogTitle>Add an SSH Key</DialogTitle>
              <DialogDescription className="text-white/60">
                Paste your PUBLIC key — never the private one. Find it with{" "}
                <code className={MONO}>cat ~/.ssh/id_ed25519.pub</code>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="sshLabel" className="text-white mb-2 block">
                  Label <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="sshLabel"
                  placeholder="e.g., work-laptop, ci-runner"
                  value={newLabel}
                  maxLength={64}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="sshKey" className="text-white mb-2 block">
                  Public key <span className="text-red-400">*</span>
                </Label>
                <textarea
                  id="sshKey"
                  value={newPublicKey}
                  onChange={(e) => setNewPublicKey(e.target.value)}
                  placeholder="ssh-ed25519 AAAA… you@machine"
                  rows={4}
                  className={`${MONO} w-full bg-white/5 border border-white/10 rounded-md px-3 py-2.5 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/25 resize-none`}
                />
              </div>

              {dialogError && (
                <Alert className="bg-red-500/10 border-red-500/50">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <AlertDescription className="text-red-400">{dialogError}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowAddDialog(false)}
                disabled={saving}
                className="text-white/60 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={addKey}
                disabled={saving || !newLabel.trim() || !newPublicKey.trim()}
                className="bg-[#0095FF] text-white hover:bg-[#33adff]"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Key
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename dialog */}
        <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
          <DialogContent className="bg-black border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Rename SSH Key</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <Input
                value={renameValue}
                maxLength={64}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !renaming && renameKey()}
                className="bg-white/5 border-white/10 text-white"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setRenameTarget(null)}
                disabled={renaming}
                className="text-white/60 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={renameKey}
                disabled={renaming || !renameValue.trim()}
                className="bg-[#0095FF] text-white hover:bg-[#33adff]"
              >
                {renaming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete dialog */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="bg-black border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-400" />
                Remove SSH Key?
              </DialogTitle>
              <DialogDescription className="text-white/60">
                Servers already deployed with this key keep it — this only stops it
                from being offered on future deploys.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-white/80">
                  You are about to remove:{" "}
                  <span className="font-semibold text-white">{deleteTarget?.label}</span>
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="text-white/60 hover:text-white"
              >
                Cancel
              </Button>
              <Button onClick={deleteKey} disabled={deleting} className="bg-red-500 text-white hover:bg-red-600">
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove Key
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
