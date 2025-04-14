"use client";

import React, { createContext, useContext, useState } from "react";
import type { User, Session } from "lucia";
import { DB_Project } from "@/lib/db/mysql/types";

interface LuciaSessionContextValue {
    user: User | null;
    session: Session | null;
    setUser: (user: User | null) => void;
    setSession: (session: Session | null) => void;
    projects: DB_Project[]; // <-- add this
    setProjects: (projects: DB_Project[]) => void; // <-- and this
}

const LuciaSessionContext = createContext<LuciaSessionContextValue | undefined>(undefined);

interface LuciaSessionProviderProps {
    initialUser?: User | null;
    initialSession?: Session | null;
    initialProjects: DB_Project[];
    children: React.ReactNode;
}

export function SessionProvider({
    initialUser = null,
    initialSession = null,
    initialProjects,
    children
}: LuciaSessionProviderProps) {
    const [user, setUser] = useState<User | null>(initialUser);
    const [session, setSession] = useState<Session | null>(initialSession);
    const [projects, setProjects] = useState<DB_Project[]>(initialProjects);

    return (
        <LuciaSessionContext.Provider value={{
            user, session, setUser, setSession,
            projects, setProjects
        }}>
            {children}
        </LuciaSessionContext.Provider>
    );
}

// You can import and use this hook in any client component
export function useSession() {
    const context = useContext(LuciaSessionContext);
    if (!context) {
        throw new Error("useSession must be used within a <SessionProvider>");
    }
    return context;
}

export function useProjects() {
    const context = useContext(LuciaSessionContext);
    if (!context) {
        throw new Error("useProjects must be used within a <SessionProvider>");
    }
    return {
        projects: context.projects,
        setProjects: context.setProjects
    };
}