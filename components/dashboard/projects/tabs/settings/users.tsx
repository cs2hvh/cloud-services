"use client";
import React, { useState } from "react";
import { Search, X, Trash, UserX } from "lucide-react";
import { DB_User } from "@/lib/db/mysql/types";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
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
import axios from "axios";

interface PageProps {
    projectId: string;
    users: DB_User[];
}

const ProjectUsers = ({ projectId, users }: PageProps) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [userToRemove, setUserToRemove] = useState<string | null>(null);

    const filteredUsers = users.filter((user) => {
        const query = searchQuery.toLowerCase();
        return (
            user.username.toLowerCase().includes(query) ||
            user.display_name?.toLowerCase().includes(query) ||
            user.email.toLowerCase().includes(query)
        );
    });

    const handleSelectUser = (userId: string) => {
        setSelectedUsers((prev) =>
            prev.includes(userId)
                ? prev.filter((id) => id !== userId)
                : [...prev, userId]
        );
    };

    const handleRemoveUser = (userId: string) => {
        setUserToRemove(userId);
        setIsConfirmOpen(true);
    };

    const handleRemoveSelected = () => {
        if (selectedUsers.length > 0) {
            setIsConfirmOpen(true);
        }
    };

    const confirmRemove = async () => {
        try {
            await axios.put(`/api/projects/${projectId}`, {
                event: "remove",
                users: userToRemove ? [userToRemove] : selectedUsers
            });
        } catch (error: any) {
            // Log or show error message
            const message = error?.response?.data?.message || "An error occurred.";
            console.error("Remove error:", message);
            // Optionally, show message to user
            // setErrorMessage(message);
        } finally {
            if (!userToRemove) {
                setSelectedUsers([]);
            }
            setUserToRemove(null);
            setIsConfirmOpen(false);
        }
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle>
                    Project Access Management
                </CardTitle>
                <CardDescription>
                    View and manage user access to this project. Remove access for individual or multiple users at once.
                </CardDescription>
            </CardHeader>

            <CardContent>
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search users..."
                                className="pl-8"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <Button
                                    variant="link"
                                    className="absolute right-0 top-0 h-full px-3"
                                    onClick={() => setSearchQuery("")}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        {selectedUsers.length > 0 && (
                            <Button
                                variant="destructive"
                                onClick={handleRemoveSelected}
                                className="flex items-center gap-1 whitespace-nowrap"
                            >
                                <Trash className="h-4 w-4" />
                                Revoke Access ({selectedUsers.length})
                            </Button>
                        )}
                    </div>

                    <div className="rounded-md border">
                        {filteredUsers.length > 0 ? (
                            <div className="divide-y">
                                {filteredUsers.map((user, index) => (
                                    <div
                                        key={user.id}
                                        className={`flex items-center justify-between p-3 ${selectedUsers.includes(user.id) ? "bg-muted/50" : ""
                                            }`}
                                    >
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            <Checkbox
                                                id={`select-${user.id}`}
                                                checked={selectedUsers.includes(user.id)}
                                                onCheckedChange={() => handleSelectUser(user.id)}
                                            />
                                            <Avatar className="h-10 w-10 rounded-lg flex-shrink-0">
                                                <AvatarImage src={user.avatar} alt={user.username} />
                                                <AvatarFallback className="rounded-lg">
                                                    {user.display_name?.substring(0, 2).toUpperCase() ||
                                                        user.username.substring(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="grid flex-1 min-w-0">
                                                <span className="text-sm font-medium truncate">
                                                    {user.display_name || user.username}
                                                </span>
                                                <span className="text-xs text-muted-foreground truncate">
                                                    {user.email}
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => handleRemoveUser(user.id)}
                                        >
                                            Revoke Access
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-muted-foreground">
                                No users found matching your search criteria.
                            </div>
                        )}
                    </div>

                    {users.length > 0 && (
                        <div className="text-xs text-muted-foreground text-right">
                            Showing {filteredUsers.length} of {users.length} users
                        </div>
                    )}
                </div>
            </CardContent>

            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Revoke User Access</AlertDialogTitle>
                        <AlertDialogDescription>
                            {userToRemove
                                ? "Are you sure you want to revoke access for this user? This action cannot be undone."
                                : `Are you sure you want to revoke access for ${selectedUsers.length} selected user${selectedUsers.length > 1 ? 's' : ''}? This action cannot be undone.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmRemove}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            Revoke Access
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
};

export default ProjectUsers;