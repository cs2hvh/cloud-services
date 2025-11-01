"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database,
  Users,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  Plus,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DatabaseUser {
  name: string;
  password: string;
  role?: string;
  created_at?: string;
}

interface DatabaseDb {
  name: string;
  created_at?: string;
}

interface UsersDbsTabProps {
  clusterId: string;
}

export const UsersDbsTab = ({ clusterId }: UsersDbsTabProps) => {
  // Users state
  const [users, setUsers] = useState<DatabaseUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [newUserName, setNewUserName] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>(
    {}
  );

  // Databases state
  const [databases, setDatabases] = useState<DatabaseDb[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(true);
  const [newDbName, setNewDbName] = useState("");
  const [creatingDb, setCreatingDb] = useState(false);

  // Delete modal state
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

  // Reset password modal
  const [resetPasswordModal, setResetPasswordModal] = useState<{
    show: boolean;
    username: string;
    newPassword: string;
  }>({ show: false, username: "", newPassword: "" });

  // Fetch users
  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await api.post("/services/database/users/list", {
        cluster_id: clusterId,
      });

      if (response.status === 200) {
        setUsers(response.data.data || []);
      }
    } catch (error: any) {
      console.error("[fetchUsers] Error:", error);
      toast.error(error.response?.data?.error || "Failed to fetch users");
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch databases
  const fetchDatabases = async () => {
    try {
      setLoadingDatabases(true);
      const response = await api.post("/services/database/dbs/list", {
        cluster_id: clusterId,
      });

      if (response.status === 200) {
        setDatabases(response.data.data || []);
      }
    } catch (error: any) {
      console.error("[fetchDatabases] Error:", error);
      toast.error(error.response?.data?.error || "Failed to fetch databases");
    } finally {
      setLoadingDatabases(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchUsers();
    fetchDatabases();
  }, [clusterId]);

  // Create user
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
        toast.success("User created successfully!");
        setNewUserName("");
        await fetchUsers();
      }
    } catch (error: any) {
      console.error("[handleCreateUser] Error:", error);
      toast.error(error.response?.data?.error || "Failed to create user");
    } finally {
      setCreatingUser(false);
    }
  };

  // Delete user
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
    } catch (error: any) {
      console.error("[handleDeleteUser] Error:", error);
      toast.error(error.response?.data?.error || "Failed to delete user");
    } finally {
      setDeletingUser(false);
    }
  };

  // Reset password
  const handleResetPassword = async (username: string) => {
    try {
      const response = await api.post("/services/database/users/reset", {
        cluster_id: clusterId,
        username: username,
      });

      if (response.status === 200) {
        const newPassword = response.data.data.password;
        setResetPasswordModal({
          show: true,
          username: username,
          newPassword: newPassword,
        });
        toast.success("Password reset successfully!");
        await fetchUsers();
      }
    } catch (error: any) {
      console.error("[handleResetPassword] Error:", error);
      toast.error(error.response?.data?.error || "Failed to reset password");
    }
  };

  // Create database
  const handleCreateDatabase = async () => {
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

      if (response.status === 200) {
        toast.success("Database created successfully!");
        setNewDbName("");
        await fetchDatabases();
      }
    } catch (error: any) {
      console.error("[handleCreateDatabase] Error:", error);
      toast.error(error.response?.data?.error || "Failed to create database");
    } finally {
      setCreatingDb(false);
    }
  };

  // Delete database
  const handleDeleteDatabase = async () => {
    debugger
    if (deleteDbModal.confirmText !== deleteDbModal.dbName) {
      toast.error("Database name does not match!");
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
    } catch (error: any) {
      console.error("[handleDeleteDatabase] Error:", error);
      toast.error(error.response?.data?.error || "Failed to delete database");
    } finally {
      setDeletingDb(false);
    }
  };

  // Toggle password visibility
  const togglePasswordVisibility = (username: string) => {
    setShowPasswords((prev) => ({
      ...prev,
      [username]: !prev[username],
    }));
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Users Section */}
        <motion.section
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-400" />
              Database Users
            </h2>
            <button
              onClick={fetchUsers}
              disabled={loadingUsers}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
              title="Refresh users"
            >
              <RefreshCw
                className={`h-4 w-4 text-white ${loadingUsers ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          {/* Users List */}
          {loadingUsers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No users found</p>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              {users.map((user, index) => (
                <motion.div
                  key={user.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-slate-900/50 rounded-lg p-4 border border-white/10"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold mb-1 truncate">
                        {user.name}
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded font-mono truncate flex-1">
                          {showPasswords[user.name]
                            ? user.password
                            : "••••••••••••"}
                        </code>
                        <button
                          onClick={() => togglePasswordVisibility(user.name)}
                          className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                          title={
                            showPasswords[user.name]
                              ? "Hide password"
                              : "Show password"
                          }
                        >
                          {showPasswords[user.name] ? (
                            <EyeOff className="h-4 w-4 text-slate-400" />
                          ) : (
                            <Eye className="h-4 w-4 text-slate-400" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleResetPassword(user.name)}
                        className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                        title="Reset password"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Reset</span>
                      </button>
                      <button
                        onClick={() =>
                          setDeleteUserModal({
                            show: true,
                            username: user.name,
                            confirmText: "",
                          })
                        }
                        className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                        title="Delete user"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Add User Form */}
          <div className="border-t border-white/10 pt-4">
            <p className="text-slate-400 text-sm mb-3">Add New User</p>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Username"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateUser()}
                disabled={creatingUser}
                className="flex-1"
              />
              <Button
                onClick={handleCreateUser}
                disabled={creatingUser || !newUserName.trim()}
                className="flex items-center gap-2"
              >
                {creatingUser ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add
              </Button>
            </div>
          </div>
        </motion.section>

        {/* Databases Section */}
        <motion.section
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Database className="h-5 w-5 text-purple-400" />
              Databases
            </h2>
            <button
              onClick={fetchDatabases}
              disabled={loadingDatabases}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
              title="Refresh databases"
            >
              <RefreshCw
                className={`h-4 w-4 text-white ${loadingDatabases ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          {/* Databases List */}
          {loadingDatabases ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
            </div>
          ) : databases.length === 0 ? (
            <div className="text-center py-12">
              <Database className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No databases found</p>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              {databases.map((db, index) => (
                <motion.div
                  key={db.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-slate-900/50 rounded-lg p-4 border border-white/10"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold mb-1 truncate">
                        {db.name}
                      </p>
                      {db.created_at && (
                        <p className="text-xs text-slate-400">
                          Created: {new Date(db.created_at).toLocaleDateString()}
                        </p>
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
                      className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
                      title="Delete database"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Add Database Form */}
          <div className="border-t border-white/10 pt-4">
            <p className="text-slate-400 text-sm mb-3">Add New Database</p>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Database name"
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateDatabase()}
                disabled={creatingDb}
                className="flex-1"
              />
              <Button
                onClick={handleCreateDatabase}
                disabled={creatingDb || !newDbName.trim()}
                className="flex items-center gap-2"
              >
                {creatingDb ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add
              </Button>
            </div>
          </div>
        </motion.section>
      </div>

      {/* Delete User Modal */}
      <AnimatePresence>
        {deleteUserModal.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() =>
              !deletingUser &&
              setDeleteUserModal({ show: false, username: "", confirmText: "" })
            }
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-2xl border-2 border-red-500/30 shadow-2xl max-w-md w-full p-6"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 rounded-full bg-red-500/20">
                  <AlertCircle className="h-6 w-6 text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white mb-2">
                    Delete User
                  </h3>
                  <p className="text-slate-400 text-sm">
                    This action cannot be undone. This will permanently delete
                    the user <strong>{deleteUserModal.username}</strong>.
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  Type{" "}
                  <span className="font-bold text-white">
                    {deleteUserModal.username}
                  </span>{" "}
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
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() =>
                    setDeleteUserModal({
                      show: false,
                      username: "",
                      confirmText: "",
                    })
                  }
                  disabled={deletingUser}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteUser}
                  disabled={
                    deleteUserModal.confirmText !== deleteUserModal.username ||
                    deletingUser
                  }
                  variant="destructive"
                  className="flex-1"
                >
                  {deletingUser ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Database Modal */}
      <AnimatePresence>
        {deleteDbModal.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() =>
              !deletingDb &&
              setDeleteDbModal({ show: false, dbName: "", confirmText: "" })
            }
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-2xl border-2 border-red-500/30 shadow-2xl max-w-md w-full p-6"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 rounded-full bg-red-500/20">
                  <AlertCircle className="h-6 w-6 text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white mb-2">
                    Delete Database
                  </h3>
                  <p className="text-slate-400 text-sm">
                    This action cannot be undone. This will permanently delete
                    the database <strong>{deleteDbModal.dbName}</strong> and all
                    its data.
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  Type{" "}
                  <span className="font-bold text-white">
                    {deleteDbModal.dbName}
                  </span>{" "}
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
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() =>
                    setDeleteDbModal({ show: false, dbName: "", confirmText: "" })
                  }
                  disabled={deletingDb}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteDatabase}
                  disabled={
                    deleteDbModal.confirmText !== deleteDbModal.dbName ||
                    deletingDb
                  }
                  variant="destructive"
                  className="flex-1"
                >
                  {deletingDb ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Password Modal */}
      <AnimatePresence>
        {resetPasswordModal.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() =>
              setResetPasswordModal({
                show: false,
                username: "",
                newPassword: "",
              })
            }
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-2xl border-2 border-blue-500/30 shadow-2xl max-w-md w-full p-6"
            >
              <div className="text-center mb-6">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                  <RefreshCw className="h-6 w-6 text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  Password Reset Successfully
                </h3>
                <p className="text-slate-400 text-sm">
                  New password for user{" "}
                  <strong>{resetPasswordModal.username}</strong>
                </p>
              </div>

              <div className="bg-slate-800 rounded-lg p-4 mb-6">
                <p className="text-slate-400 text-sm mb-2">New Password:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-green-400 font-mono text-sm break-all">
                    {resetPasswordModal.newPassword}
                  </code>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        resetPasswordModal.newPassword,
                        "Password"
                      )
                    }
                    className="p-2 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                    title="Copy password"
                  >
                    <Eye className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
              </div>

              <Button
                onClick={() =>
                  setResetPasswordModal({
                    show: false,
                    username: "",
                    newPassword: "",
                  })
                }
                className="w-full"
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
