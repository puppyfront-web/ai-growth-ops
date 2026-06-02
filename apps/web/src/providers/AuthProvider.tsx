'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authToken, currentOrg } from '@/lib/api/client';
import { getMe, login as loginApi, register as registerApi, logout as logoutApi } from '@/lib/api/auth';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerifiedAt?: string | null;
  avatarUrl?: string | null;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  organizations: Organization[];
  currentOrganization: Organization | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  setAuthFromRegister: (data: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  switchOrganization: (orgId: string) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  organizations: [],
  currentOrganization: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  setAuthFromRegister: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
  switchOrganization: () => {},
});

function selectDefaultOrg(orgs: Organization[]): Organization | null {
  if (orgs.length === 0) return null;
  // Prefer the stored org if it exists in the list
  const stored = currentOrg.get();
  if (stored) {
    const match = orgs.find(o => o.id === stored);
    if (match) return match;
  }
  // Default to first org
  return orgs[0];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyUserData = useCallback((u: User & { organizations?: Organization[] }) => {
    setUser(u);
    if (u.organizations && u.organizations.length > 0) {
      setOrganizations(u.organizations);
      const defaultOrg = selectDefaultOrg(u.organizations);
      if (defaultOrg) {
        setCurrentOrganization(defaultOrg);
        currentOrg.set(defaultOrg.id);
      }
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const u = await getMe();
      applyUserData(u as User & { organizations?: Organization[] });
    } catch {
      authToken.clear();
      currentOrg.clear();
      setUser(null);
      setOrganizations([]);
      setCurrentOrganization(null);
    }
  }, [applyUserData]);

  useEffect(() => {
    const token = authToken.get();
    if (!token) {
      setIsLoading(false);
      return;
    }
    getMe()
      .then((u) => applyUserData(u as User & { organizations?: Organization[] }))
      .catch(() => {
        authToken.clear();
        currentOrg.clear();
        setUser(null);
        setOrganizations([]);
        setCurrentOrganization(null);
      })
      .finally(() => setIsLoading(false));
  }, [applyUserData]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginApi({ email, password });
    authToken.set(result.token);
    applyUserData({
      ...result.user,
      organizations: (result as { organizations?: Organization[] }).organizations || [],
    });
  }, [applyUserData]);

  const setAuthFromRegister = useCallback(async (data: { name: string; email: string; password: string }) => {
    const result = await registerApi(data);
    authToken.set(result.token);
    applyUserData({
      ...result.user,
      organizations: (result as { organizations?: Organization[] }).organizations || [],
    });
  }, [applyUserData]);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      // ignore — clear locally anyway
    }
    authToken.clear();
    currentOrg.clear();
    setUser(null);
    setOrganizations([]);
    setCurrentOrganization(null);
    window.location.href = '/login';
  }, []);

  const switchOrganization = useCallback((orgId: string) => {
    const org = organizations.find(o => o.id === orgId);
    if (org) {
      setCurrentOrganization(org);
      currentOrg.set(org.id);
      // Reload the page to refresh all data with the new org context
      window.location.reload();
    }
  }, [organizations]);

  return (
    <AuthContext.Provider value={{
      user, organizations, currentOrganization,
      isAuthenticated: !!user, isLoading,
      login, setAuthFromRegister, logout, refreshUser, switchOrganization
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
