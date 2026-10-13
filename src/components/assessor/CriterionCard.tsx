import React from 'react';
import type {CriterionDefinition} from '../../utils/rubric';
import {computeItemRawPoints} from '../../utils/rubric';

interface CriterionCardProps {
  criterion: CriterionDefinition;
  index: number;
  selectedOption: string;
  comment: string;
  onOptionChange: (criterionId: string, optionLabel: string, rawPoints: number) => void;
  onCommentChange: (criterionId: string, comment: string) => void;
  disabled?: boolean;
}

export function CriterionCard({
  criterion,
  index,
  selectedOption,
  comment,
  onOptionChange,
  onCommentChange,
  disabled = false
}: CriterionCardProps) {
  const isAnswered = Boolean(selectedOption && selectedOption !== '');
  const optIdx = criterion.options.findIndex(o => o.label === selectedOption);
  const currentRaw = optIdx >= 0 ? computeItemRawPoints(criterion, optIdx) : 0;
  const commentLength = comment.length;
  const isCommentNearLimit = commentLength > 1950;

  return (
    <div
      className={`ts-criterion-card ${isAnswered ? 'answered' : ''}`}
      id={`criterion-${criterion.id}`}
      style={{
        border: '1px solid #E2E8F0',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        background: isAnswered ? '#FFFFFF' : '#FAFAFA',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '4px',
              background: criterion.section === 'A' ? '#EFF6FF' : '#F5F3FF',
              color: criterion.section === 'A' ? '#1D4ED8' : '#6D28D9',
              border: `1px solid ${criterion.section === 'A' ? '#BFDBFE' : '#DDD6FE'}`,
              marginRight: '8px'
            }}
          >
            Section {criterion.section} · Item {index + 1}
          </span>
          <h3
            style={{
              display: 'inline',
              fontSize: '15px',
              fontWeight: 600,
              color: '#0F172A',
              margin: 0
            }}
          >
            {criterion.name}
          </h3>
        </div>
        <div>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: '12px',
              background: currentRaw > 0 ? '#ECFDF5' : '#F1F5F9',
              color: currentRaw > 0 ? '#047857' : '#64748B',
              border: `1px solid ${currentRaw > 0 ? '#A7F3D0' : '#CBD5E1'}`
            }}
          >
            Awarded: {currentRaw.toFixed(2)} pts
          </span>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label={`Options for ${criterion.name}`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '8px',
          marginBottom: '12px'
        }}
      >
        {criterion.options.map((opt, optIndex) => {
          const isSelected = selectedOption === opt.label;
          const inputId = `opt-${criterion.id}-${optIndex}`;
          return (
            <label
              key={opt.label}
              htmlFor={inputId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: `1px solid ${isSelected ? '#F58220' : '#E2E8F0'}`,
                background: isSelected ? '#FFF7ED' : '#FFFFFF',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
                fontSize: '13px',
                fontWeight: isSelected ? 600 : 400,
                color: isSelected ? '#C2410C' : '#334155'
              }}
            >
              <input
                type="radio"
                id={inputId}
                name={`criterion-${criterion.id}`}
                value={opt.label}
                checked={isSelected}
                disabled={disabled}
                onChange={() => {
                  const points = computeItemRawPoints(criterion, optIndex);
                  onOptionChange(criterion.id, opt.label, points);
                }}
                style={{accentColor: '#F58220', cursor: disabled ? 'not-allowed' : 'pointer'}}
              />
              <span style={{flex: 1}}>{opt.label}</span>
              <span
                style={{
                  fontSize: '11px',
                  color: opt.points > 0 ? '#059669' : '#94A3B8',
                  fontWeight: 600
                }}
              >
                +{opt.points.toFixed(2)}
              </span>
            </label>
          );
        })}
      </div>

      <div style={{marginTop: '10px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '4px'}}>
          <label
            htmlFor={`comment-${criterion.id}`}
            style={{fontSize: '12px', fontWeight: 600, color: '#475569'}}
          >
            Assessor Remarks & Evidence Notes:
          </label>
          <span
            style={{
              fontSize: '11px',
              color: isCommentNearLimit ? '#DC2626' : '#94A3B8',
              fontWeight: isCommentNearLimit ? 700 : 'normal'
            }}
          >
            {commentLength} / 2000 chars
          </span>
        </div>
        <textarea
          id={`comment-${criterion.id}`}
          rows={2}
          maxLength={2000}
          value={comment}
          disabled={disabled}
          placeholder="Add specific verification evidence, CAN bus log reference, or hardware test notes..."
          onChange={e => onCommentChange(criterion.id, e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: '12.5px',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontFamily: 'inherit',
            resize: 'vertical',
            background: disabled ? '#F1F5F9' : '#FFFFFF'
          }}
        />
      </div>
    </div>
  );
}

