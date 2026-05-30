"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Copy,
  Database,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getDatabaseErrorMessage } from "../error-messages";
import { supportsDashboardLogicalDatabases } from "../engine-capabilities";

interface DatabaseUser {
  name: string;
  password?: string;
  role?: string;
  created_at?: string;
}

interface DatabaseDb {
  name: string;
  created_at?: string;
}

interface UsersDbsTabProps {
  clusterId: string;
  engine?: string | null;
}

export const UsersDbsTab = ({ clusterId, engine }: UsersDbsTabProps) => {
  const [users, setUsers] = useState<DatabaseUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [newUserName, setNewUserName] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>(
    {}
  );

  const [databases, setDatabases] = useState<DatabaseDb[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(true);
  const [newDbName, setNewDbName] = useState("");
  const [creatingDb, setCreatingDb] = useState(false);

  const [deleteUserModal, setDeleteUserModal] = useState<{
    show: boolean;
    username: string;
    confirmText: string;
  }>({ show: false, username: "", confirmText: "" });

  const [deleteDbModal, setDeleteDbModal] = useState<{
    show: boolean;
    dbName: string;
    confirmText: string;
  }>({ show: false, dbName: "", confirmText: "" });

  const [deletingUser, setDeletingUser] = useState(false);
  const [deletingDb, setDeletingDb] = useState(false);
  const [resettingUser, setResettingUser] = useState<string | null>(null);
  const [credentialModal, setCredentialModal] = useState<{
    show: boolean;
    username: string;
    password: string;
    mode: "created" | "reset";
  }>({ show: false, username: "", password: "", mode: "reset" });

  const isPrimaryUser = (user: DatabaseUser) =>
    user.role?.toLowerCase() === "primary" || user.name.toLowerCase() === "doadmin";

  const getProviderRoleLabel = (role?: string) =>
    role ? `Provider role: ${role}` : "Provider-managed identity";

  const logicalDatabasesSupported = supportsDashboardLogicalDatabases(engine);

  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const response = await api.post("/services/database/users/list", {
        cluster_id: clusterId,
      });

      if (response.status === 200) {
        setUsers(response?.data?.data || []);
      }
    } catch (error) {
      console.error("[fetchUsers] Error:", error);
      toast.error(getDatabaseErrorMessage(error, "Failed to fetch users."));
    } finally {
      setLoadingUsers(false);
    }
  }, [clusterId]);

  const fetchDatabases = useCallback(async () => {
    if (!logicalDatabasesSupported) {
      setDatabases([]);
      setLoadingDatabases(false);
      return;
    }

    try {
      setLoadingDatabases(true);
      const response = await api.post("/services/database/dbs/list", {
        cluster_id: clusterId,
      });

      if (response.status === 200) {
        setDatabases(response?.data?.data || []);
      }
    } catch (error) {
      console.error("[fetchDatabases] Error:", error);
      toast.error(getDatabaseErrorMessage(error, "Failed to fetch databases."));
    } finally {
      setLoadingDatabases(false);
    }
  }, [clusterId, logicalDatabasesSupported]);

  useEffect(() => {
    fetchUsers();
    fetchDatabases();
  }, [fetchDatabases, fetchUsers]);

  const handleCreateUser = async () => {
    if (!newUserName.trim()) {
      toast.error("Please enter a username");
      return;
    }

    setCreatingUser(true);
    try {
      const response = await api.post("/services/database/users/create", {
        cluster_id: clusterId,
        name: newUserName.trim(),
      });

      if (response.status === 200) {
        const createdUser = response?.data?.data;
        if (createdUser?.name && createdUser?.password) {
          setCredentialModal({
            show: true,
            username: createdUser.name,
            password: createdUser.password,
            mode: "created",
          });
        }
        toast.success("User created successfully!");
        setNewUserName("");
        await fetchUsers();
      }
    } catch (error) {
      console.error("[handleCreateUser] Error:", error);
      toast.error(getDatabaseErrorMessage(error, "Failed to create user."));
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async () => {
    if (deleteUserModal.confirmText !== deleteUserModal.username) {
      toast.error("Username does not match!");
      return;
    }

    setDeletingUser(true);
    try {
      const response = await api.post("/services/database/users/delete", {
        cluster_id: clusterId,
        username: deleteUserModal.username,
      });

      if (response.status === 200) {
        toast.success("User deleted successfully!");
        setDeleteUserModal({ show: false, username: "", confirmText: "" });
        await fetchUsers();
      }
    } catch (error) {
      console.error("[handleDeleteUser] Error:", error);
      toast.error(getDatabaseErrorMessage(error, "Failed to delete user."));
    } finally {
      setDeletingUser(false);
    }
  };

  const handleResetPassword = async (username: string) => {
    setResettingUser(username);
    try {
      const response = await api.post("/services/database/users/reset", {
        cluster_id: clusterId,
        username,
      });

      if (response.status === 200) {
        setCredentialModal({
          show: true,
          username,
          password: response?.data?.data?.password ?? "",
          mode: "reset",
        });
        toast.success("Password reset successfully!");
        await fetchUsers();
      }
    } catch (error) {
      console.error("[handleResetPassword] Error:", error);
      toast.error(getDatabaseErrorMessage(error, "Failed to reset password."));
    } finally {
      setResettingUser(null);
    }
  };

  const handleCreateDatabase = async () => {
    if (!logicalDatabasesSupported) {
      toast.error("Logical databases are not available for this database engine.");
      return;
    }

    if (!newDbName.trim()) {
      toast.error("Please enter a database name");
      return;
    }

    setCreatingDb(true);
    try {
      const response = await api.post("/services/database/dbs/create", {
        cluster_id: clusterId,
        name: newDbName.trim(),
      });

      if (response.status === 201) {
        toast.success("Database created successfully!");
        setNewDbName("");
        await fetchDatabases();
      }
    } catch (error) {
      console.error("[handleCreateDatabase] Error:", error);
      toast.error(getDatabaseErrorMessage(error, "Failed to create database."));
    } finally {
      setCreatingDb(false);
    }
  };

  const handleDeleteDatabase = async () => {
    if (!logicalDatabasesSupported) {
      toast.error("Logical databases are not available for this database engine.");
      return;
    }

    if (deleteDbModal.confirmText !== deleteDbModal.dbName) {
      toast.error("Database name does not match!");
      return;
    }

    if (deleteDbModal.dbName === "defaultdb" || deleteDbModal.dbName === "admin") {
      toast.error("Cannot delete system database!");
      return;
    }

    setDeletingDb(true);
    try {
      const response = await api.post("/services/database/dbs/delete", {
        cluster_id: clusterId,
        db_name: deleteDbModal.dbName,
      });

      if (response.status === 200) {
        toast.success("Database deleted successfully!");
        setDeleteDbModal({ show: false, dbName: "", confirmText: "" });
        await fetchDatabases();
      }
    } catch (error) {
      console.error("[handleDeleteDatabase] Error:", error);
      toast.error(getDatabaseErrorMessage(error, "Failed to delete database."));
    } finally {
      setDeletingDb(false);
    }
  };

  const togglePasswordVisibility = (username: string) => {
    setShowPasswords((prev) => ({
      ...prev,
      [username]: !prev[username],
    }));
  };

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const renderCreateBar = ({
    value,
    setValue,
    placeholder,
    onSubmit,
    submitting,
    disabled,
    buttonLabel,
  }: {
    value: string;
    setValue: (value: string) => void;
    placeholder: string;
    onSubmit: () => void;
    submitting: boolean;
    disabled: boolean;
    buttonLabel: string;
  }) => (
    <div className="border-t border-white/[0.06] px-5 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
        Add New
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          disabled={submitting}
          className="h-11 border-white/[0.12] bg-white/[0.04] text-white placeholder:text-white/34 focus:border-blue-400/35 focus:ring-0"
        />
        <Button
          onClick={onSubmit}
          disabled={submitting || disabled}
          className="cursor-pointer rounded-none border border-white/[0.1] bg-white/[0.04] text-white hover:bg-white/[0.08]"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="ml-2">{buttonLabel}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.section
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className="rounded-[8px] border border-white/[0.08] bg-white/[0.03]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/70">
                Identities
              </div>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-white">
                <Users className="h-5 w-5 text-blue-300" />
                Database Users
              </h2>
              <p className="mt-1 text-sm leading-6 text-white/45">
                Create provider-managed database identities, rotate passwords,
                and remove identities that no longer require access.
              </p>
            </div>
            <Button
              onClick={fetchUsers}
              disabled={loadingUsers}
              className="rounded-none rounded-[8px] border border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.08]"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 ${loadingUsers ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="px-5 py-5">
            {loadingUsers ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 className="h-8 w-8 animate-spin text-blue-300" />
              </div>
            ) : users.length === 0 ? (
              <div className="rounded-[8px] border border-white/[0.08] bg-black/20 px-6 py-14 text-center">
                <Users className="mx-auto mb-4 h-10 w-10 text-white/30" />
                <h3 className="text-lg font-semibold text-white">No users yet</h3>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  Create separate provider-managed identities for applications
                  and operators, then verify effective grants before production
                  use.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border border-amber-400/15 bg-amber-500/[0.08] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/72">
                    Access Scope
                  </div>
                  <p className="mt-1 text-sm leading-6 text-amber-100/72">
                    Roles and privileges are enforced by the database provider
                    and may be broader than a single logical database.
                  </p>
                </div>

                <div className="space-y-3">
                {users.map((user, index) => (
                  <motion.div
                    key={user.name}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="rounded-[8px] border border-white/[0.08] bg-black/20 p-4"
                  >
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="break-all text-base font-semibold text-white">
                              {user.name}
                            </div>
                            <span
                              className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${
                                isPrimaryUser(user)
                                  ? "border border-amber-400/20 bg-amber-500/10 text-amber-200/80"
                                  : "rounded-[8px] border border-white/[0.08] bg-white/[0.03] text-white/40"
                              }`}
                            >
                              {isPrimaryUser(user) ? "Primary account" : "Managed identity"}
                            </span>
                            {user.role && (
                              <span className="rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium text-white/45">
                                {getProviderRoleLabel(user.role)}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/42">
                            <span>
                              {isPrimaryUser(user)
                                ? "Primary cluster identity"
                                : "Provider-managed identity"}
                            </span>
                            {user.created_at && (
                              <span>
                                Added {new Date(user.created_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                          <button
                            onClick={() => handleResetPassword(user.name)}
                            disabled={Boolean(resettingUser)}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {resettingUser === user.name ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Resetting...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4" />
                                Reset
                              </>
                            )}
                          </button>
                          <button
                            onClick={() =>
                              setDeleteUserModal({
                                show: true,
                                username: user.name,
                                confirmText: "",
                              })
                            }
                            className="inline-flex cursor-pointer items-center gap-2 border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/16"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        </div>
                      </div>

                      {user.password && (
                        <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.03] p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                              Saved Password
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => togglePasswordVisibility(user.name)}
                                className="inline-flex items-center gap-2 rounded-[8px] border border-white/[0.08] bg-black/20 px-3 py-2 text-xs font-medium text-white/65 transition-colors hover:bg-white/[0.08]"
                                title={
                                  showPasswords[user.name]
                                    ? "Hide password"
                                    : "Show password"
                                }
                              >
                                {showPasswords[user.name] ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                                {showPasswords[user.name] ? "Hide" : "Show"}
                              </button>
                              <button
                                onClick={() => copyToClipboard(user.password ?? "", "Password")}
                                className="inline-flex items-center gap-2 rounded-[8px] border border-white/[0.08] bg-black/20 px-3 py-2 text-xs font-medium text-white/65 transition-colors hover:bg-white/[0.08]"
                                title="Copy password"
                              >
                                <Copy className="h-4 w-4" />
                                Copy
                              </button>
                            </div>
                          </div>
                          <code className="mt-3 block min-h-12 min-w-0 break-all border border-white/[0.06] bg-black/20 px-3 py-3 font-mono text-sm text-white/78">
                            {showPasswords[user.name]
                              ? user.password
                              : "••••••••••••••••"}
                          </code>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
                </div>
              </div>
            )}
          </div>

          {renderCreateBar({
            value: newUserName,
            setValue: setNewUserName,
            placeholder: "Username",
            onSubmit: handleCreateUser,
            submitting: creatingUser,
            disabled: !newUserName.trim(),
            buttonLabel: "Add",
          })}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          className="rounded-[8px] border border-white/[0.08] bg-white/[0.03]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/70">
                Logical Databases
              </div>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-white">
                <Database className="h-5 w-5 text-blue-300" />
                Databases
              </h2>
              <p className="mt-1 text-sm leading-6 text-white/45">
                Manage logical databases inside the cluster for separate
                applications, environments, or teams.
              </p>
            </div>
            <Button
              onClick={fetchDatabases}
              disabled={loadingDatabases}
              className="rounded-none rounded-[8px] border border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.08]"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 ${loadingDatabases ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="px-5 py-5">
            {!logicalDatabasesSupported ? (
              <div className="rounded-[8px] border border-white/[0.08] bg-black/20 px-6 py-10">
                <Database className="mb-4 h-10 w-10 text-white/30" />
                <h3 className="text-lg font-semibold text-white">
                  Logical databases are not available for this engine
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  Manage access through provider users and connection settings
                  instead. This cluster type does not expose separate logical
                  database management in the dashboard.
                </p>
              </div>
            ) : loadingDatabases ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 className="h-8 w-8 animate-spin text-blue-300" />
              </div>
            ) : databases.length === 0 ? (
              <div className="rounded-[8px] border border-white/[0.08] bg-black/20 px-6 py-14 text-center">
                <Database className="mx-auto mb-4 h-10 w-10 text-white/30" />
                <h3 className="text-lg font-semibold text-white">
                  No logical databases yet
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  Create an additional database when workloads should remain
                  isolated within the same managed cluster.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {databases.map((db, index) => (
                  <motion.div
                    key={db.name}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="rounded-[8px] border border-white/[0.08] bg-black/20 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-white">
                            {db.name}
                          </div>
                          {(db.name === "defaultdb" || db.name === "admin") && (
                            <span className="rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">
                              System
                            </span>
                          )}
                        </div>
                        {db.created_at && (
                          <div className="mt-2 text-xs text-white/38">
                            Created {new Date(db.created_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          setDeleteDbModal({
                            show: true,
                            dbName: db.name,
                            confirmText: "",
                          })
                        }
                        className="inline-flex cursor-pointer items-center gap-2 border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/16"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {logicalDatabasesSupported &&
            renderCreateBar({
              value: newDbName,
              setValue: setNewDbName,
              placeholder: "Database name",
              onSubmit: handleCreateDatabase,
              submitting: creatingDb,
              disabled: !newDbName.trim(),
              buttonLabel: "Add",
            })}
        </motion.section>
      </div>

      <AnimatePresence>
        {deleteUserModal.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() =>
              !deletingUser &&
              setDeleteUserModal({ show: false, username: "", confirmText: "" })
            }
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md border border-red-400/20 bg-[#0d1220] p-6 shadow-2xl"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center border border-red-400/20 bg-red-500/10 text-red-300">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">Delete User</h3>
                  <p className="mt-1 text-sm leading-6 text-white/45">
                    This permanently removes the user{" "}
                    <strong>{deleteUserModal.username}</strong> from the
                    database cluster.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-2.5">
                <label className="block text-sm font-medium text-white">
                  Type <span className="font-mono">{deleteUserModal.username}</span>{" "}
                  to confirm
                </label>
                <Input
                  type="text"
                  value={deleteUserModal.confirmText}
                  onChange={(e) =>
                    setDeleteUserModal((prev) => ({
                      ...prev,
                      confirmText: e.target.value,
                    }))
                  }
                  placeholder="Enter username"
                  disabled={deletingUser}
                  className="h-11 border-white/[0.12] bg-white/[0.04] text-white placeholder:text-white/34 focus:border-red-400/35 focus:ring-0"
                />
              </div>

              <div className="mt-6 flex gap-3">
                <Button
                  onClick={() =>
                    setDeleteUserModal({
                      show: false,
                      username: "",
                      confirmText: "",
                    })
                  }
                  disabled={deletingUser}
                  className="flex-1 rounded-none rounded-[8px] border border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.08]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteUser}
                  disabled={
                    deleteUserModal.confirmText !== deleteUserModal.username ||
                    deletingUser
                  }
                  className="flex-1 rounded-none bg-red-500 text-white hover:bg-red-600"
                >
                  {deletingUser ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteDbModal.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() =>
              !deletingDb &&
              setDeleteDbModal({ show: false, dbName: "", confirmText: "" })
            }
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md border border-red-400/20 bg-[#0d1220] p-6 shadow-2xl"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center border border-red-400/20 bg-red-500/10 text-red-300">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">
                    Delete Database
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-white/45">
                    This permanently removes the database{" "}
                    <strong>{deleteDbModal.dbName}</strong> and all data stored
                    within it.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-2.5">
                <label className="block text-sm font-medium text-white">
                  Type <span className="font-mono">{deleteDbModal.dbName}</span>{" "}
                  to confirm
                </label>
                <Input
                  type="text"
                  value={deleteDbModal.confirmText}
                  onChange={(e) =>
                    setDeleteDbModal((prev) => ({
                      ...prev,
                      confirmText: e.target.value,
                    }))
                  }
                  placeholder="Enter database name"
                  disabled={deletingDb}
                  className="h-11 border-white/[0.12] bg-white/[0.04] text-white placeholder:text-white/34 focus:border-red-400/35 focus:ring-0"
                />
              </div>

              <div className="mt-6 flex gap-3">
                <Button
                  onClick={() =>
                    setDeleteDbModal({
                      show: false,
                      dbName: "",
                      confirmText: "",
                    })
                  }
                  disabled={deletingDb}
                  className="flex-1 rounded-none rounded-[8px] border border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.08]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteDatabase}
                  disabled={
                    deleteDbModal.confirmText !== deleteDbModal.dbName ||
                    deletingDb
                  }
                  className="flex-1 rounded-none bg-red-500 text-white hover:bg-red-600"
                >
                  {deletingDb ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {credentialModal.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() =>
              setCredentialModal({
                show: false,
                username: "",
                password: "",
                mode: "reset",
              })
            }
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md border border-white/[0.12] bg-[#0d1220] p-6 shadow-2xl"
            >
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
                  <Shield className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">
                  {credentialModal.mode === "created"
                    ? "User Created"
                    : "Password Reset Completed"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  {credentialModal.mode === "created"
                    ? "One-time password for"
                    : "New password for"}{" "}
                  <strong>{credentialModal.username}</strong>
                </p>
                <p className="mt-2 text-xs leading-5 text-amber-200/70">
                  Copy this password now and store it securely. Dashboard
                  visibility depends on the latest provider sync and may differ
                  by engine.
                </p>
              </div>

              <div className="mt-6 rounded-[8px] border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  {credentialModal.mode === "created"
                    ? "Generated Password"
                    : "New Password"}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-sm text-emerald-300">
                    {credentialModal.password}
                  </code>
                  <button
                    onClick={() =>
                      copyToClipboard(credentialModal.password, "Password")
                    }
                    className="rounded-[8px] border border-white/[0.08] bg-white/[0.03] p-2 text-white/55 transition-colors hover:bg-white/[0.08]"
                    title="Copy password"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <Button
                onClick={() =>
                  setCredentialModal({
                    show: false,
                    username: "",
                    password: "",
                    mode: "reset",
                  })
                }
                className="mt-6 w-full rounded-none rounded-[8px] border border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.08]"
              >
                Close
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
