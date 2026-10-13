import React, {useState, useEffect} from 'react';
import {AssessmentForm} from '../../components/assessor/AssessmentForm';
import {fetchAssessmentDetail} from '../../services/assessorAssessments';
import {getStoredDrafts} from '../../services/assessorDrafts';
import {normalizeError} from '../../utils/errors';
import type {AssessorDraft} from '../../types/assessor';


interface AssessorAssessmentProps {
  id: string;
}

export function AssessorAssessment({id}: AssessorAssessmentProps) {
  const [draft, setDraft] = useState<AssessorDraft | null>(() => {
    if (id.startsWith('draft-')) {
      const realDraftId = id.replace('draft-', '');
      const drafts = getStoredDrafts();
      return drafts[realDraftId] || drafts[id] || null;
    }
    return null;
  });
  const [loading, setLoading] = useState(() => id !== 'new' && !id.startsWith('draft-'));
  const [error, setError] = useState<string | null>(() => {
    if (id.startsWith('draft-')) {
      const realDraftId = id.replace('draft-', '');
      const drafts = getStoredDrafts();
      if (!drafts[realDraftId] && !drafts[id]) {
        return `Draft "${id}" could not be found in local browser storage.`;
      }
    }
    return null;
  });
  const [record, setRecord] = useState<any | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [submittedIsRevision, setSubmittedIsRevision] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (id === 'new') {
      setRecord(null);
      setDraft(null);
      setLoading(false);
      return;
    }

    if (id.startsWith('draft-')) {
      const realDraftId = id.replace('draft-', '');
      const drafts = getStoredDrafts();
      const targetDraft = drafts[realDraftId] || drafts[id] || null;
      if (isMounted) {
        if (targetDraft) {
          setDraft(targetDraft);
          setRecord(null);
        } else {
          setError(`Draft "${id}" could not be found in local browser storage.`);
        }
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);

    fetchAssessmentDetail(id)
      .then(data => {
        if (isMounted) {
          setRecord(data);
          setDraft(null);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message || 'Failed to load assessment. You may not be authorized to view this record.');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div role="status" style={{textAlign: 'center', padding: '60px 20px', color: '#64748B'}}>
        <div style={{fontSize: '16px', fontWeight: 600, marginBottom: '8px'}}>Loading evaluation...</div>
        <div style={{fontSize: '13px'}}>Retrieving criteria breakdown and evidence records</div>
      </div>
    );
  }

  if (error) {
    const normalized = normalizeError(error);
    return (
      <div style={{maxWidth: '800px', margin: '40px auto'}}>
        <div role="alert" style={{background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '20px', borderRadius: '8px', color: '#991B1B'}}>
          <h2 style={{fontSize: '16px', fontWeight: 700, margin: '0 0 8px 0'}}>{normalized.title}</h2>
          <p style={{margin: '0 0 16px 0', fontSize: '13.5px'}}>{normalized.message}</p>
          <a href="#/work" className="ts-button ts-button-secondary" style={{textDecoration: 'none'}}>
            ← Return to My Work Queue
          </a>
        </div>
      </div>
    );
  }


  if (submittedId) {
    return (
      <div style={{maxWidth: '700px', margin: '40px auto', textAlign: 'center'}}>
        <div style={{background: '#FFFFFF', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '36px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)'}}>
          <div style={{fontSize: '36px', marginBottom: '12px'}}>✓</div>
          <h2 style={{fontSize: '20px', fontWeight: 700, color: '#065F46', margin: '0 0 8px 0'}}>
            {submittedIsRevision ? 'Revision Resubmitted Successfully!' : 'Evaluation Submitted Successfully!'}
          </h2>
          <p style={{fontSize: '13.5px', color: '#475569', margin: '0 0 24px 0', lineHeight: 1.5}}>
            Your technical evaluation has been securely saved to the database. An immutable version snapshot has been recorded, and the assessment is now awaiting Manager review.
          </p>
          <div style={{display: 'flex', justifyContent: 'center', gap: '12px'}}>
            <a href="#/submitted" className="ts-button ts-button-primary" style={{background: '#F58220', borderColor: '#F58220', textDecoration: 'none'}}>
              View Submitted Assessments
            </a>
            <a href="#/work" className="ts-button ts-button-secondary" style={{textDecoration: 'none'}}>
              Return to My Work
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AssessmentForm
      key={`${id}-${draft?.draftId || record?._id || 'init'}`}
      initialRecord={record}
      initialDraft={draft}
      onSubmitted={(newId, isRev) => {
        setSubmittedId(newId);
        setSubmittedIsRevision(isRev);
      }}
      onCancel={() => {
        window.location.hash = '#/work';
      }}
    />
  );
}

