declare module '*certificate-eligibility.js' {
  interface EligibilityRecord {status: string; approvedVersion: number | null; deletedAt: string | null; certificate: {sentToCustomerDate: string | null}}
  export function hasApprovedAssessment(record: EligibilityRecord): boolean;
  export function requiresCertificateAction(record: EligibilityRecord): boolean;
}
