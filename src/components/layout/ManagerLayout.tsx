import type {ReactNode} from 'react';
import {useAuth} from '../../hooks/useAuth';
import {useEffect} from 'react';

export function ManagerLayout({children}: {children: ReactNode}) {
  const {session, logout} = useAuth();
  const assessments = window.location.hash.startsWith('#/assessments');
  useEffect(() => {document.getElementById('overview')?.focus({preventScroll: true});}, []);
  return <div className="ts-shell">
    <a className="ts-skip" href="#overview" onClick={event => {event.preventDefault();document.getElementById('overview')?.focus();}}>Skip to overview</a>
    <aside className="ts-sidebar">
      <a href="/landing.html" className="ts-brand"><img src="/TrackScore_TS_Icon.svg" alt="" />TrackScore</a>
      <p className="ts-sidebar-label">MANAGER PORTAL</p>
      <nav aria-label="Manager navigation"><a href="#/" aria-current={!assessments ? 'page' : undefined}>Dashboard</a><a href="#/assessments" aria-current={assessments ? 'page' : undefined}>Assessments</a><a href="/dashboard.html">Open Manager portal ↗</a></nav>
      <p className="ts-sidebar-note">Assessment management, reviews and certificates are available in your Manager portal.</p>
    </aside>
    <div className="ts-content">
      <header className="ts-topbar"><span>Manager Overview</span><div className="ts-account"><span>{session?.user.name}<small>Manager</small></span><button className="ts-button ts-button-secondary" onClick={logout}>Sign out</button></div></header>
      <main id="overview" className="ts-main" tabIndex={-1}>{children}</main><footer className="ts-footer">TrackScore · Verify. Score. Trust.</footer>
    </div>
  </div>;
}
