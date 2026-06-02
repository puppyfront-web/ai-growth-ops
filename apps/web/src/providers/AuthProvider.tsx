'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authToken } from '@/lib/api/client';
import { getMe, login as loginApi, register as registerApi, logout as logoutApi } from '@/lib/api/auth';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerifiedAt?: string | null;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  setAuthFromRegister: (data: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  setAuthFromRegister: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const u = await getMe();
      setUser(u);
    } catch {
      authToken.clear();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const token = authToken.get();
    if (!token) {
      setIsLoading(false);
      return;
    }
    getMe()
      .then((u) => setUser(u))
      .catch(() => {
        authToken.clear();
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginApi({ email, password });
    authToken.set(result.token);
    setUser(result.user);
  }, []);

  const setAuthFromRegister = useCallback(async (data: { name: string; email: string; password: string }) => {
    const result = await registerApi(data);
    authToken.set(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      // ignore — clear locally anyway
    }
    authToken.clear();
    setUser(null);
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, setAuthFromRegister, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
