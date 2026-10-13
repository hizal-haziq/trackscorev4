import React, {useState, useEffect} from 'react';
import {getStoredDrafts, discardDraft, MAX_DRAFTS} from '../../services/assessorDrafts';
import type {AssessorDraft} from '../../types/assessor';

export function AssessorDrafts() {
  const [drafts, setDrafts] = useState<Record<string, AssessorDraft>>({});

  const reloadDrafts = () => {
    setDrafts(getStoredDrafts());
  };

  useEffect(() => {
    reloadDrafts();
  }, []);

  const draftList = Object.values(drafts);

  const handleDiscard = (draftId: string) => {
    discardDraft(draftId);
    reloadDrafts();
  };

  return (
    <div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px'}}>
        <div>
          <h1 style={{fontSize: '22px', fontWeight: 700, margin: '0 0 4px 0', color: '#0F172A'}}>
            Saved Assessment Drafts
          </h1>
          <p style={{margin: 0, fontSize: '13.5px', color: '#64748B'}}>
            In-progress evaluations saved to your browser. You can maintain up to {MAX_DRAFTS} concurrent drafts.
          </p>
        </div>
        <div>
          <a
            href="#/assessment/new"
            className="ts-button ts-button-primary"
            style={{background: '#F58220', borderColor: '#F58220', fontSize: '13px'}}
          >
            + Start New Assessment
          </a>
        </div>
      </div>

      {draftList.length === 0 ? (
        <div style={{textAlign: 'center', padding: '48px 20px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0'}}>
          <div style={{fontSize: '16px', fontWeight: 700, color: '#1E293B', marginBottom: '6px'}}>
            No saved drafts in storage
          </div>
          <p style={{fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: '0 auto 16px auto'}}>
            When you conduct evaluations, changes are automatically saved as local drafts so you never lose work in progress.
          </p>
          <a
            href="#/work"
            className="ts-button ts-button-secondary"
            style={{fontSize: '13px'}}
          >
            Open My Work Queue
          </a>
        </div>
      ) : (
        <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
          {draftList.map(draft => {
            const answeredCount = draft.formState?.answeredCriteria
              ? Object.keys(draft.formState.answeredCriteria).length
              : 0;

            return (
              <div
                key={draft.draftId}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '18px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}
              >
                <div>
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}}>
                    <h3 style={{fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0}}>
                      {draft.companyName || 'Untitled Company'}
                    </h3>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: '#F1F5F9',
                        color: '#475569'
                      }}
                    >
                      {answeredCount} / 33 criteria
                    </span>
                  </div>
                  <div style={{fontSize: '13px', color: '#64748B'}}>
                    Device: <strong>{draft.deviceModel || 'Unspecified'}</strong> · {draft.packageName}
                  </div>
                  <div style={{fontSize: '11.5px', color: '#94A3B8', marginTop: '4px'}}>
                    Last saved: {draft.lastSavedAt ? new Date(draft.lastSavedAt).toLocaleString() : 'Recently'}
                  </div>
                </div>

                <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                  <button
                    type="button"
                    className="ts-button ts-button-secondary"
                    onClick={() => handleDiscard(draft.draftId)}
                    style={{fontSize: '12.5px', color: '#DC2626'}}
                  >
                    Discard
                  </button>
                  <a
                    href={`#/assessment/draft-${draft.draftId}`}
                    className="ts-button ts-button-primary"
                    style={{background: '#F58220', borderColor: '#F58220', fontSize: '12.5px', fontWeight: 700, textDecoration: 'none'}}
                  >
                    Resume Draft →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

