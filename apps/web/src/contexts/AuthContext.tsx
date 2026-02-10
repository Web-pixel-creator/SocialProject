'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiClient, setAuthToken } from '../lib/api';

interface AuthUser {
  id: string;
  email: string;
}

interface RegisterConsent {
  terms: boolean;
  privacy: boolean;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    consent: RegisterConsent,
  ) => Promise<void>;
  refreshSession: () => Promise<void>;
  logout: () => void;
}

interface AuthApiPayload {
  token?: string;
  userId?: string;
  email?: string;
  tokens?: {
    accessToken?: string;
  };
  user?: {
    id?: string;
    email?: string;
  };
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const TOKEN_KEY = 'finishit_token';
const USER_KEY = 'finishit_user';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const toAuthApiPayload = (value: unknown): AuthApiPayload => {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  return value as AuthApiPayload;
};

const parseStoredUser = (raw: string | null): AuthUser | null => {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const payload = toAuthApiPayload(parsed);
    const userId = payload.user?.id;
    const email = payload.user?.email;
    if (isNonEmptyString(userId) && isNonEmptyString(email)) {
      return { id: userId, email };
    }
  } catch {
    // ignore malformed localStorage values
  }

  return null;
};

const resolveToken = (payload: AuthApiPayload): string | null => {
  const accessToken = payload.tokens?.accessToken;
  if (isNonEmptyString(accessToken)) {
    return accessToken;
  }
  if (isNonEmptyString(payload.token)) {
    return payload.token;
  }
  return null;
};

const resolveUser = (payload: AuthApiPayload): AuthUser | null => {
  const nestedId = payload.user?.id;
  const nestedEmail = payload.user?.email;
  if (isNonEmptyString(nestedId) && isNonEmptyString(nestedEmail)) {
    return { id: nestedId, email: nestedEmail };
  }

  if (isNonEmptyString(payload.userId) && isNonEmptyString(payload.email)) {
    return { id: payload.userId, email: payload.email };
  }

  return null;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const persistSession = useCallback(
    (nextToken: string, nextUser: AuthUser | null) => {
      setToken(nextToken);
      setUser(nextUser);
      setAuthToken(nextToken);
      try {
        localStorage.setItem(TOKEN_KEY, nextToken);
        if (nextUser) {
          localStorage.setItem(
            USER_KEY,
            JSON.stringify({
              user: nextUser,
            }),
          );
        } else {
          localStorage.removeItem(USER_KEY);
        }
      } catch {
        // ignore localStorage write errors
      }
    },
    [],
  );

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    setAuthToken(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // ignore localStorage write errors
    }
  }, []);

  const fetchCurrentUser = useCallback(async (): Promise<AuthUser> => {
    const response = await apiClient.get('/auth/me');
    const payload = toAuthApiPayload(response.data);
    const currentUser = resolveUser(payload);

    if (!currentUser) {
      throw new Error('Unable to resolve current user');
    }

    return currentUser;
  }, []);

  const refreshSession = useCallback(async () => {
    if (!token) {
      clearSession();
      return;
    }

    setAuthToken(token);
    try {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      try {
        localStorage.setItem(
          USER_KEY,
          JSON.stringify({
            user: currentUser,
          }),
        );
      } catch {
        // ignore localStorage write errors
      }
    } catch (error) {
      clearSession();
      throw error;
    }
  }, [clearSession, fetchCurrentUser, token]);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = parseStoredUser(localStorage.getItem(USER_KEY));

      if (storedToken) {
        setToken(storedToken);
        setAuthToken(storedToken);
        if (storedUser) {
          setUser(storedUser);
        }
        try {
          const currentUser = await fetchCurrentUser();
          if (!active) {
            return;
          }
          setUser(currentUser);
          try {
            localStorage.setItem(
              USER_KEY,
              JSON.stringify({
                user: currentUser,
              }),
            );
          } catch {
            // ignore localStorage write errors
          }
        } catch {
          if (!active) {
            return;
          }
          clearSession();
        }
      }

      if (active) {
        setLoading(false);
      }
    };

    bootstrap().catch(() => {
      if (active) {
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [clearSession, fetchCurrentUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiClient.post('/auth/login', { email, password });
      const payload = toAuthApiPayload(response.data);
      const nextToken = resolveToken(payload);
      if (!nextToken) {
        throw new Error('Missing token in authentication response');
      }

      setAuthToken(nextToken);
      let nextUser = resolveUser(payload);
      if (!nextUser) {
        nextUser = await fetchCurrentUser();
      }
      persistSession(nextToken, nextUser);
    },
    [fetchCurrentUser, persistSession],
  );

  const register = useCallback(
    async (email: string, password: string, consent: RegisterConsent) => {
      const response = await apiClient.post('/auth/register', {
        email,
        password,
        consent: {
          termsAccepted: consent.terms,
          privacyAccepted: consent.privacy,
        },
      });

      const payload = toAuthApiPayload(response.data);
      const nextToken = resolveToken(payload);
      if (!nextToken) {
        throw new Error('Missing token in authentication response');
      }

      setAuthToken(nextToken);
      let nextUser = resolveUser(payload);
      if (!nextUser) {
        nextUser = await fetchCurrentUser();
      }
      persistSession(nextToken, nextUser);
    },
    [fetchCurrentUser, persistSession],
  );

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      refreshSession,
      logout,
    }),
    [loading, login, logout, refreshSession, token, user, register],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
