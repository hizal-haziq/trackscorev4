import type {ReactNode} from 'react';
import type {Criterion, Scores} from '../../types/managerAssessment';
export function Fields({values}: {values: [string, ReactNode][]}) {return <dl className="ts-fields">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null || value === undefined || value === '' ? 'Not recorded' : value}</dd></div>)}</dl>;}
export function TechnicalAssessment({scores, breakdown, review}: {scores: Scores; breakdown: Criterion[]; review?: string | null}) {
  return <div className="ts-technical"><p>Read-only technical results. Values are returned by the assessment service.</p><Fields values={[["Section A score", scores.sectionAScore], ["Section B score", scores.sectionBScore], ["Total score", scores.totalScore], ["Rating", scores.ratingLabel], ["Stars", scores.starsCount]]} />
    {breakdown.length ? <div className="ts-table-scroll" tabIndex={0} aria-label="Technical criteria, scroll for more columns"><table><caption>Technical assessment · {breakdown.length} recorded criteria</caption><thead><tr><th scope="col">Criterion</th><th scope="col">Section</th><th scope="col">Selected option</th><th scope="col">Points</th><th scope="col">Assessor comment</th></tr></thead><tbody>{breakdown.map((row, index) => <tr key={`${row.id}-${index}`}><td>{row.name || row.id || 'Criterion not recorded'}</td><td>{row.section || 'Not recorded'}</td><td>{row.selectedOption || 'Not recorded'}</td><td>{row.points ?? 'Not recorded'}</td><td className="ts-comment">{row.comment || 'No comment recorded'}</td></tr>)}</tbody></table></div> : <p className="ts-empty">No technical criteria recorded.</p>}
    {review && <div className="ts-review-readout"><h3>Manager review remarks</h3><p className="ts-comment">{review}</p></div>}
  </div>;
}
