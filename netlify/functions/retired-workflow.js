// Keep historical fields in storage while omitting retired workflow data from responses.
export function omitRetiredWorkflow(record) {
  const { payment, paymentVerified, paymentOverride, preFinalResult, preFinalSkipped, ...active } = record;
  if (active.invoice) {
    const { paymentStatus, verifiedAt, ...invoice } = active.invoice;
    active.invoice = invoice;
  }
  for (const field of ['statusHistory', 'evaluationHistory']) {
    if (Array.isArray(active[field])) active[field] = active[field].filter(entry =>
      !/payment|pending_verification|pre.?final/i.test(String(entry.status || entry.action || '') + ' ' + String(entry.note || '')));
  }
  if (Array.isArray(active.documents)) active.documents = active.documents.filter(d => d.category !== 'payment_proof');
  return active;
}
