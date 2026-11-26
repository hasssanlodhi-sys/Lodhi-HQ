import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, changePassword, login as loginRequest, logout, me, setUnauthorizedHandler, type CurrentUser } from '../lib/api';

type Status = 'loading' | 'anonymous' | 'ready' | 'setup' | 'error';

interface AuthValue {
  status: Status;
  user: CurrentUser | null;
  message: string;
  login: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  applyUser: (user: CurrentUser) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [message, setMessage] = useState('');

  const applyUser = useCallback((next: CurrentUser) => {
    setUser(next);
    setStatus('ready');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('anonymous');
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await me();
        if (cancelled) return;
        if (data.user) {
          setUser(data.user);
          setStatus('ready');
        } else {
          setUser(null);
          setStatus('anonymous');
        }
      } catch (err) {
        if (cancelled) return;
        const text = err instanceof Error ? err.message : 'Could not reach the API.';
        setMessage(text);
        setStatus(err instanceof ApiError && err.status === 503 ? 'setup' : 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const api = useMemo<AuthValue>(() => {
    return {
      status,
      user,
      message,
      applyUser,
      login: async (email, password) => {
        const data = await loginRequest(email, password);
        applyUser(data.user);
      },
      signOut: async () => {
        try {
          await logout();
        } catch {
          /* The session may already be gone. */
        }
        setUser(null);
        setStatus('anonymous');
        try {
          await me();
        } catch {
          /* The sign-in form will try again. */
        }
      },
      changePassword: async (currentPassword, newPassword) => {
        const data = await changePassword(currentPassword, newPassword);
        applyUser(data.user);
      },
    };
  }, [status, user, message, applyUser]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
