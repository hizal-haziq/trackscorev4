import {useCallback} from 'react';
import {getManagerRisk} from '../../services/assessmentRisk';
import {useApi} from '../../hooks/useApi';
import {RequestState} from '../../components/common/RequestState';
import {Fields} from '../../components/common/AssessmentReadout';
import {formatDate} from '../../utils/format';
export function AssessmentRisk({id}: {id: string}) {
  const load = useCallback((signal: AbortSignal) => getManagerRisk(id, signal), [id]);
  const request = useApi(load), risk = request.data;
  return <section aria-label="Assessment risk"><h3>Risk & anomaly information</h3><RequestState {...request} retry={request.refresh} hasData={risk !== null} subject="risk information" />{risk && <>
    <Fields values={[["Risk state", risk.riskLevel.replaceAll('_', ' ')], ["Risk score", risk.riskScore], ["Data confidence", risk.dataConfidence], ["Analysis version", risk.versionNumber], ["Generated", formatDate(risk.generatedAt)]]} />
    {risk.signals.length ? <ul className="ts-events">{risk.signals.map((signal, index) => <li key={index}><strong>{signal.severity}</strong><p className="ts-comment">{signal.message || 'Signal details not recorded'}</p>{signal.explanation && <p className="ts-comment">{signal.explanation}</p>}</li>)}</ul> : <p>No anomaly signals returned.</p>}{risk.benchmarkingNotes.map((note, index) => <p className="ts-comment" key={index}>{note}</p>)}
  </>}</section>;
}
