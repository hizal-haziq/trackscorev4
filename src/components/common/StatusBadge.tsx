import {statusLabel, statusTone} from '../../utils/status';
export function StatusBadge({status}: {status?: string | null}) {return <span className={`ts-badge ts-badge-${statusTone(status)}`}>{statusLabel(status)}</span>;}
