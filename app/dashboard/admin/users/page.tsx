'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Search,
  Loader2,
  Shield,
  ShieldCheck,
  Ban,
  CheckCircle,
  User,
  Server,
  Gamepad2,
  Database as DatabaseIcon,
  FolderOpen,
  Code,
  Calendar,
  Mail,
  AlertCircle,
  UserCog,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios/axios';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSession } from '../../provider';
import { useRouter } from 'next/navigation';

interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  email: string | null;
  avatar: string | null;
  bio: string | null;
  roles: string[] | null;
  suspend: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  discord: string | null;
  steam: string | null;
  stats?: {
    servers: number;
    gameServers: number;
    clusters: number;
  };
}

interface ServerResource {
  id: string;
  hostname: string;
  os: string;
  status: string;
  created_at: string;
}

interface GameServerResource {
  id: number;
  name: string;
  game_type: string;
  status: string;
  ip: string;
  port: number;
}

interface ClusterResource {
  id: string;
  clusterId: string;
  clusterName: string;
  status: string;
  k8sVersion: string;
  created_at: string;
}

interface ProjectResource {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

interface AppResource {
  id: string;
  name: string;
  github_url: string;
  status: string;
  created_at: string;
}

interface UserDetails {
  profile: UserProfile & { email: string | null };
  resources: {
    servers: ServerResource[];
    gameServers: GameServerResource[];
    clusters: ClusterResource[];
    projects: ProjectResource[];
    apps: AppResource[];
  };
  stats: {
    totalServers: number;
    totalGameServers: number;
    totalClusters: number;
    totalProjects: number;
    totalApps: number;
  };
}

const ROLE_OPTIONS = [
  { value: 'member', label: 'Member', icon: User },
  { value: 'admin', label: 'Admin', icon: ShieldCheck },
];

export default function AdminUsersPage() {
  const session = useSession();
  const router = useRouter();
  
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);

