import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA,
  ALL_CRITERIA,
  calculateScorePreview,
  RUBRIC_VERSION
} from '../../utils/rubric';
import {CriterionCard} from './CriterionCard';
import {SubmitAssessmentModal} from './SubmitAssessmentModal';
import {saveDraft, discardDraft, MAX_DRAFTS, getStoredDrafts} from '../../services/assessorDrafts';
import {submitAssessment, resubmitAssessment} from '../../services/assessorSubmission';
import type {AssessorDraft, SubmissionPayload} from '../../types/assessor';

interface AssessmentFormProps {
  initialRecord?: any;
  initialDraft?: AssessorDraft | null;
  onSubmitted?: (recordId: string, isResubmission: boolean) => void;
  onCancel?: () => void;
}

export function AssessmentForm({
  initialRecord,
  initialDraft,
  onSubmitted,
  onCancel
}: AssessmentFormProps) {
  // Form Metadata State
  const [companyName, setCompanyName] = useState(() => initialRecord?.companyName || initialDraft?.companyName || '');
  const [deviceModel, setDeviceModel] = useState(() => initialRecord?.deviceModel || initialDraft?.deviceModel || '');
  const [packageName, setPackageName] = useState(() => initialRecord?.packageName || initialDraft?.packageName || 'Package 1: Standard Assessment (RM 4,500)');
  const [assessorName, setAssessorName] = useState(() => initialRecord?.assessorName || initialDraft?.assessorName || '');
  const [assessorId, setAssessorId] = useState(() => initialRecord?.assessorId || initialDraft?.assessorId || '');
  const [assessmentDate, setAssessmentDate] = useState(() => {
    if (initialRecord?.assessmentDate) return initialRecord.assessmentDate.substring(0, 10);
    if (initialDraft?.formState?.metadata?.assessmentDate) return initialDraft.formState.metadata.assessmentDate.substring(0, 10);
    return new Date().toISOString().substring(0, 10);
  });

  // Rejection / Resubmission Context
  const resubmitRecordId = initialRecord?.status === 'rejected' || initialRecord?.status === 'remediation_required' || initialRecord?.status === 'revision_requested'
    ? (initialRecord._id || initialRecord.id)
    : (initialDraft?.formState?.metadata?.resubmitRecordId || null);
  const rejectionReason = initialRecord?.rejectionReason || null;
  const currentVersion = initialRecord?.currentVersion || 1;
  const isResubmission = Boolean(resubmitRecordId);

  // Criteria Selections and Comments: Map<critId, { option: string; points: number; comment: string }>
  const [selections, setSelections] = useState<Record<string, { option: string; points: number; comment: string }>>(() => {
    const initial: Record<string, { option: string; points: number; comment: string }> = {};

    // 1. From initialRecord breakdown if present
    if (Array.isArray(initialRecord?.breakdown)) {
      for (const item of initialRecord.breakdown) {
        if (item && item.id) {
          initial[item.id] = {
            option: item.selectedOption || 'None (0)',
            points: Number(item.points || item.tierPoints || 0),
            comment: typeof item.comment === 'string' ? item.comment : ''
          };
        }
      }
    }
    // 2. From initialDraft if present
    else if (initialDraft?.formState?.selections) {
      for (const [id, sel] of Object.entries(initialDraft.formState.selections)) {
        initial[id] = {
          option: sel.selectedOption || 'None (0)',
          points: Number(sel.points || 0),
          comment: typeof sel.comment === 'string' ? sel.comment : ''
        };
      }
    }
    return initial;
  });

  // Active Draft ID state
  const [activeDraftId, setActiveDraftId] = useState<string | null>(() => initialDraft?.draftId || null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [rubricMismatch, setRubricMismatch] = useState<string | null>(() => {
    if (initialDraft && initialDraft.rubricVersion && initialDraft.rubricVersion !== RUBRIC_VERSION) {
      return initialDraft.rubricVersion;
    }
    return null;
  });

  // Synchronize draft selections when resumed from storage
  useEffect(() => {
    if (initialDraft?.formState?.selections) {
      const initial: Record<string, { option: string; points: number; comment: string }> = {};
      for (const [id, sel] of Object.entries(initialDraft.formState.selections)) {
        initial[id] = {
          option: sel.selectedOption || 'None (0)',
          points: Number(sel.points || 0),
          comment: typeof sel.comment === 'string' ? sel.comment : ''
        };
      }
      setSelections(initial);
      if (initialDraft.companyName) setCompanyName(initialDraft.companyName);
      if (initialDraft.deviceModel) setDeviceModel(initialDraft.deviceModel);
      if (initialDraft.packageName) setPackageName(initialDraft.packageName);
      if (initialDraft.assessorName) setAssessorName(initialDraft.assessorName);
      if (initialDraft.assessorId) setAssessorId(initialDraft.assessorId);
      if (initialDraft.draftId) setActiveDraftId(initialDraft.draftId);
    }
  }, [initialDraft]);

  // Modal & Submission State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Live Score Preview
  const preview = useMemo(() => {
    const breakdownArray = ALL_CRITERIA.map(c => {
      const sel = selections[c.id];
      return {
        id: c.id,
        selectedOption: sel?.option || 'None (0)',
        points: sel?.points || 0,
        comment: sel?.comment || ''
      };
    });
    return calculateScorePreview(breakdownArray);
  }, [selections]);

  // Completion Count
  const completedCount = useMemo(() => {
    return ALL_CRITERIA.filter(c => {
      const sel = selections[c.id];
      return sel && sel.option && sel.option !== '';
    }).length;
  }, [selections]);

  // Option change handler
  const handleOptionChange = useCallback((critId: string, optionLabel: string, rawPoints: number) => {
    setSelections(prev => ({
      ...prev,
      [critId]: {
        option: optionLabel,
        points: rawPoints,
        comment: prev[critId]?.comment || ''
      }
    }));
  }, []);

  // Comment change handler
  const handleCommentChange = useCallback((critId: string, commentText: string) => {
    setSelections(prev => ({
      ...prev,
      [critId]: {
        option: prev[critId]?.option || '',
        points: prev[critId]?.points || 0,
        comment: commentText
      }
    }));
  }, []);

  // Debounced Autosave (800ms)
  useEffect(() => {
    // Only autosave if there is at least some content
    if (!companyName && !deviceModel && completedCount === 0) return;

    const timer = setTimeout(() => {
      try {
        const draft = saveDraft({
          companyName: companyName.trim() || 'Untitled Evaluation',
          deviceModel: deviceModel.trim() || 'Unspecified Device',
          packageName: packageName || 'Standard Assessment',
          assessorName: assessorName || 'Assessor',
          assessorId: assessorId || '',
          formState: {
            metadata: {
              companyName,
              deviceModel,
              packageName,
              assessorName,
              assessorId,
              assessmentDate,
              resubmitRecordId
            },
            selections: Object.entries(selections).reduce((acc, [id, sel]) => {
              const crit = ALL_CRITERIA.find(c => c.id === id);
              acc[id] = {
                section: crit?.section || 'A',
                id,
                name: crit?.name || id,
                selectedOption: sel.option,
                points: sel.points,
                isAnswered: Boolean(sel.option),
                comment: sel.comment
              };
              return acc;
            }, {} as AssessorDraft['formState']['selections']),
            answeredCriteria: Object.entries(selections).reduce((acc, [id, sel]) => {
              if (sel.option) acc[id] = true;
              return acc;
            }, {} as Record<string, boolean>),
            scores: {
              sectionAScore: preview.sectionAScore,
              sectionBScore: preview.sectionBScore,
              totalScore: preview.totalScore,
              starRating: preview.starRating,
              starsCount: preview.starsCount,
              ratingLabel: preview.ratingLabel
            }
          }
        }, activeDraftId);

        setActiveDraftId(draft.draftId);
        const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'});
        const totalDrafts = Object.keys(getStoredDrafts()).length;
        setDraftNotice(`Autosaved at ${timeStr} (${totalDrafts}/${MAX_DRAFTS} drafts stored)`);
      } catch (err: any) {
        // Ignored if max drafts reached
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [companyName, deviceModel, packageName, assessorName, assessorId, assessmentDate, selections, preview, activeDraftId, completedCount, resubmitRecordId]);

  // Manual Draft Save
  const handleSaveDraftManual = () => {
    try {
      const draft = saveDraft({
        companyName: companyName.trim() || 'Untitled Evaluation',
        deviceModel: deviceModel.trim() || 'Unspecified Device',
        packageName: packageName || 'Standard Assessment',
        assessorName: assessorName || 'Assessor',
        assessorId: assessorId || '',
        formState: {
          metadata: {
            companyName,
            deviceModel,
            packageName,
            assessorName,
            assessorId,
            assessmentDate,
            resubmitRecordId
          },
          selections: Object.entries(selections).reduce((acc, [id, sel]) => {
            const crit = ALL_CRITERIA.find(c => c.id === id);
            acc[id] = {
              section: crit?.section || 'A',
              id,
              name: crit?.name || id,
              selectedOption: sel.option,
              points: sel.points,
              isAnswered: Boolean(sel.option),
              comment: sel.comment
            };
            return acc;
          }, {} as AssessorDraft['formState']['selections']),
          answeredCriteria: Object.entries(selections).reduce((acc, [id, sel]) => {
            if (sel.option) acc[id] = true;
            return acc;
          }, {} as Record<string, boolean>),
          scores: {
            sectionAScore: preview.sectionAScore,
            sectionBScore: preview.sectionBScore,
            totalScore: preview.totalScore,
            starRating: preview.starRating,
            starsCount: preview.starsCount,
            ratingLabel: preview.ratingLabel
          }
        }
      }, activeDraftId);

      setActiveDraftId(draft.draftId);
      const totalDrafts = Object.keys(getStoredDrafts()).length;
      setToastMessage(`Draft saved successfully (${totalDrafts}/${MAX_DRAFTS} drafts)`);
      setDraftNotice(`Saved at ${new Date().toLocaleTimeString()} (${totalDrafts}/${MAX_DRAFTS} drafts)`);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to save draft.');
    }
  };

  // Discard draft
  const handleDiscardDraft = () => {
    if (activeDraftId) {
      discardDraft(activeDraftId);
      setActiveDraftId(null);
      setDraftNotice('Draft discarded.');
      setToastMessage('Draft removed from storage.');
    }
  };

  // Submit execution
  const handleExecuteSubmit = async () => {
    if (!companyName.trim() || !deviceModel.trim() || !assessorName.trim()) {
      setSubmitError('Company Name, Device Model, and Assessor Name are mandatory.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const breakdownPayload = ALL_CRITERIA.map(c => {
      const sel = selections[c.id];
      const optLabel = sel?.option || 'None (0)';
      const opt = c.options.find(o => o.label === optLabel) || { points: 0 };
      return {
        section: c.section,
        id: c.id,
        name: c.name,
        selectedOption: optLabel,
        points: opt.points,
        comment: (sel?.comment || '').trim()
      };
    });

    const payload: SubmissionPayload = {
      companyName: companyName.trim(),
      deviceModel: deviceModel.trim(),
      packageName: packageName.trim(),
      assessorName: assessorName.trim(),
      assessorId: assessorId.trim().toUpperCase(),
      assessmentDate,
      rubricVersion: RUBRIC_VERSION,
      sectionAScore: preview.sectionAScore,
      sectionBScore: preview.sectionBScore,
      totalScore: preview.totalScore,
      starRating: preview.starRating,
      starsCount: preview.starsCount,
      ratingLabel: preview.ratingLabel,
      breakdown: breakdownPayload,
      ...(isResubmission ? { resubmitRecordId } : {}),
      ...(initialRecord?.registrationReferenceId || initialRecord?._id ? { registrationId: initialRecord._id || initialRecord.id } : {})
    };

    try {
      const result = isResubmission
        ? await resubmitAssessment(payload)
        : await submitAssessment(payload);

      // Clean up submitted draft
      if (activeDraftId) {
        discardDraft(activeDraftId);
        setActiveDraftId(null);
      }

      setIsModalOpen(false);
      onSubmitted?.(result.id, isResubmission);
    } catch (err: any) {
      setSubmitError(err.message || 'Submission failed. Please check parameters and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ts-assessment-form-container" style={{maxWidth: '1200px', margin: '0 auto'}}>
      {/* Toast Alert */}
      {toastMessage && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#0F172A',
            color: '#FFFFFF',
            padding: '12px 18px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            fontSize: '13px'
          }}
        >
          {toastMessage}
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            style={{background: 'none', border: 'none', color: '#94A3B8', marginLeft: '12px', cursor: 'pointer'}}
          >
            ✕
          </button>
        </div>
      )}

      {/* Changes Requested / Revision Banner */}
      {isResubmission && (
        <div
          role="alert"
          style={{
            background: '#FEF2F2',
            border: '2px solid #EF4444',
            borderRadius: '8px',
            padding: '16px 20px',
            marginBottom: '20px',
            color: '#7F1D1D'
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px'}}>
            <span style={{fontSize: '18px'}}>⚠</span>
            <strong style={{fontSize: '15px'}}>Changes Requested by Manager (Revising Version {currentVersion})</strong>
          </div>
          {rejectionReason ? (
            <div style={{background: '#FFFFFF', border: '1px solid #FCA5A5', padding: '10px 14px', borderRadius: '4px', fontSize: '13px', fontStyle: 'italic', margin: '8px 0'}}>
              &quot;{rejectionReason}&quot;
            </div>
          ) : (
            <p style={{margin: '6px 0', fontSize: '13px'}}>The Manager requested adjustments on this evaluation.</p>
          )}
          <div style={{fontSize: '12.5px', color: '#991B1B', marginTop: '6px'}}>
            Adjust the criteria and evidence remarks below. Submitting will authoritatively record <strong>version {currentVersion + 1}</strong> for Manager review.
          </div>
        </div>
      )}

      {/* Rubric Version Warning */}
      {rubricMismatch && (
        <div
          role="alert"
          style={{
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '16px',
            color: '#92400E',
            fontSize: '13px'
          }}
        >
          <strong>Notice:</strong> This draft was started under rubric v{rubricMismatch} (current rubric is v{RUBRIC_VERSION}). Please verify your selections before submitting.
        </div>
      )}

      {/* Sticky Score & Completion Header Bar */}
      <div
        className="ts-sticky-score-bar"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '12px 20px',
          marginBottom: '20px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap'}}>
          <div>
            <div style={{fontSize: '11px', color: '#64748B', fontWeight: 600}}>CRITERIA PROGRESS</div>
            <div style={{fontSize: '15px', fontWeight: 700, color: completedCount === 33 ? '#059669' : '#F58220'}}>
              {completedCount} / 33 Answered
            </div>
          </div>
          <div style={{height: '32px', width: '1px', background: '#E2E8F0'}} />
          <div>
            <div style={{fontSize: '11px', color: '#64748B', fontWeight: 600}}>Live Score Preview</div>
            <div style={{fontSize: '16px', fontWeight: 700, color: '#0F172A'}}>
              {preview.totalScore.toFixed(2)} <span style={{fontSize: '12px', color: '#64748B'}}>/ 5.00</span>{' '}
              <span style={{color: '#EAB308', fontSize: '14px'}}>
                {'★'.repeat(preview.starsCount)}{'☆'.repeat(5 - preview.starsCount)}
              </span>
            </div>
          </div>
          <div style={{fontSize: '11px', color: '#64748B', maxWidth: '200px', lineHeight: 1.2}}>
            Sec A: {preview.sectionAScore.toFixed(2)} / 3.50 · Sec B: {preview.sectionBScore.toFixed(2)} / 1.50
          </div>
        </div>

        {/* Action Controls */}
        <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
          {draftNotice && (
            <span style={{fontSize: '11.5px', color: '#64748B', marginRight: '4px'}}>
              {draftNotice}
            </span>
          )}
          <button
            type="button"
            className="ts-button ts-button-secondary"
            onClick={handleSaveDraftManual}
            title="Save evaluation to browser storage"
            style={{fontSize: '12.5px', padding: '6px 12px'}}
          >
            Save Draft
          </button>
          {activeDraftId && (
            <button
              type="button"
              className="ts-button ts-button-secondary"
              onClick={handleDiscardDraft}
              title="Discard active draft from storage"
              style={{fontSize: '12.5px', padding: '6px 10px', color: '#DC2626'}}
            >
              Discard Draft
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              className="ts-button ts-button-secondary"
              onClick={onCancel}
              style={{fontSize: '12.5px', padding: '6px 12px'}}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            className="ts-button ts-button-primary"
            onClick={() => setIsModalOpen(true)}
            style={{background: '#F58220', borderColor: '#F58220', fontSize: '13px', fontWeight: 700}}
          >
            {isResubmission ? `Resubmit Revision (v${currentVersion + 1})` : 'Submit Evaluation'}
          </button>
        </div>
      </div>

      {/* Metadata Card */}
      <div
        className="ts-panel"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '24px'
        }}
      >
        <h2 style={{fontSize: '16px', fontWeight: 700, color: '#0F172A', marginTop: 0, marginBottom: '16px'}}>
          Evaluation Assessment Details
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '16px'
          }}
        >
          <div>
            <label htmlFor="form-company" style={{display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475569', marginBottom: '4px'}}>
              Company / Fleet Name: <span style={{color: '#DC2626'}}>*</span>
            </label>
            <input
              id="form-company"
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. Scania Fleet Services Sdn Bhd"
              style={{width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '4px'}}
            />
          </div>

          <div>
            <label htmlFor="form-device" style={{display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475569', marginBottom: '4px'}}>
              Device / Hardware Model: <span style={{color: '#DC2626'}}>*</span>
            </label>
            <input
              id="form-device"
              type="text"
              value={deviceModel}
              onChange={e => setDeviceModel(e.target.value)}
              placeholder="e.g. Telematics Gateway TG-500"
              style={{width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '4px'}}
            />
          </div>

          <div>
            <label htmlFor="form-package" style={{display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475569', marginBottom: '4px'}}>
              Assessment Package:
            </label>
            <select
              id="form-package"
              value={packageName}
              onChange={e => setPackageName(e.target.value)}
              style={{width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '4px'}}
            >
              <option value="Package 1: Standard Assessment (RM 4,500)">Package 1: Standard Assessment (RM 4,500)</option>
              <option value="Package 2: Comprehensive Assessment (RM 6,000)">Package 2: Comprehensive Assessment (RM 6,000)</option>
            </select>
          </div>

          <div>
            <label htmlFor="form-assessor" style={{display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475569', marginBottom: '4px'}}>
              Assessor Name: <span style={{color: '#DC2626'}}>*</span>
            </label>
            <input
              id="form-assessor"
              type="text"
              value={assessorName}
              onChange={e => setAssessorName(e.target.value)}
              placeholder="e.g. Lead Assessor Rizal"
              style={{width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '4px'}}
            />
          </div>

          <div>
            <label htmlFor="form-assessor-id" style={{display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475569', marginBottom: '4px'}}>
              Assessor ID:
            </label>
            <input
              id="form-assessor-id"
              type="text"
              value={assessorId}
              onChange={e => setAssessorId(e.target.value.toUpperCase())}
              placeholder="e.g. MKA 9006"
              style={{width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '4px'}}
            />
          </div>

          <div>
            <label htmlFor="form-date" style={{display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475569', marginBottom: '4px'}}>
              Assessment Date:
            </label>
            <input
              id="form-date"
              type="date"
              value={assessmentDate}
              onChange={e => setAssessmentDate(e.target.value)}
              style={{width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '4px'}}
            />
          </div>
        </div>
      </div>

      {/* Section A: 24 Technical Criteria */}
      <div style={{marginBottom: '32px'}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '2px solid #BFDBFE', paddingBottom: '8px'}}>
          <h2 style={{fontSize: '18px', fontWeight: 700, color: '#1D4ED8', margin: 0}}>
            Section A: Technical Criteria (24 items · Max 3.50 pts)
          </h2>
          <span style={{fontSize: '13px', fontWeight: 600, color: '#1E40AF'}}>
            Scaled: {preview.sectionAScore.toFixed(2)} / 3.50
          </span>
        </div>
        {SECTION_A_CRITERIA.map((crit, idx) => (
          <CriterionCard
            key={crit.id}
            criterion={crit}
            index={idx}
            selectedOption={selections[crit.id]?.option || ''}
            comment={selections[crit.id]?.comment || ''}
            onOptionChange={handleOptionChange}
            onCommentChange={handleCommentChange}
          />
        ))}
      </div>

      {/* Section B: 9 Technical Criteria */}
      <div style={{marginBottom: '32px'}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '2px solid #DDD6FE', paddingBottom: '8px'}}>
          <h2 style={{fontSize: '18px', fontWeight: 700, color: '#6D28D9', margin: 0}}>
            Section B: Advanced Features & Support (9 items · Max 1.50 pts)
          </h2>
          <span style={{fontSize: '13px', fontWeight: 600, color: '#5B21B6'}}>
            Scaled: {preview.sectionBScore.toFixed(2)} / 1.50
          </span>
        </div>
        {SECTION_B_CRITERIA.map((crit, idx) => (
          <CriterionCard
            key={crit.id}
            criterion={crit}
            index={SECTION_A_CRITERIA.length + idx}
            selectedOption={selections[crit.id]?.option || ''}
            comment={selections[crit.id]?.comment || ''}
            onOptionChange={handleOptionChange}
            onCommentChange={handleCommentChange}
          />
        ))}
      </div>

      {/* Bottom Submit Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '40px',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div>
          <span style={{fontSize: '13px', color: '#64748B'}}>Ready to submit:</span>{' '}
          <strong style={{fontSize: '14px', color: completedCount === 33 ? '#059669' : '#D97706'}}>
            {completedCount} / 33 criteria evaluated
          </strong>
        </div>
        <div style={{display: 'flex', gap: '10px'}}>
          <button
            type="button"
            className="ts-button ts-button-secondary"
            onClick={handleSaveDraftManual}
          >
            Save Draft
          </button>
          <button
            type="button"
            className="ts-button ts-button-primary"
            onClick={() => setIsModalOpen(true)}
            style={{background: '#F58220', borderColor: '#F58220', fontWeight: 700}}
          >
            {isResubmission ? `Resubmit Revision (v${currentVersion + 1})` : 'Submit Evaluation'}
          </button>
        </div>
      </div>

      {/* Submit / Resubmit Confirmation Modal */}
      <SubmitAssessmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleExecuteSubmit}
        companyName={companyName}
        deviceModel={deviceModel}
        completedCount={completedCount}
        totalCriteriaCount={ALL_CRITERIA.length}
        isResubmission={isResubmission}
        resubmitVersion={currentVersion + 1}
        isSubmitting={isSubmitting}
        error={submitError}
      />
    </div>
  );
}

