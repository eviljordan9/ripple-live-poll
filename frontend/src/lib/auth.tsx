import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type User } from "@/lib/api";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await api.getMe();
    setUser(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getMe()
      .then((next) => {
        if (!cancelled) setUser(next);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const next = await api.signup(name, email, password);
    setUser(next);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await api.login(email, password);
    setUser(next);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, signup, login, logout }),
    [user, loading, refresh, signup, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
