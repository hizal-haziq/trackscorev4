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
  const {session, logout, checking} = useAuth();
  if (checking) return <main className="ts-access" role="status">Verifying your session…</main>;
  if (!session) return <Redirect to="/login.html" />;
  if (session.user.mustChangePassword) return <Redirect to="/change-password.html" />;
  if (session.user.role !== 'manager') return <main className="ts-access">
    <img src="/TrackScore_TS_Icon.svg" alt="TrackScore" width="64" />
    <h1>Manager access required</h1><p>This overview is available to Manager accounts.</p>
    <a className="ts-button" href={session.user.role === 'vendor' ? '/react/vendor.html' : '/react/assessor.html'}>Open your portal</a>
    <button className="ts-button ts-button-secondary" onClick={logout}>Sign out</button>
  </main>;
  return children;
}

export function AssessorRoute({children}: {children: ReactNode}) {
  const {session, logout, checking} = useAuth();
  if (checking) return <main className="ts-access" role="status">Verifying your session…</main>;
  if (!session) return <Redirect to="/login.html" />;
  if (session.user.mustChangePassword) return <Redirect to="/change-password.html" />;
  if (session.user.role !== 'assessor') {
    if (session.user.role === 'manager') return <Redirect to="/react/manager.html" />;
    if (session.user.role === 'vendor') return <Redirect to="/react/vendor.html" />;
    return <main className="ts-access">
      <img src="/TrackScore_TS_Icon.svg" alt="TrackScore" width="64" />
      <h1>Assessor access required</h1><p>This workspace is available to Assessor accounts.</p>
      <button className="ts-button ts-button-secondary" onClick={logout}>Sign out</button>
    </main>;
  }
  return children;
}

export function VendorRoute({children}: {children: ReactNode}) {
  const {session, logout, checking} = useAuth();
  if (checking) return <main className="ts-access" role="status">Verifying your session…</main>;
  if (!session) return <Redirect to="/login.html" />;
  if (session.user.mustChangePassword) return <Redirect to="/change-password.html" />;
  if (session.user.role !== 'vendor') {
    if (session.user.role === 'manager') return <Redirect to="/react/manager.html" />;
    if (session.user.role === 'assessor') return <Redirect to="/react/assessor.html" />;
    return <main className="ts-access">
      <img src="/TrackScore_TS_Icon.svg" alt="TrackScore" width="64" />
      <h1>Vendor access required</h1><p>This portal is available to Vendor accounts.</p>
      <button className="ts-button ts-button-secondary" onClick={logout}>Sign out</button>
    </main>;
  }
  return children;
}
