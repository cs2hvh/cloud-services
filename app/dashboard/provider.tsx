"use client";

import React, { createContext, useContext, useState } from "react";
import { Tables } from "@/lib/supabase/types";

type UserProfile = Tables<'user_profiles'> & { email?: string };
type Project = Tables<'projects'>;

interface SupabaseSessionContextValue {
    user: UserProfile | null;
    setUser: (user: UserProfile | null) => void;
    projects: Project[];
    setProjects: (projects: Project[]) => void;
}

const SupabaseSessionContext = createContext<SupabaseSessionContextValue | undefined>(undefined);

interface SupabaseSessionProviderProps {
    initialUser?: UserProfile | null;
    initialProjects: Project[];
    children: React.ReactNode;
}

export function SessionProvider({
    initialUser = null,
    initialProjects,
    children
}: SupabaseSessionProviderProps) {
    const [user, setUser] = useState<UserProfile | null>(initialUser);
    const [projects, setProjects] = useState<Project[]>(initialProjects);

    return (
        <SupabaseSessionContext.Provider value={{
            user, setUser,
            projects, setProjects
        }}>
            {children}
        </SupabaseSessionContext.Provider>
    );
}

// You can import and use this hook in any client component
export function useSession() {
    const context = useContext(SupabaseSessionContext);
    if (!context) {
        throw new Error("useSession must be used within a <SessionProvider>");
    }
    return context;
}

export function useProjects() {
    const context = useContext(SupabaseSessionContext);
    if (!context) {
        throw new Error("useProjects must be used within a <SessionProvider>");
    }
    return {
        projects: context.projects,
        setProjects: context.setProjects
    };
}