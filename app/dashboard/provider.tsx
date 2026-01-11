"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Tables } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/client";

type UserProfile = Tables<"user_profiles"> & { email?: string };
type Project = Tables<"projects">;

interface SupabaseSessionContextValue {
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;
  projects: Project[];
  setProjects: (projects: Project[]) => void;
}

const SupabaseSessionContext = createContext<
  SupabaseSessionContextValue | undefined
>(undefined);

interface SupabaseSessionProviderProps {
  initialUser?: UserProfile | null;
  initialProjects: Project[];
  children: React.ReactNode;
}

/**
 * Session refresh interval in milliseconds.
 * We refresh every 10 minutes to ensure the session stays active.
 * Supabase sessions have a default JWT expiry of ~1 hour, but we refresh
 * more frequently to ensure uninterrupted access.
 */
const SESSION_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

export function SessionProvider({
  initialUser = null,
  initialProjects,
  children,
}: SupabaseSessionProviderProps) {
  const [user, setUser] = useState<UserProfile | null>(initialUser);
  const [projects, setProjects] = useState<Project[]>(initialProjects);

  // Periodically refresh the Supabase session to prevent logout
  const refreshSession = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.log('[SessionProvider] Session refresh error:', error.message);
        return;
      }
      
      if (data.session) {
        // Session is valid, check if we need to refresh it
        const expiresAt = data.session.expires_at;
        const now = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = expiresAt ? expiresAt - now : 0;
        
        // If session expires in less than 20 minutes, trigger a refresh
        if (timeUntilExpiry < 20 * 60) {
          console.log('[SessionProvider] Session expiring soon, refreshing...');
          await supabase.auth.refreshSession();
        }
      }
    } catch (err) {
      console.error('[SessionProvider] Failed to refresh session:', err);
    }
  }, []);

  useEffect(() => {
    // Initial session check
    refreshSession();

    // Set up periodic session refresh
    const intervalId = setInterval(refreshSession, SESSION_REFRESH_INTERVAL);

    // Also refresh when the window regains focus (user returns to tab)
    const handleFocus = () => {
      console.log('[SessionProvider] Window focused, refreshing session...');
      refreshSession();
    };
    window.addEventListener('focus', handleFocus);

    // Also refresh when the page becomes visible (e.g., switching tabs)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[SessionProvider] Page visible, refreshing session...');
        refreshSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshSession]);

  return (
    <SupabaseSessionContext.Provider
      value={{
        user,
        setUser,
        projects,
        setProjects,
      }}
    >
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
    setProjects: context.setProjects,
  };
}
