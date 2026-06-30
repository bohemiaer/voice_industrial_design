"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "./supabase";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export function useAuthSession(): {
  authStatus: AuthStatus;
  session: Session | null;
  error: string | null;
} {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    try {
      const supabase = getSupabaseBrowserClient();

      supabase.auth
        .getSession()
        .then(({ data, error: sessionError }) => {
          if (!isMounted) {
            return;
          }

          if (sessionError) {
            setError(sessionError.message);
            setAuthStatus("unauthenticated");
            return;
          }

          setSession(data.session);
          setAuthStatus(data.session ? "authenticated" : "unauthenticated");
        })
        .catch((unknownError: unknown) => {
          if (!isMounted) {
            return;
          }

          setError(
            unknownError instanceof Error
              ? unknownError.message
              : "Auth session could not be loaded."
          );
          setAuthStatus("unauthenticated");
        });

      const {
        data: { subscription }
      } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        setAuthStatus(nextSession ? "authenticated" : "unauthenticated");
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Auth is not available."
      );
      setAuthStatus("unauthenticated");
      return () => {
        isMounted = false;
      };
    }
  }, []);

  return {
    authStatus,
    session,
    error
  };
}
