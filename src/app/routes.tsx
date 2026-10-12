import {useEffect, useRef, type ReactNode} from 'react';
import {useAuth} from '../hooks/useAuth';
import {clearSession} from '../services/auth';

function Redirect({to}: {to: string}) {
  const destination = useRef<string | null>(null);
  useEffect(() => {
    if (destination.current === to) return;
    destination.current = to;
    if (to === '/login.html') clearSession();
    window.location.replace(to);
  }, [to]);
  return <main className="ts-access" role="status">Opening your TrackScore account…</main>;
}
export function ManagerRoute({children}: {children: ReactNode}) {
  const {session, logout} = useAuth();
  if (!session) return <Redirect to="/login.html" />;
  if (session.user.mustChangePassword) return <Redirect to="/change-password.html" />;
  if (session.user.role !== 'manager') return <main className="ts-access">
    <img src="/TrackScore_TS_Icon.svg" alt="TrackScore" width="64" />
    <h1>Manager access required</h1><p>This overview is available to Manager accounts.</p>
    <a className="ts-button" href={session.user.role === 'vendor' ? '/vendor-portal.html' : '/index.html'}>Open your portal</a>
    <button className="ts-button ts-button-secondary" onClick={logout}>Sign out</button>
  </main>;
  return children;
}
