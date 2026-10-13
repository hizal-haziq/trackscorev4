export type ManagerLocation = {page: 'dashboard'} | {page: 'assessments'} | {page: 'workspace'; id: string} | {page: 'missing'};
export function managerLocation(hash: string): ManagerLocation {
  if (!hash || hash === '#' || hash === '#/' || hash === '#overview') return {page: 'dashboard'};
  if (hash === '#/assessments') return {page: 'assessments'};
  const match = /^#\/assessments\/([^/]+)$/.exec(hash);
  if (match?.[1]) {try {const id = decodeURIComponent(match[1]);if (id && !/[\r\n]/.test(id)) return {page: 'workspace', id};} catch { /* invalid URI shows a recoverable route */ }}
  return {page: 'missing'};
}
export function assessmentHref(id: string) {return `#/assessments/${encodeURIComponent(id)}`;}
