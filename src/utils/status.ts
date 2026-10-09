const labels: Record<string, string> = {
  registered: 'Registered', scheduled: 'Scheduled', assigned: 'Assigned', in_progress: 'In Progress',
  submitted: 'Waiting Review', pending_review: 'Waiting Review', rejected: 'Changes Requested', remediation_required: 'Changes Requested',
  approved: 'Approved', pre_final_sent: 'Approved', payment_confirmed: 'Approved', certificate_issued: 'Certificate Issued',
  completed: 'Completed', cancelled: 'Cancelled',
  ON_TRACK: 'On Track', DUE_SOON: 'Due Soon', OVERDUE: 'Overdue', COMPLETED_ON_TIME: 'Completed On Time', COMPLETED_LATE: 'Completed Late',
};
export function statusLabel(status: string | null | undefined): string {return status ? labels[status] || status.replaceAll('_', ' ') : 'Not recorded';}
export function statusTone(status: string | null | undefined): 'neutral' | 'warning' | 'danger' | 'success' {
  if (['rejected','remediation_required','OVERDUE'].includes(status || '')) return 'danger';
  if (['submitted','pending_review','DUE_SOON'].includes(status || '')) return 'warning';
  if (['approved','pre_final_sent','payment_confirmed','certificate_issued','completed','COMPLETED_ON_TIME','ON_TRACK'].includes(status || '')) return 'success';
  return 'neutral';
}
