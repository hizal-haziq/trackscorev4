// Retired workflow: retained route returns 410 and never reads or mutates storage.
export const handler = async () => ({ statusCode: 410, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: 'This action is no longer available.' }) });
export default { handler };
