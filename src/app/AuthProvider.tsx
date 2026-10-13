import {createContext, useEffect, useState, type ReactNode} from 'react';
import {AUTH_CHANGED, clearSession, readSession} from '../services/auth';
import type {AuthSession} from '../types/auth';
import {apiRequest} from '../services/api';
import {isRecord} from '../types/api';

export const AuthContext = createContext<{session: AuthSession | null; logout: () => void; checking?: boolean} | undefined>(undefined);
export function AuthProvider({children}: {children: ReactNode}) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let generation = 0;
    let controller: AbortController | undefined;
    const sync = () => {
      controller?.abort();
      const current = ++generation, candidate = readSession();
      if (!candidate) {setSession(null);setChecking(false);return;}
      controller = new AbortController();
      const signal = controller.signal;
      setSession(null);setChecking(true);
      Promise.resolve().then(() => {signal.throwIfAborted();return apiRequest('verify-session', {signal});}).then(result => {
        if (signal.aborted || current !== generation) return;
        if (!isRecord(result) || result.success !== true || result.role !== candidate.user.role) throw new Error('Session verification failed.');
        setSession(candidate);setChecking(false);
      }).catch(() => {
        if (signal.aborted || current !== generation) return;
        clearSession();setSession(null);setChecking(false);
      });
    };
    const hide=()=>{const root=document.getElementById('root');if(root)root.style.visibility='hidden';};
    const restore=(event:PageTransitionEvent)=>{if(event.persisted)sync();};
    window.addEventListener('pagehide',hide);window.addEventListener('pageshow',restore);
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(AUTH_CHANGED, sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',restore);
      ++generation;controller?.abort();
      window.removeEventListener('storage', sync);
      window.removeEventListener(AUTH_CHANGED, sync);
      window.removeEventListener('focus', sync);
    };
  }, []);
  useEffect(() => {
    if (!session || session.expiresAt === null) return;
    const timer = window.setTimeout(() => {
      if (session.expiresAt! <= Date.now()) clearSession();
      else window.dispatchEvent(new Event(AUTH_CHANGED));
    }, Math.min(2_147_483_647, Math.max(0, session.expiresAt - Date.now())));
    return () => window.clearTimeout(timer);
  }, [session]);
  useEffect(()=>{if(!checking)document.getElementById('root')?.style.removeProperty('visibility');},[checking]);
  return <AuthContext.Provider value={{session, logout: clearSession, checking}}>{children}</AuthContext.Provider>;
}
