// Historical lifecycle values remain readable; new approvals use "approved".
const APPROVED_STAGES = new Set(['approved', 'pre_final_sent', 'payment_confirmed', 'certificate_issued', 'completed']);

export function hasApprovedAssessment(record) {
  return Boolean(record && !record.deletedAt && APPROVED_STAGES.has(record.status) &&
    Number.isInteger(Number(record.approvedVersion)) && Number(record.approvedVersion) > 0);
}

export function requiresCertificateAction(record) {
  return hasApprovedAssessment(record) && record.status !== 'completed' && !record.certificate?.sentToCustomerDate;
}
