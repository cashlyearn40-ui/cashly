import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl, queryClient, setUserToken } from "@/lib/query-client";

const SESSION_KEY      = "@cashly_session";
const ADMIN_FLAG_KEY   = "@cashly_admin_session";
const ADMIN_TOKEN_KEY  = "@cashly_admin_token";
const USER_TOKEN_KEY   = "@cashly_user_token";
const ADMIN_EMAIL      = "cashlyearn40@gmail.com";

export type CashlyUser = {
  email: string;
  password: string;
  createdAt: number;
};

interface AuthContextValue {
  currentUser: CashlyUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoaded: boolean;
  adminToken: string | null;
  userToken: string | null;
  isAdminPinVerified: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  verifyAdminPin: (pin: string) => Promise<void>;
  changeAdminPin: (currentPin: string, newPin: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser]               = useState<CashlyUser | null>(null);
  const [isAdmin, setIsAdmin]                       = useState(false);
  const [isLoaded, setIsLoaded]                     = useState(false);
  const [adminToken, setAdminToken]                 = useState<string | null>(null);
  const [userToken, setUserTokenState]              = useState<string | null>(null);
  const [isAdminPinVerified, setIsAdminPinVerified] = useState(false);

  // ── Presence beacon (web only) ─────────────────────────────────────────
  const presenceEsRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const email = currentUser?.email;
    // Presence requires a valid user token (SSE can't send custom headers, so token is in query param)
    if (!email || email === ADMIN_EMAIL || isAdmin || !userToken) {
      presenceEsRef.current?.close();
      presenceEsRef.current = null;
      return;
    }
    presenceEsRef.current?.close();
    try {
      const url = `${getApiUrl()}api/user/presence?token=${encodeURIComponent(userToken)}`;
      const es = new EventSource(url);
      presenceEsRef.current = es;
    } catch {}
    return () => {
      presenceEsRef.current?.close();
      presenceEsRef.current = null;
    };
  }, [currentUser?.email, isAdmin, userToken]);

  // ── Restore session ────────────────────────────────────────────────────
  useEffect(() => {
    async function restoreSession() {
      try {
        const email = await AsyncStorage.getItem(SESSION_KEY);
        if (email) {
          const adminFlag = await AsyncStorage.getItem(ADMIN_FLAG_KEY);
          if (email === ADMIN_EMAIL && adminFlag === "true") {
            const storedToken = await AsyncStorage.getItem(ADMIN_TOKEN_KEY);
            setCurrentUser({ email: ADMIN_EMAIL, password: "", createdAt: 0 });
            setIsAdmin(true);
            setAdminToken(storedToken ?? null);
            // PIN is never persisted — must re-verify on each session restore
            setIsAdminPinVerified(false);
          } else {
            const storedUserToken = await AsyncStorage.getItem(USER_TOKEN_KEY);
            setCurrentUser({ email, password: "", createdAt: 0 });
            setIsAdmin(false);
            setUserTokenState(storedUserToken ?? null);
            // Sync to module-level so all API calls carry the token immediately
            setUserToken(storedUserToken ?? null);
          }
        }
      } catch {
      } finally {
        setIsLoaded(true);
      }
    }
    restoreSession();
  }, []);

  // ── Auth actions ───────────────────────────────────────────────────────
  const login = async (email: string, password: string): Promise<void> => {
    const res  = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    const trimmed = email.trim().toLowerCase();
    queryClient.clear();

    if (data.isAdmin) {
      const token = data.adminToken ?? null;
      await AsyncStorage.setItem(SESSION_KEY, ADMIN_EMAIL);
      await AsyncStorage.setItem(ADMIN_FLAG_KEY, "true");
      if (token) await AsyncStorage.setItem(ADMIN_TOKEN_KEY, token);
      await AsyncStorage.removeItem(USER_TOKEN_KEY);
      setCurrentUser({ email: ADMIN_EMAIL, password: "", createdAt: 0 });
      setIsAdmin(true);
      setAdminToken(token);
      setUserTokenState(null);
      setUserToken(null);
      setIsAdminPinVerified(false);
    } else {
      const uToken = data.userToken ?? null;
      await AsyncStorage.setItem(SESSION_KEY, trimmed);
      await AsyncStorage.removeItem(ADMIN_FLAG_KEY);
      await AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
      if (uToken) await AsyncStorage.setItem(USER_TOKEN_KEY, uToken);
      setCurrentUser({ email: trimmed, password: "", createdAt: data.createdAt ?? 0 });
      setIsAdmin(false);
      setAdminToken(null);
      setUserTokenState(uToken);
      setUserToken(uToken);
    }
  };

  const signup = async (email: string, password: string): Promise<void> => {
    const res  = await apiRequest("POST", "/api/auth/signup", { email, password });
    const data = await res.json();
    const trimmed = email.trim().toLowerCase();
    const uToken = data.userToken ?? null;
    queryClient.clear();
    await AsyncStorage.setItem(SESSION_KEY, trimmed);
    await AsyncStorage.removeItem(ADMIN_FLAG_KEY);
    await AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
    if (uToken) await AsyncStorage.setItem(USER_TOKEN_KEY, uToken);
    setCurrentUser({ email: trimmed, password: "", createdAt: data.createdAt ?? Date.now() });
    setIsAdmin(false);
    setAdminToken(null);
    setUserTokenState(uToken);
    setUserToken(uToken);
  };

  const deleteAccount = async (): Promise<void> => {
    if (!currentUser || currentUser.email === ADMIN_EMAIL) return;
    // Server identifies the user from the x-user-token header (injected by apiRequest)
    await apiRequest("DELETE", "/api/user/account").catch(() => {});
  };

  const logout = async (): Promise<void> => {
    if (adminToken) {
      try {
        await apiRequest("POST", "/api/admin/logout", {}, { "x-admin-token": adminToken });
      } catch {}
    }
    if (userToken) {
      try {
        // Invalidate the server-side session token immediately
        await apiRequest("POST", "/api/user/logout");
      } catch {}
    }
    queryClient.clear();
    await AsyncStorage.multiRemove([SESSION_KEY, ADMIN_FLAG_KEY, ADMIN_TOKEN_KEY, USER_TOKEN_KEY]);
    setCurrentUser(null);
    setIsAdmin(false);
    setAdminToken(null);
    setUserTokenState(null);
    setUserToken(null);
    setIsAdminPinVerified(false);
  };

  const changePassword = async (current: string, next: string): Promise<void> => {
    if (!currentUser) throw new Error("Not logged in.");
    // Server identifies the user from the x-user-token header — no email in body
    await apiRequest("PUT", "/api/user/password", {
      currentPassword: current,
      newPassword: next,
    });
  };

  // ── Admin PIN ──────────────────────────────────────────────────────────
  const verifyAdminPin = async (pin: string): Promise<void> => {
    if (!adminToken) throw new Error("No admin session.");
    await apiRequest("POST", "/api/admin/pin/verify", { pin }, { "x-admin-token": adminToken });
    setIsAdminPinVerified(true);
  };

  const changeAdminPin = async (currentPin: string, newPin: string): Promise<void> => {
    if (!adminToken) throw new Error("No admin session.");
    await apiRequest("POST", "/api/admin/pin/change", { currentPin, newPin }, { "x-admin-token": adminToken });
  };

  const value = useMemo(
    () => ({
      currentUser,
      isAuthenticated: currentUser !== null,
      isAdmin,
      isLoaded,
      adminToken,
      userToken,
      isAdminPinVerified,
      login,
      signup,
      logout,
      deleteAccount,
      changePassword,
      verifyAdminPin,
      changeAdminPin,
    }),
    [currentUser, isAdmin, isLoaded, adminToken, userToken, isAdminPinVerified]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
