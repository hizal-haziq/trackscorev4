import {requiresCertificateAction} from '../../netlify/functions/certificate-eligibility.js';
import type {ManagerAssessment} from '../types/managerAssessment';
export function certificateState(record: ManagerAssessment): string {
  if (record.status === 'completed') return 'Completed';
  if (record.certificate.sentToCustomerDate) return 'Delivered';
  if (record.certificate.signedDate) return 'Signed';
  if (record.certificate.printedDate) return 'Printed';
  if (record.certificate.preparedDate) return 'Prepared';
  return requiresCertificateAction(record) ? 'Ready for Certificate' : 'Not Eligible';
}
