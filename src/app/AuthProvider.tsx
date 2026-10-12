import {createContext, useEffect, useState, type ReactNode} from 'react';
import {AUTH_CHANGED, clearSession, readSession} from '../services/auth';
import type {AuthSession} from '../types/auth';

export const AuthContext = createContext<{session: AuthSession | null; logout: () => void} | undefined>(undefined);
export function AuthProvider({children}: {children: ReactNode}) {
  const [session, setSession] = useState(readSession);
  useEffect(() => {
    const sync = () => setSession(readSession());
    window.addEventListener('storage', sync);
    window.addEventListener(AUTH_CHANGED, sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(AUTH_CHANGED, sync);
      window.removeEventListener('focus', sync);
    };
  }, []);
  useEffect(() => {
    if (!session || session.expiresAt === null) return;
    const timer = window.setTimeout(() => {
      if (session.expiresAt! <= Date.now()) clearSession();
      else setSession(readSession());
    }, Math.min(2_147_483_647, Math.max(0, session.expiresAt - Date.now())));
    return () => window.clearTimeout(timer);
  }, [session]);
  return <AuthContext.Provider value={{session, logout: clearSession}}>{children}</AuthContext.Provider>;
}
