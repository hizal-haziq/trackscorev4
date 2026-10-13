import React, {useState, useEffect} from 'react';
import {AssessorLayout} from '../../components/layout/AssessorLayout';
import {AssessorWork} from './AssessorWork';
import {AssessorChangesRequested} from './AssessorChangesRequested';
import {AssessorSubmitted} from './AssessorSubmitted';
import {AssessorDrafts} from './AssessorDrafts';
import {AssessorPeerReviews} from './AssessorPeerReviews';
import {AssessorAssessment} from './AssessorAssessment';
import {ErrorPage} from '../../components/common/ErrorPage';

export function AssessorPages() {
  const [hash, setHash] = useState(() => window.location.hash || '#/work');

  useEffect(() => {
    const handleHash = () => {
      setHash(window.location.hash || '#/work');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const renderContent = () => {
    const clean = (hash || '').replace(/^#\/?/, '').trim();
    if (!clean || clean === 'work') {
      return <AssessorWork />;
    }
    if (clean.startsWith('assessment/')) {
      const id = clean.replace('assessment/', '').trim();
      return <AssessorAssessment id={id || 'new'} />;
    }
    if (clean === 'changes-requested') {
      return <AssessorChangesRequested />;
    }
    if (clean === 'submitted') {
      return <AssessorSubmitted />;
    }
    if (clean === 'drafts') {
      return <AssessorDrafts />;
    }
    if (clean === 'peer-reviews') {
      return <AssessorPeerReviews />;
    }
    return (
      <ErrorPage
        status={404}
        title="Page Not Found"
        message="The requested assessor page could not be found."
        action="dashboard"
        onHome={() => {
          window.location.hash = '#/work';
        }}
      />
    );
  };

  return <AssessorLayout>{renderContent()}</AssessorLayout>;
}


