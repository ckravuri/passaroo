// Auth context — handles email/password + Google OAuth via Emergent.
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";

import { api, clearToken, getToken, setToken } from "@/src/api";

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  plan: "guest" | "free" | "premium" | "pro";
  is_admin?: boolean;
  streak_days: number;
  xp: number;
  level: number;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, name: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const t = await getToken();
      if (!t) {
        setUser(null);
        return;
      }
      const r = await api<{ user: User }>("/auth/me");
      setUser(r.user);
    } catch {
      await clearToken();
      setUser(null);
    }
  };

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, []);

  const signInEmail = async (email: string, password: string) => {
    const r = await api<{ session_token: string; user: User }>("/auth/email/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    await setToken(r.session_token);
    setUser(r.user);
  };

  const signUpEmail = async (email: string, password: string, name: string) => {
    const r = await api<{ session_token: string; user: User }>("/auth/email/signup", {
      method: "POST",
      body: { email, password, name },
      auth: false,
    });
    await setToken(r.session_token);
    setUser(r.user);
  };

  const signInGoogle = async () => {
    const redirectUrl =
      Platform.OS === "web"
        ? `${window.location.origin}/`
        : Linking.createURL("auth");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type !== "success" || !result.url) {
      throw new Error("Sign-in cancelled");
    }
    const url = result.url;
    const sessionId = extractSessionId(url);
    if (!sessionId) throw new Error("Missing session id from auth response");

    // Exchange session_id for our session token
    const r = await api<{ session_token: string; user: User }>("/auth/google/session", {
      method: "POST",
      body: { session_id: sessionId },
      auth: false,
    });
    await setToken(r.session_token);
    setUser(r.user);
  };

  const signOut = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await clearToken();
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, signInEmail, signUpEmail, signInGoogle, signOut, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

function extractSessionId(url: string): string | null {
  try {
    const hashMatch = url.match(/#session_id=([^&]+)/);
    if (hashMatch) return decodeURIComponent(hashMatch[1]);
    const qMatch = url.match(/[?&]session_id=([^&]+)/);
    if (qMatch) return decodeURIComponent(qMatch[1]);
  } catch {}
  return null;
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
