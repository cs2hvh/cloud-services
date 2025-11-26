import { useState } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronRight, User, AlertCircle, Search, CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  AdminDatabaseState,
  AdminDatabaseErrors,
} from "@/lib/types/admin-database";

interface UserSelectionStepProps {
  state: AdminDatabaseState;
  setState: (state: AdminDatabaseState) => void;
  errors: AdminDatabaseErrors;
  setErrors: (errors: AdminDatabaseErrors) => void;
  allUsers: any[];
  onNext: () => void;
}

export const UserSelectionStep = ({
  state,
  setState,
  errors,
  setErrors,
  allUsers,
  onNext,
}: UserSelectionStepProps) => {
  const [userSearchQuery, setUserSearchQuery] = useState("");

  const filteredUsers = allUsers.filter(
    (user) =>
      !userSearchQuery ||
      user.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      (user.username &&
        user.username.toLowerCase().includes(userSearchQuery.toLowerCase())) ||
      user.id.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  const handleUserSelect = (userId: string) => {
    setState({
      ...state,
      selectedUser: userId,
      selectedProject: "",
    });
    if (errors.user) {
      setErrors({ ...errors, user: "" });
    }
  };

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <User className="h-5 w-5" />
          Select User
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Search Bar */}
          <div>
            <Label className="text-white mb-2 block">
              Search and Select User
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-500" />
              <Input
                placeholder="Search by email, username, or user ID..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="pl-10 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500 focus:border-neutral-700 focus:ring-0"
              />
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-md border border-white/10 bg-neutral-900/50">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-white/80">Email</TableHead>
                  <TableHead className="text-white/80">Username</TableHead>
                  <TableHead className="text-white/80">User ID</TableHead>
                  <TableHead className="text-white/80 w-20">Select</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-white/60">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow
                      key={user.id}
                      className={`border-white/10 hover:bg-white/5 cursor-pointer transition-colors ${
                        state.selectedUser === user.id ? "bg-blue-600/20 border-blue-500/30" : ""
                      }`}
                      onClick={() => handleUserSelect(user.id)}
                    >
                      <TableCell className="text-white font-medium">
                        {user.email}
                      </TableCell>
                      <TableCell className="text-white/80">
                        {user.username ? `@${user.username}` : (
                          <span className="text-white/40 italic">No username</span>
                        )}
                      </TableCell>
                      <TableCell className="text-white/60 font-mono text-sm">
                        {user.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUserSelect(user.id);
                          }}
                          className={`p-2 h-8 w-8 rounded-full ${
                            state.selectedUser === user.id
                              ? "bg-blue-600 hover:bg-blue-700 text-white"
                              : "bg-white/10 hover:bg-white/20 text-white/60"
                          }`}
                        >
                          {state.selectedUser === user.id ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-current" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Show selected user info */}
          {state.selectedUser && (
            <div className="p-3 bg-blue-600/10 border border-blue-500/30 rounded-md">
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span>Selected User:</span>
              </div>
              <div className="mt-1 text-white">
                <span className="font-medium">
                  {allUsers.find(u => u.id === state.selectedUser)?.email}
                </span>
                {allUsers.find(u => u.id === state.selectedUser)?.username && (
                  <span className="text-white/60 ml-2">
                    (@{allUsers.find(u => u.id === state.selectedUser)?.username})
                  </span>
                )}
              </div>
            </div>
          )}

          {errors.user && (
            <div className="flex items-center gap-2 text-red-500 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{errors.user}</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={!state.selectedUser}
          className="cursor-pointer bg-white text-black rounded-md hover:bg-gray-200"
        >
          Next <ChevronRight size={16} className="ml-2" />
        </Button>
      </CardFooter>
    </Card>
  );
};
