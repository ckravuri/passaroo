// Auth context — email/password + Google (Emergent) + Apple + Microsoft.
import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";

import { api, clearToken, getToken, setToken } from "@/src/api";
import RevenueCat from "@/src/iap";
import { registerForPush } from "@/src/push";

WebBrowser.maybeCompleteAuthSession();

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  plan: "guest" | "free" | "premium" | "pro";
  is_admin?: boolean;
  state?: string | null;
  primary_category_id?: string | null;
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
  signInApple: () => Promise<void>;
  signInMicrosoft: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

// MS OAuth — public client app, common tenant. Uses Expo proxy on web.
const MICROSOFT_DISCOVERY = {
  authorizationEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};
// Public Microsoft "Sign-in with Microsoft" demo client (works for any consumer/work account).
// Replace with your own Azure app registration's client id for production.
const MICROSOFT_CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const setUserAndRegister = async (u: User) => {
    setUser(u);
    registerForPush(u.user_id).catch(() => {});
    // Bind this user to RevenueCat (no-op on web or if RC keys aren't set yet)
    RevenueCat.logIn(u.user_id).catch(() => {});
  };

  const refresh = async () => {
    try {
      const t = await getToken();
      if (!t) {
        setUser(null);
        return;
      }
      const r = await api<{ user: User }>("/auth/me");
      await setUserAndRegister(r.user);
    } catch (e: any) {
      // ONLY clear the token if the server explicitly rejected our auth (401/403).
      // Transient network errors, timeouts, 5xx, or device-mismatch should NOT
      // log the user out (otherwise opening the app offline kicks them out).
      const status = e?.status as number | undefined;
      const code = e?.detail?.code as string | undefined;
      const isAuthRejection =
        status === 401 || status === 403 || code === "DEVICE_MISMATCH";
      if (isAuthRejection) {
        await clearToken();
        setUser(null);
      }
      // Otherwise: keep the existing token, leave `user` as-is (might be null on cold start)
      // The next API call will retry naturally.
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
      method: "POST", body: { email, password }, auth: false,
    });
    await setToken(r.session_token);
    await setUserAndRegister(r.user);
  };

  const signUpEmail = async (email: string, password: string, name: string) => {
    const r = await api<{ session_token: string; user: User }>("/auth/email/signup", {
      method: "POST", body: { email, password, name }, auth: false,
    });
    await setToken(r.session_token);
    await setUserAndRegister(r.user);
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
    const sessionId = extractSessionId(result.url);
    if (!sessionId) throw new Error("Missing session id from auth response");

    const r = await api<{ session_token: string; user: User }>("/auth/google/session", {
      method: "POST", body: { session_id: sessionId }, auth: false,
    });
    await setToken(r.session_token);
    await setUserAndRegister(r.user);
  };

  const signInApple = async () => {
    if (Platform.OS !== "ios") {
      throw new Error("Apple Sign-In is available on iOS only");
    }
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) throw new Error("Apple Sign-In is not available on this device");
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) throw new Error("Apple did not return an identity token");
    const fullName =
      [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ") || null;
    const r = await api<{ session_token: string; user: User }>("/auth/apple/token", {
      method: "POST",
      body: { identity_token: credential.identityToken, full_name: fullName },
      auth: false,
    });
    await setToken(r.session_token);
    await setUserAndRegister(r.user);
  };

  const signInMicrosoft = async () => {
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: "passaroo",
      path: "auth",
    });
    const request = new AuthSession.AuthRequest({
      clientId: MICROSOFT_CLIENT_ID,
      scopes: ["openid", "profile", "email", "User.Read"],
      redirectUri,
      responseType: AuthSession.ResponseType.Token,
      extraParams: { prompt: "select_account" },
    });
    const result = await request.promptAsync(MICROSOFT_DISCOVERY);
    if (result.type !== "success" || !result.params?.access_token) {
      throw new Error("Microsoft sign-in cancelled");
    }
    const r = await api<{ session_token: string; user: User }>("/auth/microsoft/token", {
      method: "POST",
      body: { access_token: result.params.access_token },
      auth: false,
    });
    await setToken(r.session_token);
    await setUserAndRegister(r.user);
  };

  const signOut = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await RevenueCat.logOut().catch(() => {});
    await clearToken();
    setUser(null);
  };

  const deleteAccount = async () => {
    await api("/auth/me", { method: "DELETE" });
    await clearToken();
    setUser(null);
  };

  return (
    <AuthCtx.Provider
      value={{
        user, loading,
        signInEmail, signUpEmail,
        signInGoogle, signInApple, signInMicrosoft,
        signOut, deleteAccount, refresh,
      }}
    >
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