  // Check if current user is admin
  useEffect(() => {
    if (!session) {
      router.push('/signin');
      toast.error('You must be logged in');
      return;
    }

    // Check admin role (you may want to fetch this from user profile)
    const checkAdminRole = async () => {
      try {
        // Try to fetch users - if it fails with 403, redirect
        await fetchUsers(1, '', '');
      } catch (error) {
        if (error && typeof error === 'object' && 'response' in error) {
          const err = error as { response?: { status?: number } };
          if (err.response?.status === 403) {
            router.push('/dashboard');
            toast.error('Access denied - Admin privileges required');
          }
        }
      }
    };

    checkAdminRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const fetchUsers = async (page: number, search: string, role: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
      });

      if (search) params.append('search', search);
      if (role) params.append('role', role);

      const response = await api.get(`/admin/users?${params.toString()}`);
      
      setUsers(response.data.data);
      setTotalPages(response.data.pagination.totalPages);
      setTotalUsers(response.data.pagination.total);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error fetching users:', error);
      if (error && typeof error === 'object' && 'response' in error) {
        const err = error as { response?: { status?: number } };
        if (err.response?.status !== 403) {
          toast.error('Failed to fetch users');
        }
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const fetchUserDetails = async (userId: string) => {
    try {
      setDetailsLoading(true);
      const response = await api.get(`/admin/users/${userId}`);
      setSelectedUser(response.data);
    } catch (error) {
      console.error('Error fetching user details:', error);
      toast.error('Failed to fetch user details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchUsers(1, searchQuery, roleFilter);
  };

  const handleRoleFilterChange = (value: string) => {
    setRoleFilter(value === 'all' ? '' : value);
    setCurrentPage(1);
    fetchUsers(1, searchQuery, value === 'all' ? '' : value);
  };

  const handleViewDetails = (user: UserProfile) => {
    setIsDetailsOpen(true);
    fetchUserDetails(user.id);
  };

  const handleOpenRoleDialog = (user: UserProfile) => {
    setEditingUser(user);
    setSelectedRoles(user.roles || []);
    setIsRoleDialogOpen(true);
  };

  const handleToggleRole = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role)
        ? prev.filter((r) => r !== role)
        : [...prev, role]
    );
  };

  const handleUpdateUser = async (suspend?: boolean) => {
    if (!editingUser) return;

    try {
      setUpdating(true);
      
      const updates: { roles?: string[]; suspend?: boolean } = {};
      
      if (suspend !== undefined) {
        updates.suspend = suspend;
      } else {
        updates.roles = selectedRoles;
      }

      await api.patch('/admin/users', {
        userId: editingUser.id,
        ...updates,
      });

      toast.success('User updated successfully');
      setIsRoleDialogOpen(false);
      fetchUsers(currentPage, searchQuery, roleFilter);
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Failed to update user');
    } finally {
      setUpdating(false);
    }
  };

  const handleSuspendToggle = async (user: UserProfile) => {
    setEditingUser(user);
    setUpdating(true);
    
    try {
      await api.patch('/admin/users', {
        userId: user.id,
        suspend: !user.suspend,
      });

      toast.success(user.suspend ? 'User activated' : 'User suspended');
      fetchUsers(currentPage, searchQuery, roleFilter);
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Failed to update user status');
    } finally {
      setUpdating(false);
      setEditingUser(null);
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-neutral-400 animate-spin mx-auto mb-3" />
          <p className="text-neutral-400 text-sm">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#0a0a0a] min-h-screen p-4 sm:p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1600px] mx-auto"
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-neutral-800 rounded-lg">
              <UserCog className="h-6 w-6 text-neutral-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">User Management</h1>
              <p className="text-sm text-neutral-400 mt-0.5">
                {totalUsers} registered users
              </p>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-500" />
              <Input
                placeholder="Search by username, email, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500 focus:border-neutral-700 focus:ring-0"
              />
            </div>
            <Button 
              onClick={handleSearch} 
              className="bg-neutral-800 hover:bg-neutral-700 text-white border-0"
            >
              Search
            </Button>
          </div>
          
          <Select value={roleFilter || 'all'} onValueChange={handleRoleFilterChange}>
            <SelectTrigger className="w-[180px] bg-neutral-900 border-neutral-800 text-white focus:ring-0">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              <SelectItem value="all" className="text-white focus:bg-neutral-800 focus:text-white">All Roles</SelectItem>
              <SelectItem value="admin" className="text-white focus:bg-neutral-800 focus:text-white">Admins</SelectItem>
              <SelectItem value="member" className="text-white focus:bg-neutral-800 focus:text-white">Members</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Users Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-[1600px] mx-auto"
      >
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-800/50 border-b border-neutral-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Roles
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Resources
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-neutral-800/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-neutral-700">
                          <AvatarImage src={user.avatar || undefined} />
                          <AvatarFallback className="bg-neutral-700 text-neutral-200 text-sm">
                            {(user.username || user.display_name || user.email || 'U')[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium text-white text-sm truncate">
                            {user.display_name || user.username || 'Unknown User'}
                          </div>
                          {user.username && (
                            <div className="text-xs text-neutral-500 truncate">
                              @{user.username}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-neutral-300 truncate max-w-[200px]">
                        {user.email || <span className="text-neutral-600">No email</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1.5 flex-wrap">
                        {user.roles && user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <span
                              key={role}
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                role === 'admin'
                                  ? 'bg-neutral-700 text-neutral-200'
                                  : 'bg-neutral-800 text-neutral-400'
                              }`}
                            >
                              {role === 'admin' && <ShieldCheck className="h-3 w-3 mr-1" />}
                              {role}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-neutral-600">No roles</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-3 text-xs text-neutral-400">
                        <span title="Servers" className="flex items-center gap-1">
                          <Server className="h-3.5 w-3.5" />
                          {user.stats?.servers || 0}
                        </span>
                        <span title="Game Servers" className="flex items-center gap-1">
                          <Gamepad2 className="h-3.5 w-3.5" />
                          {user.stats?.gameServers || 0}
                        </span>
                        <span title="Clusters" className="flex items-center gap-1">
                          <DatabaseIcon className="h-3.5 w-3.5" />
                          {user.stats?.clusters || 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {user.suspend ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-950/50 text-red-400 border border-red-900">
                          <Ban className="h-3 w-3" />
                          Suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-emerald-950/50 text-emerald-400 border border-emerald-900">
                          <CheckCircle className="h-3 w-3" />
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-400">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewDetails(user)}
                          className="h-8 px-3 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-0"
                        >
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenRoleDialog(user)}
                          className="h-8 w-8 p-0 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-0"
                          title="Manage roles"
                        >
                          <Shield className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSuspendToggle(user)}
                          disabled={updating && editingUser?.id === user.id}
                          className={`h-8 w-8 p-0 border-0 ${
                            user.suspend
                              ? 'bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400'
                              : 'bg-red-900/30 hover:bg-red-900/50 text-red-400'
                          }`}
                          title={user.suspend ? 'Activate user' : 'Suspend user'}
                        >
                          {updating && editingUser?.id === user.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : user.suspend ? (
                            <CheckCircle className="h-3.5 w-3.5" />
                          ) : (
                            <Ban className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
              <div className="text-sm text-neutral-400">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => fetchUsers(currentPage - 1, searchQuery, roleFilter)}
                  disabled={currentPage === 1 || loading}
                  className="h-8 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed border-0"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => fetchUsers(currentPage + 1, searchQuery, roleFilter)}
                  disabled={currentPage === totalPages || loading}
                  className="h-8 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed border-0"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* User Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto bg-neutral-900 border-neutral-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <User className="h-5 w-5 text-neutral-400" />
              User Details
            </DialogTitle>
            <DialogDescription className="text-neutral-500 text-sm">
              Comprehensive user information and resource overview
            </DialogDescription>
          </DialogHeader>

          {detailsLoading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
            </div>
          ) : selectedUser ? (
            <div className="space-y-5">
              {/* Profile Section */}
              <div className="flex items-start gap-4 p-4 bg-neutral-800 rounded-lg border border-neutral-700">
                <Avatar className="h-16 w-16 border-2 border-neutral-700">
                  <AvatarImage src={selectedUser.profile.avatar || undefined} />
                  <AvatarFallback className="bg-neutral-700 text-neutral-200 text-lg">
                    {(selectedUser.profile.username || selectedUser.profile.email || 'U')[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-white">
                    {selectedUser.profile.display_name || selectedUser.profile.username || 'Unknown User'}
                  </h3>
                  {selectedUser.profile.username && (
                    <p className="text-sm text-neutral-400">@{selectedUser.profile.username}</p>
                  )}
                  
                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-neutral-300">
                      <Mail className="h-3.5 w-3.5 text-neutral-500" />
                      {selectedUser.profile.email || <span className="text-neutral-600">No email</span>}
                    </div>
                    <div className="flex items-center gap-2 text-neutral-300">
                      <Calendar className="h-3.5 w-3.5 text-neutral-500" />
                      Joined {new Date(selectedUser.profile.created_at || '').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                  </div>

                  {selectedUser.profile.bio && (
                    <p className="mt-3 text-sm text-neutral-400">{selectedUser.profile.bio}</p>
                  )}

                  <div className="mt-3 flex gap-1.5 flex-wrap">
                    {selectedUser.profile.roles?.map((role) => (
                      <span
                        key={role}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          role === 'admin'
                            ? 'bg-neutral-700 text-neutral-200'
                            : 'bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard
                  icon={Server}
                  label="Servers"
                  value={selectedUser.stats.totalServers}
                />
                <StatCard
                  icon={Gamepad2}
                  label="Game Servers"
                  value={selectedUser.stats.totalGameServers}
                />
                <StatCard
                  icon={DatabaseIcon}
                  label="Clusters"
                  value={selectedUser.stats.totalClusters}
                />
                <StatCard
                  icon={FolderOpen}
                  label="Projects"
                  value={selectedUser.stats.totalProjects}
                />
                <StatCard
                  icon={Code}
                  label="Apps"
                  value={selectedUser.stats.totalApps}
                />
              </div>

              {/* Resources Tabs */}
              <div className="space-y-4">
                {selectedUser.resources.servers.length > 0 && (
                  <ResourceSection
                    title="Servers"
                    icon={Server}
                    items={selectedUser.resources.servers}
                    renderItem={(server) => (
                      <div className="text-sm">
                        <div className="font-medium text-neutral-200">{server.hostname}</div>
                        <div className="text-neutral-500 text-xs mt-0.5">
                          {server.os} • {server.status}
                        </div>
                      </div>
                    )}
                  />
                )}

                {selectedUser.resources.gameServers.length > 0 && (
                  <ResourceSection
                    title="Game Servers"
                    icon={Gamepad2}
                    items={selectedUser.resources.gameServers}
                    renderItem={(gs) => (
                      <div className="text-sm">
                        <div className="font-medium text-neutral-200">{gs.name}</div>
                        <div className="text-neutral-500 text-xs mt-0.5">
                          {gs.game_type} • {gs.ip}:{gs.port}
                        </div>
                      </div>
                    )}
                  />
                )}

                {selectedUser.resources.clusters.length > 0 && (
                  <ResourceSection
                    title="Kubernetes Clusters"
                    icon={DatabaseIcon}
                    items={selectedUser.resources.clusters}
                    renderItem={(cluster) => (
                      <div className="text-sm">
                        <div className="font-medium text-neutral-200">{cluster.clusterName}</div>
                        <div className="text-neutral-500 text-xs mt-0.5">
                          {cluster.k8sVersion} • {cluster.status}
                        </div>
                      </div>
                    )}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-neutral-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-2 text-neutral-600" />
              <p className="text-sm">Failed to load user details</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Role Management Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="bg-neutral-900 border-neutral-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <Shield className="h-5 w-5 text-neutral-400" />
              Manage User Roles
            </DialogTitle>
            <DialogDescription className="text-neutral-500 text-sm">
              Update roles for {editingUser?.username || editingUser?.email || 'user'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {ROLE_OPTIONS.map((role) => (
              <div
                key={role.value}
                className="flex items-center space-x-3 p-3 rounded-lg bg-neutral-800 hover:bg-neutral-750 transition-colors border border-neutral-700"
              >
                <Checkbox
                  id={role.value}
                  checked={selectedRoles.includes(role.value)}
                  onCheckedChange={() => handleToggleRole(role.value)}
                  className="border-neutral-600 data-[state=checked]:bg-neutral-700 data-[state=checked]:border-neutral-600"
                />
                <label
                  htmlFor={role.value}
                  className="flex-1 flex items-center gap-2 cursor-pointer text-sm"
                >
                  <role.icon className="h-4 w-4 text-neutral-400" />
                  <span className="font-medium text-neutral-200">{role.label}</span>
                </label>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => setIsRoleDialogOpen(false)}
              disabled={updating}
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-0"
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleUpdateUser()}
              disabled={updating}
              className="bg-neutral-700 hover:bg-neutral-600 text-white border-0"
            >
              {updating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Roles'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="p-3 bg-neutral-800 rounded-lg border border-neutral-700">
      <div className="flex items-center gap-1.5 text-neutral-500 mb-1.5">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

function ResourceSection<T extends { id: string | number }>({
  title,
  icon: Icon,
  items,
  renderItem,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  return (
    <div className="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
      <h4 className="font-medium flex items-center gap-2 mb-3 text-neutral-200 text-sm">
        <Icon className="h-4 w-4 text-neutral-400" />
        {title} ({items.length})
      </h4>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {items.map((item, idx) => (
          <div
            key={item.id || idx}
            className="p-3 bg-neutral-900 rounded border border-neutral-800"
          >
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
