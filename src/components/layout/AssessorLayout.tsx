import type {ReactNode} from 'react';
import {useAuth} from '../../hooks/useAuth';
import {useEffect, useState} from 'react';
import {getStoredDrafts} from '../../services/assessorDrafts';

export function AssessorLayout({children}: {children: ReactNode}) {
  const {session, logout} = useAuth();
  const [hash, setHash] = useState(() => window.location.hash || '#/work');
  const [draftCount, setDraftCount] = useState(() => Object.keys(getStoredDrafts()).length);

  useEffect(() => {
    const onHashChange = () => {
      setHash(window.location.hash || '#/work');
      setDraftCount(Object.keys(getStoredDrafts()).length);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.getElementById('assessor-main')?.focus({preventScroll: true});
  }, [hash]);

  const isWork = hash === '#/work' || hash === '' || hash === '#' || hash.startsWith('#/assessment/');
  const isChangesRequested = hash.startsWith('#/changes-requested');
  const isSubmitted = hash.startsWith('#/submitted');
  const isDrafts = hash.startsWith('#/drafts');
  const isPeerReviews = hash.startsWith('#/peer-reviews');

  return (
    <div className="ts-shell">
      <a
        className="ts-skip"
        href="#assessor-main"
        onClick={e => {
          e.preventDefault();
          document.getElementById('assessor-main')?.focus();
        }}
      >
        Skip to main content
      </a>
      <aside className="ts-sidebar">
        <a href="/landing.html" className="ts-brand">
          <img src="/TrackScore_TS_Icon.svg" alt="" />
          TrackScore
        </a>
        <p className="ts-sidebar-label">ASSESSOR WORKSPACE</p>
        <nav aria-label="Assessor navigation">
          <a href="#/work" aria-current={isWork ? 'page' : undefined}>
            My Work
          </a>
          <a href="#/changes-requested" aria-current={isChangesRequested ? 'page' : undefined}>
            Changes Requested
          </a>
          <a href="#/submitted" aria-current={isSubmitted ? 'page' : undefined}>
            Submitted
          </a>
          <a href="#/drafts" aria-current={isDrafts ? 'page' : undefined}>
            Drafts {draftCount > 0 && <span className="ts-badge-count">{draftCount}/3</span>}
          </a>
          <a href="#/peer-reviews" aria-current={isPeerReviews ? 'page' : undefined}>
            Peer Reviews
          </a>
          <a href="/index.html" title="Open legacy evaluation form">
            Open legacy form ↗
          </a>
        </nav>
        <p className="ts-sidebar-note">
          Digital Assessor Evaluation System for commercial vehicle telematics compliance.
        </p>
      </aside>
      <div className="ts-content">
        <header className="ts-topbar">
          <span>Assessor Workspace</span>
          <div className="ts-account">
            <span>
              {session?.user.name}
              <small>{session?.user.assessorId ? `Assessor (${session.user.assessorId})` : 'Assessor'}</small>
            </span>
            <button className="ts-button ts-button-secondary" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>
        <main id="assessor-main" className="ts-main" tabIndex={-1}>
          {children}
        </main>
        <footer className="ts-footer">TrackScore · Verify. Score. Trust.</footer>
      </div>
    </div>
  );
}

