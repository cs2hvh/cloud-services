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
 * Session refresh is primarily handled by middleware, which runs on every request.
 * This provider only refreshes when the user returns to the tab (focus/visibility).
 * The periodic interval is disabled because it's redundant with middleware refresh.
 */

export function SessionProvider({
  initialUser = null,
  initialProjects,
  children,
}: SupabaseSessionProviderProps) {
  const [user, setUser] = useState<UserProfile | null>(initialUser);
  const [projects, setProjects] = useState<Project[]>(initialProjects);

  /**
   * Validates that a session exists
   * Does NOT refresh - middleware handles that
   * Only redirects if session is completely missing (logged out)
   */
  const validateSession = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.log('[SessionProvider] Session check error:', error.message);
        return;
      }

      if (!data.session) {
        console.log('[SessionProvider] No active session found - user logged out');
        window.location.href = '/signin?session_expired=true';
      } else {
        const expiresAt = data.session.expires_at;
        const now = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = expiresAt ? expiresAt - now : 0;
        console.log('[SessionProvider] Session valid for', Math.floor(timeUntilExpiry / 60), 'more minutes');
      }
    } catch (err) {
      console.error('[SessionProvider] Failed to check session:', err);
    }
  }, []);

  useEffect(() => {
    // Initial session check on mount
    validateSession();

    // Validate session when the user returns to the tab
    // Middleware will handle the actual refresh
    const handleFocus = () => {
      console.log('[SessionProvider] Window focused, validating session...');
      validateSession();
    };
    window.addEventListener('focus', handleFocus);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[SessionProvider] Page visible, validating session...');
        validateSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [validateSession]);

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
